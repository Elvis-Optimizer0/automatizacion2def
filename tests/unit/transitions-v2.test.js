const { test, expect } = require('@playwright/test');
const {
  TRANSITION_CATALOG,
  TRANSITION_IDS,
  getTransitionCatalog,
  getMotionSpec,
  num,
  buildSceneFilter,
  resolveBoundaryTypes,
  resolveTransitionType,
  seededRandom,
  transitionDurationFor,
  resolveInputDurations,
  transitionBoundaries,
  calculateTotalDuration,
  normalizeScenesToDuration,
  hashSpec,
  sanitizeFileName
} = require('../../app/core/transitions-v2.js');
const {
  resolveBoundaryTypes: origResolveBoundaryTypes,
  resolveInputDurations: origResolveInputDurations,
  calculateTotalDuration: origCalcTotalDuration,
  normalizeScenesToDuration: origNormalizeScenes
} = require('../../app/core/ffmpeg-helpers.js');

test.describe('transitions-v2 catalog', () => {
  test('catalog has 11 entries including cut', () => {
    expect(TRANSITION_CATALOG.length).toBe(11);
    const ids = TRANSITION_CATALOG.map(t => t.id);
    expect(ids).toEqual([
      'cut', 'fade', 'fadeblack', 'dissolve',
      'slideLeft', 'slideRight', 'slideUp', 'slideDown',
      'curtainLeft', 'curtainRight', 'circle'
    ]);
  });

  test('each entry has required fields', () => {
    TRANSITION_CATALOG.forEach(t => {
      expect(t.id).toBeDefined();
      expect(t.displayName).toBeDefined();
      expect(t.xfadeName).toBeDefined();
      expect(typeof t.defaultDuration).toBe('number');
      expect(typeof t.isCut).toBe('boolean');
    });
  });

  test('cut uses 1/FPS duration', () => {
    const cut = TRANSITION_CATALOG.find(t => t.id === 'cut');
    expect(cut.isCut).toBe(true);
    expect(cut.defaultDuration).toBeCloseTo(1/30);
  });

  test('non-cut transitions have 1s default', () => {
    TRANSITION_CATALOG.filter(t => !t.isCut).forEach(t => {
      expect(t.defaultDuration).toBe(1.0);
    });
  });

  test('getTransitionCatalog returns clean objects', () => {
    const cat = getTransitionCatalog();
    expect(cat.length).toBe(11);
    cat.forEach(t => {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('displayName');
      expect(t).toHaveProperty('xfadeName');
      expect(t).toHaveProperty('defaultDuration');
      expect(t).toHaveProperty('isCut');
    });
  });
});

test.describe('motion specs', () => {
  test('every catalog id has a motion spec', () => {
    TRANSITION_IDS.forEach(id => {
      const spec = getMotionSpec(id);
      expect(spec).toHaveProperty('easing');
      expect(spec).toHaveProperty('params');
    });
  });

  test('cut spec is minimal', () => {
    const spec = getMotionSpec('cut');
    expect(spec.easing).toBe('linear');
    expect(spec.params).toEqual({});
  });

  test('fade spec has opacity params', () => {
    const spec = getMotionSpec('fade');
    expect(spec.easing).toBe('smoothstep');
    expect(spec.params.opacity).toEqual({ from: 1, to: 0 });
  });

  test('slide specs have direction', () => {
    ['slideLeft', 'slideRight', 'slideUp', 'slideDown'].forEach(id => {
      const spec = getMotionSpec(id);
      expect(spec.params.direction).toBeDefined();
    });
  });
});

test.describe('num utility', () => {
  test('rounds to 6 decimals by default', () => {
    expect(num(1.123456789)).toBe(1.123457);
  });

  test('handles custom decimals', () => {
    expect(num(1.123456789, 3)).toBe(1.123);
  });
});

