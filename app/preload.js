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
  verifyBinaries: () => ipcRenderer.invoke('verify:binaries'),
  onRenderProgress: (callback) => {
    const handler = (_, progress) => callback(progress);
    ipcRenderer.on('render:progress', handler);
    return () => ipcRenderer.removeListener('render:progress', handler);
  }
});