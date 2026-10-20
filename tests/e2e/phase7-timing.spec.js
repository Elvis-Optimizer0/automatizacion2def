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

function countWhitePixels(video, time, outRaw) {
  runFfmpeg(['-y', '-ss', String(time), '-i', video, '-frames:v', '1', '-vf', 'crop=iw:ih/3:0:ih*2/3', '-f', 'rawvideo', '-pix_fmt', 'rgb24', outRaw]);
  const buffer = fs.readFileSync(outRaw);
  let white = 0;
  for (let i = 0; i + 2 < buffer.length; i += 3) {
    if (buffer[i] > 200 && buffer[i + 1] > 200 && buffer[i + 2] > 200) white += 1;
  }
  return white;
}

test.describe.serial('Video Maker - Phase 7 subtitle timing', () => {
  let electronApp;
  let page;
  let testDir;
  let image1;
  let image2;
  let audioPath;
  let outputPath;
  const pageErrors = [];

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-timing-'));
    image1 = path.join(testDir, 'escena1.png');
    image2 = path.join(testDir, 'escena2.png');
    audioPath = path.join(testDir, 'narration.wav');
    outputPath = path.join(testDir, 'out.mp4');

    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720', '-frames:v', '1', image1]);
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720', '-frames:v', '1', image2]);
    runFfmpeg([
      '-y',
      '-f', 'lavfi', '-t', '1.5', '-i', 'anullsrc=r=44100:cl=mono',
      '-f', 'lavfi', '-t', '4.5', '-i', 'sine=frequency=440',
      '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[a]',
      '-map', '[a]',
      audioPath
    ]);

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1', VM_USE_DIST: '1', VM_TEST: '1', VM_TEST_OUTPUT: outputPath }
    });
    page = await electronApp.firstWindow();
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });

    await page.evaluate((payload) => {
      const state = window.__TEST_STATE__;
      state.images = [
        { name: 'escena1.png', path: payload.image1, size: 0, type: 'image', preview: `file://${payload.image1}` },
        { name: 'escena2.png', path: payload.image2, size: 0, type: 'image', preview: `file://${payload.image2}` }
      ];
      state.audio.narration = { name: 'narration.wav', path: payload.audio, duration: 6 };
      state.audioDuration = 6;
      state.config.outputs = ['16:9'];
      state.config.subtitles.enabled = true;
      state.config.subtitles.fontFamily = 'Roboto';
      state.config.subtitles.fontSizeH = 72;
      state.config.subtitles.textColor = '#ffffff';
      state.config.subtitles.outlineWidth = 0;
      state.config.subtitles.background.enabled = false;
      state.config.subtitles.shadow.enabled = false;
      state.config.subtitles.autoVoiceStart = true;
      state.config.subtitles.delay = 0;
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderAudio();
      window.__TEST_RENDER__.syncSubtitleControls();
      window.__TEST_RENDER__.renderOutputChips();
    }, { image1, image2, audio: audioPath });

    await page.fill('#script-textarea', [
      '[Escena 1] 0:00 - 0:03 Primera escena con texto',
      '[Escena 2] 0:03 - 0:06 Segunda escena con texto'
    ].join('\n'));
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.__TEST_STATE__.script.raw = document.getElementById('script-textarea').value;
      const { scenes } = window.__TEST_RENDER__.parseScript(window.__TEST_STATE__.script.raw);
      window.__TEST_STATE__.script.scenes = scenes;
      window.__TEST_RENDER__.updateTimeline();
    });
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    if (testDir && fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. First subtitle waits for the voice and stays inside its scene', async () => {
    await page.click('#export-btn');
    await page.waitForFunction(
      () => window.__TEST_STATE__.export.status.includes('Video exportado') || window.__TEST_STATE__.export.status.includes('Error'),
      null,
      { timeout: 90000 }
    );
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(Math.abs(probeDuration(outputPath) - 6)).toBeLessThanOrEqual(0.2);

    const beforeVoice = countWhitePixels(outputPath, 1.2, path.join(testDir, 'f12.rgb'));
    const insideScene1 = countWhitePixels(outputPath, 2.2, path.join(testDir, 'f22.rgb'));
    const insideScene2 = countWhitePixels(outputPath, 5.5, path.join(testDir, 'f55.rgb'));

    expect(beforeVoice).toBeLessThan(50);
    expect(insideScene1).toBeGreaterThan(200);
    expect(insideScene2).toBeGreaterThan(200);
    expect(pageErrors).toEqual([]);
  });
});
