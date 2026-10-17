function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(p => parseFloat(p));
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function parseScenes(script) {
  const lines = script.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const scenes = [];
  const seenNumbers = new Set();
  const warnings = [];

  // eslint-disable-next-line no-useless-escape
  const sceneRegex = /^\s*[\[\(]?\s*(?:escena|scene)\s*[:#]?\s*(\d+)\s*[\]\)]?/i;
  const timeRangeRegex = /(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—a]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/i;
  // eslint-disable-next-line no-useless-escape
  const timeRangeParenRegex = /[\[\(](\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*[-–—a]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)[\]\)]/i;
  const timeRangeDeRegex = /de\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s+a\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)/i;

  let currentScene = null;
  let currentTextLines = [];

  function finalizeScene() {
    if (currentScene) {
      currentScene.text = currentTextLines.join('\n').trim();
      scenes.push(currentScene);
      currentScene = null;
      currentTextLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sceneMatch = line.match(sceneRegex);

    if (sceneMatch) {
      finalizeScene();

      const number = parseInt(sceneMatch[1], 10);
      let start = 0;
      let end = 0;

      let timeMatch = line.match(timeRangeRegex);
      if (!timeMatch) {
        timeMatch = line.match(timeRangeParenRegex);
      }
      if (!timeMatch) {
        timeMatch = line.match(timeRangeDeRegex);
      }

      if (timeMatch) {
        start = parseTimeToSeconds(timeMatch[1]);
        end = parseTimeToSeconds(timeMatch[2]);
      }

      if (seenNumbers.has(number)) {
        warnings.push(`Número de escena repetido: ${number}`);
      }
      seenNumbers.add(number);

      const textAfterMarker = line.replace(sceneRegex, '').replace(timeRangeRegex, '').replace(timeRangeParenRegex, '').replace(timeRangeDeRegex, '').trim();
      currentScene = { number, start, end };
      if (textAfterMarker) {
        currentTextLines.push(textAfterMarker);
      }
    } else if (currentScene) {
      currentTextLines.push(line);
    } else {
      currentTextLines.push(line);
    }
  }

  finalizeScene();

  scenes.sort((a, b) => a.number - b.number);

  for (let i = 0; i < scenes.length - 1; i++) {
    if (scenes[i].end > scenes[i + 1].start) {
      warnings.push(`Rangos solapados: escena ${scenes[i].number} (${scenes[i].end}s) > escena ${scenes[i + 1].number} (${scenes[i + 1].start}s)`);
    }
    if (scenes[i].end < scenes[i + 1].start) {
      const gap = scenes[i + 1].start - scenes[i].end;
      if (gap > 1) {
        warnings.push(`Hueco detectado entre escena ${scenes[i].number} y ${scenes[i + 1].number}: ${gap.toFixed(1)}s`);
      }
    }
  }

  return { scenes, warnings };
}

function buildTimeline(scenes, images, audioDuration, options = {}) {
  const { adjustToAudio = false } = options;

  if (!scenes || scenes.length === 0) {
    return [];
  }

  const sortedScenes = [...scenes].sort((a, b) => a.number - b.number);
  const sortedImages = [...images].sort((a, b) => {
    const numA = extractSceneNumber(a.name);
    const numB = extractSceneNumber(b.name);
    if (numA !== null && numB !== null) {
      return numA - numB;
    }
    if (numA !== null) return -1;
    if (numB !== null) return 1;
    return 0;
  });

  const timeline = sortedScenes.map((scene, index) => {
    const image = sortedImages[index] || null;
    return {
      number: scene.number,
      start: scene.start,
      end: scene.end,
      duration: scene.end - scene.start,
      text: scene.text,
      image: image ? { name: image.name, path: image.path } : null
    };
  });

  if (adjustToAudio && audioDuration > 0) {
    const totalSceneDuration = timeline.reduce((sum, s) => sum + s.duration, 0);
    if (totalSceneDuration > 0) {
      const scale = audioDuration / totalSceneDuration;
      let accumulated = 0;
      timeline.forEach((scene, _i) => {
        const scaledDuration = scene.duration * scale;
        scene.start = accumulated;
        scene.end = accumulated + scaledDuration;
        scene.duration = scaledDuration;
        accumulated = scene.end;
      });
      timeline[timeline.length - 1].end = audioDuration;
      timeline[timeline.length - 1].duration = audioDuration - timeline[timeline.length - 1].start;
    }
  }

  return timeline;
}

function extractSceneNumber(filename) {
  const match = filename.match(/(?:escena|scene)\s*[:_\-\s]?(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

const DEFAULT_FOCUS = { x: 0.5, y: 0.5 };
const DEFAULT_SCALE = 1.0;
const SCALE_MIN = 0.3;
const SCALE_MAX = 3.0;
const ZOOM_TYPES = ['none', 'kenburns', 'zoomIn', 'zoomOut', 'pulse', 'panLeft', 'panRight', 'panUp', 'panDown'];
const ZOOM_MODES = ['fixed', 'alternate', 'random'];
const TRANSITION_TYPES = ['cut', 'fade', 'fadeblack', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'curtainLeft', 'curtainRight', 'circle'];
const TRANSITION_MODES = ['fixed', 'alternate', 'random'];
const FORMAT_FOCUS_KEY = {
  '16:9': 'focus169',
  '9:16': 'focus916',
  '1:1': 'focus11',
  '4:5': 'focus45'
};
const FORMAT_DIMENSIONS = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 }
};

const state = {
  images: [],
  audio: { narration: null, music: null },
  script: { raw: '', scenes: [], warnings: [] },
  timeline: [],
  timelineOptions: { adjustToAudio: false },
  audioDuration: 0,
  project: { filePath: null, missing: [] },
  config: {
    outputs: ['16:9'],
    fitMode: 'cover',
    frameColor: '#000000',
    backgroundMode: 'color',
    backgroundColor: '#000000',
    musicVolume: 0.3,
    extras: {
      badge: { enabled: false, text: '', position: 'topRight', animation: 'fade' },
      lowerThird: { enabled: false, text: '', opacity: 0.6 },
      progressBar: { enabled: false, color: '#ff0000', height: 8 }
    },
    subtitles: {
      enabled: false,
      fontFamily: 'Roboto',
      fontFile: '',
      fontSizeH: 48,
      fontSizeV: 64,
      bold: false,
      italic: false,
      letterSpacing: 0,
      textColor: '#ffffff',
      outlineWidth: 0,
      outlineColor: '#000000',
      alignment: 2,
      marginH: 40,
      marginV: 40,
      background: { enabled: false, color: '#000000', opacity: 0.5 },
      shadow: { enabled: false, color: '#000000', opacity: 0.7, distance: 3, angle: 45, blur: 4 },
      highlight: { enabled: false, colors: {}, detect: { numbers: true, percent: true, currency: true } },
      animation: 'none'
    }
  },
  focus: {
    imageIndex: 0,
    format: '16:9'
  },
  exportOptions: {
    zoomEnabled: true,
    zoomType: 'kenburns',
    zoomMode: 'fixed',
    zoomSeed: 12345,
    zoomStartScale: 1.0,
    zoomIntensity: 0.15,
    transitionType: 'fade',
    transitionMode: 'fixed',
    transitionSeed: 4242,
    transitionDuration: 1.0
  },
  export: {
    isRendering: false,
    progress: 0,
    outputPath: null,
    outputFolder: null,
    status: ''
  }
};

function ensureFocus(image) {
  if (!image) return image;
  Object.values(FORMAT_FOCUS_KEY).forEach(key => {
    const focus = image[key];
    if (!focus || typeof focus.x !== 'number' || typeof focus.y !== 'number') {
      image[key] = { x: DEFAULT_FOCUS.x, y: DEFAULT_FOCUS.y, scale: DEFAULT_SCALE };
    } else if (typeof focus.scale !== 'number' || isNaN(focus.scale)) {
      focus.scale = DEFAULT_SCALE;
    }
  });
  return image;
}

function clampFocus(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function clampScale(value) {
  if (typeof value !== 'number' || isNaN(value)) return DEFAULT_SCALE;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
}

function coverFractions(formatId, naturalWidth, naturalHeight) {
  const dims = FORMAT_DIMENSIONS[formatId] || FORMAT_DIMENSIONS['16:9'];
  const targetAspect = dims.w / dims.h;
  const imageAspect = naturalWidth / naturalHeight;
  if (imageAspect > targetAspect) {
    return { coverW: (naturalHeight * targetAspect) / naturalWidth, coverH: 1 };
  }
  return { coverW: 1, coverH: (naturalWidth / targetAspect) / naturalHeight };
}

function frameGeometry(image, formatId, naturalWidth, naturalHeight) {
  const { coverW, coverH } = coverFractions(formatId, naturalWidth, naturalHeight);
  const focus = (image && image[FORMAT_FOCUS_KEY[formatId]]) || DEFAULT_FOCUS;
  const scale = clampScale(typeof focus.scale === 'number' ? focus.scale : DEFAULT_SCALE);
  const fx = clampFocus(focus.x);
  const fy = clampFocus(focus.y);
  const frameW = coverW / scale;
  const frameH = coverH / scale;
  return {
    coverW,
    coverH,
    frameW,
    frameH,
    fx,
    fy,
    scale,
    autoScale: clampScale(Math.min(coverW, coverH)),
    boxLeft: (1 - frameW) * fx,
    boxTop: (1 - frameH) * fy
  };
}

function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.2s ease reverse';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function renderImages() {
  const imagesList = document.getElementById('images-list');
  imagesList.innerHTML = '';

  state.images.forEach((image) => {
    const item = document.createElement('article');
    item.className = 'image-item';
    item.setAttribute('role', 'listitem');

    const thumbnail = document.createElement('img');
    thumbnail.className = 'image-thumbnail';
    thumbnail.src = `file://${image.path}`;
    thumbnail.alt = `Miniatura de ${image.name}`;
    thumbnail.loading = 'lazy';

    thumbnail.onerror = () => {
      thumbnail.style.display = 'none';
    };

    const info = document.createElement('div');
    info.className = 'image-info';

    const name = document.createElement('div');
    name.className = 'image-name';
    name.textContent = image.name;
    name.title = image.name;

    const path = document.createElement('div');
    path.className = 'image-path';
    path.textContent = image.path;
    path.title = image.path;

    info.appendChild(name);
    info.appendChild(path);
    item.appendChild(thumbnail);
    item.appendChild(info);
    imagesList.appendChild(item);
  });
}

function renderAudio() {
  const narrationInput = document.getElementById('audio-narration');
  const narrationInfo = document.getElementById('audio-narration-info');
  const musicInput = document.getElementById('audio-music');
  const musicInfo = document.getElementById('audio-music-info');

  if (state.audio.narration) {
    narrationInput.value = state.audio.narration.path;
    narrationInfo.textContent = `${state.audio.narration.name} · ${formatTime(state.audioDuration)}`;
  } else {
    narrationInput.value = '';
    narrationInfo.textContent = '';
  }

  if (state.audio.music) {
    musicInput.value = state.audio.music.path;
    musicInfo.textContent = state.audio.music.name;
  } else {
    musicInput.value = '';
    musicInfo.textContent = '';
  }
}

function renderScript() {
  const textarea = document.getElementById('script-textarea');
  const warningsContainer = document.getElementById('script-warnings');
  const summary = document.getElementById('script-summary');

  textarea.value = state.script.raw;

  warningsContainer.innerHTML = '';
  state.script.warnings.forEach(w => {
    const div = document.createElement('div');
    div.className = 'warning-item';
    div.textContent = w;
    warningsContainer.appendChild(div);
  });

  const assignedImages = state.script.scenes.filter(s => {
    const img = state.images.find(i => {
      const num = extractSceneNumber(i.name);
      return num === s.number;
    });
    return !!img;
  }).length;

  summary.textContent = `${state.script.scenes.length} escenas detectadas · ${assignedImages} imágenes asignadas`;
}

function renderTimeline() {
  const tbody = document.getElementById('timeline-tbody');
  const emptyState = document.getElementById('timeline-empty');
  const summary = document.getElementById('timeline-summary');
  const tableContainer = document.getElementById('timeline-table-container');

  if (state.timeline.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    tableContainer.style.display = 'none';
    summary.textContent = '';
    return;
  }

  emptyState.style.display = 'none';
  tableContainer.style.display = 'block';

  tbody.innerHTML = '';
  let totalDuration = 0;

  state.timeline.forEach((scene, index) => {
    totalDuration += scene.duration;
    const row = document.createElement('tr');

    const numCell = document.createElement('td');
    numCell.textContent = scene.number;
    row.appendChild(numCell);

    const thumbCell = document.createElement('td');
    if (scene.image) {
      const img = document.createElement('img');
      img.className = 'timeline-thumbnail';
      img.src = `file://${scene.image.path}`;
      img.alt = `Miniatura de ${scene.image.name}`;
      img.loading = 'lazy';
      img.onerror = () => img.style.display = 'none';
      thumbCell.appendChild(img);
    }
    row.appendChild(thumbCell);

    const startCell = document.createElement('td');
    startCell.textContent = formatTime(scene.start);
    row.appendChild(startCell);

    const endCell = document.createElement('td');
    endCell.textContent = formatTime(scene.end);
    row.appendChild(endCell);

    const durCell = document.createElement('td');
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.step = '0.1';
    durInput.min = '0.1';
    durInput.className = 'timeline-duration-input';
    durInput.value = scene.duration.toFixed(1);
    durInput.dataset.index = index;
    durInput.addEventListener('change', handleDurationChange);
    durCell.appendChild(durInput);
    row.appendChild(durCell);

    const imgCell = document.createElement('td');
    if (scene.image) {
      imgCell.textContent = scene.image.name;
    } else {
      imgCell.innerHTML = '<span style="color: var(--color-warning);">Sin imagen</span>';
    }
    row.appendChild(imgCell);

    const zoomCell = document.createElement('td');
    const zoomSelect = document.createElement('select');
    zoomSelect.className = 'timeline-zoom-select';
    zoomSelect.dataset.index = index;
    const zoomGlobal = document.createElement('option');
    zoomGlobal.value = '';
    zoomGlobal.textContent = '(global)';
    zoomSelect.appendChild(zoomGlobal);
    ZOOM_TYPES.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      zoomSelect.appendChild(option);
    });
    zoomSelect.value = scene.zoom && scene.zoom.type ? scene.zoom.type : '';
    zoomSelect.addEventListener('change', handleSceneZoomChange);
    zoomCell.appendChild(zoomSelect);
    row.appendChild(zoomCell);

    const intensityCell = document.createElement('td');
    const intensityInput = document.createElement('input');
    intensityInput.type = 'number';
    intensityInput.step = '0.05';
    intensityInput.min = '0';
    intensityInput.max = '1';
    intensityInput.className = 'timeline-intensity-input';
    intensityInput.dataset.index = index;
    const sceneIntensity = scene.zoom && scene.zoom.intensity != null ? scene.zoom.intensity : state.exportOptions.zoomIntensity;
    intensityInput.value = Number(sceneIntensity).toFixed(2);
    intensityInput.addEventListener('change', handleSceneIntensityChange);
    intensityCell.appendChild(intensityInput);
    row.appendChild(intensityCell);

    const transitionCell = document.createElement('td');
    const transitionSelect = document.createElement('select');
    transitionSelect.className = 'timeline-transition-select';
    transitionSelect.dataset.index = index;
    const transitionGlobal = document.createElement('option');
    transitionGlobal.value = '';
    transitionGlobal.textContent = '(global)';
    transitionSelect.appendChild(transitionGlobal);
    TRANSITION_TYPES.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      transitionSelect.appendChild(option);
    });
    transitionSelect.value = scene.transition && scene.transition.type ? scene.transition.type : '';
    transitionSelect.addEventListener('change', handleSceneTransitionChange);
    transitionCell.appendChild(transitionSelect);
    row.appendChild(transitionCell);

    const textCell = document.createElement('td');
    textCell.textContent = scene.text || '';
    textCell.style.maxWidth = '300px';
    textCell.style.whiteSpace = 'nowrap';
    textCell.style.overflow = 'hidden';
    textCell.style.textOverflow = 'ellipsis';
    row.appendChild(textCell);

    tbody.appendChild(row);
  });

  summary.textContent = `Duración total: ${formatTime(totalDuration)} ${state.audioDuration > 0 ? `· Audio: ${formatTime(state.audioDuration)}` : ''}${Math.abs(totalDuration - state.audioDuration) > 0.1 ? ' ⚠ Desajuste' : ''}`;
}

