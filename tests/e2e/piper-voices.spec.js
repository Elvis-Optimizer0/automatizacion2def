'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const { MODEL_SPECS } = require('../../app/core/model-specs.js');

const VOICE_ID = 'es_MX-ald-medium';
const VOICE_DIR = process.env.VM_TEST_PIPER_VOICE_DIR;
const PIPER_VOICES = [
  'es_MX-ald-medium',
  'es_MX-ald-x_low',
  'es_ES-carlfm-x_low',
  'en_US-lessac-medium',
  'en_US-lessac-low'
];

let voiceServer;
let voiceServerUrl;

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function startVoiceServer(voiceDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname.startsWith('/bad/')) {
        const payload = Buffer.from('contenido-invalido-para-verificacion-sha256');
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length });
        response.end(payload);
        return;
      }
      if (pathname.startsWith('/slow/')) {
        const total = 64 * 1024 * 1024;
        const chunk = Buffer.alloc(256 * 1024, 0x50);
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': total });
        let sent = 0;
        const timer = setInterval(() => {
          if (request.destroyed || response.destroyed || sent >= total) {
            clearInterval(timer);
            response.end();
            return;
          }
          response.write(chunk);
          sent += chunk.length;
        }, 10);
        request.on('close', () => clearInterval(timer));
        return;
      }
      const fileName = path.basename(pathname);
      const filePath = path.join(voiceDir, fileName);
      if (!fs.existsSync(filePath)) {
        response.writeHead(404);
        response.end('not found');
        return;
      }
      const stat = fs.statSync(filePath);
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': stat.size });
      fs.createReadStream(filePath).pipe(response);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      url: `http://127.0.0.1:${server.address().port}`
    }));
  });
}

async function launchApp(extraEnv = {}) {
  const userDataDir = makeTempDir('vm-piper-e2e-userdata-');
  const electronApp = await electron.launch({
    args: ['.'],
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      VM_TEST_USERDATA: userDataDir,
      ...extraEnv
    }
  });
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__TEST_EXPORT__, null, { timeout: 15000 });
  return { electronApp, page, userDataDir };
}

async function closeApp(app) {
  if (app.electronApp) await app.electronApp.close();
  if (app.userDataDir && fs.existsSync(app.userDataDir)) fs.rmSync(app.userDataDir, { recursive: true, force: true });
}

async function openPiperPanel(page, expectedVoices) {
  await page.click('#voice-panel-toggle-btn');
  await page.waitForFunction(() => !document.getElementById('voice-panel').hidden, null, { timeout: 5000 });
  await page.selectOption('#voice-engine', 'piper');
  await page.waitForFunction(() => !document.getElementById('piper-voices-panel').hidden, null, { timeout: 5000 });
  await page.waitForFunction((count) => document.querySelectorAll('.piper-voice-row').length === count, expectedVoices, { timeout: 5000 });
}

function voiceRow(page, voiceId) {
  return page.locator(`.piper-voice-row[data-voice-id="${voiceId}"]`);
}

async function waitForVoiceState(page, voiceId, state, timeout = 60000) {
  await page.waitForFunction(({ voiceId, state }) => {
    const row = document.querySelector(`.piper-voice-row[data-voice-id="${voiceId}"]`);
    return !!row && row.querySelector('.piper-voice-state')?.dataset.state === state;
  }, { voiceId, state }, { timeout });
}

function createPiperStub(dir, failWithCode = 0) {
  const stubPath = path.join(dir, 'piper-stub.js');
  const stub = `
    const fs = require('fs');
    const args = process.argv.slice(2);
    const outputFlagIndex = args.indexOf('--output_file') >= 0 ? args.indexOf('--output_file') : args.indexOf('-f');
    const outputPath = outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : '';
    if (${failWithCode}) {
      process.stderr.write('stub piper failure\\n');
      process.exit(${failWithCode});
    }
    const sampleRate = 22050;
    const channels = 1;
    const bitsPerSample = 16;
    const samples = 1200;
    const dataSize = samples * channels * bitsPerSample / 8;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28);
    header.writeUInt16LE(channels * bitsPerSample / 8, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    const pcm = Buffer.alloc(dataSize);
    for (let index = 0; index < samples; index += 1) {
      pcm.writeInt16LE(Math.round(Math.sin(index / 8) * 12000), index * 2);
    }
    fs.writeFileSync(outputPath, Buffer.concat([header, pcm]));
    process.stdout.write('stub piper wav\\n');
  `;
  fs.writeFileSync(stubPath, stub);
  return stubPath;
}

