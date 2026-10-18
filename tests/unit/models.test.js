const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  KNOWN_MODELS,
  verifyModelFile,
  computeSha256,
  listModels,
  importModel,
  downloadModel,
  getModelsDir
} = require('../../app/core/models.js');

function sha256Of(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vm-models-'));
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

test.describe('model catalog and import', () => {
  test('lists every known model as missing on an empty folder', () => {
    const dir = makeDir();
    try {
      const models = listModels(dir);
      expect(models).toHaveLength(KNOWN_MODELS.length);
      expect(models.every(model => model.missing)).toBe(true);
      expect(getModelsDir('C:\\base')).toBe(path.join('C:\\base', 'models'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects relative and missing source paths on import', () => {
    const dir = makeDir();
    try {
      expect(() => importModel('relativo.bin', dir)).toThrow(/E_MODEL_PATH_INVALID/);
      expect(() => importModel(path.join(dir, 'no-existe.bin'), dir)).toThrow(/E_MODEL_PATH_INVALID/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('imports a matching model file and verifies it', () => {
    const dir = makeDir();
    const sourceDir = makeDir();
    try {
      const buffer = Buffer.from('ABCDEFGH');
      const sourcePath = path.join(sourceDir, 'ggml-base.bin');
      fs.writeFileSync(sourcePath, buffer);

      const catalog = [{ id: 'whisper-model', name: 'W', fileName: 'ggml-base.bin', sizeBytes: buffer.length, sha256: sha256Of(buffer) }];
      const result = importModel(sourcePath, dir, catalog);
      expect(fs.existsSync(result.path)).toBe(true);
      expect(result.verification.verified).toBe(true);
      expect(result.fileName).toBe('ggml-base.bin');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

test.describe('simulated model download', () => {
  test('writes the file, reports progress and verifies the size', async () => {
    const dir = makeDir();
    const progress = [];
    try {
      const model = { id: 'test-model', name: 'Test', fileName: 'test.bin', sizeBytes: 1024, url: 'https://example.invalid/x' };
      const result = await downloadModel(model, dir, {
        simulate: true,
        simulateBytes: 1024,
        onProgress: (p) => progress.push(p.progress)
      });

      expect(result.simulated).toBe(true);
      expect(result.verified).toBe(true);
      expect(fs.existsSync(result.path)).toBe(true);
      expect(fs.statSync(result.path).size).toBe(1024);
      expect(progress).toContain(100);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
