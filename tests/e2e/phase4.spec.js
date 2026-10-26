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

function generatePng(filePath, color) {
  runFfmpeg(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=640x480`, '-frames:v', '1', filePath]);
}

function generateGradientPng(filePath) {
  runFfmpeg([
    '-y', '-f', 'lavfi',
    '-i', 'gradients=s=640x480:c0=red:c1=blue:x0=0:y0=0:x1=0:y1=480',
    '-frames:v', '1', filePath
  ]);
}

function generateWav(filePath, durationSec = 6) {
  runFfmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`, '-ar', '44100', filePath]);
}

function probe(filePath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=codec_type,codec_name,width,height',
    '-of', 'json',
    filePath
  ], { windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr ? result.stderr.toString() : ''}`);
  }
  return JSON.parse(result.stdout.toString());
}

function videoSize(filePath) {
  const info = probe(filePath);
  const video = info.streams.find(s => s.codec_type === 'video');
  return { width: video.width, height: video.height, duration: parseFloat(info.format.duration) };
}

function extractFrame(videoPath, outPath, atSec) {
  runFfmpeg(['-y', '-ss', String(atSec), '-i', videoPath, '-frames:v', '1', outPath]);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function waitForTestExports(page) {
  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__TEST_EXPORT__, { timeout: 15000 });
}

async function exportAndWait(page, options = {}) {
  const timeout = (options && options.timeout) ? options.timeout : (typeof options === 'number' ? options : 55000);
  console.log('[exportAndWait] Using timeout:', timeout);
  await page.evaluate(() => {
    const status = document.getElementById('export-status');
    if (status) status.textContent = '';
  });
  await page.click('#export-btn');
  
  // Manual polling instead of waitForFunction due to timeout issues
  const startTime = Date.now();
  const pollInterval = 500;
  while (Date.now() - startTime < timeout) {
    const status = await page.locator('#export-status').textContent();
    if (status && (status.startsWith('Video exportado') || status.startsWith('Error'))) {
      expect(status).toContain('Video exportado');
      return;
    }
    await page.waitForTimeout(pollInterval);
  }
  throw new Error(`Export timed out after ${timeout}ms`);
}

function outputMtime(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : 0;
}

async function exportAndWaitFresh(page, filePath) {
  const before = outputMtime(filePath);
  await exportAndWait(page);
  await expect.poll(() => outputMtime(filePath), { timeout: 20000 }).toBeGreaterThan(before);
}

test.describe.serial('Video Maker - Phase 4 Formats & Focus', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePaths;
  let audioPath;
  let outputPath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-phase4-'));
    imagePaths = ['escena1.png', 'escena2.png', 'escena3.png'].map((name, i) => {
      const filePath = path.join(testDir, name);
      if (i === 0) {
        generateGradientPng(filePath);
      } else {
        generatePng(filePath, ['green', 'blue'][i - 1]);
      }
      return filePath;
    });
    audioPath = path.join(testDir, 'narration.wav');
    generateWav(audioPath, 6);
    outputPath = path.join(testDir, 'exported.mp4');

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_TEST_OUTPUT: outputPath }
    });

    page = await electronApp.firstWindow();

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.waitForLoadState('domcontentloaded');
    await waitForTestExports(page);
    await page.waitForTimeout(500);

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors on load:\n${consoleErrors.join('\n')}`);
    }
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. Format chips toggle the selected outputs and keep at least one', async () => {
    await expect(page.locator('#output-chip-16x9')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#output-chip-9x16')).toHaveAttribute('aria-pressed', 'false');

    await page.click('#output-chip-9x16');
    await page.waitForTimeout(100);
    let outputs = await page.evaluate(() => window.__TEST_STATE__.config.outputs);
    expect(outputs).toEqual(['16:9', '9:16']);

    await page.click('#output-chip-16x9');
    await page.waitForTimeout(100);
    outputs = await page.evaluate(() => window.__TEST_STATE__.config.outputs);
    expect(outputs).toEqual(['9:16']);

    await page.click('#output-chip-9x16');
    await page.waitForTimeout(100);
    outputs = await page.evaluate(() => window.__TEST_STATE__.config.outputs);
    expect(outputs).toEqual(['9:16']);

    await expect(page.locator('#output-chip-9x16')).toHaveAttribute('aria-pressed', 'true');
  });

  test('2. Import images and build the timeline', async () => {
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

    await expect(page.locator('#images-list .image-item')).toHaveCount(3);

    const script = `[Escena 1] 0:00 - 0:02 Primera
[Escena 2] 0:02 - 0:04 Segunda
[Escena 3] 0:04 - 0:06 Tercera`;
    await page.fill('#script-textarea', script);
    await page.waitForTimeout(500);
    await page.check('#adjust-timeline-checkbox');
    await page.waitForTimeout(500);

    const durations = await page.locator('#timeline-tbody .timeline-duration-input').evaluateAll(inputs =>
      inputs.map(i => parseFloat(i.value))
    );
    const total = durations.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 6)).toBeLessThanOrEqual(0.1);
  });

  test('3. Export all four formats with correct resolutions and duration', async () => {
    test.setTimeout(180000);
    await page.evaluate(() => {
      window.__TEST_STATE__.config.outputs = ['16:9', '9:16', '1:1', '4:5'];
      window.__TEST_STATE__.config.fitMode = 'cover';
      window.__TEST_RENDER__.renderOutputChips();
    });
    await page.waitForTimeout(150);

    await exportAndWait(page, { timeout: 120000 });

    const expected = [
      { file: outputPath, width: 1920, height: 1080 },
      { file: path.join(testDir, 'exported_9x16.mp4'), width: 1080, height: 1920 },
      { file: path.join(testDir, 'exported_1x1.mp4'), width: 1080, height: 1080 },
      { file: path.join(testDir, 'exported_4x5.mp4'), width: 1080, height: 1350 }
    ];

    const result = await page.evaluate(async () => {
      const stored = window.__TEST_STATE__.export;
      return { outputPath: stored.outputPath, outputFolder: stored.outputFolder };
    });
    expect(result.outputPath).toBe(outputPath);

    for (const exp of expected) {
      expect(fs.existsSync(exp.file)).toBe(true);
      const size = videoSize(exp.file);
      expect(size.width).toBe(exp.width);
      expect(size.height).toBe(exp.height);
      expect(Math.abs(size.duration - 6)).toBeLessThanOrEqual(0.1);
    }
  });

  test('4. Fit modes blur and frame keep the target resolution', async () => {
    await page.evaluate(() => {
      window.__TEST_STATE__.config.outputs = ['9:16'];
      window.__TEST_STATE__.config.fitMode = 'blur';
      window.__TEST_RENDER__.renderOutputChips();
    });
    await page.waitForTimeout(150);
    await exportAndWait(page);

    const blurFile = path.join(testDir, 'exported_9x16.mp4');
    let size = videoSize(blurFile);
    expect(size.width).toBe(1080);
    expect(size.height).toBe(1920);

    await page.evaluate(() => {
      window.__TEST_STATE__.config.fitMode = 'frame';
      window.__TEST_STATE__.config.frameColor = '#ff0000';
    });
    await page.waitForTimeout(150);
    await exportAndWait(page);

    size = videoSize(blurFile);
    expect(size.width).toBe(1080);
    expect(size.height).toBe(1920);

    const mode = await page.evaluate(() => window.__TEST_STATE__.config.fitMode);
    expect(mode).toBe('frame');
  });

  test('5. Focus editor click stores a per-format focus value', async () => {
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
    await page.waitForTimeout(150);
    const box = await page.locator('#focus-image').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85);
    await page.waitForTimeout(200);

    const focus = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169);
    expect(focus).toBeTruthy();
    expect(focus.y).toBeGreaterThan(0.6);
    expect(focus.x).toBeGreaterThanOrEqual(0);
    expect(focus.x).toBeLessThanOrEqual(1);

    const readout = await page.locator('#focus-readout').textContent();
    expect(readout).toMatch(/\d\.\d{2}, \d\.\d{2}/);
  });

  test('6. Different focus values produce a different 16:9 frame', async () => {
    await page.evaluate(() => {
      window.__TEST_STATE__.config.outputs = ['16:9'];
      window.__TEST_STATE__.config.fitMode = 'cover';
      window.__TEST_RENDER__.renderOutputChips();
      window.__TEST_STATE__.images[0].focus169 = { x: 0.5, y: 0.2 };
    });
    await page.waitForTimeout(150);
    await exportAndWaitFresh(page, outputPath);
    const frameTop = path.join(testDir, 'frame_top.png');
    extractFrame(outputPath, frameTop, 1);

    await page.evaluate(() => {
      window.__TEST_STATE__.images[0].focus169 = { x: 0.5, y: 0.8 };
    });
    await page.waitForTimeout(150);
    await exportAndWaitFresh(page, outputPath);
    const frameBottom = path.join(testDir, 'frame_bottom.png');
    extractFrame(outputPath, frameBottom, 1);

    const focusTop = await page.evaluate(() => window.__TEST_STATE__.images[0].focus169);
    expect(focusTop.y).toBeCloseTo(0.8);

    expect(fs.existsSync(frameTop)).toBe(true);
    expect(fs.existsSync(frameBottom)).toBe(true);
    expect(sha256(frameTop)).not.toBe(sha256(frameBottom));
  });
});