function piperModelFiles(userDataDir) {
  return path.join(userDataDir, 'models', 'piper');
}

function installAllPiperModelMarkers(userDataDir) {
  const target = piperModelFiles(userDataDir);
  fs.mkdirSync(target, { recursive: true });
  for (const file of MODEL_SPECS.piper.files) {
    const source = path.join(VOICE_DIR, file.fileName);
    const destination = path.join(target, file.fileName);
    if (fs.existsSync(source)) fs.copyFileSync(source, destination);
    else fs.writeFileSync(destination, Buffer.alloc(8192));
  }
  fs.mkdirSync(path.join(userDataDir, 'models', 'piper', 'espeak-ng-data'), { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'models', 'piper', 'espeak-ng-data', 'stub'), 'data');
}

test.describe('Piper voices dedicated E2E', () => {
  test.beforeAll(async () => {
    if (!VOICE_DIR || !fs.existsSync(path.join(VOICE_DIR, `${VOICE_ID}.onnx`))) {
      throw new Error('VM_TEST_PIPER_VOICE_DIR no contiene la voz E2E verificada');
    }
    const server = await startVoiceServer(VOICE_DIR);
    voiceServer = server.server;
    voiceServerUrl = server.url;
  });

  test.afterAll(async () => {
    if (voiceServer) await new Promise((resolve) => voiceServer.close(resolve));
  });

  test('selects Piper engine and shows the voice as no descargada', async () => {
    const app = await launchApp();
    try {
      await openPiperPanel(app.page, PIPER_VOICES.length);
      await expect(voiceRow(app.page, VOICE_ID)).toHaveAttribute('data-voice-id', VOICE_ID);
      await expect(voiceRow(app.page, VOICE_ID).locator('.piper-voice-state')).toHaveAttribute('data-state', 'no_descargada');
    } finally {
      await closeApp(app);
    }
  });

  test('downloads the real-sha Piper voice and shows lista', async () => {
    test.setTimeout(180000);
    const app = await launchApp({ VM_PIPER_VOICES_BASE_URL: voiceServerUrl });
    try {
      await openPiperPanel(app.page, PIPER_VOICES.length);
      await voiceRow(app.page, VOICE_ID).locator('[data-action="download"]').click();
      await waitForVoiceState(app.page, VOICE_ID, 'lista');
      const modelsDir = piperModelFiles(app.userDataDir);
      expect(fs.existsSync(path.join(modelsDir, `${VOICE_ID}.onnx`))).toBe(true);
      expect(fs.existsSync(path.join(modelsDir, `${VOICE_ID}.onnx.json`))).toBe(true);
      expect(fs.readdirSync(modelsDir).some((file) => file.endsWith('.part'))).toBe(false);
    } finally {
      await closeApp(app);
    }
  });

  test('marks a wrong-hash download as error and leaves no .part', async () => {
    test.setTimeout(60000);
    const app = await launchApp({ VM_PIPER_VOICES_BASE_URL: `${voiceServerUrl}/bad` });
    try {
      await openPiperPanel(app.page, PIPER_VOICES.length);
      await voiceRow(app.page, VOICE_ID).locator('[data-action="download"]').click();
      await waitForVoiceState(app.page, VOICE_ID, 'error', 30000);
      const modelsDir = piperModelFiles(app.userDataDir);
      if (fs.existsSync(modelsDir)) {
        expect(fs.readdirSync(modelsDir).some((file) => file.endsWith('.part'))).toBe(false);
      }
    } finally {
      await closeApp(app);
    }
  });

  test('cancels a mid-download and leaves no .part', async () => {
    test.setTimeout(60000);
    const app = await launchApp({ VM_PIPER_VOICES_BASE_URL: `${voiceServerUrl}/slow` });
    try {
      await openPiperPanel(app.page, PIPER_VOICES.length);
      await voiceRow(app.page, VOICE_ID).locator('[data-action="download"]').click();
      await waitForVoiceState(app.page, VOICE_ID, 'descargando', 15000);
      await voiceRow(app.page, VOICE_ID).locator('[data-action="cancel"]').click();
      await pageWaitForNotDownloading(app.page, VOICE_ID);
      const modelsDir = piperModelFiles(app.userDataDir);
      if (fs.existsSync(modelsDir)) {
        expect(fs.readdirSync(modelsDir).some((file) => file.endsWith('.part'))).toBe(false);
      }
    } finally {
      await closeApp(app);
    }
  });

  test('imports a valid onnx/json pair', async () => {
    const app = await launchApp();
    const onnxPath = path.join(VOICE_DIR, `${VOICE_ID}.onnx`);
    const jsonPath = path.join(VOICE_DIR, `${VOICE_ID}.onnx.json`);
    try {
      const result = await app.page.evaluate(async ({ voiceId, onnxPath, jsonPath }) => {
        const imported = await window.api.importPiperVoice(voiceId, onnxPath, jsonPath);
        window.__TEST_STATE__.models = imported.models;
        window.__TEST_RENDER__.syncVoiceControls();
        return imported;
      }, { voiceId: VOICE_ID, onnxPath, jsonPath });
      const modelsDir = piperModelFiles(app.userDataDir);
      expect(fs.readFileSync(path.join(modelsDir, `${VOICE_ID}.onnx`))).toEqual(fs.readFileSync(onnxPath));
      expect(fs.readFileSync(path.join(modelsDir, `${VOICE_ID}.onnx.json`))).toEqual(fs.readFileSync(jsonPath));
      expect(result.models.find((model) => model.id === 'piper').files.every((file) => file.userDataExists)).toBe(true);
    } finally {
      await closeApp(app);
    }
  });

  test('shows an error when the imported json is missing', async () => {
    const app = await launchApp();
    const onnxPath = path.join(VOICE_DIR, `${VOICE_ID}.onnx`);
    const jsonPath = path.join(makeTempDir('vm-piper-e2e-invalid-'), 'missing.json');
    try {
      const error = await app.page.evaluate(async ({ voiceId, onnxPath, jsonPath }) => {
        try {
          await window.api.importPiperVoice(voiceId, onnxPath, jsonPath);
          return null;
        } catch (err) {
          return err.message || String(err);
        }
      }, { voiceId: VOICE_ID, onnxPath, jsonPath });
      expect(error).toContain('no encontrado');
      expect(fs.existsSync(piperModelFiles(app.userDataDir))).toBe(false);
    } finally {
      await closeApp(app);
    }
  });

  test('shows an error when the imported json is unparseable', async () => {
    const app = await launchApp();
    const sourceDir = makeTempDir('vm-piper-e2e-json-');
    const onnxPath = path.join(VOICE_DIR, `${VOICE_ID}.onnx`);
    const jsonPath = path.join(sourceDir, `${VOICE_ID}.onnx.json`);
    fs.writeFileSync(jsonPath, '{ invalid json');
    try {
      const error = await app.page.evaluate(async ({ voiceId, onnxPath, jsonPath }) => {
        try {
          await window.api.importPiperVoice(voiceId, onnxPath, jsonPath);
          return null;
        } catch (err) {
          return err.message || String(err);
        }
      }, { voiceId: VOICE_ID, onnxPath, jsonPath });
      expect(error).toContain('JSON inválido');
      expect(fs.existsSync(piperModelFiles(app.userDataDir))).toBe(false);
    } finally {
      await closeApp(app);
    }
  });

  test('generates a Piper sample from the sample button', async () => {
    const stubDir = makeTempDir('vm-piper-e2e-stub-');
    const stubPath = createPiperStub(stubDir);
    const dataDir = path.join(stubDir, 'espeak-ng-data');
    fs.mkdirSync(dataDir, { recursive: true });
    const app = await launchApp({ VM_PIPER_EXE: stubPath, VM_PIPER_DATA: dataDir });
    try {
      await openPiperPanel(app.page, PIPER_VOICES.length);
      await app.page.evaluate(() => {
        const state = window.__TEST_STATE__;
        state.models = [{
          id: 'piper',
          name: 'Piper TTS voces',
          files: [
            { fileName: 'es_MX-ald-medium.onnx', exists: true, verified: true, userDataExists: true },
            { fileName: 'es_MX-ald-medium.onnx.json', exists: true, verified: true, userDataExists: true }
          ]
        }];
        window.__TEST_RENDER__.syncVoiceControls();
      });
      await voiceRow(app.page, VOICE_ID).locator('[data-action="sample"]').click();
      await app.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((toast) => toast.textContent.includes('Muestra generada')), null, { timeout: 30000 });
      const voicesDir = path.join(app.userDataDir, 'voices');
      const wavs = fs.existsSync(voicesDir) ? fs.readdirSync(voicesDir).filter((file) => file.endsWith('.wav')) : [];
      expect(wavs.length).toBeGreaterThan(0);
      const wavPath = path.join(voicesDir, wavs[0]);
      expect(fs.statSync(wavPath).size).toBeGreaterThan(44);
    } finally {
      await closeApp(app);
    }
  });

  test('generates narration with Piper and the VM_PIPER_EXE runtime', async () => {
    const stubDir = makeTempDir('vm-piper-e2e-generate-');
    const stubPath = createPiperStub(stubDir);
    const dataDir = path.join(stubDir, 'espeak-ng-data');
    fs.mkdirSync(dataDir, { recursive: true });
    const app = await launchApp({
      VM_PIPER_EXE: stubPath,
      VM_PIPER_DATA: dataDir,
      VM_PIPER_MODEL: path.join(VOICE_DIR, `${VOICE_ID}.onnx`)
    });
    installAllPiperModelMarkers(app.userDataDir);
    try {
      await app.page.click('#voice-panel-toggle-btn');
      await app.page.waitForFunction(() => !document.getElementById('voice-panel').hidden, null, { timeout: 5000 });
      await app.page.selectOption('#voice-engine', 'piper');
      await app.page.fill('#voice-text', 'Generación dedicada con Piper.');
      await app.page.click('#voice-generate-btn');
      await app.page.waitForFunction(() => document.getElementById('voice-status')?.textContent.includes('Voz generada'), null, { timeout: 30000 });
      const narration = await app.page.evaluate(() => window.__TEST_STATE__.audio.narration);
      expect(narration).toBeTruthy();
      expect(fs.existsSync(narration.path)).toBe(true);
      expect(fs.statSync(narration.path).size).toBeGreaterThan(44);
    } finally {
      await closeApp(app);
    }
  });

  test('surfaces a clear Piper engine error', async () => {
    const stubDir = makeTempDir('vm-piper-e2e-error-');
    const stubPath = createPiperStub(stubDir, 2);
    const dataDir = path.join(stubDir, 'espeak-ng-data');
    fs.mkdirSync(dataDir, { recursive: true });
    const app = await launchApp({
      VM_PIPER_EXE: stubPath,
      VM_PIPER_DATA: dataDir,
      VM_PIPER_MODEL: path.join(VOICE_DIR, `${VOICE_ID}.onnx`)
    });
    installAllPiperModelMarkers(app.userDataDir);
    try {
      await app.page.click('#voice-panel-toggle-btn');
      await app.page.waitForFunction(() => !document.getElementById('voice-panel').hidden, null, { timeout: 5000 });
      await app.page.selectOption('#voice-engine', 'piper');
      await app.page.fill('#voice-text', 'Error esperado del motor.');
      await app.page.click('#voice-generate-btn');
      await app.page.waitForFunction(() => document.getElementById('voice-status')?.textContent.includes('Error al generar la voz'), null, { timeout: 30000 });
      const status = await app.page.evaluate(() => document.getElementById('voice-status').textContent);
      expect(status).toContain('exited with code 2');
    } finally {
      await closeApp(app);
    }
  });
});

async function pageWaitForNotDownloading(page, voiceId) {
  await page.waitForFunction((wantedVoiceId) => {
    const row = document.querySelector(`.piper-voice-row[data-voice-id="${wantedVoiceId}"]`);
    const state = row?.querySelector('.piper-voice-state')?.dataset.state;
    return state === 'no_descargada' || state === 'error';
  }, voiceId, { timeout: 30000 });
}
