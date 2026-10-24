'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');

const ROOT = path.join(__dirname, '..');

function fail(message) {
  process.stderr.write(`[blue-check] ERROR: ${message}\n`);
  process.exit(1);
}

function countBluePixels(bitmap) {
  let count = 0;
  const coordinates = [];
  for (let offset = 0; offset + 3 < bitmap.bitmap.length; offset += 4) {
    const blue = bitmap.bitmap[offset];
    const green = bitmap.bitmap[offset + 1];
    const red = bitmap.bitmap[offset + 2];
    if (blue > red + 40 && blue > green + 20) {
      const pixel = offset / 4;
      coordinates.push({ x: pixel % bitmap.width, y: Math.floor(pixel / bitmap.width), r: red, g: green, b: blue });
      count += 1;
    }
  }
  return { count, coordinates };
}

async function decodePng(app, pngPath) {
  const decoded = await app.evaluate(({ nativeImage }, arg) => {
    const image = nativeImage.createFromPath(arg.pngPath);
    if (image.isEmpty()) throw new Error(`nativeImage no pudo leer ${arg.pngPath}`);
    const size = image.getSize();
    return { width: size.width, height: size.height, bitmap: Buffer.from(image.toBitmap()) };
  }, { pngPath });
  if (!decoded.width || !decoded.height) fail(`dimensiones inválidas: ${JSON.stringify(decoded)}`);
  return decoded;
}

async function countPng(app, name, pngPath) {
  const decoded = await decodePng(app, pngPath);
  const result = countBluePixels(decoded);
  process.stdout.write(`${name}: ${result.count} blue pixels (${decoded.width}x${decoded.height})\n`);
  for (const coordinate of result.coordinates.slice(0, 10)) {
    process.stdout.write(`  ${name} ${coordinate.x},${coordinate.y} rgba(${coordinate.r},${coordinate.g},${coordinate.b})\n`);
  }
  return result;
}

async function createPngFromBitmap(app, data, width, height) {
  return app.evaluate(({ nativeImage }, arg) => (
    nativeImage.createFromBitmap(Buffer.from(arg.data), { width: arg.width, height: arg.height }).toPNG()
  ), { data: Uint8Array.from(data), width, height });
}

async function createProofImages(app, proofDir) {
  const names = ['proof-blue', 'proof-red', 'proof-black'];
  const paths = [];
  for (const name of names) {
    const data = Buffer.alloc(64 * 64 * 4);
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = name === 'proof-blue' ? 255 : 0;
      data[offset + 1] = 0;
      data[offset + 2] = name === 'proof-red' ? 255 : 0;
      data[offset + 3] = 255;
    }
    const png = await createPngFromBitmap(app, data, 64, 64);
    const pngPath = path.join(proofDir, `${name}.png`);
    fs.writeFileSync(pngPath, png);
    paths.push(pngPath);
  }
  return paths;
}

async function runProof(app, proofDir) {
  process.stdout.write('DETECTOR PROOF\n');
  const pngs = await createProofImages(app, proofDir);
  let failed = false;
  for (const pngPath of pngs) {
    const result = await countPng(app, path.basename(pngPath, '.png'), pngPath);
    if (path.basename(pngPath) === 'proof-blue.png' && result.count !== 64 * 64) failed = true;
    if ((path.basename(pngPath) === 'proof-red.png' || path.basename(pngPath) === 'proof-black.png') && result.count !== 0) failed = true;
  }
  if (failed) fail('el detector no reconoce el patrón sintético');
}

