const { test, expect } = require('@playwright/test');
const {
  ZOOM_TYPES,
  ZOOM_MODES,
  DEFAULT_ZOOM_SEED,
  RANDOM_ZOOM_TYPES,
  ZOOM_MOTION_SPECS,
  smoothstep,
  clamp01,
  num,
  resolveZoomType,
  getMotionSpec,
  getZoomCatalog,
  buildZoomFilterV3,
  hashSpec
} = require('../../app/core/zoom-v3.js');

test.describe('zoom-v3 motion spec math', () => {
  test('exposes the full catalog and modes', () => {
    expect(ZOOM_TYPES).toEqual(['none', 'kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown']);
    expect(ZOOM_MODES).toEqual(['fixed', 'alternate', 'random', 'checked']);
    expect(DEFAULT_ZOOM_SEED).toBe(12345);
  });

  test('every effect has a motion spec with default intensity and start scale', () => {
    for (const type of ZOOM_TYPES) {
      const spec = ZOOM_MOTION_SPECS[type];
      expect(spec).toBeDefined();
      expect(typeof spec.displayName).toBe('string');
      expect(typeof spec.defaultIntensity).toBe('number');
      expect(typeof spec.defaultStartScale).toBe('number');
      expect(typeof spec.motion).toBe('function');
    }
  });

  test('smoothstep easing endpoints and monotonicity', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const next = Math.min(1, p + 0.01);
      expect(smoothstep(next)).toBeGreaterThanOrEqual(smoothstep(p) - 1e-10);
    }
  });

  test('none effect has constant scale and center', () => {
    const spec = ZOOM_MOTION_SPECS.none;
    for (let p = 0; p <= 1; p += 0.1) {
      const result = spec.motion(p, 0, 1.0);
      expect(result.scale).toBe(1.0);
      expect(result.cx).toBe(0.5);
      expect(result.cy).toBe(0.5);
    }
  });

  test('kenburns scale increases monotonically from start to start+intensity', () => {
    const spec = ZOOM_MOTION_SPECS.kenburns;
    const intensity = 0.15;
    const start = 1.0;
    let prevScale = start;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const result = spec.motion(p, intensity, start);
      expect(result.scale).toBeGreaterThanOrEqual(prevScale - 1e-10);
      expect(result.scale).toBeLessThanOrEqual(start + intensity + 1e-10);
      expect(result.cx).toBe(0.5);
      expect(result.cy).toBe(0.5);
      prevScale = result.scale;
    }
    expect(spec.motion(0, intensity, start).scale).toBe(start);
    expect(spec.motion(1, intensity, start).scale).toBe(start + intensity);
  });

  test('zoomOut scale decreases monotonically from start+intensity to start', () => {
    const spec = ZOOM_MOTION_SPECS.zoomOut;
    const intensity = 0.15;
    const start = 1.0;
    let prevScale = start + intensity;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const result = spec.motion(p, intensity, start);
      expect(result.scale).toBeLessThanOrEqual(prevScale + 1e-10);
      expect(result.scale).toBeGreaterThanOrEqual(start - 1e-10);
      prevScale = result.scale;
    }
    expect(spec.motion(0, intensity, start).scale).toBe(start + intensity);
    expect(spec.motion(1, intensity, start).scale).toBeCloseTo(start, 10);
  });

  test('pulse scale oscillates around start+intensity/2', () => {
    const spec = ZOOM_MOTION_SPECS.pulse;
    const intensity = 0.15;
    const start = 1.0;
    const around = start + intensity / 2;
    const result0 = spec.motion(0, intensity, start);
    const result05 = spec.motion(0.5, intensity, start);
    const result1 = spec.motion(1, intensity, start);
    expect(result0.scale).toBeCloseTo(around - intensity / 2, 10);
    expect(result05.scale).toBeCloseTo(around + intensity / 2, 10);
    expect(result1.scale).toBeCloseTo(around - intensity / 2, 10);
    expect(result0.cx).toBe(0.5);
    expect(result0.cy).toBe(0.5);
  });

  test('pan effects hold constant maxZoom scale and move one axis', () => {
    const intensity = 0.15;
    const start = 1.0;
    const maxZoom = start + intensity;

    const panLeft = ZOOM_MOTION_SPECS.panLeft;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const r = panLeft.motion(p, intensity, start);
      expect(r.scale).toBe(maxZoom);
      expect(r.cy).toBe(0.5);
      expect(r.cx).toBeGreaterThanOrEqual(0 - 1e-10);
      expect(r.cx).toBeLessThanOrEqual(1 + 1e-10);
    }

    const panRight = ZOOM_MOTION_SPECS.panRight;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const r = panRight.motion(p, intensity, start);
      expect(r.scale).toBe(maxZoom);
      expect(r.cy).toBe(0.5);
      expect(r.cx).toBeGreaterThanOrEqual(0 - 1e-10);
      expect(r.cx).toBeLessThanOrEqual(1 + 1e-10);
    }

    const panUp = ZOOM_MOTION_SPECS.panUp;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const r = panUp.motion(p, intensity, start);
      expect(r.scale).toBe(maxZoom);
      expect(r.cx).toBe(0.5);
      expect(r.cy).toBeGreaterThanOrEqual(0 - 1e-10);
      expect(r.cy).toBeLessThanOrEqual(1 + 1e-10);
    }

    const panDown = ZOOM_MOTION_SPECS.panDown;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const r = panDown.motion(p, intensity, start);
      expect(r.scale).toBe(maxZoom);
      expect(r.cx).toBe(0.5);
      expect(r.cy).toBeGreaterThanOrEqual(0 - 1e-10);
      expect(r.cy).toBeLessThanOrEqual(1 + 1e-10);
    }
  });

  test('center stays within image bounds for every effect', () => {
    for (const type of ZOOM_TYPES) {
      const spec = ZOOM_MOTION_SPECS[type];
      const intensity = spec.defaultIntensity;
      const start = spec.defaultStartScale;
      for (let i = 0; i <= 100; i++) {
        const p = i / 100;
        const r = spec.motion(p, intensity, start);
        expect(r.cx).toBeGreaterThanOrEqual(0 - 1e-10);
        expect(r.cx).toBeLessThanOrEqual(1 + 1e-10);
        expect(r.cy).toBeGreaterThanOrEqual(0 - 1e-10);
        expect(r.cy).toBeLessThanOrEqual(1 + 1e-10);
        expect(r.scale).toBeGreaterThanOrEqual(1 - 1e-10);
      }
    }
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
    expect(withSeed.every((t) => RANDOM_ZOOM_TYPES.includes(t))).toBe(true);
  });

  test('getZoomCatalog returns all effects with display names', () => {
    const catalog = getZoomCatalog();
    expect(catalog.length).toBe(9);
    for (const entry of catalog) {
      expect(entry.id).toBeDefined();
      expect(typeof entry.displayName).toBe('string');
      expect(typeof entry.defaultIntensity).toBe('number');
      expect(typeof entry.defaultStartScale).toBe('number');
    }
    const ids = catalog.map(c => c.id);
    expect(ids).toEqual(ZOOM_TYPES);
  });

  test('hashSpec is deterministic', () => {
    const h1 = hashSpec('kenburns', 0.15, 1.0, 'upscale-crop-downscale');
    const h2 = hashSpec('kenburns', 0.15, 1.0, 'upscale-crop-downscale');
    expect(h1).toBe(h2);
    expect(h1.length).toBe(16);
  });

  test('hashSpec changes with different parameters', () => {
    const h1 = hashSpec('kenburns', 0.15, 1.0, 'upscale-crop-downscale');
    const h2 = hashSpec('kenburns', 0.20, 1.0, 'upscale-crop-downscale');
    expect(h1).not.toBe(h2);
  });

  test('buildZoomFilterV3 returns empty string for none', () => {
    const scene = { duration: 6 };
    const focus = { x: 0.5, y: 0.5, scale: 1 };
    const options = { zoomType: 'none', zoomStartScale: 1, zoomIntensity: 0.15 };
    const filter = buildZoomFilterV3(scene, 1920, 1080, options, focus);
    expect(filter).toBe('');
  });

  test('buildZoomFilterV3 upscale-crop-downscale has correct structure', () => {
    const scene = { duration: 6 };
    const focus = { x: 0.5, y: 0.5, scale: 1 };
    const options = { zoomType: 'kenburns', zoomStartScale: 1, zoomIntensity: 0.15 };
    const filter = buildZoomFilterV3(scene, 1920, 1080, options, focus, 'upscale-crop-downscale');
    expect(filter).toContain('scale=3840:2160:flags=bilinear');
    expect(filter).toContain('crop=w=\'');
    expect(filter).toContain('scale=1920:1080:flags=lanczos');
    expect(filter).not.toContain('\\');
    expect(filter).not.toMatch(/[A-Za-z]:\\/);
  });

  test('clamp01 clamps values to [0,1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(NaN)).toBe(0.5);
    expect(clamp01(undefined)).toBe(0.5);
  });

  test('num rounds to specified decimals', () => {
    expect(num(1.23456789)).toBe(1.234568);
    expect(num(1.23456789, 2)).toBe(1.23);
    expect(num(1)).toBe(1);
  });

  test('getMotionSpec returns kenburns for unknown type', () => {
    const spec = getMotionSpec('nonexistent');
    expect(spec).toEqual(ZOOM_MOTION_SPECS.kenburns);
  });

  test('getMotionSpec returns copy not reference', () => {
    const spec1 = getMotionSpec('kenburns');
    const spec2 = getMotionSpec('kenburns');
    expect(spec1).not.toBe(spec2);
    expect(spec1).toEqual(spec2);
  });
});