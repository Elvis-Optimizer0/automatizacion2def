const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

function probeDuration(filePath) {
  const { spawnSync } = require('child_process');
  const ffprobePath = require('ffprobe-static').path;
  const result = spawnSync(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath
  ], { windowsHide: true });
  return parseFloat(result.stdout.toString().trim());
}

(async () => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-piper-smoke-'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-piper-userdata-'));
  
  const modelDir = path.join(__dirname, '..', 'vendor', 'piper', 'models');
  const modelsDir = path.join(userDataDir, 'models', 'piper');
  fs.mkdirSync(modelsDir, { recursive: true });
  
  // Copy piper models
  fs.copyFileSync(path.join(modelDir, 'es_MX-ald-medium.onnx'), path.join(modelsDir, 'es_MX-ald-medium.onnx'));
  fs.copyFileSync(path.join(modelDir, 'es_MX-ald-medium.onnx.json'), path.join(modelsDir, 'es_MX-ald-medium.onnx.json'));
  fs.copyFileSync(path.join(modelDir, 'es_ES-carlfm-x_low.onnx'), path.join(modelsDir, 'es_ES-carlfm-x_low.onnx'));
  fs.copyFileSync(path.join(modelDir, 'es_ES-carlfm-x_low.onnx.json'), path.join(modelsDir, 'es_ES-carlfm-x_low.onnx.json'));
  fs.copyFileSync(path.join(modelDir, 'en_US-lessac-medium.onnx'), path.join(modelsDir, 'en_US-lessac-medium.onnx'));
  fs.copyFileSync(path.join(modelDir, 'en_US-lessac-medium.onnx.json'), path.join(modelsDir, 'en_US-lessac-medium.onnx.json'));

  console.log('Models copied to:', modelsDir);

  const app = await electron.launch({ 
    args: ['.'], 
    env: { 
      ...process.env, 
      NODE_ENV: 'test', 
      ELECTRON_TEST: '1',
      VM_TEST_USERDATA: userDataDir 
    } 
  });
  
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__, { timeout: 15000 });

  // Set up Piper engine
  await window.evaluate(() => {
    window.__TEST_STATE__.config.voice.engine = 'piper';
    window.__TEST_STATE__.config.voice.voiceId = 'es_MX-ald-medium';
    window.__TEST_STATE__.config.outputs = ['16:9'];
    window.__TEST_RENDER__.renderAll();
  });

  // Generate voice
  const outputPath = path.join(testDir, 'piper_output.wav');
  await window.fill('#voice-text', 'Hola mundo, esta es una prueba de voz con Piper.');
  await window.selectOption('#voice-engine', 'piper');
  await window.waitForTimeout(500);
  await window.click('#voice-generate-btn');

  // Wait for generation to complete
  await window.waitForFunction(() => window.__TEST_STATE__.audio.narration, { timeout: 60000 });

  const narration = await window.evaluate(() => window.__TEST_STATE__.audio.narration);
  console.log('Narration generated:', narration);
  
  if (narration && narration.path && fs.existsSync(narration.path)) {
    const duration = probeDuration(narration.path);
    console.log('Audio duration:', duration, 'seconds');
    if (duration > 0) {
      console.log('SUCCESS: Piper voice generation works! Duration:', duration);
    } else {
      console.log('FAIL: Audio duration is 0');
    }
  } else {
    console.log('FAIL: No audio file generated');
  }

  await app.close();
  
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });
  
  console.log('Test completed');
})();