const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

test.describe('Video Maker - Launch', () => {
  let electronApp;
  let page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    page = await electronApp.firstWindow();

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
    }
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('window title contains version', async () => {
    const title = await page.title();
    expect(title).toContain('v0.7.2');
  });

  test('window.api is exposed', async () => {
    const apiExists = await page.evaluate(() => {
      return typeof window.api !== 'undefined' &&
             typeof window.api.openImages === 'function' &&
             typeof window.api.openAudio === 'function' &&
             typeof window.api.openMusic === 'function' &&
             typeof window.api.openScript === 'function' &&
             typeof window.api.getAudioDuration === 'function' &&
             typeof window.api.getPathForFile === 'function';
    });
    expect(apiExists).toBe(true);
  });

  test('import images button is visible', async () => {
    const importBtn = page.locator('#import-images-btn');
    await expect(importBtn).toBeVisible();
    await expect(importBtn).toContainText('Seleccionar imágenes');
  });

  test('images drop zone is visible', async () => {
    const dropZone = page.locator('#images-drop-zone');
    await expect(dropZone).toBeVisible();
    await expect(dropZone).toContainText('Arrastra imágenes aquí');
  });

  test('audio narration input is visible', async () => {
    const narrationInput = page.locator('#audio-narration');
    await expect(narrationInput).toBeVisible();
  });

  test('audio music input is visible', async () => {
    const musicInput = page.locator('#audio-music');
    await expect(musicInput).toBeVisible();
  });

  test('script textarea is visible', async () => {
    const scriptTextarea = page.locator('#script-textarea');
    await expect(scriptTextarea).toBeVisible();
  });

  test('paste script button is visible', async () => {
    const pasteBtn = page.locator('#paste-script-btn');
    await expect(pasteBtn).toBeVisible();
    await expect(pasteBtn).toContainText('Pegar del portapapeles');
  });

  test('load script button is visible', async () => {
    const loadBtn = page.locator('#load-script-btn');
    await expect(loadBtn).toBeVisible();
    await expect(loadBtn).toContainText('Cargar .txt');
  });

  test('timeline empty state is visible', async () => {
    const emptyState = page.locator('#timeline-empty');
    await expect(emptyState).toBeAttached();
    await expect(emptyState).toContainText('Carga un guion e imágenes');
  });

  test('adjust timeline checkbox is visible', async () => {
    const checkbox = page.locator('#adjust-timeline-checkbox');
    await expect(checkbox).toBeVisible();
  });

  test('no console errors on load', async () => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(500);

    expect(consoleErrors).toHaveLength(0);
  });
});