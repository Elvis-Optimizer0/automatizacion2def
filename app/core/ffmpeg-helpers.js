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
// ZOOM_MODES: 'fixed' = one effect for all scenes (Fijo)
// 'alternate' = flip opposites on odd scenes (existing)
// 'random' = random from all RANDOM_ZOOM_TYPES (existing)
// 'checked' = random from user-checked effects, no repeats (Aleatorio)
const ZOOM_MODES = ['fixed', 'alternate', 'random', 'checked'];
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

const TRANSITION_MAP = {
  cut: 'fade',
  fade: 'fade',
  fadeblack: 'fadeblack',
  dissolve: 'dissolve',
  slideLeft: 'slideleft',
  slideRight: 'slideright',
  slideUp: 'slideup',
  slideDown: 'slidedown',
  curtainLeft: 'wipeleft',
  curtainRight: 'wiperight',
  circle: 'circleopen'
};
const TRANSITION_TYPES = Object.keys(TRANSITION_MAP);
const TRANSITION_MODES = ['fixed', 'alternate', 'random'];
const RANDOM_TRANSITION_TYPES = TRANSITION_TYPES.filter((t) => t !== 'cut');
const TRANSITION_OPPOSITE = {
  slideLeft: 'slideRight',
  slideRight: 'slideLeft',
  slideUp: 'slideDown',
  slideDown: 'slideUp',
  curtainLeft: 'curtainRight',
  curtainRight: 'curtainLeft',
  fade: 'dissolve',
  dissolve: 'fade',
  fadeblack: 'fade',
  circle: 'fade'
};
const XFADE_TRANSITIONS = [
  'fade', 'fadeblack', 'fadewhite', 'distance', 'wipeleft', 'wiperight',
  'wipeup', 'wipedown', 'slideleft', 'slideright', 'slideup', 'slidedown',
  'smoothleft', 'smoothright', 'smoothup', 'smoothdown', 'circlecrop',
  'rectcrop', 'circleopen', 'circleclose', 'vertopen', 'vertclose',
  'horzopen', 'horzclose', 'dissolve', 'pixelize', 'diagtl', 'diagtr',
  'diagbl', 'diagbr', 'hlslice', 'hrslice', 'vuslice', 'vdslice',
  'fadegrays', 'wipetl', 'wipetr', 'wipebl', 'wipebr', 'squeezeh',
  'squeezev'
];
const DEFAULT_TRANSITION_SEED = 4242;

function xfadeNameFor(type) {
  return TRANSITION_MAP[type] || TRANSITION_MAP.fade;
}

function resolveTransitionType(baseType, mode, index, seed) {
  const base = TRANSITION_TYPES.includes(baseType) ? baseType : 'fade';
  if (mode === 'random') {
    const r = seededRandom(seed != null ? seed : DEFAULT_TRANSITION_SEED, index);
    return RANDOM_TRANSITION_TYPES[Math.floor(r * RANDOM_TRANSITION_TYPES.length) % RANDOM_TRANSITION_TYPES.length];
  }
  if (mode === 'alternate') {
    return index % 2 === 0 ? base : (TRANSITION_OPPOSITE[base] || base);
  }
  return base;
}

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

function resolveBoundaryTypes(scenes, options = {}) {
  const {
    transitionType = 'fade',
    transitionMode = 'fixed',
    transitionSeed
  } = options;
  const types = [];
  for (let i = 1; i < scenes.length; i++) {
    const override = scenes[i] && scenes[i].transition && scenes[i].transition.type;
    types[i] = TRANSITION_TYPES.includes(override)
      ? override
      : resolveTransitionType(transitionType, transitionMode, i - 1, transitionSeed);
  }
  return types;
}

