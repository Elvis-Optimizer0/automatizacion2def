const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffprobeStatic = require('ffprobe-static');
const { renderVideo, renderPreview, verifyBinaries, detectEncoders, E_FFMPEG_MISSING, E_INPUT_MISSING, E_FFMPEG_FAILED, E_SUBTITLES_FAILED, E_OUTPUT_CONFIG_MISSING } = require('./core/ffmpeg-renderer.js');
const { parseProjectFile, collectProjectPaths } = require('./core/project-schema.js');
const { listFontsInDir, importFontFromPath, getBundledFontsDir, getUserFontsDir, E_FONT_IMPORT_FAILED } = require('./core/fonts.js');
const { detectKeywords } = require('./core/keywords.js');
const { readPresets, addPreset, renamePreset, deletePreset } = require('./core/presets.js');

const E_PROJECT_INVALID = 'E_PROJECT_INVALID';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    title: 'Video Maker v0.6.1',
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
  try {
    verifyBinaries();
  } catch (err) {
    console.error('Binary verification failed:', err.message);
  }
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

ipcMain.handle('dialog:saveVideo', async () => {
  if (process.env.VM_TEST_OUTPUT) {
    return process.env.VM_TEST_OUTPUT;
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar video',
    buttonLabel: 'Guardar',
    defaultPath: 'video.mp4',
    filters: [
      { name: 'Video MP4', extensions: ['mp4'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
});

ipcMain.handle('shell:openFolder', async (_, folderPath) => {
  const { shell } = require('electron');
  await shell.openPath(folderPath);
});

ipcMain.handle('ffprobe:duration', async (_, filePath) => {
  if (!filePath) {
    throw new Error('E_INPUT_MISSING: filePath is required');
  }
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

ipcMain.handle('render:video', async (_, options) => {
  const { webContents } = mainWindow;

  const onProgress = (progress) => {
    webContents.send('render:progress', progress);
  };

  try {
    const result = await renderVideo({
      ...options,
      onProgress,
      userFontsDir: getUserFontsDir(app.getPath('userData'))
    });
    return result;
  } catch (err) {
    if (err.message.startsWith(E_FFMPEG_MISSING) || err.message.startsWith(E_INPUT_MISSING) || err.message.startsWith(E_FFMPEG_FAILED) || err.message.startsWith(E_SUBTITLES_FAILED) || err.message.startsWith(E_OUTPUT_CONFIG_MISSING)) {
      throw err;
    }
    throw new Error(`${E_FFMPEG_FAILED}: ${err.message}`);
  }
});

ipcMain.handle('preview:render', async (_, options) => {
  try {
    const result = await renderPreview({
      ...options,
      userFontsDir: getUserFontsDir(app.getPath('userData')),
      outputPath: process.env.VM_TEST_PREVIEW_OUT || (options && options.outputPath)
    });
    return result;
  } catch (err) {
    if (err.message.startsWith(E_FFMPEG_MISSING) || err.message.startsWith(E_INPUT_MISSING) || err.message.startsWith(E_FFMPEG_FAILED) || err.message.startsWith(E_SUBTITLES_FAILED)) {
      throw err;
    }
    throw new Error(`${E_FFMPEG_FAILED}: ${err.message}`);
  }
});

ipcMain.handle('codecs:detect', async () => {
  try {
    return await detectEncoders(true);
  } catch (err) {
    throw new Error(`${E_FFMPEG_MISSING}: ${err.message}`);
  }
});

ipcMain.handle('verify:binaries', async () => {
  try {
    const ffmpegPath = verifyBinaries();
    const ffprobePath = getFfprobePath();
    const ffprobeExists = fs.existsSync(ffprobePath);
    return { ffmpeg: ffmpegPath, ffprobe: ffprobePath, ffprobeExists };
  } catch (err) {
    throw new Error(`${E_FFMPEG_MISSING}: ${err.message}`);
  }
});

ipcMain.handle('fonts:list', async () => {
  const userDir = getUserFontsDir(app.getPath('userData'));
  return {
    bundled: listFontsInDir(getBundledFontsDir()),
    user: listFontsInDir(userDir),
    userDir
  };
});

ipcMain.handle('fonts:import', async () => {
  const userDir = getUserFontsDir(app.getPath('userData'));

  let filePath = process.env.VM_TEST_FONT_IN;
  if (!filePath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar tipografia',
      buttonLabel: 'Importar',
      filters: [{ name: 'Tipografias', extensions: ['ttf', 'otf'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    filePath = result.filePaths[0];
  }

  try {
    const imported = importFontFromPath(filePath, userDir);
    return { imported, user: listFontsInDir(userDir) };
  } catch (err) {
    if (err.message.startsWith(E_FONT_IMPORT_FAILED)) {
      throw err;
    }
    throw new Error(`${E_FONT_IMPORT_FAILED}: ${err.message}`);
  }
});

ipcMain.handle('keywords:detect', async (_, texts, options) => {
  return detectKeywords(texts, options || {});
});

ipcMain.handle('presets:list', async () => {
  return readPresets(app.getPath('userData'));
});

ipcMain.handle('presets:add', async (_, name, style) => {
  const presets = addPreset(app.getPath('userData'), name, style);
  return { presets };
});

ipcMain.handle('presets:rename', async (_, oldName, newName) => {
  const presets = renamePreset(app.getPath('userData'), oldName, newName);
  return { presets };
});

ipcMain.handle('presets:delete', async (_, name) => {
  const presets = deletePreset(app.getPath('userData'), name);
  return { presets };
});

ipcMain.handle('project:save', async (_, data, providedPath) => {  let filePath = providedPath || process.env.VM_TEST_PROJECT_OUT;
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar proyecto',
      buttonLabel: 'Guardar',
      defaultPath: 'proyecto.vmproj',
      filters: [{ name: 'Proyecto Video Maker', extensions: ['vmproj'] }]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    filePath = result.filePath;
  }

  let project;
  try {
    project = parseProjectFile({ ...(data || {}), savedAt: new Date().toISOString() });
  } catch (err) {
    throw new Error(`${E_PROJECT_INVALID}: ${err.message}`);
  }

  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8');
  return { filePath };
});

ipcMain.handle('project:open', async (_, providedPath) => {
  let filePath = providedPath || process.env.VM_TEST_PROJECT_IN;
  if (!filePath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Abrir proyecto',
      buttonLabel: 'Abrir',
      filters: [{ name: 'Proyecto Video Maker', extensions: ['vmproj'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    filePath = result.filePaths[0];
  }

  let project;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    project = parseProjectFile(raw);
  } catch (err) {
    throw new Error(`${E_PROJECT_INVALID}: ${err.message}`);
  }

  const missing = collectProjectPaths(project).filter(p => !fs.existsSync(p));
  return { filePath, project, missing };
});