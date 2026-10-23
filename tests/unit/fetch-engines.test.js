const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ARTIFACTS,
  PIP_PACKAGES,
  CONFIG_VERSION,
  PYTHON_VERSION,
  PIPER_RUNTIME_FILES,
  configHash,
  placePiperRuntime
} = require('../../scripts/fetch-engines.js');

test.describe('fetch-engines configuration', () => {
  test('every artifact has an https url and a pinned 64-hex sha256', () => {
    const keys = Object.keys(ARTIFACTS);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const key of keys) {
      const artifact = ARTIFACTS[key];
      expect(artifact.url, `${key} url`).toMatch(/^https:\/\//);
      expect(artifact.sha256, `${key} sha256`).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.file, `${key} file`).toBeTruthy();
    }
  });

  test('no two artifacts share the same sha256 or cache file name', () => {
    const artifacts = Object.values(ARTIFACTS).filter(item => typeof item === 'object' && item.sha256);
    const hashes = artifacts.map((item) => item.sha256);
    const files = artifacts.map((item) => item.file);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(new Set(files).size).toBe(files.length);
  });

  test('python packages are pinned to exact versions', () => {
    expect(PIP_PACKAGES.length).toBeGreaterThan(0);
    for (const pkg of PIP_PACKAGES) {
      expect(pkg).toMatch(/^[a-z0-9-]+==[0-9]/);
    }
    expect(PIP_PACKAGES.some((pkg) => pkg.startsWith('kokoro-onnx=='))).toBe(true);
    expect(PIP_PACKAGES.some((pkg) => pkg.startsWith('onnxruntime=='))).toBe(true);
  });

  test('reports a stable configuration hash and version', () => {
    expect(PYTHON_VERSION).toMatch(/^3\.13\./);
    expect(CONFIG_VERSION).toBeTruthy();
    expect(configHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(configHash()).toBe(configHash());
  });
});

test.describe('Piper archive layout', () => {
  function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'vm-piper-layout-'));
  }

  function writeRuntime(runtimeDir) {
    for (const file of PIPER_RUNTIME_FILES) {
      const destination = path.join(runtimeDir, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, `fixture:${file}`);
    }
  }

  function zipEntries(prefix) {
    return PIPER_RUNTIME_FILES.map((file) => {
      const normalized = file.split(path.sep).join('/');
      return prefix ? `${prefix}/${normalized}` : normalized;
    });
  }

  test('places a top-level piper folder at the runtime root', () => {
    const root = makeTempDir();
    try {
      const source = path.join(root, 'extracted');
      const target = path.join(root, 'vendor', 'piper');
      writeRuntime(path.join(source, 'piper'));

      placePiperRuntime(source, target, { fileSystem: fs, zipEntries: zipEntries('piper') });

      expect(fs.existsSync(path.join(target, 'piper.exe'))).toBe(true);
      expect(fs.existsSync(path.join(target, 'espeak-ng-data', 'es_dict'))).toBe(true);
      expect(fs.existsSync(path.join(target, 'piper'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('places a flat archive at the runtime root', () => {
    const root = makeTempDir();
    try {
      const source = path.join(root, 'extracted');
      const target = path.join(root, 'vendor', 'piper');
      writeRuntime(source);

      placePiperRuntime(source, target, { fileSystem: fs, zipEntries: zipEntries('') });

      expect(fs.existsSync(path.join(target, 'piper.exe'))).toBe(true);
      expect(fs.existsSync(path.join(target, 'espeak-ng-data', 'es_dict'))).toBe(true);
      expect(fs.existsSync(path.join(target, 'piper'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('fails when piper.exe is missing', () => {
    const root = makeTempDir();
    try {
      const source = path.join(root, 'extracted');
      const target = path.join(root, 'vendor', 'piper');
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'README.txt'), 'fixture');

      expect(() => placePiperRuntime(source, target, {
        fileSystem: fs,
        zipEntries: ['README.txt']
      })).toThrow(/piper\.exe no encontrado/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});