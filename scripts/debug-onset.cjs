const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EDGE_RUNNER = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'edge-runner.py');
const PYTHON_EXE = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'python', 'python.exe');

function runEdgeTtsRaw(text, voice, rate, pitch, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      EDGE_RUNNER,
      '--output', outputPath,
      '--voice', voice,
      '--rate', rate,
      '--pitch', pitch
    ];

    const child = spawn(PYTHON_EXE, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch (e) {}
        reject(new Error('TIMEOUT after 60000ms'));
      }
    }, 60000);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error('spawn error: ' + err.message));
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error('edge-tts exited with code ' + code + ': ' + stderr));
        }
      }
    });

    const payload = JSON.stringify({
      text,
      voiceId: voice,
      language: voice.startsWith('es') ? 'es' : 'en',
      speed: 1,
      pause: 0.3,
      rate,
      pitch,
      outputPath
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = require('ffmpeg-static');
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error('ffmpeg exited ' + code + ': ' + stderr));
    });
    child.on('error', reject);
  });
}

function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const ffprobePath = require('ffprobe-static').path;
    const child = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error('ffprobe exited ' + code + ': ' + stderr));
    });
    child.on('error', reject);
  });
}

async function analyzeAudio(filePath, label) {
  console.log('\n=== ' + label + ' ===');
  console.log('File: ' + filePath);
  console.log('Size: ' + fs.statSync(filePath).size + ' bytes');
  
  const ffprobeInfo = await runFfprobe([
    '-v', 'error',
    '-show_entries', 'stream=sample_rate,channels,codec_name,bit_rate',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ]);
  console.log('ffprobe:', ffprobeInfo.replace(/\n/g, ', '));
  
  // Get first 150ms volume using ffmpeg volumedetect
  const volResult = await runFfmpeg([
    '-v', 'error',
    '-i', filePath,
    '-af', 'volumedetect',
    '-f', 'null', '-',
    '-t', '0.15'
  ]);
  const volLines = volResult.stderr.split('\n').filter(l => l.includes('mean_volume') || l.includes('max_volume') || l.includes('histogram'));
  console.log('First 150ms volume:', volLines.join(' | '));
  
  // Full duration volume
  const fullVolResult = await runFfmpeg([
    '-v', 'error',
    '-i', filePath,
    '-af', 'volumedetect',
    '-f', 'null', '-'
  ]);
  const fullVolLines = fullVolResult.stderr.split('\n').filter(l => l.includes('mean_volume') || l.includes('max_volume') || l.includes('histogram'));
  console.log('Full duration volume:', fullVolLines.join(' | '));
}

async function runEdgeTtsDirect(text, voice, rate, pitch, outputPath) {
  return new Promise((resolve, reject) => {
    const script = 'import asyncio, edge_tts, sys\n' +
      'async def main():\n' +
      '    text = sys.argv[1]\n' +
      '    voice = sys.argv[2]\n' +
      '    rate = sys.argv[3]\n' +
      '    pitch = sys.argv[4]\n' +
      '    output = sys.argv[5]\n' +
      '    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)\n' +
      '    await communicate.save(output)\n' +
      '    print("DONE")\n' +
      'asyncio.run(main())';
    
    const child = spawn(PYTHON_EXE, ['-c', script, text, voice, rate, pitch, outputPath], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => code === 0 ? resolve() : reject(new Error('exit ' + code + ': ' + stderr)));
    child.on('error', reject);
  });
}

