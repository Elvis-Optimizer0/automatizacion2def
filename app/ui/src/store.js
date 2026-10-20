import { useSyncExternalStore } from 'react';

// Initial state matching original renderer's state structure
const initialState = {
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
    voice: { language: 'es', voiceId: '', speed: 1, pause: 0.3 },
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
      outlineWidth: 2,
      outlineColor: '#000000',
      alignment: 2,
      marginH: 40,
      marginV: 40,
      delay: 0,
      autoVoiceStart: true,
      wordHighlight: false,
      background: { enabled: false, color: '#000000', opacity: 0.5 },
      shadow: { enabled: false, color: '#000000', opacity: 0.7, distance: 3, angle: 45, blur: 4 },
      highlight: { enabled: false, colors: {}, terms: [], limit: 30, detect: { numbers: true, percent: true, currency: true } },
      animation: 'none'
    }
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
  focus: { imageIndex: 0, format: '16:9' },
  hwAccel: { enabled: true, available: false },
  capabilities: null,
  pipeline: { running: false, stage: '' },
  export: { isRendering: false, progress: 0, outputPath: null, outputFolder: null, status: '' }
};

let state = { ...initialState, version: 0 };
const subscribers = new Set();

function notify() {
  subscribers.forEach(fn => fn());
}

function setState(partial) {
  state = { ...state, ...partial, version: state.version + 1 };
  notify();
}

function getState() {
  return state;
}

function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function forceUpdate() {
  state.version += 1;
  notify();
}

export function useStore(selector) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(initialState)
  );
}

function getSnapshot() {
  return state;
}

export function useImages() {
  const images = useStore(s => s.images);
  return {
    images,
    setImages: (imgs) => setState({ images: imgs }),
    addImages: (imgs) => setState({ images: [...state.images, ...imgs] }),
    removeImage: (index) => setState({ images: state.images.filter((_, i) => i !== index) }),
    clearImages: () => setState({ images: [] }),
  };
}

export function useNarration() {
  const audio = useStore(s => s.audio);
  const audioDuration = useStore(s => s.audioDuration);
  return {
    narration: audio.narration,
    duration: audioDuration,
    setNarration: (narration) => setState({ audio: { ...state.audio, narration } }),
    setDuration: (duration) => setState({ audioDuration: duration }),
  };
}

export function useMusic() {
  const audio = useStore(s => s.audio);
  return {
    music: audio.music,
    setMusic: (music) => setState({ audio: { ...state.audio, music } }),
  };
}

export function useScript() {
  const script = useStore(s => s.script);
  const version = useStore(s => s.version); // Force re-render on version change
  return {
    raw: script.raw,
    scenes: script.scenes,
    warnings: script.warnings,
    setScript: (scriptData) => setState({ script: scriptData }),
  };
}

export function useTimeline(images, scenes, audioDuration, narration) {
  const timeline = useStore(s => s.timeline);
  const timelineOptions = useStore(s => s.timelineOptions);
  return {
    timeline,
    adjustToAudio: timelineOptions.adjustToAudio,
    setAdjustToAudio: (adjustToAudio) => setState({ timelineOptions: { ...state.timelineOptions, adjustToAudio } }),
    setTimeline: (timeline) => setState({ timeline }),
    updateItem: (index, data) => setState({ timeline: state.timeline.map((item, i) => i === index ? { ...item, ...data } : item) }),
    applySceneSettingsToAll: () => {
      if (state.timeline.length === 0) return;
      const first = state.timeline[0];
      setState({ timeline: state.timeline.map(scene => ({
        ...scene,
        zoom: first.zoom ? { ...first.zoom } : undefined,
        transition: first.transition ? { ...first.transition } : undefined
      })) });
    },
    updateSceneZoom: (index, zoom) => setState({ timeline: state.timeline.map((scene, i) => i === index ? { ...scene, zoom: zoom || undefined } : scene) }),
    updateSceneTransition: (index, transition) => setState({ timeline: state.timeline.map((scene, i) => i === index ? { ...scene, transition: transition || undefined } : scene) }),
    updateSceneIntensity: (index, intensity) => setState({ timeline: state.timeline.map((scene, i) => i === index ? { ...scene, zoom: { ...scene.zoom, intensity } } : scene) }),
  };
}

export function useConfig() {
  const config = useStore(s => s.config);
  return {
    config,
    updateConfig: (path, value) => {
      const newConfig = JSON.parse(JSON.stringify(state.config));
      const keys = path.split('.');
      let obj = newConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      setState({ config: newConfig });
    },
    toggleOutput: (format) => {
      const formats = [...state.config.outputs];
      const idx = formats.indexOf(format);
      if (idx >= 0) {
        if (formats.length === 1) return;
        formats.splice(idx, 1);
      } else {
        formats.push(format);
      }
      setState({ config: { ...state.config, outputs: formats } });
    },
  };
}

export function useExportOptions() {
  const options = useStore(s => s.exportOptions);
  return {
    options,
    updateOption: (key, value) => setState({ exportOptions: { ...state.exportOptions, [key]: value } }),
  };
}

