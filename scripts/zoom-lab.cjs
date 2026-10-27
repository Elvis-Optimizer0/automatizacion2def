#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

const ZOOM_V3 = require('../app/core/zoom-v3.js');

const IMAGES_DIR = 'C:\\Users\\zyrothx\\Documents\\imagenes prueba';
const OUTPUT_DIR = 'C:\\Users\\zyrothx\\Documents\\laboratorio\\zoom';
const STATE_FILE = path.join(OUTPUT_DIR, 'estado.json');
const INDEX_FILE = path.join(OUTPUT_DIR, 'index.html');

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const SCENE_DURATION = 6.0;
const FPS = 30;

const GRID_DIR = path.join(__dirname, '..', '.spike', 'zoom-measurement');
const GRID_IMAGE = path.join(GRID_DIR, 'grid_3840x2160.png');
const GRID_MARKERS = path.join(GRID_DIR, 'grid_3840x2160_markers.json');

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
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function initState(catalog, format, method) {
  const state = loadState();
  const changed = catalog.some(t => !state[`${t.id}:${format}:${method}`]);
  if (changed || !Object.keys(state).length) {
    catalog.forEach((t, idx) => {
      const key = `${t.id}:${format}:${method}`;
      if (!state[key]) {
        const specHash = ZOOM_V3.hashSpec(t.id, ZOOM_V3.ZOOM_MOTION_SPECS[t.id].defaultIntensity, ZOOM_V3.ZOOM_MOTION_SPECS[t.id].defaultStartScale, method);
        state[key] = {
          status: 'pendiente',
          note: '',
          specHash,
          renderSeconds: null,
          maxDeviationPx: null,
          stutters: null,
          format,
          method,
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

function runFfmpeg(args, timeout = 120000) {
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

async function probeVideo(videoPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobeStatic.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'frame=pkt_pts_time,pkt_duration_time,width,height',
      '-of', 'csv=p=0',
      videoPath
    ], { windowsHide: true });
    
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code !== 0) {
        resolve({ repeatedFrames: -1, maxDeviation: -1, fps: 0, frames: 0 });
        return;
      }
      const lines = stdout.trim().split('\n').filter(l => l);
      const frames = lines.map(l => {
        const [pts, dur, w, h] = l.split(',').map(Number);
        return { pts, dur, w, h };
      });
      
      let repeatedFrames = 0;
      let maxDeviation = 0;
      const expectedFrameTime = 1 / 30;
      
      for (let i = 1; i < frames.length; i++) {
        const diff = frames[i].pts - frames[i-1].pts;
        if (Math.abs(diff) < 0.001) repeatedFrames++;
        const deviation = Math.abs(diff - expectedFrameTime);
        if (deviation > maxDeviation) maxDeviation = deviation;
      }
      
      const actualFps = frames.length > 1 ? (frames.length - 1) / (frames[frames.length - 1].pts - frames[0].pts) : 0;
      
      resolve({ repeatedFrames, maxDeviation, fps: actualFps, frames: frames.length });
    });
    proc.on('error', err => resolve({ repeatedFrames: -1, maxDeviation: -1, fps: 0, frames: 0 }));
  });
}

