const { seededRandom } = require('./transitions-v2.js');

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

const ZOOM_MOTION_SPECS = {
  none: {
    displayName: 'Sin zoom',
    defaultIntensity: 0,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => ({
      scale: startScale,
      cx: 0.5,
      cy: 0.5
    })
  },
  kenburns: {
    displayName: 'Ken Burns',
    defaultIntensity: 0.15,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => {
      const eased = smoothstep(p);
      const scale = startScale + intensity * eased;
      const cx = 0.5;
      const cy = 0.5;
      return { scale, cx, cy };
    }
  },
  zoomIn: {
    displayName: 'Acercar',
    defaultIntensity: 0.15,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => {
      const eased = smoothstep(p);
      const scale = startScale + intensity * eased;
      const cx = 0.5;
      const cy = 0.5;
      return { scale, cx, cy };
    }
  },
  zoomOut: {
    displayName: 'Alejar',
    defaultIntensity: 0.15,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => {
      const eased = smoothstep(p);
      const maxZoom = startScale + intensity;
      const scale = maxZoom - intensity * eased;
      const cx = 0.5;
      const cy = 0.5;
      return { scale, cx, cy };
    }
  },
  pulse: {
    displayName: 'Pulso',
    defaultIntensity: 0.15,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => {
      const around = startScale + intensity / 2;
      const scale = around - (intensity / 2) * Math.cos(2 * Math.PI * p);
      const cx = 0.5;
      const cy = 0.5;
      return { scale, cx, cy };
    }
  },
  panLeft: {
    displayName: 'Paneo Izquierda',
    defaultIntensity: 0.15,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => {
      const eased = smoothstep(p);
      const maxZoom = startScale + intensity;
      const scale = maxZoom;
      const cx = 1 - eased;
      const cy = 0.5;
      return { scale, cx, cy };
    }
  },
  panRight: {
    displayName: 'Paneo Derecha',
    defaultIntensity: 0.15,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => {
      const eased = smoothstep(p);
      const maxZoom = startScale + intensity;
      const scale = maxZoom;
      const cx = eased;
      const cy = 0.5;
      return { scale, cx, cy };
    }
  },
  panUp: {
    displayName: 'Paneo Arriba',
    defaultIntensity: 0.15,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => {
      const eased = smoothstep(p);
      const maxZoom = startScale + intensity;
      const scale = maxZoom;
      const cx = 0.5;
      const cy = 1 - eased;
      return { scale, cx, cy };
    }
  },
  panDown: {
    displayName: 'Paneo Abajo',
    defaultIntensity: 0.15,
    defaultStartScale: 1.0,
    motion: (p, intensity, startScale) => {
      const eased = smoothstep(p);
      const maxZoom = startScale + intensity;
      const scale = maxZoom;
      const cx = 0.5;
      const cy = eased;
      return { scale, cx, cy };
    }
  }
};

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
  const spec = ZOOM_MOTION_SPECS[type];
  if (!spec) return ZOOM_MOTION_SPECS.kenburns;
  return { ...spec };
}

function getZoomCatalog() {
  return ZOOM_TYPES.map(id => {
    const spec = ZOOM_MOTION_SPECS[id];
    return {
      id,
      displayName: spec.displayName,
      defaultIntensity: spec.defaultIntensity,
      defaultStartScale: spec.defaultStartScale
    };
  });
}

function buildUpscaleCropDownscaleFilter(scene, w, h, options, focus, upscale = 2, upFlags = 'bilinear', downFlags = 'lanczos') {
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
    return buildUpscaleCropDownscaleFilter(scene, w, h, options, focus, 2, 'bilinear', 'lanczos');
  }
}

function hashSpec(type, intensity, startScale, method) {
  const crypto = require('crypto');
  const str = JSON.stringify({ type, intensity, startScale, method });
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
  ZOOM_MOTION_SPECS,
  EASING,
  smoothstep,
  clamp01,
  num,
  resolveZoomType,
  getMotionSpec,
  getZoomCatalog,
  buildZoomFilterV3,
  buildUpscaleCropDownscaleFilter,
  buildPerspectiveFilter,
  buildRotateScaleFilter,
  hashSpec,
  sanitizeFileName
};