const { test, expect } = require('@playwright/test');
const {
  ZOOM_TYPES,
  ZOOM_MODES,
  DEFAULT_ZOOM_SEED,
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
    expect(ZOOM_MODES).toEqual(['fixed', 'alternate', 'random']);
    expect(DEFAULT_ZOOM_SEED).toBe(12345);
  });

  test('each zoom filter keeps the target size and avoids paths', () => {
    for (const type of ZOOM_TYPES) {
      const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: type, zoomStartScale: 1, zoomIntensity: 0.2 }, focus);
      if (type === 'none') {
        expect(filter).toBe('');
        continue;
      }
      expect(filter).toContain('zoompan=');
      expect(filter).toContain('s=1920x1080');
      expect(filter).not.toContain('\\');
      expect(filter).not.toMatch(/[A-Za-z]:\\/);
    }
  });

  test('zoom out decreases the zoom factor', () => {
    const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: 'zoomOut', zoomStartScale: 1, zoomIntensity: 0.2 }, focus);
    expect(filter).toContain('max(1.2-0.2*on/120,1)');
  });

  test('pulse oscillates with cosine', () => {
    const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: 'pulse', zoomStartScale: 1, zoomIntensity: 0.2 }, focus);
    expect(filter).toContain('cos(2*PI*on/120)');
  });

  test('pan types hold a constant zoom and move one axis', () => {
    const left = buildZoomFilter(scene, 1920, 1080, { zoomType: 'panLeft', zoomStartScale: 1, zoomIntensity: 0.3 }, focus);
    const right = buildZoomFilter(scene, 1920, 1080, { zoomType: 'panRight', zoomStartScale: 1, zoomIntensity: 0.3 }, focus);
    const up = buildZoomFilter(scene, 1920, 1080, { zoomType: 'panUp', zoomStartScale: 1, zoomIntensity: 0.3 }, focus);
    const down = buildZoomFilter(scene, 1920, 1080, { zoomType: 'panDown', zoomStartScale: 1, zoomIntensity: 0.3 }, focus);
    expect(left).toContain('z=\'1.3\'');
    expect(right).toContain('z=\'1.3\'');
    expect(left).toContain('(iw-iw/zoom)*(1-on/120)');
    expect(right).toContain('(iw-iw/zoom)*on/120');
    expect(up).toContain('(ih-ih/zoom)*(1-on/120)');
    expect(down).toContain('(ih-ih/zoom)*on/120');
  });

  test('kenburns zooms toward the focus point', () => {
    const filter = buildZoomFilter(scene, 1920, 1080, { zoomType: 'kenburns', zoomStartScale: 1, zoomIntensity: 0.15 }, focus);
    expect(filter).toContain('iw*0.2');
    expect(filter).toContain('ih*0.8');
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
    expect(graphs).toContain('zoompan=');
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
    expect(graph).toContain('(iw-iw/zoom)*on/120');
    expect(graph).toContain('1.3');

    const fallback = buildSceneVideoFilter({ duration: 4, focus }, 0, { outputConfig, zoomEnabled: true, zoomType: 'kenburns', zoomIntensity: 0.2, zoomStartScale: 1 });
    expect(fallback).toContain('iw*0.2');
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
});
