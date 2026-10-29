const { test, expect } = require('@playwright/test');
const { planTimeline } = require('../../app/core/plan-timeline.js');

const makeProject = (overrides = {}) => ({
  scenes: [
    { number: 1, start: 0, end: 6, text: '', zoom: {} },
    { number: 2, start: 6, end: 16, text: '', zoom: {} },
    { number: 3, start: 16, end: 21, text: '', zoom: {} },
    { number: 4, start: 21, end: 28, text: '', zoom: {} },
    { number: 5, start: 28, end: 34, text: '', zoom: {} }
  ],
  images: [
    { name: '1.jpg', path: '/tmp/1.jpg' },
    { name: '2.jpg', path: '/tmp/2.jpg' },
    { name: '3.jpg', path: '/tmp/3.jpg' },
    { name: '4.jpg', path: '/tmp/4.jpg' },
    { name: '5.jpg', path: '/tmp/5.jpg' }
  ],
  config: { output: { id: '16:9' } },
  renderOptions: { zoomType: 'kenburns', zoomMode: 'fixed', zoomSpeed: 1.0, transitionType: 'fade', transitionDuration: 1.0 },
  timelineOptions: { adjustToAudio: false },
  ...overrides
});

const makeAudioInfo = (duration) => ({ duration });

test.describe('planTimeline', () => {
  test('scene durations come from audio-adjusted timeline', () => {
    const project = makeProject({
      timelineOptions: { adjustToAudio: true },
      scenes: [
        { number: 1, start: 0, end: 5, text: '', zoom: {} },
        { number: 2, start: 5, end: 15, text: '', zoom: {} }
      ]
    });
    const audio = makeAudioInfo(20);
    const plan = planTimeline(project, audio);
    expect(plan.scenes[0].durationSec).toBeCloseTo(6.67, 1);
    expect(plan.scenes[1].durationSec).toBeCloseTo(13.33, 1);
  });

  test('boundaries use transitionDurationFor with min(transDur, prev/2, curr/2)', () => {
    const project = makeProject();
    const audio = makeAudioInfo(34);
    const plan = planTimeline(project, audio);
    expect(plan.boundaries.length).toBe(4);
    for (const b of plan.boundaries) {
      expect(b.durationSec).toBeLessThanOrEqual(1.0);
      const prevScene = plan.scenes[b.index - 1];
      const currScene = plan.scenes[b.index];
      expect(b.durationSec).toBeLessThanOrEqual(prevScene.durationSec / 2);
      expect(b.durationSec).toBeLessThanOrEqual(currScene.durationSec / 2);
    }
  });

  test('slot invariance: transition slideSpeed does not change scene duration', () => {
    const project1 = makeProject({ renderOptions: { ...makeProject().renderOptions, slideSpeed: 1.0 } });
    const project2 = makeProject({ renderOptions: { ...makeProject().renderOptions, slideSpeed: 2.0 } });
    const audio = makeAudioInfo(34);
    const plan1 = planTimeline(project1, audio);
    const plan2 = planTimeline(project2, audio);
    for (let i = 0; i < plan1.scenes.length; i++) {
      expect(plan1.scenes[i].durationSec).toBe(plan2.scenes[i].durationSec);
    }
    expect(plan1.totalSec).toBe(plan2.totalSec);
  });

  test('slot invariance: zoom speed does not change scene duration', () => {
    const project1 = makeProject({ renderOptions: { ...makeProject().renderOptions, zoomSpeed: 1.0 } });
    const project2 = makeProject({ renderOptions: { ...makeProject().renderOptions, zoomSpeed: 3.0 } });
    const audio = makeAudioInfo(34);
    const plan1 = planTimeline(project1, audio);
    const plan2 = planTimeline(project2, audio);
    for (let i = 0; i < plan1.scenes.length; i++) {
      expect(plan1.scenes[i].durationSec).toBe(plan2.scenes[i].durationSec);
    }
  });

  test('zoom in/out centered by default (cx=cy=0.5)', () => {
    const project = makeProject({
      scenes: [
        { number: 1, start: 0, end: 10, text: '', zoom: {} }
      ],
      renderOptions: { ...makeProject().renderOptions, zoomType: 'zoomIn' }
    });
    const audio = makeAudioInfo(10);
    const plan = planTimeline(project, audio);
    expect(plan.scenes[0].motion.start.cx).toBe(0.5);
    expect(plan.scenes[0].motion.start.cy).toBe(0.5);
    expect(plan.scenes[0].motion.end.cx).toBe(0.5);
    expect(plan.scenes[0].motion.end.cy).toBe(0.5);
  });

  test('per-format focus applies only when user set it or picked Personalizado', () => {
    const project = makeProject({
      scenes: [{ number: 1, start: 0, end: 6, text: '', zoom: { start: { cx: 0.2, cy: 0.8, scale: 1 } } }],
      renderOptions: { ...makeProject().renderOptions, zoomType: 'kenburns' }
    });
    const audio = makeAudioInfo(6);
    const plan = planTimeline(project, audio);
    expect(plan.scenes[0].motion.start.cx).toBe(0.2);
    expect(plan.scenes[0].motion.start.cy).toBe(0.8);
  });

  test('global custom focus (zoomStart) applies when no per-scene override', () => {
    const project = makeProject({
      scenes: [{ number: 1, start: 0, end: 6, text: '', zoom: {} }],
      renderOptions: { ...makeProject().renderOptions, zoomType: 'kenburns', zoomStart: { cx: 0.3, cy: 0.7, scale: 1 } }
    });
    const audio = makeAudioInfo(6);
    const plan = planTimeline(project, audio);
    expect(plan.scenes[0].motion.start.cx).toBe(0.3);
    expect(plan.scenes[0].motion.start.cy).toBe(0.7);
  });

  test('throws on missing duration', () => {
    const project = makeProject({ scenes: [{ number: 1, start: 0, end: 0, text: '', zoom: {} }] });
    const audio = makeAudioInfo(6);
    expect(() => planTimeline(project, audio)).toThrow(/duration.*must be between/);
  });

  test('throws on zero duration', () => {
    const project = makeProject({ scenes: [{ number: 1, start: 0, end: 0, text: '', zoom: {} }] });
    const audio = makeAudioInfo(6);
    expect(() => planTimeline(project, audio)).toThrow(/duration .* must be between/);
  });

  test('throws on implausible duration < 0.5s', () => {
    const project = makeProject({ scenes: [{ number: 1, start: 0, end: 0.3, text: '', zoom: {} }] });
    const audio = makeAudioInfo(6);
    expect(() => planTimeline(project, audio)).toThrow(/duration .* must be between/);
  });

  test('throws on implausible duration > 120s', () => {
    const project = makeProject({ scenes: [{ number: 1, start: 0, end: 150, text: '', zoom: {} }] });
    const audio = makeAudioInfo(150);
    expect(() => planTimeline(project, audio)).toThrow(/duration .* must be between/);
  });

  test('throws on unknown effect id', () => {
    const project = makeProject({
      scenes: [{ number: 1, start: 0, end: 6, text: '', zoom: { type: 'invalidEffect' } }]
    });
    const audio = makeAudioInfo(6);
    expect(() => planTimeline(project, audio)).toThrow(/Unknown effect id/);
  });

  test('throws on identical start/end for non-none effect', () => {
    const project = makeProject({
      scenes: [{ number: 1, start: 0, end: 6, text: '', zoom: { start: { cx: 0.5, cy: 0.5, scale: 1 }, end: { cx: 0.5, cy: 0.5, scale: 1 } } }]
    });
    const audio = makeAudioInfo(6);
    expect(() => planTimeline(project, audio)).toThrow(/zero amplitude/);
  });

  test('no silent fallback: identical start/end for none is OK', () => {
    const project = makeProject({
      scenes: [{ number: 1, start: 0, end: 6, text: '', zoom: { type: 'none' } }]
    });
    const audio = makeAudioInfo(6);
    const plan = planTimeline(project, audio);
    expect(plan.scenes[0].motion.start.scale).toBe(1);
    expect(plan.scenes[0].motion.end.scale).toBe(1);
  });

  test('per-scene zoom override (type, intensity)', () => {
    const project = makeProject({
      scenes: [
        { number: 1, start: 0, end: 6, text: '', zoom: { type: 'zoomIn', intensity: 0.3 } },
        { number: 2, start: 6, end: 16, text: '', zoom: { type: 'panLeft' } }
      ]
    });
    const audio = makeAudioInfo(16);
    const plan = planTimeline(project, audio);
    expect(plan.scenes[0].motion.end.scale).toBeCloseTo(1.3, 1);
    expect(plan.scenes[1].motion.start.cx).toBe(1.0);
    expect(plan.scenes[1].motion.end.cx).toBe(0.0);
  });

  test('random mode: seeded choice, deterministic', () => {
    const project = makeProject({
      renderOptions: { ...makeProject().renderOptions, zoomMode: 'random', zoomSeed: 42 }
    });
    const audio = makeAudioInfo(34);
    const plan1 = planTimeline(project, audio);
    const plan2 = planTimeline(project, audio);
    const effects1 = plan1.scenes.map(s => s.motion.start.scale);
    const effects2 = plan2.scenes.map(s => s.motion.start.scale);
    expect(effects1).toEqual(effects2);
  });

  test('alternate mode: flips opposites', () => {
    const project = makeProject({
      renderOptions: { ...makeProject().renderOptions, zoomMode: 'alternate', zoomType: 'zoomIn' }
    });
    const audio = makeAudioInfo(34);
    const plan = planTimeline(project, audio);
    expect(plan.scenes[0].motion.start.scale).toBe(1.0);
    expect(plan.scenes[1].motion.end.scale).toBe(1.0);
  });

  test('checked mode: empty checklist throws "marca al menos un efecto"', () => {
    const project = makeProject({
      renderOptions: { ...makeProject().renderOptions, zoomMode: 'checked', zoomCheckedEffects: [] }
    });
    const audio = makeAudioInfo(34);
    expect(() => planTimeline(project, audio)).toThrow(/marca al menos un efecto/);
  });

  test('checked mode: one effect always returns that effect', () => {
    const project = makeProject({
      renderOptions: { ...makeProject().renderOptions, zoomMode: 'checked', zoomCheckedEffects: ['zoomIn'] }
    });
    const audio = makeAudioInfo(34);
    const plan = planTimeline(project, audio);
    for (const s of plan.scenes) {
      expect(s.motion.start.scale).toBe(1.0);
      expect(s.motion.end.scale).toBe(1.15);
    }
  });

  test('checked mode: two or more effects, seeded choice only from checked, never same twice in a row', () => {
    const project = makeProject({
      renderOptions: { ...makeProject().renderOptions, zoomMode: 'checked', zoomCheckedEffects: ['zoomIn', 'panLeft', 'zoomOut'], zoomSeed: 123 }
    });
    const audio = makeAudioInfo(34);
    const plan = planTimeline(project, audio);
    const effects = plan.scenes.map(s => {
      if (s.motion.start.cx === 1.0) return 'panLeft';
      if (s.motion.end.scale === 1.0) return 'zoomOut';
      return 'zoomIn';
    });
    for (let i = 1; i < effects.length; i++) {
      expect(effects[i]).not.toBe(effects[i - 1]);
    }
  });
});

