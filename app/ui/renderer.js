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
  config: {
    outputs: ['16:9'],
    fitMode: 'cover',
    frameColor: '#000000',
    musicVolume: 0.3
  },
  focus: {
    imageIndex: 0,
    format: '16:9'
  },
  exportOptions: {
    zoomEnabled: true,
    zoomStartScale: 1.0,
    zoomIntensity: 0.15,
    transitionType: 'fade',
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
    if (!image[key] || typeof image[key].x !== 'number' || typeof image[key].y !== 'number') {
      image[key] = { ...DEFAULT_FOCUS };
    }
  });
  return image;
}

function clampFocus(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function focusBox(image, formatId, naturalWidth, naturalHeight) {
  const dims = FORMAT_DIMENSIONS[formatId] || FORMAT_DIMENSIONS['16:9'];
  const targetAspect = dims.w / dims.h;
  const imageAspect = naturalWidth / naturalHeight;
  let width;
  let height;
  if (imageAspect > targetAspect) {
    height = 1;
    width = (naturalHeight * targetAspect) / naturalWidth;
  } else {
    width = 1;
    height = (naturalWidth / targetAspect) / naturalHeight;
  }
  const focus = (image && image[FORMAT_FOCUS_KEY[formatId]]) || DEFAULT_FOCUS;
  const fx = clampFocus(focus.x);
  const fy = clampFocus(focus.y);
  const halfW = width / 2;
  const halfH = height / 2;
  const left = Math.min(1 - width, Math.max(0, fx - halfW));
  const top = Math.min(1 - height, Math.max(0, fy - halfH));
  return { left, top, width, height, fx, fy };
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

function renderFocusEditor() {
  const select = document.getElementById('focus-image-select');
  const img = document.getElementById('focus-image');
  const empty = document.getElementById('focus-empty');
  const box = document.getElementById('focus-box');
  const applyBtn = document.getElementById('focus-apply-all-btn');
  if (!select || !img) return;

  select.innerHTML = '';
  state.images.forEach((image, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = image.name;
    select.appendChild(option);
  });

  if (state.images.length === 0) {
    select.disabled = true;
    applyBtn.disabled = true;
    empty.style.display = 'block';
    img.style.display = 'none';
    box.style.display = 'none';
    return;
  }

  select.disabled = false;
  applyBtn.disabled = false;
  empty.style.display = 'none';
  img.style.display = 'block';

  if (state.focus.imageIndex >= state.images.length) {
    state.focus.imageIndex = 0;
  }
  select.value = String(state.focus.imageIndex);

  const image = ensureFocus(state.images[state.focus.imageIndex]);
  img.src = `file://${image.path}`;
  updateFocusBoxPreview();
}

function updateFocusBoxPreview() {
  const img = document.getElementById('focus-image');
  const box = document.getElementById('focus-box');
  const readout = document.getElementById('focus-readout');
  if (!img || !box) return;
  if (state.images.length === 0 || !img.naturalWidth) {
    box.style.display = 'none';
    return;
  }
  const image = state.images[state.focus.imageIndex];
  const geom = focusBox(image, state.focus.format, img.naturalWidth, img.naturalHeight);
  box.style.display = 'block';
  box.style.left = `${geom.left * 100}%`;
  box.style.top = `${geom.top * 100}%`;
  box.style.width = `${geom.width * 100}%`;
  box.style.height = `${geom.height * 100}%`;
  if (readout) readout.textContent = `${geom.fx.toFixed(2)}, ${geom.fy.toFixed(2)}`;
}

function handleFocusPointer(e) {
  if (state.images.length === 0) return;
  const editor = document.getElementById('focus-editor');
  const img = document.getElementById('focus-image');
  if (!editor || !img || !img.naturalWidth) return;

  const rect = img.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  if (isNaN(px) || isNaN(py)) return;

  const image = ensureFocus(state.images[state.focus.imageIndex]);
  const geom = focusBox(image, state.focus.format, img.naturalWidth, img.naturalHeight);
  const halfW = geom.width / 2;
  const halfH = geom.height / 2;
  const fx = Math.min(1 - halfW, Math.max(halfW, px));
  const fy = Math.min(1 - halfH, Math.max(halfH, py));

  image[FORMAT_FOCUS_KEY[state.focus.format]] = { x: fx, y: fy };
  updateFocusBoxPreview();
}

function applyFocusToAll() {
  if (state.images.length === 0) return;
  const key = FORMAT_FOCUS_KEY[state.focus.format];
  const source = ensureFocus(state.images[state.focus.imageIndex])[key];
  state.images.forEach(image => {
    ensureFocus(image)[key] = { ...source };
  });
  updateFocusBoxPreview();
  showToast(`Enfoque aplicado a ${state.images.length} imagen(es) en ${state.focus.format}`, 'success');
}

async function handleOpenOutputFolder() {
  if (!state.export.outputFolder) return;
  try {
    await window.api.openFolder(state.export.outputFolder);
  } catch (err) {
    showToast(`No se pudo abrir la carpeta: ${err.message}`, 'error');
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

  const scenes = state.timeline.map(s => ({ number: s.number, duration: s.duration }));
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
    id: 'zoom-enabled-checkbox',
    tipo: 'checkbox',
    rutaConfig: 'exportOptions.zoomEnabled',
    handler: (e) => {
      state.exportOptions.zoomEnabled = e.target.checked;
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
      state.exportOptions.transitionType = e.target.value === 'cut' ? 'cut' : 'fade';
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
      updateFocusBoxPreview();
    }
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

window.__TEST_STATE__ = state;
window.__TEST_RENDER__ = { renderImages, renderAudio, renderScript, renderTimeline, renderAll, updateExportButton, setExportStatus, renderFocusEditor, updateFocusBoxPreview, renderOutputChips };
window.__TEST_EXPORT__ = { handleExport, handleOpenOutputFolder, toggleOutputFormat, buildExportImages };

document.addEventListener('DOMContentLoaded', () => {
  setupDropZoneImages();

  CONTROLS.forEach(setupControl);

  renderAll();
  renderOutputChips();
  renderFocusEditor();
  updateExportButton();

  console.log('Video Maker v0.4.0 - Renderer loaded');
});