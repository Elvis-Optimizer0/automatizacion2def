const { test, expect } = require('@playwright/test');
const {
  ZOOM_TYPES,
  ZOOM_MODES,
  DEFAULT_ZOOM_SEED,
  RANDOM_ZOOM_TYPES,
  ZOOM_PRESETS,
  EASING_FUNCTIONS,
  smoothstep,
  clamp01,
  num,
  resolveZoomType,
  getMotionSpec,
  getZoomCatalog,
  buildZoomFilterV3,
  hashSpec,
  hashMotionSpec,
  generateMotionSequence
} = require('../../app/core/zoom-v3.js');

const SCENE_DURATION = 6.0;
const TOTAL_FRAMES = 30 * SCENE_DURATION;

test.describe('zoom-v3 motion spec math', () => {
  test('exposes the full catalog and modes', () => {
    expect(ZOOM_TYPES).toEqual(['none', 'kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown']);
    expect(ZOOM_MODES).toEqual(['fixed', 'alternate', 'random', 'checked']);
    expect(DEFAULT_ZOOM_SEED).toBe(12345);
  });

  test('every effect preset has valid keyframe spec', () => {
    for (const type of ZOOM_TYPES) {
      const spec = ZOOM_PRESETS[type];
      expect(spec).toBeDefined();
      expect(typeof spec.displayName).toBe('string');
      expect(typeof spec.type).toBe('string');
      expect(['static', 'linear', 'oscillate']).toContain(spec.type);
      expect(typeof spec.start).toBe('object');
      expect(typeof spec.end).toBe('object');
      expect(typeof spec.start.scale).toBe('number');
      expect(typeof spec.end.scale).toBe('number');
      expect(typeof spec.start.cx).toBe('number');
      expect(typeof spec.start.cy).toBe('number');
      expect(typeof spec.end.cx).toBe('number');
      expect(typeof spec.end.cy).toBe('number');
      expect(typeof spec.easing).toBe('string');
      expect(['linear', 'smooth', 'in', 'out']).toContain(spec.easing);
      expect(typeof spec.speed).toBe('number');
      expect(spec.speed).toBeGreaterThan(0);
      expect(typeof spec.durationSec).toBe('number');
      expect(spec.durationSec).toBeGreaterThanOrEqual(0.5);
      expect(spec.durationSec).toBeLessThanOrEqual(120);
    }
  });

  test('none effect preset has identical start and end', () => {
    const spec = ZOOM_PRESETS.none;
    expect(spec.type).toBe('static');
    expect(spec.start.scale).toBe(spec.end.scale);
    expect(spec.start.cx).toBe(spec.end.cx);
    expect(spec.start.cy).toBe(spec.end.cy);
    expect(spec.start.scale).toBe(1.0);
    expect(spec.start.cx).toBe(0.5);
    expect(spec.start.cy).toBe(0.5);
  });

  test('smoothstep easing endpoints and monotonicity', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const next = Math.min(1, p + 0.01);
      expect(EASING_FUNCTIONS.smooth(next)).toBeGreaterThanOrEqual(EASING_FUNCTIONS.smooth(p) - 1e-10);
    }
  });

  test('generateMotionSequence produces constant values for none', () => {
    const motionSpec = { ...ZOOM_PRESETS.none, durationSec: SCENE_DURATION };
    const seq = generateMotionSequence(motionSpec, TOTAL_FRAMES);
    expect(seq.length).toBe(TOTAL_FRAMES);
    for (const m of seq) {
      expect(m.scale).toBe(1.0);
      expect(m.cx).toBe(0.5);
      expect(m.cy).toBe(0.5);
    }
  });

  test('generateMotionSequence produces motion for non-none effects', () => {
    for (const type of ['kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown']) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      expect(seq.length).toBe(TOTAL_FRAMES);
      // At least one pair of consecutive frames must differ (motion present somewhere)
      let changed = false;
      for (let i = 1; i < TOTAL_FRAMES; i++) {
        if (seq[i].scale !== seq[i - 1].scale || seq[i].cx !== seq[i - 1].cx || seq[i].cy !== seq[i - 1].cy) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    }
  });

  test('kenburns scale increases monotonically from start to end scale', () => {
    const spec = { ...ZOOM_PRESETS.kenburns, durationSec: SCENE_DURATION };
    const seq = generateMotionSequence(spec, TOTAL_FRAMES);
    let prevScale = seq[0].scale;
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      expect(seq[i].scale).toBeGreaterThanOrEqual(prevScale - 1e-10);
      prevScale = seq[i].scale;
    }
    expect(seq[0].scale).toBe(ZOOM_PRESETS.kenburns.start.scale);
    expect(seq[TOTAL_FRAMES - 1].scale).toBeCloseTo(ZOOM_PRESETS.kenburns.end.scale, 4);
    // Center stays at focus point (0.5, 0.5) by default
    for (const m of seq) {
      expect(m.cx).toBe(0.5);
      expect(m.cy).toBe(0.5);
    }
  });

  test('zoomOut scale decreases monotonically from start to end scale', () => {
    const spec = { ...ZOOM_PRESETS.zoomOut, durationSec: SCENE_DURATION };
    const seq = generateMotionSequence(spec, TOTAL_FRAMES);
    let prevScale = seq[0].scale;
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      expect(seq[i].scale).toBeLessThanOrEqual(prevScale + 1e-10);
      prevScale = seq[i].scale;
    }
    expect(seq[0].scale).toBe(ZOOM_PRESETS.zoomOut.start.scale);
    expect(seq[TOTAL_FRAMES - 1].scale).toBeCloseTo(ZOOM_PRESETS.zoomOut.end.scale, 4);
  });

  test('pulse scale oscillates around center scale', () => {
    const spec = { ...ZOOM_PRESETS.pulse, durationSec: SCENE_DURATION };
    const seq = generateMotionSequence(spec, TOTAL_FRAMES);
    const amplitude = spec.amplitude ?? 0.15;
    const centerScale = spec.start.scale;

    // At t=0, scale should be centerScale (sin(0) = 0)
    expect(seq[0].scale).toBeCloseTo(centerScale, 4);
    // Center stays fixed
    for (const m of seq) {
      expect(m.cx).toBe(0.5);
      expect(m.cy).toBe(0.5);
    }
    // Scale should oscillate: min <= scale <= center + amplitude
    const scales = seq.map(m => m.scale);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(centerScale - amplitude - 0.01);
    expect(Math.max(...scales)).toBeLessThanOrEqual(centerScale + amplitude + 0.01);
  });

  test('pan effects hold constant scale and move one axis', () => {
    for (const type of ['panLeft', 'panRight', 'panUp', 'panDown']) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      expect(seq.length).toBe(TOTAL_FRAMES);

      // Scale should be constant
      for (const m of seq) {
        expect(m.scale).toBeCloseTo(ZOOM_PRESETS[type].start.scale, 4);
      }

      // One axis moves from start to end, the other stays constant
      const startCx = ZOOM_PRESETS[type].start.cx;
      const endCx = ZOOM_PRESETS[type].end.cx;
      const startCy = ZOOM_PRESETS[type].start.cy;
      const endCy = ZOOM_PRESETS[type].end.cy;

      const cxChanged = Math.abs(endCx - startCx) > 0.001;
      const cyChanged = Math.abs(endCy - startCy) > 0.001;

      if (cxChanged) {
        // cx moves, cy stays
        for (const m of seq) {
          expect(m.cy).toBeCloseTo(startCy, 4);
        }
        expect(seq[0].cx).toBeCloseTo(startCx, 4);
        expect(seq[TOTAL_FRAMES - 1].cx).toBeCloseTo(endCx, 2);
      }
      if (cyChanged) {
        // cy moves, cx stays
        for (const m of seq) {
          expect(m.cx).toBeCloseTo(startCx, 4);
        }
        expect(seq[0].cy).toBeCloseTo(startCy, 4);
        expect(seq[TOTAL_FRAMES - 1].cy).toBeCloseTo(endCy, 2);
      }

      // All values within [0, 1]
      for (const m of seq) {
        expect(m.cx).toBeGreaterThanOrEqual(0 - 1e-10);
        expect(m.cx).toBeLessThanOrEqual(1 + 1e-10);
        expect(m.cy).toBeGreaterThanOrEqual(0 - 1e-10);
        expect(m.cy).toBeLessThanOrEqual(1 + 1e-10);
      }
    }
  });

  test('center stays within image bounds for every effect', () => {
    for (const type of ZOOM_TYPES) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      for (const m of seq) {
        expect(m.cx).toBeGreaterThanOrEqual(0 - 1e-10);
        expect(m.cx).toBeLessThanOrEqual(1 + 1e-10);
        expect(m.cy).toBeGreaterThanOrEqual(0 - 1e-10);
        expect(m.cy).toBeLessThanOrEqual(1 + 1e-10);
        expect(m.scale).toBeGreaterThan(0);
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

  test('getZoomCatalog returns all effects with preset fields', () => {
    const catalog = getZoomCatalog();
    expect(catalog.length).toBe(9);
    for (const entry of catalog) {
      expect(entry.id).toBeDefined();
      expect(typeof entry.displayName).toBe('string');
      expect(typeof entry.type).toBe('string');
      expect(typeof entry.easing).toBe('string');
      expect(typeof entry.speed).toBe('number');
      expect(typeof entry.durationSec).toBe('number');
      expect(typeof entry.start).toBe('object');
      expect(typeof entry.end).toBe('object');
    }
    const ids = catalog.map(c => c.id);
    expect(ids).toEqual(ZOOM_TYPES);
  });

  test('hashSpec is deterministic', () => {
    const h1 = hashSpec('kenburns', 0.15, 1.0, 'frame-render');
    const h2 = hashSpec('kenburns', 0.15, 1.0, 'frame-render');
    expect(h1).toBe(h2);
    expect(h1.length).toBe(16);
  });

  test('hashSpec changes with different parameters', () => {
    const h1 = hashSpec('kenburns', 0.15, 1.0, 'frame-render');
    const h2 = hashSpec('kenburns', 0.20, 1.0, 'frame-render');
    expect(h1).not.toBe(h2);
  });

  test('hashMotionSpec is deterministic', () => {
    const spec1 = { type: 'kenburns', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.15 }, easing: 'smooth', speed: 1.0, durationSec: 6.0 };
    const spec2 = { type: 'kenburns', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.15 }, easing: 'smooth', speed: 1.0, durationSec: 6.0 };
    expect(hashMotionSpec(spec1)).toBe(hashMotionSpec(spec2));
    expect(hashMotionSpec(spec1).length).toBe(16);
  });

  test('hashMotionSpec changes with different parameters', () => {
    const spec1 = { type: 'kenburns', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.15 }, easing: 'smooth', speed: 1.0, durationSec: 6.0 };
    const spec2 = { type: 'kenburns', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.20 }, easing: 'smooth', speed: 1.0, durationSec: 6.0 };
    expect(hashMotionSpec(spec1)).not.toBe(hashMotionSpec(spec2));
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
    // Default is now 4x lanczos upscale + lanczos downscale
    expect(filter).toContain('scale=7680:4320:flags=lanczos');
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
    expect(spec).toEqual(ZOOM_PRESETS.kenburns);
  });

  test('getMotionSpec returns copy not reference', () => {
    const spec1 = getMotionSpec('kenburns');
    const spec2 = getMotionSpec('kenburns');
    expect(spec1).not.toBe(spec2);
    expect(spec1).toEqual(spec2);
  });

  test('generateMotionSequence throws for unknown effect id', () => {
    expect(() => generateMotionSequence({ type: 'nonexistent', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.0 }, durationSec: 6.0 }, 180)).toThrow();
  });

  test('generateMotionSequence throws for durationSec missing', () => {
    expect(() => generateMotionSequence({ type: 'kenburns', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.15 } }, 180)).toThrow();
  });

  test('generateMotionSequence throws for durationSec too small', () => {
    expect(() => generateMotionSequence({ type: 'kenburns', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.15 }, durationSec: 0.1 }, 180)).toThrow();
  });

  test('generateMotionSequence throws for durationSec too large', () => {
    expect(() => generateMotionSequence({ type: 'kenburns', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.15 }, durationSec: 200 }, 180)).toThrow();
  });

  test('generateMotionSequence throws for zero amplitude non-none effect', () => {
    expect(() => generateMotionSequence({
      type: 'kenburns',
      start: { cx: 0.5, cy: 0.5, scale: 1.0 },
      end: { cx: 0.5, cy: 0.5, scale: 1.0 },
      durationSec: 6.0
    }, 180)).toThrow();
  });

  test('generateMotionSequence values stay within bounds for every effect', () => {
    for (const type of ZOOM_TYPES) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      for (const m of seq) {
        expect(m.scale).toBeGreaterThan(0);
        expect(m.scale).toBeLessThanOrEqual(2.0);
        expect(m.cx).toBeGreaterThanOrEqual(0 - 1e-10);
        expect(m.cx).toBeLessThanOrEqual(1 + 1e-10);
        expect(m.cy).toBeGreaterThanOrEqual(0 - 1e-10);
        expect(m.cy).toBeLessThanOrEqual(1 + 1e-10);
      }
    }
  });

  test('generateMotionSequence holds at end after durationSec', () => {
    const spec = { ...ZOOM_PRESETS.zoomIn, durationSec: 3.0 };
    // Use enough frames to cover t >= durationSec (3s = 90 frames at 30fps)
    const totalFrames = 91;
    const seq = generateMotionSequence(spec, totalFrames);
    // Frame at t=3.0s (index 90) and beyond should be at end scale
    const endFrame = seq[totalFrames - 1];
    expect(endFrame.scale).toBeCloseTo(1.15, 4);

    // With longer totalFrames, frames after 3s should hold at end scale
    const longSeq = generateMotionSequence(spec, 180);
    const holdStartFrame = Math.ceil(3.0 * 30); // frame 90 = t=3.0s
    for (let i = holdStartFrame; i < longSeq.length; i++) {
      expect(longSeq[i].scale).toBeCloseTo(1.15, 4);
    }
  });

  test('generateMotionSequence speed affects completion time', () => {
    const specFast = { ...ZOOM_PRESETS.zoomIn, durationSec: 6.0, speed: 2.0 };
    const specSlow = { ...ZOOM_PRESETS.zoomIn, durationSec: 6.0, speed: 0.5 };

    const seqFast = generateMotionSequence(specFast, TOTAL_FRAMES);
    const seqSlow = generateMotionSequence(specSlow, TOTAL_FRAMES);

    // Fast speed (2x): completes in 3s (frame 90)
    // Slow speed (0.5x): completes in 12s (beyond 6s clip, never reaches end)
    expect(seqFast[89].scale).toBeCloseTo(1.15, 2);  // frame 89 = t=2.97s, close to end
    expect(seqFast[90].scale).toBeCloseTo(1.15, 4);  // frame 90 = t=3.0s, at end
    expect(seqSlow[179].scale).toBeLessThan(1.14);   // still moving at end of clip
  });

  /* ========== ACCEPTANCE TESTS ==========
   * These tests verify the motion-spec acceptance criteria.
   * They must FAIL on the old implementation (static clips, pans finishing early)
   * and PASS on the new implementation (motion present, correct timing, smoothness).
   */

  test('ACCEPTANCE: motion present - non-none effects produce measurable change', () => {
    for (const type of ['kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown']) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      const first = seq[0];
      const last = seq[TOTAL_FRAMES - 1];
      const totalChange = Math.abs(last.scale - first.scale) + Math.abs(last.cx - first.cx) + Math.abs(last.cy - first.cy);
      // Motion must be present: total change > 0.01 (normalized units)
      expect(totalChange).toBeGreaterThan(0.01);
    }
  });

  test('ACCEPTANCE: none effect has identical frames (no motion)', () => {
    const spec = { ...ZOOM_PRESETS.none, durationSec: SCENE_DURATION };
    const seq = generateMotionSequence(spec, TOTAL_FRAMES);
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      expect(seq[i].scale).toBe(seq[0].scale);
      expect(seq[i].cx).toBe(seq[0].cx);
      expect(seq[i].cy).toBe(seq[0].cy);
    }
  });

  test('ACCEPTANCE: pan effects travel across the full scene (not just 0.5s)', () => {
    for (const type of ['panLeft', 'panRight', 'panUp', 'panDown']) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      const first = seq[0];
      const last = seq[TOTAL_FRAMES - 1];
      // Pan must traverse the full range: cx or cy changes from one extreme to the other
      const cxChange = Math.abs(last.cx - first.cx);
      const cyChange = Math.abs(last.cy - first.cy);
      const totalTravel = cxChange + cyChange;
      // Total pan travel must be >= 8% of frame width (0.08 normalized)
      expect(totalTravel).toBeGreaterThanOrEqual(0.08);
      // Progress at 25%, 50%, 75% should be roughly proportional (within 20%)
      const p25 = seq[Math.floor(TOTAL_FRAMES * 0.25)];
      const p50 = seq[Math.floor(TOTAL_FRAMES * 0.50)];
      const p75 = seq[Math.floor(TOTAL_FRAMES * 0.75)];
      const progress25 = cxChange > 0 ? Math.abs(p25.cx - first.cx) / cxChange : Math.abs(p25.cy - first.cy) / cyChange;
      const progress50 = cxChange > 0 ? Math.abs(p50.cx - first.cx) / cxChange : Math.abs(p50.cy - first.cy) / cyChange;
      const progress75 = cxChange > 0 ? Math.abs(p75.cx - first.cx) / cxChange : Math.abs(p75.cy - first.cy) / cyChange;
      // With smoothstep, progress at 25% should be < 0.5, at 50% ~0.5, at 75% > 0.5
      expect(progress25).toBeLessThan(0.6);
      expect(progress50).toBeGreaterThan(0.3);
      expect(progress50).toBeLessThan(0.7);
      expect(progress75).toBeGreaterThan(0.4);
    }
  });

  test('ACCEPTANCE: zoomIn/zoomOut reach full intensity by end of durationSec', () => {
    for (const type of ['zoomIn', 'zoomOut']) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      const first = seq[0];
      const last = seq[TOTAL_FRAMES - 1];
      const totalChange = Math.abs(last.scale - first.scale);
      // Total scale change should match the intensity (~0.15)
      expect(totalChange).toBeGreaterThan(0.1);
      expect(totalChange).toBeLessThan(0.25);
      // Last frame should be at or very near the end scale
      expect(last.scale).toBeCloseTo(spec.end.scale, 3);
    }
  });

  test('ACCEPTANCE: smoothstep does not finish early - progress at 50% is ~0.5', () => {
    const spec = { ...ZOOM_PRESETS.kenburns, durationSec: SCENE_DURATION };
    const seq = generateMotionSequence(spec, TOTAL_FRAMES);
    const midFrame = seq[Math.floor(TOTAL_FRAMES * 0.5)];
    const first = seq[0];
    const last = seq[TOTAL_FRAMES - 1];
    const totalChange = last.scale - first.scale;
    const progressAtMid = (midFrame.scale - first.scale) / totalChange;
    // Smoothstep at p=0.5 gives exactly 0.5
    expect(progressAtMid).toBeCloseTo(0.5, 2);
  });

  test('ACCEPTANCE: acceleration RMS is bounded (no excessive jitter)', () => {
    for (const type of ZOOM_TYPES) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      const accels = [];
      for (let i = 1; i < seq.length - 1; i++) {
        const accel = seq[i + 1].scale - 2 * seq[i].scale + seq[i - 1].scale;
        accels.push(accel * accel);
      }
      const accelRms = Math.sqrt(accels.reduce((a, b) => a + b, 0) / accels.length);
      // Acceleration RMS should be small (smooth motion, no jitter)
      expect(accelRms).toBeLessThan(0.01);
    }
  });

  test('ACCEPTANCE: no repeated or non-monotone steps for monotone effects', () => {
    for (const type of ['zoomIn', 'zoomOut', 'kenburns', 'panLeft', 'panRight', 'panUp', 'panDown']) {
      const spec = { ...ZOOM_PRESETS[type], durationSec: SCENE_DURATION };
      const seq = generateMotionSequence(spec, TOTAL_FRAMES);
      let repeatedSteps = 0;
      let nonMonotoneSteps = 0;
      for (let i = 1; i < TOTAL_FRAMES; i++) {
        const scaleChange = Math.abs(seq[i].scale - seq[i - 1].scale);
        const cxChange = Math.abs(seq[i].cx - seq[i - 1].cx);
        const cyChange = Math.abs(seq[i].cy - seq[i - 1].cy);
        if (scaleChange < 1e-6 && cxChange < 1e-6 && cyChange < 1e-6) {
          repeatedSteps++;
        }
        // For zoomIn: scale should be non-decreasing
        // For zoomOut: scale should be non-increasing
        if (type === 'zoomIn' && seq[i].scale < seq[i - 1].scale - 1e-6) nonMonotoneSteps++;
        if (type === 'zoomOut' && seq[i].scale > seq[i - 1].scale + 1e-6) nonMonotoneSteps++;
      }
      expect(repeatedSteps).toBe(0);
      expect(nonMonotoneSteps).toBe(0);
    }
  });
});
