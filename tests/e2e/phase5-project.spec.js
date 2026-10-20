const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ffmpegPath = require('ffmpeg-static');
const { CURRENT_PROJECT_VERSION } = require('../../app/core/project-schema.js');

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

async function waitForTestExports(page) {
  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__APP_MOUNTED__, { timeout: 15000 });
}

test.describe.serial('Video Maker - Phase 5 Projects', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePath;
  let audioPath;
  let savedProjectPath;
  let missingProjectPath;
  let missingImagePath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-project-'));
    imagePath = path.join(testDir, 'escena1.png');
    generateGradientPng(imagePath);
    audioPath = path.join(testDir, 'narration.wav');
    generateWav(audioPath, 4);
    savedProjectPath = path.join(testDir, 'proyecto.vmproj');
    missingImagePath = path.join(testDir, 'gone.png');
    missingProjectPath = path.join(testDir, 'faltante.vmproj');

    fs.writeFileSync(missingProjectPath, JSON.stringify({
      version: 1,
      images: [{ name: 'gone.png', path: missingImagePath }],
      audio: { narration: { name: 'narration.wav', path: audioPath, duration: 4 } },
      script: { raw: '[Escena 1] 0:00 - 0:04 Primera' },
      timeline: [{ number: 1, duration: 4 }],
      config: { outputs: ['16:9'] },
      renderOptions: {},
      timelineOptions: {}
    }, null, 2), 'utf-8');

    electronApp = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_TEST: '1',
        VM_USE_DIST: '1',
        VM_TEST_PROJECT_OUT: savedProjectPath,
        VM_TEST_PROJECT_IN: missingProjectPath
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

  test('1. Build state and save the project through the button', async () => {
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

    await page.evaluate((image) => {
      window.__TEST_STATE__.images[0].focus169 = { x: 0.2, y: 0.8, scale: 0.8 };
      window.__TEST_STATE__.config.outputs = ['16:9', '9:16'];
      window.__TEST_STATE__.config.fitMode = 'blur';
      window.__TEST_STATE__.exportOptions.zoomType = 'pulse';
      window.__TEST_STATE__.config.extras.progressBar = { enabled: true, color: '#00ff00', height: 12 };
      window.__TEST_RENDER__.renderOutputChips();
      return image;
    }, imagePath);
    await page.waitForTimeout(100);

    await page.click('#save-project-btn');
    await page.waitForTimeout(300);

    expect(fs.existsSync(savedProjectPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(savedProjectPath, 'utf-8'));
    expect(saved.version).toBe(CURRENT_PROJECT_VERSION);
    expect(saved.images[0].path).toBe(imagePath);
    expect(saved.images[0].focus169).toEqual({ x: 0.2, y: 0.8, scale: 0.8 });
    expect(saved.audio.narration.path).toBe(audioPath);
    expect(saved.timeline).toHaveLength(1);
    expect(saved.config.outputs).toEqual(['16:9', '9:16']);
    expect(saved.config.fitMode).toBe('blur');
    expect(saved.config.extras.progressBar.enabled).toBe(true);
    expect(saved.renderOptions.zoomType).toBe('pulse');

    const status = await page.locator('#project-status').textContent();
    expect(status).toContain('Guardado');
  });

  test('2. Opening a project with a missing file flags it and warns', async () => {
    await page.evaluate(() => {
      window.__TEST_STATE__.images = [];
      window.__TEST_STATE__.timeline = [];
      window.__TEST_RENDER__.renderImages();
      window.__TEST_RENDER__.renderTimeline();
    });
    await page.waitForTimeout(100);

    await page.click('#open-project-btn');
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => ({
      images: window.__TEST_STATE__.images.map(i => ({ path: i.path, missing: !!i.missing })),
      missing: window.__TEST_STATE__.project.missing,
      status: document.getElementById('project-status').textContent
    }));

    expect(state.images).toHaveLength(1);
    expect(state.images[0].path).toBe(missingImagePath);
    expect(state.images[0].missing).toBe(true);
    expect(state.missing).toContain(missingImagePath);
    expect(state.status).toContain('no encontrados');
  });

  test('3. Opening the saved project restores the full state', async () => {
    const result = await page.evaluate(async (filePath) => {
      const res = await window.api.openProject(filePath);
      window.__TEST_EXPORT__.loadProject(res.project, res.missing);
      return { missing: res.missing, filePath: res.filePath };
    }, savedProjectPath);
    await page.waitForTimeout(300);

    expect(result.missing).toEqual([]);
    expect(result.filePath).toBe(savedProjectPath);

    const state = await page.evaluate(() => ({
      images: window.__TEST_STATE__.images.length,
      timeline: window.__TEST_STATE__.timeline.length,
      outputs: window.__TEST_STATE__.config.outputs,
      fitMode: window.__TEST_STATE__.config.fitMode,
      zoomType: window.__TEST_STATE__.exportOptions.zoomType,
      progressEnabled: window.__TEST_STATE__.config.extras.progressBar.enabled,
      focus: window.__TEST_STATE__.images[0].focus169
    }));

    expect(state.images).toBe(1);
    expect(state.timeline).toBe(1);
    expect(state.outputs).toEqual(['16:9', '9:16']);
    expect(state.fitMode).toBe('blur');
    expect(state.zoomType).toBe('pulse');
    expect(state.progressEnabled).toBe(true);
    expect(state.focus).toEqual({ x: 0.2, y: 0.8, scale: 0.8 });
  });
});
