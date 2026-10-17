const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ffmpegPath = require('ffmpeg-static');

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, args, { windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr ? result.stderr.toString() : ''}`);
  }
}

async function waitForTestExports(page) {
  await page.waitForFunction(
    () => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__TEST_EXPORT__ && window.__TEST_CONTROLS__,
    { timeout: 15000 }
  );
}

const DIALOG_OR_RENDER_CONTROLS = new Set([
  'import-images-btn', 'import-audio-btn', 'import-music-btn',
  'paste-script-btn', 'load-script-btn', 'save-project-btn', 'open-project-btn',
  'export-btn', 'open-output-folder-btn',
  'import-font-btn', 'preview-btn',
  'images-drop-zone', 'audio-narration-drop', 'audio-music-drop', 'focus-editor'
]);

test.describe.serial('Video Maker - Phase 5 Controls', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePath;
  let audioPath;
  const pageErrors = [];

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-controls-'));
    imagePath = path.join(testDir, 'escena1.png');
    runFfmpeg([
      '-y', '-f', 'lavfi',
      '-i', 'gradients=s=640x480:c0=red:c1=blue:x0=0:y0=0:x1=640:y1=480',
      '-frames:v', '1', imagePath
    ]);
    audioPath = path.join(testDir, 'narration.wav');
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-ar', '44100', audioPath]);

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1' }
    });
    page = await electronApp.firstWindow();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.waitForLoadState('domcontentloaded');
    await waitForTestExports(page);

    await page.evaluate((payload) => {
      window.__TEST_STATE__.images = [{
        name: 'escena1.png', path: payload.image, size: 0, type: 'image', preview: `file://${payload.image}`
      }];
      window.__TEST_STATE__.audio.narration = { name: 'narration.wav', path: payload.audio, duration: 8 };
      window.__TEST_STATE__.audioDuration = 8;
      window.__TEST_STATE__.focus.imageIndex = 0;
      window.__TEST_STATE__.focus.format = '16:9';
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderAudio();
      window.__TEST_RENDER__.renderFocusEditor();
    }, { image: imagePath, audio: audioPath });
    await page.waitForTimeout(300);
    await page.fill('#script-textarea', '[Escena 1] 0:00 - 0:04 Uno\n[Escena 2] 0:04 - 0:08 Dos');
    await page.waitForTimeout(400);
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. Every interactive control is registered in CONTROLS with a handler', async () => {
    const controls = await page.evaluate(() => window.__TEST_CONTROLS__);
    const controlIds = controls.map(control => control.id);

    const domIds = await page.evaluate(() => {
      const ids = [];
      document.querySelectorAll('button[id], select[id], textarea[id]').forEach(el => ids.push(el.id));
      document.querySelectorAll('input[id]').forEach(el => {
        if (!el.readOnly && el.type !== 'file') ids.push(el.id);
      });
      ['images-drop-zone', 'audio-narration-drop', 'audio-music-drop', 'focus-editor'].forEach(id => {
        if (document.getElementById(id)) ids.push(id);
      });
      return [...new Set(ids)];
    });

    expect(domIds.length).toBeGreaterThan(20);
    for (const id of domIds) {
      expect(controlIds, `control "${id}" missing from CONTROLS`).toContain(id);
    }
    for (const control of controls) {
      expect(domIds, `CONTROLS entry "${control.id}" has no DOM element`).toContain(control.id);
      expect(control.hasHandler, `control "${control.id}" has no handler`).toBe(true);
    }
  });

  test('2. Every non-dialog control responds to user interaction without errors', async () => {
    const controls = await page.evaluate(() => window.__TEST_CONTROLS__);
    const exercised = [];

    for (const control of controls) {
      if (DIALOG_OR_RENDER_CONTROLS.has(control.id)) continue;
      const locator = page.locator(`#${control.id}`);
      const info = await locator.evaluate(el => ({ tag: el.tagName.toLowerCase(), type: el.type || '' }));

      if (info.tag === 'button') {
        await locator.click();
      } else if (info.tag === 'select') {
        const values = await locator.evaluate(el => [...el.options].map(option => option.value));
        if (values.length > 1) {
          await locator.selectOption(values[1]);
          await locator.selectOption(values[0]);
        }
      } else if (info.tag === 'textarea') {
        await locator.fill('[Escena 1] 0:00 - 0:04 Uno\n[Escena 2] 0:04 - 0:08 Dos');
      } else if (info.type === 'checkbox') {
        await locator.click();
      } else {
        await locator.evaluate(el => {
          const value = el.type === 'color' ? '#112233' : (el.min !== '' ? el.min : '0.5');
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      exercised.push(control.id);
    }

    expect(exercised.length).toBeGreaterThan(25);
    expect(pageErrors).toEqual([]);
  });

  test('3. Key controls are wired to state through clicks', async () => {
    await page.selectOption('#zoom-type', 'panLeft');
    await page.selectOption('#transition-mode', 'random');
    await page.setChecked('#badge-enabled', true);
    await page.setChecked('#progress-bar-enabled', true);
    await page.evaluate(() => {
      window.__TEST_STATE__.focus.imageIndex = 0;
      window.__TEST_STATE__.focus.format = '16:9';
      window.__TEST_RENDER__.renderFocusEditor();
    });
    await page.fill('#focus-scale', '0.75');
    await page.waitForTimeout(100);
    await page.locator('.timeline-zoom-select[data-index="0"]').selectOption('zoomIn');
    await page.click('#apply-scene-settings-btn');
    await page.waitForTimeout(200);

    const state = await page.evaluate(() => ({
      zoomType: window.__TEST_STATE__.exportOptions.zoomType,
      transitionMode: window.__TEST_STATE__.exportOptions.transitionMode,
      badgeEnabled: window.__TEST_STATE__.config.extras.badge.enabled,
      progressEnabled: window.__TEST_STATE__.config.extras.progressBar.enabled,
      scale: window.__TEST_STATE__.images[0].focus169.scale,
      sceneZooms: window.__TEST_STATE__.timeline.map(scene => (scene.zoom ? scene.zoom.type : null))
    }));

    expect(state.zoomType).toBe('panLeft');
    expect(state.transitionMode).toBe('random');
    expect(state.badgeEnabled).toBe(true);
    expect(state.progressEnabled).toBe(true);
    expect(state.scale).toBe(0.75);
    expect(state.sceneZooms).toEqual(['zoomIn', 'zoomIn']);
  });
});
