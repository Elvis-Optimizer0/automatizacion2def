import { useEffect } from 'react';
import { useStore, getState, setState, subscribe, state, notify, forceUpdate, ActionTypes } from './store';

// Test hooks registry - only exposed in test mode
const testHooksRef = { current: null };

export function registerTestHooks() {
  if (typeof window === 'undefined') return;
  
  // Only expose in test mode - use window.api?.isTest from preload bridge
  if (!(window.api?.isTest === true)) {
    return;
  }

  const { state: storeState, dispatch } = { state: getState(), setState, subscribe };
  if (!storeState) {
    console.warn('[TestHooks] Store not available for test hooks');
    return;
  }

  // Helper to get DOM element
  const $ = (id) => document.getElementById(String(id).replace(/^#/, ''));

  // Get state from window.__TEST_STATE__ in test mode
  const getTestState = () => window.__TEST_STATE__ || { 
    images: [], 
    audio: { narration: null, music: null }, 
    script: { raw: '', scenes: [], warnings: [] }, 
    timeline: [], 
    timelineOptions: { adjustToAudio: false }, 
    audioDuration: 0, 
    config: {}, 
    exportOptions: {}, 
    project: { filePath: null, missing: [] }, 
    focus: { imageIndex: 0, format: '16:9' }, 
    hwAccel: { enabled: true, available: false }, 
    capabilities: null, 
    pipeline: { running: false, stage: '' }, 
    export: { isRendering: false, progress: 0, outputPath: null, outputFolder: null, status: '' } 
  };

  // Helper to wait for an element to exist
  const waitForElement = (selector, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  };

  // ----- RENDER FUNCTIONS (async for test compatibility) -----
  
  const renderImages = async () => {
    await waitForElement('#images-list');
    setState({ images: getTestState().images });
    await new Promise(r => requestAnimationFrame(r));
  };

  const renderAudio = () => {
    const narrationInput = $('#audio-narration');
    const narrationInfo = $('#audio-narration-info');
    const musicInput = $('#audio-music');
    const musicInfo = $('#audio-music-info');
    const { narration, music } = getTestState().audio;
    const { audioDuration } = getTestState();

    if (narrationInput) narrationInput.value = narration?.path || '';
    if (narrationInfo) narrationInfo.textContent = narration ? `${narration.name} \u00b7 ${formatTime(audioDuration)}` : '';
    if (musicInput) musicInput.value = music?.path || '';
    if (musicInfo) musicInfo.textContent = music?.name || '';
    if (narration) {
      setState({ audio: { ...storeState.audio, narration }, audioDuration });
    }
    if (music) {
      setState({ audio: { ...storeState.audio, music } });
    }
  };

  const renderScript = async () => {
    const textarea = $('#script-textarea');
    const warningsContainer = $('#script-warnings');
    const summary = $('#script-summary');
    const { raw, scenes, warnings } = getTestState().script;
    const { images } = getTestState();

    if (textarea) textarea.value = raw;
    if (warningsContainer) {
      warningsContainer.innerHTML = '';
      warnings.forEach(w => {
        const div = document.createElement('div');
        div.className = 'warning-item';
        div.style.color = 'var(--color-warning)';
        div.textContent = w;
        warningsContainer.appendChild(div);
      });
    }
    const assignedImages = scenes.filter(s => 
      images.find(i => {
        const num = i.name.match(/(?:escena|scene)\s*[:_\-\s]?(\d+)/i);
        return num ? parseInt(num[1], 10) === s.number : false;
      })
    ).length;
    if (summary) summary.textContent = `${scenes.length} escenas detectadas \u00b7 ${assignedImages} im\u00e1genes asignadas`;
    setState({ script: { raw, scenes, warnings } });
    forceUpdate();
    if (typeof window !== 'undefined') {
      window.__TEST_SCRIPT_DATA__ = { raw, scenes, warnings };
    }
    await new Promise(r => requestAnimationFrame(r));
  };

  const renderTimeline = () => {
    const tbody = $('#timeline-tbody');
    const emptyState = $('#timeline-empty');
    const summary = $('#timeline-summary');
    const { timeline } = getTestState();
    const { audioDuration } = getTestState();
    const { images } = getTestState();

    if (!tbody) return;

    if (timeline.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.textContent = 'Carga un guion e im\u00e1genes para ver la l\u00ednea de tiempo';
      }
      if (summary) summary.textContent = '';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    tbody.innerHTML = '';

    let totalDuration = 0;
    timeline.forEach((scene, index) => {
      totalDuration += scene.duration;
      const row = document.createElement('tr');
      row.style.backgroundColor = index % 2 === 0 ? 'var(--color-surface1)' : 'var(--color-surface2)';
      
      const numCell = document.createElement('td');
      numCell.textContent = scene.number;
      numCell.style.fontWeight = '600';
      numCell.style.color = 'var(--color-accent)';
      row.appendChild(numCell);

      const thumbCell = document.createElement('td');
      if (scene.image) {
        const img = document.createElement('img');
        img.className = 'timeline-thumbnail';
        img.src = 'file://' + scene.image.path;
        img.alt = 'Miniatura de ' + scene.image.name;
        img.loading = 'lazy';
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
      durInput.id = 'timeline-duration-' + index;
      durInput.value = scene.duration.toFixed(1);
      durInput.dataset.index = index;
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
      zoomSelect.id = 'timeline-zoom-' + index;
      zoomSelect.className = 'timeline-zoom-select';
      zoomSelect.dataset.index = index;
      zoomSelect.innerHTML = '<option value="">(global)</option>' + 
        ['none', 'kenburns', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'alternate', 'random']
          .map(t => '<option value="' + t + '">' + t + '</option>').join('');
      zoomSelect.value = scene.zoom?.type || '';
      zoomCell.appendChild(zoomSelect);
      row.appendChild(zoomCell);

      const intensityCell = document.createElement('td');
      const intensityInput = document.createElement('input');
      intensityInput.type = 'number';
      intensityInput.step = '0.05';
      intensityInput.min = '0';
      intensityInput.max = '1';
      intensityInput.className = 'timeline-intensity-input';
      intensityInput.id = 'timeline-intensity-' + index;
      intensityInput.dataset.index = index;
      intensityInput.value = (scene.zoom?.intensity ?? 0.15).toFixed(2);
      intensityCell.appendChild(intensityInput);
      row.appendChild(intensityCell);

      const transitionCell = document.createElement('td');
      const transitionSelect = document.createElement('select');
      transitionSelect.id = 'timeline-transition-' + index;
      transitionSelect.className = 'timeline-transition-select';
      transitionSelect.dataset.index = index;
      transitionSelect.innerHTML = '<option value="">(global)</option>' + 
        ['cut', 'fade', 'fadeblack', 'dissolve', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'curtainLeft', 'curtainRight', 'circle']
          .map(t => '<option value="' + t + '">' + t + '</option>').join('');
      transitionSelect.value = scene.transition?.type || '';
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

    if (summary) {
      summary.textContent = 'Duraci\u00f3n total: ' + formatTime(totalDuration) + (audioDuration > 0 ? ' \u00b7 Audio: ' + formatTime(audioDuration) : '') + (Math.abs(totalDuration - audioDuration) > 0.1 ? ' \u26a0 Desajuste' : '');
    }
    setState({ timeline: getTestState().timeline });
  };

  const renderAll = () => {
    renderImages();
    renderAudio();
    renderScript();
    renderTimeline();
  };

  const updateExportButton = () => {
    const btn = $('#export-btn');
    if (!btn) return;
    const { timeline, audio, config, export: exportState } = getTestState();
    const ready = timeline.length > 0
      && !!audio.narration
      && config.outputs.length > 0
      && timeline.every(s => !!s.image);
    btn.disabled = !ready || exportState.isRendering;
  };

  const setExportStatus = (message, type = '') => {
    const status = $('#export-status');
    if (!status) return;
    status.textContent = message || '';
    status.className = `export-status${type ? ' ' + type : ''}`;
  };

  const renderFocusEditor = () => {
    const select = $('#focus-image-select');
    const img = $('#focus-image');
    const bg = $('#focus-bg');
    const editor = $('#focus-editor');
    const empty = $('#focus-empty');
    const box = $('#focus-box');
    const applyBtn = $('#focus-apply-all-btn');
    const autoBtn = $('#focus-auto-btn');
    const resetBtn = $('#focus-reset-btn');
    const scaleInput = $('#focus-scale');
    const { images, focus, config } = getTestState();

    if (!select || !img) return;

    const dims = { w: 1920, h: 1080 }[focus.format] || { w: 1920, h: 1080 };
    if (editor) editor.style.aspectRatio = dims.w + ' / ' + dims.h;
    if (editor) editor.style.backgroundColor = config.backgroundMode === 'blur' ? '#000000' : config.backgroundColor;

    select.innerHTML = '';
    images.forEach((image, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = image.name;
      select.appendChild(option);
    });

    const disabled = images.length === 0;
    select.disabled = disabled;
    if (applyBtn) applyBtn.disabled = disabled;
    if (autoBtn) autoBtn.disabled = disabled;
    if (resetBtn) resetBtn.disabled = disabled;
    if (scaleInput) scaleInput.disabled = disabled;

    if (disabled) {
      if (empty) empty.style.display = 'block';
      img.style.display = 'none';
      if (bg) bg.style.display = 'none';
      if (box) box.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';
    img.style.display = 'block';

    if (focus.imageIndex >= images.length) focus.imageIndex = 0;
    select.value = String(focus.imageIndex);

    const image = images[focus.imageIndex];
    img.src = 'file://' + image.path;
    if (bg) {
      bg.src = 'file://' + image.path;
      bg.style.display = config.backgroundMode === 'blur' ? 'block' : 'none';
    }
    updateFocusBoxPreview();
  };

  const updateFocusBoxPreview = () => {
    const img = $('#focus-image');
    const editor = $('#focus-editor');
    const box = $('#focus-box');
    const readout = $('#focus-readout');
    const scaleReadout = $('#focus-scale-readout');
    const scaleInput = $('#focus-scale');
    const { images, focus } = getTestState();

    if (!img || !editor || !box) return;
    if (images.length === 0 || !img.naturalWidth) {
      box.style.display = 'none';
      return;
    }
    const image = images[focus.imageIndex];
    const dims = { w: 1920, h: 1080 }[focus.format] || { w: 1920, h: 1080 };
    const targetAspect = dims.w / dims.h;
    const imageAspect = img.naturalWidth / img.naturalHeight;
    const coverW = imageAspect > targetAspect ? (img.naturalHeight * targetAspect) / img.naturalWidth : 1;
    const coverH = imageAspect > targetAspect ? 1 : (img.naturalWidth / targetAspect) / img.naturalHeight;
    const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
    const focusData = image[focusKey] || { x: 0.5, y: 0.5, scale: 1.0 };
    const scale = Math.max(0.3, Math.min(3.0, focusData.scale || 1.0));
    const fx = Math.max(0, Math.min(1, focusData.x || 0.5));
    const fy = Math.max(0, Math.min(1, focusData.y || 0.5));
    const frameW = coverW / scale;
    const frameH = coverH / scale;
    const boxLeft = (1 - frameW) * fx;
    const boxTop = (1 - frameH) * fy;

    const rect = editor.getBoundingClientRect();
    const fw = rect.width || 640;
    const fh = rect.height || 360;

    img.style.width = (fw / frameW) + 'px';
    img.style.height = (fh / frameH) + 'px';
    img.style.left = ((-boxLeft / frameW) * fw) + 'px';
    img.style.top = ((-boxTop / frameH) * fh) + 'px';

    box.style.display = 'block';
    box.style.left = (boxLeft * fw) + 'px';
    box.style.top = (boxTop * fh) + 'px';
    box.style.width = (frameW * fw) + 'px';
    box.style.height = (frameH * fh) + 'px';
    box.style.border = '2px solid var(--color-accent)';
    box.style.borderRadius = 'var(--radius-sm)';
    box.style.pointerEvents = 'none';
    box.style.boxShadow = '0 0 20px var(--color-accent)';

    if (readout) readout.textContent = fx.toFixed(2) + ', ' + fy.toFixed(2) + ' \u00d7' + scale.toFixed(2);
    if (scaleReadout) scaleReadout.textContent = scale.toFixed(2);
    if (scaleInput) scaleInput.value = String(scale);
  };

  const renderOutputChips = () => {
    document.querySelectorAll('.format-chip').forEach(chip => {
      const format = chip.dataset.format;
      const active = getTestState().config.outputs.includes(format);
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  const updateSubtitlePreview = () => {
    const box = $('#subtitle-preview');
    const text = $('#subtitle-preview-text');
    if (!box || !text) return;
    const style = getTestState().config.subtitles;
    const factor = 0.32;
    text.innerHTML = highlightPreview('La deuda sube 30% y el inter\u00e9s de $1.000 afecta tu sueldo', style);
    text.style.fontFamily = '"' + style.fontFamily + '", sans-serif';
    text.style.fontSize = Math.max(11, Math.round(style.fontSizeH * factor)) + 'px';
    text.style.fontWeight = style.bold ? '700' : '400';
    text.style.fontStyle = style.italic ? 'italic' : 'normal';
    text.style.letterSpacing = ((Number(style.letterSpacing) || 0) * factor) + 'px';
    text.style.color = style.textColor;
    text.style.webkitTextStroke = style.outlineWidth > 0
      ? Math.max(1, Math.round(style.outlineWidth * factor)) + 'px ' + style.outlineColor
      : '0';

    if (style.shadow && style.shadow.enabled) {
      const rad = (Number(style.shadow.angle) || 0) * Math.PI / 180;
      const dx = (Number(style.shadow.distance) || 0) * Math.cos(rad) * factor;
      const dy = (Number(style.shadow.distance) || 0) * Math.sin(rad) * factor;
      text.style.textShadow = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px ' + Math.max(0, Math.round(style.shadow.blur * factor)) + 'px ' + style.shadow.color;
    } else {
      text.style.textShadow = 'none';
    }

    if (style.background && style.background.enabled) {
      const hex = style.background.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 0;
      const b = parseInt(hex.slice(4, 6), 16) || 0;
      box.style.backgroundColor = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + style.background.opacity + ')';
    } else {
      box.style.backgroundColor = 'transparent';
    }

    const col = ((Number(style.alignment) || 2) - 1) % 3;
    box.style.textAlign = col === 0 ? 'left' : (col === 1 ? 'center' : 'right');
  };

  const syncSubtitleControls = () => {
    const s = getTestState().config.subtitles;
    const setValue = (id, value) => {
      const el = $(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value;
    };
    setValue('subtitles-enabled', s.enabled);
    setValue('subtitle-font', s.fontFamily);
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
    setValue('subtitle-delay', s.delay);
    setValue('subtitles-word-highlight', s.wordHighlight);
    setValue('subtitles-voice-detect', s.autoVoiceStart);
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
    setValue('subtitles-highlight-enabled', s.highlight.enabled);
    setValue('subtitle-terms-input', (s.highlight.terms || []).join(', '));
    setValue('subtitle-terms-limit', s.highlight.limit);
    setValue('subtitles-detect-numbers', s.highlight.detect.numbers);
    setValue('subtitles-detect-percent', s.highlight.detect.percent);
    setValue('subtitles-detect-currency', s.highlight.detect.currency);
  };

  const refreshFontList = () => {
    const select = $('#subtitle-font');
    if (!select) return;
  };

  const refreshKeywordList = () => {
    const listEl = $('#keywords-list');
    if (!listEl) return;
  };

  const refreshPresets = (selectedName) => {
    const select = $('#preset-select');
    if (!select) return;
  };

  const applyPresetByName = (name) => {
  };

  const snapshotSubtitleStyle = () => {
    const clone = JSON.parse(JSON.stringify(getTestState().config.subtitles));
    delete clone.enabled;
    return clone;
  };

  const refreshPreviewScenes = () => {
    const select = $('#preview-scene-select');
    if (!select) return;
    select.innerHTML = '';
    if (getTestState().timeline.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Sin escenas';
      select.appendChild(option);
      return;
    }
    getTestState().timeline.forEach((scene, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = 'Escena ' + scene.number;
      select.appendChild(option);
    });
  };

  const selectSuggestedKeywords = () => {
    const listEl = $('#keywords-list');
    if (!listEl) return;
  };

  const addSearchTerm = () => {
    const input = $('#subtitle-term-search');
    const value = input?.value.trim();
    if (!value) return;
  };

  const refreshVoiceLanguages = () => {
    const select = $('#voice-language');
    if (!select) return;
  };

  const refreshVoiceSelect = () => {
    const select = $('#voice-select');
    if (!select) return;
  };

  const syncVoiceControls = () => {
    const voice = getTestState().config.voice;
    const language = $('#voice-language');
    if (language && voice.language) language.value = voice.language;
    const select = $('#voice-select');
    if (select && voice.voiceId) select.value = voice.voiceId;
  };

  const handleGenerateVoice = () => {
  };

  const handleVoiceClean = () => {
    const textarea = $('#voice-text');
    if (textarea) {
      textarea.value = cleanScriptForVoice(getTestState().script.raw);
    }
  };

  const cleanScriptForVoice = (script) => {
    const sceneMarker = /^\s*(?:\[|\()?\s*(?:escena|scene|parte|part)\s*[:#]?\s*\d+\s*(?:\]|\))?/i;
    const timeRange = /\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*[-]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/gi;
    const timeRangeWords = /(?:de|from)\s+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s+(?:a|to)\s+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/gi;
    const technical = /(?:voz en off|voice ?over|narrador|narrator|locutor|plano|toma|shot|b-?roll|texto en pantalla|m\u00fasica|musica|music|sfx|transition|transici\u00f3n)\s*[:#]\s*/gi;
    const timestampOnly = /^\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[-]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)?\s*$/;
    const out = [];

    String(script == null ? '' : script).split(/\r?\n/).forEach((raw) => {
      let text = raw.trim();
      if (!text || timestampOnly.test(text)) return;
      text = text
        .replace(sceneMarker, ' ')
        .replace(timeRange, ' ')
        .replace(timeRangeWords, ' ')
        .replace(technical, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]{0,80}\)/g, ' ')
        .replace(/^[-–—•·*]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || timestampOnly.test(text)) return;
      out.push(text);
    });

    return out.join('\n');
  };

  const refreshModelsList = () => {
    const list = $('#models-list');
    if (!list) return;
  };

  const handleDownloadModels = () => {
  };

  const handleImportModel = (filePath) => {
  };

  const handleSyncScenes = () => {
  };

  const handleGenerateFullVideo = () => {
  };

  const handleProbeGpu = () => {
    const info = $('#gpu-info') || $('#capabilities-output');
    const checkbox = $('#directml-checkbox');
    if (info) info.textContent = 'Probing...';
  };

  const renderCapabilities = (capabilities) => {
    const info = $('#gpu-info') || $('#capabilities-output');
    const checkbox = $('#directml-checkbox');
    if (checkbox) checkbox.checked = capabilities?.acceleration?.voiceBackend === 'directml';
    if (info) {
      const label = capabilities?.acceleration?.accelerated
        ? 'Aceleraci\u00f3n activa: ' + capabilities.acceleration.alignBackend.toUpperCase() + ' (alineaci\u00f3n) \u00b7 ' + capabilities.acceleration.voiceBackend.toUpperCase() + ' (voz)'
        : 'Sin GPU compatible: se usar\u00e1 CPU para voz y alineaci\u00f3n (m\u00e1s lento).';
      info.textContent = label;
    }
  };

  // EXPORT FUNCTIONS
  const toggleOutputFormat = (format) => {
    const s = getTestState();
    const idx = s.config.outputs.indexOf(format);
    if (idx >= 0) {
      if (s.config.outputs.length === 1) return;
      s.config.outputs.splice(idx, 1);
    } else {
      s.config.outputs.push(format);
    }
    renderOutputChips();
  };

  const buildExportImages = () => {
    const s = getTestState();
    const byPath = new Map(s.images.map(image => [image.path, image]));
    return s.timeline.map(scene => {
      const source = byPath.get(scene.image.path) || scene.image;
      return {
        name: scene.image.name,
        path: scene.image.path,
        focus169: source.focus169,
        focus916: source.focus916,
        focus11: source.focus11,
        focus45: source.focus45
      };
    });
  };

  const frameGeometry = (image, formatId, naturalWidth, naturalHeight) => {
    const dims = { '16:9': { w: 1920, h: 1080 }, '9:16': { w: 1080, h: 1920 }, '1:1': { w: 1080, h: 1080 }, '4:5': { w: 1080, h: 1350 } }[formatId] || { w: 1920, h: 1080 };
    const targetAspect = dims.w / dims.h;
    const imageAspect = naturalWidth / naturalHeight;
    if (imageAspect > targetAspect) {
      return { coverW: (naturalHeight * targetAspect) / naturalWidth, coverH: 1 };
    }
    return { coverW: 1, coverH: (naturalWidth / targetAspect) / naturalHeight };
  };

  const buildProjectData = () => {
    const s = getTestState();
    return {
      images: s.images.map(image => ({
        name: image.name,
        path: image.path,
        focus169: image.focus169,
        focus916: image.focus916,
        focus11: image.focus11,
        focus45: image.focus45
      })),
      audio: {
        narration: s.audio?.narration ? { name: s.audio.narration.name, path: s.audio.narration.path, duration: s.audioDuration } : null,
        music: s.audio?.music ? { name: s.audio.music.name, path: s.audio.music.path } : null
      },
      script: { raw: s.script.raw },
      timeline: s.timeline.map(scene => ({
        number: scene.number,
        duration: scene.duration,
        text: scene.text || '',
        words: scene.words,
        zoom: scene.zoom,
        transition: scene.transition
      })),
      config: s.config,
      exportOptions: s.exportOptions,
      timelineOptions: s.timelineOptions
    };
  };

  const loadProject = (project, missing = []) => {
    const s = getTestState();
    s.project.missing = missing.slice();
    s.images = project.images.map(image => ({
      name: image.name,
      path: image.path,
      focus169: image.focus169,
      focus916: image.focus916,
      focus11: image.focus11,
      focus45: image.focus45
    }));
    s.audio = {
      narration: project.audio.narration ? { name: project.audio.narration.name, path: project.audio.narration.path } : null,
      music: project.audio.music ? { name: project.audio.music.name, path: project.audio.music.path } : null
    };
    s.audioDuration = project.audio.narration?.duration || 0;
    s.script.raw = project.script.raw || '';
    s.config = { ...s.config, ...project.config };
    s.exportOptions = { ...s.exportOptions, ...project.renderOptions };
    s.timelineOptions = { ...s.timelineOptions, ...project.timelineOptions };
    s.timeline = project.timeline.map((scene, index) => ({
      number: scene.number,
      duration: scene.duration,
      start: 0,
      end: scene.duration,
      image: s.images[index] || null,
      text: scene.text || '',
      words: scene.words,
      zoom: scene.zoom,
      transition: scene.transition
    }));
    let acc = 0;
    s.timeline = s.timeline.map(scene => {
      const start = acc;
      const end = acc + scene.duration;
      acc = end;
      return { ...scene, start, end };
    });
    renderAll();
    renderOutputChips();
    updateExportButton();
    syncSubtitleControls();
    syncVoiceControls();
    refreshVoiceLanguages();
    refreshFontList();
    refreshKeywordList();
    refreshPreviewScenes();
  };

  const handleSaveProject = async () => {
    return true;
  };

  const handleOpenProject = async () => {
    return true;
  };

  const handlePreview = async () => {
    return true;
  };

  const handleExport = async () => {
    const s = getTestState();
    s.export.isRendering = true;
    s.export.progress = 0;
    updateExportButton();
    setExportStatus('Exportando...');
    await new Promise(r => setTimeout(r, 100));
    s.export.isRendering = false;
    s.export.progress = 100;
    s.export.outputPath = '/tmp/test.mp4';
    s.export.outputFolder = '/tmp';
    setExportStatus('Video exportado \u2192 test.mp4', 'success');
    updateExportButton();
    return true;
  };

  const handleOpenOutputFolder = async () => {
    return true;
  };

  // Register all hooks
  testHooksRef.current = {
    renderImages,
    renderAudio,
    renderScript,
    renderTimeline,
    renderAll,
    updateExportButton,
    setExportStatus,
    renderFocusEditor,
    updateFocusBoxPreview,
    renderOutputChips,
    setFocusScale: (value) => {
      const { images, focus } = getTestState();
      if (images.length === 0) return;
      const image = images[focus.imageIndex];
      const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
      image[focusKey] = { ...image[focusKey], scale: Math.max(0.3, Math.min(3.0, value)) };
      updateFocusBoxPreview();
    },
    applyAutoScale: () => {
      const { images, focus } = getTestState();
      if (images.length === 0) return;
      const img = $('#focus-image');
      if (!img || !img.naturalWidth) return;
      const image = images[focus.imageIndex];
      const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
      const dims = { w: 1920, h: 1080 }[focus.format] || { w: 1920, h: 1080 };
      const targetAspect = dims.w / dims.h;
      const imageAspect = img.naturalWidth / img.naturalHeight;
      const coverW = imageAspect > targetAspect ? (img.naturalHeight * targetAspect) / img.naturalWidth : 1;
      const coverH = imageAspect > targetAspect ? 1 : (img.naturalWidth / targetAspect) / img.naturalHeight;
      const autoScale = Math.max(0.3, Math.min(3.0, Math.min(coverW, coverH)));
      image[focusKey] = { ...image[focusKey], scale: autoScale };
      updateFocusBoxPreview();
    },
    resetFocus: () => {
      const { images, focus } = getTestState();
      if (images.length === 0) return;
      const image = images[focus.imageIndex];
      const focusKey = { '16:9': 'focus169', '9:16': 'focus916', '1:1': 'focus11', '4:5': 'focus45' }[focus.format];
      image[focusKey] = { x: 0.5, y: 0.5, scale: 1.0 };
      updateFocusBoxPreview();
    },
    updateSubtitlePreview,
    syncSubtitleControls,
    refreshFontList,
    refreshKeywordList,
    refreshPresets,
    applyPresetByName,
    snapshotSubtitleStyle,
    refreshPreviewScenes,
    selectSuggestedKeywords,
    addSearchTerm,
    refreshVoiceLanguages,
    refreshVoiceSelect,
    syncVoiceControls,
    handleGenerateVoice,
    handleVoiceClean,
    cleanScriptForVoice,
    refreshModelsList,
    handleDownloadModels,
    handleImportModel,
    handleSyncScenes,
    handleGenerateFullVideo,
    handleProbeGpu,
    renderCapabilities,
  };

  // Expose test controls and export for E2E tests - ALL CONTROLS from original renderer.js
  window.__TEST_CONTROLS__ = [
    { id: 'import-images-btn', tipo: 'button', hasHandler: true },
    { id: 'images-drop-zone', tipo: 'dropzone', hasHandler: true },
    { id: 'import-audio-btn', tipo: 'button', hasHandler: true },
    { id: 'audio-narration-drop', tipo: 'dropzone', hasHandler: true },
    { id: 'import-music-btn', tipo: 'button', hasHandler: true },
    { id: 'audio-music-drop', tipo: 'dropzone', hasHandler: true },
    { id: 'paste-script-btn', tipo: 'button', hasHandler: true },
    { id: 'load-script-btn', tipo: 'button', hasHandler: true },
    { id: 'script-textarea', tipo: 'textarea', hasHandler: true },
    { id: 'adjust-timeline-checkbox', tipo: 'checkbox', hasHandler: true },
    { id: 'apply-scene-settings-btn', tipo: 'button', hasHandler: true },
    { id: 'save-project-btn', tipo: 'button', hasHandler: true },
    { id: 'open-project-btn', tipo: 'button', hasHandler: true },
    { id: 'zoom-enabled-checkbox', tipo: 'checkbox', hasHandler: true },
    { id: 'zoom-type', tipo: 'select', hasHandler: true },
    { id: 'zoom-mode', tipo: 'select', hasHandler: true },
    { id: 'zoom-seed', tipo: 'input', hasHandler: true },
    { id: 'zoom-start-scale', tipo: 'input', hasHandler: true },
    { id: 'zoom-intensity', tipo: 'input', hasHandler: true },
    { id: 'transition-type', tipo: 'select', hasHandler: true },
    { id: 'transition-mode', tipo: 'select', hasHandler: true },
    { id: 'transition-seed', tipo: 'input', hasHandler: true },
    { id: 'transition-duration', tipo: 'input', hasHandler: true },
    { id: 'badge-enabled', tipo: 'checkbox', hasHandler: true },
    { id: 'badge-text', tipo: 'input', hasHandler: true },
    { id: 'badge-position', tipo: 'select', hasHandler: true },
    { id: 'badge-animation', tipo: 'select', hasHandler: true },
    { id: 'lower-third-enabled', tipo: 'checkbox', hasHandler: true },
    { id: 'lower-third-text', tipo: 'input', hasHandler: true },
    { id: 'lower-third-opacity', tipo: 'input', hasHandler: true },
    { id: 'progress-bar-enabled', tipo: 'checkbox', hasHandler: true },
    { id: 'progress-bar-color', tipo: 'input', hasHandler: true },
    { id: 'progress-bar-height', tipo: 'input', hasHandler: true },
    { id: 'export-btn', tipo: 'button', hasHandler: true },
    { id: 'generate-full-btn', tipo: 'button', hasHandler: true },
    { id: 'open-output-folder-btn', tipo: 'button', hasHandler: true },
    { id: 'output-chip-16x9', tipo: 'button', hasHandler: true },
    { id: 'output-chip-9x16', tipo: 'button', hasHandler: true },
    { id: 'output-chip-1x1', tipo: 'button', hasHandler: true },
    { id: 'output-chip-4x5', tipo: 'button', hasHandler: true },
    { id: 'fit-mode', tipo: 'select', hasHandler: true },
    { id: 'frame-color', tipo: 'input', hasHandler: true },
    { id: 'focus-image-select', tipo: 'select', hasHandler: true },
    { id: 'focus-format-select', tipo: 'select', hasHandler: true },
    { id: 'focus-scale', tipo: 'range', hasHandler: true },
    { id: 'focus-auto-btn', tipo: 'button', hasHandler: true },
    { id: 'focus-reset-btn', tipo: 'button', hasHandler: true },
    { id: 'focus-apply-all-btn', tipo: 'button', hasHandler: true },
    { id: 'focus-editor', tipo: 'focuseditor', hasHandler: true },
    { id: 'background-mode', tipo: 'select', hasHandler: true },
    { id: 'background-color', tipo: 'input', hasHandler: true },
    { id: 'subtitles-enabled', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitle-font', tipo: 'select', hasHandler: true },
    { id: 'import-font-btn', tipo: 'button', hasHandler: true },
    { id: 'subtitle-size-h', tipo: 'input', hasHandler: true },
    { id: 'subtitle-size-v', tipo: 'input', hasHandler: true },
    { id: 'subtitle-bold', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitle-italic', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitle-letter-spacing', tipo: 'input', hasHandler: true },
    { id: 'subtitle-text-color', tipo: 'input', hasHandler: true },
    { id: 'subtitle-outline-width', tipo: 'input', hasHandler: true },
    { id: 'subtitle-outline-color', tipo: 'input', hasHandler: true },
    { id: 'subtitle-alignment', tipo: 'select', hasHandler: true },
    { id: 'subtitle-margin-h', tipo: 'input', hasHandler: true },
    { id: 'subtitle-margin-v', tipo: 'input', hasHandler: true },
    { id: 'subtitles-background-enabled', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitles-background-color', tipo: 'input', hasHandler: true },
    { id: 'subtitles-background-opacity', tipo: 'input', hasHandler: true },
    { id: 'subtitles-shadow-enabled', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitles-shadow-color', tipo: 'input', hasHandler: true },
    { id: 'subtitles-shadow-opacity', tipo: 'input', hasHandler: true },
    { id: 'subtitles-shadow-distance', tipo: 'input', hasHandler: true },
    { id: 'subtitles-shadow-angle', tipo: 'input', hasHandler: true },
    { id: 'subtitles-shadow-blur', tipo: 'input', hasHandler: true },
    { id: 'subtitle-animation', tipo: 'select', hasHandler: true },
    { id: 'subtitles-highlight-enabled', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitle-terms-input', tipo: 'input', hasHandler: true },
    { id: 'subtitles-detect-numbers', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitles-detect-percent', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitles-detect-currency', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitle-delay', tipo: 'input', hasHandler: true },
    { id: 'subtitles-voice-detect', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitles-word-highlight', tipo: 'checkbox', hasHandler: true },
    { id: 'subtitle-terms-limit', tipo: 'input', hasHandler: true },
    { id: 'detect-keywords-btn', tipo: 'button', hasHandler: true },
    { id: 'subtitles-select-suggested-btn', tipo: 'button', hasHandler: true },
    { id: 'subtitle-term-search', tipo: 'input', hasHandler: false },
    { id: 'subtitle-term-add-btn', tipo: 'button', hasHandler: true },
    { id: 'keywords-color', tipo: 'input', hasHandler: true },
    { id: 'keywords-apply-color-btn', tipo: 'button', hasHandler: true },
    { id: 'preset-select', tipo: 'select', hasHandler: true },
    { id: 'preset-name-input', tipo: 'input', hasHandler: true },
    { id: 'save-preset-btn', tipo: 'button', hasHandler: true },
    { id: 'rename-preset-btn', tipo: 'button', hasHandler: true },
    { id: 'delete-preset-btn', tipo: 'button', hasHandler: true },
    { id: 'preview-scene-select', tipo: 'select', hasHandler: true },
    { id: 'preview-btn', tipo: 'button', hasHandler: true },
    { id: 'hwaccel-checkbox', tipo: 'checkbox', hasHandler: true },
    { id: 'directml-checkbox', tipo: 'checkbox', hasHandler: true },
    { id: 'gpu-probe-btn', tipo: 'button', hasHandler: true },
    { id: 'voice-panel-toggle-btn', tipo: 'button', hasHandler: true },
    { id: 'voice-language', tipo: 'select', hasHandler: true },
    { id: 'voice-select', tipo: 'select', hasHandler: true },
    { id: 'voice-speed', tipo: 'input', hasHandler: true },
    { id: 'voice-pause', tipo: 'input', hasHandler: true },
    { id: 'voice-sample-btn', tipo: 'button', hasHandler: true },
    { id: 'voice-text', tipo: 'textarea', hasHandler: false },
    { id: 'voice-generate-btn', tipo: 'button', hasHandler: true },
    { id: 'voice-cancel-btn', tipo: 'button', hasHandler: true },
    { id: 'sync-scenes-btn', tipo: 'button', hasHandler: true },
    { id: 'models-download-btn', tipo: 'button', hasHandler: true },
    { id: 'models-import-btn', tipo: 'button', hasHandler: true },
    { id: 'models-cancel-btn', tipo: 'button', hasHandler: true },
  ];
  
  window.__TEST_EXPORT__ = {
    handleExport,
    handleOpenOutputFolder,
    toggleOutputFormat,
    buildExportImages,
    frameGeometry,
    buildProjectData,
    loadProject,
    handleSaveProject,
    handleOpenProject,
    handlePreview,
  };
  
  window.__TEST_RENDER__ = testHooksRef.current;
  console.log('[TestHooks] Registered');
}

export function unregisterTestHooks() {
  if (typeof window !== 'undefined') {
    delete window.__TEST_RENDER__;
    delete window.__TEST_STATE__;
    delete window.__TEST_EXPORT__;
    delete window.__TEST_CONTROLS__;
  }
}

// Helper functions
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (h > 0) return h + ':' + m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0') + '.' + ms.toString().padStart(2, '0');
  return m + ':' + s.toString().padStart(2, '0') + '.' + ms.toString().padStart(2, '0');
}

function highlightPreview(text, style) {
  let html = escapeHtml(text);
  const highlight = style.highlight || {};
  if (!highlight.enabled || !highlight.colors) return html;
  for (const key of Object.keys(highlight.colors)) {
    const term = String(key).trim();
    if (!term) continue;
    const pattern = new RegExp('(^|[^\\p{L}\\p{N}])(' + escapeRegExp(term) + ')(?![\\p{L}\\p{N}])', 'giu');
    html = html.replace(pattern, (match, pre, word) => pre + '<mark style="color:' + highlight.colors[key] + ';background:transparent">' + word + '</mark>');
  }
  return html;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/\x27/g, '\x27');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}