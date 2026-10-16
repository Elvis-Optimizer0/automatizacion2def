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

function generateGradientPng(filePath) {
  runFfmpeg([
    '-y', '-f', 'lavfi',
    '-i', 'gradients=s=640x480:c0=red:c1=blue:x0=0:y0=0:x1=640:y1=480',
    '-frames:v', '1', filePath
  ]);
}

function generateWav(filePath, durationSec = 4) {
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

function extractFrame(videoPath, outPath, atSec) {
  runFfmpeg(['-y', '-ss', String(atSec), '-i', videoPath, '-frames:v', '1', outPath]);
}

function readPixel(videoPath, x, y) {
  const raw = `${videoPath}.px`;
  runFfmpeg(['-y', '-ss', '2', '-i', videoPath, '-vf', `crop=2:2:${x}:${y},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  const bytes = fs.readFileSync(raw);
  const pixel = { r: bytes[0], g: bytes[1], b: bytes[2] };
  fs.rmSync(raw, { force: true });
  return pixel;
}

function frameSsim(a, b) {
  const result = spawnSync(ffmpegPath, ['-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'], { windowsHide: true });
  const match = result.stderr.toString().match(/All:([0-9.]+)/);
  return match ? parseFloat(match[1]) : NaN;
}

async function waitForTestExports(page) {
  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__TEST_EXPORT__, { timeout: 15000 });
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

test.describe.serial('Video Maker - Phase 5 Extras', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePath;
  let audioPath;
  let outputPath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-extras-'));
    imagePath = path.join(testDir, 'escena1.png');
    generateGradientPng(imagePath);
    audioPath = path.join(testDir, 'narration.wav');
    generateWav(audioPath, 4);
    outputPath = path.join(testDir, 'exported.mp4');

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_OUTPUT: outputPath }
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

  test('1. Import one image and build a one-scene timeline', async () => {
    await page.evaluate((payload) => {
      window.__TEST_STATE__.images = [{
        name: 'escena1.png', path: payload.image, size: 0, type: 'image', preview: `file://${payload.image}`
      }];
      window.__TEST_STATE__.audio.narration = { name: 'narration.wav', path: payload.audio, duration: 4 };
      window.__TEST_STATE__.audioDuration = 4;
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderAudio();
      window.__TEST_RENDER__.renderFocusEditor();
    }, { image: imagePath, audio: audioPath });
    await page.waitForTimeout(200);

    await page.fill('#script-textarea', '[Escena 1] 0:00 - 0:04 Primera');
    await page.waitForTimeout(400);
    await page.check('#adjust-timeline-checkbox');
    await page.waitForTimeout(400);

    await expect(page.locator('#timeline-tbody tr')).toHaveCount(1);
  });

  test('2. Extras controls update state when clicked', async () => {
    await page.check('#badge-enabled');
    await page.fill('#badge-text', 'OFERTA 50%');
    await page.selectOption('#badge-position', 'topRight');
    await page.selectOption('#badge-animation', 'pulse');

    await page.check('#lower-third-enabled');
    await page.fill('#lower-third-text', 'Ana Lopez');
    await page.fill('#lower-third-opacity', '0.5');

    await page.check('#progress-bar-enabled');
    await page.evaluate(() => {
      const el = document.getElementById('progress-bar-color');
      el.value = '#00ff00';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.fill('#progress-bar-height', '20');
    await page.waitForTimeout(150);

    const extras = await page.evaluate(() => window.__TEST_STATE__.config.extras);
    expect(extras.badge).toEqual({ enabled: true, text: 'OFERTA 50%', position: 'topRight', animation: 'pulse' });
    expect(extras.lowerThird).toEqual({ enabled: true, text: 'Ana Lopez', opacity: 0.5 });
    expect(extras.progressBar).toEqual({ enabled: true, color: '#00ff00', height: 20 });
  });

  test('3. Export renders the progress bar and overlays and keeps the resolution', async () => {
    test.setTimeout(120000);
    await page.evaluate(() => {
      window.__TEST_STATE__.config.outputs = ['16:9'];
      window.__TEST_STATE__.config.fitMode = 'cover';
      window.__TEST_RENDER__.renderOutputChips();
    });
    await page.waitForTimeout(150);
    await exportAndWait(page);

    const size = videoSize(outputPath);
    expect(size.width).toBe(1920);
    expect(size.height).toBe(1080);
    expect(Math.abs(size.duration - 4)).toBeLessThanOrEqual(0.1);

    const barPixel = readPixel(outputPath, 100, 1070);
    expect(barPixel.g).toBeGreaterThan(150);
    expect(barPixel.b).toBeLessThan(120);
    expect(barPixel.r).toBeLessThan(120);

    const withExtras = path.join(testDir, 'with_extras.png');
    extractFrame(outputPath, withExtras, 2);
    expect(fs.existsSync(withExtras)).toBe(true);
  });

  test('4. Disabling extras exports a clean frame without overlays', async () => {
    test.setTimeout(120000);
    const withExtras = path.join(testDir, 'with_extras.png');

    await page.uncheck('#badge-enabled');
    await page.uncheck('#lower-third-enabled');
    await page.uncheck('#progress-bar-enabled');
    await page.waitForTimeout(150);
    await exportAndWait(page);

    const size = videoSize(outputPath);
    expect(size.width).toBe(1920);
    expect(size.height).toBe(1080);
    expect(Math.abs(size.duration - 4)).toBeLessThanOrEqual(0.1);

    const cleanFrame = path.join(testDir, 'clean.png');
    extractFrame(outputPath, cleanFrame, 2);
    expect(frameSsim(withExtras, cleanFrame)).toBeLessThan(0.999);
  });
});
