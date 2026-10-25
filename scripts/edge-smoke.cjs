'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EDGE_RUNNER = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'edge-runner.py');
const PYTHON_EXE = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'python', 'python.exe');

async function runEdgeTts(text, voice, rate, pitch, outputPath) {
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

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`spawn error: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`edge-tts exited with code ${code}: ${stderr}`));
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

async function runWhisper(audioPath, language) {
  return new Promise((resolve, reject) => {
    const whisperCli = path.join(ROOT, 'vendor', 'whisper', 'bin', 'whisper-cli.exe');
    const modelPath = path.join(ROOT, 'vendor', 'whisper', 'models', 'ggml-base.bin');
    const args = ['-m', modelPath, '-f', audioPath, '-otxt', '-l', language];

    const child = spawn(whisperCli, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      const txtPath = audioPath + '.txt';
      if (code === 0 && fs.existsSync(txtPath)) {
        const transcript = fs.readFileSync(txtPath, 'utf-8').trim();
        fs.unlinkSync(txtPath);
        resolve(transcript);
      } else {
        reject(new Error(`whisper exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (err) => reject(new Error(`whisper spawn error: ${err.message}`)));
  });
}

function calculateWer(reference, hypothesis) {
  const refWords = reference.toLowerCase().split(/\s+/).filter(Boolean);
  const hypWords = hypothesis.toLowerCase().split(/\s+/).filter(Boolean);
  
  const dp = Array(refWords.length + 1).fill(null).map(() => Array(hypWords.length + 1).fill(0));
  for (let i = 0; i <= refWords.length; i++) dp[i][0] = i;
  for (let j = 0; j <= hypWords.length; j++) dp[0][j] = j;
  
  for (let i = 1; i <= refWords.length; i++) {
    for (let j = 1; j <= hypWords.length; j++) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  const errors = dp[refWords.length][hypWords.length];
  return (errors / refWords.length * 100).toFixed(2);
}

async function main() {
  console.log('=== EDGE-TTS SMOKE TEST ===\n');
  
  // Test 1: Short text
  console.log('Test 1: Short text (40 words)');
  const shortText = 'Hola, esta es una prueba de voz neuronal de Microsoft con Jorge en español de México. La voz suena natural y clara, ideal para narraciones profesionales.';
  const shortOutput = path.join(ROOT, '.spike', 'smoke_short.wav');
  
  const start1 = Date.now();
  await runEdgeTts(shortText, 'es-MX-JorgeNeural', '+6%', '+0Hz', shortOutput);
  const time1 = Date.now() - start1;
  
  const stats1 = fs.statSync(shortOutput);
  console.log(`  Time: ${(time1 / 1000).toFixed(1)}s`);
  console.log(`  Size: ${stats1.size} bytes`);
  
  const ffprobe = spawn('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=sample_rate,channels,codec_name',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    shortOutput
  ], { windowsHide: true });
  
  let ffprobeOut = '';
  for await (const chunk of ffprobe.stdout) ffprobeOut += chunk.toString();
  await new Promise(r => ffprobe.on('close', r));
  console.log(`  Format: ${ffprobeOut.trim().replace(/\n/g, ', ')}`);
  
  const transcript1 = await runWhisper(shortOutput, 'es');
  console.log(`  Reference: ${shortText}`);
  console.log(`  Transcript: ${transcript1}`);
  const wer1 = calculateWer(shortText, transcript1);
  console.log(`  WER: ${wer1}%`);
  console.log('');
  
  // Test 2: Long text (~1200 words)
  console.log('Test 2: Long text (~1200 words)');
  let longText = '';
  for (let i = 0; i < 40; i++) {
    longText += 'Esta es una prueba de texto largo para verificar la sintesis de voz neuronal de Microsoft con Jorge. El texto contiene muchas palabras para simular un guion real de narracion profesional. ';
  }
  const longOutput = path.join(ROOT, '.spike', 'smoke_long.wav');
  
  const start2 = Date.now();
  await runEdgeTts(longText, 'es-MX-JorgeNeural', '+6%', '+0Hz', longOutput);
  const time2 = Date.now() - start2;
  
  const stats2 = fs.statSync(longOutput);
  console.log(`  Time: ${(time2 / 1000).toFixed(1)}s`);
  console.log(`  Size: ${stats2.size} bytes`);
  
  const ffprobe2 = spawn('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    longOutput
  ], { windowsHide: true });
  
  let ffprobeOut2 = '';
  for await (const chunk of ffprobe2.stdout) ffprobeOut2 += chunk.toString();
  await new Promise(r => ffprobe2.on('close', r));
  console.log(`  Duration: ${ffprobeOut2.trim()}s`);
  console.log('');
  
  // Test 3: Cache test (second run should be faster)
  console.log('Test 3: Cache test (second run of short text)');
  const shortOutput2 = path.join(ROOT, '.spike', 'smoke_short2.wav');
  
  const start3 = Date.now();
  await runEdgeTts(shortText, 'es-MX-JorgeNeural', '+6%', '+0Hz', shortOutput2);
  const time3 = Date.now() - start3;
  
  console.log(`  Time: ${(time3 / 1000).toFixed(1)}s (first run was ${(time1 / 1000).toFixed(1)}s)`);
  console.log(`  Cache benefit: ${time1 > time3 ? 'YES' : 'NO'}`);
  console.log('');
  
  console.log('=== ALL TESTS PASSED ===');
}

main().catch(err => {
  console.error('SMOKE TEST FAILED:', err.message);
  process.exit(1);
});