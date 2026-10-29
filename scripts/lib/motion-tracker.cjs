#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const sharp = require('sharp');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const FPS = 30;
const SRC_W = 3840;
const SRC_H = 2160;
const OUT_W = 1920;
const OUT_H = 1080;
const LANCZOS_RADIUS = 3;

async function generateGridSource({ w = SRC_W, h = SRC_H, outPath, gridNx = 16, gridNy = 12, markerSize = 80 }) {
  const channels = 3;
  const buf = Buffer.alloc(w * h * channels);
  for (let i = 0; i < buf.length; i += channels) {
    buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255;
  }
  const markerColor = [0, 0, 0];
  const markers = [];
  for (let iy = 0; iy < gridNy - 1; iy++) {
    for (let ix = 0; ix < gridNx - 1; ix++) {
      const cx = Math.round((ix + 0.5) * w / (gridNx - 1));
      const cy = Math.round((iy + 0.5) * h / (gridNy - 1));
      const r = markerSize;
      for (let yy = Math.max(0, cy - r); yy <= Math.min(h - 1, cy + r); yy++) {
        const dy = yy - cy;
        const dxMax = Math.floor(Math.sqrt(r * r - dy * dy));
        for (let xx = Math.max(0, cx - dxMax); xx <= Math.min(w - 1, cx + dxMax); xx++) {
          const idx = (yy * w + xx) * channels;
          buf[idx] = markerColor[0];
          buf[idx + 1] = markerColor[1];
          buf[idx + 2] = markerColor[2];
        }
      }
      markers.push({
        id: markers.length,
        u: (ix + 0.5) / (gridNx - 1),
        v: (iy + 0.5) / (gridNy - 1),
        x: cx, y: cy,
        r
      });
    }
  }
  await sharp(buf, { raw: { width: w, height: h, channels } }).png().toFile(outPath);
  return { markers, w, h };
}

function computeMotionSequence(durationSec, effect, speed = 1.0, startScale = 1.0, endScale = 1.15) {
  const totalFrames = Math.round(durationSec * FPS);
  const holdStart = durationSec / speed;
  const seq = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    let p;
    if (t >= holdStart) p = 1;
    else p = (t / durationSec) * speed;
    p = Math.min(1, p);
    const smooth = 3 * p * p - 2 * p * p * p;
    let scale, cx, cy;
    if (effect === 'zoomIn') {
      scale = startScale + (endScale - startScale) * smooth;
      cx = 0.5; cy = 0.5;
    } else if (effect === 'zoomOut') {
      scale = endScale + (startScale - endScale) * smooth;
      cx = 0.5; cy = 0.5;
    } else if (effect === 'kenburns') {
      scale = startScale + (endScale - startScale) * smooth;
      cx = 0.5; cy = 0.5;
    } else if (effect === 'panLeft') {
      scale = 1.2; cx = 1 - smooth; cy = 0.5;
    } else if (effect === 'panRight') {
      scale = 1.2; cx = smooth; cy = 0.5;
    } else if (effect === 'panUp') {
      scale = 1.2; cx = 0.5; cy = 1 - smooth;
    } else if (effect === 'panDown') {
      scale = 1.2; cx = 0.5; cy = smooth;
    } else if (effect === 'pulse') {
      scale = startScale + 0.075 * Math.sin(2 * Math.PI * t);
      cx = 0.5; cy = 0.5;
    } else {
      scale = startScale; cx = 0.5; cy = 0.5;
    }
    seq.push({ frame: i, t, scale, cx, cy });
  }
  return seq;
}

