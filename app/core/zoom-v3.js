const { seededRandom } = require('./transitions-v2.js');
const crypto = require('crypto');

const FPS = 30;
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

const MIN_DURATION_SEC = 0.5;
const MAX_DURATION_SEC = 120.0;

const EASING_FUNCTIONS = {
  linear: p => p,
  smooth: p => 3 * p * p - 2 * p * p * p,
  in: p => p * p,
  out: p => 1 - (1 - p) * (1 - p)
};

function clamp01(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function smoothstep(p) {
  return 3 * p * p - 2 * p * p * p;
}

function num(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
}

/**
 * Validate a motion spec. Throws on invalid parameters.
 */
function validateMotionSpec(spec) {
  const { type, start, end, easing, speed, durationSec } = spec;

  const VALID_MOTION_TYPES = ['static', 'linear', 'oscillate'];
  if (!VALID_MOTION_TYPES.includes(type)) {
    throw new Error(`Unknown motion type: ${type}`);
  }

  if (type !== 'static' && (!start || !end)) {
    throw new Error(`Motion spec for '${type}' requires start and end keyframes`);
  }

  if (durationSec == null || typeof durationSec !== 'number') {
    throw new Error('durationSec is required for motion spec');
  }
  if (!Number.isFinite(durationSec) || durationSec < MIN_DURATION_SEC || durationSec > MAX_DURATION_SEC) {
    throw new Error(`durationSec must be between ${MIN_DURATION_SEC} and ${MAX_DURATION_SEC}, got ${durationSec}`);
  }

  if (speed == null || typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) {
    throw new Error(`speed must be a positive number, got ${speed}`);
  }

  if (easing && !EASING_FUNCTIONS[easing]) {
    throw new Error(`Unknown easing: ${easing}`);
  }

  // Non-static, non-oscillate effects must have non-zero amplitude
  if (type !== 'static' && type !== 'oscillate') {
    const scaleChange = Math.abs((end.scale || 1) - (start.scale || 1));
    const cxChange = Math.abs((end.cx || 0.5) - (start.cx || 0.5));
    const cyChange = Math.abs((end.cy || 0.5) - (start.cy || 0.5));
    if (scaleChange < 1e-6 && cxChange < 1e-6 && cyChange < 1e-6) {
      throw new Error(`Motion spec '${type}' has zero amplitude - start and end are identical`);
    }
  }
}

/**
 * Keyframe motion presets for each catalog effect.
 * start/end are normalized {cx, cy, scale} in source-image space.
 */
const ZOOM_PRESETS = {
  none: {
    displayName: 'Sin zoom',
    type: 'static',
    start: { cx: 0.5, cy: 0.5, scale: 1.0 },
    end: { cx: 0.5, cy: 0.5, scale: 1.0 },
    easing: 'linear',
    speed: 1.0,
    durationSec: 6.0
  },
  kenburns: {
    displayName: 'Ken Burns',
    type: 'linear',
    start: { cx: 0.5, cy: 0.5, scale: 1.0 },
    end: { cx: 0.5, cy: 0.5, scale: 1.15 },
    easing: 'smooth',
    speed: 1.0,
    durationSec: 6.0
  },
  zoomIn: {
    displayName: 'Acercar',
    type: 'linear',
    start: { cx: 0.5, cy: 0.5, scale: 1.0 },
    end: { cx: 0.5, cy: 0.5, scale: 1.15 },
    easing: 'smooth',
    speed: 1.0,
    durationSec: 6.0
  },
  zoomOut: {
    displayName: 'Alejar',
    type: 'linear',
    start: { cx: 0.5, cy: 0.5, scale: 1.15 },
    end: { cx: 0.5, cy: 0.5, scale: 1.0 },
    easing: 'smooth',
    speed: 1.0,
    durationSec: 6.0
  },
  pulse: {
    displayName: 'Pulso',
    type: 'oscillate',
    start: { cx: 0.5, cy: 0.5, scale: 1.0 },
    end: { cx: 0.5, cy: 0.5, scale: 1.0 },
    easing: 'smooth',
    speed: 1.0,
    durationSec: 6.0,
    amplitude: 0.15,
    period: 1.0
  },
  panLeft: {
    displayName: 'Paneo Izquierda',
    type: 'linear',
    start: { cx: 1.0, cy: 0.5, scale: 1.2 },
    end: { cx: 0.0, cy: 0.5, scale: 1.2 },
    easing: 'smooth',
    speed: 1.0,
    durationSec: 6.0
  },
  panRight: {
    displayName: 'Paneo Derecha',
    type: 'linear',
    start: { cx: 0.0, cy: 0.5, scale: 1.2 },
    end: { cx: 1.0, cy: 0.5, scale: 1.2 },
    easing: 'smooth',
    speed: 1.0,
    durationSec: 6.0
  },
  panUp: {
    displayName: 'Paneo Arriba',
    type: 'linear',
    start: { cx: 0.5, cy: 1.0, scale: 1.2 },
    end: { cx: 0.5, cy: 0.0, scale: 1.2 },
    easing: 'smooth',
    speed: 1.0,
    durationSec: 6.0
  },
  panDown: {
    displayName: 'Paneo Abajo',
    type: 'linear',
    start: { cx: 0.5, cy: 0.0, scale: 1.2 },
    end: { cx: 0.5, cy: 1.0, scale: 1.2 },
    easing: 'smooth',
    speed: 1.0,
    durationSec: 6.0
  }
};

/**
 * Compute per-frame motion parameters for a keyframe motion spec.
 * Returns array of {scale, cx, cy} for each frame index 0..totalFrames-1.
 *
 * p_eff = ease(min(1, (t / durationSec) * speed))
 * Movement finishes at durationSec / speed and holds.
 */
function generateMotionSequence(motionSpec, totalFrames) {
  validateMotionSpec(motionSpec);

  const { type, start, end, easing = 'smooth', speed = 1.0, durationSec } = motionSpec;
  const easeFn = EASING_FUNCTIONS[easing];

  const sequence = [];
  const holdStartTime = durationSec / speed;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / FPS;
    let p;

    if (t >= holdStartTime) {
      // Movement finished, hold at end
      p = 1;
    } else {
      p = (t / durationSec) * speed;
      p = Math.min(1, p);
    }

    let result;
    if (type === 'static' || type === 'none') {
      result = { scale: start.scale, cx: start.cx, cy: start.cy };
    } else if (type === 'linear') {
      p = easeFn(p);
      result = {
        scale: start.scale + (end.scale - start.scale) * p,
        cx: start.cx + (end.cx - start.cx) * p,
        cy: start.cy + (end.cy - start.cy) * p
      };
    } else if (type === 'oscillate') {
      const amplitude = motionSpec.amplitude ?? 0.15;
      const period = motionSpec.period ?? 1.0;
      // Oscillate for the full duration, then hold at final value
      const tEffective = Math.min(t, holdStartTime);
      result = {
        scale: start.scale + amplitude * Math.sin(2 * Math.PI * tEffective / period),
        cx: start.cx,
        cy: start.cy
      };
    } else {
      throw new Error(`Unknown motion type: ${type}`);
    }

    sequence.push({
      scale: num(result.scale, 6),
      cx: num(result.cx, 6),
      cy: num(result.cy, 6)
    });
  }
  return sequence;
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
    const r = seededRandom(seed != null ? seed : DEFAULT_ZOOM_SEED, index);
    let pick = checked[Math.floor(r * checked.length) % checked.length];
    if (index > 0) {
      const prevR = seededRandom(seed != null ? seed : DEFAULT_ZOOM_SEED, index - 1);
      const prevPick = checked[Math.floor(prevR * checked.length) % checked.length];
      if (pick === prevPick) {
        const idx = checked.indexOf(pick);
        pick = checked[(idx + 1) % checked.length];
      }
    }
    return pick;
  }
  return base;
}

