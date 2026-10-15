const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openImages: () => ipcRenderer.invoke('dialog:openImages'),
  openAudio: () => ipcRenderer.invoke('dialog:openAudio'),
  openMusic: () => ipcRenderer.invoke('dialog:openMusic'),
  openScript: () => ipcRenderer.invoke('dialog:openScript'),
  getAudioDuration: (filePath) => ipcRenderer.invoke('ffprobe:duration', filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file)
});