'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const ROOT = path.join(__dirname, '..');

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

function whisperTranscribe(audioPath) {
  const whisperBin = path.join(ROOT, 'vendor', 'whisper', 'bin', 'whisper-cli.exe');
  const modelPath = path.join(ROOT, 'vendor', 'whisper', 'models', 'ggml-base.bin');
  
  if (!fs.existsSync(whisperBin)) throw new Error('whisper-cli.exe not found');
  if (!fs.existsSync(modelPath)) throw new Error('ggml-base.bin not found');
  
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-out-'));
  const outBase = path.join(outDir, 'transcript');
  
  // Use -ojf for full JSON with word-level timestamps
  const result = spawnSync(whisperBin, [
    '-m', modelPath,
    '-f', audioPath,
    '-ojf',
    '-of', outBase,
    '-l', 'es'
  ], { windowsHide: true, encoding: 'utf8', timeout: 120000 });
  
  if (result.status !== 0) {
    throw new Error(`Whisper failed: ${result.stderr}`);
  }
  
  const jsonPath = `${outBase}.json`;
  if (!fs.existsSync(jsonPath)) {
    throw new Error('Whisper JSON output not found');
  }
  
  const transcript = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  // Extract word-level tokens
  const words = [];
  for (const segment of transcript.transcription || []) {
    for (const token of segment.tokens || []) {
      // Skip special tokens but keep words with leading/trailing spaces
      if (token.text && token.text.trim() && 
          !token.text.startsWith('[_') &&  // Skip [_BEG_], [_TT_122], etc.
          token.offsets && token.offsets.from !== undefined) {
        words.push({
          word: token.text.trim(),
          start: token.offsets.from / 1000,  // Convert ms to seconds
          end: token.offsets.to / 1000,
          p: token.p
        });
      }
    }
  }
  
  // Cleanup
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
  
  return { segments: transcript.transcription || [], words };
}

function parseASS(assPath) {
  const content = fs.readFileSync(assPath, 'utf8');
  const events = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('Dialogue:')) {
      const parts = line.split(',');
      if (parts.length >= 10) {
        const start = parseASSTime(parts[1].trim());
        const end = parseASSTime(parts[2].trim());
        const text = parts.slice(9).join(',').replace(/\\N/g, ' ').replace(/\\n/g, ' ').trim();
        if (text) {
          events.push({ start, end, text });
        }
      }
    }
  }
  return events;
}

function parseASSTime(timeStr) {
  // Format: H:MM:SS.cc
  const match = timeStr.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
  if (!match) return 0;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3], 10);
  const cs = parseInt(match[4], 10);
  return h * 3600 + m * 60 + s + cs / 100;
}

function compareSubtitleSync(assEvents, whisperWords) {
  const results = [];
  
  for (const event of assEvents) {
    // Find whisper words that overlap with this subtitle event
    const overlappingWords = whisperWords.filter(w => 
      w.end > event.start && w.start < event.end
    );
    
    if (overlappingWords.length === 0) {
      results.push({
        assStart: event.start,
        assEnd: event.end,
        assText: event.text,
        whisperStart: null,
        whisperEnd: null,
        offsetStart: null,
        offsetEnd: null,
        matchedWords: 0
      });
      continue;
    }
    
    const whisperStart = overlappingWords[0].start;
    const whisperEnd = overlappingWords[overlappingWords.length - 1].end;
    
    results.push({
      assStart: event.start,
      assEnd: event.end,
      assText: event.text,
      whisperStart,
      whisperEnd,
      offsetStart: Math.round((event.start - whisperStart) * 1000),
      offsetEnd: Math.round((event.end - whisperEnd) * 1000),
      matchedWords: overlappingWords.length
    });
  }
  
  return results;
}

function printStats(results) {
  const validOffsets = results.filter(r => r.offsetStart !== null);
  if (validOffsets.length === 0) {
    console.log('No matched subtitle events');
    return;
  }
  
  const startOffsets = validOffsets.map(r => r.offsetStart);
  const endOffsets = validOffsets.map(r => r.offsetEnd);
  
  const meanStart = startOffsets.reduce((a, b) => a + b, 0) / startOffsets.length;
  const meanEnd = endOffsets.reduce((a, b) => a + b, 0) / endOffsets.length;
  const medianStart = startOffsets.sort((a, b) => a - b)[Math.floor(startOffsets.length / 2)];
  const medianEnd = endOffsets.sort((a, b) => a - b)[Math.floor(endOffsets.length / 2)];
  const maxStart = Math.max(...startOffsets.map(Math.abs));
  const maxEnd = Math.max(...endOffsets.map(Math.abs));
  
  console.log(`\n=== Subtitle Sync Stats ===`);
  console.log(`Matched events: ${validOffsets.length}/${results.length}`);
  console.log(`Start offset: mean=${meanStart.toFixed(1)}ms, median=${medianStart}ms, max=±${maxStart}ms`);
  console.log(`End offset: mean=${meanEnd.toFixed(1)}ms, median=${medianEnd}ms, max=±${maxEnd}ms`);
  
  console.log('\nPer-event details:');
  for (const r of results) {
    if (r.offsetStart !== null) {
      console.log(`  ASS: ${r.assStart.toFixed(3)}-${r.assEnd.toFixed(3)} | Whisper: ${r.whisperStart.toFixed(3)}-${r.whisperEnd.toFixed(3)} | Offset: ${r.offsetStart}ms/${r.offsetEnd}ms | "${r.assText.substring(0, 50)}..."`);
    } else {
      console.log(`  ASS: ${r.assStart.toFixed(3)}-${r.assEnd.toFixed(3)} | NO MATCH | "${r.assText.substring(0, 50)}..."`);
    }
  }
  
  return { meanStart, medianStart, maxStart, meanEnd, medianEnd, maxEnd };
}

