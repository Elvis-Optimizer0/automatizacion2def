const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, args, { windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr ? result.stderr.toString() : ''}`);
  }
}

function probe(filePath, entries) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', entries, '-of', 'default=noprint_wrappers=1:nokey=1', filePath
  ], { windowsHide: true });
  return result.stdout.toString().trim().split('\n');
}

function probeDuration(filePath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath
  ], { windowsHide: true });
  return parseFloat(result.stdout.toString().trim());
}

function extractFrame(video, time, imagePath) {
  runFfmpeg(['-y', '-ss', String(time), '-i', video, '-frames:v', '1', imagePath]);
}

function ssimAll(imageA, imageB) {
  const result = spawnSync(ffmpegPath, [
    '-i', imageA, '-i', imageB, '-lavfi', 'ssim', '-f', 'null', '-'
  ], { windowsHide: true });
  const text = result.stderr.toString();
  const match = text.match(/All:([0-9.]+)/);
  return match ? parseFloat(match[1]) : 1;
}

function countGreenPixels(video, time, outRaw) {
  runFfmpeg(['-y', '-ss', String(time), '-i', video, '-frames:v', '1', '-vf', 'crop=iw:ih/3:0:ih*2/3', '-f', 'rawvideo', '-pix_fmt', 'rgb24', outRaw]);
  const buffer = fs.readFileSync(outRaw);
  let green = 0;
  for (let i = 0; i + 2 < buffer.length; i += 3) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    if (g > 150 && r < 110 && b < 110) green += 1;
  }
  return green;
}

test.describe.serial('Video Maker - Phase 6 subtitles', () => {
  let electronApp;
  let page;
  let testDir;
  let image1;
  let image2;
  let audioPath;
  let baseOutput;
  let fontCopy;
  const pageErrors = [];

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-subs-'));
    image1 = path.join(testDir, 'escena1.png');
    image2 = path.join(testDir, 'escena2.png');
    audioPath = path.join(testDir, 'narration.wav');
    baseOutput = path.join(testDir, 'out.mp4');
    fontCopy = path.join(testDir, 'TestFont.ttf');

    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'gradients=s=1280x720:c0=black:c1=navy', '-frames:v', '1', image1]);
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'gradients=s=1280x720:c0=maroon:c1=black', '-frames:v', '1', image2]);
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-ar', '44100', audioPath]);
    fs.copyFileSync(path.join(__dirname, '..', '..', 'app', 'assets', 'fonts', 'Oswald-Variable.ttf'), fontCopy);

    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_TEST: '1',
        VM_TEST_OUTPUT: baseOutput,
        VM_TEST_FONT_IN: fontCopy
      }
    });
    page = await electronApp.firstWindow();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_EXPORT__ && window.__TEST_RENDER__, { timeout: 15000 });

    await page.evaluate((payload) => {
      const state = window.__TEST_STATE__;
      state.images = [
        { name: 'escena1.png', path: payload.image1, size: 0, type: 'image', preview: `file://${payload.image1}` },
        { name: 'escena2.png', path: payload.image2, size: 0, type: 'image', preview: `file://${payload.image2}` }
      ];
      state.audio.narration = { name: 'narration.wav', path: payload.audio, duration: 6 };
      state.audioDuration = 6;
      state.config.outputs = ['16:9', '9:16'];
      state.config.subtitles.enabled = true;
      state.config.subtitles.fontFamily = 'Roboto';
      state.config.subtitles.fontSizeH = 90;
      state.config.subtitles.fontSizeV = 110;
      state.config.subtitles.outlineWidth = 0;
      state.config.subtitles.textColor = '#ffffff';
      state.config.subtitles.background.enabled = false;
      state.config.subtitles.shadow.enabled = false;
      state.config.subtitles.highlight.enabled = true;
      state.config.subtitles.highlight.colors = { deuda: '#00ff00' };
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderAudio();
      window.__TEST_RENDER__.syncSubtitleControls();
      window.__TEST_RENDER__.renderOutputChips();
    }, { image1, image2, audio: audioPath });

    await page.fill('#script-textarea', [
      '[Escena 1] 0:00 - 0:03 La deuda afecta tu sueldo',
      '[Escena 2] 0:03 - 0:06 El ahorro y la deuda importan'
    ].join('\n'));
    await page.waitForTimeout(500);
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. Subtitles export in 16:9 and 9:16 matching the audio duration', async () => {
    await page.click('#export-btn');
    await page.waitForFunction(
      () => window.__TEST_STATE__.export.status.includes('Video exportado') || window.__TEST_STATE__.export.status.includes('Error'),
      null,
      { timeout: 90000 }
    );

    const output169 = baseOutput;
    const output916 = path.join(testDir, 'out_9x16.mp4');
    expect(fs.existsSync(output169)).toBe(true);
    expect(fs.existsSync(output916)).toBe(true);

    expect(Math.abs(probeDuration(output169) - 6)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(probeDuration(output916) - 6)).toBeLessThanOrEqual(0.1);

    expect(parseInt(probe(output169, 'stream=width')[0], 10)).toBe(1920);
    expect(parseInt(probe(output916, 'stream=width')[0], 10)).toBe(1080);
    expect(parseInt(probe(output916, 'stream=height')[0], 10)).toBe(1920);
    expect(pageErrors).toEqual([]);
  });

  test('2. Rendered frames prove subtitles and keyword color exist', async () => {
    const withSubs = path.join(testDir, 'withsubs.png');
    extractFrame(baseOutput, 2, withSubs);
    const green = countGreenPixels(baseOutput, 2, path.join(testDir, 'green.rgb'));
    expect(green).toBeGreaterThan(50);

    fs.copyFileSync(baseOutput, path.join(testDir, 'withsubs.mp4'));

    await page.evaluate(() => {
      window.__TEST_STATE__.config.subtitles.enabled = false;
    });
    await page.click('#export-btn');
    await page.waitForFunction(
      () => window.__TEST_STATE__.export.isRendering === false && window.__TEST_STATE__.export.status.length > 0,
      null,
      { timeout: 90000 }
    );

    const withoutSubs = path.join(testDir, 'withoutsubs.png');
    extractFrame(baseOutput, 2, withoutSubs);
    const score = ssimAll(withSubs, withoutSubs);
    expect(score).toBeLessThan(0.999);
  });

  test('3. Importing a font makes it available in the selector', async () => {
    await page.click('#import-font-btn');
    await expect
      .poll(async () => page.evaluate(() => window.api.listFonts().then(data => (data.user || []).map(f => f.family))), { timeout: 15000 })
      .toContain('Oswald');

    const options = await page.evaluate(() => [...document.getElementById('subtitle-font').options].map(o => o.value));
    expect(options).toContain('Oswald');
  });

  test('4. Presets save and re-apply the style', async () => {
    await page.evaluate(() => {
      window.__TEST_STATE__.config.subtitles.fontSizeH = 123;
      window.__TEST_RENDER__.syncSubtitleControls();
    });
    await page.fill('#preset-name-input', 'Grande');
    await page.click('#save-preset-btn');
    await expect
      .poll(async () => page.evaluate(() => window.api.listPresets().then(d => d.presets.map(p => p.name))), { timeout: 15000 })
      .toContain('Grande');

    await page.evaluate(() => {
      window.__TEST_STATE__.config.subtitles.fontSizeH = 40;
      window.__TEST_RENDER__.syncSubtitleControls();
    });
    await page.selectOption('#preset-select', 'Grande');

    const applied = await page.evaluate(() => window.__TEST_STATE__.config.subtitles.fontSizeH);
    expect(applied).toBe(123);
  });
});
