const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveBundledDir,
  resolveKokoroRuntime,
  resolveWhisperRuntime
} = require('../../app/core/runtime-paths.js');
const { resolveEngine: resolveVoiceEngine, checkVoiceEngine } = require('../../app/core/voice.js');
const { resolveEngine: resolveAlignEngine, describeAlignmentMissing } = require('../../app/core/alignment.js');
const { checkModelFiles } = require('../../app/core/models.js');

function makeTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildKokoro(resourcesDir) {
  const dir = path.join(resourcesDir, 'kokoro');
  fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runtime', 'kokoro-runtime.exe'), 'bin');
  fs.writeFileSync(path.join(dir, 'models', 'kokoro-v1.0.onnx'), 'm');
  fs.writeFileSync(path.join(dir, 'models', 'voices-v1.0.bin'), 'v');
  return dir;
}

function buildWhisper(resourcesDir) {
  const dir = path.join(resourcesDir, 'whisper');
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'models'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bin', 'whisper-cli.exe'), 'bin');
  fs.writeFileSync(path.join(dir, 'models', 'ggml-base.bin'), 'w');
  return dir;
}

test.describe('bundled runtime resolution', () => {
  test('returns null when the runtime folder is absent', () => {
    const resourcesDir = makeTemp('vm-res-');
    try {
      expect(resolveBundledDir('no-such-runtime', { resourcesDir })).toBeNull();
      expect(resolveKokoroRuntime({ resourcesDir }).executable).toBeNull();
      expect(resolveWhisperRuntime({ resourcesDir }).executable).toBeNull();
    } finally {
      fs.rmSync(resourcesDir, { recursive: true, force: true });
    }
  });

  test('resolves the packaged kokoro runtime and its model folder', () => {
    const resourcesDir = makeTemp('vm-res-');
    try {
      const dir = buildKokoro(resourcesDir);
      const runtime = resolveKokoroRuntime({ resourcesDir });
      expect(runtime.dir).toBe(dir);
      expect(runtime.executable).toBe(path.join(dir, 'runtime', 'kokoro-runtime.exe'));
      expect(runtime.modelsDir).toBe(path.join(dir, 'models'));
    } finally {
      fs.rmSync(resourcesDir, { recursive: true, force: true });
    }
  });

  test('resolves the packaged whisper binary and model', () => {
    const resourcesDir = makeTemp('vm-res-');
    try {
      const dir = buildWhisper(resourcesDir);
      const runtime = resolveWhisperRuntime({ resourcesDir });
      expect(runtime.executable).toBe(path.join(dir, 'bin', 'whisper-cli.exe'));
      expect(runtime.modelPath).toBe(path.join(dir, 'models', 'ggml-base.bin'));
    } finally {
      fs.rmSync(resourcesDir, { recursive: true, force: true });
    }
  });
});

test.describe('engines use the bundled runtime without VM_* variables', () => {
  test('voice engine is ready from the bundled runtime and models', () => {
    const resourcesDir = makeTemp('vm-res-');
    try {
      buildKokoro(resourcesDir);
      const readiness = checkVoiceEngine('ef_dora', {}, null, { resourcesDir });
      expect(readiness.bundled).toBe(true);
      expect(readiness.ready).toBe(true);
      expect(readiness.missingFiles).toEqual([]);

      const engine = resolveVoiceEngine('ef_dora', {}, { resourcesDir });
      expect(engine.engine).toBe('kokoro');
      expect(engine.source).toBe('bundled');
      expect(engine.executable).toContain('kokoro-runtime');
    } finally {
      fs.rmSync(resourcesDir, { recursive: true, force: true });
    }
  });

  test('voice error names the searched runtime folders when nothing is installed', () => {
    const resourcesDir = makeTemp('vm-res-');
    try {
      const readiness = checkVoiceEngine('ef_dora', {}, null, { resourcesDir });
      expect(readiness.ready).toBe(false);
      expect(readiness.runtimeSearchDirs.some(dir => dir.includes('kokoro'))).toBe(true);
    } finally {
      fs.rmSync(resourcesDir, { recursive: true, force: true });
    }
  });

  test('alignment engine resolves from the bundled whisper runtime', () => {
    const resourcesDir = makeTemp('vm-res-');
    try {
      buildWhisper(resourcesDir);
      const engine = resolveAlignEngine({}, { resourcesDir });
      expect(engine.source).toBe('bundled');
      expect(engine.executable).toContain('whisper-cli');
    } finally {
      fs.rmSync(resourcesDir, { recursive: true, force: true });
    }
  });

  test('alignment error says what is missing and where it is searched', () => {
    const resourcesDir = makeTemp('vm-res-');
    try {
      const message = describeAlignmentMissing({ resourcesDir });
      expect(message).toContain('E_ALIGN_ENGINE_MISSING');
      expect(message).toContain('whisper-cli');
      expect(message).toContain('vendor');
    } finally {
      fs.rmSync(resourcesDir, { recursive: true, force: true });
    }
  });
});

test.describe('checkModelFiles layout', () => {
  test('finds files in per-model and flat layouts and reports the missing ones', () => {
    const base = makeTemp('vm-models-');
    try {
      fs.mkdirSync(path.join(base, 'kokoro'), { recursive: true });
      fs.writeFileSync(path.join(base, 'kokoro', 'kokoro-v1.0.onnx'), 'x');
      let info = checkModelFiles(base, 'kokoro');
      expect(info.modelDir).toBe(path.join(base, 'kokoro'));
      expect(info.missingFiles.map(file => file.fileName)).toEqual(['voices-v1.0.bin']);

      fs.writeFileSync(path.join(base, 'voices-v1.0.bin'), 'x');
      info = checkModelFiles(base, 'kokoro');
      expect(info.missingFiles).toEqual([]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