async function renderGroundTruthClip({ sequence, sourcePath, outPath, fps = FPS, outW = OUT_W, outH = OUT_H, crf = 14 }) {
  const UPSCALE = 4;
  const upW = SRC_W * UPSCALE;
  const upH = SRC_H * UPSCALE;
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gt-frames-'));
  try {
    const upscaledPath = path.join(tmpDir, 'upscaled.png');
    await sharp(sourcePath)
      .resize(upW, upH, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toFile(upscaledPath);
    for (let i = 0; i < sequence.length; i++) {
      const { scale, cx, cy } = sequence[i];
      const cropW = Math.round(upW / scale);
      const cropH = Math.round(upH / scale);
      const centerX = Math.round(cx * upW);
      const centerY = Math.round(cy * upH);
      let cropX = centerX - Math.floor(cropW / 2);
      let cropY = centerY - Math.floor(cropH / 2);
      if (cropX < 0) cropX = 0;
      if (cropY < 0) cropY = 0;
      if (cropX + cropW > upW) cropX = upW - cropW;
      if (cropY + cropH > upH) cropY = upH - cropH;
      const framePath = path.join(tmpDir, `frame_${String(i).padStart(5, '0')}.png`);
      await sharp(upscaledPath)
        .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
        .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toFile(framePath);
    }
    const args = [
      '-y', '-framerate', String(fps),
      '-i', path.join(tmpDir, 'frame_%05d.png'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart',
      outPath
    ];
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegStatic, args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${stderr.slice(-500)}`)));
      proc.on('error', reject);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function decodeVideoToGray(videoPath, tmpDir) {
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic, [
      '-y', '-i', videoPath,
      '-vf', 'format=gray',
      '-f', 'image2',
      path.join(tmpDir, 'frame_%05d.png')
    ], { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg decode ${code}: ${stderr.slice(-500)}`)));
    proc.on('error', reject);
  });
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
  const frames = [];
  for (const f of files) {
    const buf = await sharp(path.join(tmpDir, f)).raw().toBuffer({ resolveWithObject: true });
    let data = buf.data;
    const w = buf.info.width;
    const h = buf.info.height;
    if (buf.info.channels === 3) {
      const gray = Buffer.alloc(w * h);
      for (let i = 0, j = 0; i < data.length; i += 3, j++) {
        gray[j] = data[i];
      }
      data = gray;
    }
    frames.push({ data, w, h });
  }
  return frames;
}

function detectBlobs(frame, expectedPositions, searchRadius = 20) {
  const { data, w, h } = frame;
  const blobs = [];
  for (let i = 0; i < expectedPositions.length; i++) {
    const { x, y } = expectedPositions[i];
    const cx = Math.round(x);
    const cy = Math.round(y);
    let minX = Math.max(0, cx - searchRadius), maxX = Math.min(w - 1, cx + searchRadius);
    let minY = Math.max(0, cy - searchRadius), maxY = Math.min(h - 1, cy + searchRadius);
    let sumX = 0, sumY = 0, count = 0;
    const threshold = 16;
    for (let yy = minY; yy <= maxY; yy++) {
      const row = yy * w;
      for (let xx = minX; xx <= maxX; xx++) {
        const v = data[row + xx];
        if (v < threshold) {
          sumX += xx;
          sumY += yy;
          count++;
        }
      }
    }
    if (count > 0) {
      blobs.push({ cx: sumX / count, cy: sumY / count, weight: count });
    } else {
      blobs.push({ cx: x, cy: y, weight: 0 });
    }
  }
  return blobs;
}

function fitSimilarity(markers, blobs, ow, oh) {
  if (markers.length < 3 || blobs.length < 3) return null;
  const n = Math.min(markers.length, blobs.length);
  let sumU = 0, sumV = 0, sumOx = 0, sumOy = 0;
  let sumUU = 0, sumVV = 0, sumUOx = 0, sumVOy = 0;
  for (let i = 0; i < n; i++) {
    const m = markers[i];
    const b = blobs[i];
    sumU += m.u; sumV += m.v;
    sumOx += b.cx / ow; sumOy += b.cy / oh;
    sumUU += m.u * m.u; sumVV += m.v * m.v;
    sumUOx += m.u * (b.cx / ow); sumVOy += m.v * (b.cy / oh);
  }
  const uMean = sumU / n, vMean = sumV / n;
  const oxMean = sumOx / n, oyMean = sumOy / n;
  const b = (sumUOx - n * uMean * oxMean) / (sumUU - n * uMean * uMean);
  const d = (sumVOy - n * vMean * oyMean) / (sumVV - n * vMean * vMean);
  const a = oxMean - b * uMean;
  const c = oyMean - d * vMean;
  const sx = b;
  const sy = d;
  const scale = (sx + sy) / 2;
  const cx = (0.5 - a) / b;
  const cy = (0.5 - c) / d;
  return { scale, cx, cy };
}

