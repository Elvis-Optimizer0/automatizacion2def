const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  listVoices,
  normalizeLanguage,
  getSamplePhrase,
  isTestMode,
  simulateSpeechDuration,
  resolveEngine,
  checkVoiceEngine,
  buildVoiceEngineError,
  synthesizeVoice,
  VOICE_CATALOG
} = require('../../app/core/voice.js');

test.describe('voice catalog and languages', () => {
  test('filters voices by language', () => {
    const spanish = listVoices('es');
    const english = listVoices('en');
    expect(spanish.length).toBeGreaterThan(0);
    expect(english.length).toBeGreaterThan(0);
    expect(spanish.every(voice => voice.language === 'es')).toBe(true);
    expect(english.every(voice => voice.language === 'en')).toBe(true);
    expect(spanish.map(v => v.id)).toContain('ef_dora');
    expect(english.map(v => v.id)).toContain('af_heart');
    const ids = VOICE_CATALOG.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('normalizes language codes', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('English')).toBe('en');
    expect(normalizeLanguage('es')).toBe('es');
    expect(normalizeLanguage(undefined)).toBe('es');
  });

  test('provides a sample phrase per language', () => {
    expect(getSamplePhrase('es')).toMatch(/voz/i);
    expect(getSamplePhrase('en')).toMatch(/voice/i);
    expect(getSamplePhrase('es')).not.toBe(getSamplePhrase('en'));
  });

  test('detects test mode from the environment', () => {
    expect(isTestMode({ NODE_ENV: 'test' })).toBe(true);
    expect(isTestMode({ ELECTRON_TEST: '1' })).toBe(true);
    expect(isTestMode({})).toBe(false);
  });
});

test.describe('voice duration estimation', () => {
  test('grows with text length', () => {
    const short = simulateSpeechDuration('hola mundo');
    const long = simulateSpeechDuration('hola mundo este es un texto bastante mas largo para leer');
    expect(long).toBeGreaterThan(short);
  });

  test('shrinks when speed increases', () => {
    const normal = simulateSpeechDuration('uno dos tres cuatro cinco seis', { speed: 1 });
    const fast = simulateSpeechDuration('uno dos tres cuatro cinco seis', { speed: 1.5 });
    expect(fast).toBeLessThan(normal);
  });

  test('adds pause time between paragraphs', () => {
    const text = 'primera linea\nsegunda linea\ntercera linea';
    const noPause = simulateSpeechDuration(text, { pause: 0 });
    const withPause = simulateSpeechDuration(text, { pause: 1 });
    expect(withPause - noPause).toBeCloseTo(2, 5);
  });

  test('returns zero for empty text', () => {
    expect(simulateSpeechDuration('')).toBe(0);
    expect(simulateSpeechDuration('   \n  ')).toBe(0);
  });
});

test.describe('voice engine resolution', () => {
  test('returns null when no engine binary is configured', () => {
    expect(resolveEngine('ef_dora', {})).toBeNull();
  });

  test('reports the exact missing model files and their search paths', () => {
    const modelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-voice-models-'));
    try {
      const readiness = checkVoiceEngine('ef_dora', {}, modelsDir);
      expect(readiness.ready).toBe(false);
      expect(readiness.modelDir).toBe(path.join(modelsDir, 'kokoro'));
      expect(readiness.missingFiles.map(file => file.fileName))
        .toEqual(['kokoro-v1.0.onnx', 'voices-v1.0.bin']);

      const message = buildVoiceEngineError(readiness);
      expect(message).toContain('falta kokoro-v1.0.onnx');
      expect(message).toContain(path.join(modelsDir, 'kokoro', 'voices-v1.0.bin'));
      expect(message).toContain('VM_KOKORO_BIN');
    } finally {
      fs.rmSync(modelsDir, { recursive: true, force: true });
    }
  });

  test('names the missing file when synthesis has no usable engine', async () => {
    const modelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-voice-models-'));
    const outputPath = path.join(modelsDir, 'voz.wav');
    try {
      await expect(synthesizeVoice({ text: 'hola', outputPath, env: {}, modelsDir }))
        .rejects.toThrow(/voices-v1\.0\.bin/);
    } finally {
      fs.rmSync(modelsDir, { recursive: true, force: true });
    }
  });

  test('rejects a relative or empty output path', async () => {
    await expect(synthesizeVoice({ text: 'hola', outputPath: 'relativo.wav', env: { NODE_ENV: 'test' } }))
      .rejects.toThrow(/E_VOICE_PATH_INVALID/);
  });

  test('rejects empty text', async () => {
    const out = path.join(os.tmpdir(), 'vm-voice-empty.wav');
    await expect(synthesizeVoice({ text: '   ', outputPath: out, env: { NODE_ENV: 'test' } }))
      .rejects.toThrow(/E_VOICE_FAILED/);
  });
});

test.describe('simulated voice generation', () => {
  test('writes a wav file with duration greater than zero in test mode', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-voice-'));
    const outputPath = path.join(dir, 'voz.wav');
    const progress = [];

    try {
      const result = await synthesizeVoice(
        {
          text: 'Hola, este es un texto de prueba para la voz local.',
          language: 'es',
          voiceId: 'ef_dora',
          speed: 1,
          pause: 0.2,
          outputPath,
          env: { NODE_ENV: 'test' }
        },
        { onProgress: (p) => progress.push(p.progress) }
      );

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      const header = fs.readFileSync(outputPath).slice(0, 4).toString();
      expect(header).toBe('RIFF');
      expect(progress.length).toBeGreaterThan(0);
      expect(progress.some(p => p >= 55)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
