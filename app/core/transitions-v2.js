const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ffmpegStatic = require('ffmpeg-static');

const FPS = 30;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_SLIDE_SPEED = 1.05;

const TRANSITION_CATALOG = [
  { id: 'cut', displayName: 'Corte', xfadeName: 'fade', defaultDuration: 1/FPS, isCut: true, isSliding: false },
  { id: 'fade', displayName: 'Fundido', xfadeName: 'fade', defaultDuration: 1.0, isCut: false, isSliding: false },
  { id: 'fadeblack', displayName: 'Fundido a Negro', xfadeName: 'fadeblack', defaultDuration: 1.0, isCut: false, isSliding: false },
  { id: 'dissolve', displayName: 'Disoluci\u00f3n', xfadeName: 'dissolve', defaultDuration: 1.0, isCut: false, isSliding: false },
  { id: 'slideLeft', displayName: 'Deslizar Izquierda', xfadeName: 'slideleft', defaultDuration: 1.0, isCut: false, isSliding: true },
  { id: 'slideRight', displayName: 'Deslizar Derecha', xfadeName: 'slideright', defaultDuration: 1.0, isCut: false, isSliding: true },
  { id: 'slideUp', displayName: 'Deslizar Arriba', xfadeName: 'slideup', defaultDuration: 1.0, isCut: false, isSliding: true },
  { id: 'slideDown', displayName: 'Deslizar Abajo', xfadeName: 'slidedown', defaultDuration: 1.0, isCut: false, isSliding: true },
  { id: 'curtainLeft', displayName: 'Cortina Izquierda', xfadeName: 'wipeleft', defaultDuration: 1.0, isCut: false, isSliding: true },
  { id: 'curtainRight', displayName: 'Cortina Derecha', xfadeName: 'wiperight', defaultDuration: 1.0, isCut: false, isSliding: true },
  { id: 'circle', displayName: 'C\u00edrculo', xfadeName: 'circleopen', defaultDuration: 1.0, isCut: false, isSliding: false }
];

const TRANSITION_IDS = TRANSITION_CATALOG.map(t => t.id);
const TRANSITION_MAP = Object.fromEntries(TRANSITION_CATALOG.map(t => [t.id, t.xfadeName]));
const TRANSITION_DEFAULTS = Object.fromEntries(TRANSITION_CATALOG.map(t => [t.id, t.defaultDuration]));
const SLIDING_TRANSITION_IDS = TRANSITION_CATALOG.filter(t => t.isSliding).map(t => t.id);

const EASING = {
  linear: p => p,
  easeInQuad: p => p * p,
  easeOutQuad: p => 1 - (1 - p) * (1 - p),
  easeInOutQuad: p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2,
  easeInCubic: p => p * p * p,
  easeOutCubic: p => 1 - Math.pow(1 - p, 3),
  easeInOutCubic: p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  smoothstep: p => 3 * p * p - 2 * p * p * p,
  smootherstep: p => 6 * p * p * p * p * p - 15 * p * p * p * p + 10 * p * p * p
};

const MOTION_SPECS = {
  cut: { easing: 'linear', params: {} },
  fade: { easing: 'smoothstep', params: { opacity: { from: 1, to: 0 } } },
  fadeblack: { easing: 'smoothstep', params: { opacity: { from: 1, to: 0 }, fadeToBlack: true } },
  dissolve: { easing: 'smoothstep', params: { opacity: { from: 1, to: 0 }, crossDissolve: true } },
  slideLeft: { easing: 'easeOutQuad', params: { x: { from: 0, to: -1 }, direction: 'left' } },
  slideRight: { easing: 'easeOutQuad', params: { x: { from: 0, to: 1 }, direction: 'right' } },
  slideUp: { easing: 'easeOutQuad', params: { y: { from: 0, to: -1 }, direction: 'up' } },
  slideDown: { easing: 'easeOutQuad', params: { y: { from: 0, to: 1 }, direction: 'down' } },
  curtainLeft: { easing: 'easeInOutQuad', params: { wipe: { from: 0, to: 1 }, direction: 'left' } },
  curtainRight: { easing: 'easeInOutQuad', params: { wipe: { from: 0, to: 1 }, direction: 'right' } },
  circle: { easing: 'easeInOutQuad', params: { radius: { from: 0, to: 1 }, shape: 'circle' } }
};