test.describe('planTimeline output for test project', () => {
  test('prints JSON for 5 scenes: 6,10,5,7,6s with zoomIn,zoomOut,panLeft,pulse,panUp and four transitions', () => {
    const project = {
      scenes: [
        { number: 1, start: 0, end: 6, text: '', zoom: { type: 'zoomIn' } },
        { number: 2, start: 6, end: 16, text: '', zoom: { type: 'zoomOut' } },
        { number: 3, start: 16, end: 21, text: '', zoom: { type: 'panLeft' } },
        { number: 4, start: 21, end: 28, text: '', zoom: { type: 'pulse' } },
        { number: 5, start: 28, end: 34, text: '', zoom: { type: 'panUp' } }
      ],
      images: [
        { name: '1.jpg', path: '/tmp/1.jpg' },
        { name: '2.jpg', path: '/tmp/2.jpg' },
        { name: '3.jpg', path: '/tmp/3.jpg' },
        { name: '4.jpg', path: '/tmp/4.jpg' },
        { name: '5.jpg', path: '/tmp/5.jpg' }
      ],
      config: { output: { id: '16:9' } },
      renderOptions: {
        zoomType: 'kenburns',
        zoomMode: 'fixed',
        zoomSpeed: 1.0,
        transitionType: 'fade',
        transitionMode: 'fixed',
        transitionDuration: 1.0,
        slideSpeed: 1.05
      },
      timelineOptions: { adjustToAudio: false }
    };
    const audio = { duration: 34 };
    const plan = planTimeline(project, audio);
    console.log(JSON.stringify(plan, null, 2));
    expect(plan.scenes.length).toBe(5);
    expect(plan.totalSec).toBe(34);
    expect(plan.boundaries.length).toBe(4);
  });
});