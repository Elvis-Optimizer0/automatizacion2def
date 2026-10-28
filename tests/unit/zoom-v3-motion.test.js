const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const {
  buildMotionSpecFromOptions,
  resolveZoomType,
  ZOOM_TYPES,
  DEFAULT_ZOOM_SEED
} = require('../../app/core/ffmpeg-helpers.js');
const { buildZoomFilterFromSpec, validateMotionSpec } = require('../../app/core/zoom-v3.js');
const { buildFfmpegArgs } = require('../../app/core/ffmpeg-renderer.js');

const ffmpeg = require('ffmpeg-static').path || 'node_modules\\ffmpeg-static\\ffmpeg.exe';
const img = 'C:\\Users\\zyrothx\\Documents\\imagenes prueba\\escena1.jpg';

const focus = { x: 0.5, y: 0.5, scale: 1 };
const scene = { number: 1, duration: 6 };

const baseOptions = {
  zoomEnabled: true, zoomType: 'kenburns', zoomMode: 'fixed', zoomCheckedEffects: [],
  zoomSeed: DEFAULT_ZOOM_SEED, zoomStartScale: 1.0, zoomIntensity: 0.15, zoomSpeed: 1.0, zoomDurationSec: 6.0,
  transitionType: 'fade', transitionMode: 'fixed', transitionSeed: 4242, transitionDuration: 1.0, slideSpeed: 1.05
};

test.describe('zoom-v3 motion spec per catalog id', () => {
  const expected = {
    none: { type: 'static', startScale: 1.0, endScale: 1.0, startCx: 0.5, endCx: 0.5 },
    zoomIn: { type: 'linear', startScale: 1.0, endScale: 1.15, startCx: 0.5, endCx: 0.5 },
    zoomOut: { type: 'linear', startScale: 1.15, endScale: 1.0, startCx: 0.5, endCx: 0.5 },
    panLeft: { type: 'linear', startScale: 1.15, endScale: 1.15, startCx: 1.0, endCx: 0.0 },
    panRight: { type: 'linear', startScale: 1.15, endScale: 1.15, startCx: 0.0, endCx: 1.0 },
    panUp: { type: 'linear', startScale: 1.15, endScale: 1.15, startCx: 0.5, endCx: 0.5, startCy: 1.0, endCy: 0.0 },
    panDown: { type: 'linear', startScale: 1.15, endScale: 1.15, startCx: 0.5, endCx: 0.5, startCy: 0.0, endCy: 1.0 },
    pulse: { type: 'oscillate', startScale: 1.0, endScale: 1.15, startCx: 0.5, endCx: 0.5, endScaleIgnored: true },
    kenburns: { type: 'linear', startScale: 1.0, endScale: 1.15, startCx: 0.5, endCx: 0.5 }
  };

  for (const id of ZOOM_TYPES) {
    test(`builds the expected keyframe spec for ${id}`, () => {
      const spec = buildMotionSpecFromOptions(scene, 1920, 1080, { ...baseOptions, zoomType: id }, focus);
      const exp = expected[id];
      expect(spec.type).toBe(exp.type);
      expect(spec.durationSec).toBe(6);
      expect(spec.start.scale).toBe(exp.startScale);
      if (!exp.endScaleIgnored) {
        expect(spec.end.scale).toBe(exp.endScale);
      }
      expect(spec.start.cx).toBe(exp.startCx);
      expect(spec.end.cx).toBe(exp.endCx);
      if (exp.startCy !== undefined) {
        expect(spec.start.cy).toBe(exp.startCy);
        expect(spec.end.cy).toBe(exp.endCy);
      }
    });
  }

  test('buildZoomFilterFromSpec is empty for none/static and non-empty for motion effects', () => {
    const noneSpec = buildMotionSpecFromOptions(scene, 1920, 1080, { ...baseOptions, zoomType: 'none' }, focus);
    expect(buildZoomFilterFromSpec(scene, 1920, 1080, noneSpec, focus)).toBe('');
    for (const id of ['zoomIn', 'zoomOut', 'panLeft', 'kenburns', 'pulse']) {
      const spec = buildMotionSpecFromOptions(scene, 1920, 1080, { ...baseOptions, zoomType: id }, focus);
      const filter = buildZoomFilterFromSpec(scene, 1920, 1080, spec, focus);
      expect(typeof filter).toBe('string');
      expect(filter.length).toBeGreaterThan(0);
      expect(filter).toContain('zoompan');
    }
  });

  test('validateMotionSpec throws on zero-amplitude non-static spec', () => {
    const spec = { type: 'linear', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.0 }, easing: 'smooth', speed: 1.0, durationSec: 6 };
    expect(() => validateMotionSpec(spec)).toThrow(/zero amplitude/);
  });

  test('validateMotionSpec throws on unknown motion type', () => {
    const spec = { type: 'weird', start: { cx: 0.5, cy: 0.5, scale: 1.0 }, end: { cx: 0.5, cy: 0.5, scale: 1.0 }, easing: 'smooth', speed: 1.0, durationSec: 6 };
    expect(() => validateMotionSpec(spec)).toThrow(/Unknown motion type/);
  });
});

