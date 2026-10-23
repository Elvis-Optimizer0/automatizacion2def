const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..', '..');

const KOKORO_MODEL_FILES = ['kokoro-v1.0.onnx', 'voices-v1.0.bin'];
const WHISPER_MODEL_FILES = ['ggml-base.bin'];
const PIPER_MODEL_FILES = ['es_MX-ald-medium.onnx'];

function bundledSearchDirs(name, options = {}) {
  const dirs = [];
  if (options.resourcesDir) dirs.push(path.join(options.resourcesDir, name));
  if (options.vendorDir) dirs.push(path.join(options.vendorDir, name));
  if (options.bundled !== false) {
    dirs.push(path.join(APP_ROOT, 'vendor', name));
    if (process.resourcesPath) dirs.push(path.join(process.resourcesPath, name));
  }
  return dirs;
}

function resolveBundledDir(name, options = {}) {
  for (const dir of bundledSearchDirs(name, options)) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch (_err) {
      void _err;
    }
  }
  return null;
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function runtimeExeName(base) {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

function resolveModelsDir(dir, expectedFiles) {
  const candidates = [path.join(dir, 'models'), dir];
  for (const candidate of candidates) {
    if (expectedFiles.some(fileName => fs.existsSync(path.join(candidate, fileName)))) {
      return candidate;
    }
  }
  return path.join(dir, 'models');
}

function resolveKokoroRuntime(options = {}) {
  const searched = bundledSearchDirs('kokoro', options);
  const dir = resolveBundledDir('kokoro', options);
  if (!dir) {
    return { dir: null, executable: null, modelsDir: null, searched };
  }
  const exe = runtimeExeName('kokoro-runtime');
  const executable = firstExisting([
    path.join(dir, 'runtime', exe),
    path.join(dir, exe),
    path.join(dir, 'kokoro', exe)
  ]);
  const modelsDir = resolveModelsDir(dir, KOKORO_MODEL_FILES);
  return { dir, executable, modelsDir, searched };
}

function resolveWhisperRuntime(options = {}) {
  const searched = bundledSearchDirs('whisper', options);
  const dir = resolveBundledDir('whisper', options);
  if (!dir) {
    return { dir: null, executable: null, modelPath: null, searched };
  }
  const exe = runtimeExeName('whisper-cli');
  const legacy = runtimeExeName('main');
  const executable = firstExisting([
    path.join(dir, 'bin', exe),
    path.join(dir, exe),
    path.join(dir, 'bin', legacy),
    path.join(dir, legacy)
  ]);
  const modelPath = firstExisting(
    WHISPER_MODEL_FILES.map(fileName => path.join(dir, 'models', fileName))
      .concat(WHISPER_MODEL_FILES.map(fileName => path.join(dir, fileName)))
  );
  return { dir, executable, modelPath, searched };
}

function resolvePiperRuntime(options = {}) {
  const searched = bundledSearchDirs('piper', options);
  const dir = resolveBundledDir('piper', options);
  if (!dir) {
    return { dir: null, executable: null, piperDataDir: null, modelsDir: null, searched };
  }
  const exe = runtimeExeName('piper');
  const executable = firstExisting([
    path.join(dir, exe),
    path.join(dir, 'piper', exe)
  ]);
  const piperDataDir = path.join(dir, 'espeak-ng-data');
  const modelsDir = resolveModelsDir(dir, PIPER_MODEL_FILES);
  return {
    dir,
    executable: executable && fs.existsSync(piperDataDir) ? executable : null,
    piperDataDir,
    modelsDir,
    searched
  };
}

module.exports = {
  KOKORO_MODEL_FILES,
  WHISPER_MODEL_FILES,
  PIPER_MODEL_FILES,
  bundledSearchDirs,
  resolveBundledDir,
  resolveKokoroRuntime,
  resolveWhisperRuntime,
  resolvePiperRuntime
};
