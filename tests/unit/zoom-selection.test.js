const { test, expect } = require('@playwright/test');
const {
  resolveZoomType,
  RANDOM_ZOOM_TYPES
} = require('../../app/core/ffmpeg-helpers.js');
const { parseProjectFile } = require('../../app/core/project-schema.js');

test.describe('zoom selection - checked mode uses ONLY the checklist', () => {
  const seed = 202401;

  test('every chosen effect belongs to the checklist (200 scenes)', () => {
    const checklist = ['zoomIn', 'zoomOut', 'panRight'];
    const chosen = [];
    for (let i = 0; i < 200; i++) {
      chosen.push(resolveZoomType('kenburns', 'checked', i, seed, checklist));
    }
    for (const id of chosen) {
      expect(checklist).toContain(id);
    }
  });

  test('no immediate repeat when two or more are checked (200 scenes)', () => {
    const checklist = ['zoomIn', 'panLeft'];
    let prev = null;
    let repeats = 0;
    for (let i = 0; i < 200; i++) {
      const pick = resolveZoomType('kenburns', 'checked', i, seed, checklist);
      if (prev !== null && pick === prev) repeats++;
      prev = pick;
    }
    expect(repeats).toBe(0);
  });

  test('seed is reproducible', () => {
    const checklist = ['zoomIn', 'zoomOut', 'panLeft', 'panRight'];
    const a = [];
    const b = [];
    for (let i = 0; i < 50; i++) {
      a.push(resolveZoomType('kenburns', 'checked', i, seed, checklist));
      b.push(resolveZoomType('kenburns', 'checked', i, seed, checklist));
    }
    expect(a).toEqual(b);
  });

  test('different seeds can differ (four-item checklist)', () => {
    const checklist = ['zoomIn', 'zoomOut', 'panLeft', 'panRight'];
    const a = [];
    const b = [];
    for (let i = 0; i < 30; i++) {
      a.push(resolveZoomType('kenburns', 'checked', i, 1, checklist));
      b.push(resolveZoomType('kenburns', 'checked', i, 2, checklist));
    }
    expect(a).not.toEqual(b);
  });

  test('single checked effect always returns that effect', () => {
    for (let i = 0; i < 50; i++) {
      expect(resolveZoomType('kenburns', 'checked', i, seed, ['panDown'])).toBe('panDown');
    }
  });

  test('empty checklist returns the base type, never the full catalog', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      seen.add(resolveZoomType('kenburns', 'checked', i, seed, []));
    }
    expect(seen.size).toBe(1);
    expect(seen.has('kenburns')).toBe(true);
    // Must not silently fall back to the full RANDOM_ZOOM_TYPES catalog
    expect(RANDOM_ZOOM_TYPES.length).toBeGreaterThan(1);
    expect(seen.size).toBeLessThan(RANDOM_ZOOM_TYPES.length);
  });

  test('checklist ids that are not catalog ids are filtered out', () => {
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      seen.add(resolveZoomType('kenburns', 'checked', i, seed, ['zoomIn', 'no-such-effect', 'panRight']));
    }
    for (const id of seen) {
      expect(['zoomIn', 'panRight']).toContain(id);
    }
  });

  test('random mode ignores the checklist (by design - todos)', () => {
    const checklist = ['zoomIn'];
    const seen = new Set();
    for (let i = 0; i < 40; i++) {
      seen.add(resolveZoomType('kenburns', 'random', i, seed, checklist));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

test.describe('project save/load round trip preserves zoomCheckedEffects', () => {
  test('zoomCheckedEffects round trips through save/load', () => {
    const raw = {
      version: 1,
      images: [],
      audio: { narration: null, music: null },
      script: { raw: '' },
      timeline: [{ number: 1, duration: 6 }],
      config: { outputs: ['16:9'] },
      renderOptions: { zoomMode: 'checked', zoomCheckedEffects: ['zoomIn', 'panLeft'], zoomSeed: 777 }
    };
    const project = parseProjectFile(raw);
    expect(project.renderOptions.zoomMode).toBe('checked');
    expect(project.renderOptions.zoomCheckedEffects).toEqual(['zoomIn', 'panLeft']);
    expect(project.renderOptions.zoomSeed).toBe(777);
  });
});
