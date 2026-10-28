const {
  assertOutputConfig,
  DEFAULT_FOCUS
} = require('./output-formats.js');

const {
  FPS,
  TRANSITION_CATALOG,
  TRANSITION_IDS,
  TRANSITION_MAP,
  TRANSITION_DEFAULTS,
  SLIDING_TRANSITION_IDS,
  EASING,
  MOTION_SPECS,
  num,
  clamp01,
  clampScale,
  backgroundModeFor,
  safeColor,
  transitionDurationFor,
  resolveBoundaryTypes,
  resolveTransitionType,
  resolveInputDurations,
  seededRandom,
  calculateTotalDuration,
  normalizeScenesToDuration,
  isSlidingTransition,
  DEFAULT_SLIDE_SPEED
} = require('./transitions-v2.js');
const {
  buildZoomFilterFromSpec
} = require('./zoom-v3.js');

const WIDTH = 1920;
const HEIGHT = 1080;

const FIT_MODES = ['cover', 'blur', 'frame'];

const ZOOM_TYPES = ['none', 'kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown'];
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

const TRANSITION_TYPES = TRANSITION_IDS;
const TRANSITION_MODES = ['fixed', 'alternate', 'random'];

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

function fixAsarPath(p) {
  return p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
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
      : [];
    if (checked.length === 0) return base;
    if (checked.length === 1) return checked[0];
    const len = checked.length;
    const s = seed != null ? seed : DEFAULT_ZOOM_SEED;
    // Simulate from scene 0 up to `index` so the "never the same twice in a
    // row" rule compares against the ACTUAL previous pick (not the raw,
    // uncorrected one). This keeps the function pure and reproducible.
    let prevPick = null;
    let pick = null;
    for (let j = 0; j <= index; j++) {
      const r = seededRandom(s, j);
      pick = checked[Math.floor(r * len) % len];
      if (j > 0 && pick === prevPick) {
        const idx = checked.indexOf(pick);
        pick = checked[(idx + 1) % len];
      }
      prevPick = pick;
    }
    return pick;
  }
  return base;
}

function buildMotionSpecFromOptions(scene, w, h, options, focus) {
  const {
    zoomType = 'kenburns',
    zoomMode = 'fixed',
    zoomSeed = DEFAULT_ZOOM_SEED,
    zoomStartScale = 1.0,
    zoomIntensity = 0.15,
    zoomSpeed = 1.0,
    zoomDurationSec = null,
    zoomCheckedEffects = []
  } = options;

  const sceneZoom = scene.zoom && typeof scene.zoom === 'object' ? scene.zoom : {};

  // Resolve the zoom type (respects per-scene type override)
  const baseType = sceneZoom.type || zoomType;
  const type = resolveZoomType(baseType, zoomMode, scene.number || 0, zoomSeed, zoomCheckedEffects);

  // Build start/end keyframes
  const fx = num(clamp01(focus.x));
  const fy = num(clamp01(focus.y));
  const startScale = num(sceneZoom.startScale != null ? sceneZoom.startScale : zoomStartScale);
  const intensity = num(sceneZoom.intensity != null ? sceneZoom.intensity : zoomIntensity);
  const maxZoom = num(startScale + intensity);

  let start, end;

  // Handle 'none' type explicitly - no motion
  if (type === 'none') {
    start = { cx: fx, cy: fy, scale: startScale };
    end = { cx: fx, cy: fy, scale: startScale };
  } else if (sceneZoom.start && sceneZoom.end) {
    // Custom keyframes override everything
    start = {
      cx: num(sceneZoom.start.cx),
      cy: num(sceneZoom.start.cy),
      scale: num(sceneZoom.start.scale)
    };
    end = {
      cx: num(sceneZoom.end.cx),
      cy: num(sceneZoom.end.cy),
      scale: num(sceneZoom.end.scale)
    };
  } else if (options.zoomStart && options.zoomEnd) {
    // Global custom keyframes from UI
    start = {
      cx: num(options.zoomStart.cx),
      cy: num(options.zoomStart.cy),
      scale: num(sceneZoom.startScale != null ? sceneZoom.startScale : zoomStartScale)
    };
    end = {
      cx: num(options.zoomEnd.cx),
      cy: num(options.zoomEnd.cy),
      scale: num(options.zoomEnd.scale || maxZoom)
    };
  } else {
    // Compute from type
    switch (type) {
    case 'kenburns':
    case 'zoomIn':
      start = { cx: fx, cy: fy, scale: startScale };
      end = { cx: fx, cy: fy, scale: maxZoom };
      break;
    case 'zoomOut':
      start = { cx: fx, cy: fy, scale: maxZoom };
      end = { cx: fx, cy: fy, scale: startScale };
      break;
    case 'panLeft':
      start = { cx: 1.0, cy: 0.5, scale: maxZoom };
      end = { cx: 0.0, cy: 0.5, scale: maxZoom };
      break;
    case 'panRight':
      start = { cx: 0.0, cy: 0.5, scale: maxZoom };
      end = { cx: 1.0, cy: 0.5, scale: maxZoom };
      break;
    case 'panUp':
      start = { cx: 0.5, cy: 1.0, scale: maxZoom };
      end = { cx: 0.5, cy: 0.0, scale: maxZoom };
      break;
    case 'panDown':
      start = { cx: 0.5, cy: 0.0, scale: maxZoom };
      end = { cx: 0.5, cy: 1.0, scale: maxZoom };
      break;
    default:
      start = { cx: fx, cy: fy, scale: startScale };
      end = { cx: fx, cy: fy, scale: maxZoom };
    }
  }

  const durationSec = zoomDurationSec != null ? num(zoomDurationSec) : num(scene.duration);

  return {
    type: type === 'pulse' ? 'oscillate' : type === 'none' ? 'static' : 'linear',
    start,
    end,
    easing: 'smooth',
    speed: num(zoomSpeed),
    durationSec,
    ...(type === 'pulse' ? { amplitude: num(intensity / 2), period: num(durationSec) } : {})
  };
}