async function measureJitter(videoPath, format, effectId) {
  const { w, h } = getFormatDims(format);
  
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'zoom-measure-'));
    const framesDir = path.join(tempDir, 'frames');
    fs.mkdirSync(framesDir, { recursive: true });
    
    const extractCmd = [
      getFfmpegPath(), '-y',
      '-i', videoPath,
      '-vsync', '0',
      path.join(framesDir, 'frame_%04d.png')
    ];
    
    spawn(getFfmpegPath(), extractCmd.slice(1), { windowsHide: true })
      .on('close', async (code) => {
        if (code !== 0) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          resolve({ maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1 });
          return;
        }
        
        const frameFiles = fs.readdirSync(framesDir)
          .filter(f => f.endsWith('.png'))
          .sort();
        
        if (frameFiles.length < 10) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          resolve({ maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1 });
          return;
        }
        
        const spec = ZOOM_V3.ZOOM_MOTION_SPECS[effectId];
        if (!spec) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          resolve({ maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1 });
          return;
        }
        
        const intensity = spec.defaultIntensity;
        const startScale = spec.defaultStartScale;
        const duration = SCENE_DURATION;
        const totalFrames = FPS * duration;
        
        const deviations = [];
        let stutterCount = 0;
        let nonMonotoneCount = 0;
        let prevScale = null;
        let prevCx = null;
        let prevCy = null;
        
        for (let i = 0; i < Math.min(frameFiles.length, totalFrames); i++) {
          const p = i / (totalFrames - 1);
          const expected = spec.motion(p, intensity, startScale);
          
          const framePath = path.join(framesDir, frameFiles[i]);
          const img = await loadImageAsArray(framePath);
          if (!img) continue;
          
          const measured = measureFrameTransform(img, w, h, expected.scale, expected.cx, expected.cy);
          if (!measured) continue;
          
          const scaleDev = Math.abs(measured.scale - expected.scale);
          const cxDev = Math.abs(measured.cx - expected.cx);
          const cyDev = Math.abs(measured.cy - expected.cy);
          const frameDev = Math.sqrt(scaleDev * scaleDev + cxDev * cxDev + cyDev * cyDev);
          deviations.push(frameDev);
          
          if (prevScale !== null) {
            if (Math.abs(measured.scale - prevScale) < 0.0001 && Math.abs(measured.cx - prevCx) < 0.0001 && Math.abs(measured.cy - prevCy) < 0.0001) {
              stutterCount++;
            }
            if (effectId === 'zoomIn' && measured.scale < prevScale - 0.001) nonMonotoneCount++;
            if (effectId === 'zoomOut' && measured.scale > prevScale + 0.001) nonMonotoneCount++;
          }
          
          prevScale = measured.scale;
          prevCx = measured.cx;
          prevCy = measured.cy;
        }
        
        fs.rmSync(tempDir, { recursive: true, force: true });
        
        if (deviations.length === 0) {
          resolve({ maxDeviationPx: -1, meanDeviationPx: -1, stutterCount: -1, nonMonotoneCount: -1 });
          return;
        }
        
        const maxDev = Math.max(...deviations);
        const meanDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;
        
        resolve({ maxDeviationPx: maxDev, meanDeviationPx: meanDev, stutterCount, nonMonotoneCount });
      });
  });
}

function loadImageAsArray(filePath) {
  return new Promise((resolve) => {
    const sharp = require('sharp');
    sharp(filePath)
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        resolve({ data, width: info.width, height: info.height, channels: info.channels });
      })
      .catch(() => resolve(null));
  });
}

function measureFrameTransform(img, w, h, expectedScale, expectedCx, expectedCy) {
  const { data, width, height, channels } = img;
  if (width !== w || height !== h) return null;
  
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      gray[y * width + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }
  
  const corners = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: 0, y: height - 1 },
    { x: width - 1, y: height - 1 }
  ];
  
  let sumX = 0, sumY = 0, sumW = 0;
  for (const c of corners) {
    const idx = Math.round(c.y) * width + Math.round(c.x);
    if (idx >= 0 && idx < gray.length) {
      const val = gray[idx];
      sumX += c.x * val;
      sumY += c.y * val;
      sumW += val;
    }
  }
  
  if (sumW === 0) return null;
  
  const cx = sumX / sumW / width;
  const cy = sumY / sumW / height;
  const scale = 1.0;
  
  return { scale, cx, cy };
}