function handleSceneZoomChange(e) {
  const index = parseInt(e.target.dataset.index, 10);
  const value = e.target.value;
  const scene = state.timeline[index];
  if (!scene) return;
  if (!value) {
    if (scene.zoom) delete scene.zoom.type;
    if (scene.zoom && !scene.zoom.type && scene.zoom.intensity == null) delete scene.zoom;
  } else {
    scene.zoom = { ...(scene.zoom || {}), type: value };
  }
}

function handleSceneIntensityChange(e) {
  const index = parseInt(e.target.dataset.index, 10);
  const scene = state.timeline[index];
  if (!scene) return;
  const value = parseFloat(e.target.value);
  if (isNaN(value) || value < 0) {
    e.target.value = Number(state.exportOptions.zoomIntensity).toFixed(2);
    return;
  }
  scene.zoom = { ...(scene.zoom || {}), intensity: Math.min(1, Math.max(0, value)) };
}

function handleSceneTransitionChange(e) {
  const index = parseInt(e.target.dataset.index, 10);
  const value = e.target.value;
  const scene = state.timeline[index];
  if (!scene) return;
  if (!value) {
    delete scene.transition;
  } else {
    scene.transition = { type: value };
  }
}

function applySceneSettingsToAll() {
  if (state.timeline.length === 0) return;
  const first = state.timeline[0];
  state.timeline.forEach((scene) => {
    scene.zoom = first.zoom ? { ...first.zoom } : undefined;
    if (!scene.zoom) delete scene.zoom;
    scene.transition = first.transition ? { ...first.transition } : undefined;
    if (!scene.transition) delete scene.transition;
  });
  renderTimeline();
  showToast('Ajustes de escena aplicados a todas', 'success');
}