function getTransitionCatalog() {
  return TRANSITION_CATALOG.map(t => ({
    id: t.id,
    displayName: t.displayName,
    xfadeName: t.xfadeName,
    defaultDuration: t.defaultDuration,
    isCut: t.isCut,
    isSliding: t.isSliding
  }));
}

function getMotionSpec(transitionId) {
  const spec = MOTION_SPECS[transitionId];
  if (!spec) return MOTION_SPECS.fade;
  return { ...spec };
}

function isSlidingTransition(transitionId) {
  return SLIDING_TRANSITION_IDS.includes(transitionId);
}

function num(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
}

function clamp01(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function clampScale(value) {
  if (typeof value !== 'number' || isNaN(value)) return 1;
  return Math.min(3, Math.max(0.3, value));
}

function safeColor(color) {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return 'black';
}

function backgroundModeFor(mode) {
  const BACKGROUND_MODES = ['color', 'blur', 'frame'];
  return BACKGROUND_MODES.includes(mode) ? mode : 'color';
}

function getFfmpegPath() {
  return ffmpegStatic;
}

function buildSceneFilter(sceneIndex, w, h, fitMode = 'cover', frameColor = '#000000', backgroundMode = 'color', backgroundColor = '#000000', focus = { x: 0.5, y: 0.5, scale: 1 }) {
  const fx = num(clamp01(focus.x));
  const fy = num(clamp01(focus.y));
  const scale = clampScale(focus.scale);

  let filter = '';
  if (fitMode === 'blur') {
    const radius = Math.max(2, Math.round(Math.min(w, h) / 20));
    filter = `split=2[bg${sceneIndex}][fg${sceneIndex}];` +
      `[bg${sceneIndex}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=luma_radius=${radius}:luma_power=2[bgf${sceneIndex}];` +
      `[fg${sceneIndex}]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs${sceneIndex}];` +
      `[bgf${sceneIndex}][fgs${sceneIndex}]overlay=(W-w)/2:(H-h)/2[base${sceneIndex}]`;
  } else if (fitMode === 'frame') {
    filter = `scale=${w}:-2[scaled${sceneIndex}];` +
      `[scaled${sceneIndex}]pad=${w}:${h}:0:oh/2-ih/2:color=${frameColor}[base${sceneIndex}]`;
  } else if (scale < 1) {
    const sw = num(w * scale);
    const sh = num(h * scale);
    if (backgroundMode === 'blur') {
      const radius = Math.max(2, Math.round(Math.min(w, h) / 20));
      filter = `split=2[zbg${sceneIndex}][zfg${sceneIndex}];` +
        `[zbg${sceneIndex}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=luma_radius=${radius}:luma_power=2[zbase${sceneIndex}];` +
        `[zfg${sceneIndex}]scale=${sw}:${sh}:force_original_aspect_ratio=increase[zscaled${sceneIndex}];` +
        `[zbase${sceneIndex}][zscaled${sceneIndex}]overlay=x='(W-w)*${fx}':y='(H-h)*${fy}'[base${sceneIndex}]`;
    } else {
      filter = `scale=${sw}:${sh}:force_original_aspect_ratio=increase[zscaled${sceneIndex}];` +
        `[zscaled${sceneIndex}]pad=w='max(${w},iw)':h='max(${h},ih)':x='max(0,(max(${w},iw)-iw)*${fx})':y='max(0,(max(${h},ih)-ih)*${fy})':color=${backgroundColor}[zpad${sceneIndex}];` +
        `[zpad${sceneIndex}]crop=${w}:${h}:(iw-ow)*${fx}:(ih-oh)*${fy}[base${sceneIndex}]`;
    }
  } else {
    const sw = num(w * scale);
    const sh = num(h * scale);
    filter = `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-ow)*${fx}:(ih-oh)*${fy}[base${sceneIndex}]`;
  }
  filter += `;[base${sceneIndex}]setsar=1,format=yuv420p[v${sceneIndex}]`;
  return filter;
}

function buildSlideTransitionFilter(transitionId, w, h, transDur, offset, slideSpeed = DEFAULT_SLIDE_SPEED) {
  const spec = MOTION_SPECS[transitionId];
  const direction = spec.params.direction;

  let xExpr, yExpr;

  if (direction === 'left') {
    xExpr = `min(0, -W * min(1, (t-${offset})/${transDur} * ${slideSpeed}))`;
    yExpr = '0';
  } else if (direction === 'right') {
    xExpr = `max(0, W * (1 - min(1, (t-${offset})/${transDur} * ${slideSpeed})))`;
    yExpr = '0';
  } else if (direction === 'up') {
    xExpr = '0';
    yExpr = `min(0, -H * min(1, (t-${offset})/${transDur} * ${slideSpeed}))`;
  } else if (direction === 'down') {
    xExpr = '0';
    yExpr = `max(0, H * (1 - min(1, (t-${offset})/${transDur} * ${slideSpeed})))`;
  }

  return `overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${offset},${num(offset + transDur)})'`;
}

function buildCurtainTransitionFilter(transitionId, w, h, transDur, offset, slideSpeed = DEFAULT_SLIDE_SPEED) {
  const spec = MOTION_SPECS[transitionId];
  const direction = spec.params.direction;

  let xExpr, yExpr;

  if (direction === 'left') {
    xExpr = `min(0, -W * min(1, (t-${offset})/${transDur} * ${slideSpeed}))`;
    yExpr = '0';
  } else if (direction === 'right') {
    xExpr = `max(0, W * (1 - min(1, (t-${offset})/${transDur} * ${slideSpeed})))`;
    yExpr = '0';
  }

  return `overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${offset},${num(offset + transDur)})'`;
}

function buildCustomTransitionFilter(transitionId, w, h, transDur, offset, slideSpeed = DEFAULT_SLIDE_SPEED) {
  if (['slideLeft', 'slideRight', 'slideUp', 'slideDown'].includes(transitionId)) {
    return buildSlideTransitionFilter(transitionId, w, h, transDur, offset, slideSpeed);
  }
  if (['curtainLeft', 'curtainRight'].includes(transitionId)) {
    return buildCurtainTransitionFilter(transitionId, w, h, transDur, offset, slideSpeed);
  }
  return null;
}

/**
 * Build a proper sliding transition filter graph segment that replicates xfade behavior
 * but with slideSpeed support. This creates a complete filter chain for a single
 * sliding transition between two scenes that correctly handles duration.
 * 
 * @param {string} transitionType - The sliding transition type
 * @param {number} w - Output width
 * @param {number} h - Output height
 * @param {number} transDur - Transition duration
 * @param {number} offset - Transition start offset (cumulative scene duration)
 * @param {number} slideSpeed - Slide speed multiplier (default 1.05)
 * @param {number} durA - Duration of scene A (first scene)
 * @param {number} durB - Duration of scene B (second scene)
 * @param {number} sceneAIndex - Index of scene A
 * @param {number} sceneBIndex - Index of scene B
 * @param {string} currentLabel - Current filter label
 * @param {string} nextLabel - Next filter label
 * @returns {string} Filter graph segment
 */
function buildSlidingTransitionSegment(transitionType, w, h, transDur, offset, slideSpeed, durA, durB, sceneAIndex, sceneBIndex, currentLabel, nextLabel) {
  const effectiveSlideDur = num(transDur / slideSpeed);
  const holdDur = num(transDur - effectiveSlideDur);
  
  const spec = MOTION_SPECS[transitionType];
  const direction = spec.params.direction;
  
  let xExpr, yExpr;
  if (direction === 'left') {
    xExpr = `min(0, -W * min(1, t/${effectiveSlideDur} * ${slideSpeed}))`;
    yExpr = '0';
  } else if (direction === 'right') {
    xExpr = `max(0, W * (1 - min(1, t/${effectiveSlideDur} * ${slideSpeed}))) `;
    yExpr = '0';
  } else if (direction === 'up') {
    xExpr = '0';
    yExpr = `min(0, -H * min(1, t/${effectiveSlideDur} * ${slideSpeed}))`;
  } else if (direction === 'down') {
    xExpr = '0';
    yExpr = `max(0, H * (1 - min(1, t/${effectiveSlideDur} * ${slideSpeed}))) `;
  }
  
  // Build a complete filter chain for this transition that replicates xfade behavior:
  // 1. Scene A without transition extension (trim to durA)
  // 2. Scene A transition part (last transDur seconds)
  // 3. Scene B transition part (first transDur seconds)
  // 4. Overlay with slide during effectiveSlideDur, then hold
  // 5. Concat: Scene A + transition
  // 6. Scene B remaining (after transition)
  
  const sceneALabel = `v${sceneAIndex}`;
  const sceneBLabel = `v${sceneBIndex}`;
  const baseALabel = `a${sceneAIndex}`;
  const transALabel = `ta${sceneAIndex}`;
  const transBLabel = `tb${sceneBIndex}`;
  const overlayLabel = `ov${sceneAIndex}`;
  const concat1Label = `c1_${sceneAIndex}`;
  const remBLabel = `rb${sceneAIndex}`;
  const concat2Label = nextLabel;
  
  const parts = [];
  
  // Scene A without transition extension (0 to durA)
  parts.push(`[${sceneALabel}]trim=0:${num(durA)}[${baseALabel}]`);
  
  // Scene A transition part (durA to durA + transDur)
  parts.push(`[${sceneALabel}]trim=${num(durA)}:${num(durA + transDur)},setpts=PTS-STARTPTS[${transALabel}]`);
  
  // Scene B transition part (0 to transDur)
  parts.push(`[${sceneBLabel}]trim=0:${num(transDur)},setpts=PTS-STARTPTS[${transBLabel}]`);
  
  // Overlay with slide during effectiveSlideDur, then hold
  parts.push(`[${transALabel}][${transBLabel}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,0,${num(transDur)})'[${overlayLabel}]`);
  
  // Concat: Scene A base + transition
  parts.push(`[${baseALabel}][${overlayLabel}]concat=n=2:v=1:a=0[${concat1Label}]`);
  
  // Scene B remaining (after transition)
  if (durB > transDur) {
    parts.push(`[${concat1Label}][${sceneBLabel}]trim=${num(transDur)}:${num(durB)},setpts=PTS-STARTPTS[${remBLabel}]`);
    parts.push(`[${concat1Label}][${remBLabel}]concat=n=2:v=1:a=0[${nextLabel}]`);
  } else {
    // If durB <= transDur, Scene B is fully consumed by transition
    parts.push(`[${concat1Label}]copy[${nextLabel}]`);
  }
  
  return parts.join(';');
}

function resolveBoundaryTypes(scenes, options = {}) {
  const { transitionType = 'fade', transitionMode = 'fixed', transitionSeed } = options;
  const types = [];
  for (let i = 1; i < scenes.length; i++) {
    const override = scenes[i] && scenes[i].transition && scenes[i].transition.type;
    types[i] = TRANSITION_IDS.includes(override)
      ? override
      : resolveTransitionType(transitionType, transitionMode, i - 1, transitionSeed);
  }
  return types;
}

function resolveTransitionType(baseType, mode, index, seed) {
  const base = TRANSITION_IDS.includes(baseType) ? baseType : 'fade';
  if (mode === 'random') {
    const r = seededRandom(seed != null ? seed : 4242, index);
    const randomTypes = TRANSITION_IDS.filter(t => t !== 'cut');
    return randomTypes[Math.floor(r * randomTypes.length) % randomTypes.length];
  }
  if (mode === 'alternate') {
    const opposite = {
      slideLeft: 'slideRight', slideRight: 'slideLeft',
      slideUp: 'slideDown', slideDown: 'slideUp',
      curtainLeft: 'curtainRight', curtainRight: 'curtainLeft',
      fade: 'dissolve', dissolve: 'fade',
      fadeblack: 'fade', circle: 'fade'
    };
    return index % 2 === 0 ? base : (opposite[base] || base);
  }
  return base;
}

function seededRandom(seed, index) {
  let t = ((Number(seed) >>> 0) + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  t ^= t >>> 15;
  return (t >>> 0) / 4294967296;
}

function transitionDurationFor(scenes, i, transitionType, transitionDuration) {
  if (transitionType === 'cut') return num(1 / FPS);
  const prevDur = scenes[i - 1].duration;
  const currDur = scenes[i].duration;
  return num(Math.min(transitionDuration, prevDur / 2, currDur / 2));
}

function resolveInputDurations(scenes, options = {}) {
  const boundaryTypes = resolveBoundaryTypes(scenes, options);
  const transitionDuration = options.transitionDuration != null ? options.transitionDuration : 1.0;
  return scenes.map((scene, i) => {
    if (i >= scenes.length - 1) return num(scene.duration);
    const transDur = transitionDurationFor(scenes, i + 1, boundaryTypes[i + 1], transitionDuration);
    return num(scene.duration + transDur);
  });
}

function buildXfadeFilter(currentLabel, nextLabel, outputLabel, transitionType, duration, offset) {
  const xfadeName = TRANSITION_MAP[transitionType] || 'fade';
  return `[${currentLabel}][${nextLabel}]xfade=transition=${xfadeName}:duration=${duration}:offset=${offset}[${outputLabel}]`;
}

async function renderSceneToIntermediate(imagePath, w, h, duration, sceneIndex, options, workDir) {
  const outputPath = path.join(workDir, `scene_${sceneIndex}_${crypto.randomBytes(4).toString('hex')}.mp4`);
  const filter = buildSceneFilter(sceneIndex, w, h, options.fitMode, options.frameColor, options.backgroundMode, options.backgroundColor, options.focus);
  const inputDuration = options.inputDurations[sceneIndex];

  const args = [
    '-y',
    '-framerate', String(FPS),
    '-loop', '1',
    '-t', String(inputDuration),
    '-i', imagePath,
    '-filter_complex', filter,
    '-map', `[v${sceneIndex}]`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-an',
    '-movflags', '+faststart',
    outputPath
  ];

  await runFfmpeg(args, inputDuration);
  return { path: outputPath, duration: duration };
}

async function renderTransitionClip(transitionId, imageA, imageB, outputPath, options = {}) {
  const {
    w = DEFAULT_WIDTH,
    h = DEFAULT_HEIGHT,
    sceneDuration = 2.0,
    transitionDuration = TRANSITION_DEFAULTS[transitionId] || 1.0,
    fitMode = 'cover',
    frameColor = '#000000',
    backgroundMode = 'color',
    backgroundColor = '#000000',
    focus = { x: 0.5, y: 0.5, scale: 1 },
    slideSpeed = DEFAULT_SLIDE_SPEED,
    workDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'transitions-lab-'))
  } = options;

  const catalogEntry = TRANSITION_CATALOG.find(t => t.id === transitionId);
  if (!catalogEntry) throw new Error(`Unknown transition: ${transitionId}`);

  const transDur = catalogEntry.isCut ? num(1/FPS) : num(Math.min(transitionDuration, sceneDuration / 2));
  const totalDuration = num(sceneDuration * 2 + transDur);

  const sceneA = { duration: sceneDuration };
  const sceneB = { duration: sceneDuration };
  const scenes = [sceneA, sceneB];

  const inputDurations = [
    num(sceneDuration + transDur),
    num(sceneDuration)
  ];

  const sceneAPath = path.join(workDir, `sceneA_${crypto.randomBytes(4).toString('hex')}.mp4`);
  const sceneBPath = path.join(workDir, `sceneB_${crypto.randomBytes(4).toString('hex')}.mp4`);

  const filterA = buildSceneFilter(0, w, h, fitMode, frameColor, backgroundMode, backgroundColor, focus);
  const filterB = buildSceneFilter(1, w, h, fitMode, frameColor, backgroundMode, backgroundColor, focus);

  await Promise.all([
    runFfmpeg([
      '-y', '-framerate', String(FPS), '-loop', '1', '-t', String(inputDurations[0]),
      '-i', imageA, '-filter_complex', filterA, '-map', '[v0]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-movflags', '+faststart', sceneAPath
    ], inputDurations[0]),
    runFfmpeg([
      '-y', '-framerate', String(FPS), '-loop', '1', '-t', String(inputDurations[1]),
      '-i', imageB, '-filter_complex', filterB, '-map', '[v1]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-movflags', '+faststart', sceneBPath
    ], inputDurations[1])
  ]);

  if (catalogEntry.isCut) {
    const concatFile = path.join(workDir, 'concat.txt');
    fs.writeFileSync(concatFile, `file '${sceneAPath.replace(/\\/g, '\\\\')}'\nfile '${sceneBPath.replace(/\\/g, '\\\\')}'`);
    await runFfmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', concatFile,
      '-c', 'copy', '-movflags', '+faststart', outputPath
    ], totalDuration);
  } else if (isSlidingTransition(transitionId)) {
    const offset = num(sceneDuration);
    const customFilter = buildCustomTransitionFilter(transitionId, w, h, transDur, offset, slideSpeed);
    await runFfmpeg([
      '-y', '-i', sceneAPath, '-i', sceneBPath,
      '-filter_complex', customFilter,
      '-map', '[vout]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-movflags', '+faststart', outputPath
    ], totalDuration);
  } else {
    const offset = num(sceneDuration);
    const filter = buildXfadeFilter('0:v', '1:v', 'vout', transitionId, transDur, offset);
    await runFfmpeg([
      '-y', '-i', sceneAPath, '-i', sceneBPath,
      '-filter_complex', filter,
      '-map', '[vout]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-movflags', '+faststart', outputPath
    ], totalDuration);
  }

  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (err) { /* ignore cleanup error */ }
  return { outputPath, duration: totalDuration, transitionDuration: transDur };
}

