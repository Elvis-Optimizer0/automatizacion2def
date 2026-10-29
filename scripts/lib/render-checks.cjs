#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const FPS = 30;
const OUT_W = 1920;
const OUT_H = 1080;

function num(v, d = 6) { return Number(Number(v).toFixed(d)); }

function smoothstep(p) { return 3 * p * p - 2 * p * p * p; }

function easingFn(name) {
  if (name === 'linear') return p => p;
  if (name === 'smooth') return smoothstep;
  if (name === 'in') return p => p * p;
  if (name === 'out') return p => 1 - (1 - p) * (1 - p);
  return smoothstep;
}

function computeExpectedSequence(plan, format) {
  const { w, h } = format === '9:16' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
  const seq = [];
  let t = 0;
  for (const scene of plan.scenes) {
    const { durationSec, effect, speed = 1.0 } = scene;
    const frames = Math.round(durationSec * FPS);
    const holdStart = durationSec / speed;
    const ease = easingFn(scene.easing || 'smooth');
    let startScale = 1.0, endScale = 1.15;
    let startCx = 0.5, startCy = 0.5, endCx = 0.5, endCy = 0.5;
    if (effect === 'zoomOut') { startScale = 1.15; endScale = 1.0; }
    else if (effect === 'panLeft') { startScale = endScale = 1.2; startCx = 1.0; endCx = 0.0; }
    else if (effect === 'panRight') { startScale = endScale = 1.2; startCx = 0.0; endCx = 1.0; }
    else if (effect === 'panUp') { startScale = endScale = 1.2; startCy = 1.0; endCy = 0.0; }
    else if (effect === 'panDown') { startScale = endScale = 1.2; startCy = 0.0; endCy = 1.0; }
    else if (effect === 'pulse') { startScale = endScale = 1.0; }
    else if (effect === 'kenburns') { startScale = 1.0; endScale = 1.15; }
    for (let i = 0; i < frames; i++) {
      const ft = i / FPS;
      let p = ft >= holdStart ? 1 : Math.min(1, (ft / durationSec) * speed);
      p = ease(p);
      let scale, cx, cy;
      if (effect === 'pulse') {
        scale = 1.0 + 0.075 * Math.sin(2 * Math.PI * Math.min(ft, holdStart));
        cx = 0.5; cy = 0.5;
      } else {
        scale = startScale + (endScale - startScale) * p;
        cx = startCx + (endCx - startCx) * p;
        cy = startCy + (endCy - startCy) * p;
      }
      seq.push({ t: t + ft, frame: seq.length, scale, cx, cy, sceneIdx: plan.scenes.indexOf(scene) });
    }
    t += durationSec;
  }
  return seq;
}

async function probeVideo(videoPath) {
  return new Promise((resolve) => {
    const proc = spawn(ffprobeStatic.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,profile,width,height,r_frame_rate,avg_frame_rate,pix_fmt,bit_rate',
      '-show_entries', 'format=duration,bit_rate',
      '-of', 'json',
      videoPath
    ], { windowsHide: true });
    let stdout = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.on('close', code => {
      if (code !== 0) return resolve({ ok: false });
      try { resolve({ ok: true, ...JSON.parse(stdout) }); } catch { resolve({ ok: false }); }
    });
    proc.on('error', () => resolve({ ok: false }));
  });
}

