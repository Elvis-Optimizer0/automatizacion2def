const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openImages: () => ipcRenderer.invoke('dialog:openImages'),
  openAudio: () => ipcRenderer.invoke('dialog:openAudio'),
  openMusic: () => ipcRenderer.invoke('dialog:openMusic'),
  openScript: () => ipcRenderer.invoke('dialog:openScript'),
  saveVideo: () => ipcRenderer.invoke('dialog:saveVideo'),
  openFolder: (folderPath) => ipcRenderer.invoke('shell:openFolder', folderPath),
  getAudioDuration: (filePath) => ipcRenderer.invoke('ffprobe:duration', filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  renderVideo: (options) => ipcRenderer.invoke('render:video', options),
  renderPreview: (options) => ipcRenderer.invoke('preview:render', options),
  saveProject: (data, filePath) => ipcRenderer.invoke('project:save', data, filePath),
  openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
  verifyBinaries: () => ipcRenderer.invoke('verify:binaries'),
  detectCodecs: () => ipcRenderer.invoke('codecs:detect'),
  listFonts: () => ipcRenderer.invoke('fonts:list'),
  importFont: () => ipcRenderer.invoke('fonts:import'),
  detectKeywords: (texts, options) => ipcRenderer.invoke('keywords:detect', texts, options),
  listPresets: () => ipcRenderer.invoke('presets:list'),
  addPreset: (name, style) => ipcRenderer.invoke('presets:add', name, style),
  renamePreset: (oldName, newName) => ipcRenderer.invoke('presets:rename', oldName, newName),
  deletePreset: (name) => ipcRenderer.invoke('presets:delete', name),
  listVoices: () => ipcRenderer.invoke('voice:list'),
  generateVoice: (options) => ipcRenderer.invoke('voice:generate', options),
  generateVoiceSample: (options) => ipcRenderer.invoke('voice:sample', options),
  cancelVoice: () => ipcRenderer.invoke('voice:cancel'),
  onRenderProgress: (callback) => {
    const handler = (_, progress) => callback(progress);
    ipcRenderer.on('render:progress', handler);
    return () => ipcRenderer.removeListener('render:progress', handler);
  },
  onVoiceProgress: (callback) => {
    const handler = (_, progress) => callback(progress);
    ipcRenderer.on('voice:progress', handler);
    return () => ipcRenderer.removeListener('voice:progress', handler);
  }
});