function resolveInputDurations(scenes, options = {}) {
  const boundaryTypes = resolveBoundaryTypes(scenes, options);
  const transitionDuration = options.transitionDuration != null ? options.transitionDuration : 1.0;
  return scenes.map((scene, i) => {
    if (i >= scenes.length - 1) {
      return num(scene.duration);
    }
    const transDur = transitionDurationFor(scenes, i + 1, boundaryTypes[i + 1], transitionDuration);
    return num(scene.duration + transDur);
  });
}

function seededRandom(seed, index) {
  let t = ((Number(seed) >>> 0) + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  t ^= t >>> 15;
  return (t >>> 0) / 4294967296;
}

function resolveZoomType(baseType, mode, index, seed, checkedEffects) {
  const base = ZOOM_TYPES.includes(baseType) ? baseType : 'kenburns';
  if (mode === 'random') {
    const r = seededRandom(seed != null ? seed : DEFAULT_ZOOM_SEED, index);
    return RANDOM_ZOOM_TYPES[Math.floor(r * RANDOM_ZOOM_TYPES.length) % RANDOM_ZOOM_TYPES.length];
  }
  if (mode === 'alternate') {
    return index % 2 === 0 ? base : (ZOOM_OPPOSITE[base] || base);
  }
  if (mode === 'checked') {
    const checked = Array.isArray(checkedEffects) && checkedEffects.length > 0
      ? checkedEffects.filter(t => RANDOM_ZOOM_TYPES.includes(t))
      : RANDOM_ZOOM_TYPES;
    if (checked.length === 0) return base;
    if (checked.length === 1) return checked[0];
    // Pick from checked effects, avoiding same as previous scene
    const r = seededRandom(seed != null ? seed : DEFAULT_ZOOM_SEED, index);
    let pick = checked[Math.floor(r * checked.length) % checked.length];
    if (index > 0) {
      const prevR = seededRandom(seed != null ? seed : DEFAULT_ZOOM_SEED, index - 1);
      const prevPick = checked[Math.floor(prevR * checked.length) % checked.length];
      if (pick === prevPick) {
        // Shift to next effect in checked list
        const idx = checked.indexOf(pick);
        pick = checked[(idx + 1) % checked.length];
      }
    }
    return pick;
  }
  return base;
}

// Zoom filter v2: uses sub-pixel precise crop on upscaled source with continuous time and smoothstep easing
function buildZoomFilterV2(scene, w, h, options, focus) {
  const type = ZOOM_TYPES.includes(options.zoomType) ? options.zoomType : 'kenburns';
  if (type === 'none') return '';

  const start = num(options.zoomStartScale != null ? options.zoomStartScale : 1.0);
  const intensity = num(options.zoomIntensity != null ? options.zoomIntensity : 0.15);
  const duration = num(scene.duration);
  const maxZoom = num(start + intensity);
  const around = num(start + intensity / 2);
  const fx = num(clamp01(focus.x));
  const fy = num(clamp01(focus.y));

  // Upscale factor: 3x for quality/speed balance
  const UPSCALE = 3;
  const uw = w * UPSCALE;
  const uh = h * UPSCALE;

  // Smoothstep easing: 3t^2 - 2t^3 for t in [0,1]
  const ease = `t/${duration}`;
  const smooth = `3*${ease}*${ease}-2*${ease}*${ease}*${ease}`;

  // Zoom expression using continuous time with smoothstep
  let zExpr;
  if (type === 'zoomOut') {
    zExpr = `${maxZoom}-${intensity}*${smooth}`;
  } else if (type === 'pulse') {
    zExpr = `${around}-${num(intensity / 2)}*cos(2*PI*t/${duration})`;
  } else if (type === 'kenburns') {
    zExpr = `${start}+${intensity}*${smooth}`;
  } else {
    // panLeft, panRight, panUp, panDown, zoomIn all use maxZoom or start+intensity*smooth
    zExpr = type === 'zoomIn' ? `${start}+${intensity}*${smooth}` : `${maxZoom}`;
  }
  zExpr = `min(max(${zExpr},${start}),${maxZoom})`;

  // Center position expressions (in upscaled coordinates)
  // For kenburns: pan from center toward focus point
  // For pans: pan across the image at constant zoom
  let cxExpr, cyExpr;
  const ufx = fx * uw;
  const ufy = fy * uh;
  const ucenter_x = uw / 2;
  const ucenter_y = uh / 2;

  if (type === 'kenburns') {
    // Pan from center toward focus point as we zoom in
    cxExpr = `${ucenter_x}+(${ufx}-${ucenter_x})*${smooth}`;
    cyExpr = `${ucenter_y}+(${ufy}-${ucenter_y})*${smooth}`;
  } else if (type === 'panLeft') {
    cxExpr = `${uw}-${w}/${maxZoom}/2+(${w}/${maxZoom}/2-${uw}+${w}/${maxZoom}/2)*${smooth}`; // right to left
    cyExpr = `${ucenter_y}`;
  } else if (type === 'panRight') {
    cxExpr = `${w}/${maxZoom}/2+(${uw}-${w}/${maxZoom}/2-${w}/${maxZoom}/2)*${smooth}`; // left to right
    cyExpr = `${ucenter_y}`;
  } else if (type === 'panUp') {
    cxExpr = `${ucenter_x}`;
    cyExpr = `${uh}-${h}/${maxZoom}/2+(${h}/${maxZoom}/2-${uh}+${h}/${maxZoom}/2)*${smooth}`; // bottom to top
  } else if (type === 'panDown') {
    cxExpr = `${ucenter_x}`;
    cyExpr = `${h}/${maxZoom}/2+(${uh}-${h}/${maxZoom}/2-${h}/${maxZoom}/2)*${smooth}`; // top to bottom
  } else { // zoomIn, zoomOut, pulse
    cxExpr = `${ufx}`;
    cyExpr = `${ufy}`;
  }

  // Crop dimensions (sub-pixel precise)
  const cropW = `iw/${zExpr}`;
  const cropH = `ih/${zExpr}`;
  const cropX = `max(0,min(iw-${cropW},${cxExpr}-${cropW}/2))`;
  const cropY = `max(0,min(ih-${cropH},${cyExpr}-${cropH}/2))`;

  // Filter chain: upscale -> crop (zoom/pan) -> downscale -> format
  // We use scale with lanczos for both up and down
  return `scale=${uw}:${uh}:flags=lanczos,crop=w='${cropW}':h='${cropH}':x='${cropX}':y='${cropY}',scale=${w}:${h}:flags=lanczos`;
}

// Legacy buildZoomFilter kept for compatibility - delegates to v2
function buildZoomFilter(scene, w, h, options, focus) {
  return buildZoomFilterV2(scene, w, h, options, focus);
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
  const zoomType = resolveZoomType(zoomOptions.zoomType, options.zoomMode, index, options.zoomSeed, options.zoomCheckedEffects);
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
    transitionDuration = 1.0
  } = options;

  const n = scenes.length;
  if (n === 0) return '';

  const finalLabel = options.finalVideoLabel || 'vout';
  const parts = scenes.map((scene, index) => buildSceneVideoFilter(scene, index, options));

  if (n === 1) {
    parts.push(`[v0]copy[${finalLabel}]`);
    return parts.join(';');
  }

  let currentLabel = 'v0';
  let accumulated = 0;
  const boundaryTypes = resolveBoundaryTypes(scenes, options);

  for (let i = 1; i < n; i++) {
    accumulated += scenes[i - 1].duration;
    const transDur = transitionDurationFor(scenes, i, boundaryTypes[i], transitionDuration);
    const offset = num(accumulated);
    parts.push(`[${currentLabel}][v${i}]xfade=transition=${xfadeNameFor(boundaryTypes[i])}:duration=${transDur}:offset=${offset}[x${i}]`);
    currentLabel = `x${i}`;
  }

  parts.push(`[${currentLabel}]copy[${finalLabel}]`);
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

function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '\\\'')
    .replace(/%/g, '\\%')
    .replace(/\n/g, '\\n');
}