function getMotionSpec(type) {
  const preset = ZOOM_PRESETS[type];
  if (!preset) return { ...ZOOM_PRESETS.kenburns };
  return { ...preset };
}

function getZoomCatalog() {
  return ZOOM_TYPES.map(id => {
    const preset = ZOOM_PRESETS[id];
    return {
      id,
      displayName: preset.displayName,
      type: preset.type,
      easing: preset.easing,
      speed: preset.speed,
      durationSec: preset.durationSec,
      amplitude: preset.amplitude,
      period: preset.period,
      start: { ...preset.start },
      end: { ...preset.end }
    };
  });
}

/**
 * Build an ffmpeg upscale-crop-downscale filter string for a single frame's
 * motion parameters. Used for filter-graph preview path (not the lab render path).
 */
function buildUpscaleCropDownscaleFilter(scene, w, h, options, focus, upscale = 4, upFlags = 'lanczos', downFlags = 'lanczos') {
  const type = ZOOM_TYPES.includes(options.zoomType) ? options.zoomType : 'kenburns';
  if (type === 'none') return '';

  const start = num(options.zoomStartScale != null ? options.zoomStartScale : 1.0);
  const intensity = num(options.zoomIntensity != null ? options.zoomIntensity : 0.15);
  const duration = num(scene.duration);
  const maxZoom = num(start + intensity);
  const around = num(start + intensity / 2);
  const fx = num(clamp01(focus.x));
  const fy = num(clamp01(focus.y));

  const UPSCALE = upscale;
  const uw = w * UPSCALE;
  const uh = h * UPSCALE;

  const ease = `t/${duration}`;
  const smooth = `3*${ease}*${ease}-2*${ease}*${ease}*${ease}`;

  let zExpr;
  if (type === 'zoomOut') {
    zExpr = `${maxZoom}-${intensity}*${smooth}`;
  } else if (type === 'pulse') {
    zExpr = `${around}-${num(intensity / 2)}*cos(2*PI*t/${duration})`;
  } else if (type === 'kenburns') {
    zExpr = `${start}+${intensity}*${smooth}`;
  } else {
    zExpr = type === 'zoomIn' ? `${start}+${intensity}*${smooth}` : `${maxZoom}`;
  }
  zExpr = `min(max(${zExpr},${start}),${maxZoom})`;

  const ufx = fx * uw;
  const ufy = fy * uh;
  const ucenter_x = uw / 2;
  const ucenter_y = uh / 2;

  let cxExpr, cyExpr;
  if (type === 'kenburns') {
    cxExpr = `${ucenter_x}+(${ufx}-${ucenter_x})*${smooth}`;
    cyExpr = `${ucenter_y}+(${ufy}-${ucenter_y})*${smooth}`;
  } else if (type === 'panLeft') {
    cxExpr = `${uw}-${w}/${maxZoom}/2+(${w}/${maxZoom}/2-${uw}+${w}/${maxZoom}/2)*${smooth}`;
    cyExpr = `${ucenter_y}`;
  } else if (type === 'panRight') {
    cxExpr = `${w}/${maxZoom}/2+(${uw}-${w}/${maxZoom}/2-${w}/${maxZoom}/2)*${smooth}`;
    cyExpr = `${ucenter_y}`;
  } else if (type === 'panUp') {
    cxExpr = `${ucenter_x}`;
    cyExpr = `${uh}-${h}/${maxZoom}/2+(${h}/${maxZoom}/2-${uh}+${h}/${maxZoom}/2)*${smooth}`;
  } else if (type === 'panDown') {
    cxExpr = `${ucenter_x}`;
    cyExpr = `${h}/${maxZoom}/2+(${uh}-${h}/${maxZoom}/2-${h}/${maxZoom}/2)*${smooth}`;
  } else {
    cxExpr = `${ufx}`;
    cyExpr = `${ufy}`;
  }

  const cropW = `iw/${zExpr}`;
  const cropH = `ih/${zExpr}`;
  const cropX = `max(0,min(iw-${cropW},${cxExpr}-${cropW}/2))`;
  const cropY = `max(0,min(ih-${cropH},${cyExpr}-${cropH}/2))`;

  return `scale=${uw}:${uh}:flags=${upFlags},crop=w='${cropW}':h='${cropH}':x='${cropX}':y='${cropY}',scale=${w}:${h}:flags=${downFlags}`;
}