export function useFocus() {
  const focus = useStore(s => s.focus);
  return {
    focus,
    setFocus: (focus) => setState({ focus }),
    updateImageFocus: (imageIndex, focusKey, focusValue) => setState({ images: state.images.map((img, i) => i === imageIndex ? { ...img, [focusKey]: focusValue } : img) }),
    applyFocusToAll: (focusKey, focusValue) => setState({ images: state.images.map(img => ({ ...img, [focusKey]: focusValue })) }),
  };
}

export function useHwAccel() {
  const hwAccel = useStore(s => s.hwAccel);
  return {
    hwAccel,
    setHwAccel: (hwAccel) => setState({ hwAccel }),
  };
}

export function useCapabilities() {
  const capabilities = useStore(s => s.capabilities);
  return {
    capabilities,
    setCapabilities: (capabilities) => setState({ capabilities }),
  };
}

export function usePipeline() {
  const pipeline = useStore(s => s.pipeline);
  return {
    pipeline,
    setPipeline: (pipeline) => setState({ pipeline }),
  };
}

export function useExportState() {
  const exportState = useStore(s => s.export);
  return {
    export: exportState,
    setExportState: (exportData) => setState({ export: exportData }),
  };
}

export function useProject() {
  const project = useStore(s => s.project);
  return {
    project,
    setProject: (project) => setState({ project }),
  };
}

export function useAudioDuration() {
  const duration = useStore(s => s.audioDuration);
  return {
    duration,
    setDuration: (duration) => setState({ audioDuration: duration }),
  };
}

export function useVoice() {
  const voiceConfig = useStore(s => s.config.voice);
  return {
    languages: [],
    voices: [],
    modelsDir: '',
    generating: false,
    progress: 0,
    status: { message: '', type: '' },
    voiceConfig,
    setVoiceConfig: (config) => setState({ config: { ...state.config, voice: { ...state.config.voice, ...config } } }),
    refreshLanguages: async () => {},
    refreshVoices: () => state.voices || [],
    generateVoice: async () => {},
    generateSample: async () => {},
    syncScenes: async () => {},
    cancelVoice: async () => {},
  };
}

export function useModels() {
  return {
    models: [],
    modelsDir: '',
    downloading: false,
    progress: 0,
    status: { message: '', type: '' },
    refresh: async () => {},
    download: async () => {},
    importModel: async () => {},
    cancel: async () => {},
  };
}

export function useExport() {
  const exportState = useStore(s => s.export);
  return {
    isRendering: exportState.isRendering,
    progress: exportState.progress,
    outputPath: exportState.outputPath,
    outputFolder: exportState.outputFolder,
    status: exportState.status,
    exportVideo: async () => false,
    openOutputFolder: async () => {},
  };
}

// Reducer actions (kept for testHooks compatibility)
export const ActionTypes = {
  SET_IMAGES: 'SET_IMAGES',
  ADD_IMAGES: 'ADD_IMAGES',
  REMOVE_IMAGE: 'REMOVE_IMAGE',
  CLEAR_IMAGES: 'CLEAR_IMAGES',
  SET_NARRATION: 'SET_NARRATION',
  SET_MUSIC: 'SET_MUSIC',
  SET_AUDIO_DURATION: 'SET_AUDIO_DURATION',
  SET_SCRIPT: 'SET_SCRIPT',
  SET_TIMELINE: 'SET_TIMELINE',
  SET_TIMELINE_OPTIONS: 'SET_TIMELINE_OPTIONS',
  SET_CONFIG: 'SET_CONFIG',
  SET_EXPORT_OPTIONS: 'SET_EXPORT_OPTIONS',
  SET_FOCUS: 'SET_FOCUS',
  SET_HW_ACCEL: 'SET_HW_ACCEL',
  SET_CAPABILITIES: 'SET_CAPABILITIES',
  SET_PIPELINE: 'SET_PIPELINE',
  SET_EXPORT_STATE: 'SET_EXPORT_STATE',
  SET_PROJECT: 'SET_PROJECT',
  UPDATE_IMAGE_FOCUS: 'UPDATE_IMAGE_FOCUS',
  APPLY_FOCUS_TO_ALL: 'APPLY_FOCUS_TO_ALL',
  SET_TIMELINE_ITEM: 'SET_TIMELINE_ITEM',
  APPLY_SCENE_SETTINGS_TO_ALL: 'APPLY_SCENE_SETTINGS_TO_ALL',
  UPDATE_SCENE_ZOOM: 'UPDATE_SCENE_ZOOM',
  UPDATE_SCENE_TRANSITION: 'UPDATE_SCENE_TRANSITION',
  UPDATE_SCENE_INTENSITY: 'UPDATE_SCENE_INTENSITY',
  TOGGLE_OUTPUT_FORMAT: 'TOGGLE_OUTPUT_FORMAT',
};

export { getState, setState, subscribe, state, notify };