function escapeFilterPath(filePath) {
  return String(filePath).replace(/\\/g, '/').replace(/:/g, '\\:');
}

function hexToDraw(color) {
  const safe = safeColor(color);
  return `0x${safe.slice(1)}`;
}

function badgePosition(position, w, h, pad) {
  switch (position) {
  case 'topLeft': return { x: `${pad}`, y: `${pad}` };
  case 'bottomLeft': return { x: `${pad}`, y: `${h}-th-${pad}` };
  case 'bottomRight': return { x: `${w}-tw-${pad}`, y: `${h}-th-${pad}` };
  case 'topRight':
  default: return { x: `${w}-tw-${pad}`, y: `${pad}` };
  }
}

function hasExtras(extras) {
  if (!extras || typeof extras !== 'object') return false;
  const badge = extras.badge || {};
  const lowerThird = extras.lowerThird || {};
  const progressBar = extras.progressBar || {};
  return Boolean(
    (badge.enabled && badge.text)
    || (lowerThird.enabled && lowerThird.text)
    || progressBar.enabled
  );
}

function buildExtrasFilter(options = {}) {
  const { extras, outputConfig, totalDuration, fontPath, inputLabel = 'vpre', outputLabel = 'vout' } = options;
  if (!hasExtras(extras)) return '';

  const w = outputConfig.w;
  const h = outputConfig.h;
  const font = escapeFilterPath(fontPath);
  const filters = [];

  const badge = extras.badge || {};
  if (badge.enabled && badge.text) {
    const pad = Math.round(Math.min(w, h) * 0.03);
    const size = Math.round(Math.min(w, h) * 0.045);
    const pos = badgePosition(badge.position, w, h, pad);
    const fontColor = 'white';
    const boxColor = 'black@0.55';
    let alphaPart = '';
    let xExpr = pos.x;
    if (badge.animation === 'fade') {
      alphaPart = ':alpha=\'min(1,t/1)\'';
    } else if (badge.animation === 'pop') {
      alphaPart = ':alpha=\'min(1,t/0.3)\'';
    } else if (badge.animation === 'pulse') {
      alphaPart = ':alpha=\'0.5+0.5*sin(2*PI*t)\'';
    } else if (badge.animation === 'slide') {
      xExpr = `${pos.x}-(1-min(1,t/0.6))*${Math.round(Math.min(w, h) * 0.12)}`;
      alphaPart = ':alpha=\'min(1,t/0.4)\'';
    }
    filters.push(
      `drawtext=fontfile='${font}':text='${escapeDrawtext(badge.text)}'`
      + `:x='${xExpr}':y='${pos.y}':fontsize=${size}:fontcolor=${fontColor}`
      + `:box=1:boxcolor=${boxColor}:boxborderw=${Math.round(size * 0.35)}${alphaPart}`
    );
  }

  const lowerThird = extras.lowerThird || {};
  if (lowerThird.enabled && lowerThird.text) {
    const size = Math.round(Math.min(w, h) * 0.05);
    const opacity = lowerThird.opacity != null ? lowerThird.opacity : 0.6;
    const boxAlpha = Math.min(1, Math.max(0, opacity));
    const boxColor = `black@${num(boxAlpha)}`;
    const xExpr = `${Math.round(w * 0.05)}`;
    const yExpr = `${h}-th-${Math.round(h * 0.08)}`;
    filters.push(
      `drawtext=fontfile='${font}':text='${escapeDrawtext(lowerThird.text)}'`
      + `:x='${xExpr}':y='${yExpr}':fontsize=${size}:fontcolor=white`
      + `:box=1:boxcolor=${boxColor}:boxborderw=${Math.round(size * 0.4)}`
    );
  }

  const progressBar = extras.progressBar || {};
  if (progressBar.enabled) {
    const height = progressBar.height != null ? progressBar.height : 8;
    const color = hexToDraw(progressBar.color || '#ff0000');
    const duration = totalDuration > 0 ? num(totalDuration) : 1;
    filters.push(
      `drawbox=x=0:y=${h}-${height}:w='iw*min(1,t/${duration})':h=${height}:color=${color}@0.9:t=fill`
    );
  }

  if (filters.length === 0) return '';
  return `[${inputLabel}]${filters.join(',')}[${outputLabel}]`;
}

