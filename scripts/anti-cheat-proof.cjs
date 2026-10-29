#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const ffmpegStatic = require('ffmpeg-static');
const { generateGridSource, computeMotionSequence, renderGroundTruthClip } = require('./lib/motion-tracker.cjs');
const { runAllChecks, derivePlanFromLabClip, checkC1, checkC2, checkC3, checkC4, checkC5, checkC6, checkC7, checkC8 } = require('./lib/render-checks.cjs');
const { trackMotion } = require('./lib/motion-tracker.cjs');

const FPS = 30;
const OUT_W = 1920;
const OUT_H = 1080;

async function renderClipFromSequence(sequence, sourcePath, outPath, crf = 18) {
  await renderGroundTruthClip({ sequence, sourcePath, outPath, crf });
}

async function addJitter(inputPath, outputPath, jitterPx = 1) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jitter-'));
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegStatic, ['-y', '-i', inputPath, '-vf', 'format=gray', '-f', 'image2', path.join(tmpDir, 'frame_%05d.png')], { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg decode ${code}: ${stderr.slice(-500)}`)));
      proc.on('error', reject);
    });
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
    for (let i = 0; i < files.length; i++) {
      const framePath = path.join(tmpDir, files[i]);
      const buf = await sharp(framePath).raw().toBuffer({ resolveWithObject: true });
      let data = buf.data;
      const w = buf.info.width, h = buf.info.height;
      if (buf.info.channels === 3) { const gray = Buffer.alloc(w * h); for (let i = 0, j = 0; i < data.length; i += 3, j++) gray[j] = data[i]; data = gray; }
      const dx = (Math.random() - 0.5) * 2 * jitterPx;
      const dy = (Math.random() - 0.5) * 2 * jitterPx;
      const shifted = Buffer.alloc(w * h);
      for (let y = 0; y < h; y++) {
        const sy = y - dy;
        const y0 = Math.floor(sy), y1 = y0 + 1;
        const wy = sy - y0;
        for (let x = 0; x < w; x++) {
          const sx = x - dx;
          const x0 = Math.floor(sx), x1 = x0 + 1;
          const wx = sx - x0;
          let v = 0;
          if (y0 >= 0 && y0 < h && x0 >= 0 && x0 < w) v += data[y0 * w + x0] * (1 - wx) * (1 - wy);
          if (y0 >= 0 && y0 < h && x1 < w) v += data[y0 * w + x1] * wx * (1 - wy);
          if (y1 < h && x0 >= 0) v += data[y1 * w + x0] * (1 - wx) * wy;
          if (y1 < h && x1 < w) v += data[y1 * w + x1] * wx * wy;
          shifted[y * w + x] = Math.round(v);
        }
      }
      await sharp(shifted, { raw: { width: w, height: h, channels: 1 } }).png().toFile(framePath);
    }
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegStatic, ['-y', '-framerate', '30', '-i', path.join(tmpDir, 'frame_%05d.png'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', outputPath], { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg encode ${code}: ${stderr.slice(-500)}`)));
      proc.on('error', reject);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function shiftCenter(inputPath, outputPath, shiftX = 0.1, shiftY = 0.1) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'shift-'));
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegStatic, ['-y', '-i', inputPath, '-vf', 'format=gray', '-f', 'image2', path.join(tmpDir, 'frame_%05d.png')], { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg decode ${code}: ${stderr.slice(-500)}`)));
      proc.on('error', reject);
    });
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
    for (let i = 0; i < files.length; i++) {
      const framePath = path.join(tmpDir, files[i]);
      const buf = await sharp(framePath).raw().toBuffer({ resolveWithObject: true });
      let data = buf.data;
      const w = buf.info.width, h = buf.info.height;
      if (buf.info.channels === 3) { const gray = Buffer.alloc(w * h); for (let i = 0, j = 0; i < data.length; i += 3, j++) gray[j] = data[i]; data = gray; }
      const dx = shiftX * w;
      const dy = shiftY * h;
      const shifted = Buffer.alloc(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sx = x - dx;
          const sy = y - dy;
          const x0 = Math.floor(sx), x1 = x0 + 1;
          const y0 = Math.floor(sy), y1 = y0 + 1;
          const wx = sx - x0, wy = sy - y0;
          let v = 0;
          if (y0 >= 0 && y0 < h && x0 >= 0 && x0 < w) v += data[y0 * w + x0] * (1 - wx) * (1 - wy);
          if (y0 >= 0 && y0 < h && x1 < w) v += data[y0 * w + x1] * wx * (1 - wy);
          if (y1 < h && x0 >= 0) v += data[y1 * w + x0] * (1 - wx) * wy;
          if (y1 < h && x1 < w) v += data[y1 * w + x1] * wx * wy;
          shifted[y * w + x] = Math.round(v);
        }
      }
      await sharp(shifted, { raw: { width: w, height: h, channels: 1 } }).png().toFile(framePath);
    }
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegStatic, ['-y', '-framerate', '30', '-i', path.join(tmpDir, 'frame_%05d.png'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', outputPath], { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg encode ${code}: ${stderr.slice(-500)}`)));
      proc.on('error', reject);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runAntiCheat() {
  console.log('=== ANTI-CHEAT PROOF ===\n');
  const gridPath = path.join(require('os').tmpdir(), 'grid-source.png');
  const { markers } = await generateGridSource({ outPath: gridPath });
  console.log(`Grid source: ${gridPath} (${markers.length} markers)`);

  const baseSeq = computeMotionSequence(3.0, 'zoomIn', 1.0, 1.0, 1.15);
  const plan = {
    scenes: [{ startSec: 0, durationSec: 3.0, effect: 'zoomIn', speed: 1.0, easing: 'smooth' }],
    boundaries: [],
    format: '16:9',
    audioDurationSec: 3.0
  };

  const clips = {};

  // (i) Static clip
  console.log('\n(i) Generating static clip...');
  const staticSeq = baseSeq.map(f => ({ ...f, scale: 1, cx: 0.5, cy: 0.5 }));
  clips.static = path.join(require('os').tmpdir(), 'ac-static.mp4');
  await renderClipFromSequence(staticSeq, gridPath, clips.static);

  // (ii) Ground-truth clip
  console.log('(ii) Generating ground-truth clip...');
  clips.gt = path.join(require('os').tmpdir(), 'ac-gt.mp4');
  await renderClipFromSequence(baseSeq, gridPath, clips.gt);

  // (iii) Early-end clip (motion ends at 20% duration)
  console.log('(iii) Generating early-end clip (motion ends at 20%)...');
  const earlySeq = baseSeq.map((f, i) => {
    const holdStart = 3.0 * 0.2;
    if (f.t >= holdStart) return { ...f, scale: baseSeq[Math.round(holdStart * FPS)].scale, cx: 0.5, cy: 0.5 };
    return f;
  });
  clips.early = path.join(require('os').tmpdir(), 'ac-early.mp4');
  await renderClipFromSequence(earlySeq, gridPath, clips.early);

  // (iv) Jitter clip (1px random jitter)
  console.log('(iv) Generating jitter clip (1px)...');
  clips.jitter = path.join(require('os').tmpdir(), 'ac-jitter.mp4');
  await addJitter(clips.gt, clips.jitter, 1.0);

  // (v) Shifted center clip (10% shift)
  console.log('(v) Generating shifted-center clip (10%)...');
  clips.shifted = path.join(require('os').tmpdir(), 'ac-shifted.mp4');
  await shiftCenter(clips.gt, clips.shifted, 0.1, 0.1);

  const sequences = {
  static: staticSeq,
  gt: baseSeq,
  early: earlySeq,
  jitter: baseSeq,
  shifted: baseSeq
};

const results = {};
for (const [name, clipPath] of Object.entries(clips)) {
  console.log(`\n--- Testing ${name} ---`);
  const motion = await trackMotion(clipPath, { markers, sequence: sequences[name] });
  const r = { checks: { C1: checkC1(motion, plan), C2: checkC2(motion, plan), C3: checkC3(motion, plan) } };
  results[name] = { C1: r.checks.C1.pass, C2: r.checks.C2.pass, C3: r.checks.C3.pass };
  console.log(`  C1: ${r.checks.C1.pass ? 'PASS' : 'FAIL'}, C2: ${r.checks.C2.pass ? 'PASS' : 'FAIL'}, C3: ${r.checks.C3.pass ? 'PASS' : 'FAIL'}`);
}

  console.log('\n=== ANTI-CHEAT RESULTS TABLE ===');
  console.log('┌─────────────┬──────┬──────┬──────┐');
  console.log('│ Clip        │ C1   │ C2   │ C3   │');
  console.log('├─────────────┼──────┼──────┼──────┤');
  for (const [name, r] of Object.entries(results)) {
    console.log(`│ ${name.padEnd(11)} │ ${r.C1 ? 'PASS' : 'FAIL '.padEnd(4)} │ ${r.C2 ? 'PASS' : 'FAIL '.padEnd(4)} │ ${r.C3 ? 'PASS' : 'FAIL '.padEnd(4)} │`);
  }
  console.log('└─────────────┴──────┴──────┴──────┘');

  console.log('\nExpected:');
  console.log('  static:     C1=FAIL, C2=FAIL, C3=FAIL');
  console.log('  gt:         C1=PASS, C2=PASS, C3=PASS');
  console.log('  early:      C1=FAIL, C2=PASS, C3=PASS');
  console.log('  jitter:     C1=PASS, C2=PASS, C3=FAIL');
  console.log('  shifted:    C1=PASS, C2=FAIL, C3=PASS');
}

if (require.main === module) {
  runAntiCheat().catch(e => { console.error(e); process.exit(1); });
}