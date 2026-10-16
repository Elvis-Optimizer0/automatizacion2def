const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const SCALE_FILTER = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT}`;

function fixAsarPath(p) {
  return p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
}

function num(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
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

function buildSceneVideoFilter(scene, index, options = {}) {
  const {
    zoomEnabled = true,
    zoomStartScale = 1.0,
    zoomIntensity = 0.15
  } = options;

  let filter = SCALE_FILTER;

  if (zoomEnabled) {
    const frames = Math.max(1, Math.round(scene.duration * FPS));
    const step = num(zoomIntensity / frames);
    const maxZoom = num(zoomStartScale + zoomIntensity);
    filter += `,zoompan=z='min(max(zoom,${num(zoomStartScale)})+${step},${maxZoom})'`
      + `:d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
  }

  filter += ',setsar=1,format=yuv420p';
  return `[${index}:v]${filter}[v${index}]`;
}

function buildVideoFilterGraph(scenes, options = {}) {
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
  SCALE_FILTER,
  fixAsarPath,
  transitionDurationFor,
  sceneInputDuration,
  buildSceneVideoFilter,
  buildVideoFilterGraph,
  buildAudioFilterGraph,
  buildFullFilterGraph,
  validateOffsets,
  calculateTotalDuration,
  normalizeScenesToDuration
};