function safeFormatName(format) {
  return format.replace(':', 'x');
}

async function runTest(scenes, format = '16:9', testName) {
  const safeTestName = String(testName).replace(/[^a-zA-Z0-9]/g, '-');
  console.log(`\n========== ${testName} (${format}) ==========`);
  
  const safeFormat = safeFormatName(format);
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), `subtitle-sync-${safeFormat}-${safeTestName}-`));
  const outputVideo = path.join(testDir, `output_${safeFormat}.mp4`);
  const outputAss = path.join(testDir, `subtitles_${safeFormat}.ass`);
  const narrationPath = path.join(testDir, 'narration.wav');
  
  try {
    // Create test images
    const images = [];
    for (let i = 0; i < scenes.length; i++) {
      const imgPath = path.join(testDir, `scene${i+1}.png`);
      const color = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta'][i % 6];
      runFfmpeg([
        '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=1920x1080`,
        '-frames:v', '1', imgPath
      ]);
      images.push({ name: `scene${i+1}.png`, path: imgPath, focus169: { x: 0.5, y: 0.5, scale: 1 } });
    }
    
    // Generate narration with Kokoro
    const kokoroBin = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'kokoro-runtime.exe');
    const fullText = scenes.map(s => s.text).join(' ');
    
    const payload = JSON.stringify({
      text: fullText,
      voiceId: 'ef_dora',
      language: 'es',
      speed: 1,
      outputPath: narrationPath
    });
    
    console.log('Generating narration...');
    const kokoroResult = spawnSync(kokoroBin, ['--output', narrationPath, '--voice', 'ef_dora', '--lang', 'es'], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, PYTHONUTF8: '1' },
      timeout: 120000
    });
    
    if (kokoroResult.status !== 0 || !fs.existsSync(narrationPath)) {
      throw new Error(`Kokoro failed: ${kokoroResult.stderr}`);
    }
    
    const audioDuration = probeDuration(narrationPath);
    console.log(`Narration generated: ${audioDuration.toFixed(2)}s`);
    
    // Build scenes with timing
    const totalText = fullText;
    const wordsPerSecond = totalText.split(/\s+/).length / audioDuration;
    const sceneTimings = [];
    let currentTime = 0;
    
    for (const scene of scenes) {
      const wordCount = scene.text.split(/\s+/).length;
      const duration = Math.max(1, wordCount / wordsPerSecond);
      sceneTimings.push({ ...scene, duration, start: currentTime });
      currentTime += duration;
    }
    
    // Adjust last scene to match audio duration
    const totalDuration = sceneTimings.reduce((sum, s) => sum + s.duration, 0);
    const scale = audioDuration / totalDuration;
    for (const s of sceneTimings) {
      s.duration *= scale;
      s.start *= scale;
    }
    sceneTimings[sceneTimings.length - 1].duration = audioDuration - sceneTimings.slice(0, -1).reduce((sum, s) => sum + s.duration, 0);
    
    // Determine output config
    const outputConfig = format === '9:16' ? { id: '9:16', w: 1080, h: 1920 } : { id: '16:9', w: 1920, h: 1080 };
    
    // Build filter graph using the actual rendering code
    const { renderVideo } = require(ROOT + '/app/core/ffmpeg-renderer.js');
    
    // Create subtitle config
    const subtitleConfig = {
      enabled: true,
      fontFamily: 'Roboto',
      fontSizeH: 48,
      fontSizeV: 64,
      bold: false,
      italic: false,
      letterSpacing: 0,
      textColor: '#ffffff',
      outlineWidth: 2,
      outlineColor: '#000000',
      alignment: 2,
      marginH: 40,
      marginV: 40,
      delay: 0,
      autoVoiceStart: true,
      wordHighlight: false,
      background: { enabled: false },
      shadow: { enabled: true, color: '#000000', opacity: 0.7, distance: 3, angle: 45, blur: 4 },
      highlight: { enabled: false },
      animation: 'none'
    };
    
    console.log('Rendering video with subtitles...');
    const renderResult = await renderVideo({
      scenes: sceneTimings.map(s => ({
        number: s.number,
        duration: s.duration,
        text: s.text,
        words: [] // We don't have word timings from alignment
      })),
      images: images,
      narration: { name: 'narration.wav', path: narrationPath },
      music: null,
      outputPath: outputVideo,
      audioDuration: audioDuration,
      outputIds: [outputConfig.id],
      config: {
        outputs: [outputConfig.id],
        fitMode: 'cover',
        frameColor: '#000000',
        backgroundMode: 'color',
        backgroundColor: '#000000',
        musicVolume: 0.3,
        voice: { language: 'es', engine: 'kokoro', voiceId: 'ef_dora', speed: 1, pause: 0.3 },
        extras: { badge: { enabled: false }, lowerThird: { enabled: false }, progressBar: { enabled: false } },
        subtitles: subtitleConfig
      },
      renderOptions: {
        zoomEnabled: false,
        zoomType: 'kenburns',
        zoomMode: 'fixed',
        zoomSeed: 12345,
        zoomStartScale: 1.0,
        zoomIntensity: 0.15,
        transitionType: 'fade',
        transitionMode: 'fixed',
        transitionSeed: 4242,
        transitionDuration: 1.0
      },
      useHardwareAcceleration: false
    });
    
    console.log('Video rendered:', renderResult.outputPath);
    
    // Extract ASS file from the render (it's generated in temp dir)
    // The renderVideo function generates subtitles in a temp dir. We need to find it.
    // For now, let's re-run the subtitle generation to get the ASS file.
    
    // Actually, let's use the internal subtitle builder directly
    const { buildAss } = require(ROOT + '/app/core/subtitles.js');
    const { buildFullFilterGraph } = require(ROOT + '/app/core/ffmpeg-helpers.js');
    
    // Build the scenes with word timings (empty for now - we'd need alignment)
    const scenesWithWords = sceneTimings.map(s => ({
      number: s.number,
      duration: s.duration,
      text: s.text,
      words: [] // Would need alignment to get word timings
    }));
    
    // Build ASS using the same logic as the app
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-subs-'));
    const fontsDir = path.join(tempDir, 'fonts');
    fs.mkdirSync(fontsDir, { recursive: true });
    
    // Copy fonts
    const bundledFontsDir = path.join(ROOT, 'app', 'assets', 'fonts');
    for (const font of fs.readdirSync(bundledFontsDir)) {
      fs.copyFileSync(path.join(bundledFontsDir, font), path.join(fontsDir, font));
    }
    
    const assContent = buildAss(scenesWithWords, subtitleConfig, outputConfig, { timeOffset: 0 });
    fs.writeFileSync(outputAss, assContent, 'utf-8');
    console.log('ASS file generated:', outputAss);
    
    // Parse ASS events
    const assEvents = parseASS(outputAss);
    console.log(`ASS events: ${assEvents.length}`);
    
    // Transcribe narration with Whisper
    console.log('Transcribing with Whisper...');
    const transcript = whisperTranscribe(narrationPath);
    const whisperWords = transcript.words || [];
    console.log(`Whisper words: ${whisperWords.length}`);
    for (const w of whisperWords.slice(0, 5)) {
      console.log(`  Word: "${w.word}" ${w.start.toFixed(3)}-${w.end.toFixed(3)}`);
    }
    
    // Compare
    const results = compareSubtitleSync(assEvents, whisperWords);
    const stats = printStats(results);
    
    return { results, stats, assEvents, whisperWords, testName };
    
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  console.log('=== Subtitle Sync Measurement ===');
  
  // Test 1: Single scene, 16:9
  const singleScene = [
    { number: 1, text: 'La deuda sube treinta por ciento este año y el interés afecta tu sueldo significativamente.' }
  ];
  
  // Test 2: 5 scenes, 16:9
  const multiScene169 = [
    { number: 1, text: 'La deuda sube treinta por ciento este año.' },
    { number: 2, text: 'El interés afecta tu sueldo significativamente.' },
    { number: 3, text: 'Los expertos recomiendan ahorrar más.' },
    { number: 4, text: 'La inflación sigue subiendo sin control.' },
    { number: 5, text: 'El gobierno anuncia nuevas medidas económicas.' }
  ];
  
  // Test 3: 5 scenes, 9:16
  const multiScene916 = [
    { number: 1, text: 'Deuda sube treinta por ciento.' },
    { number: 2, text: 'Interés afecta tu sueldo.' },
    { number: 3, text: 'Ahorra más recomiendan expertos.' },
    { number: 4, text: 'Inflación sube sin control.' },
    { number: 5, text: 'Gobierno anuncia medidas.' }
  ];
  
  try {
    await runTest(singleScene, '16:9', 'Single Scene 16:9');
    await runTest(multiScene169, '16:9', 'Multi Scene 16:9 (5 scenes)');
    await runTest(multiScene916, '9:16', 'Multi Scene 9:16 (5 scenes)');
    
    console.log('\n========== ALL TESTS COMPLETE ==========');
  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});