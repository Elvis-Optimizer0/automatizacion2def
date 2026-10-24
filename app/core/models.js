const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { CATALOG: MODEL_CATALOG } = require('./model-specs.js');

const E_MODEL_DOWNLOAD_FAILED = 'E_MODEL_DOWNLOAD_FAILED';
const E_MODEL_IMPORT_FAILED = 'E_MODEL_IMPORT_FAILED';
const E_MODEL_PATH_INVALID = 'E_MODEL_PATH_INVALID';
const E_MODEL_CANCELLED = 'E_MODEL_CANCELLED';

const E_DOWNLOAD_REDIRECT = 'E_DOWNLOAD_REDIRECT';
const E_DOWNLOAD_HTTP = 'E_DOWNLOAD_HTTP';
const E_DOWNLOAD_HASH = 'E_DOWNLOAD_HASH';
const E_DOWNLOAD_SIZE = 'E_DOWNLOAD_SIZE';
const E_DOWNLOAD_NETWORK = 'E_DOWNLOAD_NETWORK';

const KNOWN_MODELS = MODEL_CATALOG;

const os = require('os');

const VERIFICATION_CACHE_DIR = '.model-verification-cache';

function getVerificationCacheDir() {
  const home = process.env.USERPROFILE || process.env.HOME || os.tmpdir();
  return path.join(home, VERIFICATION_CACHE_DIR);
}

function getVerificationCacheKey(filePath) {
  const stat = fs.statSync(filePath);
  const keyBase = `${filePath}:${stat.size}:${stat.mtimeMs}`;
  return crypto.createHash('sha256').update(keyBase).digest('hex');
}

function readVerificationCache(key) {
  try {
    const cacheDir = getVerificationCacheDir();
    const cacheFile = path.join(cacheDir, `${key}.json`);
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
  } catch (_err) { void _err; }
  return null;
}

