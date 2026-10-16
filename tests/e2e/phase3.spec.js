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

async function waitForTestExports(page) {
  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__TEST_EXPORT__, { timeout: 15000 });
}

test.describe.serial('Video Maker - Phase 3 Export', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePaths;
  let audioPath;
  let outputPath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-export-'));
    imagePaths = ['escena1.png', 'escena2.png', 'escena3.png'].map((name, i) => {
      const filePath = path.join(testDir, name);
      generatePng(filePath, ['red', 'green', 'blue'][i]);
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

  test('1. Import images and audio into state', async () => {
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
    }, { images: imagePayload, audio: audioPath });
    await page.waitForTimeout(300);

    await expect(page.locator('#images-list .image-item')).toHaveCount(3);
    await expect(page.locator('#audio-narration-info')).toContainText('0:06');
  });

  test('2. Script builds a timeline adjusted to the 6s audio', async () => {
    const script = `[Escena 1] 0:00 - 0:02 Primera
[Escena 2] 0:02 - 0:04 Segunda
[Escena 3] 0:04 - 0:06 Tercera`;
    await page.fill('#script-textarea', script);
    await page.waitForTimeout(500);
    await page.check('#adjust-timeline-checkbox');
    await page.waitForTimeout(500);

    await expect(page.locator('#script-summary')).toContainText('3 escenas detectadas');
    const durations = await page.locator('#timeline-tbody .timeline-duration-input').evaluateAll(inputs =>
      inputs.map(i => parseFloat(i.value))
    );
    const total = durations.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 6)).toBeLessThanOrEqual(0.1);
  });

  test('3. Export controls are wired in CONTROLS and enable the export button', async () => {
    await expect(page.locator('#export-btn')).toBeEnabled();
    await expect(page.locator('#zoom-enabled-checkbox')).toBeChecked();
    await expect(page.locator('#transition-type')).toHaveValue('fade');

    await page.uncheck('#zoom-enabled-checkbox');
    await page.selectOption('#transition-type', 'cut');
    await page.fill('#zoom-intensity', '0.2');
    await page.dispatchEvent('#zoom-intensity', 'change');
    await page.waitForTimeout(200);

    const opts = await page.evaluate(() => window.__TEST_STATE__.exportOptions);
    expect(opts.zoomEnabled).toBe(false);
    expect(opts.transitionType).toBe('cut');
    expect(opts.zoomIntensity).toBeCloseTo(0.2);
  });

  test('4. Export renders an MP4 matching audio duration, size and codecs', async () => {
    await page.click('#export-btn');

    await page.waitForFunction(
      () => document.getElementById('export-status') &&
        document.getElementById('export-status').textContent.startsWith('Video exportado'),
      { timeout: 55000 }
    );
    await page.waitForTimeout(500);

    expect(fs.existsSync(outputPath)).toBe(true);

    const info = probe(outputPath);
    const video = info.streams.find(s => s.codec_type === 'video');
    const audio = info.streams.find(s => s.codec_type === 'audio');
    const duration = parseFloat(info.format.duration);

    expect(video.codec_name).toBe('h264');
    expect(audio.codec_name).toBe('aac');
    expect(video.width).toBe(1920);
    expect(video.height).toBe(1080);
    expect(Math.abs(duration - 6)).toBeLessThanOrEqual(0.1);
  });

  test('5. Missing input path surfaces E_INPUT_MISSING', async () => {
    const message = await page.evaluate(async () => {
      try {
        await window.api.renderVideo({
          scenes: [{ number: 1, duration: 2 }],
          images: [{ name: 'nope.png', path: 'Z:\\does\\not\\exist\\nope.png' }],
          narration: { name: 'nope.wav', path: 'Z:\\does\\not\\exist\\nope.wav' },
          outputPath: 'Z:\\does\\not\\exist\\out.mp4'
        });
        return null;
      } catch (err) {
        return err.message;
      }
    });

    expect(message).toBeTruthy();
    expect(message).toContain('E_INPUT_MISSING');
  });
});
