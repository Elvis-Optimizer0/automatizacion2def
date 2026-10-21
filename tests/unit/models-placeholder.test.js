const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { 
  listModels, 
  cleanupPlaceholderFiles, 
  getModelsDir, 
  importModel,
  MODEL_CATALOG 
} = require('../../app/core/models.js');

test.describe('Model placeholder cleanup and resolution', () => {
  let testDir;
  let userDataDir;
  let modelsDir;

  test.beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-model-test-'));
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-model-userdata-'));
    modelsDir = getModelsDir(userDataDir);
  });

  test.afterEach(() => {
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    if (userDataDir && fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test('cleanupPlaceholderFiles removes 4096-byte placeholder files for large models', () => {
    const kokoroDir = path.join(modelsDir, 'kokoro');
    fs.mkdirSync(kokoroDir, { recursive: true });
    
    const onnxPlaceholder = path.join(kokoroDir, 'kokoro-v1.0.onnx');
    fs.writeFileSync(onnxPlaceholder, Buffer.alloc(4096, 0x00));
    
    const voicesPath = path.join(modelsDir, 'voices-v1.0.bin');
    fs.writeFileSync(voicesPath, Buffer.alloc(28214398, 0x42));
    
    cleanupPlaceholderFiles(modelsDir, MODEL_CATALOG);
    
    expect(fs.existsSync(onnxPlaceholder)).toBe(false);
    const backups = fs.readdirSync(kokoroDir).filter(f => f.includes('.placeholder.'));
    expect(backups.length).toBe(1);
    
    expect(fs.existsSync(voicesPath)).toBe(true);
  });

  test('cleanupPlaceholderFiles does not remove valid files', () => {
    const kokoroDir = path.join(modelsDir, 'kokoro');
    fs.mkdirSync(kokoroDir, { recursive: true });
    
    const onnxValid = path.join(kokoroDir, 'kokoro-v1.0.onnx');
    fs.writeFileSync(onnxValid, Buffer.alloc(325505369, 0x41));
    
    cleanupPlaceholderFiles(modelsDir, MODEL_CATALOG);
    
    expect(fs.existsSync(onnxValid)).toBe(true);
    const backups = fs.readdirSync(kokoroDir).filter(f => f.includes('.placeholder.'));
    expect(backups.length).toBe(0);
  });

  test('cleanupPlaceholderFiles does not remove small expected files', () => {
    const kokoroDir = path.join(modelsDir, 'kokoro');
    fs.mkdirSync(kokoroDir, { recursive: true });
    
    const smallFile = path.join(kokoroDir, 'small-config.json');
    fs.writeFileSync(smallFile, Buffer.from('{}'));
    
    cleanupPlaceholderFiles(modelsDir, MODEL_CATALOG);
    
    expect(fs.existsSync(smallFile)).toBe(true);
  });

  test('listModels resolves correct file after placeholder cleanup', () => {
    const kokoroDir = path.join(modelsDir, 'kokoro');
    fs.mkdirSync(kokoroDir, { recursive: true });
    
    const onnxPlaceholder = path.join(kokoroDir, 'kokoro-v1.0.onnx');
    fs.writeFileSync(onnxPlaceholder, Buffer.alloc(4096, 0x00));
    
    const onnxValid = path.join(modelsDir, 'kokoro-v1.0.onnx');
    fs.writeFileSync(onnxValid, Buffer.alloc(325505369, 0x41));
    
    const voicesValid = path.join(modelsDir, 'voices-v1.0.bin');
    fs.writeFileSync(voicesValid, Buffer.alloc(28214398, 0x42));
    
    const models = listModels(modelsDir, MODEL_CATALOG);
    const kokoro = models.find(m => m.id === 'kokoro');
    
    const onnxFile = kokoro.files.find(f => f.fileName === 'kokoro-v1.0.onnx');
    expect(onnxFile.exists).toBe(true);
    expect(onnxFile.size).toBe(325505369);
    expect(onnxFile.sizeMatches).toBe(true);
    expect(onnxFile.path).toBe(onnxValid);
    
    // Model should be installed (files exist in userData)
    expect(kokoro.installed).toBe(true);
  });

  test('importModel writes file to correct location (per-model dir), not creating placeholder', () => {
    const sourceOnnx = path.join(testDir, 'kokoro-v1.0.onnx');
    fs.writeFileSync(sourceOnnx, Buffer.alloc(325505369, 0x41));
    
    const result = importModel(sourceOnnx, modelsDir, MODEL_CATALOG);
    
    const destPath = path.join(modelsDir, 'kokoro', 'kokoro-v1.0.onnx');
    expect(fs.existsSync(destPath)).toBe(true);
    expect(fs.statSync(destPath).size).toBe(325505369);
    expect(result.path).toBe(destPath);
    expect(result.verification.sizeMatches).toBe(true);
  });

  test('listModels with vendor fallback finds verified files in vendor', () => {
    const vendorDir = path.join(testDir, 'vendor');
    const kokoroVendorDir = path.join(vendorDir, 'kokoro', 'models');
    fs.mkdirSync(kokoroVendorDir, { recursive: true });
    
    // Create file with correct size and SHA256 to pass verification
    // For this test, we use a catalog without SHA256 to test size-based verification
    const testCatalog = MODEL_CATALOG.map(m => ({
      ...m,
      files: m.files.map(f => ({ ...f, sha256: null }))
    }));
    
    const vendorOnnx = path.join(kokoroVendorDir, 'kokoro-v1.0.onnx');
    fs.writeFileSync(vendorOnnx, Buffer.alloc(325505369, 0x41));
    
    const vendorWhisperDir = path.join(vendorDir, 'whisper', 'models');
    fs.mkdirSync(vendorWhisperDir, { recursive: true });
    const vendorWhisper = path.join(vendorWhisperDir, 'ggml-base.bin');
    fs.writeFileSync(vendorWhisper, Buffer.alloc(147951465, 0x43));
    
    const models = listModels(modelsDir, testCatalog, vendorDir);
    
    const kokoro = models.find(m => m.id === 'kokoro');
    const whisper = models.find(m => m.id === 'whisper');
    
    // Files should be verified (size matches) even though not installed in userData
    expect(kokoro.files.find(f => f.fileName === 'kokoro-v1.0.onnx').verified).toBe(true);
    expect(whisper.files.find(f => f.fileName === 'ggml-base.bin').verified).toBe(true);
    expect(kokoro.files.find(f => f.fileName === 'kokoro-v1.0.onnx').path).toBe(vendorOnnx);
    expect(whisper.files.find(f => f.fileName === 'ggml-base.bin').path).toBe(vendorWhisper);
    
    // Model not installed (no userData files)
    expect(kokoro.installed).toBe(false);
    expect(whisper.installed).toBe(false);
  });
});