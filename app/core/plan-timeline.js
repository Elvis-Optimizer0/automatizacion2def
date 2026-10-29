const { buildTimeline } = require('./timeline.js');
const {
  TRANSITION_IDS,
  transitionDurationFor,
  resolveBoundaryTypes,
  isSlidingTransition,
  DEFAULT_SLIDE_SPEED,
  seededRandom
} = require('./transitions-v2.js');
const {
  ZOOM_PRESETS,
  validateMotionSpec,
  ZOOM_TYPES
} = require('./zoom-v3.js');

const MIN_DURATION_SEC = 0.5;
const MAX_DURATION_SEC = 120.0;

function num(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
}

function validateDuration(duration, context) {
  if (duration == null || typeof duration !== 'number' || !Number.isFinite(duration)) {
    throw new Error(context + ': duration is missing');
  }
  if (duration < MIN_DURATION_SEC || duration > MAX_DURATION_SEC) {
    throw new Error(context + ': duration ' + duration + 's must be between ' + MIN_DURATION_SEC + 's and ' + MAX_DURATION_SEC + 's');
  }
}

function validateEffectId(effectId) {
  if (!ZOOM_TYPES.includes(effectId)) {
    throw new Error('Unknown effect id: ' + effectId);
  }
}

function validateTransitionId(transitionId) {
  if (!TRANSITION_IDS.includes(transitionId)) {
    throw new Error('Unknown transition id: ' + transitionId);
  }
}

function resolveEffectForScene(scene, globalOptions, sceneIndex) {
  const zoomType = globalOptions.zoomType || 'kenburns';
  const zoomMode = globalOptions.zoomMode || 'fixed';
  const zoomSeed = globalOptions.zoomSeed != null ? globalOptions.zoomSeed : 12345;
  const zoomCheckedEffects = globalOptions.zoomCheckedEffects || [];
  const sceneZoom = scene.zoom && typeof scene.zoom === 'object' ? scene.zoom : {};
  const baseType = sceneZoom.type || zoomType;
  validateEffectId(baseType);
  const effectId = sceneZoom.type || resolveZoomType(baseType, zoomMode, sceneIndex, zoomSeed, zoomCheckedEffects);
  return effectId;
}