test.describe('zoom-v3 checked mode uses only the checklist', () => {
  test('checked mode with one id always returns that id', () => {
    for (let i = 0; i < 30; i++) {
      expect(resolveZoomType('kenburns', 'checked', i, 12345, ['zoomIn'])).toBe('zoomIn');
    }
  });

  test('checked mode never returns ids outside the checklist across many scenes', () => {
    const checklist = ['zoomIn', 'panLeft'];
    const chosen = new Set();
    for (let i = 0; i < 60; i++) {
      chosen.add(resolveZoomType('kenburns', 'checked', i, 12345, checklist));
    }
    for (const id of chosen) {
      expect(checklist).toContain(id);
    }
  });
});

test.describe('zoom-v3 encoded export motion (real path, tiny resolution)', () => {
  const tinyConfig = { id: 'test', w: 160, h: 90 };

  function renderAndMeasure(zoomType) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-test-'));
    const out = path.join(workDir, 'out.mp4');
    const options = {
      scenes: [{ number: 1, duration: 2, text: 'z', zoom: { type: zoomType } }],
      images: [{ name: 'a.jpg', path: img, focus169: { x: 0.5, y: 0.5, scale: 1 } }],
      narration: { name: 'n.wav', path: 'C:\\Users\\zyrothx\\Desktop\\projectwo\\muestra-piper.wav' },
      outputPath: out,
      outputConfig: tinyConfig,
      config: {},
      renderOptions: { ...baseOptions, zoomType, zoomDurationSec: 2.0 }
    };
    const { args } = buildFfmpegArgs(options);
    const res = spawnSync(ffmpeg, args, { stdio: 'pipe', maxBuffer: 100 * 1024 * 1024, timeout: 60000 });
    if (res.status !== 0) {
      fs.rmSync(workDir, { recursive: true, force: true });
      throw new Error(`ffmpeg failed for ${zoomType}: ${res.stderr.toString().slice(-500)}`);
    }
    const f1 = path.join(workDir, 'f1.png');
    const fl = path.join(workDir, 'fl.png');
    execSync(`"${ffmpeg}" -y -ss 0 -i "${out}" -frames:v 1 -update 1 "${f1}"`, { stdio: 'pipe' });
    execSync(`"${ffmpeg}" -y -ss 1.9 -i "${out}" -frames:v 1 -update 1 "${fl}"`, { stdio: 'pipe' });
    const o = execSync(`"${ffmpeg}" -y -i "${f1}" -i "${fl}" -lavfi ssim -f null - 2>&1`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    const m = o.match(/All:([0-9.]+)/);
    const ssim = m ? parseFloat(m[1]) : null;
    fs.rmSync(workDir, { recursive: true, force: true });
    return ssim;
  }

  test('acercar (zoomIn) shows motion on the encoded export', () => {
    const ssim = renderAndMeasure('zoomIn');
    expect(ssim).not.toBeNull();
    expect(ssim).toBeLessThan(0.99);
  });

  test('alejar (zoomOut) shows motion on the encoded export', () => {
    const ssim = renderAndMeasure('zoomOut');
    expect(ssim).not.toBeNull();
    expect(ssim).toBeLessThan(0.99);
  });

  test('none is static on the encoded export', () => {
    const ssim = renderAndMeasure('none');
    expect(ssim).not.toBeNull();
    expect(ssim).toBeGreaterThanOrEqual(0.999);
  });
});
