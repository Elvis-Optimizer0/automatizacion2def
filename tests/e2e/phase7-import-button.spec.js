const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

test.describe.serial('Video Maker - Phase 7 import button wiring', () => {
  let electronApp;
  let page;
  let testDir;
  let userDataDir;
  let modelFile;
  const pageErrors = [];

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-import-btn-'));
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-import-userdata-'));
    modelFile = path.join(testDir, 'ggml-base.bin');
    fs.writeFileSync(modelFile, Buffer.alloc(64, 0x43));

    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_TEST: '1',
        VM_USE_DIST: '1',
        VM_TEST_USERDATA: userDataDir,
        VM_TEST_MODEL_IN: modelFile
      }
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

  test('1. Clicking the Importar button (dialog simulated by env) imports without a type error', async () => {
    await page.click('#models-import-btn');

    await page.waitForFunction(
      () => document.getElementById('models-list').textContent.includes('ggml-base.bin'),
      null,
      { timeout: 15000 }
    );

    const info = await page.evaluate(() => window.api.listModels());
    const whisper = info.models.find(model => model.id === 'whisper');
    expect(whisper.installed).toBe(true);
    expect(fs.existsSync(path.join(info.dir, 'whisper', 'ggml-base.bin'))).toBe(true);

    const statusText = await page.textContent('#models-status');
    expect(statusText).not.toContain('path');
    expect(pageErrors).toEqual([]);
  });

  test('2. Clicking Descargar does not throw and keeps the imported model listed', async () => {
    await page.click('#models-download-btn');

    await page.waitForFunction(
      () => !document.getElementById('models-download-btn').disabled,
      null,
      { timeout: 15000 }
    );

    const listText = await page.textContent('#models-list');
    expect(listText).toContain('ggml-base.bin');
    const statusText = await page.textContent('#models-status');
    expect(statusText).not.toContain('path');
    expect(pageErrors).toEqual([]);
  });
});
