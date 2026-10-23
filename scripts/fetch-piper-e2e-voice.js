'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { MODEL_SPECS } = require('../app/core/model-specs.js');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, '.engine-cache', 'piper-e2e-voice');
const VOICE_ID = 'es_MX-ald-medium';

function log(message) {
  process.stdout.write(`[fetch-piper-e2e-voice] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[fetch-piper-e2e-voice] ERROR: ${message}\n`);
  process.exit(1);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function httpGet(url, onResponse) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'video-maker-e2e-voice' } }, (response) => {
      const status = response.statusCode;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        httpGet(next, onResponse).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`respuesta HTTP ${status} para ${url}`));
        return;
      }
      onResponse(response).then(resolve, reject);
    }).on('error', reject);
  });
}

async function downloadFile(file) {
  const destination = path.join(CACHE, file.fileName);
  if (fs.existsSync(destination)) {
    const stat = fs.statSync(destination);
    const digest = await sha256File(destination);
    if (stat.size === file.sizeBytes && digest === file.sha256) {
      log(`ok (cache): ${file.fileName}`);
      return;
    }
    log(`cache inválido, se vuelve a descargar: ${file.fileName}`);
    fs.rmSync(destination, { force: true });
  }

  fs.mkdirSync(CACHE, { recursive: true });
  const partial = `${destination}.part`;
  fs.rmSync(partial, { force: true });
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  log(`descargando ${file.fileName}: ${file.url}`);
  await httpGet(file.url, (response) => new Promise((resolve, reject) => {
    const output = fs.createWriteStream(partial);
    response.on('data', (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    response.on('error', reject);
    output.on('error', reject);
    output.on('finish', () => output.close(() => resolve()));
    response.pipe(output);
  }));

  const digest = hash.digest('hex');
  if (bytes !== file.sizeBytes || digest !== file.sha256) {
    fs.rmSync(partial, { force: true });
    fail(`verificación fallida para ${file.fileName}: esperado ${file.sizeBytes} bytes/${file.sha256}, obtenido ${bytes} bytes/${digest}`);
  }
  fs.renameSync(partial, destination);
  log(`verificado ${file.fileName} (${bytes} bytes, sha256 ${digest})`);
}

async function main() {
  const piper = MODEL_SPECS.piper;
  const files = piper.files.filter((file) => file.fileName.startsWith(`${VOICE_ID}.`));
  if (files.length !== 2) fail(`el catálogo debe contener exactamente dos archivos para ${VOICE_ID}`);
  for (const file of files) {
    if (!/^https:\/\//.test(file.url)) fail(`URL no segura para ${file.fileName}`);
    if (!/^[0-9a-f]{64}$/.test(file.sha256)) fail(`SHA-256 inválido para ${file.fileName}`);
    if (!Number.isInteger(file.sizeBytes) || file.sizeBytes <= 0) fail(`tamaño inválido para ${file.fileName}`);
  }
  for (const file of files) await downloadFile(file);
  log(`voz lista: ${VOICE_ID}`);
}

if (require.main === module) {
  main().catch((error) => fail(error && error.message ? error.message : String(error)));
}
