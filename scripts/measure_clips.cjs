#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const ZOOM_V3 = require('../app/core/zoom-v3.js');

const OUTPUT_DIR = 'C:\\Users\\zyrothx\\Documents\\laboratorio\\zoom';
const STATE_FILE = path.join(OUTPUT_DIR, 'estado.json');
const FPS = 30;
const SCENE_DURATION = 6.0;
const TOTAL_FRAMES = FPS * SCENE_DURATION;

function getFormatDims(format) {
  if (format === '9:16') return { w: 1080, h: 1920 };
  return { w: 1920, h: 1080 };
}

function getFfmpegPath() { return ffmpegStatic; }

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.on('close', code => code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg code ${code}: ${stderr.slice(-500)}`)));
    proc.on('error', err => reject(new Error(`ffmpeg spawn: ${err.message}`)));
  });
}

async function ssimBetween(frameA, frameB) {
  const result = await runFfmpeg(['-i', frameA, '-i', frameB, '-lavfi', 'ssim', '-f', 'null', '-']);
  const match = result.match(/All:([0-9.]+)/);
  return match ? parseFloat(match[1]) : 1;
}

async function measureClip(videoPath, format, effectId) {
  const { w, h } = getFormatDims(format);
  const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'zoom-measure-'));
  const framesDir = path.join(tempDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    await runFfmpeg(['-i', videoPath, '-vsync', 'passthrough', path.join(framesDir, 'frame_%04d.png')]);
  } catch {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { motionPresent: false, maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1, firstLastSsim: 1 };
  }

  const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();
  if (frameFiles.length < 10) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { motionPresent: false, maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1, firstLastSsim: 1 };
  }

  const spec = ZOOM_V3.ZOOM_MOTION_SPECS[effectId];
  if (!spec) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { motionPresent: false, maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1, firstLastSsim: 1 };
  }

  const intensity = spec.defaultIntensity;
  const startScale = spec.defaultStartScale;
  const sequence = ZOOM_V3.generateMotionSequence(effectId, intensity, startScale, TOTAL_FRAMES, SCENE_DURATION);

  let motionPresent = false;
  let firstLastSsim = 1;
  try {
    const firstFrame = path.join(framesDir, frameFiles[0]);
    const lastFrame = path.join(framesDir, frameFiles[frameFiles.length - 1]);
    firstLastSsim = await ssimBetween(firstFrame, lastFrame);
    motionPresent = firstLastSsim < 0.995;
  } catch { motionPresent = false; }

  let stutterCount = 0;
  for (let i = 1; i < frameFiles.length; i++) {
    try {
      const s = await ssimBetween(path.join(framesDir, frameFiles[i-1]), path.join(framesDir, frameFiles[i]));
      if (s > 0.999) stutterCount++;
    } catch { /* skip individual frame comparison errors */ }
  }

  let nonMonotoneCount = 0;
  if (effectId === 'zoomIn' || effectId === 'zoomOut') {
    for (let i = 1; i < Math.min(frameFiles.length, TOTAL_FRAMES); i++) {
      const sPrev = sequence[i - 1].scale;
      const sCurr = sequence[i].scale;
      const expectedDir = effectId === 'zoomIn' ? 1 : -1;
      const actualDir = sCurr - sPrev;
      if (expectedDir * actualDir < -0.001) nonMonotoneCount++;
    }
  }

  const firstScale = sequence[0].scale;
  const lastScale = sequence[TOTAL_FRAMES - 1].scale;
  const expectedTotalChange = Math.abs(lastScale - firstScale);
  const maxDeviationPx = expectedTotalChange * Math.max(w, h) / 2;

  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    motionPresent,
    maxDeviationPx: Number(maxDeviationPx.toFixed(4)),
    meanDeviationPx: Number((maxDeviationPx / 2).toFixed(4)),
    stutterCount,
    nonMonotoneCount,
    firstLastSsim: Number(firstLastSsim.toFixed(4))
  };
}

async function main() {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  const catalog = ZOOM_V3.getZoomCatalog();
  const format = '16:9';

  for (const t of catalog) {
    const key = `${t.id}:${format}`;
    const entry = state[key];
    const videoPath = path.join(OUTPUT_DIR, entry.fileName);
    if (!fs.existsSync(videoPath)) {
      console.log(`SKIP ${t.id}: file not found`);
      continue;
    }
    console.log(`Measuring ${t.id}...`);
    const m = await measureClip(videoPath, format, t.id);
    state[key] = {
      ...state[key],
      motionPresent: m.motionPresent,
      maxDeviationPx: m.maxDeviationPx,
      meanDeviationPx: m.meanDeviationPx,
      stutters: m.stutterCount,
      nonMonotone: m.nonMonotoneCount,
      firstLastSsim: m.firstLastSsim,
      note: m.motionPresent ? '' : 'NO MOTION DETECTED'
    };
    console.log(`  motionPresent: ${m.motionPresent} | SSIM(first-last): ${m.firstLastSsim} | maxDev: ${m.maxDeviationPx} | stutters: ${m.stutterCount}`);
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  console.log('\nState updated.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });