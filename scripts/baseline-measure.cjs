#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

const { renderVideo, getFfmpegPath } = require('../app/core/ffmpeg-renderer.js');
const { resolveOutputConfig } = require('../app/core/output-formats.js');

const IMAGES_DIR = 'C:\\Users\\zyrothx\\Documents\\imagenes prueba';

function getInputImages(count) {
  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort();
  if (files.length < 1) {
    throw new Error(`Need at least 1 image, found ${files.length}`);
  }
  const baseFiles = files.slice(0, 2);
  const result = [];
  for (let i = 0; i < count; i++) {
    const f = baseFiles[i % baseFiles.length];
    result.push({ name: `${path.basename(f, path.extname(f))}_${i+1}${path.extname(f)}`, path: path.join(IMAGES_DIR, f) });
  }
  return result;
}

function createTestAudio(duration, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic, [
      '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
      '-c:a', 'aac', '-b:a', '192k', outputPath
    ], { windowsHide: true });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error('Audio gen failed')));
    proc.on('error', reject);
  });
}

async function measureRender(sceneCount, transitionType, outputPath) {
  const images = getInputImages(sceneCount);
  const sceneDuration = 6.0;
  const totalDuration = sceneDuration * sceneCount;
  
  const audioPath = path.join(os.tmpdir(), `test_audio_${sceneCount}s.aac`);
  await createTestAudio(totalDuration, audioPath);
  
  const scenes = Array.from({ length: sceneCount }, (_, i) => ({
    number: i + 1,
    duration: sceneDuration,
    text: `Scene ${i + 1}`,
    transition: i > 0 ? { type: transitionType } : undefined
  }));
  
  const payload = {
    scenes,
    images: images.map((img, i) => ({
      name: img.name,
      path: img.path,
      focus169: { x: 0.5, y: 0.5, scale: 1 },
      focus916: { x: 0.5, y: 0.5, scale: 1 },
      focus11: { x: 0.5, y: 0.5, scale: 1 },
      focus45: { x: 0.5, y: 0.5, scale: 1 }
    })),
    narration: { name: 'test', path: audioPath },
    music: null,
    outputPath,
    audioDuration: totalDuration,
    config: {
      outputs: ['16:9'],
      fitMode: 'cover',
      frameColor: '#000000',
      backgroundMode: 'color',
      backgroundColor: '#000000',
      musicVolume: 0.3,
      voice: { language: 'es', engine: 'kokoro', voiceId: '', speed: 1, rate: '+6%', pitch: '+0Hz', pause: 0.3 },
      extras: { badge: { enabled: false }, lowerThird: { enabled: false }, progressBar: { enabled: false } },
      subtitles: { enabled: false }
    },
    renderOptions: {
      zoomEnabled: false,
      zoomType: 'kenburns',
      zoomMode: 'fixed',
      zoomCheckedEffects: [],
      zoomSeed: 12345,
      zoomStartScale: 1.0,
      zoomIntensity: 0.15,
      transitionType,
      transitionMode: 'fixed',
      transitionSeed: 4242,
      transitionDuration: 1.0
    }
  };
  
  const startTime = Date.now();
  let peakMemory = 0;
  const memInterval = setInterval(() => {
    const mem = process.memoryUsage().heapUsed / 1024 / 1024;
    if (mem > peakMemory) peakMemory = mem;
  }, 100);
  
  try {
    const result = await renderVideo({
      ...payload,
      useHardwareAcceleration: false
    });
    
    clearInterval(memInterval);
    const renderTime = (Date.now() - startTime) / 1000;
    
    const probe = await probeVideo(outputPath);
    
    return {
      sceneCount,
      transitionType,
      renderTime: Number(renderTime.toFixed(2)),
      peakMemoryMB: Number(peakMemory.toFixed(1)),
      encoder: result.videoEncoder,
      expectedDuration: totalDuration,
      actualDuration: result.duration,
      repeatedFrames: probe.repeatedFrames,
      maxDeviation: probe.maxDeviation,
      bitrate: probe.bitrate
    };
  } catch (err) {
    clearInterval(memInterval);
    throw err;
  }
}

async function probeVideo(videoPath) {
  const ffprobeStatic = require('ffprobe-static');
  const { spawn } = require('child_process');
  
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobeStatic.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'frame=pkt_pts_time,pkt_duration_time,width,height',
      '-of', 'csv=p=0',
      videoPath
    ], { windowsHide: true });
    
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code !== 0) {
        resolve({ repeatedFrames: -1, maxDeviation: -1, bitrate: -1 });
        return;
      }
      const lines = stdout.trim().split('\n').filter(l => l);
      const frames = lines.map(l => {
        const [pts, dur, w, h] = l.split(',').map(Number);
        return { pts, dur, w, h };
      });
      
      let repeatedFrames = 0;
      let maxDeviation = 0;
      const expectedFrameTime = 1 / 30;
      
      for (let i = 1; i < frames.length; i++) {
        const diff = frames[i].pts - frames[i-1].pts;
        if (Math.abs(diff) < 0.001) repeatedFrames++;
        const deviation = Math.abs(diff - expectedFrameTime);
        if (deviation > maxDeviation) maxDeviation = deviation;
      }
      
      // Get bitrate
      const bitrateProc = spawn(ffprobeStatic.path, [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=bit_rate',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath
      ], { windowsHide: true });
      let bitrateOut = '';
      bitrateProc.stdout.on('data', d => bitrateOut += d.toString());
      bitrateProc.on('close', () => {
        const bitrate = parseInt(bitrateOut.trim()) || -1;
        resolve({ repeatedFrames, maxDeviation, bitrate });
      });
    });
    proc.on('error', err => resolve({ repeatedFrames: -1, maxDeviation: -1, bitrate: -1 }));
  });
}

