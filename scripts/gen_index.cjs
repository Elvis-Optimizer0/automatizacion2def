#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

const OUTPUT_DIR = 'C:\\Users\\zyrothx\\Documents\\laboratorio\\zoom';
const STATE_FILE = path.join(OUTPUT_DIR, 'estado.json');
const INDEX_FILE = path.join(OUTPUT_DIR, 'index.html');
const FORMAT = '16:9';

function getFfmpegPath() { return ffmpegStatic; }

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.on('close', code => code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg code ${code}`)));
    proc.on('error', err => reject(new Error(`spawn: ${err.message}`)));
  });
}

async function generateThumbnail(videoPath, outPath, atSec) {
  await runFfmpeg(['-y', '-i', videoPath, '-ss', String(atSec), '-frames:v', '1', outPath]);
}

const ZOOM_V3 = require('../app/core/zoom-v3.js');

function getFormatDims(format) {
  if (format === '9:16') return { w: 1080, h: 1920 };
  return { w: 1920, h: 1080 };
}

(async () => {
  const { w, h } = getFormatDims(FORMAT);
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  const catalog = ZOOM_V3.getZoomCatalog();

  const thumbDir = path.join(OUTPUT_DIR, 'thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });

  console.log('Generating thumbnails...');
  for (const t of catalog) {
    const key = `${t.id}:${FORMAT}`;
    const s = state[key];
    if (!s || !s.fileName) continue;
    const videoPath = path.join(OUTPUT_DIR, s.fileName);
    if (!fs.existsSync(videoPath)) continue;
    try {
      await generateThumbnail(videoPath, path.join(thumbDir, `${t.id}-thumb1.png`), 0);
      await generateThumbnail(videoPath, path.join(thumbDir, `${t.id}-thumb2.png`), 3);
      await generateThumbnail(videoPath, path.join(thumbDir, `${t.id}-thumb3.png`), 5.9);
      console.log(`  ${t.id}: thumbnails done`);
    } catch (err) {
      console.error(`  ${t.id}: failed - ${err.message}`);
    }
  }

  const rows = catalog.map((t, idx) => {
    const key = `${t.id}:${FORMAT}`;
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
    Source images: escena1.jpg, escena2.jpg<br>
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
    const key = `${t.id}:${FORMAT}`;
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

  fs.writeFileSync(INDEX_FILE, html, 'utf-8');
  console.log(`\n📄 Index written to ${INDEX_FILE}`);

  console.log('\n┌──┬─────────────────┬──────────────────────┬────────────┬──────────┬────────────┬────────────┬──────────┬──────────┐');
  console.log('│ #│ ID              │ Display Name         │ Status     │ Render s │ Max Dev px │ Mean Dev px│ Stutters │ Motion   │');
  console.log('├──┼─────────────────┼──────────────────────┼────────────┼──────────┼────────────┼────────────┼──────────┼──────────┤');
  catalog.forEach((t, idx) => {
    const key = `${t.id}:${FORMAT}`;
    const s = state[key];
    const status = s.status === 'aprobada' ? '✅ aprobada' : (s.status === 'corregir' ? '❌ corregir' : '⏳ pendiente');
    const render = s.renderSeconds ? s.renderSeconds.toFixed(2) : '—';
    const maxDev = s.maxDeviationPx != null ? s.maxDeviationPx.toFixed(4) : '—';
    const meanDev = s.meanDeviationPx != null ? s.meanDeviationPx.toFixed(4) : '—';
    const stutters = s.stutters != null ? s.stutters : '—';
    const motion = s.motionPresent != null ? (s.motionPresent ? '✅ sí' : '❌ no') : '—';
    console.log(`│${String(idx+1).padStart(2)}│ ${t.id.padEnd(15)} │ ${t.displayName.padEnd(20)} │ ${status.padEnd(10)} │ ${render.padStart(8)} │ ${maxDev.padStart(10)} │ ${meanDev.padStart(10)} │ ${String(stutters).padStart(8)} │ ${motion.padStart(8)} │`);
  });
  console.log('└──┴─────────────────┴──────────────────────┴────────────┴──────────┴────────────┴────────────┴──────────┴──────────┘');

  const approved = catalog.filter(t => state[`${t.id}:${FORMAT}`]?.status === 'aprobada').length;
  const pending = catalog.filter(t => state[`${t.id}:${FORMAT}`]?.status === 'pendiente').length;
  const fix = catalog.filter(t => state[`${t.id}:${FORMAT}`]?.status === 'corregir').length;
  console.log(`\n📊 Summary: ${approved} aprobada, ${pending} pendiente, ${fix} corregir`);
  console.log(`📁 Clips folder: ${OUTPUT_DIR}`);
})();
