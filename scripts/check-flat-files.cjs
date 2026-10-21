const fs = require('fs');
const path = require('path');

const modelsDir = path.join(process.env.APPDATA, 'video-maker', 'models');

const files = [
  'kokoro-v1.0.onnx',
  'voices-v1.0.bin',
  'ggml-base.bin'
];

files.forEach(f => {
  const flatPath = path.join(modelsDir, f);
  const kokoroPath = path.join(modelsDir, 'kokoro', f);
  const whisperPath = path.join(modelsDir, 'whisper', f);
  
  console.log(`\n${f}:`);
  console.log(`  Flat: ${flatPath} - Exists: ${fs.existsSync(flatPath)} ${fs.existsSync(flatPath) ? ', size: ' + fs.statSync(flatPath).size + ', isFile: ' + fs.statSync(flatPath).isFile() : ''}`);
  console.log(`  Kokoro: ${kokoroPath} - Exists: ${fs.existsSync(kokoroPath)} ${fs.existsSync(kokoroPath) ? ', size: ' + fs.statSync(kokoroPath).size + ', isFile: ' + fs.statSync(kokoroPath).isFile() : ''}`);
  console.log(`  Whisper: ${whisperPath} - Exists: ${fs.existsSync(whisperPath)} ${fs.existsSync(whisperPath) ? ', size: ' + fs.statSync(whisperPath).size + ', isFile: ' + fs.statSync(whisperPath).isFile() : ''}`);
});