async function main() {
  const outputDir = path.join(os.tmpdir(), 'baseline-output');
  fs.mkdirSync(outputDir, { recursive: true });
  
  const tests = [
    { scenes: 3, transition: 'fade', name: '3-scene-fade' },
    { scenes: 3, transition: 'slideLeft', name: '3-scene-slideLeft' },
    { scenes: 12, transition: 'fade', name: '12-scene-fade' },
    { scenes: 12, transition: 'slideLeft', name: '12-scene-slideLeft' }
  ];
  
  console.log('══════════════════════════════════════════════════════════════');
  console.log('BASELINE MEASUREMENTS - Current Export Path');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('Format: 16:9 (1920x1080) @ 30fps CFR, H.264 yuv420p, libx264 CRF 23');
  console.log('Scene duration: 6s, Transition: 1s (except cut)');
  console.log('Audio: AAC 192kbps, faststart');
  console.log('══════════════════════════════════════════════════════════════\n');
  
  const results = [];
  
  for (const test of tests) {
    const outputPath = path.join(outputDir, `${test.name}.mp4`);
    console.log(`[${test.name}] Rendering ${test.scenes} scenes with ${test.transition}...`);
    
    try {
      const result = await measureRender(test.scenes, test.transition, outputPath);
      results.push(result);
      
      console.log(`  ✓ Render time: ${result.renderTime}s (${(result.expectedDuration / result.renderTime).toFixed(2)}x realtime)`);
      console.log(`  ✓ Peak RAM: ${result.peakMemoryMB} MB`);
      console.log(`  ✓ Encoder: ${result.encoder}`);
      console.log(`  ✓ Duration: expected ${result.expectedDuration}s, actual ${result.actualDuration.toFixed(3)}s`);
      console.log(`  ✓ Repeated frames: ${result.repeatedFrames}`);
      console.log(`  ✓ Max frame time deviation: ${result.maxDeviation.toFixed(6)}s`);
      console.log(`  ✓ Bitrate: ${(result.bitrate / 1000000).toFixed(2)} Mbps`);
      console.log('');
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
    }
  }
  
  // Print summary table
  console.log('══════════════════════════════════════════════════════════════');
  console.log('SUMMARY TABLE');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('┌─────────────────┬──────────┬───────────┬─────────┬──────────┬────────────┬─────────────┬───────────┐');
  console.log('│ Test            │ Render s │ Peak RAM  │ Encoder │ Duration │ Rep Frames │ Max Dev (s) │ Bitrate   │');
  console.log('├─────────────────┼──────────┼───────────┼─────────┼──────────┼────────────┼─────────────┼───────────┤');
  results.forEach(r => {
    const realtime = (r.expectedDuration / r.renderTime).toFixed(2);
    const name = (r.name || '').padEnd(15);
    const renderTime = String(r.renderTime || 0).padStart(6);
    const peakRam = String(r.peakMemoryMB || 0).padStart(7);
    const encoder = (r.encoder || '').padEnd(7);
    const duration = String(r.actualDuration?.toFixed(1) || '0').padStart(6);
    const repFrames = String(r.repeatedFrames || 0).padStart(10);
    const maxDev = String(r.maxDeviation?.toFixed(6) || '0').padStart(11);
    const bitrate = String((r.bitrate/1e6).toFixed(2) || '0').padStart(7);
    console.log(`│ ${name} │ ${renderTime} │ ${peakRam} │ ${encoder} │ ${duration} │ ${repFrames} │ ${maxDev} │ ${bitrate}M │`);
  });
  console.log('└─────────────────┴──────────┴───────────┴─────────┴──────────┴────────────┴─────────────┴───────────┘');
  
  // Save results
  const resultsFile = path.join(outputDir, 'baseline-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to ${resultsFile}`);
  
  // Analysis
  console.log('\n📋 ANALYSIS:');
  const avg3 = results.filter(r => r.sceneCount === 3).reduce((a, b) => a + b.renderTime, 0) / 2;
  const avg12 = results.filter(r => r.sceneCount === 12).reduce((a, b) => a + b.renderTime, 0) / 2;
  console.log(`  • 3-scene avg render: ${avg3.toFixed(2)}s (${(18/avg3).toFixed(2)}x realtime)`);
  console.log(`  • 12-scene avg render: ${avg12.toFixed(2)}s (${(72/avg12).toFixed(2)}x realtime)`);
  console.log(`  • Scaling factor: ${(avg12/avg3).toFixed(2)}x for 4x scenes`);
  const maxRep = Math.max(...results.map(r => r.repeatedFrames));
  const maxDev = Math.max(...results.map(r => r.maxDeviation));
  console.log(`  • Max repeated frames: ${maxRep}`);
  console.log(`  • Max frame deviation: ${maxDev.toFixed(6)}s`);
  console.log(`  • Avg bitrate: ${(results.reduce((a,b)=>a+b.bitrate,0)/results.length/1e6).toFixed(2)} Mbps`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});