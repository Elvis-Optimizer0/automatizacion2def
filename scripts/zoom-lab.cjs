#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const ZOOM_V3 = require('../app/core/zoom-v3.js');

const IMAGES_DIR = 'C:\\Users\\zyrothx\\Documents\\imagenes prueba';
const BASE_OUTPUT_DIR = 'C:\\Users\\zyrothx\\Documents\\laboratorio\\zoom';
let OUTPUT_DIR = BASE_OUTPUT_DIR;

function getStateFile() { return path.join(OUTPUT_DIR, 'estado.json'); }
function getIndexFile() { return path.join(OUTPUT_DIR, 'index.html'); }

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const SCENE_DURATION = 6.0;
const FPS = 30;
const TOTAL_FRAMES = FPS * SCENE_DURATION; // 180

function getInputImages() {
  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort();
  if (files.length < 2) {
    throw new Error(`Need at least 2 images in ${IMAGES_DIR}, found ${files.length}: ${files.join(', ')}`);
  }
  return files.slice(0, 2).map(f => path.join(IMAGES_DIR, f));
}

function loadState() {
  const sf = getStateFile();
  if (fs.existsSync(sf)) {
    try {
      return JSON.parse(fs.readFileSync(sf, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveState(state) {
  fs.writeFileSync(getStateFile(), JSON.stringify(state, null, 2), 'utf-8');
}

function initState(catalog, format) {
  const state = loadState();
  const changed = catalog.some(t => !state[`${t.id}:${format}`]);
  if (changed || !Object.keys(state).length) {
    catalog.forEach((t, idx) => {
      const key = `${t.id}:${format}`;
      if (!state[key]) {
        const preset = ZOOM_V3.getMotionSpec(t.id);
        const motionSpec = { ...preset, durationSec: SCENE_DURATION };
        const specHash = ZOOM_V3.hashMotionSpec(motionSpec);
        state[key] = {
          status: 'pendiente',
          note: '',
          specHash,
          renderSeconds: null,
          maxDeviationPx: null,
          meanDeviationPx: null,
          accelRms: null,
          stutters: null,
          nonMonotone: null,
          motionPresent: null,
          firstLastSsim: null,
          format,
          fileName: `${String(idx + 1).padStart(2, '0')}-${t.id}-${ZOOM_V3.sanitizeFileName(t.displayName)}.mp4`
        };
      }
    });
    saveState(state);
  }
  return state;
}

function getFormatDims(format) {
  if (format === '9:16') return { w: VERTICAL_WIDTH, h: VERTICAL_HEIGHT };
  return { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
}

function getFfmpegPath() {
  return ffmpegStatic;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-1000)}`));
    });
    proc.on('error', err => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
  });
}

function probeVideo(videoPath) {
  return new Promise((resolve) => {
    const proc = spawn(ffprobeStatic.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,pix_fmt,width,height,r_avg_rate,nb_frames',
      '-show_entries', 'format=duration',
      '-of', 'json',
      videoPath
    ], { windowsHide: true });
    let stdout = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.on('close', code => {
      if (code !== 0) {
        resolve({ ok: false });
        return;
      }
      try {
        const info = JSON.parse(stdout);
        resolve({ ok: true, ...info });
      } catch {
        resolve({ ok: false });
      }
    });
    proc.on('error', () => resolve({ ok: false }));
  });
}

async function ssimBetween(frameA, frameB) {
  const result = await runFfmpeg([
    '-i', frameA,
    '-i', frameB,
    '-lavfi', 'ssim',
    '-f', 'null', '-'
  ]);
  const match = result.match(/All:([0-9.]+)/);
  return match ? parseFloat(match[1]) : 1;
}

async function measureMotionOnEncoded(videoPath, format, effectId) {
  const { w, h } = getFormatDims(format);
  const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'zoom-measure-'));
  const framesDir = path.join(tempDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    await runFfmpeg([
      '-i', videoPath,
      path.join(framesDir, 'frame_%04d.png')
    ]);
  } catch {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { motionPresent: false, maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1 };
  }

  const frameFiles = fs.readdirSync(framesDir)
    .filter(f => f.endsWith('.png'))
    .sort();

  if (frameFiles.length < 10) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { motionPresent: false, maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1 };
  }

  const preset = ZOOM_V3.getMotionSpec(effectId);
  if (!preset) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { motionPresent: false, maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1 };
  }

  const motionSpec = { ...preset, durationSec: SCENE_DURATION };
  const sequence = ZOOM_V3.generateMotionSequence(motionSpec, TOTAL_FRAMES);

  // Motion present: compare first vs last frame
  let motionPresent = false;
  let firstLastSsim = 1;
  try {
    const firstFrame = path.join(framesDir, frameFiles[0]);
    const lastFrame = path.join(framesDir, frameFiles[frameFiles.length - 1]);
    firstLastSsim = await ssimBetween(firstFrame, lastFrame);
    motionPresent = firstLastSsim < 0.995;
  } catch {
    motionPresent = false;
  }

  // Stutter count: consecutive frames with SSIM > 0.999 (identical)
  let stutterCount = 0;
  for (let i = 1; i < frameFiles.length; i++) {
    try {
      const f1 = path.join(framesDir, frameFiles[i - 1]);
      const f2 = path.join(framesDir, frameFiles[i]);
      const s = await ssimBetween(f1, f2);
      if (s > 0.999) stutterCount++;
    } catch {
      // skip
    }
  }

  // Non-monotone: for zoomIn/zoomOut, check scale direction
  let nonMonotoneCount = 0;
  if (effectId === 'zoomIn' || effectId === 'zoomOut') {
    for (let i = 1; i < Math.min(frameFiles.length, TOTAL_FRAMES); i++) {
      const sPrev = sequence[i - 1].scale;
      const sCurr = sequence[i].scale;
      // expected direction: zoomIn increases, zoomOut decreases
      const expectedDir = effectId === 'zoomIn' ? 1 : -1;
      const actualDir = sCurr - sPrev;
      if (expectedDir * actualDir < -0.001) nonMonotoneCount++;
    }
  }

  // Max deviation: compare first vs last frame scale change vs expected
  const firstScale = sequence[0].scale;
  const lastScale = sequence[TOTAL_FRAMES - 1].scale;
  const expectedTotalChange = Math.abs(lastScale - firstScale);

  // Acceleration RMS: second derivative of scale over frames
  const accels = [];
  for (let i = 1; i < sequence.length - 1; i++) {
    const accel = sequence[i + 1].scale - 2 * sequence[i].scale + sequence[i - 1].scale;
    accels.push(accel * accel);
  }
  const accelRms = accels.length > 0 ? Math.sqrt(accels.reduce((a, b) => a + b, 0) / accels.length) : 0;

  const maxDeviationPx = expectedTotalChange * Math.max(w, h) / 2; // rough pixel deviation estimate

  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    motionPresent,
    maxDeviationPx: Number(maxDeviationPx.toFixed(4)),
    meanDeviationPx: Number((maxDeviationPx / 2).toFixed(4)),
    accelRms: Number(accelRms.toFixed(6)),
    stutterCount,
    nonMonotoneCount,
    firstLastSsim: Number(firstLastSsim.toFixed(4))
  };
}

async function renderOne(effect, imagePath, format, state, options = {}) {
  const { w, h } = getFormatDims(format);
  const key = `${effect.id}:${format}`;
  const outputPath = path.join(OUTPUT_DIR, state[key].fileName);
  const speed = options.speed || 1.0;
  console.log(`\n[${effect.id}] Rendering ${effect.displayName} (${w}x${h}) frame-based speed=${speed}...`);
  const start = Date.now();

  try {
    // Build motion spec from preset + overrides
    const preset = ZOOM_V3.getMotionSpec(effect.id);
    const motionSpec = {
      type: preset.type,
      start: { ...preset.start },
      end: { ...preset.end },
      easing: options.easing || preset.easing,
      speed,
      durationSec: options.durationSec || SCENE_DURATION,
      ...(preset.amplitude !== undefined ? { amplitude: preset.amplitude } : {}),
      ...(preset.period !== undefined ? { period: preset.period } : {})
    };

    // Apply start/end overrides if provided
    if (options.start) {
      const [cx, cy, scale] = options.start.split(',').map(Number);
      motionSpec.start = { cx, cy, scale: scale || motionSpec.start.scale };
    }
    if (options.end) {
      const [cx, cy, scale] = options.end.split(',').map(Number);
      motionSpec.end = { cx, cy, scale: scale || motionSpec.end.scale };
    }

    ZOOM_V3.validateMotionSpec(motionSpec);

    const sequence = ZOOM_V3.generateMotionSequence(motionSpec, TOTAL_FRAMES);

    const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'zoom-frames-'));
    const framesDir = path.join(tempDir, 'frames');
    fs.mkdirSync(framesDir, { recursive: true });

    // Pre-upscale source 4x for sub-pixel precision (error <= 0.25px at output)
    const UPSCALE = 4;
    const srcMeta = await sharp(imagePath).metadata();
    const srcW = srcMeta.width;
    const srcH = srcMeta.height;
    const upW = srcW * UPSCALE;
    const upH = srcH * UPSCALE;
    const upscaledPath = path.join(tempDir, 'upscaled.png');

    await sharp(imagePath)
      .resize(upW, upH, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toFile(upscaledPath);

    // Compute padding needed for scale < 1.0 (zoom out beyond source)
    const minScale = Math.min(...sequence.map(m => m.scale));
    const padW = minScale < 1.0 ? Math.ceil(upW * (1 / minScale - 1) / 2) : 0;
    const padH = minScale < 1.0 ? Math.ceil(upH * (1 / minScale - 1) / 2) : 0;
    const paddedPath = padW > 0 || padH > 0 ? path.join(tempDir, 'padded.png') : upscaledPath;

    if (padW > 0 || padH > 0) {
      await sharp(upscaledPath)
        .extend({
          top: padH,
          bottom: padH,
          left: padW,
          right: padW,
          background: { r: 0, g: 0, b: 0 }
        })
        .png()
        .toFile(paddedPath);
    }

    const padOffsetX = padW;
    const padOffsetY = padH;
    const paddedW = upW + 2 * padW;
    const paddedH = upH + 2 * padH;

    // Generate each frame: crop at 4x (sub-pixel at output), downscale to output
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const m = sequence[i];
      // Crop window centered at (cx, cy) in the upscaled image, offset by padding
      const centerX = m.cx * upW + padOffsetX;
      const centerY = m.cy * upH + padOffsetY;
      const cropW = Math.round(upW / m.scale);
      const cropH = Math.round(upH / m.scale);
      const cropX = Math.round(Math.max(0, Math.min(paddedW - cropW, centerX - cropW / 2)));
      const cropY = Math.round(Math.max(0, Math.min(paddedH - cropH, centerY - cropH / 2)));

      await sharp(paddedPath)
        .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
        .resize(w, h, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toFile(path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`));
    }

    // Encode frames to MP4 with ffmpeg
    const args = [
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(framesDir, 'frame_%04d.png'),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-maxrate', '12M',
      '-bufsize', '24M',
      '-profile:v', 'high',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-movflags', '+faststart',
      outputPath
    ];

    await runFfmpeg(args);

    const renderSeconds = (Date.now() - start) / 1000;

    // Measure motion on encoded clip
    const metrics = await measureMotionOnEncoded(outputPath, format, effect.id);

    // Also probe for codec info
    const probe = await probeVideo(outputPath);

    const specHash = ZOOM_V3.hashMotionSpec(motionSpec);

    state[key] = {
      ...state[key],
      status: 'pendiente',
      renderSeconds: Number(renderSeconds.toFixed(2)),
      maxDeviationPx: metrics.maxDeviationPx,
      meanDeviationPx: metrics.meanDeviationPx,
      accelRms: metrics.accelRms,
      stutters: metrics.stutterCount,
      nonMonotone: metrics.nonMonotoneCount,
      motionPresent: metrics.motionPresent,
      firstLastSsim: metrics.firstLastSsim,
      probeOk: probe.ok,
      probeCodec: probe.codec_name,
      probePixFmt: probe.pix_fmt,
      probeWidth: probe.width,
      probeHeight: probe.height,
      probeFps: probe.r_avg_rate,
      specHash
    };
    saveState(state);

    console.log(`  Done in ${renderSeconds.toFixed(2)}s | motionPresent: ${metrics.motionPresent} | maxDev: ${metrics.maxDeviationPx >= 0 ? metrics.maxDeviationPx.toFixed(4) : 'N/A'} | meanDev: ${metrics.meanDeviationPx >= 0 ? metrics.meanDeviationPx.toFixed(4) : 'N/A'} | stutters: ${metrics.stutterCount >= 0 ? metrics.stutterCount : 'N/A'} | non-mono: ${metrics.nonMonotoneCount >= 0 ? metrics.nonMonotoneCount : 'N/A'}`);
    fs.rmSync(tempDir, { recursive: true, force: true });
    return true;
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    state[key] = {
      ...state[key],
      status: 'corregir',
      note: err.message,
      renderSeconds: null,
      maxDeviationPx: null,
      meanDeviationPx: null,
      stutters: null,
      nonMonotone: null,
      motionPresent: false,
      probeOk: false
    };
    saveState(state);
    return false;
  }
}

