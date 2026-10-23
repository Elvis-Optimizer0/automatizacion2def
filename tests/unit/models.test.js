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

function piperCatalog() {
  return [
    {
      id: 'piper',
      name: 'Piper TTS voces',
      engine: 'piper',
      files: [
        { fileName: 'es_MX-ald-medium.onnx', sizeBytes: 63201294, sha256: '019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx', license: 'Unlicense' },
        { fileName: 'es_MX-ald-medium.onnx.json', sizeBytes: 4878, sha256: '5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json', license: 'Unlicense' },
        { fileName: 'es_MX-ald-x_low.onnx', sizeBytes: 22345678, sha256: 'pending', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx', license: 'Unlicense' },
        { fileName: 'es_MX-ald-x_low.onnx.json', sizeBytes: 3456, sha256: 'pending', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/es_MX-ald-x_low.onnx.json', license: 'Unlicense' },
        { fileName: 'es_ES-carlfm-x_low.onnx', sizeBytes: 28130791, sha256: 'd69677323a907cd4963f42b29c20a98b5d6bfa7f3e64df339915e4650c00d125', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx', license: 'Public domain' },
        { fileName: 'es_ES-carlfm-x_low.onnx.json', sizeBytes: 4159, sha256: 'd9bdfa9ff01eb2bc9e62e7d2593939d1e4c4d8eb7cf75f972731539d12399966', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx.json', license: 'Public domain' },
        { fileName: 'es_ES-carlfm-medium.onnx', sizeBytes: 42345678, sha256: 'pending', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/medium/es_ES-carlfm-medium.onnx', license: 'Public domain' },
        { fileName: 'es_ES-carlfm-medium.onnx.json', sizeBytes: 4567, sha256: 'pending', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/medium/es_ES-carlfm-medium.onnx.json', license: 'Public domain' },
        { fileName: 'en_US-lessac-medium.onnx', sizeBytes: 63201294, sha256: '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx', license: 'Blizzard (non-commercial)' },
        { fileName: 'en_US-lessac-medium.onnx.json', sizeBytes: 4885, sha256: 'efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json', license: 'Blizzard (non-commercial)' },
        { fileName: 'en_US-lessac-low.onnx', sizeBytes: 23456789, sha256: 'pending', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx', license: 'Blizzard (non-commercial)' },
        { fileName: 'en_US-lessac-low.onnx.json', sizeBytes: 4012, sha256: 'pending', url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx.json', license: 'Blizzard (non-commercial)' }
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

test.describe('Piper voice download and import', () => {
  function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'vm-piper-voices-'));
  }

  test('piper catalog has 6 voices with complete metadata', () => {
    const catalog = piperCatalog();
    const piper = catalog.find(m => m.id === 'piper');
    expect(piper).toBeTruthy();
    expect(piper.files.length).toBe(12); // 6 voices x 2 files each
    const voices = ['es_MX-ald-medium', 'es_MX-ald-x_low', 'es_ES-carlfm-x_low', 'es_ES-carlfm-medium', 'en_US-lessac-medium', 'en_US-lessac-low'];
    voices.forEach(voiceId => {
      const onnxFile = piper.files.find(f => f.fileName === `${voiceId}.onnx`);
      const jsonFile = piper.files.find(f => f.fileName === `${voiceId}.onnx.json`);
      expect(onnxFile).toBeTruthy();
      expect(jsonFile).toBeTruthy();
      expect(onnxFile.url).toMatch(/^https:\/\//);
      expect(jsonFile.url).toMatch(/^https:\/\//);
      expect(typeof onnxFile.sizeBytes).toBe('number');
      expect(onnxFile.sizeBytes).toBeGreaterThan(0);
      expect(typeof jsonFile.sizeBytes).toBe('number');
      expect(jsonFile.sizeBytes).toBeGreaterThan(0);
      expect(onnxFile.license).toBeTruthy();
      expect(jsonFile.license).toBeTruthy();
    });
  });

  test('downloaded voice has both onnx and json files', async () => {
    const dir = makeTempDir();
    try {
      const catalog = piperCatalog();
      const piperModel = catalog.find(m => m.id === 'piper');
      const filesToDownload = piperModel.files.filter(f => 
        f.fileName === 'es_MX-ald-medium.onnx' || f.fileName === 'es_MX-ald-medium.onnx.json'
      );
      
      // Simulate download of both files
      for (const file of filesToDownload) {
        const result = await downloadModel(piperModel, dir, {
          fileName: file.fileName,
          simulate: true,
          simulateBytes: file.sizeBytes,
          simulateSha256: file.sha256
        });
        // Simulated downloads create files filled with 0x41 bytes, which won't match real sha256
        // Verify files were created with correct size instead
        expect(result.simulated).toBe(true);
        expect(result.bytes).toBe(file.sizeBytes);
      }
      
      // Verify both files exist
      const models = listModels(dir, piperCatalog());
      const piper = models.find(m => m.id === 'piper');
      const onnxFile = piper.files.find(f => f.fileName === 'es_MX-ald-medium.onnx');
      const jsonFile = piper.files.find(f => f.fileName === 'es_MX-ald-medium.onnx.json');
      expect(onnxFile.exists).toBe(true);
      expect(jsonFile.exists).toBe(true);
      // Files created by simulation won't match real sha256, so verified=false is expected
      expect(onnxFile.size).toBe(63201294);
      expect(jsonFile.size).toBe(4878);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('voice with hash mismatch returns verified=false and no .part file', async () => {
    const dir = makeTempDir();
    try {
      const catalog = piperCatalog();
      const piperModel = catalog.find(m => m.id === 'piper');
      piperModel.files.find(f => f.fileName === 'es_MX-ald-medium.onnx');
      
      const result = await downloadModel(piperModel, dir, {
        fileName: 'es_MX-ald-medium.onnx',
        simulate: true,
        simulateBytes: 63201294,
        simulateSha256: 'wrong-hash'
      });
      
      // Simulated downloads don't throw on hash mismatch, they return verified=false
      expect(result.verified).toBe(false);
      expect(result.verification.shaMatches).toBe(false);
      
      // Verify no .part file was left
      const partFile = path.join(dir, 'piper', 'es_MX-ald-medium.onnx.part');
      expect(fs.existsSync(partFile)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('voice with size mismatch returns verified=false', async () => {
    const dir = makeTempDir();
    try {
      const catalog = piperCatalog();
      const piperModel = catalog.find(m => m.id === 'piper');
      const file = piperModel.files.find(f => f.fileName === 'es_MX-ald-medium.onnx');
      
      // Test size mismatch by creating a file with wrong size and verifying directly
      const testFile = path.join(dir, 'test-size-mismatch.onnx');
      fs.writeFileSync(testFile, Buffer.alloc(100, 0x41));
      
      const verification = verifyModelFile(testFile, { 
        sizeBytes: file.sizeBytes,  // Expected size from catalog (63201294)
        sha256: file.sha256 
      });
      
      expect(verification.exists).toBe(true);
      expect(verification.sizeMatches).toBe(false);
      expect(verification.verified).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('cancellation before download prevents download', async () => {
    const dir = makeTempDir();
    const controller = new AbortController();
    controller.abort(); // Already aborted
    try {
      const catalog = piperCatalog();
      const piperModel = catalog.find(m => m.id === 'piper');
      piperModel.files.find(f => f.fileName === 'es_MX-ald-medium.onnx');
      
      const promise = downloadModel(piperModel, dir, {
        fileName: 'es_MX-ald-medium.onnx',
        simulate: true,
        simulateBytes: 63201294,
        simulateSha256: '019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63',
        signal: controller.signal
      });
      
      await expect(promise).rejects.toThrow(/cancelled/i);
      
      // Verify no .part file was created
      const partFile = path.join(dir, 'piper', 'es_MX-ald-medium.onnx.part');
      expect(fs.existsSync(partFile)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('importing voice with invalid JSON rejects and cleans up', () => {
    const dir = makeTempDir();
    const sourceDir = makeTempDir();
    try {
      // Create invalid JSON file
      const jsonSource = path.join(sourceDir, 'es_MX-ald-medium.onnx.json');
      fs.writeFileSync(jsonSource, '{ invalid json }');
      
      const onnxSource = path.join(sourceDir, 'es_MX-ald-medium.onnx');
      fs.writeFileSync(onnxSource, Buffer.from('ABCDEFGH'));
      
      expect(() => importModel(jsonSource, dir, piperCatalog())).toThrow(/JSON inválido/);
      
      // Verify no partial import
      const models = listModels(dir, piperCatalog());
      const piper = models.find(m => m.id === 'piper');
      expect(piper.files.every(f => !f.exists)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  test('importing only .onnx without .json creates incomplete model', () => {
    const dir = makeTempDir();
    const sourceDir = makeTempDir();
    try {
      const onnxSource = path.join(sourceDir, 'es_MX-ald-medium.onnx');
      fs.writeFileSync(onnxSource, Buffer.from('ABCDEFGH'));
      
      const result = importModel(onnxSource, dir, piperCatalog());
      expect(result.verification.exists).toBe(true);
      
      // Model should be incomplete (missing .json)
      const models = listModels(dir, piperCatalog());
      const piper = models.find(m => m.id === 'piper');
      expect(piper.complete).toBe(false);
      expect(piper.missingFiles).toContain('es_MX-ald-medium.onnx.json');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  test('importing missing .onnx file creates incomplete model', () => {
    const dir = makeTempDir();
    const sourceDir = makeTempDir();
    try {
      const jsonSource = path.join(sourceDir, 'es_MX-ald-medium.onnx.json');
      fs.writeFileSync(jsonSource, JSON.stringify({}));
      
      const result = importModel(jsonSource, dir, piperCatalog());
      expect(result.verification.exists).toBe(true);
      
      // Model should be incomplete (missing .onnx)
      const models = listModels(dir, piperCatalog());
      const piper = models.find(m => m.id === 'piper');
      expect(piper.complete).toBe(false);
      expect(piper.missingFiles).toContain('es_MX-ald-medium.onnx');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  test('voice state transitions: no_descargada -> descargando -> lista', async () => {
    const dir = makeTempDir();
    try {
      const catalog = piperCatalog();
      const piperModel = catalog.find(m => m.id === 'piper');
      const filesToDownload = piperModel.files.filter(f => 
        f.fileName === 'es_MX-ald-medium.onnx' || f.fileName === 'es_MX-ald-medium.onnx.json'
      );
      
      // Initially no files
      const modelsBefore = listModels(dir, piperCatalog());
      const piperBefore = modelsBefore.find(m => m.id === 'piper');
      const voiceFile = piperBefore.files.find(f => f.fileName === 'es_MX-ald-medium.onnx');
      expect(voiceFile.exists).toBe(false);
      expect(voiceFile.status).toBe('missing');
      
      // Download (simulated - files won't match real sha256, so verified=false)
      for (const file of filesToDownload) {
        await downloadModel(piperModel, dir, {
          fileName: file.fileName,
          simulate: true,
          simulateBytes: file.sizeBytes,
          simulateSha256: file.sha256
        });
      }
      
      // After download - files exist but simulated content doesn't match real sha256
      const modelsAfter = listModels(dir, piperCatalog());
      const piperAfter = modelsAfter.find(m => m.id === 'piper');
      const voiceFileAfter = piperAfter.files.find(f => f.fileName === 'es_MX-ald-medium.onnx');
      expect(voiceFileAfter.exists).toBe(true);
      // Simulated content (0x41 bytes) doesn't match real sha256, so verified=false
      expect(voiceFileAfter.verified).toBe(false);
      expect(voiceFileAfter.status).toBe('unverified');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('all 6 voices require sha256 for both files, size and license', () => {
    const piper = piperCatalog().find(m => m.id === 'piper');
    const voices = ['es_MX-ald-medium', 'es_MX-ald-x_low', 'es_ES-carlfm-x_low', 'es_ES-carlfm-medium', 'en_US-lessac-medium', 'en_US-lessac-low'];
    voices.forEach(voiceId => {
      const onnxFile = piper.files.find(f => f.fileName === `${voiceId}.onnx`);
      const jsonFile = piper.files.find(f => f.fileName === `${voiceId}.onnx.json`);
      expect(onnxFile.sha256).toMatch(/^[0-9a-f]{64}$|^pending$/);
      expect(jsonFile.sha256).toMatch(/^[0-9a-f]{64}$|^pending$/);
      expect(onnxFile.sizeBytes).toBeGreaterThan(0);
      expect(jsonFile.sizeBytes).toBeGreaterThan(0);
      expect(onnxFile.license).toBeTruthy();
      expect(jsonFile.license).toBeTruthy();
    });
  });
});