async function renderOne(effect, imagePath, format, state, method) {
  const { w, h } = getFormatDims(format);
  const key = `${effect.id}:${format}:${method}`;
  const outputPath = path.join(OUTPUT_DIR, state[key].fileName);
  
  console.log(`\n[${effect.id}] Rendering ${effect.displayName} (${w}x${h}) method=${method}...`);
  const start = Date.now();
  
  try {
    const scene = { duration: SCENE_DURATION };
    const focus = { x: 0.5, y: 0.5, scale: 1 };
    const options = {
      zoomType: effect.id,
      zoomStartScale: ZOOM_V3.ZOOM_MOTION_SPECS[effect.id].defaultStartScale,
      zoomIntensity: ZOOM_V3.ZOOM_MOTION_SPECS[effect.id].defaultIntensity,
      zoomMode: 'fixed',
      zoomSeed: ZOOM_V3.DEFAULT_ZOOM_SEED,
      zoomCheckedEffects: []
    };
    
    const zoomFilter = ZOOM_V3.buildZoomFilterV3(scene, w, h, options, focus, method);
    
    let filterGraph;
    if (method === 'perspective' || method === 'rotate-scale') {
      filterGraph = `[0:v]${zoomFilter},setsar=1,format=yuv420p[vout]`;
    } else {
      filterGraph = `[0:v]${zoomFilter},setsar=1,format=yuv420p[vout]`;
    }
    
    const args = [
      '-y',
      '-framerate', String(FPS),
      '-loop', '1',
      '-t', String(SCENE_DURATION),
      '-i', imagePath,
      '-filter_complex', filterGraph,
      '-map', '[vout]',
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
    
    const probe = await probeVideo(outputPath);
    const jitter = await measureJitter(outputPath, format, effect.id);
    
    const specHash = ZOOM_V3.hashSpec(effect.id, ZOOM_V3.ZOOM_MOTION_SPECS[effect.id].defaultIntensity, ZOOM_V3.ZOOM_MOTION_SPECS[effect.id].defaultStartScale, method);
    
    state[key] = {
      ...state[key],
      status: 'pendiente',
      renderSeconds: Number(renderSeconds.toFixed(2)),
      maxDeviationPx: jitter.maxDeviationPx >= 0 ? Number(jitter.maxDeviationPx.toFixed(4)) : null,
      meanDeviationPx: jitter.meanDeviationPx >= 0 ? Number(jitter.meanDeviationPx.toFixed(4)) : null,
      stutters: jitter.stutterCount >= 0 ? jitter.stutterCount : null,
      nonMonotone: jitter.nonMonotoneCount >= 0 ? jitter.nonMonotoneCount : null,
      repeatedFrames: probe.repeatedFrames,
      frameTimingDeviation: Number(probe.maxDeviation.toFixed(6)),
      actualFps: Number(probe.fps.toFixed(2)),
      totalFrames: probe.frames,
      specHash
    };
    saveState(state);
    
    console.log(`  Done in ${renderSeconds.toFixed(2)}s | maxDev: ${jitter.maxDeviationPx >= 0 ? jitter.maxDeviationPx.toFixed(4) : 'N/A'} | meanDev: ${jitter.meanDeviationPx >= 0 ? jitter.meanDeviationPx.toFixed(4) : 'N/A'} | stutters: ${jitter.stutterCount >= 0 ? jitter.stutterCount : 'N/A'} | non-mono: ${jitter.nonMonotoneCount >= 0 ? jitter.nonMonotoneCount : 'N/A'} | repFrames: ${probe.repeatedFrames} | fps: ${probe.fps.toFixed(2)}`);
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
      repeatedFrames: null,
      frameTimingDeviation: null,
      actualFps: null,
      totalFrames: null
    };
    saveState(state);
    return false;
  }
}

async function verifyApprovedUnchanged(state, catalog, format, method) {
  const approved = catalog.filter(t => state[`${t.id}:${format}:${method}`]?.status === 'aprobada');
  for (const t of approved) {
    const key = `${t.id}:${format}:${method}`;
    const entry = state[key];
    const currentHash = ZOOM_V3.hashSpec(t.id, ZOOM_V3.ZOOM_MOTION_SPECS[t.id].defaultIntensity, ZOOM_V3.ZOOM_MOTION_SPECS[t.id].defaultStartScale, method);
    if (currentHash !== entry.specHash) {
      console.error(`\n⚠️  SPEC HASH CHANGED for ${t.id} (${t.displayName})!`);
      console.error(`  Old: ${entry.specHash}`);
      console.error(`  New: ${currentHash}`);
      console.error(`  Reverting render...`);
      entry.status = 'corregir';
      entry.note = 'specHash changed after approval';
      saveState(state);
      return false;
    }
    
    const outputPath = path.join(OUTPUT_DIR, entry.fileName);
    const probe = await probeVideo(outputPath);
    if (probe.repeatedFrames !== entry.repeatedFrames || 
        Math.abs(probe.maxDeviation - entry.frameTimingDeviation) > 0.001) {
      console.error(`\n⚠️  FRAME TIMING CHANGED for ${t.id} (${t.displayName})!`);
      console.error(`  Old repeatedFrames: ${entry.repeatedFrames}, New: ${probe.repeatedFrames}`);
      console.error(`  Old maxDeviation: ${entry.frameTimingDeviation}, New: ${probe.maxDeviation}`);
      console.error(`  Reverting render...`);
      entry.status = 'corregir';
      entry.note = 'frame timing changed after approval';
      saveState(state);
      return false;
    }
  }
  return true;
}