async function main() {
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-blue-check-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_TEST: '1',
      VM_TEST_USERDATA: fs.mkdtempSync(path.join(os.tmpdir(), 'vm-blue-check-userdata-'))
    }
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => window.__TEST_STATE__ && window.__TEST_RENDER__ && window.__TEST_EXPORT__, null, { timeout: 15000 });

  if (process.argv.includes('--proof')) {
    await runProof(app, screenshotDir);
    await app.close();
    return;
  }

  const screens = [
    { name: 'initial', png: path.join(screenshotDir, 'initial.png') },
    { name: 'loaded', png: path.join(screenshotDir, 'loaded.png') },
    { name: 'voice-panel', png: path.join(screenshotDir, 'voice-panel.png') },
    { name: 'kokoro-engine', png: path.join(screenshotDir, 'kokoro-engine.png') },
    { name: 'kokoro-voices', png: path.join(screenshotDir, 'kokoro-voices.png') },
    { name: 'models', png: path.join(screenshotDir, 'models.png') },
    { name: 'dropdowns-open', png: path.join(screenshotDir, 'dropdowns-open.png') }
  ];

  await window.screenshot({ path: screens[0].png });

  const projectPngs = {};
  for (const [name, red] of [['project-red', 255], ['project-black', 0]]) {
    const data = Buffer.alloc(128 * 72 * 4);
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = red;
      data[offset + 3] = 255;
    }
    const png = await createPngFromBitmap(app, data, 128, 72);
    const pngPath = path.join(screenshotDir, `${name}.png`);
    fs.writeFileSync(pngPath, png);
    projectPngs[name] = pngPath;
  }

  await window.evaluate((arg) => {
    const state = window.__TEST_STATE__;
    state.images = [
      { name: 'project-red.png', path: arg.red, size: 1024, type: 'image', preview: `file://${arg.red}` },
      { name: 'project-black.png', path: arg.black, size: 1024, type: 'image', preview: `file://${arg.black}` }
    ];
    state.script.raw = '[Escena 1] 0:00 - 0:03 Proyecto cargado\n[Escena 2] 0:03 - 0:06 Paleta verificada';
    state.config.outputs = ['16:9'];
    window.__TEST_RENDER__.renderImages();
    window.__TEST_RENDER__.renderOutputChips();
    window.__TEST_RENDER__.renderAll();
  }, projectPngs);
  await window.waitForTimeout(100);
  await window.screenshot({ path: screens[1].png });

  await window.click('#voice-panel-toggle-btn');
  await window.waitForFunction(() => !document.getElementById('voice-panel').hidden, null, { timeout: 5000 });
  await window.screenshot({ path: screens[2].png });

  await window.selectOption('#voice-engine', 'kokoro');
  await window.waitForFunction(() => document.getElementById('voice-select').options.length > 0, null, { timeout: 5000 });
  await window.screenshot({ path: screens[3].png });

  await window.evaluate(() => {
    const state = window.__TEST_STATE__;
    state.models = [{
      id: 'kokoro',
      name: 'Kokoro voz (ONNX)',
      files: [
        { fileName: 'kokoro-v1.0.onnx', exists: true, verified: true, userDataExists: true },
        { fileName: 'voices-v1.0.bin', exists: true, verified: true, userDataExists: true }
      ]
    }];
    window.__TEST_RENDER__.renderAll();
  });
  await window.waitForFunction(() => document.getElementById('voice-select').options.length > 0, null, { timeout: 5000 });
  await window.screenshot({ path: screens[4].png });

  await window.evaluate(() => {
    document.getElementById('models-panel').scrollIntoView({ block: 'start' });
  });
  await window.waitForTimeout(100);
  await window.screenshot({ path: screens[6].png });

  await window.evaluate(() => {
    document.querySelectorAll('select').forEach((select) => {
      select.dataset.blueCheckOriginalSize = String(select.size);
      select.size = Math.max(1, Math.min(select.options.length, 8));
      select.focus();
    });
    document.body.scrollIntoView({ block: 'start' });
  });
  await window.waitForTimeout(100);
  await window.screenshot({ path: screens[7].png });
  await window.evaluate(() => {
    document.querySelectorAll('select').forEach((select) => {
      select.size = Number(select.dataset.blueCheckOriginalSize || 1);
      delete select.dataset.blueCheckOriginalSize;
      select.blur();
    });
  });

  let blueCount = 0;
  for (const screen of screens) {
    const result = await countPng(app, screen.name, screen.png);
    blueCount += result.count;
  }
  await runProof(app, screenshotDir);

  await app.close();
  if (blueCount > 0) {
    fail(`se detectaron ${blueCount} píxeles azules en pantallas reales`);
  }
  process.stdout.write('blue-check SUCCESS\n');
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));
