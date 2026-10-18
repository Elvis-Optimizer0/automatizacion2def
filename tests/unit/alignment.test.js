const { test, expect } = require('@playwright/test');
const {
  normalizeLanguage,
  simulateWordTimings,
  parseWhisperJson,
  mapWordsToScenes,
  clampScenes,
  alignAudio,
  alignScenes,
  resolveEngine,
  E_ALIGN_ENGINE_MISSING,
  E_ALIGN_PATH_INVALID
} = require('../../app/core/alignment.js');

const TEST_ENV = { NODE_ENV: 'test' };

test.describe('alignment language and engine', () => {
  test('normalizes languages and rejects unknown ones', () => {
    expect(normalizeLanguage('EN')).toBe('en');
    expect(normalizeLanguage('es-ES')).toBe('es');
    expect(normalizeLanguage('fr')).toBe('es');
    expect(normalizeLanguage(undefined)).toBe('es');
  });

  test('returns no engine when whisper paths are missing', () => {
    expect(resolveEngine({})).toBeNull();
    expect(resolveEngine({ VM_WHISPER_BIN: 'relative', VM_WHISPER_MODEL: 'relative' })).toBeNull();
  });
});

test.describe('simulated word timings', () => {
  test('produces one monotonic timing per word', () => {
    const words = simulateWordTimings('uno dos tres cuatro', 4);
    expect(words).toHaveLength(4);
    expect(words[0]).toEqual({ word: 'uno', start: 0, end: 1 });
    expect(words[3].end).toBe(4);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].end - 1e-6);
    }
  });

  test('returns an empty list for empty text', () => {
    expect(simulateWordTimings('   ', 5)).toEqual([]);
  });
});

test.describe('whisper json parsing', () => {
  test('converts token offsets from milliseconds to seconds', () => {
    const words = parseWhisperJson({
      transcription: [
        { text: 'hola mundo', tokens: [
          { text: ' hola', offsets: { from: 0, to: 400 } },
          { text: ' mundo', offsets: { from: 400, to: 900 } }
        ] }
      ]
    });
    expect(words).toEqual([
      { word: 'hola', start: 0, end: 0.4 },
      { word: 'mundo', start: 0.4, end: 0.9 }
    ]);
  });

  test('ignores tokens without offsets', () => {
    const words = parseWhisperJson({ transcription: [{ tokens: [{ text: '_' }] }] });
    expect(words).toEqual([]);
  });
});

test.describe('mapping words to scenes', () => {
  const scenes = [
    { number: 1, text: 'uno dos' },
    { number: 2, text: 'tres' }
  ];

  test('assigns boundary times from the word stream', () => {
    const words = simulateWordTimings('uno dos tres', 3);
    const mapped = mapWordsToScenes(scenes, words, 3);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].start).toBe(0);
    expect(mapped[0].words).toHaveLength(2);
    expect(mapped[1].words).toHaveLength(1);
    expect(mapped[1].start).toBeGreaterThanOrEqual(mapped[0].end - 1e-6);
    expect(mapped[1].end).toBeLessThanOrEqual(3 + 1e-6);
  });

  test('keeps scenes monotonic when words run out', () => {
    const words = simulateWordTimings('uno', 3);
    const mapped = mapWordsToScenes(scenes, words, 3);
    expect(mapped[1].start).toBeGreaterThanOrEqual(mapped[0].end);
    expect(mapped[1].duration).toBeGreaterThan(0);
  });

  test('clamps the last scene to the audio duration', () => {
    const clamped = clampScenes([{ number: 1, start: 0, end: 99, duration: 99 }], 5);
    expect(clamped[0].end).toBe(5);
    expect(clamped[0].duration).toBe(5);
  });
});

test.describe('alignment entry points', () => {
  test('validates the audio path outside test mode', async () => {
    await expect(alignAudio({ audioPath: 'relativo.wav', text: 'hola', env: {} }))
      .rejects.toThrow(E_ALIGN_PATH_INVALID);
  });

  test('reports a missing engine outside test mode with a valid file', async () => {
    const path = require('path');
    await expect(alignAudio({ audioPath: path.join(__dirname, 'alignment.test.js'), text: 'hola', env: {} }))
      .rejects.toThrow(E_ALIGN_ENGINE_MISSING);
  });

  test('simulates in test mode and maps scenes', async () => {
    const result = await alignScenes({
      audioPath: 'C:\\fake\\narration.wav',
      scenes: [{ number: 1, text: 'uno dos' }, { number: 2, text: 'tres' }],
      duration: 3,
      language: 'es',
      env: TEST_ENV
    });
    expect(result.words).toHaveLength(3);
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0].words).toHaveLength(2);
  });
});