function generateIndexHtml(state, catalog, format, method) {
  const { w, h } = getFormatDims(format);
  const rows = catalog.map((t, idx) => {
    const key = `${t.id}:${format}:${method}`;
    const s = state[key];
    const fileName = s.fileName;
    const statusClass = s.status === 'aprobada' ? 'approved' : (s.status === 'corregir' ? 'fix' : 'pending');
    const statusText = s.status === 'aprobada' ? '✅ Aprobada' : (s.status === 'corregir' ? '❌ Corregir' : '⏳ Pendiente');
    const note = s.note ? `<br><small class="note">${s.note}</small>` : '';
    const renderTime = s.renderSeconds ? `${s.renderSeconds}s` : '—';
    const maxDev = s.maxDeviationPx != null ? s.maxDeviationPx.toFixed(4) : '—';
    const meanDev = s.meanDeviationPx != null ? s.meanDeviationPx.toFixed(4) : '—';
    const stutters = s.stutters != null ? s.stutters : '—';
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
        <td>
          <video controls loop muted preload="metadata" style="width: 320px; height: auto;">
            <source src="${fileName}" type="video/mp4">
            Tu navegador no soporta video.
          </video>
        </td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zoom Lab - ${w}x${h} @ 30fps (${method})</title>
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
  <h1>Zoom Lab — ${w}×${h} @ 30fps (${method})</h1>
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
        <th>Preview</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="summary">
    <strong>Resumen:</strong>
    ${catalog.map(t => {
      const key = `${t.id}:${format}:${method}`;
      const s = state[key];
      return `<div>${t.id} (${t.displayName}): ${s.status} — ${s.renderSeconds || '—'}s — maxDev: ${s.maxDeviationPx ?? '—'} — meanDev: ${s.meanDeviationPx ?? '—'} — stutters: ${s.stutters ?? '—'} — nonMono: ${s.nonMonotone ?? '—'}</div>`;
    }).join('')}
    <div class="legend">
      <span><span class="dot approved"></span> Aprobada</span>
      <span><span class="dot fix"></span> Corregir</span>
      <span><span class="dot pending"></span> Pendiente</span>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(INDEX_FILE, html, 'utf-8');
  console.log(`\n📄 Index written to ${INDEX_FILE}`);
}

function printTable(state, catalog, format, method) {
  console.log('\n┌──┬─────────────────┬──────────────────────┬────────────┬──────────┬────────────┬────────────┬──────────┐');
  console.log('│ #│ ID              │ Display Name         │ Status     │ Render s │ Max Dev px │ Mean Dev px│ Stutters │');
  console.log('├──┼─────────────────┼──────────────────────┼────────────┼──────────┼────────────┼────────────┼──────────┤');
  catalog.forEach((t, idx) => {
    const key = `${t.id}:${format}:${method}`;
    const s = state[key];
    const status = s.status === 'aprobada' ? '✅ aprobada' : (s.status === 'corregir' ? '❌ corregir' : '⏳ pendiente');
    const render = s.renderSeconds ? s.renderSeconds.toFixed(2) : '—';
    const maxDev = s.maxDeviationPx != null ? s.maxDeviationPx.toFixed(4) : '—';
    const meanDev = s.meanDeviationPx != null ? s.meanDeviationPx.toFixed(4) : '—';
    const stutters = s.stutters != null ? s.stutters : '—';
    console.log(`│${String(idx+1).padStart(2)}│ ${t.id.padEnd(15)} │ ${t.displayName.padEnd(20)} │ ${status.padEnd(10)} │ ${render.padStart(8)} │ ${maxDev.padStart(10)} │ ${meanDev.padStart(10)} │ ${String(stutters).padStart(8)} │`);
  });
  console.log('└──┴─────────────────┴──────────────────────┴────────────┴──────────┴────────────┴────────────┴──────────┘');
}

async function generateGridImage() {
  if (fs.existsSync(GRID_IMAGE) && fs.existsSync(GRID_MARKERS)) {
    console.log('Grid image and markers already exist');
    return;
  }
  
  fs.mkdirSync(GRID_DIR, { recursive: true });
  
  const w = 3840;
  const h = 2160;
  const cellSize = 120;
  const markerSize = 20;
  
  const filter = `
    color=c=black:s=${w}x${h}:d=1,
    drawgrid=w=${cellSize}:h=${cellSize}:c=white@0.3:t=2,
    drawtext=fontfile='C:/Windows/Fonts/arial.ttf':text='%{n}':fontsize=24:fontcolor=white:x=(w-tw)/2:y=(h-th)/2
  `.replace(/\s+/g, ' ').trim();
  
  const cmd = [
    getFfmpegPath(), '-y',
    '-f', 'lavfi',
    '-i', filter,
    '-frames:v', '1',
    '-pix_fmt', 'rgb24',
    GRID_IMAGE
  ];
  
  await runFfmpeg(cmd);
  
  const markers = {};
  const cols = Math.floor(w / cellSize);
  const rows = Math.floor(h / cellSize);
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize + cellSize / 2;
      const name = `m${row}_${col}`;
      markers[name] = [cx, cy];
    }
  }
  
  fs.writeFileSync(GRID_MARKERS, JSON.stringify({ grid: markers }, null, 2));
  console.log(`Generated grid image with ${Object.keys(markers).length} markers`);
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',');
  const all = args.includes('--all');
  const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || '16:9';
  const list = args.includes('--list');
  const method = args.find(a => a.startsWith('--method='))?.split('=')[1] || 'upscale-crop-downscale';
  const imageArg = args.find(a => a.startsWith('--image='))?.split('=')[1];
  const imageIndex = imageArg ? parseInt(imageArg, 10) - 1 : 0;
  
  if (!['16:9', '9:16'].includes(format)) {
    console.error('Invalid format. Use 16:9 or 9:16');
    process.exit(1);
  }
  if (!['upscale-crop-downscale', 'perspective', 'rotate-scale'].includes(method)) {
    console.error('Invalid method. Use upscale-crop-downscale, perspective, or rotate-scale');
    process.exit(1);
  }
  if (isNaN(imageIndex) || imageIndex < 0 || imageIndex > 1) {
    console.error('Invalid image index. Use 1 or 2');
    process.exit(1);
  }
  
  await generateGridImage();
  
  const catalog = ZOOM_V3.getZoomCatalog().filter(t => t.id !== 'none');
  
  if (list) {
    console.log('\nAvailable zoom effects:');
    catalog.forEach((t, i) => {
      console.log(`  ${String(i+1).padStart(2)}. ${t.id.padEnd(12)} ${t.displayName} (intensity: ${t.defaultIntensity}, startScale: ${t.defaultStartScale})`);
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
  console.log(`🔧 Method: ${method}`);
  
  const state = initState(catalog, format, method);
  
  if (!all && !only) {
    console.log('\nNo action specified. Use --all to render all, --only=id1,id2 to render specific, or --list to list effects.');
    printTable(state, catalog, format, method);
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
  
  for (const effect of toRender) {
    await renderOne(effect, imagePath, format, state, method);
  }
  
  const allOk = await verifyApprovedUnchanged(state, catalog, format, method);
  if (!allOk) {
    console.log('\n⚠️  Some approved effects changed. They have been marked for re-render.');
  }
  
  generateIndexHtml(state, catalog, format, method);
  printTable(state, catalog, format, method);
  
  const pending = catalog.filter(t => state[`${t.id}:${format}:${method}`]?.status === 'pendiente').length;
  const approved = catalog.filter(t => state[`${t.id}:${format}:${method}`]?.status === 'aprobada').length;
  const fix = catalog.filter(t => state[`${t.id}:${format}:${method}`]?.status === 'corregir').length;
  
  console.log(`\n📊 Summary: ${approved} aprobada, ${pending} pendiente, ${fix} corregir`);
  console.log(`📁 Clips folder: ${OUTPUT_DIR}`);
  console.log(`📄 Index: ${INDEX_FILE}`);
  console.log(`📋 State: ${STATE_FILE}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});