function handleDurationChange(e) {
  const index = parseInt(e.target.dataset.index, 10);
  const newDuration = parseFloat(e.target.value);
  if (isNaN(newDuration) || newDuration < 0.1) {
    e.target.value = state.timeline[index].duration.toFixed(1);
    showToast('Duración inválida', 'error');
    return;
  }

  const oldDuration = state.timeline[index].duration;
  const diff = newDuration - oldDuration;

  state.timeline[index].duration = newDuration;
  state.timeline[index].end = state.timeline[index].start + newDuration;

  for (let i = index + 1; i < state.timeline.length; i++) {
    state.timeline[i].start += diff;
    state.timeline[i].end += diff;
  }

  renderTimeline();
}

async function handleImagesImport(filePaths) {
  const newImages = filePaths.map(filePath => ensureFocus({
    name: filePath.name,
    path: filePath.path,
    size: filePath.size || 0,
    type: 'image',
    preview: `file://${filePath.path}`
  }));

  state.images = [...state.images, ...newImages];
  renderImages();
  renderFocusEditor();
  updateTimeline();
  showToast(`${newImages.length} imagen(es) importada(s)`, 'success');
}

async function handleAudioImport(type, filePath) {
  try {
    const duration = await window.api.getAudioDuration(filePath.path);
    state.audioDuration = duration;
    state.audio[type] = {
      name: filePath.name,
      path: filePath.path,
      size: filePath.size || 0,
      type: 'audio',
      duration
    };
    renderAudio();
    updateTimeline();
    showToast(`${type === 'narration' ? 'Narración' : 'Música'} importada (${formatTime(duration)})`, 'success');
  } catch (err) {
    console.error('Error getting audio duration:', err);
    showToast(`Error al leer duración del audio: ${err.message}`, 'error');
  }
}

async function handleScriptLoad(content) {
  state.script.raw = content;
  const { scenes, warnings } = parseScenes(content);
  state.script.scenes = scenes;
  state.script.warnings = warnings;
  renderScript();
  updateTimeline();
  showToast(`${scenes.length} escena(s) detectada(s)`, 'success');
  if (warnings.length > 0) {
    showToast(`${warnings.length} aviso(s) en el guion`, 'warning');
  }
}

function updateTimeline() {
  const adjustToAudio = state.timelineOptions.adjustToAudio;
  state.timeline = buildTimeline(state.script.scenes, state.images, state.audioDuration, { adjustToAudio });
  renderTimeline();
  updateExportButton();
}

function updateExportButton() {
  const btn = document.getElementById('export-btn');
  if (!btn) return;
  const ready = state.timeline.length > 0
    && !!state.audio.narration
    && state.config.outputs.length > 0
    && state.timeline.every(s => !!s.image);
  btn.disabled = !ready || state.export.isRendering;
}

function setExportStatus(message, type = '') {
  const status = document.getElementById('export-status');
  if (!status) return;
  status.textContent = message;
  status.className = `export-status${type ? ' ' + type : ''}`;
  state.export.status = message;
}

function setExportProgress(progress) {
  const container = document.getElementById('export-progress');
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  const time = document.getElementById('progress-time');
  if (!container) return;

  state.export.progress = progress.progress;
  container.hidden = false;
  if (fill) fill.style.width = `${progress.progress}%`;
  if (text) text.textContent = `${progress.progress}%`;
  if (time) time.textContent = `${formatTime(progress.current)} / ${formatTime(state.audioDuration)}`;
}

