const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { buildFfmpegArgs } = require('../../app/core/ffmpeg-renderer.js');

const ffmpeg = require('ffmpeg-static').path || 'node_modules\\ffmpeg-static\\ffmpeg.exe';
const ffprobe = require('ffprobe-static').path;
const imgDir = 'C:\\Users\\zyrothx\\Documents\\imagenes prueba';
const images = [
  { name: 'a.jpg', path: path.join(imgDir, 'escena1.jpg'), focus169: { x: 0.5, y: 0.5, scale: 1 } },
  { name: 'b.jpg', path: path.join(imgDir, 'escena2.jpg'), focus169: { x: 0.5, y: 0.5, scale: 1 } },
  { name: 'c.jpg', path: path.join(imgDir, 'escena1.jpg'), focus169: { x: 0.5, y: 0.5, scale: 1 } }
];
const narration = path.join(os.tmpdir(), 't4-nar.wav');
execSync(`"${ffmpeg}" -y -f lavfi -i anullsrc=r=48000:cl=stereo -t 19 -c:a pcm_s16le "${narration}"`, { stdio: 'pipe' });

const tinyConfig = { id: 't', w: 160, h: 90 };

function renderApp(scenes, renderOptions) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 't4-'));
  const out = path.join(workDir, 'out.mp4');
  const options = {
    scenes,
    images,
    narration: { name: 'n.wav', path: narration },
    outputPath: out,
    outputConfig: tinyConfig,
    config: {},
    renderOptions: {
      zoomEnabled: false, zoomType: 'kenburns', zoomMode: 'fixed', zoomCheckedEffects: [],
      zoomSeed: 12345, zoomStartScale: 1.0, zoomIntensity: 0.15, zoomSpeed: 1.0, zoomDurationSec: 6.0,
      ...renderOptions
    }
  };
  const { args } = buildFfmpegArgs(options);
  const res = spawnSync(ffmpeg, args, { stdio: 'pipe', maxBuffer: 200 * 1024 * 1024, timeout: 300000 });
  if (res.status !== 0) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw new Error(`ffmpeg failed: ${res.stderr.toString().slice(-500)}`);
  }
  return { out, workDir };
}

function probePts(videoPath) {
  const out = execSync(`"${ffprobe}" -v error -select_streams v:0 -show_entries frame=pkt_pts_time -of csv=p=0 "${videoPath}"`, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  return out.match(/-?\d+(?:\.\d+)?/g).map(Number);
}

function repeatedFramesAndMonotone(pts) {
  let repeated = 0;
  let maxDeviation = 0;
  const expected = 1 / 30;
  let prev = null;
  for (const p of pts) {
    if (prev !== null) {
      const diff = p - prev;
      if (Math.abs(diff) < 0.001) repeated++;
      const dev = Math.abs(diff - expected);
      if (dev > maxDeviation) maxDeviation = dev;
    }
    prev = p;
  }
  return { repeated, maxDeviation };
}

test.describe('transitions encoded export (real app path)', () => {
  test('fade transition: CFR 30fps, no repeated frames, monotone pts', () => {
    const scenes = [
      { number: 1, duration: 4, text: 'A' },
      { number: 2, duration: 4, text: 'B', transition: { type: 'fade' } },
      { number: 3, duration: 4, text: 'C' }
    ];
    const { out, workDir } = renderApp(scenes, { transitionType: 'fade', transitionMode: 'fixed', transitionDuration: 1.0 });
    const pts = probePts(out);
    expect(pts.length).toBeGreaterThan(100);
    const { repeated, maxDeviation } = repeatedFramesAndMonotone(pts);
    expect(repeated).toBe(0);
    expect(maxDeviation).toBeLessThan(0.01);
    // pts strictly increasing (monotone)
    for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeGreaterThanOrEqual(pts[i - 1]);
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  test('slideLeft transition: CFR 30fps, no repeated frames, monotone pts', () => {
    const scenes = [
      { number: 1, duration: 4, text: 'A' },
      { number: 2, duration: 4, text: 'B', transition: { type: 'slideLeft' } },
      { number: 3, duration: 4, text: 'C' }
    ];
    const { out, workDir } = renderApp(scenes, { transitionType: 'slideLeft', transitionMode: 'fixed', transitionDuration: 1.0 });
    const pts = probePts(out);
    expect(pts.length).toBeGreaterThan(100);
    const { repeated, maxDeviation } = repeatedFramesAndMonotone(pts);
    expect(repeated).toBe(0);
    expect(maxDeviation).toBeLessThan(0.01);
    for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeGreaterThanOrEqual(pts[i - 1]);
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  test('random transition mode is reproducible with a seed', () => {
    const scenes = [
      { number: 1, duration: 4, text: 'S1' },
      { number: 2, duration: 4, text: 'S2' },
      { number: 3, duration: 4, text: 'S3' }
    ];
    const render = (seed) => {
      const { out, workDir } = renderApp(scenes, { transitionType: 'fade', transitionMode: 'random', transitionSeed: seed, transitionDuration: 1.0 });
      const pts = probePts(out);
      fs.rmSync(workDir, { recursive: true, force: true });
      return pts;
    };
    const a = render(4242);
    const b = render(4242);
    expect(a).toEqual(b);
  });

  test('total duration equals sum of scene durations', () => {
    const scenes = [
      { number: 1, duration: 4, text: 'A' },
      { number: 2, duration: 4, text: 'B', transition: { type: 'fade' } }
    ];
    const { out } = renderApp(scenes, { transitionType: 'fade', transitionMode: 'fixed', transitionDuration: 1.0 });
    const dur = parseFloat(execSync(`"${ffprobe}" -v error -show_entries format=duration -of csv=p=0 "${out}"`, { encoding: 'utf8' }));
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
    expect(dur).toBeCloseTo(8, 1);
  });
});
