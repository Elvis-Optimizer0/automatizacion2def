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

function generateGradientPng(filePath, from, to) {
  runFfmpeg([
    '-y', '-f', 'lavfi',
    '-i', `gradients=s=640x480:c0=${from}:c1=${to}:x0=0:y0=0:x1=640:y1=480`,
    '-frames:v', '1', filePath
  ]);
}

function generateWav(filePath, durationSec) {
  runFfmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`, '-ar', '44100', filePath]);
}

function videoInfo(filePath) {
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

function readPixel(videoPath, x, y, atSec = 2) {
  const raw = `${videoPath}.px`;
  runFfmpeg(['-y', '-ss', String(atSec), '-i', videoPath, '-vf', `crop=2:2:${x}:${y},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
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
  await page.waitForFunction(
    () => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__TEST_EXPORT__,
    { timeout: 15000 }
  );
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

test.describe.serial('Video Maker - Phase 5 Integration verification', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePaths;
  let audioPath;
  let outputPath;
  let savedProjectPath;
  let frameWithExtras;
  let framePlain;
  let combinedInfo;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-verify-'));
    imagePaths = [path.join(testDir, 'escena1.png'), path.join(testDir, 'escena2.png')];
    generateGradientPng(imagePaths[0], 'red', 'blue');
    generateGradientPng(imagePaths[1], 'green', 'yellow');
    audioPath = path.join(testDir, 'narration.wav');
    generateWav(audioPath, 6);
    outputPath = path.join(testDir, 'exported.mp4');
    savedProjectPath = path.join(testDir, 'proyecto.vmproj');
    frameWithExtras = path.join(testDir, 'frame_with.png');
    framePlain = path.join(testDir, 'frame_plain.png');

    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_TEST: '1',
        VM_USE_DIST: '1',
        VM_TEST_OUTPUT: outputPath,
        VM_TEST_PROJECT_OUT: savedProjectPath,
        VM_TEST_PROJECT_IN: savedProjectPath
      }
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

  async function buildCombinedState() {
    await page.evaluate((payload) => {
      window.__TEST_STATE__.images = payload.images.map((image, index) => ({
        name: `escena${index + 1}.png`,
        path: image,
        size: 0,
        type: 'image',
        preview: `file://${image}`,
        focus169: { x: 0.3, y: 0.7, scale: 0.7 },
        focus916: { x: 0.5, y: 0.5, scale: 0.6 },
        focus11: { x: 0.5, y: 0.5, scale: 1 },
        focus45: { x: 0.5, y: 0.5, scale: 1 }
      }));
      window.__TEST_STATE__.audio.narration = { name: 'narration.wav', path: payload.audio, duration: 6 };
      window.__TEST_STATE__.audioDuration = 6;
      window.__TEST_STATE__.config.outputs = ['16:9'];
      window.__TEST_STATE__.config.fitMode = 'blur';
      window.__TEST_STATE__.config.backgroundMode = 'color';
      window.__TEST_STATE__.config.backgroundColor = '#101010';
      window.__TEST_STATE__.config.extras.badge = { enabled: true, text: 'OFERTA', position: 'topRight', animation: 'fade' };
      window.__TEST_STATE__.config.extras.lowerThird = { enabled: true, text: 'Oferta especial', opacity: 1 };
      window.__TEST_STATE__.config.extras.progressBar = { enabled: true, color: '#00ff00', height: 16 };
      window.__TEST_STATE__.exportOptions.zoomType = 'pulse';
      window.__TEST_STATE__.exportOptions.zoomMode = 'alternate';
      window.__TEST_STATE__.exportOptions.zoomStartScale = 1.2;
      window.__TEST_STATE__.exportOptions.zoomIntensity = 0.3;
      window.__TEST_STATE__.exportOptions.transitionType = 'fade';
      window.__TEST_STATE__.exportOptions.transitionMode = 'alternate';
      window.__TEST_STATE__.exportOptions.transitionDuration = 0.5;
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderAudio();
      window.__TEST_RENDER__.renderFocusEditor();
      window.__TEST_RENDER__.renderOutputChips();
    }, { images: imagePaths, audio: audioPath });
    await page.waitForTimeout(200);

    await page.fill('#script-textarea', '[Escena 1] 0:00 - 0:03 Uno\n[Escena 2] 0:03 - 0:06 Dos');
    await page.waitForTimeout(300);
    await page.check('#adjust-timeline-checkbox');
    await page.waitForTimeout(400);
    await page.locator('.timeline-zoom-select[data-index="0"]').selectOption('zoomIn');
    await page.waitForTimeout(150);
  }

  async function setExtrasEnabled(enabled) {
    await page.evaluate((value) => {
      window.__TEST_STATE__.config.extras.badge.enabled = value;
      window.__TEST_STATE__.config.extras.lowerThird.enabled = value;
      window.__TEST_STATE__.config.extras.progressBar.enabled = value;
    }, enabled);
  }

  test('1. Combined export matches audio duration, target resolution and renders overlays', async () => {
    await buildCombinedState();
    await exportAndWait(page);

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);

    combinedInfo = videoInfo(outputPath);
    expect(combinedInfo.width).toBe(1920);
    expect(combinedInfo.height).toBe(1080);
    expect(Math.abs(combinedInfo.duration - 6)).toBeLessThanOrEqual(0.1);

    const bar = readPixel(outputPath, 12, 1072);
    expect(bar.g).toBeGreaterThan(200);
    expect(bar.r).toBeLessThan(80);
    expect(bar.b).toBeLessThan(80);

    extractFrame(outputPath, frameWithExtras, 2);
    expect(fs.existsSync(frameWithExtras)).toBe(true);
  });

  test('2. Disabling extras changes the rendered frame (overlays are real)', async () => {
    await setExtrasEnabled(false);
    await exportAndWait(page);
    extractFrame(outputPath, framePlain, 2);

    const ssim = frameSsim(frameWithExtras, framePlain);
    expect(ssim).toBeLessThan(0.999);
  });

  test('3. Project round-trip reproduces the combined render', async () => {
    await setExtrasEnabled(true);
    await page.click('#save-project-btn');
    await page.waitForTimeout(300);
    expect(fs.existsSync(savedProjectPath)).toBe(true);

    await page.evaluate(() => {
      window.__TEST_STATE__.images = [];
      window.__TEST_STATE__.timeline = [];
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderTimeline();
    });
    await page.click('#open-project-btn');
    await page.waitForTimeout(400);

    const restored = await page.evaluate(() => ({
      images: window.__TEST_STATE__.images.length,
      timeline: window.__TEST_STATE__.timeline.length,
      zoomType: window.__TEST_STATE__.exportOptions.zoomType,
      zoomMode: window.__TEST_STATE__.exportOptions.zoomMode,
      transitionMode: window.__TEST_STATE__.exportOptions.transitionMode,
      fitMode: window.__TEST_STATE__.config.fitMode,
      badge: window.__TEST_STATE__.config.extras.badge,
      progressBar: window.__TEST_STATE__.config.extras.progressBar,
      sceneZoom: window.__TEST_STATE__.timeline[0].zoom
    }));
    expect(restored.images).toBe(2);
    expect(restored.timeline).toBe(2);
    expect(restored.zoomType).toBe('pulse');
    expect(restored.zoomMode).toBe('alternate');
    expect(restored.transitionMode).toBe('alternate');
    expect(restored.fitMode).toBe('blur');
    expect(restored.badge.enabled).toBe(true);
    expect(restored.progressBar.enabled).toBe(true);
    expect(restored.progressBar.color).toBe('#00ff00');
    expect(restored.sceneZoom).toMatchObject({ type: 'zoomIn' });

    await exportAndWait(page);
    const reInfo = videoInfo(outputPath);
    expect(reInfo.width).toBe(combinedInfo.width);
    expect(reInfo.height).toBe(combinedInfo.height);
    expect(Math.abs(reInfo.duration - combinedInfo.duration)).toBeLessThanOrEqual(0.1);

    const restoredFrame = path.join(testDir, 'frame_restored.png');
    extractFrame(outputPath, restoredFrame, 2);
    const ssim = frameSsim(frameWithExtras, restoredFrame);
    expect(ssim).toBeGreaterThan(0.99);
  });
});
