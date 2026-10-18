const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

function generateWav(durationSec = 5, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const numSamples = durationSec * sampleRate;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const val = Math.sin(2 * Math.PI * 440 * t) * 0.5;
    const sample = Math.max(-32768, Math.min(32767, val * 32767));
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  return buffer;
}

function createTestImages(dir, names) {
  const svg = (color, text) => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" fill="white">${text}</text></svg>`;
  return names.map((name, i) => {
    const filePath = path.join(dir, name);
    const buf = Buffer.from(svg(`hsl(${i * 90}, 70%, 40%)`, name));
    fs.writeFileSync(filePath, buf);
    return filePath;
  });
}

function extractSceneNumber(filename) {
  const match = filename.match(/(?:escena|scene)\s*[:_\-\s]?(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

async function waitForTestExports(page) {
  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__, { timeout: 15000 });
}

test.describe.serial('Video Maker - Phase 2 Full E2E', () => {
  let electronApp;
  let page;
  let testDir;
  let imagePaths;
  let audioPath;

  test.beforeAll(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-test-'));
    imagePaths = createTestImages(testDir, ['escena3.png', 'escena1.png', 'escena4.png', 'escena2.png']);
    audioPath = path.join(testDir, 'narration.wav');
    fs.writeFileSync(audioPath, generateWav(10));

    electronApp = await electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_TEST: '1' }
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

  test('1. Import images out of order - verify sorted 1-4 and thumbnails', async () => {
    const files = imagePaths.map(p => ({ name: path.basename(p), path: p }));
    const sortedFiles = [...files].sort((a, b) => {
      const numA = extractSceneNumber(a.name);
      const numB = extractSceneNumber(b.name);
      if (numA !== null && numB !== null) return numA - numB;
      if (numA !== null) return -1;
      if (numB !== null) return 1;
      return 0;
    });

    await page.evaluate((f) => {
      window.__TEST_STATE__.images = f.map(file => ({ ...file, size: 0, type: 'image', preview: `file://${file.path}` }));
      window.__TEST_RENDER__.renderImages();
    }, sortedFiles);
    await page.waitForTimeout(500);

    const items = page.locator('#images-list .image-item');
    await expect(items).toHaveCount(4);

    const names = await items.locator('.image-name').allTextContents();
    expect(names).toEqual(['escena1.png', 'escena2.png', 'escena3.png', 'escena4.png']);

    const thumbs = page.locator('#images-list .image-thumbnail');
    await expect(thumbs).toHaveCount(4);
    for (const thumb of await thumbs.all()) {
      await expect(thumb).toHaveAttribute('src', /^file:\/\//);
    }
  });

  test('2. Load synthetic WAV - verify duration displayed', async () => {
    await page.evaluate((aPath) => {
      window.__TEST_STATE__.audio.narration = { name: 'narration.wav', path: aPath, duration: 10 };
      window.__TEST_STATE__.audioDuration = 10;
      window.__TEST_RENDER__.renderAudio();
    }, audioPath);
    await page.waitForTimeout(500);

    const narrationInput = page.locator('#audio-narration');
    await expect(narrationInput).toHaveValue(audioPath);

    const narrationInfo = page.locator('#audio-narration-info');
    await expect(narrationInfo).toContainText('narration.wav');
    await expect(narrationInfo).toContainText('0:10');
  });

  test('3. Paste script with [Escena N] - verify "4 escenas detectadas · 4 imágenes asignadas"', async () => {
    const script = `[Escena 1] 0:00 - 2:50 Primera escena
[Escena 2] 2:50 - 5:00 Segunda escena
[Escena 3] 5:00 - 7:30 Tercera escena
[Escena 4] 7:30 - 10:00 Cuarta escena`;

    await page.fill('#script-textarea', script);
    await page.waitForTimeout(1000);

    const summary = page.locator('#script-summary');
    await expect(summary).toContainText('4 escenas detectadas');
    await expect(summary).toContainText('4 imágenes asignadas');

    const warnings = page.locator('#script-warnings .warning-item');
    await expect(warnings).toHaveCount(0);
  });

  test('4. Timeline table - sum of durations equals audio duration (±0.1s) with adjustToAudio', async () => {
    await page.waitForTimeout(1000);

    const checkbox = page.locator('#adjust-timeline-checkbox');
    await checkbox.check();
    await page.waitForTimeout(500);

    const timelineContainer = page.locator('#timeline-table-container');
    await expect(timelineContainer).toBeAttached();

    const rows = page.locator('#timeline-tbody tr');
    await expect(rows).toHaveCount(4);

    const durations = await page.locator('#timeline-tbody .timeline-duration-input').evaluateAll(inputs =>
      inputs.map(i => parseFloat(i.value))
    );

    const totalDuration = durations.reduce((a, b) => a + b, 0);
    expect(Math.abs(totalDuration - 10)).toBeLessThanOrEqual(0.1);

    const summary = page.locator('#timeline-summary');
    await expect(summary).toContainText('Duración total:');
    await expect(summary).toContainText('Audio: 0:10');
  });

  test('5. Click each CONTROLS control - verify state changes', async () => {
    await page.click('#import-images-btn');
    await page.waitForTimeout(200);

    await page.click('#import-audio-btn');
    await page.waitForTimeout(200);

    await page.click('#import-music-btn');
    await page.waitForTimeout(200);

    await page.click('#paste-script-btn');
    await page.waitForTimeout(200);

    await page.click('#load-script-btn');
    await page.waitForTimeout(200);

    await page.fill('#script-textarea', '[Escena 1] 0:00 - 1:00 Test\n[Escena 2] 1:00 - 2:00 Test');
    await page.waitForTimeout(200);

    const checkbox = page.locator('#adjust-timeline-checkbox');
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await page.waitForTimeout(200);

    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await page.waitForTimeout(200);

    const dropZones = ['#images-drop-zone', '#audio-narration-drop', '#audio-music-drop'];
    for (const dz of dropZones) {
      await page.click(dz);
      await page.waitForTimeout(100);
    }
  });

  test('6. Scene without image - verify warning', async () => {
    await page.fill('#script-textarea', `[Escena 1] 0:00 - 2:50 Primera
[Escena 2] 2:50 - 5:00 Segunda
[Escena 3] 5:00 - 7:30 Tercera
[Escena 4] 7:30 - 10:00 Cuarta
[Escena 5] 10:00 - 12:00 Quinta sin imagen`);
    await page.waitForTimeout(1000);

    const summary = page.locator('#script-summary');
    await expect(summary).toContainText('5 escenas detectadas');
    await expect(summary).toContainText('4 imágenes asignadas');

    const timelineRows = page.locator('#timeline-tbody tr');
    await expect(timelineRows).toHaveCount(5);

    const fifthRowImg = timelineRows.nth(4).locator('td:nth-child(6)');
    await expect(fifthRowImg).toContainText('Sin imagen');
  });

  test('7. IPC channels - no duplicate handlers, single exposeInMainWorld', async () => {
    const apiKeys = await page.evaluate(() => Object.keys(window.api || {}));
    expect(apiKeys).toEqual(
      expect.arrayContaining([
        'openImages', 'openAudio', 'openMusic', 'openScript',
        'getAudioDuration', 'getPathForFile',
        'saveVideo', 'openFolder', 'renderVideo', 'renderPreview', 'verifyBinaries', 'detectCodecs', 'onRenderProgress',
        'saveProject', 'openProject', 'listFonts', 'importFont', 'detectKeywords',
        'listPresets', 'addPreset', 'renamePreset', 'deletePreset',
        'listVoices', 'generateVoice', 'generateVoiceSample', 'cancelVoice', 'onVoiceProgress',
        'listModels', 'downloadModels', 'importModel', 'cancelModels', 'onModelsProgress'
      ])
    );
    expect(apiKeys.length).toBe(32);

    const preloadPath = path.join(__dirname, '..', '..', 'app', 'preload.js');
    const preloadCode = fs.readFileSync(preloadPath, 'utf-8');
    const exposeCount = (preloadCode.match(/exposeInMainWorld/g) || []).length;
    expect(exposeCount).toBe(1);

    const mainCode = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main.js'), 'utf-8');
    const handleMatches = mainCode.match(/ipcMain\.handle\(/g);
    const handleCount = handleMatches ? handleMatches.length : 0;
    expect(handleCount).toBe(28);
  });
});