function resolveZoomType(baseType, mode, index, seed, checkedEffects) {
  const ZOOM_TYPES_LOCAL = ['none', 'kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown'];
  const RANDOM_ZOOM_TYPES = ['kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown'];
  const ZOOM_OPPOSITE = {
    zoomIn: 'zoomOut', zoomOut: 'zoomIn',
    panLeft: 'panRight', panRight: 'panLeft',
    panUp: 'panDown', panDown: 'panUp'
  };
  const DEFAULT_ZOOM_SEED = 12345;

  const base = ZOOM_TYPES_LOCAL.includes(baseType) ? baseType : 'kenburns';
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
    if (checked.length === 0) {
      throw new Error('marca al menos un efecto');
    }
    if (checked.length === 1) return checked[0];
    const len = checked.length;
    const s = seed != null ? seed : DEFAULT_ZOOM_SEED;
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

function resolveFocusForScene(scene, formatId, globalOptions) {
  const sceneZoom = scene.zoom && typeof scene.zoom === 'object' ? scene.zoom : {};
  const hasCustomFocus = sceneZoom.start && sceneZoom.start.cx != null && sceneZoom.start.cy != null;
  const hasGlobalCustomFocus = globalOptions.zoomStart && globalOptions.zoomStart.cx != null && globalOptions.zoomStart.cy != null;

  if (hasCustomFocus) {
    return { x: sceneZoom.start.cx, y: sceneZoom.start.cy };
  }
  if (hasGlobalCustomFocus) {
    return { x: globalOptions.zoomStart.cx, y: globalOptions.zoomStart.cy };
  }
  return { x: 0.5, y: 0.5 };
}

function buildMotionSpecFromPreset(effectId, sceneDuration, speed, focus, sceneZoom) {
  validateEffectId(effectId);
  const preset = ZOOM_PRESETS[effectId];
  if (!preset) throw new Error('Unknown effect id: ' + effectId);

  const type = preset.type;
  const start = preset.start;
  const end = preset.end;
  const easing = preset.easing || 'smooth';
  const motionDurationSec = sceneDuration;

  let motionStart = { ...start };
  let motionEnd = { ...end };

  const hasCustomStart = sceneZoom && sceneZoom.start && sceneZoom.start.cx != null && sceneZoom.start.cy != null && sceneZoom.start.scale != null;
  const hasCustomEnd = sceneZoom && sceneZoom.end && sceneZoom.end.cx != null && sceneZoom.end.cy != null && sceneZoom.end.scale != null;

  if (effectId === 'kenburns' || effectId === 'zoomIn' || effectId === 'zoomOut') {
    if (hasCustomStart) {
      motionStart = { cx: sceneZoom.start.cx, cy: sceneZoom.start.cy, scale: sceneZoom.start.scale };
    } else {
      motionStart = { cx: focus.x, cy: focus.y, scale: start.scale };
    }
    if (hasCustomEnd) {
      motionEnd = { cx: sceneZoom.end.cx, cy: sceneZoom.end.cy, scale: sceneZoom.end.scale };
    } else {
      motionEnd = { cx: focus.x, cy: focus.y, scale: end.scale };
    }
  }

  if (type === 'static' || type === 'none') {
    if (hasCustomStart) {
      motionStart = { cx: sceneZoom.start.cx, cy: sceneZoom.start.cy, scale: sceneZoom.start.scale };
    } else {
      motionStart = { cx: focus.x, cy: focus.y, scale: start.scale };
    }
    if (hasCustomEnd) {
      motionEnd = { cx: sceneZoom.end.cx, cy: sceneZoom.end.cy, scale: sceneZoom.end.scale };
    } else {
      motionEnd = { cx: focus.x, cy: focus.y, scale: start.scale };
    }
  }

  if (sceneZoom && sceneZoom.intensity != null && (effectId === 'kenburns' || effectId === 'zoomIn' || effectId === 'zoomOut' || effectId === 'pulse')) {
    const intensity = sceneZoom.intensity;
    if (effectId === 'pulse') {
      motionStart = { cx: focus.x, cy: focus.y, scale: start.scale };
      motionEnd = { cx: focus.x, cy: focus.y, scale: start.scale };
    } else if (!hasCustomEnd) {
      motionEnd = { cx: motionEnd.cx, cy: motionEnd.cy, scale: num(start.scale + intensity) };
    }
  }

  if (type === 'static' || type === 'none') {
    if (!hasCustomStart) {
      motionStart = { cx: focus.x, cy: focus.y, scale: start.scale };
    }
    if (!hasCustomEnd) {
      motionEnd = { cx: focus.x, cy: focus.y, scale: start.scale };
    }
  }

  const spec = {
    type: type === 'pulse' ? 'oscillate' : type === 'none' ? 'static' : type,
    start: motionStart,
    end: motionEnd,
    easing: easing || 'smooth',
    speed: 1.0,
    durationSec: motionDurationSec,
    ...(type === 'pulse' ? { amplitude: 0.15, period: motionDurationSec } : {})
  };

  validateMotionSpec(spec);
  return spec;
}

function planTimeline(project, audioInfo) {
  const scenes = project.scenes || [];
  const images = project.images || [];
  const config = project.config || {};
  const renderOptions = project.renderOptions || {};
  const timelineOptions = project.timelineOptions || {};
  const adjustToAudio = timelineOptions.adjustToAudio || false;
  const audioDuration = (audioInfo && audioInfo.duration) ? audioInfo.duration : 0;

  if (!scenes || scenes.length === 0) {
    throw new Error('No scenes provided');
  }

  const formatId = (config.output && config.output.id) ? config.output.id : '16:9';
  const globalOptions = { ...renderOptions };

  const timeline = buildTimeline(scenes, images, audioDuration, { adjustToAudio });

  const totalDurationSec = timeline.reduce(function(sum, s) { return sum + s.duration; }, 0);

  const boundaryTypes = resolveBoundaryTypes(timeline, {
    transitionType: renderOptions.transitionType || 'fade',
    transitionMode: renderOptions.transitionMode || 'fixed',
    transitionSeed: renderOptions.transitionSeed
  });

  const transitionDuration = renderOptions.transitionDuration != null
    ? renderOptions.transitionDuration
    : 1.0;

  const scenePlans = timeline.map(function(tlScene, index) {
    const originalScene = scenes[index];
    validateDuration(tlScene.duration, 'Scene ' + index + ' (number ' + tlScene.number + ')');
    const effectId = resolveEffectForScene(originalScene, globalOptions, index);
    validateEffectId(effectId);
    const focus = resolveFocusForScene(originalScene, formatId, globalOptions);
    const sceneZoom = originalScene.zoom && typeof originalScene.zoom === 'object' ? originalScene.zoom : {};
    const motionSpec = buildMotionSpecFromPreset(effectId, tlScene.duration, globalOptions.zoomSpeed, focus, sceneZoom);

    let transitionOut = null;
    if (index < timeline.length - 1) {
      const transId = boundaryTypes[index + 1] || 'fade';
      validateTransitionId(transId);
      const transDur = transitionDurationFor(timeline, index + 1, transId, transitionDuration);
      const slideSpeed = isSlidingTransition(transId)
        ? (renderOptions.slideSpeed ?? DEFAULT_SLIDE_SPEED)
        : undefined;
      transitionOut = {
        id: transId,
        startSec: num(tlScene.end),
        durationSec: num(transDur),
        slideSpeed: slideSpeed
      };
    }

    return {
      index: index,
      startSec: num(tlScene.start),
      durationSec: num(tlScene.duration),
      motion: {
        start: { cx: num(motionSpec.start.cx), cy: num(motionSpec.start.cy), scale: num(motionSpec.start.scale) },
        end: { cx: num(motionSpec.end.cx), cy: num(motionSpec.end.cy), scale: num(motionSpec.end.scale) },
        easing: motionSpec.easing,
        speed: num(motionSpec.speed),
        durationSec: num(motionSpec.durationSec)
      },
      transitionOut: transitionOut
    };
  });

  const boundaries = timeline.slice(0, -1).map(function(scene, index) {
    const transId = boundaryTypes[index + 1] || 'fade';
    const transDur = transitionDurationFor(timeline, index + 1, transId, transitionDuration);
    return {
      index: index + 1,
      startSec: num(scene.end),
      durationSec: num(transDur)
    };
  });

  return {
    scenes: scenePlans,
    totalSec: num(totalDurationSec),
    boundaries: boundaries
  };
}

module.exports = { planTimeline };