async function main() {
  const testText = 'El prestamo del copyright incluye palabras con bl, gr, tr, pr, dr, cl.';
  const voice = 'es-MX-JorgeNeural';
  const rate = '+6%';
  const pitch = '+0Hz';
  
  console.log('Test text:', testText);
  console.log('Voice:', voice, 'Rate:', rate);
  
  // Step 1: Generate raw MP3 using edge-tts directly (bypass our runner's ffmpeg)
  console.log('\n>>> Step 1: Generate raw MP3 with edge-tts');
  const rawMp3 = path.join(ROOT, '.spike', 'test_raw.mp3');
  const rawWav = path.join(ROOT, '.spike', 'test_raw.wav');
  
  await runEdgeTtsDirect(testText, voice, rate, pitch, rawMp3);
  console.log('Raw MP3 generated');
  await analyzeAudio(rawMp3, 'RAW MP3 (edge-tts direct)');
  
  // Step 2: Convert raw MP3 to WAV using our ffmpeg command
  console.log('\n>>> Step 2: Convert raw MP3 to WAV (our ffmpeg command)');
  await runFfmpeg([
    '-y', '-i', rawMp3,
    '-ar', '48000', '-ac', '2',
    '-c:a', 'pcm_s16le', rawWav
  ]);
  console.log('Raw WAV generated');
  await analyzeAudio(rawWav, 'RAW WAV (ffmpeg converted)');
  
  // Step 3: Generate via our full pipeline (edge-runner.py)
  console.log('\n>>> Step 3: Full pipeline via edge-runner.py');
  const pipelineWav = path.join(ROOT, '.spike', 'test_pipeline.wav');
  await runEdgeTtsRaw(testText, voice, rate, pitch, pipelineWav);
  console.log('Pipeline WAV generated');
  await analyzeAudio(pipelineWav, 'PIPELINE WAV (edge-runner.py)');
  
  // Step 4: Compare onsets - extract first 500ms of each and analyze
  console.log('\n>>> Step 4: Onset analysis');
  const onsetFiles = [];
  for (const [file, label] of [
    [rawMp3, 'raw_mp3'],
    [rawWav, 'raw_wav'],
    [pipelineWav, 'pipeline_wav']
  ]) {
    const onsetFile = path.join(ROOT, '.spike', 'onset_' + label + '.wav');
    await runFfmpeg([
      '-y', '-i', file,
      '-t', '0.5',
      '-c:a', 'pcm_s16le', onsetFile
    ]);
    onsetFiles.push(onsetFile);
    console.log('Extracted first 500ms of ' + label + ' to ' + onsetFile);
  }
  
  // Analyze each onset
  for (const file of onsetFiles) {
    await analyzeAudio(file, 'ONSET ' + path.basename(file));
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Compare the volume levels of the onset files.');
  console.log('If raw MP3 is clean but converted WAV has issues -> ffmpeg is the problem.');
  console.log('If raw MP3 already has issues -> edge-tts is the problem.');
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = require('ffmpeg-static');
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error('ffmpeg exited ' + code + ': ' + stderr));
    });
    child.on('error', reject);
  });
}

function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const ffprobePath = require('ffprobe-static').path;
    const child = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error('ffprobe exited ' + code + ': ' + stderr));
    });
    child.on('error', reject);
  });
}

function runEdgeTtsRaw(text, voice, rate, pitch, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      EDGE_RUNNER,
      '--output', outputPath,
      '--voice', voice,
      '--rate', rate,
      '--pitch', pitch
    ];

    const child = spawn(PYTHON_EXE, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch (e) {}
        reject(new Error('TIMEOUT after 60000ms'));
      }
    }, 60000);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error('spawn error: ' + err.message));
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error('edge-tts exited with code ' + code + ': ' + stderr));
        }
      }
    });

    const payload = JSON.stringify({
      text,
      voiceId: voice,
      language: voice.startsWith('es') ? 'es' : 'en',
      speed: 1,
      pause: 0.3,
      rate,
      pitch,
      outputPath
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

function runEdgeTtsDirect(text, voice, rate, pitch, outputPath) {
  return new Promise((resolve, reject) => {
    const script = 'import asyncio, edge_tts, sys\n' +
      'async def main():\n' +
      '    text = sys.argv[1]\n' +
      '    voice = sys.argv[2]\n' +
      '    rate = sys.argv[3]\n' +
      '    pitch = sys.argv[4]\n' +
      '    output = sys.argv[5]\n' +
      '    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)\n' +
      '    await communicate.save(output)\n' +
      '    print("DONE")\n' +
      'asyncio.run(main())';
    
    const child = spawn(PYTHON_EXE, ['-c', script, text, voice, rate, pitch, outputPath], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => code === 0 ? resolve() : reject(new Error('exit ' + code + ': ' + stderr)));
    child.on('error', reject);
  });
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});