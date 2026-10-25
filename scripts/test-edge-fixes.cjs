const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EDGE_RUNNER = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'edge-runner.py');
const PYTHON_EXE = path.join(ROOT, 'vendor', 'kokoro', 'runtime', 'python', 'python.exe');

function runEdgeTts(text, voice, rate, pitch, outputPath, timeoutMs = 30000) {
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
        reject(new Error(`TIMEOUT after ${timeoutMs}ms`));
      }
    }, timeoutMs);

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
        reject(new Error(`spawn error: ${err.message}`));
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`edge-tts exited with code ${code}: ${stderr}`));
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
  console.log('=== TEST 1: "hola, ¿cómo estás?" with Edge ===');
  const text1 = 'hola, ¿cómo estás?';
  const out1 = path.join(ROOT, '.spike', 'test_hola.wav');
  
  const start1 = Date.now();
  await runEdgeTts(text1, 'es-MX-JorgeNeural', '+6%', '+0Hz', out1, 30000);
  const time1 = Date.now() - start1;
  console.log(`  Time: ${(time1 / 1000).toFixed(1)}s`);
  
  const transcript1 = await runWhisper(out1, 'es');
  console.log(`  Reference: ${text1}`);
  console.log(`  Transcript: ${transcript1}`);
  const wer1 = calculateWer(text1, transcript1);
  console.log(`  WER: ${wer1}%`);
  console.log('');
  
  console.log('=== TEST 2: Cancel during synthesis (simulated) ===');
  // We can't easily test cancel from here, but we can verify the app's main.js handles it
  console.log('  (Manual test needed: start synthesis, cancel, then sample again)');
  console.log('');
  
  console.log('=== TEST 3: Sample after cancel (manual verification needed) ===');
  console.log('  Run the app, generate voice, cancel, then click "Escuchar muestra"');
  console.log('  Should succeed without E_VOICE_CANCELLED');
}

main().catch(err => {
  console.error('TEST FAILED:', err.message);
  process.exit(1);
});