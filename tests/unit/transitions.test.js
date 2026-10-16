const { test, expect } = require('@playwright/test');
const {
  FPS,
  TRANSITION_TYPES,
  TRANSITION_MODES,
  TRANSITION_MAP,
  XFADE_TRANSITIONS,
  DEFAULT_TRANSITION_SEED,
  buildVideoFilterGraph,
  resolveTransitionType,
  resolveBoundaryTypes,
  resolveInputDurations,
  validateOffsets,
  xfadeNameFor
} = require('../../app/core/ffmpeg-helpers.js');
const { parseRenderPayload } = require('../../app/core/project-schema.js');
const { resolveOutputConfig } = require('../../app/core/output-formats.js');

const outputConfig = resolveOutputConfig('16:9');
const scenes = (n, dur = 3) => Array.from({ length: n }, (_, i) => ({ number: i + 1, duration: dur }));

test.describe('transition catalog', () => {
  test('every catalog entry maps to a valid ffmpeg 6.1 xfade transition', () => {
    expect(TRANSITION_TYPES).toEqual(['cut', 'fade', 'fadeblack', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'curtainLeft', 'curtainRight', 'circle']);
    expect(TRANSITION_MODES).toEqual(['fixed', 'alternate', 'random']);
    for (const type of TRANSITION_TYPES) {
      expect(XFADE_TRANSITIONS).toContain(xfadeNameFor(type));
    }
    expect(TRANSITION_MAP.cut).toBe('fade');
    expect(DEFAULT_TRANSITION_SEED).toBe(4242);
  });

  test('each transition produces a valid graph with the expected xfade name', () => {
    for (const type of TRANSITION_TYPES) {
      const graph = buildVideoFilterGraph(scenes(2), { outputConfig, transitionType: type, transitionDuration: 1 });
      const match = graph.match(/xfade=transition=([a-z]+):duration=([\d.]+):offset=([\d.]+)/);
      expect(match[1]).toBe(xfadeNameFor(type));
      expect(parseFloat(match[2])).toBeCloseTo(type === 'cut' ? 1 / FPS : 1, 4);
      expect(match[3]).toBe('3');
      expect(graph).not.toContain('\\');
      expect(graph).not.toMatch(/[A-Za-z]:\\/);
    }
  });

  test('cut uses a 1/FPS duration', () => {
    const graph = buildVideoFilterGraph(scenes(2), { outputConfig, transitionType: 'cut', transitionDuration: 1 });
    const match = graph.match(/xfade=transition=([a-z]+):duration=([\d.]+):offset=([\d.]+)/);
    expect(match[1]).toBe('fade');
    expect(parseFloat(match[2])).toBeCloseTo(1 / FPS, 3);
  });

  test('offsets are positive and strictly increasing for any transition', () => {
    for (const type of TRANSITION_TYPES) {
      const four = scenes(4);
      const { valid, offsets } = validateOffsets(four, type, 1);
      expect(valid).toBe(true);
      for (let i = 0; i < offsets.length; i++) {
        expect(offsets[i]).toBeGreaterThan(0);
        if (i > 0) expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
      }
      const graph = buildVideoFilterGraph(four, { outputConfig, transitionType: type, transitionDuration: 1 });
      const found = [...graph.matchAll(/offset=([\d.]+)/g)].map(m => parseFloat(m[1]));
      expect(found).toEqual(offsets);
    }
  });

  test('resolveTransitionType alternate flips directional opposites', () => {
    expect(resolveTransitionType('slideLeft', 'alternate', 1, 1)).toBe('slideRight');
    expect(resolveTransitionType('curtainRight', 'alternate', 1, 1)).toBe('curtainLeft');
    expect(resolveTransitionType('fade', 'alternate', 1, 1)).toBe('dissolve');
    expect(resolveTransitionType('slideLeft', 'alternate', 2, 1)).toBe('slideLeft');
  });

  test('resolveTransitionType random is deterministic and never picks cut', () => {
    const a = [1, 2, 3, 4, 5].map(i => resolveTransitionType('fade', 'random', i, 9));
    const b = [1, 2, 3, 4, 5].map(i => resolveTransitionType('fade', 'random', i, 9));
    expect(a).toEqual(b);
    expect(a.every(t => TRANSITION_TYPES.includes(t) && t !== 'cut')).toBe(true);
  });

  test('resolveBoundaryTypes indexes boundaries from one', () => {
    const types = resolveBoundaryTypes(scenes(4), { transitionType: 'slideLeft', transitionMode: 'alternate' });
    expect(types[0]).toBeUndefined();
    expect(types[1]).toBe('slideLeft');
    expect(types[2]).toBe('slideRight');
    expect(types[3]).toBe('slideLeft');
  });

  test('resolveInputDurations extends non-last scenes by the boundary transition', () => {
    const durations = resolveInputDurations(scenes(3, 4), { transitionType: 'fade', transitionDuration: 1 });
    expect(durations).toEqual([5, 5, 4]);
    const cut = resolveInputDurations(scenes(2, 4), { transitionType: 'cut', transitionDuration: 1 });
    expect(cut[0]).toBeCloseTo(4 + 1 / FPS, 3);
    expect(cut[1]).toBe(4);
  });

  test('transition options survive schema validation with defaults', () => {
    const payload = parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: { transitionType: 'slideUp', transitionMode: 'random', transitionSeed: 11 }
    });
    expect(payload.renderOptions.transitionType).toBe('slideUp');
    expect(payload.renderOptions.transitionMode).toBe('random');
    expect(payload.renderOptions.transitionSeed).toBe(11);

    const defaults = parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: {}
    });
    expect(defaults.renderOptions.transitionType).toBe('fade');
    expect(defaults.renderOptions.transitionMode).toBe('fixed');
    expect(defaults.renderOptions.transitionSeed).toBe(DEFAULT_TRANSITION_SEED);
  });

  test('invalid transition type is rejected by the schema', () => {
    expect(() => parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: { transitionType: 'teleport' }
    })).toThrow();
  });
});
