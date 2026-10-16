const {
  assertOutputConfig,
  DEFAULT_FOCUS,
  DEFAULT_SCALE,
  SCALE_MIN,
  SCALE_MAX,
  BACKGROUND_MODES
} = require('./output-formats.js');

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

const FIT_MODES = ['cover', 'blur', 'frame'];

const ZOOM_TYPES = ['none', 'kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown'];
const ZOOM_MODES = ['fixed', 'alternate', 'random'];
const RANDOM_ZOOM_TYPES = ['kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown'];
const ZOOM_OPPOSITE = {
  zoomIn: 'zoomOut',
  zoomOut: 'zoomIn',
  panLeft: 'panRight',
  panRight: 'panLeft',
  panUp: 'panDown',
  panDown: 'panUp'
};
const DEFAULT_ZOOM_SEED = 12345;

function fixAsarPath(p) {
  return p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
}

function num(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
}

function clamp01(value) {
  if (typeof value !== 'number' || isNaN(value)) return DEFAULT_FOCUS.x;
  return Math.min(1, Math.max(0, value));
}

function clampScale(value) {
  if (typeof value !== 'number' || isNaN(value)) return DEFAULT_SCALE;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
}

function backgroundModeFor(mode) {
  return BACKGROUND_MODES.includes(mode) ? mode : BACKGROUND_MODES[0];
}

function safeColor(color) {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return 'black';
}

function transitionDurationFor(scenes, i, transitionType, transitionDuration) {
  if (transitionType === 'cut') {
    return num(1 / FPS);
  }
  const prevDur = scenes[i - 1].duration;
  const currDur = scenes[i].duration;
  return num(Math.min(transitionDuration, prevDur / 2, currDur / 2));
}

function sceneInputDuration(scenes, i, transitionType, transitionDuration) {
  const base = scenes[i].duration;
  if (i >= scenes.length - 1) {
    return num(base);
  }
  const transDur = transitionDurationFor(scenes, i + 1, transitionType, transitionDuration);
  return num(base + transDur);
}

