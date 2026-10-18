const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const E_MODEL_DOWNLOAD_FAILED = 'E_MODEL_DOWNLOAD_FAILED';
const E_MODEL_IMPORT_FAILED = 'E_MODEL_IMPORT_FAILED';
const E_MODEL_PATH_INVALID = 'E_MODEL_PATH_INVALID';
const E_MODEL_CANCELLED = 'E_MODEL_CANCELLED';

const KNOWN_MODELS = [
  {
    id: 'kokoro-model',
    name: 'Kokoro voz (ONNX)',
    engine: 'kokoro',
    fileName: 'kokoro-v1.0.onnx',
    sizeBytes: 310000000,
    sha256: null,
    url: 'https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx'
  },
  {
    id: 'kokoro-voices',
    name: 'Kokoro voces (bin)',
    engine: 'kokoro',
    fileName: 'voices-v1.0.bin',
    sizeBytes: 27000000,
    sha256: null,
    url: 'https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin'
  },
  {
    id: 'whisper-model',
    name: 'Whisper ggml base',
    engine: 'whisper',
    fileName: 'ggml-base.bin',
    sizeBytes: 148000000,
    sha256: null,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  }
];

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test' || env.ELECTRON_TEST === '1' || env.VM_TEST_MODELS === '1';
}

function getModelsDir(userDataDir) {
  return path.join(userDataDir, 'models');
}

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function verifyModelFile(filePath, expected = {}) {
  const result = {
    exists: false,
    size: 0,
    expectedSize: expected.sizeBytes || null,
    sizeMatches: true,
    sha256: null,
    expectedSha256: expected.sha256 || null,
    shaMatches: true,
    verified: false
  };

  if (!filePath || !fs.existsSync(filePath)) return result;

  const stat = fs.statSync(filePath);
  result.exists = true;
  result.size = stat.size;
  result.sizeMatches = expected.sizeBytes ? stat.size === expected.sizeBytes : true;

  if (expected.sha256) {
    result.sha256 = computeSha256(filePath);
    result.shaMatches = result.sha256 === expected.sha256;
  }

  result.verified = result.sizeMatches && result.shaMatches;
  return result;
}

function listModels(baseDir, catalog = KNOWN_MODELS) {
  return catalog.map((model) => {
    const filePath = path.join(baseDir, model.fileName);
    const verification = verifyModelFile(filePath, model);
    return {
      id: model.id,
      name: model.name,
      engine: model.engine,
      fileName: model.fileName,
      path: filePath,
      installed: verification.exists,
      verified: verification.verified,
      size: verification.size,
      expectedSize: verification.expectedSize,
      missing: !verification.exists
    };
  });
}

function findModel(fileName, catalog = KNOWN_MODELS) {
  return catalog.find(model => model.fileName === fileName) || null;
}

function importModel(sourcePath, baseDir, catalog = KNOWN_MODELS) {
  if (!sourcePath || !path.isAbsolute(sourcePath)) {
    throw new Error(`${E_MODEL_PATH_INVALID}: sourcePath must be an absolute path`);
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`${E_MODEL_PATH_INVALID}: file not found: ${sourcePath}`);
  }
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) {
    throw new Error(`${E_MODEL_IMPORT_FAILED}: not a file: ${sourcePath}`);
  }

  fs.mkdirSync(baseDir, { recursive: true });
  const fileName = path.basename(sourcePath);
  const dest = path.join(baseDir, fileName);
  fs.copyFileSync(sourcePath, dest);

  const model = findModel(fileName, catalog);
  const verification = model
    ? verifyModelFile(dest, model)
    : { exists: true, size: fs.statSync(dest).size, verified: false, expectedSize: null };
  return { fileName, path: dest, verification };
}

function downloadToFile(url, dest, hooks = {}) {
  return new Promise((resolve, reject) => {
    const onProgress = typeof hooks.onProgress === 'function' ? hooks.onProgress : () => {};
    const signal = hooks.signal;
    let request = null;
    let cancelled = false;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const onAbort = () => {
      cancelled = true;
      try { if (request) request.destroy(); } catch (err) { void err; }
    };

    if (signal) {
      if (signal.aborted) { reject(new Error(`${E_MODEL_CANCELLED}: download cancelled`)); return; }
      if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort);
    }

    const cleanup = () => {
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort);
    };

    const handleResponse = (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadToFile(response.headers.location, dest, hooks).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        finish(reject, new Error(`${E_MODEL_DOWNLOAD_FAILED}: HTTP ${response.statusCode}`));
        return;
      }
      const total = parseInt(response.headers['content-length'] || '0', 10);
      let received = 0;
      const fileStream = fs.createWriteStream(dest);
      response.on('data', (chunk) => {
        received += chunk.length;
        onProgress({ progress: total ? Math.round((received / total) * 100) : 0, received, total });
      });
      response.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(() => finish(resolve, { bytes: received, total })); });
      fileStream.on('error', (err) => finish(reject, new Error(`${E_MODEL_DOWNLOAD_FAILED}: ${err.message}`)));
    };

    request = https.get(url, handleResponse);
    request.on('error', (err) => {
      if (cancelled) finish(reject, new Error(`${E_MODEL_CANCELLED}: download cancelled`));
      else finish(reject, new Error(`${E_MODEL_DOWNLOAD_FAILED}: ${err.message}`));
    });
    request.setTimeout(120000, () => { request.destroy(); finish(reject, new Error(`${E_MODEL_DOWNLOAD_FAILED}: timeout`)); });
    void cleanup;
  });
}

async function downloadModel(model, baseDir, options = {}) {
  const env = options.env || process.env;
  const dest = options.destination || path.join(baseDir, model.fileName);
  fs.mkdirSync(baseDir, { recursive: true });

  const simulated = options.simulate === true || isTestMode(env);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  if (simulated) {
    const bytes = options.simulateBytes || 4096;
    const buffer = Buffer.alloc(bytes, 0x41);
    onProgress({ progress: 50, received: Math.floor(bytes / 2), total: bytes });
    fs.writeFileSync(dest, buffer);
    onProgress({ progress: 100, received: bytes, total: bytes });
    const verification = verifyModelFile(dest, { sizeBytes: bytes, sha256: options.simulateSha256 || null });
    return { model: model.id, path: dest, bytes, simulated: true, verified: verification.verified, verification };
  }

  const result = await downloadToFile(model.url, dest, { onProgress, signal: options.signal });
  const verification = verifyModelFile(dest, model);
  if (!verification.verified) {
    throw new Error(`${E_MODEL_DOWNLOAD_FAILED}: verification failed for ${model.fileName}`);
  }
  return { model: model.id, path: dest, bytes: result.bytes, simulated: false, verified: true, verification };
}

module.exports = {
  E_MODEL_DOWNLOAD_FAILED,
  E_MODEL_IMPORT_FAILED,
  E_MODEL_PATH_INVALID,
  E_MODEL_CANCELLED,
  KNOWN_MODELS,
  isTestMode,
  getModelsDir,
  computeSha256,
  verifyModelFile,
  listModels,
  findModel,
  importModel,
  downloadToFile,
  downloadModel
};