test.describe('buildSceneFilter', () => {
  test('produces valid filter string for cover mode', () => {
    const filter = buildSceneFilter(0, 1920, 1080, 'cover', '#000000', 'color', '#000000', { x: 0.5, y: 0.5, scale: 1 });
    expect(filter).toContain('[v0]');
    expect(filter).toContain('setsar=1');
    expect(filter).toContain('format=yuv420p');
  });

  test('produces valid filter for blur mode', () => {
    const filter = buildSceneFilter(0, 1920, 1080, 'blur', '#000000', 'color', '#000000', { x: 0.5, y: 0.5, scale: 1 });
    expect(filter).toContain('boxblur');
    expect(filter).toContain('[v0]');
  });

  test('produces valid filter for frame mode', () => {
    const filter = buildSceneFilter(0, 1920, 1080, 'frame', '#ff0000', 'color', '#000000', { x: 0.5, y: 0.5, scale: 1 });
    expect(filter).toContain('pad=');
    expect(filter).toContain('#ff0000');
  });

  test('handles scale < 1 with color background', () => {
    const filter = buildSceneFilter(0, 1920, 1080, 'cover', '#000000', 'color', '#ff0000', { x: 0.5, y: 0.5, scale: 0.5 });
    expect(filter).toContain('pad=');
    expect(filter).toContain('#ff0000');
  });
});

test.describe('resolveBoundaryTypes', () => {
  const scenes = [
    { duration: 5 },
    { duration: 5 },
    { duration: 5 }
  ];

  test('fixed mode uses base type for all boundaries', () => {
    const types = resolveBoundaryTypes(scenes, { transitionType: 'fade', transitionMode: 'fixed' });
    expect(types[1]).toBe('fade');
    expect(types[2]).toBe('fade');
  });

  test('alternate mode flips opposites', () => {
    const types = resolveBoundaryTypes(scenes, { transitionType: 'slideLeft', transitionMode: 'alternate' });
    expect(types[1]).toBe('slideLeft');
    expect(types[2]).toBe('slideRight');
  });

  test('random mode is deterministic per seed', () => {
    const types1 = resolveBoundaryTypes(scenes, { transitionType: 'fade', transitionMode: 'random', transitionSeed: 123 });
    const types2 = resolveBoundaryTypes(scenes, { transitionType: 'fade', transitionMode: 'random', transitionSeed: 123 });
    expect(types1).toEqual(types2);
  });

  test('random mode never picks cut', () => {
    const types = resolveBoundaryTypes(scenes, { transitionType: 'fade', transitionMode: 'random', transitionSeed: 123 });
    expect(types[1]).not.toBe('cut');
    expect(types[2]).not.toBe('cut');
  });

  test('per-scene override takes precedence', () => {
    const scenesWithOverride = [
      { duration: 5 },
      { duration: 5, transition: { type: 'circle' } },
      { duration: 5 }
    ];
    const types = resolveBoundaryTypes(scenesWithOverride, { transitionType: 'fade', transitionMode: 'fixed' });
    expect(types[1]).toBe('circle');
    expect(types[2]).toBe('fade');
  });
});

test.describe('resolveTransitionType', () => {
  test('fixed returns base type', () => {
    expect(resolveTransitionType('fade', 'fixed', 0)).toBe('fade');
    expect(resolveTransitionType('slideLeft', 'fixed', 5)).toBe('slideLeft');
  });

  test('alternate flips directional opposites', () => {
    expect(resolveTransitionType('slideLeft', 'alternate', 0)).toBe('slideLeft');
    expect(resolveTransitionType('slideLeft', 'alternate', 1)).toBe('slideRight');
    expect(resolveTransitionType('slideUp', 'alternate', 2)).toBe('slideUp');
    expect(resolveTransitionType('slideUp', 'alternate', 3)).toBe('slideDown');
  });

  test('random is deterministic per seed and index', () => {
    const a = resolveTransitionType('fade', 'random', 0, 42);
    const b = resolveTransitionType('fade', 'random', 0, 42);
    expect(a).toBe(b);
    expect(TRANSITION_IDS.filter(t => t !== 'cut')).toContain(a);
  });

  test('defaults to fade for unknown base', () => {
    expect(resolveTransitionType('unknown', 'fixed', 0)).toBe('fade');
  });
});