function escapeSubtitlePath(filePath) {
  return String(filePath).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, '\\\'');
}

function buildSubtitlesFilter(options = {}) {
  const { subtitlesPath, fontsDir, inputLabel = 'vpre', outputLabel = 'vout' } = options;
  if (!subtitlesPath) return '';
  const parts = [`filename='${escapeSubtitlePath(subtitlesPath)}'`];
  if (fontsDir) parts.push(`fontsdir='${escapeSubtitlePath(fontsDir)}'`);
  return `[${inputLabel}]subtitles=${parts.join(':')}[${outputLabel}]`;
}

function buildFullFilterGraph(scenes, options = {}) {
  assertOutputConfig(options.outputConfig);

  const { hasMusic = false, totalDuration, musicVolume = 0.3, extras, fontPath, subtitlesPath, fontsDir } = options;
  const extrasEnabled = hasExtras(extras);
  const subsEnabled = !!subtitlesPath;

  let videoParts;
  if (!subsEnabled) {
    const videoLabel = extrasEnabled ? 'vmain' : 'vout';
    const videoGraph = buildVideoFilterGraph(scenes, { ...options, finalVideoLabel: videoLabel });
    const extrasGraph = extrasEnabled
      ? buildExtrasFilter({ extras, outputConfig: options.outputConfig, totalDuration, fontPath, inputLabel: 'vmain', outputLabel: 'vout' })
      : '';
    videoParts = [videoGraph, extrasGraph].filter(Boolean).join(';');
  } else {
    const graphs = [buildVideoFilterGraph(scenes, { ...options, finalVideoLabel: 'vstage0' })];
    let currentLabel = 'vstage0';
    let stageIndex = 1;

    if (extrasEnabled) {
      const outLabel = `vstage${stageIndex}`;
      graphs.push(buildExtrasFilter({
        extras,
        outputConfig: options.outputConfig,
        totalDuration,
        fontPath,
        inputLabel: currentLabel,
        outputLabel: outLabel
      }));
      currentLabel = outLabel;
      stageIndex += 1;
    }

    graphs.push(buildSubtitlesFilter({
      subtitlesPath,
      fontsDir,
      inputLabel: currentLabel,
      outputLabel: 'vout'
    }));
    videoParts = graphs.filter(Boolean).join(';');
  }

  const audioGraph = buildAudioFilterGraph({
    inputCount: scenes.length,
    hasMusic,
    totalDuration,
    musicVolume
  });

  if (!videoParts) return audioGraph;
  if (!audioGraph) return videoParts;
  return `${videoParts};${audioGraph}`;
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
  RANDOM_ZOOM_TYPES,
  TRANSITION_TYPES,
  TRANSITION_MODES,
  TRANSITION_MAP,
  XFADE_TRANSITIONS,
  DEFAULT_TRANSITION_SEED,
  xfadeNameFor,
  resolveTransitionType,
  resolveBoundaryTypes,
  resolveInputDurations,
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
  buildExtrasFilter,
  hasExtras,
  escapeDrawtext,
  escapeFilterPath,
  escapeSubtitlePath,
  buildSubtitlesFilter,
  buildFullFilterGraph,
  validateOffsets,
  calculateTotalDuration,
  normalizeScenesToDuration
};
