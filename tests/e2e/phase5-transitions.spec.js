const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { TRANSITION_TYPES } = require('../../app/core/ffmpeg-helpers.js');

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, args, { windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr ? result.stderr.toString() : ''}`);
  }
}

function generatePng(filePath, color) {
  runFfmpeg(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=640x480`, '-frames:v', '1', filePath]);
}

function generateWav(filePath, durationSec = 6) {
  runFfmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`, '-ar', '44100', filePath]);
}

function videoSize(filePath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,width,height',
    '-show_entries', 'format=duration',
    '-of', 'json', filePath
  ], { windowsHide: true });
  const info = JSON.parse(result.stdout.toString());
  const video = info.streams.find(s => s.codec_type === 'video');
  return { width: video.width, height: video.height, duration: parseFloat(info.format.duration) };
}

async function waitForTestExports(page) {
  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });
}

async function exportAndWait(page) {
  await page.evaluate(() => {
    const status = document.getElementById('export-status');
    if (status) status.textContent = '';
  });
  await page.click('#export-btn');
  await page.waitForFunction(() => {
    const status = document.getElementById('export-status');
    return status && (status.textContent.startsWith('Video exportado') || status.textContent.startsWith('Error'));
  }, { timeout: 55000 });
  const status = await page.locator('#export-status').textContent();
  expect(status).toContain('Video exportado');
}

test.describe.serial('Video Maker - Phase 5 Transition catalog', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePaths;
  let audioPath;
  let outputPath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-trans-'));
    imagePaths = [path.join(testDir, 'escena1.png'), path.join(testDir, 'escena2.png')];
    generatePng(imagePaths[0], 'red');
    generatePng(imagePaths[1], 'green');
    audioPath = path.join(testDir, 'narration.wav');
    generateWav(audioPath, 6);
    outputPath = path.join(testDir, 'exported.mp4');

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath }
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await waitForTestExports(page);
    await page.waitForTimeout(500);
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. Import two images and build a two-scene timeline', async () => {
    const imagePayload = imagePaths.map(p => ({ name: path.basename(p), path: p }));
    await page.evaluate((payload) => {
      window.__TEST_STATE__.images = payload.images.map((img) => ({
        name: img.name,
        path: img.path,
        size: 0,
        type: 'image',
        preview: `file://${img.path}`
      }));
      window.__TEST_STATE__.audio.narration = { name: 'narration.wav', path: payload.audio, duration: 6 };
      window.__TEST_STATE__.audioDuration = 6;
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderAudio();
      window.__TEST_RENDER__.renderFocusEditor();
    }, { images: imagePayload, audio: audioPath });
    await page.waitForTimeout(300);

    const script = `[Escena 1] 0:00 - 0:03 Primera
[Escena 2] 0:03 - 0:06 Segunda`;
    await page.fill('#script-textarea', script);
    await page.waitForTimeout(500);
    await page.check('#adjust-timeline-checkbox');
    await page.waitForTimeout(500);

    await expect(page.locator('#timeline-tbody tr')).toHaveCount(2);
  });

  test('2. Transition type, mode and seed are selectable', async () => {
    await page.selectOption('#transition-type', 'slideUp');
    await page.selectOption('#transition-mode', 'random');
    await page.fill('#transition-seed', '2024');
    await page.waitForTimeout(100);

    const options = await page.evaluate(() => ({ ...window.__TEST_STATE__.exportOptions }));
    expect(options.transitionType).toBe('slideUp');
    expect(options.transitionMode).toBe('random');
    expect(options.transitionSeed).toBe(2024);

    await page.selectOption('#transition-mode', 'fixed');
  });

  test('3. Every transition exports a valid video matching the audio duration', async () => {
    test.setTimeout(300000);
    await page.evaluate(() => {
      window.__TEST_STATE__.config.outputs = ['16:9'];
      window.__TEST_STATE__.config.fitMode = 'cover';
      window.__TEST_RENDER__.renderOutputChips();
    });
    await page.waitForTimeout(150);

    for (const type of TRANSITION_TYPES) {
      await page.selectOption('#transition-type', type);
      await page.waitForTimeout(80);
      await exportAndWait(page);

      const size = videoSize(outputPath);
      expect(size.width, `transition ${type}`).toBe(1920);
      expect(size.height, `transition ${type}`).toBe(1080);
      expect(Math.abs(size.duration - 6), `transition ${type}`).toBeLessThanOrEqual(0.1);
    }
  });
});