function buildPerspectiveFilter(scene, w, h, options, focus) {
  const type = ZOOM_TYPES.includes(options.zoomType) ? options.zoomType : 'kenburns';
  if (type === 'none') return '';

  const start = num(options.zoomStartScale != null ? options.zoomStartScale : 1.0);
  const intensity = num(options.zoomIntensity != null ? options.zoomIntensity : 0.15);
  const duration = num(scene.duration);
  const maxZoom = num(start + intensity);
  const around = num(start + intensity / 2);
  const fx = num(clamp01(focus.x));
  const fy = num(clamp01(focus.y));

  const ease = `t/${duration}`;
  const smooth = `3*${ease}*${ease}-2*${ease}*${ease}*${ease}`;

  let zExpr;
  if (type === 'zoomOut') {
    zExpr = `${maxZoom}-${intensity}*${smooth}`;
  } else if (type === 'pulse') {
    zExpr = `${around}-${num(intensity / 2)}*cos(2*PI*t/${duration})`;
  } else if (type === 'kenburns') {
    zExpr = `${start}+${intensity}*${smooth}`;
  } else {
    zExpr = type === 'zoomIn' ? `${start}+${intensity}*${smooth}` : `${maxZoom}`;
  }
  zExpr = `min(max(${zExpr},${start}),${maxZoom})`;

  let cxExpr, cyExpr;
  if (type === 'kenburns') {
    cxExpr = `${fx}*${smooth}`;
    cyExpr = `${fy}*${smooth}`;
  } else if (type === 'panLeft') {
    cxExpr = `1-${smooth}`;
    cyExpr = `${fy}`;
  } else if (type === 'panRight') {
    cxExpr = `${smooth}`;
    cyExpr = `${fy}`;
  } else if (type === 'panUp') {
    cxExpr = `${fx}`;
    cyExpr = `1-${smooth}`;
  } else if (type === 'panDown') {
    cxExpr = `${fx}`;
    cyExpr = `${smooth}`;
  } else {
    cxExpr = `${fx}`;
    cyExpr = `${fy}`;
  }

  const scaleExpr = `1/${zExpr}`;
  const transX = `(${cxExpr}-0.5)*iw*(1-${scaleExpr})`;
  const transY = `(${cyExpr}-0.5)*ih*(1-${scaleExpr})`;

  return `perspective=eval=frame:x0=${transX}:y0=${transY}:x1=${transX}+iw*${scaleExpr}:y1=${transY}:x2=${transX}:y2=${transY}+ih*${scaleExpr}:x3=${transX}+iw*${scaleExpr}:y3=${transY}+ih*${scaleExpr}:interpolation=cubic:sense=destination,scale=${w}:${h}:flags=lanczos`;
}