async function decodeFrames(videoPath, tmpDir, maxFrames = null) {
  await new Promise((resolve, reject) => {
    const args = ['-y', '-i', videoPath, '-vf', 'format=gray', '-f', 'image2', path.join(tmpDir, 'frame_%05d.png')];
    if (maxFrames) args.splice(3, 0, '-vframes', String(maxFrames));
    const proc = spawn(ffmpegStatic, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg decode ${code}: ${stderr.slice(-500)}`)));
    proc.on('error', reject);
  });
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
  if (maxFrames) files.length = Math.min(files.length, maxFrames);
  const frames = [];
  for (const f of files) {
    const buf = await sharp(path.join(tmpDir, f)).raw().toBuffer({ resolveWithObject: true });
    let data = buf.data;
    const w = buf.info.width, h = buf.info.height;
    if (buf.info.channels === 3) {
      const gray = Buffer.alloc(w * h);
      for (let i = 0, j = 0; i < data.length; i += 3, j++) gray[j] = data[i];
      data = gray;
    }
    frames.push({ data, w, h });
  }
  return frames;
}

function detectFeatures(frame, gridStep = 24, minGrad = 20) {
  const { data, w, h } = frame;
  const features = [];
  for (let y = gridStep; y < h - gridStep; y += gridStep) {
    const row = y * w;
    for (let x = gridStep; x < w - gridStep; x += gridStep) {
      const idx = row + x;
      const gx = data[idx + 1] - data[idx - 1];
      const gy = data[(y + 1) * w + x] - data[(y - 1) * w + x];
      const grad = Math.hypot(gx, gy);
      if (grad > minGrad) features.push({ x, y, grad });
    }
  }
  features.sort((a, b) => b.grad - a.grad);
  return features.slice(0, 200);
}

function nccPatch(ref, frame, cx, cy, patchSize = 15, searchRadius = 20) {
  const { data: refData, w: rw, h: rh } = ref;
  const { data: frmData, w: fw, h: fh } = frame;
  const half = Math.floor(patchSize / 2);
  const rx0 = Math.round(cx) - half, ry0 = Math.round(cy) - half;
  if (rx0 < 0 || ry0 < 0 || rx0 + patchSize > rw || ry0 + patchSize > rh) return null;
  const patch = new Float32Array(patchSize * patchSize);
  let p = 0;
  for (let yy = 0; yy < patchSize; yy++) {
    const row = (ry0 + yy) * rw + rx0;
    for (let xx = 0; xx < patchSize; xx++) patch[p++] = refData[row + xx];
  }
  const mean = patch.reduce((a, b) => a + b, 0) / patch.length;
  const std = Math.sqrt(patch.reduce((a, b) => a + (b - mean) ** 2, 0) / patch.length);
  if (std < 1) return null;
  for (let i = 0; i < patch.length; i++) patch[i] = (patch[i] - mean) / std;

  let bestX = -1, bestY = -1, bestNcc = -2;
  const minX = Math.max(half, Math.round(cx) - searchRadius);
  const maxX = Math.min(fw - half - 1, Math.round(cx) + searchRadius);
  const minY = Math.max(half, Math.round(cy) - searchRadius);
  const maxY = Math.min(fh - half - 1, Math.round(cy) + searchRadius);
  for (let yy = minY; yy <= maxY; yy++) {
    for (let xx = minX; xx <= maxX; xx++) {
      let sum = 0, sumSq = 0;
      p = 0;
      for (let dy = 0; dy < patchSize; dy++) {
        const row = (yy - half + dy) * fw + (xx - half);
        for (let dx = 0; dx < patchSize; dx++) {
          const v = frmData[row + dx];
          sum += v * patch[p];
          sumSq += v * v;
          p++;
        }
      }
      const meanF = sum / patch.length;
      const stdF = Math.sqrt(sumSq / patch.length - meanF * meanF);
      if (stdF < 1) continue;
      const ncc = (sum - patch.length * meanF * mean) / (patch.length * std * stdF);
      if (ncc > bestNcc) { bestNcc = ncc; bestX = xx; bestY = yy; }
    }
  }
  if (bestX < 0) return null;
  return { x: bestX, y: bestY, ncc: bestNcc };
}

function fitSimilarity(refPts, curPts) {
  const n = Math.min(refPts.length, curPts.length);
  if (n < 3) return null;
  let sumX = 0, sumY = 0, sumXp = 0, sumYp = 0;
  let sumXX = 0, sumYY = 0, sumXXp = 0, sumYYp = 0;
  for (let i = 0; i < n; i++) {
    const rx = refPts[i].x - OUT_W / 2;
    const ry = refPts[i].y - OUT_H / 2;
    const cx = curPts[i].x - OUT_W / 2;
    const cy = curPts[i].y - OUT_H / 2;
    sumX += rx; sumY += ry; sumXp += cx; sumYp += cy;
    sumXX += rx * rx; sumYY += ry * ry;
    sumXXp += rx * cx; sumYYp += ry * cy;
  }
  const scale = (sumXXp + sumYYp) / (sumXX + sumYY);
  const tx = sumXp / n - scale * sumX / n;
  const ty = sumYp / n - scale * sumY / n;
  const centerX = OUT_W / 2 + tx;
  const centerY = OUT_H / 2 + ty;
  const cx = centerX / OUT_W;
  const cy = centerY / OUT_H;
  return { scale, cx, cy };
}

async function estimateMotion(videoPath, maxFrames = 300) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'motion-'));
  try {
    const frames = await decodeFrames(videoPath, tmpDir, maxFrames);
    if (frames.length < 2) return [];
    const refFrame = frames[0];
    const features = detectFeatures(refFrame);
    const refPts = features.map(f => ({ x: f.x, y: f.y }));
    const results = [{ frame: 0, scale: 1, cx: 0.5, cy: 0.5, nFeat: features.length }];
    for (let i = 1; i < frames.length; i++) {
      const curFrame = frames[i];
      const curPts = [];
      for (const f of features) {
        const match = nccPatch(refFrame, curFrame, f.x, f.y);
        if (match && match.ncc > 0.6) curPts.push({ x: match.x, y: match.y });
      }
      const fit = fitSimilarity(refPts, curPts);
      if (fit) results.push({ frame: i, ...fit, nFeat: curPts.length });
      else results.push({ frame: i, scale: 1, cx: 0.5, cy: 0.5, nFeat: 0 });
    }
    return results;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function checkC1(motion, plan) {
  const details = [];
  let passed = true;
  for (const scene of plan.scenes) {
    const sceneMotion = motion.filter(m => m.sceneIdx === plan.scenes.indexOf(scene));
    if (sceneMotion.length < 10) { details.push({ scene: scene.effect, pass: false, reason: 'insufficient frames' }); passed = false; continue; }
    const expected = computeExpectedSequence({ scenes: [scene] }, '16:9');
    const totalFrames = sceneMotion.length;
    const checkPoints = [0.25, 0.5, 0.75];
    for (const cp of checkPoints) {
      const idx = Math.round(cp * (totalFrames - 1));
      const expProg = expected[idx].scale === expected[0].scale ? cp : (expected[idx].scale - expected[0].scale) / (expected[expected.length - 1].scale - expected[0].scale);
      const measProg = sceneMotion[idx].scale === sceneMotion[0].scale ? cp : (sceneMotion[idx].scale - sceneMotion[0].scale) / (sceneMotion[sceneMotion.length - 1].scale - sceneMotion[0].scale);
      const err = Math.abs(measProg - expProg);
      if (err > 0.05) { passed = false; details.push({ scene: scene.effect, point: cp, expected: expProg, measured: measProg, err, pass: false }); }
    }
    const holdFrames = Math.round((scene.durationSec / scene.speed) * FPS);
    const endIdx = Math.min(holdFrames, totalFrames - 1);
    const finalProg = sceneMotion[endIdx].scale === sceneMotion[0].scale ? 1 : (sceneMotion[endIdx].scale - sceneMotion[0].scale) / (sceneMotion[sceneMotion.length - 1].scale - sceneMotion[0].scale);
    if (Math.abs(finalProg - 1) > 0.03) { passed = false; details.push({ scene: scene.effect, check: 'motionEnd', expected: 1, measured: finalProg, pass: false }); }
    if (scene.durationSec >= 8) {
      const idx8s = Math.round(8 * FPS);
      if (idx8s < totalFrames) {
        const prog8s = sceneMotion[idx8s].scale === sceneMotion[0].scale ? 1 : (sceneMotion[idx8s].scale - sceneMotion[0].scale) / (sceneMotion[sceneMotion.length - 1].scale - sceneMotion[0].scale);
        if (prog8s >= 1) { passed = false; details.push({ scene: scene.effect, check: 'stillMovingAt8s', progress: prog8s, pass: false }); }
      }
    }
  }
  return { pass: passed, details };
}

function checkC2(motion, plan) {
  const details = [];
  let passed = true;
  for (const scene of plan.scenes) {
    if (!['zoomIn', 'zoomOut', 'kenburns'].includes(scene.effect)) continue;
    const sceneMotion = motion.filter(m => m.sceneIdx === plan.scenes.indexOf(scene));
    let hasMotion = false;
    for (const m of sceneMotion) {
      if (Math.abs(m.scale - 1) > 0.001) hasMotion = true;
      const dx = Math.abs(m.cx - 0.5);
      const dy = Math.abs(m.cy - 0.5);
      if (dx > 0.01 || dy > 0.01) { passed = false; details.push({ scene: scene.effect, frame: m.frame, cx: m.cx, cy: m.cy, dx, dy, pass: false }); }
    }
    if (!hasMotion) { passed = false; details.push({ scene: scene.effect, check: 'noMotion', pass: false }); }
  }
  return { pass: passed, details };
}

function checkC3(motion, plan) {
  const details = [];
  let passed = true;
  for (const scene of plan.scenes) {
    const sceneMotion = motion.filter(m => m.sceneIdx === plan.scenes.indexOf(scene));
    let maxScaleAccel = 0, maxCenterAccelPx = 0, sumScaleAccelSq = 0;
    let sumCenterDispSq = 0;
    for (let i = 1; i < sceneMotion.length - 1; i++) {
      const a = sceneMotion[i + 1].scale - 2 * sceneMotion[i].scale + sceneMotion[i - 1].scale;
      sumScaleAccelSq += a * a;
      maxScaleAccel = Math.max(maxScaleAccel, Math.abs(a));
      const cxA = (sceneMotion[i + 1].cx - 2 * sceneMotion[i].cx + sceneMotion[i - 1].cx) * OUT_W;
      const cyA = (sceneMotion[i + 1].cy - 2 * sceneMotion[i].cy + sceneMotion[i - 1].cy) * OUT_H;
      maxCenterAccelPx = Math.max(maxCenterAccelPx, Math.hypot(cxA, cyA));
    }
    for (let i = 1; i < sceneMotion.length; i++) {
      const dx = (sceneMotion[i].cx - sceneMotion[i - 1].cx) * OUT_W;
      const dy = (sceneMotion[i].cy - sceneMotion[i - 1].cy) * OUT_H;
      sumCenterDispSq += dx * dx + dy * dy;
    }
    const centerDispRms = Math.sqrt(sumCenterDispSq / Math.max(1, sceneMotion.length - 1));
    const accelRms = Math.sqrt(sumScaleAccelSq / Math.max(1, sceneMotion.length - 2));
    let stutters = 0, nonMono = 0;
    for (let i = 1; i < sceneMotion.length; i++) {
      if (Math.abs(sceneMotion[i].scale - sceneMotion[i - 1].scale) < 1e-6) stutters++;
      if (scene.effect === 'zoomIn' && sceneMotion[i].scale < sceneMotion[i - 1].scale) nonMono++;
      if (scene.effect === 'zoomOut' && sceneMotion[i].scale > sceneMotion[i - 1].scale) nonMono++;
    }
    if (maxScaleAccel > 0.01) { passed = false; details.push({ scene: scene.effect, check: 'maxScaleAccel', value: maxScaleAccel, limit: 0.01, pass: false }); }
    if (maxCenterAccelPx > 2.0) { passed = false; details.push({ scene: scene.effect, check: 'maxCenterAccelPx', value: maxCenterAccelPx, limit: 2.0, pass: false }); }
    if (centerDispRms > 0.5) { passed = false; details.push({ scene: scene.effect, check: 'centerDispRms', value: centerDispRms, limit: 0.5, pass: false }); }
    if (stutters > 0) { passed = false; details.push({ scene: scene.effect, check: 'stutters', value: stutters, pass: false }); }
    if (nonMono > 5) { passed = false; details.push({ scene: scene.effect, check: 'nonMonotone', value: nonMono, pass: false }); }
    details.push({ scene: scene.effect, maxScaleAccel, maxCenterAccelPx, centerDispRms, accelRms, stutters, nonMono });
  }
  return { pass: passed, details };
}

function checkC4(motion, plan) {
  const details = [];
  let passed = true;
  for (const scene of plan.scenes) {
    if (!['panLeft', 'panRight', 'panUp', 'panDown'].includes(scene.effect)) continue;
    const sceneMotion = motion.filter(m => m.sceneIdx === plan.scenes.indexOf(scene) && m.cx != null && m.cy != null);
    if (sceneMotion.length < 2) { details.push({ scene: scene.effect, pass: false, reason: 'insufficient motion data' }); passed = false; continue; }
    const scales = sceneMotion.map(m => m.scale);
    const meanScale = scales.reduce((a, b) => a + b, 0) / scales.length;
    const scaleVar = scales.reduce((a, b) => a + (b - meanScale) ** 2, 0) / scales.length;
    if (Math.abs(meanScale - 1.2) > 0.05) { passed = false; details.push({ scene: scene.effect, check: 'meanScale', value: meanScale, expected: 1.2, pass: false }); }
    if (scaleVar > 0.001) { passed = false; details.push({ scene: scene.effect, check: 'scaleVar', value: scaleVar, pass: false }); }
    const travelX = Math.abs(sceneMotion[sceneMotion.length - 1].cx - sceneMotion[0].cx) * OUT_W;
    const travelY = Math.abs(sceneMotion[sceneMotion.length - 1].cy - sceneMotion[0].cy) * OUT_H;
    const travel = Math.max(travelX, travelY);
    if (travel < 0.08 * OUT_W) { passed = false; details.push({ scene: scene.effect, check: 'travel', value: travel, min: 0.08 * OUT_W, pass: false }); }
    details.push({ scene: scene.effect, meanScale, scaleVar, travel });
  }
  return { pass: passed, details };
}

async function checkC5(videoPath, plan) {
  const details = [];
  let passed = true;
  for (const b of plan.boundaries || []) {
    const { startSec, durationSec, type } = b;
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'trans-'));
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn(ffmpegStatic, ['-y', '-ss', String(Math.max(0, startSec - 0.5)), '-t', String(durationSec + 1), '-i', videoPath, '-vf', 'format=gray', '-f', 'image2', path.join(tmpDir, 'frame_%05d.png')], { windowsHide: true });
        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)));
        proc.on('error', reject);
      });
      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
      if (files.length < 5) { details.push({ type, pass: false, reason: 'insufficient frames' }); continue; }
      const frames = [];
      for (const f of files) {
        const buf = await sharp(path.join(tmpDir, f)).raw().toBuffer({ resolveWithObject: true });
        let data = buf.data;
        const w = buf.info.width, h = buf.info.height;
        if (buf.info.channels === 3) { const gray = Buffer.alloc(w * h); for (let i = 0, j = 0; i < data.length; i += 3, j++) gray[j] = data[i]; data = gray; }
        frames.push({ data, w, h });
      }
      let monotone = true, stutters = 0;
      let prevMean = null;
      for (let i = 0; i < frames.length; i++) {
        const data = frames[i].data;
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        if (prevMean !== null) {
          if (Math.abs(mean - prevMean) < 0.1) stutters++;
        }
        prevMean = mean;
      }
      if (stutters > 1) { passed = false; details.push({ type, check: 'stutters', value: stutters, pass: false }); }
      details.push({ type, stutters });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
  return { pass: passed, details };
}

async function checkC6(videoPath, plan, audioPath) {
  const probe = await probeVideo(videoPath);
  if (!probe.ok) return { pass: false, details: [{ check: 'probe', pass: false }] };
  const vidDur = parseFloat(probe.format.duration);
  const audioDur = plan.audioDurationSec || vidDur;
  const durErr = Math.abs(vidDur - audioDur);
  let passed = true;
  const details = [];
  if (durErr > 0.1) { passed = false; details.push({ check: 'totalDuration', video: vidDur, audio: audioDur, err: durErr, pass: false }); }
  let cum = 0;
  for (let i = 0; i < plan.scenes.length - 1; i++) {
    cum += plan.scenes[i].durationSec;
    const boundary = plan.boundaries?.find(b => Math.abs(b.startSec - cum) < 0.5);
    if (boundary) {
      const expectedFrame = Math.round(cum * FPS);
      details.push({ check: 'sceneBoundary', sceneIdx: i + 1, expectedTime: cum, boundaryStart: boundary.startSec, pass: true });
    }
  }
  return { pass: passed, details };
}

async function checkC7(videoPath) {
  const probe = await probeVideo(videoPath);
  if (!probe.ok) return { pass: false, details: [{ check: 'probe', pass: false }] };
  const stream = probe.streams[0];
  const details = [];
  let passed = true;
  if (stream.codec_name !== 'h264') { passed = false; details.push({ check: 'codec', value: stream.codec_name, pass: false }); }
  if (stream.profile !== 'High') { passed = false; details.push({ check: 'profile', value: stream.profile, pass: false }); }
  if (stream.pix_fmt !== 'yuv420p') { passed = false; details.push({ check: 'pix_fmt', value: stream.pix_fmt, pass: false }); }
  if (stream.width % 2 !== 0 || stream.height % 2 !== 0) { passed = false; details.push({ check: 'evenDims', w: stream.width, h: stream.height, pass: false }); }
  const fpsParts = stream.r_frame_rate.split('/').map(Number);
  const fps = fpsParts[0] / fpsParts[1];
  if (Math.abs(fps - 30) > 0.1) { passed = false; details.push({ check: 'fps', value: fps, pass: false }); }
  if (!probe.format.tags?.major_brand || !['mp42', 'isom', 'mp41'].includes(probe.format.tags.major_brand)) {
    details.push({ check: 'faststart', note: 'not verified' });
  }
  const audioStream = probe.streams.find(s => s.codec_type === 'audio');
  if (audioStream) {
    if (audioStream.codec_name !== 'aac') { passed = false; details.push({ check: 'audioCodec', value: audioStream.codec_name, pass: false }); }
    if (audioStream.sample_rate !== '48000') { passed = false; details.push({ check: 'audioSampleRate', value: audioStream.sample_rate, pass: false }); }
    if (audioStream.channels !== 2) { passed = false; details.push({ check: 'audioChannels', value: audioStream.channels, pass: false }); }
  }
  details.push({ bitrate: probe.format.bit_rate });
  return { pass: passed, details };
}

async function checkC8(videoPath, referencePath) {
  const probeA = await probeVideo(videoPath);
  const probeB = await probeVideo(referencePath);
  if (!probeA.ok || !probeB.ok) return { pass: false, details: [{ check: 'probe', pass: false }] };
  const details = [];
  let passed = true;
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ssim-'));
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegStatic, ['-y', '-i', videoPath, '-i', referencePath, '-lavfi', 'ssim', '-f', 'null', '-'], { windowsHide: true });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`ssim ${code}: ${stderr}`)));
      proc.on('error', reject);
    });
    const match = stdout.match(/All:([0-9.]+)/);
    const meanSsim = match ? parseFloat(match[1]) : 0;
    if (meanSsim < 0.98) { passed = false; details.push({ check: 'meanSsim', value: meanSsim, limit: 0.98, pass: false }); }
    details.push({ meanSsim });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return { pass: passed, details };
}

async function runAllChecks(videoPath, plan, options = {}) {
  const { audioPath, referencePath, format = '16:9' } = options;
  const motion = await estimateMotion(videoPath);
  const probe = await probeVideo(videoPath);
  const c1 = checkC1(motion, plan);
  const c2 = checkC2(motion, plan);
  const c3 = checkC3(motion, plan);
  const c4 = checkC4(motion, plan);
  const c5 = await checkC5(videoPath, plan);
  const c6 = await checkC6(videoPath, plan, audioPath);
  const c7 = await checkC7(videoPath);
  const c8 = referencePath ? await checkC8(videoPath, referencePath) : { pass: true, details: [{ note: 'skipped' }] };
  const allPassed = c1.pass && c2.pass && c3.pass && c4.pass && c5.pass && c6.pass && c7.pass && c8.pass;
  return {
    pass: allPassed,
    checks: { C1: c1, C2: c2, C3: c3, C4: c4, C5: c5, C6: c6, C7: c7, C8: c8 },
    motion,
    probe
  };
}

function printResults(results) {
  const { pass, checks } = results;
  console.log('\n┌────┬─────────┬────────┬──────────────────────────────────────────────┐');
  console.log('│ ID │ Check   │ Result │ Details                                      │');
  console.log('├────┼─────────┼────────┼──────────────────────────────────────────────┤');
  for (const [id, check] of Object.entries(checks)) {
    const status = check.pass ? '✅ PASS' : '❌ FAIL';
    const detailStr = check.details.map(d => {
      if (d.pass === false) return `${d.check || d.scene}: ${d.value ?? d.err ?? 'FAIL'}`;
      if (d.check) return `${d.check}=${d.value?.toFixed?.(4) ?? d.value}`;
      if (d.scene) return `${d.scene}: dev=${d.maxDevPx?.toFixed(3)} accel=${d.accelRms?.toFixed(6)}`;
      return JSON.stringify(d);
    }).join('; ');
    console.log(`│ ${id.padStart(2)} │ ${id.padStart(5)} │ ${status} │ ${detailStr.padEnd(44)} │`);
  }
  console.log('└────┴─────────┴────────┴──────────────────────────────────────────────┘');
  console.log(`\nOverall: ${pass ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const video = args.find(a => a.startsWith('--video='))?.split('=')[1];
  const planFile = args.find(a => a.startsWith('--plan='))?.split('=')[1];
  const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || '16:9';
  const reference = args.find(a => a.startsWith('--reference='))?.split('=')[1];
  const audio = args.find(a => a.startsWith('--audio='))?.split('=')[1];
  if (!video || !planFile) {
    console.error('Usage: node render-checks.cjs --video=X.mp4 --plan=Y.json [--format=16:9|9:16] [--reference=Z.mp4] [--audio=A.wav]');
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
  runAllChecks(videoPath, plan, { audioPath: audio, referencePath: reference, format }).then(r => {
    printResults(r);
    process.exit(r.pass ? 0 : 1);
  }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = {
  computeExpectedSequence,
  probeVideo,
  decodeFrames,
  detectFeatures,
  nccPatch,
  fitSimilarity,
  estimateMotion,
  checkC1, checkC2, checkC3, checkC4, checkC5, checkC6, checkC7, checkC8,
  runAllChecks,
  printResults,
  FPS, OUT_W, OUT_H
};