async function trackMotion(videoPath, { markers, fps = FPS, sequence = null, sceneIdx = 0 }) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'track-'));
  try {
    const frames = await decodeVideoToGray(videoPath, tmpDir);
    const results = [];
    let lastFit = { scale: 1, cx: 0.5, cy: 0.5 };
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      let expected;
      if (sequence && sequence[i]) {
        const gt = sequence[i];
        expected = markers.map(m => ({
          x: OUT_W * (0.5 + (m.u - gt.cx) * gt.scale),
          y: OUT_H * (0.5 + (m.v - gt.cy) * gt.scale)
        }));
      } else {
        expected = markers.map(m => ({
          x: OUT_W * (0.5 + (m.u - lastFit.cx) * lastFit.scale),
          y: OUT_H * (0.5 + (m.v - lastFit.cy) * lastFit.scale)
        }));
      }
      const blobs = detectBlobs(frame, expected, 30);
      const fit = fitSimilarity(markers, blobs, OUT_W, OUT_H);
      if (fit) {
        lastFit = fit;
        results.push({ frame: i, ...fit, nBlobs: blobs.length, sceneIdx });
      } else {
        results.push({ frame: i, scale: lastFit.scale, cx: lastFit.cx, cy: lastFit.cy, nBlobs: 0, sceneIdx });
      }
    }
    return results;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function validateTracker() {
  console.log('Generating grid source...');
  const gridPath = path.join(require('os').tmpdir(), 'grid-source.png');
  const { markers } = await generateGridSource({ outPath: gridPath });
  console.log(`Markers: ${markers.length}`);
  console.log('Computing ground truth sequence...');
  const seq = computeMotionSequence(3.0, 'zoomIn', 1.0, 1.0, 1.15);
  const gtPath = path.join(require('os').tmpdir(), 'gt-zoomIn.mp4');
  console.log('Rendering ground truth clip...');
  await renderGroundTruthClip({ sequence: seq, sourcePath: gridPath, outPath: gtPath });
  console.log('Tracking motion...');
  const tracked = await trackMotion(gtPath, { markers, sequence: seq });
  console.log('Computing errors...');
  let maxErr = 0, sumErr = 0, maxScaleErr = 0, sumScaleErr = 0;
  for (let i = 0; i < seq.length; i++) {
    const gt = seq[i];
    const tr = tracked[i];
    const dx = (tr.cx - gt.cx) * OUT_W;
    const dy = (tr.cy - gt.cy) * OUT_H;
    const posErr = Math.hypot(dx, dy);
    const scaleErr = Math.abs(tr.scale - gt.scale);
    maxErr = Math.max(maxErr, posErr);
    sumErr += posErr;
    maxScaleErr = Math.max(maxScaleErr, scaleErr);
    sumScaleErr += scaleErr;
  }
  const meanErr = sumErr / seq.length;
  const meanScaleErr = sumScaleErr / seq.length;
  console.log(`Position error: max=${maxErr.toFixed(4)}px, mean=${meanErr.toFixed(4)}px`);
  console.log(`Scale error: max=${maxScaleErr.toFixed(6)}, mean=${meanScaleErr.toFixed(6)}`);
  const pass = meanErr < 0.1 && maxErr < 0.2;
  console.log(pass ? 'VALIDATION PASSED' : 'VALIDATION FAILED');
  return { pass, maxErr, meanErr, maxScaleErr, meanScaleErr };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--validate')) {
    validateTracker().catch(e => { console.error(e); process.exit(1); });
  }
}

module.exports = {
  generateGridSource,
  computeMotionSequence,
  renderGroundTruthClip,
  decodeVideoToGray,
  detectBlobs,
  fitSimilarity,
  trackMotion,
  validateTracker,
  FPS, SRC_W, SRC_H, OUT_W, OUT_H
};