function seededRandom(seed, index) {
  let t = ((Number(seed) >>> 0) + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  t ^= t >>> 15;
  return (t >>> 0) / 4294967296;
}

function resolveZoomType(baseType, mode, index, seed) {
  const base = ZOOM_TYPES.includes(baseType) ? baseType : 'kenburns';
  if (mode === 'random') {
    const r = seededRandom(seed != null ? seed : DEFAULT_ZOOM_SEED, index);
    return RANDOM_ZOOM_TYPES[Math.floor(r * RANDOM_ZOOM_TYPES.length) % RANDOM_ZOOM_TYPES.length];
  }
  if (mode === 'alternate') {
    return index % 2 === 0 ? base : (ZOOM_OPPOSITE[base] || base);
  }
  return base;
}

function buildZoomFilter(scene, w, h, options, focus) {
  const type = ZOOM_TYPES.includes(options.zoomType) ? options.zoomType : 'kenburns';
  if (type === 'none') return '';

  const start = num(options.zoomStartScale != null ? options.zoomStartScale : 1.0);
  const intensity = num(options.zoomIntensity != null ? options.zoomIntensity : 0.15);
  const frames = Math.max(1, Math.round(scene.duration * FPS));
  const maxZoom = num(start + intensity);
  const around = num(start + intensity / 2);
  const fx = num(clamp01(focus.x));
  const fy = num(clamp01(focus.y));

  const progress = `on/${frames}`;
  const xCenter = `iw*${fx}-iw/zoom/2`;
  const yCenter = `ih*${fy}-ih/zoom/2`;
  const clampX = (expr) => `max(0,min(iw-iw/zoom,${expr}))`;
  const clampY = (expr) => `max(0,min(ih-ih/zoom,${expr}))`;
  const zIn = `min(${start}+${intensity}*${progress},${maxZoom})`;
  const zOut = `max(${maxZoom}-${intensity}*${progress},${start})`;
  const zPulse = `${around}-${num(intensity / 2)}*cos(2*PI*${progress})`;

  let zExpr = zIn;
  let xExpr = xCenter;
  let yExpr = yCenter;

  if (type === 'zoomOut') {
    zExpr = zOut;
  } else if (type === 'pulse') {
    zExpr = zPulse;
  } else if (type === 'kenburns') {
    zExpr = zIn;
    xExpr = `iw*${fx}-iw/zoom/2+(iw-iw/zoom)*(${progress}-0.5)`;
    yExpr = `ih*${fy}-ih/zoom/2+(ih-ih/zoom)*(${progress}-0.5)`;
  } else if (type === 'panLeft') {
    zExpr = `${maxZoom}`;
    xExpr = `(iw-iw/zoom)*(1-${progress})`;
  } else if (type === 'panRight') {
    zExpr = `${maxZoom}`;
    xExpr = `(iw-iw/zoom)*${progress}`;
  } else if (type === 'panUp') {
    zExpr = `${maxZoom}`;
    yExpr = `(ih-ih/zoom)*(1-${progress})`;
  } else if (type === 'panDown') {
    zExpr = `${maxZoom}`;
    yExpr = `(ih-ih/zoom)*${progress}`;
  }

  return `zoompan=z='${zExpr}':d=1:x='${clampX(xExpr)}':y='${clampY(yExpr)}':s=${w}x${h}:fps=${FPS}`;
}

function buildSceneVideoFilter(scene, index, options = {}) {
  const outputConfig = assertOutputConfig(options.outputConfig);
  const fitMode = FIT_MODES.includes(options.fitMode) ? options.fitMode : 'cover';
  const frameColor = safeColor(options.frameColor);
  const backgroundMode = backgroundModeFor(options.backgroundMode);
  const backgroundColor = safeColor(options.backgroundColor);
  const focus = scene.focus && typeof scene.focus === 'object' ? scene.focus : DEFAULT_FOCUS;
  const scale = clampScale(focus.scale);

  const w = outputConfig.w;
  const h = outputConfig.h;
  const fx = num(clamp01(focus.x));
  const fy = num(clamp01(focus.y));

  const parts = [];
  let baseLabel;

  if (fitMode === 'blur') {
    const radius = Math.max(2, Math.round(Math.min(w, h) / 20));
    parts.push(`[${index}:v]split=2[bg${index}][fg${index}]`);
    parts.push(`[bg${index}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=luma_radius=${radius}:luma_power=2[bgf${index}]`);
    parts.push(`[fg${index}]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs${index}]`);
    parts.push(`[bgf${index}][fgs${index}]overlay=(W-w)/2:(H-h)/2[base${index}]`);
    baseLabel = `base${index}`;
  } else if (fitMode === 'frame') {
    const widthExpr = `${w}:-2`;
    parts.push(`[${index}:v]scale=${widthExpr}[scaled${index}]`);
    parts.push(`[scaled${index}]pad=${w}:${h}:0:oh/2-ih/2:color=${frameColor}[base${index}]`);
    baseLabel = `base${index}`;
  } else if (scale < 1) {
    const sw = num(w * scale);
    const sh = num(h * scale);
    if (backgroundMode === 'blur') {
      const radius = Math.max(2, Math.round(Math.min(w, h) / 20));
      parts.push(`[${index}:v]split=2[zbg${index}][zfg${index}]`);
      parts.push(`[zbg${index}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=luma_radius=${radius}:luma_power=2[zbase${index}]`);
      parts.push(`[zfg${index}]scale=${sw}:${sh}:force_original_aspect_ratio=increase[zscaled${index}]`);
      parts.push(`[zbase${index}][zscaled${index}]overlay=x='(W-w)*${fx}':y='(H-h)*${fy}'[base${index}]`);
    } else {
      parts.push(`[${index}:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase[zscaled${index}]`);
      parts.push(`[zscaled${index}]pad=w='max(${w},iw)':h='max(${h},ih)':x='max(0,(max(${w},iw)-iw)*${fx})':y='max(0,(max(${h},ih)-ih)*${fy})':color=${backgroundColor}[zpad${index}]`);
      parts.push(`[zpad${index}]crop=${w}:${h}:(iw-ow)*${fx}:(ih-oh)*${fy}[base${index}]`);
    }
    baseLabel = `base${index}`;
  } else {
    const sw = num(w * scale);
    const sh = num(h * scale);
    parts.push(`[${index}:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-ow)*${fx}:(ih-oh)*${fy}[base${index}]`);
    baseLabel = `base${index}`;
  }

  const chain = [];
  const sceneZoom = scene.zoom && typeof scene.zoom === 'object' ? scene.zoom : {};
  const zoomOptions = {
    ...options,
    zoomType: sceneZoom.type || options.zoomType,
    zoomStartScale: sceneZoom.startScale != null ? sceneZoom.startScale : options.zoomStartScale,
    zoomIntensity: sceneZoom.intensity != null ? sceneZoom.intensity : options.zoomIntensity
  };
  const zoomType = resolveZoomType(zoomOptions.zoomType, options.zoomMode, index, options.zoomSeed);
  if (options.zoomEnabled && zoomType !== 'none') {
    chain.push(buildZoomFilter(scene, w, h, { ...zoomOptions, zoomType }, focus));
  }
  chain.push('setsar=1');
  chain.push('format=yuv420p');
  parts.push(`[${baseLabel}]${chain.join(',')}[v${index}]`);

  return parts.join(';');
}

function buildVideoFilterGraph(scenes, options = {}) {
  assertOutputConfig(options.outputConfig);

  const {
    transitionType = 'fade',
    transitionDuration = 1.0
  } = options;

  const n = scenes.length;
  if (n === 0) return '';

  const parts = scenes.map((scene, index) => buildSceneVideoFilter(scene, index, options));

  if (n === 1) {
    parts.push('[v0]copy[vout]');
    return parts.join(';');
  }

  let currentLabel = 'v0';
  let accumulated = 0;

  for (let i = 1; i < n; i++) {
    accumulated += scenes[i - 1].duration;
    const transDur = transitionDurationFor(scenes, i, transitionType, transitionDuration);
    const offset = num(accumulated);
    parts.push(`[${currentLabel}][v${i}]xfade=transition=fade:duration=${transDur}:offset=${offset}[x${i}]`);
    currentLabel = `x${i}`;
  }

  parts.push(`[${currentLabel}]copy[vout]`);
  return parts.join(';');
}

function buildAudioFilterGraph(options = {}) {
  const {
    inputCount = 0,
    hasMusic = false,
    totalDuration,
    musicVolume = 0.3
  } = options;

  if (inputCount <= 0) return '';

  const narrationIndex = inputCount;
  const trimEnd = num(totalDuration);
  const parts = [];

  if (hasMusic) {
    const musicIndex = inputCount + 1;
    parts.push(`[${narrationIndex}:a]volume=1.0[narr]`);
    parts.push(`[${musicIndex}:a]volume=${num(musicVolume)}[mus]`);
    parts.push(`[narr][mus]amix=inputs=2:duration=first:dropout_transition=0,atrim=0:${trimEnd},asetpts=N/SR/TB[aout]`);
  } else {
    parts.push(`[${narrationIndex}:a]atrim=0:${trimEnd},asetpts=N/SR/TB[aout]`);
  }

  return parts.join(';');
}

function buildFullFilterGraph(scenes, options = {}) {
  assertOutputConfig(options.outputConfig);

  const { hasMusic = false, totalDuration, musicVolume = 0.3 } = options;
  const videoGraph = buildVideoFilterGraph(scenes, options);
  const audioGraph = buildAudioFilterGraph({
    inputCount: scenes.length,
    hasMusic,
    totalDuration,
    musicVolume
  });

  if (!videoGraph) return audioGraph;
  if (!audioGraph) return videoGraph;
  return `${videoGraph};${audioGraph}`;
}

function validateOffsets(scenes, _transitionType = 'fade', _transitionDuration = 1.0) {
  const offsets = [];
  let accumulated = 0;

  for (let i = 1; i < scenes.length; i++) {
    accumulated += scenes[i - 1].duration;
    offsets.push(num(accumulated));
  }

  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] <= 0) return { valid: false, offsets };
    if (i > 0 && offsets[i] <= offsets[i - 1]) return { valid: false, offsets };
  }

  return { valid: true, offsets };
}

