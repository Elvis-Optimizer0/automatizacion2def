const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  MODEL_CATALOG,
  verifyModelFile,
  computeSha256,
  listModels,
  importModel,
  downloadModel,
  getModelsDir,
  getModelFilePath,
  getExpectedModelPath,
  getModelDir,
  normalizeImportPath,
  normalizeModelId,
  verifyModelFileAsync,
  getVerificationCacheDir
} = require('../../app/core/models.js');

function sha256Of(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vm-models-'));
}

function kokoroCatalog() {
  return [
    {
      id: 'kokoro',
      name: 'Kokoro voz (ONNX)',
      engine: 'kokoro',
      files: [
        { fileName: 'kokoro-v1.0.onnx', sizeBytes: 8 },
        { fileName: 'voices-v1.0.bin', sizeBytes: 8 }
      ]
    }
  ];
}

test.describe('model verification', () => {
  test('reports a missing file', () => {
    const result = verifyModelFile(path.join(os.tmpdir(), 'no-existe-12345.bin'), { sizeBytes: 10 });
    expect(result.exists).toBe(false);
    expect(result.verified).toBe(false);
  });

  test('verifies size and sha256 when both match', () => {
    const dir = makeDir();
    try {
      const buffer = Buffer.from('ABCDEFGH');
      const filePath = path.join(dir, 'model.bin');
      fs.writeFileSync(filePath, buffer);
      const expected = { sizeBytes: buffer.length, sha256: sha256Of(buffer) };
      const result = verifyModelFile(filePath, expected);
      expect(result.exists).toBe(true);
      expect(result.sizeMatches).toBe(true);
      expect(result.shaMatches).toBe(true);
      expect(result.verified).toBe(true);
      expect(computeSha256(filePath)).toBe(sha256Of(buffer));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails verification on a size or hash mismatch', () => {
    const dir = makeDir();
    try {
      const buffer = Buffer.from('ABCDEFGH');
      const filePath = path.join(dir, 'model.bin');
      fs.writeFileSync(filePath, buffer);

      const sizeMismatch = verifyModelFile(filePath, { sizeBytes: 999 });
      expect(sizeMismatch.sizeMatches).toBe(false);
      expect(sizeMismatch.verified).toBe(false);

      const hashMismatch = verifyModelFile(filePath, { sha256: 'deadbeef' });
      expect(hashMismatch.shaMatches).toBe(false);
      expect(hashMismatch.verified).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('unified model paths', () => {
  test('builds <modelsDir>/<id>/<file> for catalog entries', () => {
    const modelsDir = getModelsDir('C:\\base');
    expect(modelsDir).toBe(path.join('C:\\base', 'models'));

    const model = MODEL_CATALOG[0];
    expect(getModelDir(modelsDir, model)).toBe(path.join(modelsDir, 'kokoro'));
    expect(getModelFilePath(modelsDir, model, model.files[0]))
      .toBe(path.join(modelsDir, 'kokoro', 'kokoro-v1.0.onnx'));
    expect(getExpectedModelPath(modelsDir, 'kokoro', 'voices-v1.0.bin'))
      .toBe(path.join(modelsDir, 'kokoro', 'voices-v1.0.bin'));
    expect(getExpectedModelPath(modelsDir, 'kokoro', 'desconocido.bin')).toBeNull();
  });

  test('lists per-file state on an empty folder', () => {
    const dir = makeDir();
    try {
      const models = listModels(dir);
      expect(models).toHaveLength(MODEL_CATALOG.length);
      expect(models.every(model => model.missing)).toBe(true);
      const kokoro = models.find(model => model.id === 'kokoro');
      expect(kokoro.files.map(file => file.fileName))
        .toEqual(['kokoro-v1.0.onnx', 'voices-v1.0.bin']);
      expect(kokoro.installed).toBe(false);
      expect(kokoro.missingFiles).toEqual(['kokoro-v1.0.onnx', 'voices-v1.0.bin']);
      expect(kokoro.files[0].message).toBe('falta kokoro-v1.0.onnx');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('ipc argument normalization', () => {
  test('ignores a non-string argument and asks for the native dialog', () => {
    expect(normalizeImportPath({ hi: 1 }, undefined)).toEqual({ filePath: null, source: 'dialog' });
    expect(normalizeImportPath(123, undefined)).toEqual({ filePath: null, source: 'dialog' });
    expect(normalizeImportPath('', undefined)).toEqual({ filePath: null, source: 'dialog' });
    expect(normalizeImportPath('   ', undefined)).toEqual({ filePath: null, source: 'dialog' });
    expect(normalizeImportPath([1, 2], undefined)).toEqual({ filePath: null, source: 'dialog' });
  });

  test('accepts a valid string argument and falls back to the env path', () => {
    expect(normalizeImportPath('C:\\modelos\\voices-v1.0.bin', undefined))
      .toEqual({ filePath: 'C:\\modelos\\voices-v1.0.bin', source: 'argument' });
    expect(normalizeImportPath({ event: true }, 'C:\\env\\ggml-base.bin'))
      .toEqual({ filePath: 'C:\\env\\ggml-base.bin', source: 'env' });
  });

  test('normalizes the model id and rejects an object with a clear message', () => {
    expect(normalizeModelId(undefined)).toBeNull();
    expect(normalizeModelId(null)).toBeNull();
    expect(normalizeModelId('')).toBeNull();
    expect(normalizeModelId('  ')).toBeNull();
    expect(normalizeModelId('kokoro')).toBe('kokoro');
    expect(() => normalizeModelId({ id: 'kokoro' })).toThrow(/E_MODEL_PATH_INVALID/);
    expect(() => normalizeModelId({ id: 'kokoro' })).toThrow(/modelId debe ser un texto \(recibido object\)/);
  });
});

test.describe('model import', () => {
  test('rejects a non-string source with a clear typed error', () => {
    const dir = makeDir();
    try {
      expect(() => importModel({ path: 'x' }, dir)).toThrow(/sourcePath debe ser un texto \(recibido object\)/);
      expect(() => importModel(undefined, dir)).toThrow(/E_MODEL_PATH_INVALID/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects relative and missing source paths with a clear message', () => {
    const dir = makeDir();
    try {
      expect(() => importModel('relativo.bin', dir)).toThrow(/E_MODEL_PATH_INVALID/);
      expect(() => importModel('relativo.bin', dir)).toThrow(/la ruta debe ser absoluta/);
      expect(() => importModel(path.join(dir, 'no-existe.bin'), dir)).toThrow(/E_MODEL_PATH_INVALID/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects an unrecognized file name and lists expected names', () => {
    const dir = makeDir();
    const sourceDir = makeDir();
    try {
      const sourcePath = path.join(sourceDir, 'otro-modelo.onnx');
      fs.writeFileSync(sourcePath, Buffer.from('ABCDEFGH'));
      expect(() => importModel(sourcePath, dir, kokoroCatalog())).toThrow(/archivo no reconocido/);
      expect(() => importModel(sourcePath, dir, kokoroCatalog())).toThrow(/kokoro-v1\.0\.onnx/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  test('importing both kokoro files marks the model installed at the detected path', () => {
    const dir = makeDir();
    const sourceDir = makeDir();
    try {
      const catalog = kokoroCatalog();
      const onnxSource = path.join(sourceDir, 'kokoro-v1.0.onnx');
      const voicesSource = path.join(sourceDir, 'voices-v1.0.bin');
      fs.writeFileSync(onnxSource, Buffer.from('ABCDEFGH'));
      fs.writeFileSync(voicesSource, Buffer.from('IJKLMNOP'));

      const first = importModel(onnxSource, dir, catalog);
      expect(first.modelId).toBe('kokoro');
      expect(first.path).toBe(path.join(dir, 'kokoro', 'kokoro-v1.0.onnx'));

      let models = listModels(dir, catalog);
      expect(models[0].installed).toBe(false);
      expect(models[0].missingFiles).toEqual(['voices-v1.0.bin']);

      const second = importModel(voicesSource, dir, catalog);
      expect(second.path).toBe(getExpectedModelPath(dir, 'kokoro', 'voices-v1.0.bin'));

      models = listModels(dir, catalog);
      expect(models[0].installed).toBe(true);
      expect(models[0].complete).toBe(true);
      expect(models[0].verified).toBe(true);
      expect(models[0].missingFiles).toEqual([]);
      expect(models[0].files.every(file => file.exists && file.verified)).toBe(true);

      expect(fs.existsSync(second.path)).toBe(true);
      expect(fs.existsSync(path.join(dir, 'kokoro', 'kokoro-v1.0.onnx'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  test('importing only one kokoro file leaves the model incomplete', () => {
    const dir = makeDir();
    const sourceDir = makeDir();
    try {
      const catalog = kokoroCatalog();
      const sourcePath = path.join(sourceDir, 'kokoro-v1.0.onnx');
      fs.writeFileSync(sourcePath, Buffer.from('ABCDEFGH'));

      importModel(sourcePath, dir, catalog);
      const models = listModels(dir, catalog);
      expect(models[0].installed).toBe(false);
      expect(models[0].complete).toBe(false);
      expect(models[0].missingFiles).toEqual(['voices-v1.0.bin']);
      expect(models[0].message).toContain('voices-v1.0.bin');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

test.describe('simulated model download', () => {
  test('rejects a non-object model and a bad fileName with clear errors', async () => {
    const dir = makeDir();
    try {
      await expect(downloadModel('kokoro', dir)).rejects.toThrow(/model debe ser un objeto de catálogo \(recibido string\)/);
      await expect(downloadModel({ id: 'x' }, dir, { fileName: 42 })).rejects.toThrow(/fileName debe ser un texto/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('writes each file to its unified per-model path and reports progress', async () => {
    const dir = makeDir();
    const progress = [];
    try {
      const model = {
        id: 'test-model',
        name: 'Test',
        engine: 'kokoro',
        files: [{ fileName: 'test.bin', sizeBytes: 1024, url: 'https://example.invalid/x' }]
      };
      const result = await downloadModel(model, dir, {
        fileName: 'test.bin',
        simulate: true,
        simulateBytes: 1024,
        onProgress: (p) => progress.push(p.progress)
      });

      expect(result.simulated).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.path).toBe(path.join(dir, 'test-model', 'test.bin'));
      expect(fs.existsSync(result.path)).toBe(true);
      expect(fs.statSync(result.path).size).toBe(1024);
      expect(progress).toContain(100);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('model verification', () => {
  test('verifyModelFileAsync returns verified=true for file with correct hash and size', async () => {
    const dir = makeDir();
    try {
      const content = Buffer.from('test content for verification');
      const filePath = path.join(dir, 'test.bin');
      fs.writeFileSync(filePath, content);
      const expected = { sizeBytes: content.length, sha256: sha256Of(content) };
      const result = await verifyModelFileAsync(filePath, expected);
      expect(result.exists).toBe(true);
      expect(result.size).toBe(content.length);
      expect(result.sizeMatches).toBe(true);
      expect(result.shaMatches).toBe(true);
      expect(result.verified).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('verifyModelFileAsync returns verified=false for wrong hash', async () => {
    const dir = makeDir();
    try {
      const content = Buffer.from('correct content');
      const filePath = path.join(dir, 'test.bin');
      fs.writeFileSync(filePath, content);
      const expected = { sizeBytes: content.length, sha256: '0000000000000000000000000000000000000000000000000000000000000000' };
      const result = await verifyModelFileAsync(filePath, expected);
      expect(result.exists).toBe(true);
      expect(result.shaMatches).toBe(false);
      expect(result.verified).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('verifyModelFileAsync returns verified=false for wrong size', async () => {
    const dir = makeDir();
    try {
      const content = Buffer.from('short');
      const filePath = path.join(dir, 'test.bin');
      fs.writeFileSync(filePath, content);
      const expected = { sizeBytes: 100, sha256: sha256Of(content) };
      const result = await verifyModelFileAsync(filePath, expected);
      expect(result.exists).toBe(true);
      expect(result.sizeMatches).toBe(false);
      expect(result.verified).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('verifyModelFileAsync caches result and uses cache on second call', async () => {
    const dir = makeDir();
    try {
      const content = Buffer.from('cached content');
      const filePath = path.join(dir, 'cached.bin');
      fs.writeFileSync(filePath, content);
      const expected = { sizeBytes: content.length, sha256: sha256Of(content) };
      const result1 = await verifyModelFileAsync(filePath, expected);
      expect(result1.verified).toBe(true);
      const cacheDir = getVerificationCacheDir();
      expect(fs.existsSync(cacheDir)).toBe(true);
      const result2 = await verifyModelFileAsync(filePath, expected);
      expect(result2.verified).toBe(true);
      expect(result2.sha256).toBe(result1.sha256);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('verifyModelFileAsync returns exists=false for missing file', async () => {
    const dir = makeDir();
    try {
      const filePath = path.join(dir, 'missing.bin');
      const expected = { sizeBytes: 100, sha256: 'abc' };
      const result = await verifyModelFileAsync(filePath, expected);
      expect(result.exists).toBe(false);
      expect(result.verified).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
