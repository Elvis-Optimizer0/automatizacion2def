const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const ffprobeStatic = require('ffprobe-static');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    title: 'Video Maker v0.2.0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function fixAsarPath(p) {
  return p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
}

function getFfprobePath() {
  return fixAsarPath(ffprobeStatic.path);
}

function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFfprobePath();
    const proc = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => { stdout += data.toString(); });
    proc.stderr.on('data', data => { stderr += data.toString(); });

    proc.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const lastLines = stderr.trim().split('\n').slice(-15).join('\n');
        reject(new Error(`E_FFPROBE_FAILED: ffprobe exited with code ${code}\n${lastLines}`));
      }
    });

    proc.on('error', err => {
      reject(new Error(`E_FFPROBE_FAILED: ${err.message}`));
    });
  });
}

ipcMain.handle('dialog:openImages', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar imágenes',
    buttonLabel: 'Seleccionar',
    filters: [
      { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }
    ],
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled || !result.filePaths.length) {
    return [];
  }

  return result.filePaths.map(filePath => ({
    name: path.basename(filePath),
    path: filePath
  }));
});

ipcMain.handle('dialog:openAudio', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar narración (obligatorio)',
    buttonLabel: 'Seleccionar',
    filters: [
      { name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    name: path.basename(filePath),
    path: filePath
  };
});

ipcMain.handle('dialog:openMusic', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar música (opcional)',
    buttonLabel: 'Seleccionar',
    filters: [
      { name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    name: path.basename(filePath),
    path: filePath
  };
});

ipcMain.handle('dialog:openScript', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Cargar guion (.txt)',
    buttonLabel: 'Seleccionar',
    filters: [
      { name: 'Texto', extensions: ['txt'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const fs = require('fs');
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { path: filePath, content };
});

ipcMain.handle('ffprobe:duration', async (_, filePath) => {
  if (!filePath) {
    throw new Error('E_INPUT_MISSING: filePath is required');
  }
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    throw new Error(`E_INPUT_MISSING: file not found: ${filePath}`);
  }

  try {
    const output = await runFfprobe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    const duration = parseFloat(output);
    if (isNaN(duration)) {
      throw new Error('E_FFPROBE_FAILED: could not parse duration');
    }
    return duration;
  } catch (err) {
    if (err.message.startsWith('E_FFPROBE_FAILED') || err.message.startsWith('E_INPUT_MISSING')) {
      throw err;
    }
    throw new Error(`E_FFPROBE_FAILED: ${err.message}`);
  }
});