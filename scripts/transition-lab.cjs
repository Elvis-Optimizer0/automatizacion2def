#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TRANSITIONS_V2 = require('../app/core/transitions-v2.js');

const IMAGES_DIR = 'C:\\Users\\zyrothx\\Documents\\imagenes prueba';
const OUTPUT_DIR = 'C:\\Users\\zyrothx\\Documents\\laboratorio';
const STATE_FILE = path.join(OUTPUT_DIR, 'estado.json');
const INDEX_FILE = path.join(OUTPUT_DIR, 'index.html');

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const VERTICAL_WIDTH = 1080;
const VERTICAL_HEIGHT = 1920;
const SCENE_DURATION = 2.0;
const DEFAULT_SLIDE_SPEED = 1.05;

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

function initState(catalog, format, slideSpeed = DEFAULT_SLIDE_SPEED) {
  const state = loadState();
  const changed = catalog.some(t => !state[`${t.id}:${format}`]);
  if (changed || !Object.keys(state).length) {
    catalog.forEach((t, idx) => {
      const key = `${t.id}:${format}`;
      if (!state[key]) {
        const specHash = TRANSITIONS_V2.isSlidingTransition(t.id)
          ? TRANSITIONS_V2.hashSpec(t.id, slideSpeed)
          : TRANSITIONS_V2.hashSpec(t.id);
        state[key] = {
          status: 'pendiente',
          note: '',
          specHash,
          renderSeconds: null,
          repeatedFrames: null,
          maxDeviation: null,
          format,
          fileName: `${String(idx + 1).padStart(2, '0')}-${t.id}-${TRANSITIONS_V2.sanitizeFileName(t.displayName)}-${format.replace(':', '')}.mp4`
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

async function renderOne(transition, imageA, imageB, format, state, slideSpeed = DEFAULT_SLIDE_SPEED) {
  const { w, h } = getFormatDims(format);
  const key = `${transition.id}:${format}`;
  const outputPath = path.join(OUTPUT_DIR, state[key].fileName);
  
  console.log(`\n[${transition.id}] Rendering ${transition.displayName} (${w}x${h}) slideSpeed=${slideSpeed}...`);
  const start = Date.now();
  
  try {
    await TRANSITIONS_V2.renderTransitionClip(transition.id, imageA, imageB, outputPath, {
      w, h,
      sceneDuration: SCENE_DURATION,
      transitionDuration: TRANSITIONS_V2.TRANSITION_DEFAULTS[transition.id] || 1.0,
      fitMode: 'cover',
      frameColor: '#000000',
      backgroundMode: 'color',
      backgroundColor: '#000000',
      focus: { x: 0.5, y: 0.5, scale: 1 },
      slideSpeed: TRANSITIONS_V2.isSlidingTransition(transition.id) ? slideSpeed : undefined
    });
    
    const renderSeconds = (Date.now() - start) / 1000;
    
    const probe = await probeVideo(outputPath);
    const repeatedFrames = probe.repeatedFrames;
    const maxDeviation = probe.maxDeviation;
    
    const specHash = TRANSITIONS_V2.isSlidingTransition(transition.id) 
      ? TRANSITIONS_V2.hashSpec(transition.id, slideSpeed)
      : TRANSITIONS_V2.hashSpec(transition.id);
    
    state[key] = {
      ...state[key],
      status: 'pendiente',
      renderSeconds: Number(renderSeconds.toFixed(2)),
      repeatedFrames,
      maxDeviation: Number(maxDeviation.toFixed(4)),
      specHash
    };
    saveState(state);
    
    console.log(`  Done in ${renderSeconds.toFixed(2)}s | repeatedFrames: ${repeatedFrames} | maxDeviation: ${maxDeviation.toFixed(4)}`);
    return true;
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    state[key] = {
      ...state[key],
      status: 'corregir',
      note: err.message,
      renderSeconds: null,
      repeatedFrames: null,
      maxDeviation: null
    };
    saveState(state);
    return false;
  }
}

async function probeVideo(videoPath) {
  const ffprobeStatic = require('ffprobe-static');
  const { spawn } = require('child_process');
  
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
        resolve({ repeatedFrames: -1, maxDeviation: -1 });
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
      
      resolve({ repeatedFrames, maxDeviation });
    });
    proc.on('error', err => resolve({ repeatedFrames: -1, maxDeviation: -1 }));
  });
}

async function verifyApprovedUnchanged(state, catalog, format, slideSpeed = DEFAULT_SLIDE_SPEED) {
  const approved = catalog.filter(t => state[`${t.id}:${format}`]?.status === 'aprobada');
  for (const t of approved) {
    const key = `${t.id}:${format}`;
    const entry = state[key];
    const currentHash = TRANSITIONS_V2.isSlidingTransition(t.id)
      ? TRANSITIONS_V2.hashSpec(t.id, slideSpeed)
      : TRANSITIONS_V2.hashSpec(t.id);
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
        Math.abs(probe.maxDeviation - entry.maxDeviation) > 0.001) {
      console.error(`\n⚠️  FRAME CONTENT CHANGED for ${t.id} (${t.displayName})!`);
      console.error(`  Old repeatedFrames: ${entry.repeatedFrames}, New: ${probe.repeatedFrames}`);
      console.error(`  Old maxDeviation: ${entry.maxDeviation}, New: ${probe.maxDeviation}`);
      console.error(`  Reverting render...`);
      entry.status = 'corregir';
      entry.note = 'frame content changed after approval';
      saveState(state);
      return false;
    }
  }
  return true;
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
    return `
      <tr class="${statusClass}">
        <td>${idx + 1}</td>
        <td>${t.id}</td>
        <td>${t.displayName}</td>
        <td>${statusText}${note}</td>
        <td>${renderTime}</td>
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
  <title>Transition Lab - ${w}x${h} @ 30fps</title>
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
  <h1>Transition Lab — ${w}×${h} @ 30fps</h1>
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
      const key = `${t.id}:${format}`;
      const s = state[key];
      return `<div>${t.id} (${t.displayName}): ${s.status} — ${s.renderSeconds || '—'}s — repFrames: ${s.repeatedFrames ?? '—'} — maxDev: ${s.maxDeviation ?? '—'}</div>`;
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

function printTable(state, catalog, format) {
  console.log('\n┌──┬─────────────────┬──────────────────────┬────────────┬──────────┬──────────────┬─────────────┐');
  console.log('│ #│ ID              │ Display Name         │ Status     │ Render s │ Rep Frames   │ Max Deviation │');
  console.log('├──┼─────────────────┼──────────────────────┼────────────┼──────────┼──────────────┼─────────────┤');
  catalog.forEach((t, idx) => {
    const key = `${t.id}:${format}`;
    const s = state[key];
    const status = s.status === 'aprobada' ? '✅ aprobada' : (s.status === 'corregir' ? '❌ corregir' : '⏳ pendiente');
    const render = s.renderSeconds ? s.renderSeconds.toFixed(2) : '—';
    const rep = s.repeatedFrames != null ? s.repeatedFrames : '—';
    const dev = s.maxDeviation != null ? s.maxDeviation.toFixed(4) : '—';
    console.log(`│${String(idx+1).padStart(2)}│ ${t.id.padEnd(15)} │ ${t.displayName.padEnd(20)} │ ${status.padEnd(10)} │ ${render.padStart(8)} │ ${String(rep).padStart(12)} │ ${dev.padStart(13)} │`);
  });
  console.log('└──┴─────────────────┴──────────────────────┴────────────┴──────────┴──────────────┴─────────────┘');
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',');
  const all = args.includes('--all');
  const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || '16:9';
  const list = args.includes('--list');
  const slideSpeedArg = args.find(a => a.startsWith('--slide-speed='))?.split('=')[1];
  const slideSpeed = slideSpeedArg ? parseFloat(slideSpeedArg) : DEFAULT_SLIDE_SPEED;
  
  if (!['16:9', '9:16'].includes(format)) {
    console.error('Invalid format. Use 16:9 or 9:16');
    process.exit(1);
  }
  if (isNaN(slideSpeed) || slideSpeed < 0.7 || slideSpeed > 2.0) {
    console.error('Invalid slide-speed. Use a value between 0.7 and 2.0 (e.g., 1.05 for +5%)');
    process.exit(1);
  }

  const catalog = TRANSITIONS_V2.getTransitionCatalog();
  
  if (list) {
    console.log('\nAvailable transitions:');
    catalog.forEach((t, i) => {
      const sliding = t.isSliding ? ' [SLIDING]' : '';
      console.log(`  ${String(i+1).padStart(2)}. ${t.id.padEnd(12)} ${t.displayName} (xfade: ${t.xfadeName}, default: ${t.defaultDuration}s)${sliding}`);
    });
    console.log(`\nTotal: ${catalog.length} transitions\n`);
    return;
  }

  const images = getInputImages();
  console.log(`\n📸 Input images: ${images.map(p => path.basename(p)).join(', ')}`);
  console.log(`📁 Output dir: ${OUTPUT_DIR}`);
  console.log(`📐 Format: ${format} (${getFormatDims(format).w}x${getFormatDims(format).h})`);
  console.log(`🎬 Scene duration: ${SCENE_DURATION}s`);
  console.log(`⚡ Slide speed: ${slideSpeed} (${((slideSpeed - 1) * 100).toFixed(0)}%)`);

  const state = initState(catalog, format, slideSpeed);
  
  if (!all && !only) {
    console.log('\nNo action specified. Use --all to render all, --only=id1,id2 to render specific, or --list to list transitions.');
    printTable(state, catalog, format);
    return;
  }

  const toRender = only 
    ? catalog.filter(t => only.includes(t.id))
    : catalog;

  if (only) {
    const missing = only.filter(id => !catalog.find(t => t.id === id));
    if (missing.length) {
      console.error(`Unknown transition IDs: ${missing.join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`\n🎬 Rendering ${toRender.length} transition(s)...`);
  
  for (const transition of toRender) {
    await renderOne(transition, images[0], images[1], format, state, slideSpeed);
  }

  const allOk = await verifyApprovedUnchanged(state, catalog, format, slideSpeed);
  if (!allOk) {
    console.log('\n⚠️  Some approved transitions changed. They have been marked for re-render.');
  }

  generateIndexHtml(state, catalog, format);
  printTable(state, catalog, format);

  const pending = catalog.filter(t => state[`${t.id}:${format}`]?.status === 'pendiente').length;
  const approved = catalog.filter(t => state[`${t.id}:${format}`]?.status === 'aprobada').length;
  const fix = catalog.filter(t => state[`${t.id}:${format}`]?.status === 'corregir').length;
  
  console.log(`\n📊 Summary: ${approved} aprobada, ${pending} pendiente, ${fix} corregir`);
  console.log(`📁 Clips folder: ${OUTPUT_DIR}`);
  console.log(`📄 Index: ${INDEX_FILE}`);
  console.log(`📋 State: ${STATE_FILE}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});