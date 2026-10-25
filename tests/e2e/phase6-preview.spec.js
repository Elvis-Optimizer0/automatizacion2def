const { test, expect } = require('@playwright/test');
test.setTimeout(120000);
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

test.describe('Video Maker - Phase 6 quick preview', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-preview-'));
    imagePath = path.join(testDir, 'escena1.png');
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'gradients=s=1280x720:c0=black:c1=navy', '-frames:v', '1', imagePath]);

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1' }
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_EXPORT__ && window.__TEST_RENDER__, { timeout: 15000 });
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. Renders a 5s 640px preview with subtitles for the chosen scene', async () => {
    await page.evaluate((image) => {
      const state = window.__TEST_STATE__;
      state.images = [{ name: 'escena1.png', path: image, size: 0, type: 'image', preview: `file://${image}` }];
      state.config.subtitles.enabled = true;
      state.config.subtitles.textColor = '#ffffff';
      state.config.subtitles.outlineWidth = 2;
      state.timeline = [{
        number: 1,
        start: 0,
        end: 4,
        duration: 4,
        text: 'La deuda sube 30% y el interés de $1.000 afecta tu sueldo',
        image: { name: 'escena1.png', path: image }
      }];
      window.__TEST_RENDER__.refreshPreviewScenes();
      window.__TEST_RENDER__.syncSubtitleControls();
    }, imagePath);

    const result = await page.evaluate(async (image) => {
      return window.api.renderPreview({
        imagePath: image,
        text: 'La deuda sube 30% y el interés de $1.000 afecta tu sueldo',
        duration: 5,
        format: '16:9',
        subtitles: window.__TEST_STATE__.config.subtitles
      });
    }, imagePath);

    expect(result.width).toBe(640);
    expect(fs.existsSync(result.outputPath)).toBe(true);

    const [duration] = probe(result.outputPath, 'format=duration');
    const [width] = probe(result.outputPath, 'stream=width');
    expect(parseFloat(duration)).toBeLessThanOrEqual(5.1);
    expect(parseInt(width, 10)).toBe(640);

    await page.evaluate(() => window.__TEST_EXPORT__.handlePreview());
    await page.waitForFunction(() => {
      const video = document.getElementById('preview-video');
      return video && !video.hidden && video.src.startsWith('file://');
    }, { timeout: 30000 });
  });
});
