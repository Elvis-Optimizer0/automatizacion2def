const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

test.describe.serial('Video Maker - Phase 7 model import', () => {
  let electronApp;
  let page;
  let testDir;
  let userDataDir;
  let onnxPath;
  let voicesPath;
  let modelsDir;
  const pageErrors = [];

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-models-e2e-'));
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-models-userdata-'));
    // Create small test files (will mismatch catalog sizes, so they'll be ignored in favor of vendor)
    onnxPath = path.join(testDir, 'kokoro-v1.0.onnx');
    voicesPath = path.join(testDir, 'voices-v1.0.bin');
    fs.writeFileSync(onnxPath, Buffer.alloc(64, 0x41));
    fs.writeFileSync(voicesPath, Buffer.alloc(64, 0x42));

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_USERDATA: userDataDir }
    });
    page = await electronApp.firstWindow();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__, { timeout: 15000 });
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    if (userDataDir && fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test('1. Importing first kokoro file - userData file ignored (wrong size), vendor file used', async () => {
    await page.evaluate((filePath) => window.__TEST_RENDER__.handleImportModel(filePath), onnxPath);

    await page.waitForFunction(
      () => document.getElementById('models-list').textContent.includes('kokoro-v1.0.onnx'),
      null,
      { timeout: 15000 }
    );

    const info = await page.evaluate(() => window.api.listModels());
    modelsDir = info.dir;
    const kokoro = info.models.find(model => model.id === 'kokoro');
    // Model is complete (vendor has both files with correct sizes)
    expect(kokoro.complete).toBe(true);
    // First file: userData has wrong size, so vendor file is used -> verified
    const onnxFile = kokoro.files.find(f => f.fileName === 'kokoro-v1.0.onnx');
    expect(onnxFile.exists).toBe(true);
    expect(onnxFile.verified).toBe(true);
    expect(onnxFile.status).toBe('ok');
    // Second file is from vendor with correct size -> verified
    const voicesFile = kokoro.files.find(f => f.fileName === 'voices-v1.0.bin');
    expect(voicesFile.exists).toBe(true);
    expect(voicesFile.verified).toBe(true);
    expect(voicesFile.status).toBe('ok');
    expect(fs.existsSync(path.join(modelsDir, 'kokoro', 'kokoro-v1.0.onnx'))).toBe(true);
  });

  test('2. Importing second file - both userData files exist but wrong size, vendor still used', async () => {
    await page.evaluate((filePath) => window.__TEST_RENDER__.handleImportModel(filePath), voicesPath);

    await page.waitForFunction(
      () => document.getElementById('models-list').textContent.includes('voices-v1.0.bin'),
      null,
      { timeout: 15000 }
    );

    const info = await page.evaluate(() => window.api.listModels());
    const kokoro = info.models.find(model => model.id === 'kokoro');
    // Model still complete
    expect(kokoro.complete).toBe(true);
    // Both files from vendor (userData files have wrong size)
    const onnxFile = kokoro.files.find(f => f.fileName === 'kokoro-v1.0.onnx');
    const voicesFile = kokoro.files.find(f => f.fileName === 'voices-v1.0.bin');
    expect(onnxFile.verified).toBe(true);
    expect(voicesFile.verified).toBe(true);
    expect(fs.existsSync(path.join(modelsDir, 'kokoro', 'voices-v1.0.bin'))).toBe(true);

    const listText = await page.textContent('#models-list');
    expect(listText).toContain('kokoro-v1.0.onnx');
    expect(listText).toContain('voices-v1.0.bin');
  });

  test('3. Voice selector is refreshed and populated after import', async () => {
    const count = await page.locator('#voice-select option').count();
    expect(count).toBeGreaterThan(0);

    const selected = await page.inputValue('#voice-select');
    expect(selected.length).toBeGreaterThan(0);

    const voicesInfo = await page.evaluate(() => window.api.listVoices());
    expect(voicesInfo.modelsDir).toBe(modelsDir);
    expect(voicesInfo.voices.every(voice => 'available' in voice)).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
