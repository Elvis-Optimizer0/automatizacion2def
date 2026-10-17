const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
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

function generateBluePng(filePath) {
  runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=640x480', '-frames:v', '1', filePath]);
}

function generateWav(filePath, durationSec = 4) {
  runFfmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`, '-ar', '44100', filePath]);
}

function probeVideo(filePath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,width,height',
    '-show_entries', 'format=duration',
    '-of', 'json',
    filePath
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
  runFfmpeg(['-y', '-ss', '1', '-i', videoPath, '-vf', `crop=2:2:${x}:${y},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  const bytes = fs.readFileSync(raw);
  const pixel = { r: bytes[0], g: bytes[1], b: bytes[2] };
  fs.rmSync(raw, { force: true });
  return pixel;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

async function setScaleThroughUi(page, value) {
  await page.evaluate((v) => {
    const el = document.getElementById('focus-scale');
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(100);
}

test.describe.serial('Video Maker - Phase 5 Manual framing', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePath;
  let audioPath;
  let outputPath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-framing-'));
    imagePath = path.join(testDir, 'escena1.png');
    generateBluePng(imagePath);
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

  test('1. Import the image and build a single-scene timeline', async () => {
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
    await expect(page.locator('#export-btn')).toBeEnabled();
  });

  test('2. Editor stores focus after click and drag', async () => {
    await page.evaluate(() => {
      window.__TEST_STATE__.focus.imageIndex = 0;
      window.__TEST_STATE__.focus.format = '16:9';
      window.__TEST_RENDER__.renderFocusEditor();
    });
    await page.waitForFunction(() => {
      const img = document.getElementById('focus-image');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 10000 });

    await page.locator('#focus-editor').scrollIntoViewIfNeeded();
    const box = await page.locator('#focus-editor').boundingBox();

    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.75);
    await page.waitForTimeout(150);
    const afterClick = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169);
    expect(afterClick.x).toBeGreaterThan(0.6);
    expect(afterClick.y).toBeGreaterThan(0.6);

    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.75);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const afterDrag = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169);
    expect(afterDrag.x).toBeLessThan(afterClick.x);
    expect(afterDrag.y).toBeLessThan(afterClick.y);
  });

  test('3. Editor stores scale after slider and wheel', async () => {
    await setScaleThroughUi(page, 0.6);
    let scale = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169.scale);
    expect(scale).toBeCloseTo(0.6, 2);

    const before = scale;
    await page.locator('#focus-editor').dispatchEvent('wheel', { deltaY: -150 });
    await page.waitForTimeout(100);
    scale = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169.scale);
    expect(scale).toBeGreaterThan(before);

    await page.locator('#focus-editor').dispatchEvent('wheel', { deltaY: 150 });
    await page.waitForTimeout(100);
    const afterDown = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169.scale);
    expect(afterDown).toBeLessThan(scale);

    const readout = await page.locator('#focus-readout').textContent();
    expect(readout).toMatch(/×\d\.\d{2}/);
  });

  test('4. Scale 1.0 vs 0.6 changes the rendered frame and adds the chosen border', async () => {
    await page.evaluate(() => {
      window.__TEST_STATE__.config.outputs = ['16:9'];
      window.__TEST_STATE__.config.fitMode = 'cover';
      window.__TEST_STATE__.config.backgroundMode = 'color';
      window.__TEST_STATE__.config.backgroundColor = '#00ff00';
      window.__TEST_RENDER__.renderOutputChips();
      const image = window.__TEST_STATE__.images[0];
      image.focus169 = { x: 0.5, y: 0.5, scale: 1 };
      window.__TEST_RENDER__.renderFocusEditor();
    });
    await page.waitForTimeout(150);
    await exportAndWait(page);

    const size1 = probeVideo(outputPath);
    expect(size1.width).toBe(1920);
    expect(size1.height).toBe(1080);
    expect(Math.abs(size1.duration - 4)).toBeLessThanOrEqual(0.1);

    const frameScale1 = path.join(testDir, 'frame_scale1.png');
    extractFrame(outputPath, frameScale1, 1);
    const edgeScale1 = readPixel(outputPath, 4, 538);

    await setScaleThroughUi(page, 0.6);
    await page.evaluate(() => {
      const image = window.__TEST_STATE__.images[0];
      image.focus169 = { x: 0.5, y: 0.5, scale: 0.6 };
      window.__TEST_RENDER__.renderFocusEditor();
    });
    await page.waitForTimeout(150);
    await exportAndWait(page);

    const size06 = probeVideo(outputPath);
    expect(size06.width).toBe(1920);
    expect(size06.height).toBe(1080);
    expect(Math.abs(size06.duration - 4)).toBeLessThanOrEqual(0.1);

    const frameScale06 = path.join(testDir, 'frame_scale06.png');
    extractFrame(outputPath, frameScale06, 1);
    const edgeScale06 = readPixel(outputPath, 4, 538);

    expect(fs.existsSync(frameScale1)).toBe(true);
    expect(fs.existsSync(frameScale06)).toBe(true);
    expect(sha256(frameScale1)).not.toBe(sha256(frameScale06));

    expect(edgeScale1.b).toBeGreaterThan(150);
    expect(edgeScale1.g).toBeLessThan(120);
    expect(edgeScale06.g).toBeGreaterThan(150);
    expect(edgeScale06.b).toBeLessThan(120);
  });

  test('5. Auto-fit and reset controls update scale deterministically', async () => {
    await page.evaluate(() => {
      const image = window.__TEST_STATE__.images[0];
      image.focus169 = { x: 0.4, y: 0.7, scale: 2 };
      window.__TEST_RENDER__.renderFocusEditor();
    });
    await page.waitForTimeout(100);

    await page.click('#focus-auto-btn');
    await page.waitForTimeout(100);
    const auto = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169);
    expect(auto.scale).toBeLessThan(2);
    expect(auto.scale).toBeCloseTo(Math.min(1, 0.75), 2);

    await page.click('#focus-reset-btn');
    await page.waitForTimeout(100);
    const reset = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169);
    expect(reset).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  test('6. Per-format framing is independent: changing 9:16 leaves the 16:9 render identical', async () => {
    const ninePath = path.join(testDir, 'exported_9x16.mp4');

    await page.evaluate(() => {
      const image = window.__TEST_STATE__.images[0];
      image.focus169 = { x: 0.5, y: 0.5, scale: 1 };
      image.focus916 = { x: 0.5, y: 0.5, scale: 1 };
      window.__TEST_STATE__.config.outputs = ['16:9', '9:16'];
      window.__TEST_STATE__.config.fitMode = 'cover';
      window.__TEST_STATE__.config.backgroundMode = 'color';
      window.__TEST_STATE__.config.backgroundColor = '#ff00ff';
      window.__TEST_STATE__.exportOptions.zoomEnabled = false;
      window.__TEST_RENDER__.renderFocusEditor();
      window.__TEST_RENDER__.renderOutputChips();
    });
    await page.waitForTimeout(150);
    await exportAndWait(page);

    const sixteenA = probeVideo(outputPath);
    const nineA = probeVideo(ninePath);
    expect(sixteenA.width).toBe(1920);
    expect(sixteenA.height).toBe(1080);
    expect(nineA.width).toBe(1080);
    expect(nineA.height).toBe(1920);

    const frame169Before = path.join(testDir, 'fmt169_before.png');
    const frame916Before = path.join(testDir, 'fmt916_before.png');
    extractFrame(outputPath, frame169Before, 1);
    extractFrame(ninePath, frame916Before, 1);

    await page.evaluate(() => {
      window.__TEST_STATE__.images[0].focus916 = { x: 0.1, y: 0.9, scale: 0.5 };
      window.__TEST_RENDER__.renderFocusEditor();
    });
    await page.waitForTimeout(150);
    await exportAndWait(page);

    const frame169After = path.join(testDir, 'fmt169_after.png');
    const frame916After = path.join(testDir, 'fmt916_after.png');
    extractFrame(outputPath, frame169After, 1);
    extractFrame(ninePath, frame916After, 1);

    expect(frameSsim(frame169Before, frame169After)).toBeGreaterThan(0.999);
    expect(sha256(frame169Before)).toBe(sha256(frame169After));

    const nineSsim = frameSsim(frame916After, frame916Before);
    expect(nineSsim).toBeLessThan(0.999);

    const border = readPixel(ninePath, 540, 4);
    expect(border.r).toBeGreaterThan(200);
    expect(border.b).toBeGreaterThan(200);
    expect(border.g).toBeLessThan(80);
  });
});
