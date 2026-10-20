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

function countGreenPixels(video, time, outRaw) {
  runFfmpeg(['-y', '-ss', String(time), '-i', video, '-frames:v', '1', '-vf', 'crop=iw:ih/3:0:ih*2/3', '-f', 'rawvideo', '-pix_fmt', 'rgb24', outRaw]);
  const buffer = fs.readFileSync(outRaw);
  let green = 0;
  for (let i = 0; i + 2 < buffer.length; i += 3) {
    if (buffer[i + 1] > 150 && buffer[i] < 110 && buffer[i + 2] < 110) green += 1;
  }
  return green;
}

test.describe.serial('Video Maker - Phase 7 keyword proposals', () => {
  let electronApp;
  let page;
  let testDir;
  let audioPath;
  let outputPath;
  const pageErrors = [];

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-keywords-'));
    outputPath = path.join(testDir, 'out.mp4');
    audioPath = path.join(testDir, 'narration.wav');

    const images = [];
    for (let i = 1; i <= 4; i += 1) {
      const imagePath = path.join(testDir, `escena${i}.png`);
      runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720', '-frames:v', '1', imagePath]);
      images.push(imagePath);
    }
    runFfmpeg([
      '-y',
      '-f', 'lavfi', '-t', '1.5', '-i', 'anullsrc=r=44100:cl=mono',
      '-f', 'lavfi', '-t', '12', '-i', 'sine=frequency=440',
      '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[a]',
      '-map', '[a]',
      audioPath
    ]);

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath }
    });
    page = await electronApp.firstWindow();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });

    await page.evaluate((payload) => {
      const state = window.__TEST_STATE__;
      state.images = payload.images.map((imagePath, index) => ({
        name: `escena${index + 1}.png`,
        path: imagePath,
        size: 0,
        type: 'image',
        preview: `file://${imagePath}`
      }));
      state.audio.narration = { name: 'narration.wav', path: payload.audio, duration: 13.5 };
      state.audioDuration = 13.5;
      state.config.outputs = ['16:9'];
      state.config.subtitles.enabled = true;
      state.config.subtitles.fontFamily = 'Roboto';
      state.config.subtitles.fontSizeH = 72;
      state.config.subtitles.textColor = '#ffffff';
      state.config.subtitles.outlineWidth = 0;
      state.config.subtitles.background.enabled = false;
      state.config.subtitles.shadow.enabled = false;
      state.config.subtitles.autoVoiceStart = true;
      state.config.subtitles.delay = 0;
      state.config.subtitles.highlight.enabled = true;
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderAudio();
      window.__TEST_RENDER__.syncSubtitleControls();
      window.__TEST_RENDER__.renderOutputChips();
    }, { images, audio: audioPath });

    await page.fill('#script-textarea', [
      '[Escena 1] 0:00 - 0:03 El presupuesto familiar manda',
      '[Escena 2] 0:03 - 0:06 La tasa de interés sube',
      '[Escena 3] 0:06 - 0:09 El presupuesto crece mucho',
      '[Escena 4] 0:09 - 0:12 Controlar el presupuesto y la tasa de interés'
    ].join('\n'));
    await page.waitForTimeout(500);
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. Whole-script proposals surface real words and highlight with a pixel check', async () => {
    await page.click('#detect-keywords-btn');

    const row = page.locator('.keyword-row', { hasText: 'presupuesto' }).first();
    await expect(row).toBeVisible();
    const termText = await row.locator('.keyword-term').textContent();
    expect(termText.trim()).toBe('presupuesto');

    const rows = page.locator('.keyword-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    await row.locator('input[type="color"]').evaluate(el => {
      el.value = '#00ff00';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.click('#export-btn');
    await page.waitForFunction(
      () => window.__TEST_STATE__.export.status.includes('Video exportado') || window.__TEST_STATE__.export.status.includes('Error'),
      null,
      { timeout: 90000 }
    );
    expect(fs.existsSync(outputPath)).toBe(true);

    const green = countGreenPixels(outputPath, 2.2, path.join(testDir, 'green.rgb'));
    expect(green).toBeGreaterThan(30);
    expect(pageErrors).toEqual([]);
  });
});
