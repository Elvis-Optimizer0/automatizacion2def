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

test.describe.serial('Video Maker - Phase 5 Per-scene settings', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePaths;
  let audioPath;
  let outputPath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-scene-'));
    imagePaths = ['a', 'b', 'c'].map((k) => path.join(testDir, `${k}.png`));
    generatePng(imagePaths[0], 'red');
    generatePng(imagePaths[1], 'green');
    generatePng(imagePaths[2], 'blue');
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

  test('1. Import images and build a three-scene timeline with per-scene controls', async () => {
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

    const script = `[Escena 1] 0:00 - 0:02 Primera
[Escena 2] 0:02 - 0:04 Segunda
[Escena 3] 0:04 - 0:06 Tercera`;
    await page.fill('#script-textarea', script);
    await page.waitForTimeout(500);
    await page.check('#adjust-timeline-checkbox');
    await page.waitForTimeout(500);

    await expect(page.locator('#timeline-tbody tr')).toHaveCount(3);
    await expect(page.locator('.timeline-zoom-select')).toHaveCount(3);
    await expect(page.locator('.timeline-intensity-input')).toHaveCount(3);
    await expect(page.locator('.timeline-transition-select')).toHaveCount(3);
  });

  test('2. Editing the first row and "Aplicar a todas" copies zoom, intensity and transition', async () => {
    await page.locator('.timeline-zoom-select[data-index="0"]').selectOption('zoomIn');
    await page.locator('.timeline-intensity-input[data-index="0"]').fill('0.4');
    await page.locator('.timeline-transition-select[data-index="0"]').selectOption('slideLeft');
    await page.waitForTimeout(100);

    await page.click('#apply-scene-settings-btn');
    await page.waitForTimeout(200);

    const timeline = await page.evaluate(() => window.__TEST_STATE__.timeline.map(s => ({ zoom: s.zoom, transition: s.transition })));
    expect(timeline).toHaveLength(3);
    for (const scene of timeline) {
      expect(scene.zoom).toEqual({ type: 'zoomIn', intensity: 0.4 });
      expect(scene.transition).toEqual({ type: 'slideLeft' });
    }

    await expect(page.locator('.timeline-zoom-select[data-index="2"]')).toHaveValue('zoomIn');
    await expect(page.locator('.timeline-transition-select[data-index="2"]')).toHaveValue('slideLeft');
  });

  test('3. Per-scene overrides survive and export a valid video', async () => {
    test.setTimeout(120000);
    await page.locator('.timeline-zoom-select[data-index="1"]').selectOption('panLeft');
    await page.locator('.timeline-transition-select[data-index="1"]').selectOption('slideDown');
    await page.waitForTimeout(100);

    const timeline = await page.evaluate(() => window.__TEST_STATE__.timeline.map(s => ({ zoom: s.zoom, transition: s.transition })));
    expect(timeline[1].zoom.type).toBe('panLeft');
    expect(timeline[1].zoom.intensity).toBe(0.4);
    expect(timeline[1].transition).toEqual({ type: 'slideDown' });
    expect(timeline[0].zoom.type).toBe('zoomIn');
    expect(timeline[2].transition).toEqual({ type: 'slideLeft' });

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
    expect(Math.abs(size.duration - 6)).toBeLessThanOrEqual(0.1);
  });

  test('4. Selecting "(global)" clears the per-scene override', async () => {
    await page.locator('.timeline-zoom-select[data-index="1"]').selectOption('');
    await page.locator('.timeline-transition-select[data-index="1"]').selectOption('');
    await page.waitForTimeout(100);

    const scene = await page.evaluate(() => {
      const s = window.__TEST_STATE__.timeline[1];
      return { zoomType: s.zoom ? s.zoom.type : null, transition: s.transition || null };
    });
    expect(scene.zoomType).toBeUndefined();
    expect(scene.transition).toBeNull();
  });
});