function buildRotateScaleFilter(scene, w, h, options, focus) {
  const type = ZOOM_TYPES.includes(options.zoomType) ? options.zoomType : 'kenburns';
  if (type === 'none') return '';

  const start = num(options.zoomStartScale != null ? options.zoomStartScale : 1.0);
  const intensity = num(options.zoomIntensity != null ? options.zoomIntensity : 0.15);
  const duration = num(scene.duration);
  const maxZoom = num(start + intensity);
  const around = num(start + intensity / 2);
  const fx = num(clamp01(focus.x));
  const fy = num(clamp01(focus.y));

  const ease = `t/${duration}`;
  const smooth = `3*${ease}*${ease}-2*${ease}*${ease}*${ease}`;

  let zExpr;
  if (type === 'zoomOut') {
    zExpr = `${maxZoom}-${intensity}*${smooth}`;
  } else if (type === 'pulse') {
    zExpr = `${around}-${num(intensity / 2)}*cos(2*PI*t/${duration})`;
  } else if (type === 'kenburns') {
    zExpr = `${start}+${intensity}*${smooth}`;
  } else {
    zExpr = type === 'zoomIn' ? `${start}+${intensity}*${smooth}` : `${maxZoom}`;
  }
  zExpr = `min(max(${zExpr},${start}),${maxZoom})`;

  let cxExpr, cyExpr;
  if (type === 'kenburns') {
    cxExpr = `${fx}*${smooth}`;
    cyExpr = `${fy}*${smooth}`;
  } else if (type === 'panLeft') {
    cxExpr = `1-${smooth}`;
    cyExpr = `${fy}`;
  } else if (type === 'panRight') {
    cxExpr = `${smooth}`;
    cyExpr = `${fy}`;
  } else if (type === 'panUp') {
    cxExpr = `${fx}`;
    cyExpr = `1-${smooth}`;
  } else if (type === 'panDown') {
    cxExpr = `${fx}`;
    cyExpr = `${smooth}`;
  } else {
    cxExpr = `${fx}`;
    cyExpr = `${fy}`;
  }

  const transX = `(${cxExpr}-0.5)*iw*(1-1/${zExpr})`;
  const transY = `(${cyExpr}-0.5)*ih*(1-1/${zExpr})`;

  return `rotate=angle=0:ow='iw/${zExpr}':oh='ih/${zExpr}':c=black@0:eval=frame:x='${transX}':y='${transY}',scale=${w}:${h}:flags=lanczos`;
}