async function runFfmpeg(args, expectedDuration) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', err => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
  });
}

function transitionBoundaries(timeline, options = {}) {
  const { transitionType = 'fade', transitionMode = 'fixed', transitionSeed, transitionDuration = 1.0 } = options;
  const boundaries = [];
  let accumulated = 0;
  const boundaryTypes = resolveBoundaryTypes(timeline, options);
  
  for (let i = 1; i < timeline.length; i++) {
    accumulated += timeline[i - 1].duration;
    const transDur = transitionDurationFor(timeline, i, boundaryTypes[i], transitionDuration);
    boundaries.push({
      index: i,
      startSec: num(accumulated),
      durationSec: num(transDur),
      type: boundaryTypes[i]
    });
  }
  return boundaries;
}

function calculateTotalDuration(scenes) {
  return num(scenes.reduce((sum, s) => sum + s.duration, 0));
}

function normalizeScenesToDuration(scenes, targetDuration) {
  const total = scenes.reduce((sum, s) => sum + s.duration, 0);
  if (!targetDuration || targetDuration <= 0 || total <= 0) {
    let cursor = 0;
    return scenes.map((scene) => {
      const start = num(cursor);
      const duration = num(scene.duration);
      cursor = num(cursor + duration);
      return { ...scene, start, duration };
    });
  }
  const scale = targetDuration / total;
  let accumulated = 0;
  return scenes.map((scene, index) => {
    const isLast = index === scenes.length - 1;
    const duration = isLast ? num(targetDuration - accumulated) : num(scene.duration * scale);
    const normalized = { ...scene, start: num(accumulated), duration };
    accumulated += duration;
    return normalized;
  });
}

