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

function probeDuration(filePath) {
  const result = spawnSync(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath
  ], { windowsHide: true });
  return parseFloat(result.stdout.toString().trim());
}

test.describe.serial('Video Maker - Phase 7 local voice pipeline', () => {
  let electronApp;
  let page;
  let testDir;
  let image1;
  let image2;
  let voicePath;
  let outputPath;
  const pageErrors = [];

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-pipeline-'));
    image1 = path.join(testDir, 'escena1.png');
    image2 = path.join(testDir, 'escena2.png');
    voicePath = path.join(testDir, 'voz.wav');
    outputPath = path.join(testDir, 'out.mp4');

    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720', '-frames:v', '1', image1]);
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720', '-frames:v', '1', image2]);

    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_TEST: '1',
        VM_TEST_OUTPUT: outputPath,
        VM_TEST_VOICE_OUT: voicePath
      }
    });
    page = await electronApp.firstWindow();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__TEST_EXPORT__, { timeout: 15000 });

    await page.evaluate((payload) => {
      const state = window.__TEST_STATE__;
      state.images = [
        { name: 'escena1.png', path: payload.image1, size: 0, type: 'image', preview: `file://${payload.image1}` },
        { name: 'escena2.png', path: payload.image2, size: 0, type: 'image', preview: `file://${payload.image2}` }
      ];
      state.config.outputs = ['16:9'];
      state.config.voice.language = 'es';
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderOutputChips();
    }, { image1, image2 });

    await page.fill('#script-textarea', [
      '[Escena 1] 0:00 - 0:03 La deuda sube 30% este año',
      '[Escena 2] 0:03 - 0:06 El interés afecta tu sueldo'
    ].join('\n'));
    await page.waitForTimeout(500);
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. Generates local narration as a real wav file', async () => {
    await page.fill('#voice-text', 'La deuda sube 30% este año. El interés afecta tu sueldo.');
    await page.click('#voice-generate-btn');
    await page.waitForFunction(
      () => !!window.__TEST_STATE__.audio.narration || window.__TEST_STATE__.export.status.includes('Error'),
      null,
      { timeout: 60000 }
    );
    const narration = await page.evaluate(() => window.__TEST_STATE__.audio.narration);
    expect(narration).toBeTruthy();
    expect(fs.existsSync(narration.path)).toBe(true);
    expect(probeDuration(narration.path)).toBeGreaterThan(0);
  });

  test('2. Syncs scenes with the voice and stores word timings', async () => {
    await page.click('#sync-scenes-btn');
    await page.waitForFunction(
      () => {
        const timeline = window.__TEST_STATE__.timeline;
        return timeline.length === 2 && timeline[1].start > timeline[0].start && timeline[0].words.length > 0;
      },
      null,
      { timeout: 60000 }
    );
    const timeline = await page.evaluate(() => window.__TEST_STATE__.timeline.map(scene => ({
      start: scene.start,
      end: scene.end,
      words: scene.words.length
    })));
    expect(timeline[0].start).toBeLessThan(timeline[0].end);
    expect(timeline[1].start).toBeGreaterThanOrEqual(timeline[0].end);
    expect(timeline.every(scene => scene.words > 0)).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('3. Full pipeline exports a video matching the narration duration', async () => {
    await page.evaluate(() => { window.__TEST_RENDER__.handleGenerateFullVideo(); });
    await page.waitForFunction(
      () => {
        const status = window.__TEST_STATE__.export.status;
        const pipeline = document.getElementById('pipeline-status');
        return status.includes('Video exportado') || (pipeline && pipeline.textContent.startsWith('Error'));
      },
      null,
      { timeout: 120000 }
    );

    const status = await page.evaluate(() => window.__TEST_STATE__.export.status);
    expect(status).toContain('Video exportado');
    expect(fs.existsSync(outputPath)).toBe(true);

    const audioDuration = await page.evaluate(() => window.__TEST_STATE__.audioDuration);
    expect(Math.abs(probeDuration(outputPath) - audioDuration)).toBeLessThanOrEqual(0.15);
    expect(pageErrors).toEqual([]);
  });
});
