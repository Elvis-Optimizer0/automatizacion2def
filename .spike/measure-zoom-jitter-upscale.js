'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const ROOT = path.join(__dirname, '..');
const FPS = 30;
const DURATION = 6;
const TOTAL_FRAMES = FPS * DURATION;
const WIDTH = 1920;
const HEIGHT = 1080;
const UPSCALE_FACTOR = 4; // 4x upscale before zoompan

function runFfmpeg(args) {
  const result = spawnSync(ffmpegStatic, args, { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr}`);
  }
  return result;
}

function probeDuration(filePath) {
  const result = spawnSync(ffprobeStatic.path, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath
  ], { windowsHide: true, encoding: 'utf8' });
  return parseFloat(result.stdout.toString().trim());
}

function extractFrames(videoPath, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  runFfmpeg([
    '-y', '-i', videoPath,
    '-vf', 'fps=30',
    path.join(outputDir, 'frame_%04d.png')
  ]);
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.png')).sort();
  return files.map(f => path.join(outputDir, f));
}

function createTestImage(outputPath) {
  const srcW = 3840;
  const srcH = 2160;
  
  const filter = `
    color=c=black:s=${srcW}x${srcH}:d=1,
    drawgrid=width=240:height=135:color=white@0.3:thickness=1,
    drawtext=fontsize=60:fontcolor=white:text='TL':x=50:y=50,
    drawtext=fontsize=60:fontcolor=white:text='TR':x=${srcW-150}:y=50,
    drawtext=fontsize=60:fontcolor=white:text='BL':x=50:y=${srcH-100},
    drawtext=fontsize=60:fontcolor=white:text='BR':x=${srcW-150}:y=${srcH-100},
    drawtext=fontsize=60:fontcolor=white:text='CENTER':x=${srcW/2-120}:y=${srcH/2-30},
    drawtext=fontsize=40:fontcolor=yellow:text='M1':x=480:y=270,
    drawtext=fontsize=40:fontcolor=yellow:text='M2':x=1440:y=270,
    drawtext=fontsize=40:fontcolor=yellow:text='M3':x=2400:y=270,
    drawtext=fontsize=40:fontcolor=yellow:text='M4':x=480:y=810,
    drawtext=fontsize=40:fontcolor=yellow:text='M5':x=1440:y=810,
    drawtext=fontsize=40:fontcolor=yellow:text='M6':x=2400:y=810,
    drawtext=fontsize=40:fontcolor=yellow:text='M7':x=480:y=1350,
    drawtext=fontsize=40:fontcolor=yellow:text='M8':x=1440:y=1350,
    drawtext=fontsize=40:fontcolor=yellow:text='M9':x=2400:y=1350
  `.replace(/\s+/g, ' ').trim();
  
  runFfmpeg([
    '-y', '-f', 'lavfi', '-i', filter,
    '-frames:v', '1', outputPath
  ]);
}

async function measureZoomJitter(zoomType, useUpscale) {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), `zoom-jitter-${zoomType}-${useUpscale ? 'up' : 'base'}-`));
  const srcImg = path.join(testDir, 'source.png');
  const outputVideo = path.join(testDir, `output_${zoomType}_${useUpscale ? 'up' : 'base'}.mp4`);
  const framesDir = path.join(testDir, 'frames');
  
  try {
    console.log(`\n=== Measuring ${zoomType} ${useUpscale ? '(with 4x upscale)' : '(baseline)'} ===`);
    
    createTestImage(srcImg);
    
    const startScale = 1.0;
    const intensity = 0.15;
    const maxZoom = startScale + intensity;
    const frames = TOTAL_FRAMES;
    const fx = 0.5;
    const fy = 0.5;
    const progress = `on/${frames}`;
    
    let zExpr, xExpr, yExpr;
    
    if (zoomType === 'zoomIn') {
      zExpr = `min(${startScale}+${intensity}*${progress},${maxZoom})`;
      xExpr = `iw*${fx}-iw/zoom/2`;
      yExpr = `ih*${fy}-ih/zoom/2`;
    } else if (zoomType === 'zoomOut') {
      zExpr = `max(${maxZoom}-${intensity}*${progress},${startScale})`;
      xExpr = `iw*${fx}-iw/zoom/2`;
      yExpr = `ih*${fy}-ih/zoom/2`;
    } else if (zoomType === 'kenburns') {
      zExpr = `min(${startScale}+${intensity}*${progress},${maxZoom})`;
      xExpr = `iw*${fx}-iw/zoom/2+(iw-iw/zoom)*(${progress}-0.5)`;
      yExpr = `ih*${fy}-ih/zoom/2+(ih-ih/zoom)*(${progress}-0.5)`;
    } else if (zoomType === 'panLeft') {
      zExpr = `${maxZoom}`;
      xExpr = `(iw-iw/zoom)*(1-${progress})`;
      yExpr = `ih*${fy}-ih/zoom/2`;
    } else if (zoomType === 'panRight') {
      zExpr = `${maxZoom}`;
      xExpr = `(iw-iw/zoom)*${progress}`;
      yExpr = `ih*${fy}-ih/zoom/2`;
    } else if (zoomType === 'panUp') {
      zExpr = `${maxZoom}`;
      xExpr = `iw*${fx}-iw/zoom/2`;
      yExpr = `(ih-ih/zoom)*(1-${progress})`;
    } else if (zoomType === 'panDown') {
      zExpr = `${maxZoom}`;
      xExpr = `iw*${fx}-iw/zoom/2`;
      yExpr = `(ih-ih/zoom)*${progress}`;
    } else if (zoomType === 'pulse') {
      const around = startScale + intensity / 2;
      zExpr = `${around}-${intensity/2}*cos(2*PI*${progress})`;
      xExpr = `iw*${fx}-iw/zoom/2`;
      yExpr = `ih*${fy}-ih/zoom/2`;
    } else {
      throw new Error(`Unknown zoom type: ${zoomType}`);
    }
    
    const clampX = (expr) => `max(0,min(iw-iw/zoom,${expr}))`;
    const clampY = (expr) => `max(0,min(ih-ih/zoom,${expr}))`;
    
    const zoomFilter = 'zoompan';
    
    let filterGraph;
    if (useUpscale) {
      const upscaledW = WIDTH * UPSCALE_FACTOR;
      const upscaledH = HEIGHT * UPSCALE_FACTOR;
      // Pre-upscale with lanczos, then zoompan on upscaled, then downscale to target
      filterGraph = 
        `[0:v]scale=${upscaledW}:${upscaledH}:flags=lanczos[up];` +
        `[up]${zoomFilter}=z='${zExpr}':x='${clampX(xExpr)}':y='${clampY(yExpr)}':s=${upscaledW}x${upscaledH}:fps=${FPS}[zoomed];` +
        `[zoomed]scale=${WIDTH}:${HEIGHT}:flags=lanczos,setsar=1,format=yuv420p[vout]`;
    } else {
      filterGraph = `${zoomFilter}=z='${zExpr}':d=1:x='${clampX(xExpr)}':y='${clampY(yExpr)}':s=${WIDTH}x${HEIGHT}:fps=${FPS},setsar=1,format=yuv420p[vout]`;
    }
    
    runFfmpeg([
      '-y', '-loop', '1', '-framerate', String(FPS), '-i', srcImg,
      '-filter_complex', filterGraph,
      '-map', '[vout]',
      '-t', String(DURATION),
      '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
      '-pix_fmt', 'yuv420p',
      outputVideo
    ]);
    
    console.log('Rendered video');
    
    const duration = probeDuration(outputVideo);
    console.log(`Video duration: ${duration.toFixed(3)}s`);
    
    const frameFiles = extractFrames(outputVideo, framesDir);
    console.log(`Extracted ${frameFiles.length} frames`);
    
    if (frameFiles.length !== TOTAL_FRAMES) {
      console.warn(`Expected ${TOTAL_FRAMES} frames, got ${frameFiles.length}`);
    }
    
    const diffs = [];
    for (let i = 1; i < Math.min(frameFiles.length, 100); i++) {
      const diffResult = runFfmpeg([
        '-y', '-i', frameFiles[i-1], '-i', frameFiles[i],
        '-filter_complex', 'ssim',
        '-f', 'null', '-'
      ]);
      const ssimMatch = diffResult.stderr.match(/All:(\d+\.\d+)/);
      if (ssimMatch) {
        diffs.push(1 - parseFloat(ssimMatch[1]));
      }
    }
    
    if (diffs.length > 0) {
      const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const maxDiff = Math.max(...diffs);
      
      const secondDiffs = [];
      for (let i = 2; i < diffs.length; i++) {
        secondDiffs.push(diffs[i] - 2*diffs[i-1] + diffs[i-2]);
      }
      const meanAccel = secondDiffs.reduce((a, b) => a + Math.abs(b), 0) / secondDiffs.length;
      const maxAccel = Math.max(...secondDiffs.map(Math.abs));
      const signChanges = secondDiffs.filter((v, i, arr) => i > 0 && v * arr[i-1] < 0).length;
      const zeroSteps = secondDiffs.filter(v => Math.abs(v) < 1e-10).length;
      
      return {
        zoomType,
        useUpscale,
        meanDiff,
        maxDiff,
        meanAccel,
        maxAccel,
        signChanges,
        zeroSteps,
        frameCount: frameFiles.length
      };
    }
    
    return null;
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  console.log('=== Zoom Jitter Measurement: Baseline vs 4x Upscale ===');
  console.log(`FPS: ${FPS}, Duration: ${DURATION}s, Frames: ${TOTAL_FRAMES}`);
  console.log(`Output: ${WIDTH}x${HEIGHT}, Upscale: ${UPSCALE_FACTOR}x`);
  
  const zoomTypes = ['zoomIn', 'zoomOut', 'kenburns', 'panLeft', 'panRight', 'panUp', 'panDown', 'pulse'];
  const results = [];
  
  for (const zoomType of zoomTypes) {
    try {
      const baseline = await measureZoomJitter(zoomType, false);
      if (baseline) results.push({ ...baseline, label: 'baseline' });
      
      const upscaled = await measureZoomJitter(zoomType, true);
      if (upscaled) results.push({ ...upscaled, label: '4x-upscale' });
    } catch (e) {
      console.error(`Error measuring ${zoomType}:`, e.message);
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.table(results.map(r => ({
    Type: r.zoomType,
    Mode: r.label,
    'Mean Diff': r.meanDiff.toFixed(6),
    'Max Diff': r.maxDiff.toFixed(6),
    'Mean Accel': r.meanAccel.toFixed(6),
    'Max Accel': r.maxAccel.toFixed(6),
    'Sign Changes': r.signChanges,
    'Zero Steps': r.zeroSteps,
    Frames: r.frameCount
  })));
  
  // Compare baseline vs upscale
  console.log('\n=== COMPARISON (baseline vs 4x upscale) ===');
  for (const zoomType of zoomTypes) {
    const base = results.find(r => r.zoomType === zoomType && r.label === 'baseline');
    const up = results.find(r => r.zoomType === zoomType && r.label === '4x-upscale');
    if (base && up) {
      const accelImprovement = ((base.meanAccel - up.meanAccel) / base.meanAccel * 100).toFixed(1);
      const maxAccelImprovement = ((base.maxAccel - up.maxAccel) / base.maxAccel * 100).toFixed(1);
      const signChangeReduction = ((base.signChanges - up.signChanges) / base.signChanges * 100).toFixed(1);
      console.log(`${zoomType}: meanAccel ${accelImprovement}% better, maxAccel ${maxAccelImprovement}% better, signChanges ${signChangeReduction}% fewer`);
    }
  }
  
  fs.writeFileSync(
    path.join(__dirname, 'zoom-jitter-comparison.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\nResults saved to .spike/zoom-jitter-comparison.json');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});