function buildZoomFilterV3(scene, w, h, options, focus, method = 'upscale-crop-downscale') {
  switch (method) {
  case 'perspective':
    return buildPerspectiveFilter(scene, w, h, options, focus);
  case 'rotate-scale':
    return buildRotateScaleFilter(scene, w, h, options, focus);
  case 'upscale-crop-downscale-2x-bilinear-lanczos':
    return buildUpscaleCropDownscaleFilter(scene, w, h, options, focus, 2, 'bilinear', 'lanczos');
  case 'upscale-crop-downscale-4x-lanczos-lanczos':
    return buildUpscaleCropDownscaleFilter(scene, w, h, options, focus, 4, 'lanczos', 'lanczos');
  case 'upscale-crop-downscale-4x-bilinear-lanczos':
    return buildUpscaleCropDownscaleFilter(scene, w, h, options, focus, 4, 'bilinear', 'lanczos');
  case 'upscale-crop-downscale-3x-lanczos-lanczos':
    return buildUpscaleCropDownscaleFilter(scene, w, h, options, focus, 3, 'lanczos', 'lanczos');
  case 'upscale-crop-downscale':
  default:
    return buildUpscaleCropDownscaleFilter(scene, w, h, options, focus, 4, 'lanczos', 'lanczos');
  }
}

function hashSpec(type, intensity, startScale, method) {
  const str = JSON.stringify({ type, intensity, startScale, method });
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function hashMotionSpec(motionSpec) {
  const str = JSON.stringify(motionSpec);
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function sanitizeFileName(str) {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

module.exports = {
  FPS,
  ZOOM_TYPES,
  ZOOM_MODES,
  DEFAULT_ZOOM_SEED,
  RANDOM_ZOOM_TYPES,
  ZOOM_OPPOSITE,
  ZOOM_PRESETS,
  EASING_FUNCTIONS,
  smoothstep,
  clamp01,
  num,
  resolveZoomType,
  getMotionSpec,
  getZoomCatalog,
  generateMotionSequence,
  validateMotionSpec,
  buildZoomFilterV3,
  buildUpscaleCropDownscaleFilter,
  buildPerspectiveFilter,
  buildRotateScaleFilter,
  hashSpec,
  hashMotionSpec,
  sanitizeFileName
};
