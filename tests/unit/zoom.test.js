const { test, expect } = require('@playwright/test');
const {
  ZOOM_TYPES,
  ZOOM_MODES,
  DEFAULT_ZOOM_SEED,
  RANDOM_ZOOM_TYPES,
  buildZoomFilter,
  buildSceneVideoFilter,
  resolveZoomType,
  seededRandom
} = require('../../app/core/ffmpeg-helpers.js');
const {
  parseRenderPayload
} = require('../../app/core/project-schema.js');
const { resolveOutputConfig } = require('../../app/core/output-formats.js');

const outputConfig = resolveOutputConfig('16:9');
const scene = { duration: 4 };
const focus = { x: 0.2, y: 0.8, scale: 1 };

test.describe('zoom catalog', () => {
  test('exposes the full catalog and modes', () => {
    expect(ZOOM_TYPES).toEqual(['none', 'kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown']);
    expect(ZOOM_MODES).toEqual(['fixed', 'alternate', 'random', 'checked']);
    expect(DEFAULT_ZOOM_SEED).toBe(12345);
  });

  test('each zoom filter uses upscale-crop-downscale chain with lanczos', () => {
    for (const type of ZOOM_TYPES) {
      const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: type, zoomStartScale: 1, zoomIntensity: 0.2 }, focus);
      if (type === 'none') {
        expect(filter).toBe('');
        continue;
      }
      // New structure: scale up -> crop -> scale down
      expect(filter).toContain('scale=5760:3240:flags=lanczos'); // 3x upscale
      expect(filter).toContain('crop=w=\'');
      expect(filter).toContain('h=\'');
      expect(filter).toContain('x=\'');
      expect(filter).toContain('y=\'');
      expect(filter).toContain('scale=1920:1080:flags=lanczos'); // downscale to target
      // Should NOT use zoompan anymore
      expect(filter).not.toContain('zoompan=');
      expect(filter).not.toContain('\\');
      expect(filter).not.toMatch(/[A-Za-z]:\\/);
    }
  });

  test('zoom out decreases the zoom factor with smoothstep easing', () => {
    const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: 'zoomOut', zoomStartScale: 1, zoomIntensity: 0.2 }, focus);
    // Check for smoothstep easing: 3*(t/d)^2 - 2*(t/d)^3
    expect(filter).toContain('3*t/4*t/4-2*t/4*t/4*t/4');
    // Zoom expression should go from maxZoom to start
    expect(filter).toContain('1.2-0.2*3*t/4*t/4-2*t/4*t/4*t/4');
    expect(filter).not.toContain('on/');
  });

  test('pulse oscillates with cosine using continuous time', () => {
    const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: 'pulse', zoomStartScale: 1, zoomIntensity: 0.2 }, focus);
    expect(filter).toContain('cos(2*PI*t/4)');
    expect(filter).not.toContain('on/');
  });

  test('pan types hold a constant zoom and move one axis with smoothstep', () => {
    const left = buildZoomFilter(scene, 1920, 1080, { zoomType: 'panLeft', zoomStartScale: 1, zoomIntensity: 0.3 }, focus);
    const right = buildZoomFilter(scene, 1920, 1080, { zoomType: 'panRight', zoomStartScale: 1, zoomIntensity: 0.3 }, focus);
    const up = buildZoomFilter(scene, 1920, 1080, { zoomType: 'panUp', zoomStartScale: 1, zoomIntensity: 0.3 }, focus);
    const down = buildZoomFilter(scene, 1920, 1080, { zoomType: 'panDown', zoomStartScale: 1, zoomIntensity: 0.3 }, focus);
    // All pans use maxZoom (1.3)
    expect(left).toContain('min(max(1.3,1),1.3)');
    expect(right).toContain('min(max(1.3,1),1.3)');
    expect(up).toContain('min(max(1.3,1),1.3)');
    expect(down).toContain('min(max(1.3,1),1.3)');
    // Pan expressions use smoothstep (3*t/4*t/4-2*t/4*t/4*t/4)
    expect(left).toContain('3*t/4*t/4-2*t/4*t/4*t/4');
    expect(right).toContain('3*t/4*t/4-2*t/4*t/4*t/4');
    expect(up).toContain('3*t/4*t/4-2*t/4*t/4*t/4');
    expect(down).toContain('3*t/4*t/4-2*t/4*t/4*t/4');
    expect(left).not.toContain('on/');
  });

  test('kenburns zooms toward the focus point with smoothstep', () => {
    const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: 'kenburns', zoomStartScale: 1, zoomIntensity: 0.15 }, focus);
    // Focus point at 0.2, 0.8 in upscaled coords: 1152, 2592
    expect(filter).toContain('1152');
    expect(filter).toContain('2592');
    // Zoom uses smoothstep easing
    expect(filter).toContain('3*t/4*t/4-2*t/4*t/4*t/4');
    expect(filter).not.toContain('on/');
  });

  test('resolveZoomType fixed keeps the base type', () => {
    expect(resolveZoomType('pulse', 'fixed', 0, 1)).toBe('pulse');
    expect(resolveZoomType('pulse', 'fixed', 3, 1)).toBe('pulse');
  });

  test('resolveZoomType alternate flips opposites on odd scenes', () => {
    expect(resolveZoomType('zoomIn', 'alternate', 0, 1)).toBe('zoomIn');
    expect(resolveZoomType('zoomIn', 'alternate', 1, 1)).toBe('zoomOut');
    expect(resolveZoomType('panLeft', 'alternate', 1, 1)).toBe('panRight');
    expect(resolveZoomType('pulse', 'alternate', 1, 1)).toBe('pulse');
    expect(resolveZoomType('none', 'alternate', 1, 1)).toBe('none');
  });

  test('resolveZoomType random is deterministic per seed', () => {
    const withSeed = [0, 1, 2, 3, 4].map((i) => resolveZoomType('kenburns', 'random', i, 42));
    const repeat = [0, 1, 2, 3, 4].map((i) => resolveZoomType('kenburns', 'random', i, 42));
    expect(withSeed).toEqual(repeat);
    expect(withSeed.every((t) => ZOOM_TYPES.includes(t) && t !== 'none')).toBe(true);
    expect(seededRandom(42, 0)).toBe(seededRandom(42, 0));
    expect(seededRandom(42, 0)).not.toBe(seededRandom(43, 0));
  });

  test('random mode varies the zoom across scenes for a given seed', () => {
    const scenes = Array.from({ length: 8 }, () => ({ duration: 1, focus }));
    const filters = scenes.map((s, i) => buildSceneVideoFilter(s, i, { outputConfig, zoomEnabled: true, zoomType: 'kenburns', zoomMode: 'random', zoomSeed: 7, zoomStartScale: 1, zoomIntensity: 0.2 }));
    const graphs = filters.join(';');
    // Should use new crop-based filters, not zoompan
    expect(graphs).not.toContain('zoompan=');
    expect(graphs).toContain('crop=w=\'');
    expect(graphs).not.toContain('\\');
    expect(new Set(filters).size).toBeGreaterThan(1);
  });

  test('zoom options survive schema validation with defaults and clamping', () => {
    const payload = parseRenderPayload({
      scenes: [{ number: 1, duration: 4, zoom: { type: 'panLeft', intensity: 0.4 } }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: { zoomType: 'pulse', zoomMode: 'random', zoomSeed: 99 }
    });
    expect(payload.renderOptions.zoomType).toBe('pulse');
    expect(payload.renderOptions.zoomMode).toBe('random');
    expect(payload.renderOptions.zoomSeed).toBe(99);
    expect(payload.scenes[0].zoom).toEqual({ type: 'panLeft', intensity: 0.4 });

    const defaults = parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: {}
    });
    expect(defaults.renderOptions.zoomType).toBe('kenburns');
    expect(defaults.renderOptions.zoomMode).toBe('fixed');
    expect(defaults.renderOptions.zoomSeed).toBe(DEFAULT_ZOOM_SEED);
  });

  test('per-scene zoom overrides the global type and intensity', () => {
    const sceneWithZoom = { duration: 4, focus, zoom: { type: 'panRight', intensity: 0.3 } };
    const graph = buildSceneVideoFilter(sceneWithZoom, 0, { outputConfig, zoomEnabled: true, zoomType: 'kenburns', zoomIntensity: 0.1, zoomStartScale: 1 });
    // Should use panRight's constant zoom (1.3) and panRight's x expression with smoothstep
    expect(graph).toContain('min(max(1.3,1),1.3)');
    expect(graph).toContain('3*t/4*t/4-2*t/4*t/4*t/4');
    expect(graph).not.toContain('on/');

    const fallback = buildSceneVideoFilter({ duration: 4, focus }, 0, { outputConfig, zoomEnabled: true, zoomType: 'kenburns', zoomIntensity: 0.2, zoomStartScale: 1 });
    // Kenburns pans toward focus point (0.2, 0.8) -> 1152, 2592 in upscaled
    expect(fallback).toContain('1152');
    expect(fallback).toContain('2592');
  });

  test('invalid zoom type is rejected by the schema', () => {
    expect(() => parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: { zoomType: 'teleport' }
    })).toThrow();
  });

  test('filter expressions use continuous time t not discrete frame number on', () => {
    for (const type of ZOOM_TYPES.filter(t => t !== 'none')) {
      const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: type, zoomStartScale: 1, zoomIntensity: 0.2 }, focus);
      // Should not contain 'on/' (discrete frame-based)
      expect(filter).not.toContain('on/');
      // Should contain 't/' (continuous time-based)
      expect(filter).toContain('t/');
    }
  });

  test('zoom filter clamps crop coordinates to valid range', () => {
    const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: 'kenburns', zoomStartScale: 1, zoomIntensity: 0.2 }, focus);
    // Crop x and y should be clamped with max(0, min(iw-cropW, ...))
    expect(filter).toContain('max(0,min(iw-');
    expect(filter).toContain('max(0,min(ih-');
  });

  test('resolveZoomType checked mode picks from checked effects', () => {
    const checked = ['kenburns', 'zoomIn', 'panLeft'];
    // With 3 checked effects, should pick from them
    const results = [0, 1, 2, 3, 4].map(i => resolveZoomType('kenburns', 'checked', i, 42, checked));
    expect(results.every(r => checked.includes(r))).toBe(true);
  });

  test('resolveZoomType checked mode never repeats same effect twice in a row', () => {
    const checked = ['kenburns', 'zoomIn', 'panLeft', 'panRight'];
    const results = [0, 1, 2, 3, 4, 5, 6, 7].map(i => resolveZoomType('kenburns', 'checked', i, 123, checked));
    // Check no consecutive duplicates
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).not.toBe(results[i - 1]);
    }
  });

  test('resolveZoomType checked mode with single effect returns that effect', () => {
    const checked = ['zoomIn'];
    const results = [0, 1, 2, 3].map(i => resolveZoomType('kenburns', 'checked', i, 42, checked));
    expect(results.every(r => r === 'zoomIn')).toBe(true);
  });

  test('resolveZoomType checked mode with empty checked falls back to all random types', () => {
    const results = [0, 1, 2, 3].map(i => resolveZoomType('kenburns', 'checked', i, 42, []));
    expect(results.every(r => RANDOM_ZOOM_TYPES.includes(r))).toBe(true);
  });

  test('resolveZoomType checked mode is deterministic per seed', () => {
    const checked = ['kenburns', 'zoomIn', 'zoomOut', 'panLeft', 'panRight'];
    const run1 = [0, 1, 2, 3, 4].map(i => resolveZoomType('kenburns', 'checked', i, 999, checked));
    const run2 = [0, 1, 2, 3, 4].map(i => resolveZoomType('kenburns', 'checked', i, 999, checked));
    expect(run1).toEqual(run2);
  });

  test('checked mode varies zoom across scenes in filter graph', () => {
    const scenes = Array.from({ length: 8 }, () => ({ duration: 1, focus }));
    const filters = scenes.map((s, i) => buildSceneVideoFilter(s, i, {
      outputConfig,
      zoomEnabled: true,
      zoomType: 'kenburns',
      zoomMode: 'checked',
      zoomCheckedEffects: ['kenburns', 'zoomIn', 'zoomOut', 'panLeft'],
      zoomSeed: 7,
      zoomStartScale: 1,
      zoomIntensity: 0.2
    }));
    const graphs = filters.join(';');
    // Should use crop filters, not zoompan
    expect(graphs).not.toContain('zoompan=');
    expect(graphs).toContain('crop=w=\'');
    // Should have variety (not all identical)
    expect(new Set(filters).size).toBeGreaterThan(1);
  });

  test('per-scene zoom override works with checked mode', () => {
    const sceneWithZoom = { duration: 4, focus, zoom: { type: 'panRight', intensity: 0.3 } };
    const graph = buildSceneVideoFilter(sceneWithZoom, 0, {
      outputConfig,
      zoomEnabled: true,
      zoomType: 'kenburns',
      zoomMode: 'checked',
      zoomCheckedEffects: ['kenburns', 'zoomIn'],
      zoomIntensity: 0.1,
      zoomStartScale: 1
    });
    // Per-scene override should win - panRight uses maxZoom=1.3
    // The zoom expression for panRight is min(max(1.3,1),1.3) but in the new format
    // it appears as part of the crop filter chain
    expect(graph).toContain('1.3'); // maxZoom value
    expect(graph).toContain('3*t/4*t/4-2*t/4*t/4*t/4');
    expect(graph).not.toContain('on/');
  });

  test('schema validates zoomCheckedEffects array', () => {
    // Valid effects should pass
    const valid = parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: { zoomCheckedEffects: ['kenburns', 'zoomIn', 'panLeft'] }
    });
    expect(valid.renderOptions.zoomCheckedEffects).toEqual(['kenburns', 'zoomIn', 'panLeft']);
    // Invalid effect should throw
    expect(() => parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: { zoomCheckedEffects: ['invalid'] }
    })).toThrow();
  });

  test('schema defaults zoomCheckedEffects to empty array', () => {
    const payload = parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {},
      renderOptions: {}
    });
    expect(payload.renderOptions.zoomCheckedEffects).toEqual([]);
  });
});