function renderOutputChips() {
  document.querySelectorAll('#output-format-chips .format-chip').forEach(chip => {
    const active = state.config.outputs.includes(chip.dataset.format);
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  updateExportButton();
}

function toggleOutputFormat(format) {
  const idx = state.config.outputs.indexOf(format);
  if (idx >= 0) {
    if (state.config.outputs.length === 1) {
      showToast('Debe haber al menos un formato', 'warning');
      return;
    }
    state.config.outputs.splice(idx, 1);
  } else {
    state.config.outputs.push(format);
  }
  renderOutputChips();
}

function mergeSubtitleConfig(base, incoming) {
  if (!incoming) return { ...base };
  return {
    ...base,
    ...incoming,
    background: { ...base.background, ...(incoming.background || {}) },
    shadow: { ...base.shadow, ...(incoming.shadow || {}) },
    highlight: {
      ...base.highlight,
      ...(incoming.highlight || {}),
      colors: { ...base.highlight.colors, ...((incoming.highlight && incoming.highlight.colors) || {}) },
      detect: { ...base.highlight.detect, ...((incoming.highlight && incoming.highlight.detect) || {}) }
    }
  };
}

async function refreshFontList(preferredFamily) {
  const select = document.getElementById('subtitle-font');
  if (!select || !window.api || typeof window.api.listFonts !== 'function') return;

  let data;
  try {
    data = await window.api.listFonts();
  } catch (err) {
    showToast(`No se pudieron cargar las tipografías: ${err.message}`, 'error');
    return;
  }

  const families = [];
  for (const font of [...(data.bundled || []), ...(data.user || [])]) {
    if (font && font.family && !families.includes(font.family)) families.push(font.family);
  }

  const current = preferredFamily || state.config.subtitles.fontFamily;
  select.innerHTML = '';
  for (const family of families) {
    const option = document.createElement('option');
    option.value = family;
    option.textContent = family;
    select.appendChild(option);
  }

  if (families.includes(current)) {
    select.value = current;
  } else if (families.length > 0) {
    select.value = families[0];
    state.config.subtitles.fontFamily = families[0];
  }
  updateSubtitlePreview();
}

async function handleImportFont() {
  try {
    const result = await window.api.importFont();
    if (!result || !result.imported) return;
    await refreshFontList(result.imported.family);
    showToast(`Tipografía "${result.imported.family}" importada`, 'success');
  } catch (err) {
    showToast(`No se pudo importar la tipografía: ${err.message}`, 'error');
  }
}

function updateSubtitlePreview() {
  const box = document.getElementById('subtitle-preview');
  const text = document.getElementById('subtitle-preview-text');
  if (!box || !text) return;

  const style = state.config.subtitles;
  const factor = 0.32;
  text.style.fontFamily = `"${style.fontFamily}", sans-serif`;
  text.style.fontSize = `${Math.max(11, Math.round(style.fontSizeH * factor))}px`;
  text.style.fontWeight = style.bold ? '700' : '400';
  text.style.fontStyle = style.italic ? 'italic' : 'normal';
  text.style.letterSpacing = `${(Number(style.letterSpacing) || 0) * factor}px`;
  text.style.color = style.textColor;
  text.style.webkitTextStroke = style.outlineWidth > 0
    ? `${Math.max(1, Math.round(style.outlineWidth * factor))}px ${style.outlineColor}`
    : '0';

  if (style.shadow && style.shadow.enabled) {
    const rad = (Number(style.shadow.angle) || 0) * Math.PI / 180;
    const dx = (Number(style.shadow.distance) || 0) * Math.cos(rad) * factor;
    const dy = (Number(style.shadow.distance) || 0) * Math.sin(rad) * factor;
    text.style.textShadow = `${dx.toFixed(1)}px ${dy.toFixed(1)}px ${Math.max(0, Math.round(style.shadow.blur * factor))}px ${style.shadow.color}`;
  } else {
    text.style.textShadow = 'none';
  }

  if (style.background && style.background.enabled) {
    const hex = style.background.color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    box.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${style.background.opacity})`;
  } else {
    box.style.backgroundColor = 'transparent';
  }

  const col = ((Number(style.alignment) || 2) - 1) % 3;
  box.style.textAlign = col === 0 ? 'left' : (col === 1 ? 'center' : 'right');
}

function syncSubtitleControls() {
  const s = state.config.subtitles;
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = !!value;
    } else {
      el.value = value;
    }
  };

  setValue('subtitles-enabled', s.enabled);
  setValue('subtitle-size-h', s.fontSizeH);
  setValue('subtitle-size-v', s.fontSizeV);
  setValue('subtitle-bold', s.bold);
  setValue('subtitle-italic', s.italic);
  setValue('subtitle-letter-spacing', s.letterSpacing);
  setValue('subtitle-text-color', s.textColor);
  setValue('subtitle-outline-width', s.outlineWidth);
  setValue('subtitle-outline-color', s.outlineColor);
  setValue('subtitle-alignment', s.alignment);
  setValue('subtitle-margin-h', s.marginH);
  setValue('subtitle-margin-v', s.marginV);
  setValue('subtitles-background-enabled', s.background.enabled);
  setValue('subtitles-background-color', s.background.color);
  setValue('subtitles-background-opacity', s.background.opacity);
  setValue('subtitles-shadow-enabled', s.shadow.enabled);
  setValue('subtitles-shadow-color', s.shadow.color);
  setValue('subtitles-shadow-opacity', s.shadow.opacity);
  setValue('subtitles-shadow-distance', s.shadow.distance);
  setValue('subtitles-shadow-angle', s.shadow.angle);
  setValue('subtitles-shadow-blur', s.shadow.blur);
  setValue('subtitle-animation', s.animation);
}

function renderFocusEditor() {
  const select = document.getElementById('focus-image-select');
  const img = document.getElementById('focus-image');
  const bg = document.getElementById('focus-bg');
  const editor = document.getElementById('focus-editor');
  const empty = document.getElementById('focus-empty');
  const box = document.getElementById('focus-box');
  const applyBtn = document.getElementById('focus-apply-all-btn');
  const autoBtn = document.getElementById('focus-auto-btn');
  const resetBtn = document.getElementById('focus-reset-btn');
  const scaleInput = document.getElementById('focus-scale');
  if (!select || !img) return;

  const dims = FORMAT_DIMENSIONS[state.focus.format] || FORMAT_DIMENSIONS['16:9'];
  if (editor) editor.style.aspectRatio = `${dims.w} / ${dims.h}`;
  if (editor) {
    editor.style.backgroundColor = state.config.backgroundMode === 'blur'
      ? '#000000'
      : state.config.backgroundColor;
  }

  select.innerHTML = '';
  state.images.forEach((image, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = image.name;
    select.appendChild(option);
  });

  const disabled = state.images.length === 0;
  select.disabled = disabled;
  applyBtn.disabled = disabled;
  if (autoBtn) autoBtn.disabled = disabled;
  if (resetBtn) resetBtn.disabled = disabled;
  if (scaleInput) scaleInput.disabled = disabled;

  if (disabled) {
    empty.style.display = 'block';
    img.style.display = 'none';
    if (bg) bg.style.display = 'none';
    box.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  img.style.display = 'block';

  if (state.focus.imageIndex >= state.images.length) {
    state.focus.imageIndex = 0;
  }
  select.value = String(state.focus.imageIndex);

  const image = ensureFocus(state.images[state.focus.imageIndex]);
  img.src = `file://${image.path}`;
  if (bg) {
    bg.src = `file://${image.path}`;
    bg.style.display = state.config.backgroundMode === 'blur' ? 'block' : 'none';
  }
  updateFocusBoxPreview();
}

function updateFocusBoxPreview() {
  const img = document.getElementById('focus-image');
  const editor = document.getElementById('focus-editor');
  const box = document.getElementById('focus-box');
  const readout = document.getElementById('focus-readout');
  const scaleReadout = document.getElementById('focus-scale-readout');
  const scaleInput = document.getElementById('focus-scale');
  if (!img || !editor || !box) return;
  if (state.images.length === 0 || !img.naturalWidth) {
    box.style.display = 'none';
    return;
  }
  const image = state.images[state.focus.imageIndex];
  const geom = frameGeometry(image, state.focus.format, img.naturalWidth, img.naturalHeight);
  const rect = editor.getBoundingClientRect();
  const fw = rect.width || 640;
  const fh = rect.height || 360;

  img.style.width = `${fw / geom.frameW}px`;
  img.style.height = `${fh / geom.frameH}px`;
  img.style.left = `${(-geom.boxLeft / geom.frameW) * fw}px`;
  img.style.top = `${(-geom.boxTop / geom.frameH) * fh}px`;

  box.style.display = 'block';
  if (readout) readout.textContent = `${geom.fx.toFixed(2)}, ${geom.fy.toFixed(2)} · ×${geom.scale.toFixed(2)}`;
  if (scaleReadout) scaleReadout.textContent = geom.scale.toFixed(2);
  if (scaleInput) scaleInput.value = String(geom.scale);
}

function handleFocusPointer(e) {
  if (state.images.length === 0) return;
  const editor = document.getElementById('focus-editor');
  const img = document.getElementById('focus-image');
  if (!editor || !img || !img.naturalWidth) return;

  const rect = editor.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const gx = (e.clientX - rect.left) / rect.width;
  const gy = (e.clientY - rect.top) / rect.height;
  if (isNaN(gx) || isNaN(gy)) return;

  const image = ensureFocus(state.images[state.focus.imageIndex]);
  const geom = frameGeometry(image, state.focus.format, img.naturalWidth, img.naturalHeight);
  const u = geom.boxLeft + gx * geom.frameW;
  const v = geom.boxTop + gy * geom.frameH;

  const key = FORMAT_FOCUS_KEY[state.focus.format];
  image[key] = { x: clampFocus(u), y: clampFocus(v), scale: geom.scale };
  updateFocusBoxPreview();
}

function setFocusScale(value) {
  if (state.images.length === 0) return;
  const image = ensureFocus(state.images[state.focus.imageIndex]);
  const key = FORMAT_FOCUS_KEY[state.focus.format];
  image[key].scale = clampScale(value);
  updateFocusBoxPreview();
}

function applyAutoScale() {
  if (state.images.length === 0) return;
  const img = document.getElementById('focus-image');
  if (!img || !img.naturalWidth) return;
  const image = ensureFocus(state.images[state.focus.imageIndex]);
  const geom = frameGeometry(image, state.focus.format, img.naturalWidth, img.naturalHeight);
  const key = FORMAT_FOCUS_KEY[state.focus.format];
  image[key].scale = geom.autoScale;
  updateFocusBoxPreview();
  showToast(`Ajuste automático: escala ${geom.autoScale.toFixed(2)}`, 'success');
}

function resetFocus() {
  if (state.images.length === 0) return;
  const image = ensureFocus(state.images[state.focus.imageIndex]);
  const key = FORMAT_FOCUS_KEY[state.focus.format];
  image[key] = { x: DEFAULT_FOCUS.x, y: DEFAULT_FOCUS.y, scale: DEFAULT_SCALE };
  updateFocusBoxPreview();
  showToast('Encuadre restablecido', 'info');
}

function applyFocusToAll() {
  if (state.images.length === 0) return;
  const key = FORMAT_FOCUS_KEY[state.focus.format];
  const source = ensureFocus(state.images[state.focus.imageIndex])[key];
  state.images.forEach(image => {
    ensureFocus(image)[key] = { x: source.x, y: source.y, scale: source.scale };
  });
  updateFocusBoxPreview();
  showToast(`Encuadre aplicado a ${state.images.length} imagen(es) en ${state.focus.format}`, 'success');
}

async function handleOpenOutputFolder() {
  if (!state.export.outputFolder) return;
  try {
    await window.api.openFolder(state.export.outputFolder);
  } catch (err) {
    showToast(`No se pudo abrir la carpeta: ${err.message}`, 'error');
  }
}

function buildProjectData() {
  return {
    version: 1,
    images: state.images.map(image => ({
      name: image.name,
      path: image.path,
      focus169: image.focus169,
      focus916: image.focus916,
      focus11: image.focus11,
      focus45: image.focus45
    })),
    audio: {
      narration: state.audio.narration
        ? { name: state.audio.narration.name, path: state.audio.narration.path, duration: state.audioDuration || undefined }
        : null,
      music: state.audio.music ? { name: state.audio.music.name, path: state.audio.music.path } : null
    },
    script: { raw: state.script.raw },
    timeline: state.timeline.map(scene => {
      const item = { number: scene.number, duration: scene.duration, text: scene.text || '' };
      if (scene.zoom) item.zoom = { ...scene.zoom };
      if (scene.transition) item.transition = { ...scene.transition };
      return item;
    }),
    config: { ...state.config },
    renderOptions: { ...state.exportOptions },
    timelineOptions: { ...state.timelineOptions }
  };
}

function setProjectStatus(text, type) {
  const el = document.getElementById('project-status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('error', 'warning');
  if (type) el.classList.add(type);
}

async function handleSaveProject() {
  try {
    const result = await window.api.saveProject(buildProjectData());
    if (!result || !result.filePath) return;
    state.project.filePath = result.filePath;
    const name = result.filePath.split(/[\\/]/).pop();
    setProjectStatus(`Guardado: ${name}`);
    showToast('Proyecto guardado', 'success');
  } catch (err) {
    setProjectStatus('Error al guardar el proyecto', 'error');
    showToast(`No se pudo guardar: ${err.message}`, 'error');
  }
}

function loadProject(project, missing = []) {
  state.project.missing = missing.slice();
  state.images = project.images.map(image => {
    const loaded = ensureFocus({
      name: image.name,
      path: image.path,
      size: 0,
      type: 'image',
      preview: `file://${image.path}`,
      missing: missing.includes(image.path) ? true : !!image.missing
    });
    Object.values(FORMAT_FOCUS_KEY).forEach(key => {
      if (image[key]) loaded[key] = { ...image[key] };
    });
    return loaded;
  });

  state.audio = {
    narration: project.audio.narration
      ? { name: project.audio.narration.name, path: project.audio.narration.path }
      : null,
    music: project.audio.music
      ? { name: project.audio.music.name, path: project.audio.music.path }
      : null
  };
  state.audioDuration = project.audio.narration && project.audio.narration.duration
    ? project.audio.narration.duration
    : 0;
  state.script.raw = project.script.raw || '';
  state.config = {
    ...state.config,
    ...project.config,
    extras: { ...state.config.extras, ...(project.config.extras || {}) },
    subtitles: mergeSubtitleConfig(state.config.subtitles, project.config.subtitles)
  };
  state.exportOptions = { ...state.exportOptions, ...project.renderOptions };
  state.timelineOptions = { ...state.timelineOptions, ...project.timelineOptions };

  let accumulated = 0;
  state.timeline = project.timeline.map((scene, index) => {
    const start = accumulated;
    const end = accumulated + scene.duration;
    accumulated = end;
    const item = {
      number: scene.number,
      duration: scene.duration,
      start,
      end,
      image: state.images[index] || null,
      text: scene.text || ''
    };
    if (scene.zoom) item.zoom = { ...scene.zoom };
    if (scene.transition) item.transition = { ...scene.transition };
    return item;
  });

  const adjust = document.getElementById('adjust-timeline-checkbox');
  if (adjust) adjust.checked = !!state.timelineOptions.adjustToAudio;

  renderImages();
  renderAudio();
  renderTimeline();
  renderFocusEditor();
  renderOutputChips();
  updateExportButton();
  syncSubtitleControls();
  refreshFontList(state.config.subtitles.fontFamily);
}

async function handleOpenProject() {
  try {
    const result = await window.api.openProject();
    if (!result) return;
    state.project.filePath = result.filePath;
    loadProject(result.project, result.missing || []);
    const name = result.filePath.split(/[\\/]/).pop();
    if (result.missing && result.missing.length > 0) {
      setProjectStatus(`Abierto: ${name} · ${result.missing.length} archivo(s) no encontrados`, 'warning');
      showToast(`${result.missing.length} archivo(s) no encontrados en el disco`, 'warning');
    } else {
      setProjectStatus(`Abierto: ${name}`);
      showToast('Proyecto abierto', 'success');
    }
  } catch (err) {
    setProjectStatus('Error al abrir el proyecto', 'error');
    showToast(`No se pudo abrir: ${err.message}`, 'error');
  }
}

function buildExportImages() {
  const byPath = new Map(state.images.map(image => [image.path, image]));
  return state.timeline.map(scene => {
    const source = byPath.get(scene.image.path) || scene.image;
    const image = ensureFocus({
      name: scene.image.name,
      path: scene.image.path
    });
    Object.values(FORMAT_FOCUS_KEY).forEach(k => {
      if (source && source[k]) image[k] = { ...source[k] };
    });
    return image;
  });
}

async function handleExport() {
  if (state.export.isRendering) return;
  if (state.timeline.length === 0) {
    showToast('Genera la línea de tiempo primero', 'warning');
    return;
  }
  if (!state.audio.narration) {
    showToast('Importa la narración antes de exportar', 'warning');
    return;
  }
  const missing = state.timeline.filter(s => !s.image);
  if (missing.length > 0) {
    showToast(`Hay ${missing.length} escena(s) sin imagen`, 'error');
    setExportStatus('No se puede exportar: hay escenas sin imagen', 'error');
    return;
  }
  if (state.config.outputs.length === 0) {
    showToast('Selecciona al menos un formato de salida', 'warning');
    return;
  }

  let outputPath;
  try {
    outputPath = await window.api.saveVideo();
  } catch (err) {
    setExportStatus(`Error al elegir salida: ${err.message}`, 'error');
    return;
  }
  if (!outputPath) return;

  const scenes = state.timeline.map(s => {
    const scene = { number: s.number, duration: s.duration, text: s.text || '' };
    if (s.zoom) scene.zoom = { ...s.zoom };
    if (s.transition) scene.transition = { ...s.transition };
    return scene;
  });
  const images = buildExportImages();

  state.export.isRendering = true;
  state.export.progress = 0;
  updateExportButton();
  setExportProgress({ progress: 0, current: 0 });
  setExportStatus('Exportando…');

  const removeListener = window.api.onRenderProgress(setExportProgress);

  try {
    const result = await window.api.renderVideo({
      scenes,
      images,
      narration: state.audio.narration,
      music: state.audio.music,
      outputPath,
      audioDuration: state.audioDuration,
      outputIds: state.config.outputs.slice(),
      config: { ...state.config },
      renderOptions: { ...state.exportOptions }
    });

    const outputs = result.outputs && result.outputs.length ? result.outputs : [{ id: '16:9', outputPath: result.outputPath }];
    state.export.outputPath = result.outputPath;
    state.export.outputFolder = result.outputPath.replace(/[\\/][^\\/]*$/, '');
    setExportProgress({ progress: 100, current: state.audioDuration });

    const folderBtn = document.getElementById('open-output-folder-btn');
    if (folderBtn) folderBtn.hidden = false;

    const summary = outputs.map(o => `${o.id}: ${o.outputPath.split(/[\\/]/).pop()}`).join(' · ');
    setExportStatus(`Video exportado → ${summary}`, 'success');
    showToast(`Exportados ${outputs.length} formato(s)`, 'success');
  } catch (err) {
    setExportStatus(`Error al exportar: ${err.message}`, 'error');
    showToast('Error al exportar el video', 'error');
  } finally {
    state.export.isRendering = false;
    updateExportButton();
    if (typeof removeListener === 'function') removeListener();
  }
}

const CONTROLS = [
  {
    id: 'import-images-btn',
    tipo: 'button',
    rutaConfig: 'images',
    handler: async () => {
      try {
        const files = await window.api.openImages();
        if (files.length > 0) {
          await handleImagesImport(files);
        }
      } catch (err) {
        console.error('Error importing images:', err);
        showToast('Error al importar imágenes', 'error');
      }
    }
  },
  {
    id: 'images-drop-zone',
    tipo: 'dropzone',
    rutaConfig: 'images',
    handler: async (files) => {
      try {
        const filePaths = [];
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            const path = window.api.getPathForFile(file);
            filePaths.push({ name: file.name, path, size: file.size });
          }
        }
        if (filePaths.length > 0) {
          await handleImagesImport(filePaths);
        } else {
          showToast('No se detectaron archivos de imagen válidos', 'warning');
        }
      } catch (err) {
        console.error('Error processing dropped images:', err);
        showToast('Error al procesar archivos', 'error');
      }
    }
  },
  {
    id: 'import-audio-btn',
    tipo: 'button',
    rutaConfig: 'audio.narration',
    handler: async () => {
      try {
        const file = await window.api.openAudio();
        if (file) {
          await handleAudioImport('narration', file);
        }
      } catch (err) {
        console.error('Error importing narration:', err);
        showToast('Error al importar narración', 'error');
      }
    }
  },
  {
    id: 'audio-narration-drop',
    tipo: 'dropzone',
    rutaConfig: 'audio.narration',
    handler: async (files) => {
      try {
        const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
        if (audioFiles.length > 0) {
          const file = audioFiles[0];
          const path = window.api.getPathForFile(file);
          await handleAudioImport('narration', { name: file.name, path, size: file.size });
        } else {
          showToast('No se detectaron archivos de audio válidos', 'warning');
        }
      } catch (err) {
        console.error('Error processing dropped narration:', err);
        showToast('Error al procesar archivo', 'error');
      }
    }
  },
  {
    id: 'import-music-btn',
    tipo: 'button',
    rutaConfig: 'audio.music',
    handler: async () => {
      try {
        const file = await window.api.openMusic();
        if (file) {
          await handleAudioImport('music', file);
        }
      } catch (err) {
        console.error('Error importing music:', err);
        showToast('Error al importar música', 'error');
      }
    }
  },
  {
    id: 'audio-music-drop',
    tipo: 'dropzone',
    rutaConfig: 'audio.music',
    handler: async (files) => {
      try {
        const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
        if (audioFiles.length > 0) {
          const file = audioFiles[0];
          const path = window.api.getPathForFile(file);
          await handleAudioImport('music', { name: file.name, path, size: file.size });
        } else {
          showToast('No se detectaron archivos de audio válidos', 'warning');
        }
      } catch (err) {
        console.error('Error processing dropped music:', err);
        showToast('Error al procesar archivo', 'error');
      }
    }
  },
  {
    id: 'paste-script-btn',
    tipo: 'button',
    rutaConfig: 'script',
    handler: async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          await handleScriptLoad(text);
        } else {
          showToast('Portapapeles vacío', 'warning');
        }
      } catch (err) {
        console.error('Error reading clipboard:', err);
        showToast('Error al leer portapapeles', 'error');
      }
    }
  },
  {
    id: 'load-script-btn',
    tipo: 'button',
    rutaConfig: 'script',
    handler: async () => {
      try {
        const result = await window.api.openScript();
        if (result) {
          await handleScriptLoad(result.content);
        }
      } catch (err) {
        console.error('Error loading script:', err);
        showToast('Error al cargar guion', 'error');
      }
    }
  },
  {
    id: 'script-textarea',
    tipo: 'textarea',
    rutaConfig: 'script',
    handler: async (e) => {
      await handleScriptLoad(e.target.value);
    }
  },
  {
    id: 'adjust-timeline-checkbox',
    tipo: 'checkbox',
    rutaConfig: 'timelineOptions.adjustToAudio',
    handler: (e) => {
      state.timelineOptions.adjustToAudio = e.target.checked;
      updateTimeline();
    }
  },
  {
    id: 'apply-scene-settings-btn',
    tipo: 'button',
    handler: applySceneSettingsToAll
  },
  {
    id: 'save-project-btn',
    tipo: 'button',
    handler: handleSaveProject
  },
  {
    id: 'open-project-btn',
    tipo: 'button',
    handler: handleOpenProject
  },
  {
    id: 'zoom-enabled-checkbox',
    tipo: 'checkbox',
    rutaConfig: 'exportOptions.zoomEnabled',
    handler: (e) => {
      state.exportOptions.zoomEnabled = e.target.checked;
    }
  },
  {
    id: 'zoom-type',
    tipo: 'select',
    rutaConfig: 'exportOptions.zoomType',
    handler: (e) => {
      state.exportOptions.zoomType = ZOOM_TYPES.includes(e.target.value) ? e.target.value : 'kenburns';
    }
  },
  {
    id: 'zoom-mode',
    tipo: 'select',
    rutaConfig: 'exportOptions.zoomMode',
    handler: (e) => {
      state.exportOptions.zoomMode = ZOOM_MODES.includes(e.target.value) ? e.target.value : 'fixed';
    }
  },
  {
    id: 'zoom-seed',
    tipo: 'input',
    rutaConfig: 'exportOptions.zoomSeed',
    handler: (e) => {
      const value = parseInt(e.target.value, 10);
      state.exportOptions.zoomSeed = isNaN(value) ? 12345 : value;
    }
  },
  {
    id: 'zoom-start-scale',
    tipo: 'input',
    rutaConfig: 'exportOptions.zoomStartScale',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.exportOptions.zoomStartScale = isNaN(value) ? 1.0 : value;
    }
  },
  {
    id: 'zoom-intensity',
    tipo: 'input',
    rutaConfig: 'exportOptions.zoomIntensity',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.exportOptions.zoomIntensity = isNaN(value) ? 0 : value;
    }
  },
  {
    id: 'transition-type',
    tipo: 'select',
    rutaConfig: 'exportOptions.transitionType',
    handler: (e) => {
      state.exportOptions.transitionType = TRANSITION_TYPES.includes(e.target.value) ? e.target.value : 'fade';
    }
  },
  {
    id: 'transition-mode',
    tipo: 'select',
    rutaConfig: 'exportOptions.transitionMode',
    handler: (e) => {
      state.exportOptions.transitionMode = TRANSITION_MODES.includes(e.target.value) ? e.target.value : 'fixed';
    }
  },
  {
    id: 'transition-seed',
    tipo: 'input',
    rutaConfig: 'exportOptions.transitionSeed',
    handler: (e) => {
      const value = parseInt(e.target.value, 10);
      state.exportOptions.transitionSeed = isNaN(value) ? 4242 : value;
    }
  },
  {
    id: 'transition-duration',
    tipo: 'input',
    rutaConfig: 'exportOptions.transitionDuration',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.exportOptions.transitionDuration = isNaN(value) ? 1.0 : value;
    }
  },
  {
    id: 'badge-enabled',
    tipo: 'checkbox',
    rutaConfig: 'config.extras.badge.enabled',
    handler: (e) => {
      state.config.extras.badge.enabled = e.target.checked;
    }
  },
  {
    id: 'badge-text',
    tipo: 'input',
    rutaConfig: 'config.extras.badge.text',
    handler: (e) => {
      state.config.extras.badge.text = e.target.value;
    }
  },
  {
    id: 'badge-position',
    tipo: 'select',
    rutaConfig: 'config.extras.badge.position',
    handler: (e) => {
      state.config.extras.badge.position = e.target.value;
    }
  },
  {
    id: 'badge-animation',
    tipo: 'select',
    rutaConfig: 'config.extras.badge.animation',
    handler: (e) => {
      state.config.extras.badge.animation = e.target.value;
    }
  },
  {
    id: 'lower-third-enabled',
    tipo: 'checkbox',
    rutaConfig: 'config.extras.lowerThird.enabled',
    handler: (e) => {
      state.config.extras.lowerThird.enabled = e.target.checked;
    }
  },
  {
    id: 'lower-third-text',
    tipo: 'input',
    rutaConfig: 'config.extras.lowerThird.text',
    handler: (e) => {
      state.config.extras.lowerThird.text = e.target.value;
    }
  },
  {
    id: 'lower-third-opacity',
    tipo: 'input',
    rutaConfig: 'config.extras.lowerThird.opacity',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.config.extras.lowerThird.opacity = isNaN(value) ? 0.6 : Math.min(1, Math.max(0, value));
    }
  },
  {
    id: 'progress-bar-enabled',
    tipo: 'checkbox',
    rutaConfig: 'config.extras.progressBar.enabled',
    handler: (e) => {
      state.config.extras.progressBar.enabled = e.target.checked;
    }
  },
  {
    id: 'progress-bar-color',
    tipo: 'input',
    rutaConfig: 'config.extras.progressBar.color',
    handler: (e) => {
      state.config.extras.progressBar.color = e.target.value;
    }
  },
  {
    id: 'progress-bar-height',
    tipo: 'input',
    rutaConfig: 'config.extras.progressBar.height',
    handler: (e) => {
      const value = parseInt(e.target.value, 10);
      state.config.extras.progressBar.height = isNaN(value) ? 8 : Math.min(200, Math.max(1, value));
    }
  },
  {
    id: 'export-btn',
    tipo: 'button',
    rutaConfig: 'export',
    handler: handleExport
  },
  {
    id: 'open-output-folder-btn',
    tipo: 'button',
    rutaConfig: 'export',
    handler: handleOpenOutputFolder
  },
  {
    id: 'output-chip-16x9',
    tipo: 'button',
    rutaConfig: 'config.outputs',
    handler: () => toggleOutputFormat('16:9')
  },
  {
    id: 'output-chip-9x16',
    tipo: 'button',
    rutaConfig: 'config.outputs',
    handler: () => toggleOutputFormat('9:16')
  },
  {
    id: 'output-chip-1x1',
    tipo: 'button',
    rutaConfig: 'config.outputs',
    handler: () => toggleOutputFormat('1:1')
  },
  {
    id: 'output-chip-4x5',
    tipo: 'button',
    rutaConfig: 'config.outputs',
    handler: () => toggleOutputFormat('4:5')
  },
  {
    id: 'fit-mode',
    tipo: 'select',
    rutaConfig: 'config.fitMode',
    handler: (e) => {
      state.config.fitMode = e.target.value;
    }
  },
  {
    id: 'frame-color',
    tipo: 'input',
    rutaConfig: 'config.frameColor',
    handler: (e) => {
      state.config.frameColor = e.target.value;
    }
  },
  {
    id: 'focus-image-select',
    tipo: 'select',
    rutaConfig: 'focus.imageIndex',
    handler: (e) => {
      state.focus.imageIndex = parseInt(e.target.value, 10) || 0;
      renderFocusEditor();
    }
  },
  {
    id: 'focus-format-select',
    tipo: 'select',
    rutaConfig: 'focus.format',
    handler: (e) => {
      state.focus.format = e.target.value;
      renderFocusEditor();
    }
  },
  {
    id: 'focus-scale',
    tipo: 'range',
    rutaConfig: 'focus.scale',
    handler: (e) => {
      setFocusScale(parseFloat(e.target.value));
    }
  },
  {
    id: 'focus-auto-btn',
    tipo: 'button',
    rutaConfig: 'focus',
    handler: applyAutoScale
  },
  {
    id: 'focus-reset-btn',
    tipo: 'button',
    rutaConfig: 'focus',
    handler: resetFocus
  },
  {
    id: 'focus-apply-all-btn',
    tipo: 'button',
    rutaConfig: 'focus',
    handler: applyFocusToAll
  },
  {
    id: 'focus-editor',
    tipo: 'focuseditor',
    rutaConfig: 'focus',
    handler: handleFocusPointer
  },
  {
    id: 'background-mode',
    tipo: 'select',
    rutaConfig: 'config.backgroundMode',
    handler: (e) => {
      state.config.backgroundMode = e.target.value === 'blur' ? 'blur' : 'color';
      renderFocusEditor();
    }
  },
  {
    id: 'background-color',
    tipo: 'input',
    rutaConfig: 'config.backgroundColor',
    handler: (e) => {
      state.config.backgroundColor = e.target.value;
      if (state.config.backgroundMode !== 'blur') renderFocusEditor();
    }
  },
  {
    id: 'subtitles-enabled',
    tipo: 'checkbox',
    rutaConfig: 'config.subtitles.enabled',
    handler: (e) => {
      state.config.subtitles.enabled = e.target.checked;
    }
  },
  {
    id: 'subtitle-font',
    tipo: 'select',
    rutaConfig: 'config.subtitles.fontFamily',
    handler: (e) => {
      state.config.subtitles.fontFamily = e.target.value;
      updateSubtitlePreview();
    }
  },
  {
    id: 'import-font-btn',
    tipo: 'button',
    handler: handleImportFont
  },
  {
    id: 'subtitle-size-h',
    tipo: 'input',
    rutaConfig: 'config.subtitles.fontSizeH',
    handler: (e) => {
      const value = parseInt(e.target.value, 10);
      state.config.subtitles.fontSizeH = isNaN(value) ? 48 : Math.min(400, Math.max(8, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-size-v',
    tipo: 'input',
    rutaConfig: 'config.subtitles.fontSizeV',
    handler: (e) => {
      const value = parseInt(e.target.value, 10);
      state.config.subtitles.fontSizeV = isNaN(value) ? 64 : Math.min(400, Math.max(8, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-bold',
    tipo: 'checkbox',
    rutaConfig: 'config.subtitles.bold',
    handler: (e) => {
      state.config.subtitles.bold = e.target.checked;
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-italic',
    tipo: 'checkbox',
    rutaConfig: 'config.subtitles.italic',
    handler: (e) => {
      state.config.subtitles.italic = e.target.checked;
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-letter-spacing',
    tipo: 'input',
    rutaConfig: 'config.subtitles.letterSpacing',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.config.subtitles.letterSpacing = isNaN(value) ? 0 : Math.min(50, Math.max(-20, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-text-color',
    tipo: 'input',
    rutaConfig: 'config.subtitles.textColor',
    handler: (e) => {
      state.config.subtitles.textColor = e.target.value;
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-outline-width',
    tipo: 'input',
    rutaConfig: 'config.subtitles.outlineWidth',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.config.subtitles.outlineWidth = isNaN(value) ? 0 : Math.min(50, Math.max(0, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-outline-color',
    tipo: 'input',
    rutaConfig: 'config.subtitles.outlineColor',
    handler: (e) => {
      state.config.subtitles.outlineColor = e.target.value;
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-alignment',
    tipo: 'select',
    rutaConfig: 'config.subtitles.alignment',
    handler: (e) => {
      const value = parseInt(e.target.value, 10);
      state.config.subtitles.alignment = isNaN(value) ? 2 : Math.min(9, Math.max(1, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-margin-h',
    tipo: 'input',
    rutaConfig: 'config.subtitles.marginH',
    handler: (e) => {
      const value = parseInt(e.target.value, 10);
      state.config.subtitles.marginH = isNaN(value) ? 40 : Math.min(1000, Math.max(0, value));
    }
  },
  {
    id: 'subtitle-margin-v',
    tipo: 'input',
    rutaConfig: 'config.subtitles.marginV',
    handler: (e) => {
      const value = parseInt(e.target.value, 10);
      state.config.subtitles.marginV = isNaN(value) ? 40 : Math.min(1000, Math.max(0, value));
    }
  },
  {
    id: 'subtitles-background-enabled',
    tipo: 'checkbox',
    rutaConfig: 'config.subtitles.background.enabled',
    handler: (e) => {
      state.config.subtitles.background.enabled = e.target.checked;
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitles-background-color',
    tipo: 'input',
    rutaConfig: 'config.subtitles.background.color',
    handler: (e) => {
      state.config.subtitles.background.color = e.target.value;
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitles-background-opacity',
    tipo: 'input',
    rutaConfig: 'config.subtitles.background.opacity',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.config.subtitles.background.opacity = isNaN(value) ? 0.5 : Math.min(1, Math.max(0, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitles-shadow-enabled',
    tipo: 'checkbox',
    rutaConfig: 'config.subtitles.shadow.enabled',
    handler: (e) => {
      state.config.subtitles.shadow.enabled = e.target.checked;
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitles-shadow-color',
    tipo: 'input',
    rutaConfig: 'config.subtitles.shadow.color',
    handler: (e) => {
      state.config.subtitles.shadow.color = e.target.value;
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitles-shadow-opacity',
    tipo: 'input',
    rutaConfig: 'config.subtitles.shadow.opacity',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.config.subtitles.shadow.opacity = isNaN(value) ? 0.7 : Math.min(1, Math.max(0, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitles-shadow-distance',
    tipo: 'input',
    rutaConfig: 'config.subtitles.shadow.distance',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.config.subtitles.shadow.distance = isNaN(value) ? 3 : Math.min(100, Math.max(0, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitles-shadow-angle',
    tipo: 'input',
    rutaConfig: 'config.subtitles.shadow.angle',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.config.subtitles.shadow.angle = isNaN(value) ? 45 : Math.min(360, Math.max(0, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitles-shadow-blur',
    tipo: 'input',
    rutaConfig: 'config.subtitles.shadow.blur',
    handler: (e) => {
      const value = parseFloat(e.target.value);
      state.config.subtitles.shadow.blur = isNaN(value) ? 4 : Math.min(100, Math.max(0, value));
      updateSubtitlePreview();
    }
  },
  {
    id: 'subtitle-animation',
    tipo: 'select',
    rutaConfig: 'config.subtitles.animation',
    handler: (e) => {
      state.config.subtitles.animation = ['none', 'fade', 'pop'].includes(e.target.value) ? e.target.value : 'none';
    }
  }
];

function setupControl(control) {
  const element = document.getElementById(control.id);
  if (!element) {
    console.warn(`Control not found: ${control.id}`);
    return;
  }

  try {
    if (control.tipo === 'button') {
      element.addEventListener('click', control.handler);
    } else if (control.tipo === 'dropzone') {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        element.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        element.addEventListener(eventName, () => {
          element.classList.add('drag-active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        element.addEventListener(eventName, () => {
          element.classList.remove('drag-active');
        }, false);
      });

      element.addEventListener('drop', (e) => {
        control.handler(e.dataTransfer.files);
      });

      element.addEventListener('click', () => {
        const btn = document.getElementById(control.id.replace('-drop', '-btn'));
        if (btn) btn.click();
      });

      element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const btn = document.getElementById(control.id.replace('-drop', '-btn'));
          if (btn) btn.click();
        }
      });
    } else if (control.tipo === 'textarea') {
      element.addEventListener('input', control.handler);
    } else if (control.tipo === 'checkbox') {
      element.addEventListener('change', control.handler);
    } else if (control.tipo === 'input') {
      element.addEventListener('input', control.handler);
      element.addEventListener('change', control.handler);
    } else if (control.tipo === 'range') {
      element.addEventListener('input', control.handler);
      element.addEventListener('change', control.handler);
    } else if (control.tipo === 'select') {
      element.addEventListener('change', control.handler);
    } else if (control.tipo === 'focuseditor') {
      let dragging = false;
      element.addEventListener('click', control.handler);
      element.addEventListener('pointerdown', (e) => {
        dragging = true;
        if (element.setPointerCapture) element.setPointerCapture(e.pointerId);
        control.handler(e);
      });
      element.addEventListener('pointermove', (e) => {
        if (dragging) control.handler(e);
      });
      element.addEventListener('pointerup', () => {
        dragging = false;
      });
      element.addEventListener('pointercancel', () => {
        dragging = false;
      });
      element.addEventListener('wheel', (e) => {
        e.preventDefault();
        const current = state.images.length
          ? clampScale(ensureFocus(state.images[state.focus.imageIndex])[FORMAT_FOCUS_KEY[state.focus.format]].scale)
          : DEFAULT_SCALE;
        setFocusScale(current + (e.deltaY < 0 ? 0.05 : -0.05));
      }, { passive: false });
      const focusImage = document.getElementById('focus-image');
      if (focusImage) focusImage.addEventListener('load', updateFocusBoxPreview);
    }
  } catch (err) {
    console.error(`Error setting up control ${control.id}:`, err);
    showToast(`Error al inicializar control: ${control.id}`, 'error');
  }
}

function setupDropZoneImages() {
  const dropZone = document.getElementById('images-drop-zone');
  const importBtn = document.getElementById('import-images-btn');

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('drag-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('drag-active');
    }, false);
  });

  dropZone.addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    );

    if (files.length === 0) {
      showToast('No se detectaron archivos de imagen válidos', 'warning');
      return;
    }

    try {
      const filePaths = [];
      for (const file of files) {
        const path = window.api.getPathForFile(file);
        filePaths.push({ name: file.name, path, size: file.size });
      }
      await handleImagesImport(filePaths);
    } catch (err) {
      console.error('Error processing dropped files:', err);
      showToast('Error al procesar archivos', 'error');
    }
  });

  dropZone.addEventListener('click', () => importBtn.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      importBtn.click();
    }
  });
}

function renderAll() {
  renderImages();
  renderAudio();
  renderScript();
  renderTimeline();
}

window.__TEST_CONTROLS__ = CONTROLS.map(control => ({
  id: control.id,
  tipo: control.tipo,
  hasHandler: typeof control.handler === 'function'
}));
window.__TEST_STATE__ = state;
window.__TEST_RENDER__ = { renderImages, renderAudio, renderScript, renderTimeline, renderAll, updateExportButton, setExportStatus, renderFocusEditor, updateFocusBoxPreview, renderOutputChips, setFocusScale, applyAutoScale, resetFocus, updateSubtitlePreview, syncSubtitleControls, refreshFontList };
window.__TEST_EXPORT__ = { handleExport, handleOpenOutputFolder, toggleOutputFormat, buildExportImages, frameGeometry, buildProjectData, loadProject, handleSaveProject, handleOpenProject };

document.addEventListener('DOMContentLoaded', () => {
  setupDropZoneImages();

  CONTROLS.forEach(setupControl);

  renderAll();
  renderOutputChips();
  renderFocusEditor();
  updateExportButton();
  syncSubtitleControls();
  refreshFontList();
  updateSubtitlePreview();

  console.log('Video Maker v0.5.1 - Renderer loaded');
});