function writeVerificationCache(key, result) {
  try {
    const cacheDir = getVerificationCacheDir();
    fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = path.join(cacheDir, `${key}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify({ ...result, timestamp: Date.now() }));
  } catch (_err) { void _err; }
}

function verifyModelFileAsync(filePath, expected = {}) {
  return new Promise((resolve) => {
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

    if (!filePath || !fs.existsSync(filePath)) {
      resolve(result);
      return;
    }

    const stat = fs.statSync(filePath);
    result.exists = true;
    result.size = stat.size;
    result.sizeMatches = expected.sizeBytes ? stat.size === expected.sizeBytes : true;

    const key = getVerificationCacheKey(filePath);
    const cached = readVerificationCache(key);

    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      result.sha256 = cached.sha256;
      result.shaMatches = cached.shaMatches;
      result.verified = result.sizeMatches && result.shaMatches;
      resolve(result);
      return;
    }

    if (expected.sha256) {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', () => {
        result.shaMatches = false;
        result.verified = false;
        resolve(result);
      });
      stream.on('end', () => {
        result.sha256 = hash.digest('hex');
        result.shaMatches = result.sha256 === expected.sha256;
        result.verified = result.sizeMatches && result.shaMatches;
        writeVerificationCache(key, {
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          sha256: result.sha256,
          shaMatches: result.shaMatches
        });
        resolve(result);
      });
    } else {
      result.shaMatches = true;
      result.verified = result.sizeMatches;
      writeVerificationCache(key, {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        sha256: null,
        shaMatches: true
      });
      resolve(result);
    }
  });
}

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test' || env.ELECTRON_TEST === '1' || env.VM_TEST_MODELS === '1';
}

function getModelsDir(userDataDir) {
  return path.join(userDataDir, 'models');
}

function cleanupPlaceholderFiles(modelsDir, catalog = MODEL_CATALOG) {
  try {
    const models = normalizeCatalog(catalog);
    for (const model of models) {
      const modelDir = path.join(modelsDir, model.id);
      for (const file of model.files) {
        const perModelPath = path.join(modelDir, file.fileName);
        const flatPath = path.join(modelsDir, file.fileName);
        
        for (const filePath of [perModelPath, flatPath]) {
          if (!fs.existsSync(filePath)) continue;
          try {
            const stat = fs.statSync(filePath);
            if (stat.isFile() && file.sizeBytes && file.sizeBytes > 10 * 1024 * 1024 && stat.size === 4096) {
              fs.unlinkSync(filePath);
              console.log(`[models] Deleted 4096-byte placeholder: ${filePath}`);
            }
          } catch (_err) { void _err; }
        }
      }
    }
  } catch (_err) { void _err; }
}

function normalizeCatalog(catalog = MODEL_CATALOG) {
  return (Array.isArray(catalog) ? catalog : []).map(model => ({
    ...model,
    files: Array.isArray(model.files) && model.files.length ? model.files : [model]
  }));
}

function getModelDir(modelsDir, model) {
  return path.join(modelsDir, model.id);
}

function getModelFilePath(modelsDir, model, file) {
  return path.join(getModelDir(modelsDir, model), file.fileName);
}

function resolveModelFilePath(modelsDir, model, file, vendorModelsDir = null) {
  const perModelPath = getModelFilePath(modelsDir, model, file);
  const flatPath = path.join(modelsDir, file.fileName);
  const expectedSize = file.sizeBytes || null;

  const vendorPaths = [];
  if (vendorModelsDir) {
    vendorPaths.push(path.join(vendorModelsDir, model.id, 'models', file.fileName));
    vendorPaths.push(path.join(vendorModelsDir, file.fileName));
  }

  const isDirectoryLike = (stat, expected) => {
    if (stat.isDirectory()) return true;
    if (expected && expected > 10 * 1024 * 1024 && stat.size === 4096) return true;
    return false;
  };

  const checkPath = (p) => {
    if (!fs.existsSync(p)) return null;
    try {
      const stat = fs.statSync(p);
      if (!stat.isFile()) return null;
      if (isDirectoryLike(stat, expectedSize)) return null;
      if (expectedSize && stat.size !== expectedSize) return null;
      return p;
    } catch (_err) {
      return null;
    }
  };

  const existingPath = fs.existsSync(perModelPath) ? perModelPath : (fs.existsSync(flatPath) ? flatPath : null);
  return checkPath(perModelPath) || checkPath(flatPath) || vendorPaths.map(checkPath).find(p => p) || existingPath || perModelPath;
}

function getExpectedModelPath(modelsDir, modelId, fileName, catalog = MODEL_CATALOG) {
  const model = normalizeCatalog(catalog).find(item => item.id === modelId);
  if (!model) return null;
  const file = model.files.find(item => item.fileName === fileName);
  if (!file) return null;
  return getModelFilePath(modelsDir, model, file);
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

function listModels(modelsDir, catalog = MODEL_CATALOG, vendorModelsDir = null) {
  cleanupPlaceholderFiles(modelsDir, catalog);
  const models = normalizeCatalog(catalog).map((model) => {
    const dir = getModelDir(modelsDir, model);
    const files = model.files.map((file) => {
      const filePath = resolveModelFilePath(modelsDir, model, file, vendorModelsDir);
      const syncVerification = verifyModelFile(filePath, file);
      
      const userDataPerModelPath = getModelFilePath(modelsDir, model, file);
      const userDataFlatPath = path.join(modelsDir, file.fileName);
      const userDataExists = fs.existsSync(userDataPerModelPath) || fs.existsSync(userDataFlatPath);
      
      return {
        fileName: file.fileName,
        path: filePath,
        exists: syncVerification.exists,
        verified: syncVerification.verified,
        size: syncVerification.size,
        expectedSize: syncVerification.expectedSize,
        sizeMatches: syncVerification.sizeMatches,
        missing: !syncVerification.exists,
        status: !syncVerification.exists ? 'missing' : (syncVerification.verified ? 'ok' : 'unverified'),
        verifying: false,
        message: !syncVerification.exists
          ? `falta ${file.fileName}`
          : (syncVerification.verified ? `${file.fileName} listo` : `${file.fileName} sin verificar`),
        userDataExists,
        required: file.required !== false
      };
    });

    const requiredFiles = files.filter(file => file.required);
    const requiredResolved = requiredFiles.every(file => file.exists);
    const verified = requiredResolved && requiredFiles.every(file => file.verified);
    const missingRequiredFiles = requiredFiles.filter(file => !file.exists).map(file => file.fileName);

    return {
      id: model.id,
      name: model.name,
      engine: model.engine,
      dir,
      files,
      installed: requiredResolved,
      verified,
      complete: requiredResolved,
      missing: !requiredResolved,
      missingFiles: missingRequiredFiles,
      path: files.length === 1 ? files[0].path : null,
      fileName: files.length === 1 ? files[0].fileName : null,
      message: requiredResolved
        ? (verified ? 'Instalado y verificado' : 'Instalado (sin verificar)')
        : `Incompleto: falta ${missingRequiredFiles.join(', ')}`
    };
  });

  return models;
}

function listModelsAsync(modelsDir, catalog = MODEL_CATALOG, vendorModelsDir = null) {
  return new Promise((resolve) => {
    const models = listModels(modelsDir, catalog, vendorModelsDir);
    const verifyPromises = [];

    models.forEach((model) => {
      model.files.forEach((file) => {
        if (file.exists && !file.verified) {
          file.verifying = true;
          file.message = `Verificando ${file.fileName}…`;
          const filePath = file.path;
          const expected = MODEL_CATALOG.flatMap(m => m.files).find(f => f.fileName === file.fileName);
          const p = verifyModelFileAsync(filePath, expected).then((result) => {
            file.verified = result.verified;
            file.size = result.size;
            file.verifying = false;
            file.status = result.verified ? 'ok' : 'error';
            if (result.exists) {
              if (result.verified) {
                file.message = `${file.fileName} listo`;
              } else if (!result.sizeMatches) {
                file.message = `Tamaño incorrecto: esperado ${result.expectedSize}, recibido ${result.size}`;
              } else if (!result.shaMatches) {
                file.message = `Hash no coincide: esperado ${result.expectedSha256?.slice(0, 16)}..., recibido ${result.sha256?.slice(0, 16)}...`;
              } else {
                file.message = `${file.fileName} sin verificar`;
              }
            }
          });
          verifyPromises.push(p);
        }
      });
    });

    Promise.all(verifyPromises).then(() => {
      models.forEach((model) => {
        const requiredFiles = model.files.filter(file => file.required);
        const requiredResolved = requiredFiles.every(file => file.exists);
        const verified = requiredResolved && requiredFiles.every(file => file.verified);
        const missingRequiredFiles = requiredFiles.filter(file => !file.exists).map(file => file.fileName);
        model.installed = requiredResolved;
        model.verified = verified;
        model.complete = requiredResolved;
        model.missing = !requiredResolved;
        model.missingFiles = missingRequiredFiles;
        model.message = requiredResolved
          ? (verified ? 'Instalado y verificado' : 'Instalado (sin verificar)')
          : `Incompleto: falta ${missingRequiredFiles.join(', ')}`;
      });
      resolve(models);
    });
  });
}

function findModel(fileName, catalog = MODEL_CATALOG) {
  const wanted = String(fileName || '').toLowerCase();
  for (const model of normalizeCatalog(catalog)) {
    const file = model.files.find(item => item.fileName.toLowerCase() === wanted);
    if (file) return { model, file };
  }
  return null;
}

function listKnownFileNames(catalog = MODEL_CATALOG) {
  return normalizeCatalog(catalog).reduce((names, model) => names.concat(model.files.map(file => file.fileName)), []);
}

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function toTypeError(label, value) {
  return new Error(`${E_MODEL_PATH_INVALID}: ${label} debe ser un texto (recibido ${describeType(value)})`);
}

function normalizeImportPath(providedPath, envPath) {
  if (typeof providedPath === 'string' && providedPath.trim()) {
    return { filePath: providedPath, source: 'argument' };
  }
  if (typeof envPath === 'string' && envPath.trim()) {
    return { filePath: envPath, source: 'env' };
  }
  return { filePath: null, source: 'dialog' };
}

function normalizeModelId(providedId) {
  if (providedId == null || providedId === '') return null;
  if (typeof providedId !== 'string') {
    throw toTypeError('modelId', providedId);
  }
  const trimmed = providedId.trim();
  return trimmed || null;
}

function checkModelFiles(modelsBaseDir, modelId, catalog = MODEL_CATALOG) {
  if (typeof modelsBaseDir !== 'string' || !modelsBaseDir.trim()) {
    return { modelId, modelFound: false, modelDir: null, missingFiles: [] };
  }
  const model = normalizeCatalog(catalog).find(item => item.id === modelId);
  if (!model) {
    return { modelId, modelFound: false, modelDir: null, missingFiles: [] };
  }
  const modelDir = path.join(modelsBaseDir, modelId);
  const missingFiles = [];
  for (const file of model.files) {
    const perModel = path.join(modelDir, file.fileName);
    const flat = path.join(modelsBaseDir, file.fileName);
    if (!fs.existsSync(perModel) && !fs.existsSync(flat)) {
      missingFiles.push({ fileName: file.fileName, path: perModel });
    }
  }
  return { modelId, modelFound: true, modelDir, missingFiles };
}

function importModel(sourcePath, modelsDir, catalog = MODEL_CATALOG) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw toTypeError('sourcePath', sourcePath);
  }
  if (!path.isAbsolute(sourcePath)) {
    throw new Error(`${E_MODEL_PATH_INVALID}: la ruta debe ser absoluta: ${sourcePath}`);
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`${E_MODEL_PATH_INVALID}: file not found: ${sourcePath}`);
  }
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) {
    throw new Error(`${E_MODEL_IMPORT_FAILED}: not a file: ${sourcePath}`);
  }

  const baseName = path.basename(sourcePath);
  const match = findModel(baseName, catalog);
  if (!match) {
    throw new Error(`${E_MODEL_IMPORT_FAILED}: archivo no reconocido "${baseName}". Nombres esperados: ${listKnownFileNames(catalog).join(', ')}`);
  }

  const dest = getModelFilePath(modelsDir, match.model, match.file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(sourcePath, dest);

  // Validate JSON files if the imported file is a .json config
  if (baseName.endsWith('.json')) {
    try {
      JSON.parse(fs.readFileSync(dest, 'utf8'));
    } catch (err) {
      fs.unlinkSync(dest);
      throw new Error(`${E_MODEL_IMPORT_FAILED}: archivo JSON inválido: ${err.message}`);
    }
  }

  const verification = verifyModelFile(dest, match.file);
  if (!verification.exists) {
    throw new Error(`${E_MODEL_IMPORT_FAILED}: no se pudo copiar ${baseName} a ${dest}`);
  }

  return {
    modelId: match.model.id,
    fileName: match.file.fileName,
    path: dest,
    verification,
    models: listModels(modelsDir, catalog)
  };
}

function downloadToFile(url, dest, hooks = {}) {
  return new Promise((resolve, reject) => {
    const onProgress = typeof hooks.onProgress === 'function' ? hooks.onProgress : () => {};
    const signal = hooks.signal;
    let request = null;
    let cancelled = false;
    let settled = false;
    let redirectCount = 0;
    const MAX_REDIRECTS = 5;
    const currentUrl = url;

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

    const isLoopbackHost = (host) => {
      return host === '127.0.0.1' || host === 'localhost' || host === '::1';
    };

    const isAllowedUrl = (urlString) => {
      try {
        const u = new URL(urlString);
        if (u.protocol === 'https:') return true;
        if (u.protocol === 'http:' && isLoopbackHost(u.hostname)) return true;
        return false;
      } catch {
        return false;
      }
    };

    const resolveRedirect = (location, baseUrl) => {
      try {
        return new URL(location, baseUrl).href;
      } catch (err) {
        throw new Error(`E_DOWNLOAD_REDIRECT: invalid redirect location "${location}" from "${baseUrl}"`);
      }
    };

    const doRequest = (requestUrl) => {
      if (!isAllowedUrl(requestUrl)) {
        finish(reject, new Error(`E_DOWNLOAD_REDIRECT: redirect to non-https remote host not allowed: ${requestUrl}`));
        return;
      }

      const requestFactory = requestUrl.startsWith('https:') ? https : http;
      request = requestFactory.get(requestUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          redirectCount++;
          if (redirectCount > MAX_REDIRECTS) {
            finish(reject, new Error(`E_DOWNLOAD_REDIRECT: too many redirects (max ${MAX_REDIRECTS})`));
            return;
          }
          try {
            const nextUrl = resolveRedirect(response.headers.location, requestUrl);
            // Don't forward credentials across hosts
            const currentHost = new URL(requestUrl).host;
            const nextHost = new URL(nextUrl).host;
            if (currentHost !== nextHost) {
              // Strip auth headers for cross-host redirects
              request = null; // Will be recreated without auth
            }
            doRequest(nextUrl);
          } catch (err) {
            finish(reject, err);
          }
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          finish(reject, new Error(`E_DOWNLOAD_HTTP: HTTP ${response.statusCode}`));
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
      });
      request.on('error', (err) => {
        if (cancelled) finish(reject, new Error(`${E_MODEL_CANCELLED}: download cancelled`));
        else finish(reject, new Error(`E_DOWNLOAD_NETWORK: ${err.message}`));
      });
      request.setTimeout(120000, () => { request.destroy(); finish(reject, new Error('E_DOWNLOAD_NETWORK: timeout')); });
    };

    doRequest(currentUrl);
  });
}

async function downloadModel(model, modelsDir, options = {}) {
  if (!model || typeof model !== 'object') {
    throw new Error(`${E_MODEL_PATH_INVALID}: model debe ser un objeto de catálogo (recibido ${describeType(model)})`);
  }
  if (typeof modelsDir !== 'string' || !modelsDir.trim()) {
    throw toTypeError('modelsDir', modelsDir);
  }
  if (options.fileName != null && typeof options.fileName !== 'string') {
    throw toTypeError('fileName', options.fileName);
  }
  const env = options.env || process.env;
  const target = normalizeCatalog([model])[0];
  const file = (options.fileName && target.files.find(item => item.fileName === options.fileName))
    || target.files[0];
  const dest = options.destination || getModelFilePath(modelsDir, target, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const simulated = options.simulate === true || isTestMode(env);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  if (simulated) {
    const bytes = options.simulateBytes || 4096;
    const buffer = Buffer.alloc(bytes, 0x41);
    
    // Check for cancellation before writing
    if (options.signal?.aborted) {
      throw new Error(`${E_MODEL_CANCELLED}: download cancelled`);
    }
    
    onProgress({ progress: 50, received: Math.floor(bytes / 2), total: bytes });
    fs.writeFileSync(dest, buffer);
    
    // Check for cancellation after writing
    if (options.signal?.aborted) {
      try { fs.unlinkSync(dest); } catch (_err) { /* ignore */ }
      throw new Error(`${E_MODEL_CANCELLED}: download cancelled`);
    }
    
    onProgress({ progress: 100, received: bytes, total: bytes });
    const verification = verifyModelFile(dest, { sizeBytes: bytes, sha256: options.simulateSha256 || null });
    return {
      model: target.id,
      fileName: file.fileName,
      path: dest,
      bytes,
      simulated: true,
      verified: verification.verified,
      verification
    };
  }

  const result = await downloadToFile(file.url, dest, { onProgress, signal: options.signal });
  const verification = verifyModelFile(dest, file);
  if (!verification.verified) {
    throw new Error(`${E_MODEL_DOWNLOAD_FAILED}: verification failed for ${file.fileName}`);
  }
  return {
    model: target.id,
    fileName: file.fileName,
    path: dest,
    bytes: result.bytes,
    simulated: false,
    verified: true,
    verification
  };
}

module.exports = {
  E_MODEL_DOWNLOAD_FAILED,
  E_MODEL_IMPORT_FAILED,
  E_MODEL_PATH_INVALID,
  E_MODEL_CANCELLED,
  E_DOWNLOAD_REDIRECT,
  E_DOWNLOAD_HTTP,
  E_DOWNLOAD_HASH,
  E_DOWNLOAD_SIZE,
  E_DOWNLOAD_NETWORK,
  MODEL_CATALOG,
  KNOWN_MODELS,
  isTestMode,
  getModelsDir,
  normalizeCatalog,
  getModelDir,
  getModelFilePath,
  getExpectedModelPath,
  resolveModelFilePath,
  computeSha256,
  verifyModelFile,
  listModels,
  listModelsAsync,
  findModel,
  listKnownFileNames,
  checkModelFiles,
  normalizeImportPath,
  normalizeModelId,
  verifyModelFileAsync,
  getVerificationCacheDir,
  cleanupPlaceholderFiles,
  importModel,
  downloadToFile,
  downloadModel
};