function hashSpec(transitionId, slideSpeed = DEFAULT_SLIDE_SPEED) {
  const spec = MOTION_SPECS[transitionId];
  const str = JSON.stringify(spec) + transitionId + (isSlidingTransition(transitionId) ? slideSpeed : '');
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function sanitizeFileName(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

module.exports = {
  FPS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_SLIDE_SPEED,
  TRANSITION_CATALOG,
  TRANSITION_IDS,
  TRANSITION_MAP,
  TRANSITION_DEFAULTS,
  SLIDING_TRANSITION_IDS,
  EASING,
  MOTION_SPECS,
  getTransitionCatalog,
  getMotionSpec,
  isSlidingTransition,
  num,
  getFfmpegPath,
  buildSceneFilter,
  buildSlideTransitionFilter,
  buildCurtainTransitionFilter,
  buildCustomTransitionFilter,
  buildSlidingTransitionSegment,
  resolveBoundaryTypes,
  resolveTransitionType,
  seededRandom,
  transitionDurationFor,
  resolveInputDurations,
  buildXfadeFilter,
  renderSceneToIntermediate,
  renderTransitionClip,
  runFfmpeg,
  transitionBoundaries,
  calculateTotalDuration,
  normalizeScenesToDuration,
  hashSpec,
  sanitizeFileName,
  safeColor,
  clampScale,
  clamp01,
  backgroundModeFor
};