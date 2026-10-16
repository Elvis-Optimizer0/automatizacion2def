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

function generatePng(filePath, color) {
  runFfmpeg(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=640x480`, '-frames:v', '1', filePath]);
}

function generateGradientPng(filePath) {
  runFfmpeg([
    '-y', '-f', 'lavfi',
    '-i', 'gradients=s=640x480:c0=red:c1=blue:x0=0:y0=0:x1=640:y1=480',
    '-frames:v', '1', filePath
  ]);
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

function extractFrame(videoPath, outPath, atSec) {
  runFfmpeg(['-y', '-ss', String(atSec), '-i', videoPath, '-frames:v', '1', outPath]);
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

test.describe.serial('Video Maker - Phase 5 Zoom catalog', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePaths;
  let audioPath;
  let outputPath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-zoom-'));
    imagePaths = [path.join(testDir, 'escena1.png'), path.join(testDir, 'escena2.png')];
    generateGradientPng(imagePaths[0]);
    generatePng(imagePaths[1], 'green');
    audioPath = path.join(testDir, 'narration.wav');
    generateWav(audioPath, 6);
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

    await expect(page.locator('#images-list .image-item')).toHaveCount(2);

    const script = `[Escena 1] 0:00 - 0:03 Primera
[Escena 2] 0:03 - 0:06 Segunda`;
    await page.fill('#script-textarea', script);
    await page.waitForTimeout(500);
    await page.check('#adjust-timeline-checkbox');
    await page.waitForTimeout(500);

    await expect(page.locator('#timeline-tbody tr')).toHaveCount(2);
  });

  test('2. Zoom effect, mode and seed are selectable', async () => {
    await page.selectOption('#zoom-type', 'pulse');
    await page.selectOption('#zoom-mode', 'alternate');
    await page.fill('#zoom-seed', '777');
    await page.waitForTimeout(100);

    const options = await page.evaluate(() => ({ ...window.__TEST_STATE__.exportOptions }));
    expect(options.zoomType).toBe('pulse');
    expect(options.zoomMode).toBe('alternate');
    expect(options.zoomSeed).toBe(777);

    await page.selectOption('#zoom-type', 'kenburns');
    await page.selectOption('#zoom-mode', 'fixed');
    await page.fill('#zoom-seed', '12345');
  });

  test('3. A non-default zoom type exports at the target resolution and animates the frame', async () => {
    await page.evaluate(() => {
      window.__TEST_STATE__.config.outputs = ['16:9'];
      window.__TEST_STATE__.config.fitMode = 'cover';
      window.__TEST_RENDER__.renderOutputChips();
      window.__TEST_STATE__.exportOptions.zoomEnabled = true;
      window.__TEST_STATE__.exportOptions.zoomType = 'pulse';
      window.__TEST_STATE__.exportOptions.zoomIntensity = 0.3;
    });
    await page.selectOption('#zoom-type', 'pulse');
    await page.waitForTimeout(150);
    await exportAndWait(page);

    const size = videoSize(outputPath);
    expect(size.width).toBe(1920);
    expect(size.height).toBe(1080);
    expect(Math.abs(size.duration - 6)).toBeLessThanOrEqual(0.1);

    const frameA = path.join(testDir, 'pulse_a.png');
    const frameB = path.join(testDir, 'pulse_b.png');
    extractFrame(outputPath, frameA, 0.3);
    extractFrame(outputPath, frameB, 2.5);
    expect(frameSsim(frameA, frameB)).toBeLessThan(0.99);
  });

  test('4. "none" zoom produces a static frame and still exports at the target resolution', async () => {
    await page.selectOption('#zoom-type', 'none');
    await page.waitForTimeout(150);
    const options = await page.evaluate(() => ({ ...window.__TEST_STATE__.exportOptions }));
    expect(options.zoomType).toBe('none');
    await exportAndWait(page);

    const size = videoSize(outputPath);
    expect(size.width).toBe(1920);
    expect(size.height).toBe(1080);
    expect(Math.abs(size.duration - 6)).toBeLessThanOrEqual(0.1);

    const frameA = path.join(testDir, 'none_a.png');
    const frameB = path.join(testDir, 'none_b.png');
    extractFrame(outputPath, frameA, 0.3);
    extractFrame(outputPath, frameB, 2.5);
    expect(frameSsim(frameA, frameB)).toBeGreaterThan(0.995);
  });
});