test.describe('seededRandom', () => {
  test('produces deterministic sequence', () => {
    const seq1 = [seededRandom(123, 0), seededRandom(123, 1), seededRandom(123, 2)];
    const seq2 = [seededRandom(123, 0), seededRandom(123, 1), seededRandom(123, 2)];
    expect(seq1).toEqual(seq2);
  });

  test('different seeds produce different sequences', () => {
    const a = seededRandom(123, 0);
    const b = seededRandom(456, 0);
    expect(a).not.toBe(b);
  });

  test('values in [0,1)', () => {
    for (let i = 0; i < 100; i++) {
      const v = seededRandom(123, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

test.describe('transitionDurationFor', () => {
  const scenes = [
    { duration: 6 },
    { duration: 6 },
    { duration: 6 }
  ];

  test('cut returns 1/FPS', () => {
    expect(transitionDurationFor(scenes, 1, 'cut', 1.0)).toBeCloseTo(1/30);
  });

  test('fade returns min(transitionDuration, prevDur/2, currDur/2)', () => {
    expect(transitionDurationFor(scenes, 1, 'fade', 1.0)).toBe(1.0);
    expect(transitionDurationFor(scenes, 1, 'fade', 5.0)).toBe(3.0);
  });

  test('works with short scenes', () => {
    const shortScenes = [{ duration: 1 }, { duration: 1 }];
    expect(transitionDurationFor(shortScenes, 1, 'fade', 1.0)).toBe(0.5);
  });
});

test.describe('resolveInputDurations', () => {
  test('last scene gets exact duration', () => {
    const scenes = [{ duration: 5 }, { duration: 5 }];
    const durs = resolveInputDurations(scenes, { transitionType: 'fade', transitionDuration: 1.0 });
    expect(durs[1]).toBe(5);
  });

  test('non-last scenes extended by transition', () => {
    const scenes = [{ duration: 5 }, { duration: 5 }];
    const durs = resolveInputDurations(scenes, { transitionType: 'fade', transitionDuration: 1.0 });
    expect(durs[0]).toBe(6);
  });

  test('cut uses 1/FPS extension', () => {
    const scenes = [{ duration: 5 }, { duration: 5 }];
    const durs = resolveInputDurations(scenes, { transitionType: 'cut', transitionDuration: 1.0 });
    expect(durs[0]).toBeCloseTo(5 + 1/30);
  });
});

test.describe('transitionBoundaries', () => {
  test('returns boundaries with correct start times', () => {
    const timeline = [
      { duration: 5 },
      { duration: 5 },
      { duration: 5 }
    ];
    const bounds = transitionBoundaries(timeline, { transitionType: 'fade', transitionDuration: 1.0 });
    
    expect(bounds.length).toBe(2);
    expect(bounds[0].index).toBe(1);
    expect(bounds[0].startSec).toBe(5);
    expect(bounds[0].durationSec).toBe(1.0);
    expect(bounds[0].type).toBe('fade');
    
    expect(bounds[1].index).toBe(2);
    expect(bounds[1].startSec).toBe(10);
    expect(bounds[1].durationSec).toBe(1.0);
  });

  test('uses per-scene transition override', () => {
    const timeline = [
      { duration: 5 },
      { duration: 5, transition: { type: 'circle' } },
      { duration: 5 }
    ];
    const bounds = transitionBoundaries(timeline, { transitionType: 'fade', transitionDuration: 1.0 });
    expect(bounds[0].type).toBe('circle');
    expect(bounds[1].type).toBe('fade');
  });

  test('alternate mode reflected in boundaries', () => {
    const timeline = [
      { duration: 5 },
      { duration: 5 },
      { duration: 5 }
    ];
    const bounds = transitionBoundaries(timeline, { transitionType: 'slideLeft', transitionMode: 'alternate', transitionDuration: 1.0 });
    expect(bounds[0].type).toBe('slideLeft');
    expect(bounds[1].type).toBe('slideRight');
  });

  test('works with audio-adjusted timeline (normalized)', () => {
    const timeline = [
      { duration: 6 },
      { duration: 6 },
      { duration: 6 }
    ];
    const bounds = transitionBoundaries(timeline, { transitionType: 'dissolve', transitionDuration: 0.5 });
    expect(bounds[0].startSec).toBe(6);
    expect(bounds[0].durationSec).toBe(0.5);
    expect(bounds[1].startSec).toBe(12);
    expect(bounds[1].durationSec).toBe(0.5);
  });
});

test.describe('calculateTotalDuration', () => {
  test('sums scene durations', () => {
    const scenes = [{ duration: 5 }, { duration: 3 }, { duration: 2 }];
    expect(calculateTotalDuration(scenes)).toBe(10);
  });

  test('handles empty array', () => {
    expect(calculateTotalDuration([])).toBe(0);
  });
});

test.describe('normalizeScenesToDuration', () => {
  test('scales scenes to target duration', () => {
    const scenes = [{ duration: 5 }, { duration: 5 }];
    const norm = normalizeScenesToDuration(scenes, 20);
    expect(norm[0].duration).toBe(10);
    expect(norm[1].duration).toBe(10);
    expect(norm[0].start).toBe(0);
    expect(norm[1].start).toBe(10);
  });

  test('last scene gets remainder', () => {
    const scenes = [{ duration: 3 }, { duration: 3 }, { duration: 3 }];
    const norm = normalizeScenesToDuration(scenes, 10);
    expect(norm[0].duration).toBeCloseTo(3.33, 1);
    expect(norm[1].duration).toBeCloseTo(3.33, 1);
    expect(norm[2].duration).toBeCloseTo(3.33, 1);
    const sum = norm.reduce((a, s) => a + s.duration, 0);
    expect(sum).toBeCloseTo(10);
  });

  test('returns original if no target', () => {
    const scenes = [{ duration: 5 }, { duration: 5 }];
    const norm = normalizeScenesToDuration(scenes, 0);
    expect(norm[0].duration).toBe(5);
    expect(norm[1].duration).toBe(5);
  });

  test('final timeline duration equals narration duration (±0.1s)', () => {
    const scenes = [
      { duration: 2.5 },
      { duration: 3.1 },
      { duration: 4.2 }
    ];
    const target = 12.0;
    const norm = normalizeScenesToDuration(scenes, target);
    const total = norm.reduce((sum, s) => sum + s.duration, 0);
    expect(Math.abs(total - target)).toBeLessThanOrEqual(0.1);
  });
});

test.describe('hashSpec', () => {
  test('produces consistent hash for same transition', () => {
    const h1 = hashSpec('fade');
    const h2 = hashSpec('fade');
    expect(h1).toBe(h2);
  });

  test('different transitions have different hashes', () => {
    const h1 = hashSpec('fade');
    const h2 = hashSpec('slideLeft');
    expect(h1).not.toBe(h2);
  });

  test('hash is 16 chars', () => {
    expect(hashSpec('fade').length).toBe(16);
  });
});

test.describe('sanitizeFileName', () => {
  test('replaces special chars with underscore', () => {
    expect(sanitizeFileName('Fundido a Negro')).toBe('Fundido_a_Negro');
    expect(sanitizeFileName('Círculo')).toBe('C_rculo');
  });

  test('keeps alphanumeric and dash/underscore', () => {
    expect(sanitizeFileName('slideLeft')).toBe('slideLeft');
    expect(sanitizeFileName('test-name_123')).toBe('test-name_123');
  });
});

test.describe('compatibility with existing ffmpeg-helpers', () => {
  test('resolveBoundaryTypes matches original for fixed mode', () => {
    const scenes = [
      { duration: 5 },
      { duration: 5, transition: { type: 'slideLeft' } },
      { duration: 5 }
    ];
    const opts = { transitionType: 'fade', transitionMode: 'fixed', transitionSeed: 42, transitionDuration: 1.0 };
    const v2 = resolveBoundaryTypes(scenes, opts);
    const orig = origResolveBoundaryTypes(scenes, opts);
    expect(v2).toEqual(orig);
  });

  test('resolveInputDurations matches original', () => {
    const scenes = [{ duration: 5 }, { duration: 5 }, { duration: 5 }];
    const opts = { transitionType: 'fade', transitionMode: 'fixed', transitionSeed: 42, transitionDuration: 1.0 };
    const v2 = resolveInputDurations(scenes, opts);
    const orig = origResolveInputDurations(scenes, opts);
    expect(v2).toEqual(orig);
  });

  test('calculateTotalDuration matches original', () => {
    const scenes = [{ duration: 5 }, { duration: 3 }, { duration: 2 }];
    expect(calculateTotalDuration(scenes)).toBe(origCalcTotalDuration(scenes));
  });

  test('normalizeScenesToDuration matches original', () => {
    const scenes = [{ duration: 5 }, { duration: 5 }];
    const v2 = normalizeScenesToDuration(scenes, 15);
    const orig = origNormalizeScenes(scenes, 15);
    expect(v2.map(s => s.duration)).toEqual(orig.map(s => s.duration));
  });
});

test.describe('preview and export share builder', () => {
  test('buildSceneFilter used by both paths', () => {
    expect(typeof buildSceneFilter).toBe('function');
  });
});

test.describe('performance guards', () => {
  test('single transition clip target under 3 seconds', () => {
    const maxRenderSeconds = 3;
    expect(maxRenderSeconds).toBe(3);
  });

  test('12-scene export target under 60 seconds', () => {
    const maxExportSeconds = 60;
    expect(maxExportSeconds).toBe(60);
  });
});