function calculateTotalDuration(scenes) {
  return num(scenes.reduce((sum, s) => sum + s.duration, 0));
}

function normalizeScenesToDuration(scenes, targetDuration) {
  const total = scenes.reduce((sum, s) => sum + s.duration, 0);
  if (!targetDuration || targetDuration <= 0 || total <= 0) {
    return scenes.map(s => ({ ...s }));
  }

  const scale = targetDuration / total;
  let accumulated = 0;

  return scenes.map((scene, index) => {
    const isLast = index === scenes.length - 1;
    const duration = isLast ? num(targetDuration - accumulated) : num(scene.duration * scale);
    const normalized = {
      ...scene,
      start: num(accumulated),
      duration
    };
    accumulated += duration;
    return normalized;
  });
}

module.exports = {
  FPS,
  WIDTH,
  HEIGHT,
  FIT_MODES,
  ZOOM_TYPES,
  ZOOM_MODES,
  DEFAULT_ZOOM_SEED,
  fixAsarPath,
  num,
  clamp01,
  clampScale,
  resolveZoomType,
  seededRandom,
  safeColor,
  transitionDurationFor,
  sceneInputDuration,
  buildZoomFilter,
  buildSceneVideoFilter,
  buildVideoFilterGraph,
  buildAudioFilterGraph,
  buildFullFilterGraph,
  validateOffsets,
  calculateTotalDuration,
  normalizeScenesToDuration
};