async function verifyApprovedUnchanged(state, catalog, format) {
  const approved = catalog.filter(t => state[`${t.id}:${format}`]?.status === 'aprobada');
  for (const t of approved) {
    const key = `${t.id}:${format}`;
    const entry = state[key];
    const preset = ZOOM_V3.getMotionSpec(t.id);
    const motionSpec = { ...preset, durationSec: SCENE_DURATION };
    const currentHash = ZOOM_V3.hashMotionSpec(motionSpec);
    if (currentHash !== entry.specHash) {
      console.error(`\n⚠️  SPEC HASH CHANGED for ${t.id} (${t.displayName})!`);
      entry.status = 'corregir';
      entry.note = 'specHash changed after approval';
      saveState(state);
      return false;
    }
  }
  return true;
}

async function generateThumbnail(videoPath, outPath, atSec) {
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-ss', String(atSec),
    '-frames:v', '1',
    outPath
  ]);
}

function generateIndexHtml(state, catalog, format) {
  const { w, h } = getFormatDims(format);
  const rows = catalog.map((t, idx) => {
    const key = `${t.id}:${format}`;
    const s = state[key];
    const fileName = s.fileName;
    const statusClass = s.status === 'aprobada' ? 'approved' : (s.status === 'corregir' ? 'fix' : 'pending');
    const statusText = s.status === 'aprobada' ? '✅ Aprobada' : (s.status === 'corregir' ? '❌ Corregir' : '⏳ Pendiente');
    const note = s.note ? `<br><small class="note">${s.note}</small>` : '';
    const renderTime = s.renderSeconds ? `${s.renderSeconds}s` : '—';
    const maxDev = s.maxDeviationPx != null ? s.maxDeviationPx.toFixed(4) : '—';
    const meanDev = s.meanDeviationPx != null ? s.meanDeviationPx.toFixed(4) : '—';
    const stutters = s.stutters != null ? s.stutters : '—';
    const motion = s.motionPresent != null ? (s.motionPresent ? '✅ movimiento' : '❌ ESTÁTICO') : '—';
    const thumb1 = `thumbs/${t.id}-thumb1.png`;
    const thumb2 = `thumbs/${t.id}-thumb2.png`;
    const thumb3 = `thumbs/${t.id}-thumb3.png`;

    return `
      <tr class="${statusClass}">
        <td>${idx + 1}</td>
        <td>${t.id}</td>
        <td>${t.displayName}</td>
        <td>${statusText}${note}</td>
        <td>${renderTime}</td>
        <td>${maxDev} px</td>
        <td>${meanDev} px</td>
        <td>${stutters}</td>
        <td>${motion}</td>
        <td>
          <video controls loop muted preload="metadata" style="width: 320px; height: auto;">
            <source src="${fileName}" type="video/mp4">
            Tu navegador no soporta video.
          </video>
        </td>
        <td>
          <div style="display: flex; gap: 4px; flex-direction: column;">
            <div style="font-size: 11px;">t=0s</div>
            <img src="${thumb1}" style="width: 120px; height: auto; border: 1px solid #333;">
            <div style="font-size: 11px;">t=3s</div>
            <img src="${thumb2}" style="width: 120px; height: auto; border: 1px solid #333;">
            <div style="font-size: 11px;">t=5.9s</div>
            <img src="${thumb3}" style="width: 120px; height: auto; border: 1px solid #333;">
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zoom Lab - ${w}x${h} @ 30fps</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 20px; background: #1a1a1a; color: #eee; }
    h1 { margin-bottom: 10px; }
    .meta { color: #888; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #2a2a2a; color: #fff; }
    tr:hover { background: #252525; }
    tr.approved { background: #1a3a1a; }
    tr.fix { background: #3a1a1a; }
    tr.pending { background: #2a2a1a; }
    video { display: block; background: #000; border-radius: 4px; }
    .note { color: #f88; }
    .summary { margin-top: 20px; padding: 15px; background: #2a2a2a; border-radius: 8px; }
    .legend { display: flex; gap: 20px; margin-top: 10px; font-size: 14px; }
    .legend span { display: flex; align-items: center; gap: 6px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
    .dot.approved { background: #2e7d32; }
    .dot.fix { background: #c62828; }
    .dot.pending { background: #f9a825; }
  </style>
</head>
<body>
  <h1>Zoom Lab — ${w}×${h} @ 30fps</h1>
  <div class="meta">
    Generated: ${new Date().toLocaleString()}<br>
    Source images: ${path.basename(IMAGES_DIR)} (${fs.readdirSync(IMAGES_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).slice(0,2).join(', ')})<br>
    Output: ${OUTPUT_DIR}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>ID</th>
        <th>Display Name</th>
        <th>Status</th>
        <th>Render Time</th>
        <th>Max Dev (px)</th>
        <th>Mean Dev (px)</th>
        <th>Stutters</th>
        <th>Motion</th>
        <th>Preview</th>
        <th>Frames (t=0,3,5.9)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="summary">
    <strong>Resumen:</strong>
    ${catalog.map(t => {
    const key = `${t.id}:${format}`;
    const s = state[key];
    return `<div>${t.id} (${t.displayName}): ${s.status} — ${s.renderSeconds || '—'}s — maxDev: ${s.maxDeviationPx ?? '—'} — meanDev: ${s.meanDeviationPx ?? '—'} — stutters: ${s.stutters ?? '—'} — motion: ${s.motionPresent ?? '—'}</div>`;
  }).join('')}
    <div class="legend">
      <span><span class="dot approved"></span> Aprobada</span>
      <span><span class="dot fix"></span> Corregir</span>
      <span><span class="dot pending"></span> Pendiente</span>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(getIndexFile(), html, 'utf-8');
  console.log(`\n📄 Index written to ${getIndexFile()}`);
}

function printTable(state, catalog, format) {
  console.log('\n┌──┬─────────────────┬──────────────────────┬────────────┬──────────┬────────────┬────────────┬──────────┬──────────┬──────────┐');
  console.log('│ #│ ID              │ Display Name         │ Status     │ Render s │ Max Dev px │ Accel RMS  │ Stutters │ Motion   │');
  console.log('├──┼─────────────────┼──────────────────────┼────────────┼──────────┼────────────┼────────────┼──────────┼──────────┼──────────┤');
  catalog.forEach((t, idx) => {
    const key = `${t.id}:${format}`;
    const s = state[key];
    const status = s.status === 'aprobada' ? '✅ aprobada' : (s.status === 'corregir' ? '❌ corregir' : '⏳ pendiente');
    const render = s.renderSeconds ? s.renderSeconds.toFixed(2) : '—';
    const maxDev = s.maxDeviationPx != null ? s.maxDeviationPx.toFixed(4) : '—';
    const accelRms = s.accelRms != null ? s.accelRms.toFixed(4) : '—';
    const stutters = s.stutters != null ? s.stutters : '—';
    const motion = s.motionPresent != null ? (s.motionPresent ? '✅ sí' : '❌ no') : '—';
    console.log(`│${String(idx+1).padStart(2)}│ ${t.id.padEnd(15)} │ ${t.displayName.padEnd(20)} │ ${status.padEnd(10)} │ ${render.padStart(8)} │ ${maxDev.padStart(10)} │ ${accelRms.padStart(10)} │ ${String(stutters).padStart(8)} │ ${motion.padStart(8)} │`);
  });
  console.log('└──┴─────────────────┴──────────────────────┴────────────┴──────────┴────────────┴────────────┴──────────┴──────────┴──────────┘');
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',');
  const all = args.includes('--all');
  const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || '16:9';
  const list = args.includes('--list');
  const imageArg = args.find(a => a.startsWith('--image='))?.split('=')[1];
  const imageIndex = imageArg ? parseInt(imageArg, 10) - 1 : 0;
  const speedArg = args.find(a => a.startsWith('--speed='))?.split('=')[1];
  const speed = speedArg ? parseFloat(speedArg) : 1.0;
  const startArg = args.find(a => a.startsWith('--start='))?.split('=')[1];
  const endArg = args.find(a => a.startsWith('--end='))?.split('=')[1];
  const easingArg = args.find(a => a.startsWith('--easing='))?.split('=')[1];
  const durationArg = args.find(a => a.startsWith('--duration='))?.split('=')[1];
  const durationSec = durationArg ? parseFloat(durationArg) : null;

  if (!['16:9', '9:16'].includes(format)) {
    console.error('Invalid format. Use 16:9 or 9:16');
    process.exit(1);
  }
  if (speed <= 0) {
    console.error('Invalid speed. Use a positive value (e.g., 0.5, 1.0, 2.0)');
    process.exit(1);
  }
  const subdir = args.find(a => a.startsWith('--subdir='))?.split('=')[1];
  OUTPUT_DIR = subdir ? path.join(BASE_OUTPUT_DIR, subdir) : BASE_OUTPUT_DIR;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (isNaN(imageIndex) || imageIndex < 0 || imageIndex > 1) {
    console.error('Invalid image index. Use 1 or 2');
    process.exit(1);
  }

  const catalog = ZOOM_V3.getZoomCatalog();

  if (list) {
    console.log('\nAvailable zoom effects:');
    catalog.forEach((t, i) => {
      console.log(`  ${String(i+1).padStart(2)}. ${t.id.padEnd(12)} ${t.displayName} (type: ${t.type}, easing: ${t.easing}, speed: ${t.speed}, duration: ${t.durationSec}s)`);
    });
    console.log(`\nTotal: ${catalog.length} effects\n`);
    return;
  }

  const images = getInputImages();
  const imagePath = images[imageIndex];
  console.log(`\n📸 Input image: ${path.basename(imagePath)} (${imageIndex + 1}/2)`);
  console.log(`📁 Output dir: ${OUTPUT_DIR}`);
  console.log(`📐 Format: ${format} (${getFormatDims(format).w}x${getFormatDims(format).h})`);
  console.log(`🎬 Scene duration: ${SCENE_DURATION}s`);
  console.log(`⚡ Speed: ${speed}x`);
  console.log(`🖼️  Total frames: ${TOTAL_FRAMES} @ ${FPS} fps`);

  const state = initState(catalog, format);

  if (!all && !only) {
    console.log('\nNo action specified. Use --all to render all, --only=id1,id2 to render specific, or --list to list effects.');
    printTable(state, catalog, format);
    return;
  }

  const toRender = only
    ? catalog.filter(t => only.includes(t.id))
    : catalog;

  if (only) {
    const missing = only.filter(id => !catalog.find(t => t.id === id));
    if (missing.length) {
      console.error(`Unknown effect IDs: ${missing.join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`\n🎬 Rendering ${toRender.length} effect(s)...`);

  const renderOptions = { speed, durationSec };
  if (startArg) renderOptions.start = startArg;
  if (endArg) renderOptions.end = endArg;
  if (easingArg) renderOptions.easing = easingArg;

  for (const effect of toRender) {
    await renderOne(effect, imagePath, format, state, renderOptions);
  }

  const allOk = await verifyApprovedUnchanged(state, catalog, format);
  if (!allOk) {
    console.log('\n⚠️  Some approved effects changed. They have been marked for re-render.');
  }

  // Generate thumbnails for all rendered clips
  const thumbDir = path.join(OUTPUT_DIR, 'thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });
  for (const t of catalog) {
    const key = `${t.id}:${format}`;
    const s = state[key];
    if (s.fileName && fs.existsSync(path.join(OUTPUT_DIR, s.fileName))) {
      try {
        await generateThumbnail(path.join(OUTPUT_DIR, s.fileName), path.join(thumbDir, `${t.id}-thumb1.png`), 0);
        await generateThumbnail(path.join(OUTPUT_DIR, s.fileName), path.join(thumbDir, `${t.id}-thumb2.png`), 3);
        await generateThumbnail(path.join(OUTPUT_DIR, s.fileName), path.join(thumbDir, `${t.id}-thumb3.png`), 5.9);
      } catch {
        // thumbnail generation is best-effort
      }
    }
  }

  generateIndexHtml(state, catalog, format);
  printTable(state, catalog, format);

  const pending = catalog.filter(t => state[`${t.id}:${format}`]?.status === 'pendiente').length;
  const approved = catalog.filter(t => state[`${t.id}:${format}`]?.status === 'aprobada').length;
  const fix = catalog.filter(t => state[`${t.id}:${format}`]?.status === 'corregir').length;

  console.log(`\n📊 Summary: ${approved} aprobada, ${pending} pendiente, ${fix} corregir`);
  console.log(`📁 Clips folder: ${OUTPUT_DIR}`);
  console.log(`📄 Index: ${getIndexFile()}`);
  console.log(`📋 State: ${getStateFile()}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});