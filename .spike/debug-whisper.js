const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\Users\\zyrothx\\Desktop\\projectwo';
const whisperBin = path.join(ROOT, 'vendor', 'whisper', 'bin', 'whisper-cli.exe');
const modelPath = path.join(ROOT, 'vendor', 'whisper', 'models', 'ggml-base.bin');
const audioPath = 'test_narration.wav';

const os = require('os');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-debug-'));
const outBase = path.join(outDir, 'transcript');

const result = spawnSync(require('path').join(ROOT, 'vendor', 'whisper', 'bin', 'whisper-cli.exe'), [
  '-m', modelPath,
  '-f', audioPath,
  '-ojf',
  '-of', outBase,
  '-l', 'es'
], { windowsHide: true, encoding: 'utf8', timeout: 120000 });

console.log('Status:', result.status);
console.log('Stderr:', result.stderr.substring(0, 500));

const jsonPath = `${outBase}.json`;
if (fs.existsSync(jsonPath)) {
  const transcript = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log('Segments:', (transcript.transcription || []).length);
  for (const seg of transcript.transcription || []) {
    console.log('Segment tokens:', (seg.tokens || []).length);
    for (const tok of (seg.tokens || []).slice(0, 10)) {
      console.log('  Token:', JSON.stringify(tok.text), 'offsets:', tok.offsets);
    }
  }
}