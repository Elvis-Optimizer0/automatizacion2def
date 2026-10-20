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
    onnxPath = path.join(testDir, 'kokoro-v1.0.onnx');
    voicesPath = path.join(testDir, 'voices-v1.0.bin');
    fs.writeFileSync(onnxPath, Buffer.alloc(64, 0x41));
    fs.writeFileSync(voicesPath, Buffer.alloc(64, 0x42));

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST: '1', VM_TEST_USERDATA: userDataDir }
    });
    page = await electronApp.firstWindow();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    if (userDataDir && fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test('1. First kokoro file leaves the model incomplete and shows the missing file', async () => {
    await page.evaluate((filePath) => window.__TEST_RENDER__.handleImportModel(filePath), onnxPath);

    await page.waitForFunction(
      () => document.getElementById('models-list').textContent.includes('kokoro-v1.0.onnx'),
      null,
      { timeout: 15000 }
    );

    const info = await page.evaluate(() => window.api.listModels());
    modelsDir = info.dir;
    const kokoro = info.models.find(model => model.id === 'kokoro');
    expect(kokoro.installed).toBe(false);
    expect(kokoro.missingFiles).toEqual(['voices-v1.0.bin']);
    expect(fs.existsSync(path.join(modelsDir, 'kokoro', 'kokoro-v1.0.onnx'))).toBe(true);

    const listText = await page.textContent('#models-list');
    expect(listText).toContain('falta voices-v1.0.bin');
    const statusText = await page.textContent('#models-status');
    expect(statusText).toContain('voices-v1.0.bin');
  });

  test('2. Importing both files marks the model installed in the UI', async () => {
    await page.evaluate((filePath) => window.__TEST_RENDER__.handleImportModel(filePath), voicesPath);

    await page.waitForFunction(
      () => !(document.getElementById('models-list').textContent || '').includes('falta voices-v1.0.bin'),
      null,
      { timeout: 15000 }
    );

    const info = await page.evaluate(() => window.api.listModels());
    const kokoro = info.models.find(model => model.id === 'kokoro');
    expect(kokoro.installed).toBe(true);
    expect(kokoro.complete).toBe(true);
    expect(kokoro.missingFiles).toEqual([]);
    expect(kokoro.files.map(file => file.fileName)).toEqual(['kokoro-v1.0.onnx', 'voices-v1.0.bin']);
    expect(fs.existsSync(path.join(modelsDir, 'kokoro', 'voices-v1.0.bin'))).toBe(true);

    const listText = await page.textContent('#models-list');
    expect(listText).toContain('kokoro-v1.0.onnx');
    expect(listText).toContain('voices-v1.0.bin');
    expect(listText).toContain('Instalado');
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