function buildZoomFilterV2(scene, w, h, options, focus) {
  const motionSpec = buildMotionSpecFromOptions(scene, w, h, options, focus);
  return buildZoomFilterFromSpec(scene, w, h, motionSpec, focus);
}

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
    parts.push(`[bg${index}]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},boxblur=luma_radius=${radius}:luma_power=2[bgf${index}]`);
    parts.push(`[fg${index}]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos[fgs${index}]`);
    parts.push(`[bgf${index}][fgs${index}]overlay=(W-w)/2:(H-h)/2[base${index}]`);
    baseLabel = `base${index}`;
  } else if (fitMode === 'frame') {
    const widthExpr = `${w}:-2`;
    parts.push(`[${index}:v]scale=${widthExpr}:flags=lanczos[scaled${index}]`);
    parts.push(`[scaled${index}]pad=${w}:${h}:0:oh/2-ih/2:color=${frameColor}[base${index}]`);
    baseLabel = `base${index}`;
  } else if (scale < 1) {
    const sw = num(w * scale);
    const sh = num(h * scale);
    if (backgroundMode === 'blur') {
      const radius = Math.max(2, Math.round(Math.min(w, h) / 20));
      parts.push(`[${index}:v]split=2[zbg${index}][zfg${index}]`);
      parts.push(`[zbg${index}]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},boxblur=luma_radius=${radius}:luma_power=2[zbase${index}]`);
      parts.push(`[zfg${index}]scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos[zscaled${index}]`);
      parts.push(`[zbase${index}][zscaled${index}]overlay=x='(W-w)*${fx}':y='(H-h)*${fy}'[base${index}]`);
    } else {
      parts.push(`[${index}:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos[zscaled${index}]`);
      parts.push(`[zscaled${index}]pad=w='max(${w},iw)':h='max(${h},ih)':x='max(0,(max(${w},iw)-iw)*${fx})':y='max(0,(max(${h},ih)-ih)*${fy})':color=${backgroundColor}[zpad${index}]`);
      parts.push(`[zpad${index}]crop=${w}:${h}:(iw-ow)*${fx}:(ih-oh)*${fy}[base${index}]`);
    }
    baseLabel = `base${index}`;
  } else {
    const sw = num(w * scale);
    const sh = num(h * scale);
    parts.push(`[${index}:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}:(iw-ow)*${fx}:(ih-oh)*${fy}[base${index}]`);
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
    transitionDuration = 1.0,
    slideSpeed = DEFAULT_SLIDE_SPEED
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
    const transitionType = boundaryTypes[i];
    
    if (isSlidingTransition(transitionType)) {
      // For sliding transitions, use xfade with adjusted duration to simulate slideSpeed
      // The effective transition duration is transDur / slideSpeed, which makes the slide faster
      const effectiveDur = num(transDur / slideSpeed);
      parts.push(`[${currentLabel}][v${i}]xfade=transition=${xfadeNameFor(transitionType)}:duration=${effectiveDur}:offset=${offset}[x${i}]`);
      currentLabel = `x${i}`;
    } else {
      parts.push(`[${currentLabel}][v${i}]xfade=transition=${xfadeNameFor(transitionType)}:duration=${transDur}:offset=${offset}[x${i}]`);
      currentLabel = `x${i}`;
    }
  }

  if (currentLabel !== finalLabel) {
    parts.push(`[${currentLabel}]copy[${finalLabel}]`);
  }
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

  const { hasMusic = false, totalDuration, musicVolume = 0.3, extras, fontPath, subtitlesPath, fontsDir, slideSpeed = DEFAULT_SLIDE_SPEED } = options;
  const extrasEnabled = hasExtras(extras);
  const subsEnabled = !!subtitlesPath;

  let videoParts;
  if (!subsEnabled) {
    const videoLabel = extrasEnabled ? 'vmain' : 'vout';
    const videoGraph = buildVideoFilterGraph(scenes, { ...options, finalVideoLabel: videoLabel, slideSpeed });
    const extrasGraph = extrasEnabled
      ? buildExtrasFilter({ extras, outputConfig: options.outputConfig, totalDuration, fontPath, inputLabel: 'vmain', outputLabel: 'vout' })
      : '';
    videoParts = [videoGraph, extrasGraph].filter(Boolean).join(';');
  } else {
    const graphs = [buildVideoFilterGraph(scenes, { ...options, finalVideoLabel: 'vstage0', slideSpeed })];
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
  sceneInputDuration: (scenes, i, transitionType, transitionDuration) => {
    const base = scenes[i].duration;
    if (i >= scenes.length - 1) return num(base);
    const transDur = transitionDurationFor(scenes, i + 1, transitionType, transitionDuration);
    return num(base + transDur);
  },
  buildMotionSpecFromOptions,
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
  normalizeScenesToDuration,
  DEFAULT_SLIDE_SPEED,
  SLIDING_TRANSITION_IDS,
  isSlidingTransition,
  TRANSITION_CATALOG,
  TRANSITION_IDS,
  TRANSITION_DEFAULTS,
  EASING,
  MOTION_SPECS,
  getTransitionCatalog: () => TRANSITION_CATALOG.map(t => ({
    id: t.id,
    displayName: t.displayName,
    xfadeName: t.xfadeName,
    defaultDuration: t.defaultDuration,
    isCut: t.isCut,
    isSliding: t.isSliding
  })),
  getMotionSpec: (id) => MOTION_SPECS[id] ? { ...MOTION_SPECS[id] } : { ...MOTION_SPECS.fade }
};