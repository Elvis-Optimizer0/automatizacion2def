const { test, expect } = require('@playwright/test');
const { checkC1, checkC2, checkC3, checkC4, computeExpectedSequence } = require('../../scripts/lib/render-checks.cjs');

function makeMotion(seq) {
  return seq.map((f, i) => ({ frame: i, ...f, sceneIdx: 0 }));
}

test.describe('render-checks C1-C4', () => {
  const plan = {
    scenes: [{ startSec: 0, durationSec: 2.0, effect: 'zoomIn', speed: 1.0, easing: 'smooth' }],
    boundaries: [],
    format: '16:9',
    audioDurationSec: 2.0
  };

  test('checkC1 passes for perfect motion', () => {
    const expected = computeExpectedSequence(plan, '16:9');
    const motion = makeMotion(expected);
    const result = checkC1(motion, plan);
    expect(result.pass).toBe(true);
    expect(result.details.every(d => d.pass !== false)).toBe(true);
  });

  test('checkC1 fails for early-end motion', () => {
    const expected = computeExpectedSequence(plan, '16:9');
    const early = expected.map((f, i) => i < 12 ? f : { ...f, scale: expected[11].scale, cx: 0.5, cy: 0.5 });
    const motion = makeMotion(early);
    const result = checkC1(motion, plan);
    expect(result.pass).toBe(false);
  });

  test('checkC1 fails for static clip', () => {
    const staticMotion = Array(60).fill(null).map((_, i) => ({
      frame: i, scale: 1.0, cx: 0.5, cy: 0.5, sceneIdx: 0
    }));
    const result = checkC1(staticMotion, plan);
    expect(result.pass).toBe(false);
  });

  test('checkC2 passes for centered zoom', () => {
    const expected = computeExpectedSequence(plan, '16:9');
    const motion = makeMotion(expected);
    const result = checkC2(motion, plan);
    expect(result.pass).toBe(true);
  });

  test('checkC2 fails for off-center zoom', () => {
    const expected = computeExpectedSequence(plan, '16:9');
    const offCenter = expected.map(f => ({ ...f, cx: 0.6, cy: 0.5 }));
    const motion = makeMotion(offCenter);
    const result = checkC2(motion, plan);
    expect(result.pass).toBe(false);
    expect(result.details.some(d => d.pass === false)).toBe(true);
  });

  test('checkC2 fails for static clip (no motion)', () => {
    const staticMotion = Array(60).fill(null).map((_, i) => ({
      frame: i, scale: 1.0, cx: 0.5, cy: 0.5, sceneIdx: 0
    }));
    const result = checkC2(staticMotion, plan);
    expect(result.pass).toBe(false);
    expect(result.details.some(d => d.check === 'noMotion')).toBe(true);
  });

  test('checkC3 passes for smooth motion', () => {
    const expected = computeExpectedSequence(plan, '16:9');
    const motion = makeMotion(expected);
    const result = checkC3(motion, plan);
    expect(result.pass).toBe(true);
  });

  test('checkC3 fails for jittery center', () => {
    const expected = computeExpectedSequence(plan, '16:9');
    const jittery = expected.map((f) => ({
      ...f,
      cx: f.cx + (Math.random() - 0.5) * 0.01,
      cy: f.cy + (Math.random() - 0.5) * 0.01
    }));
    const motion = makeMotion(jittery);
    const result = checkC3(motion, plan);
    expect(result.pass).toBe(false);
    expect(result.details.some(d => d.check === 'centerDispRms' && d.pass === false)).toBe(true);
  });

  test('checkC4 passes for panLeft with correct travel', () => {
    const panPlan = {
      scenes: [{ startSec: 0, durationSec: 2.0, effect: 'panLeft', speed: 1.0, easing: 'smooth' }],
      boundaries: [],
      format: '16:9',
      audioDurationSec: 2.0
    };
    const expected = computeExpectedSequence(panPlan, '16:9');
    const motion = makeMotion(expected);
    const result = checkC4(motion, panPlan);
    expect(result.pass).toBe(true);
  });

  test('checkC4 fails for insufficient pan travel', () => {
    const panPlan = {
      scenes: [{ startSec: 0, durationSec: 2.0, effect: 'panLeft', speed: 1.0, easing: 'smooth' }],
      boundaries: [],
      format: '16:9',
      audioDurationSec: 2.0
    };
    const expected = computeExpectedSequence(panPlan, '16:9');
    const shortTravel = expected.map(f => ({ ...f, cx: 1.0 - (1.0 - f.cx) * 0.05 }));
    const motion = makeMotion(shortTravel);
    const result = checkC4(motion, panPlan);
    expect(result.pass).toBe(false);
    expect(result.details.some(d => d.check === 'travel' && d.pass === false)).toBe(true);
  });
});