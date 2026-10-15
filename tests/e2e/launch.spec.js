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
    expect(title).toContain('v0.1.0');
  });

  test('window.api is exposed', async () => {
    const apiExists = await page.evaluate(() => {
      return typeof window.api !== 'undefined' &&
             typeof window.api.openImages === 'function' &&
             typeof window.api.getPathForFile === 'function';
    });
    expect(apiExists).toBe(true);
  });

  test('import button is visible', async () => {
    const importBtn = page.locator('#import-btn');
    await expect(importBtn).toBeVisible();
    await expect(importBtn).toContainText('Seleccionar imágenes');
  });

  test('drop zone is visible', async () => {
    const dropZone = page.locator('#drop-zone');
    await expect(dropZone).toBeVisible();
    await expect(dropZone).toContainText('Arrastra imágenes aquí');
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