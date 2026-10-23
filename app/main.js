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
const { listVoices: listVoiceCatalog, SUPPORTED_LANGUAGES, getSamplePhrase, synthesizeVoice, checkVoiceEngine, isTestMode: isVoiceTestMode } = require('./core/voice.js');
const { KNOWN_MODELS, MODEL_CATALOG, getModelsDir, listModels, listModelsAsync, importModel, downloadModel, normalizeImportPath, normalizeModelId, E_MODEL_IMPORT_FAILED, E_MODEL_PATH_INVALID, verifyModelFile } = require('./core/models.js');
const { alignScenes } = require('./core/alignment.js');
const { getCapabilities, resolveAcceleration } = require('./core/capabilities.js');

const E_PROJECT_INVALID = 'E_PROJECT_INVALID';

if (process.env.VM_TEST_USERDATA) {
  app.setPath('userData', process.env.VM_TEST_USERDATA);
}

let mainWindow;
let activeVoiceController = null;
let activeModelController = null;
let activeAlignController = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    title: 'Video Maker v0.7.6',
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

function getUserVoicesDir() {
  return path.join(app.getPath('userData'), 'voices');
}

ipcMain.handle('voice:list', async () => {
  const modelsDir = getModelsDir(app.getPath('userData'));
  const simulated = isVoiceTestMode();
  const voices = listVoiceCatalog().map((voice) => {
    const readiness = checkVoiceEngine(voice.id, process.env, modelsDir);
    return {
      ...voice,
      available: simulated || readiness.ready,
      modelsDir,
      modelDir: readiness.modelDir,
      missingFiles: readiness.missingFiles
    };
  });
  return {
    modelsDir,
    languages: SUPPORTED_LANGUAGES,
    voices,
    samples: {
      es: getSamplePhrase('es'),
      en: getSamplePhrase('en')
    }
  };
});

async function runVoiceGeneration(text, options) {
  if (activeVoiceController) {
    activeVoiceController.abort();
  }
  const controller = new AbortController();
  activeVoiceController = controller;

  const voicesDir = getUserVoicesDir();
  fs.mkdirSync(voicesDir, { recursive: true });
  const stamp = `voz-${Date.now()}.wav`;
  const outputPath = process.env.VM_TEST_VOICE_OUT || (options && options.outputPath) || path.join(voicesDir, stamp);
  const modelsDir = getModelsDir(app.getPath('userData'));

  const onProgress = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('voice:progress', progress);
    }
  };

  try {
    const result = await synthesizeVoice({ ...options, text, outputPath, modelsDir }, { onProgress, signal: controller.signal });
    return { path: result.outputPath, name: path.basename(result.outputPath), duration: result.duration };
  } finally {
    if (activeVoiceController === controller) activeVoiceController = null;
  }
}

ipcMain.handle('voice:generate', async (_, options) => {
  const opts = options || {};
  return runVoiceGeneration(opts.text, opts);
});

ipcMain.handle('voice:sample', async (_, options) => {
  const opts = options || {};
  const language = opts.language === 'en' ? 'en' : 'es';
  const voices = listVoiceCatalog(language);
  const voiceId = opts.voiceId || (voices[0] ? voices[0].id : '');
  return runVoiceGeneration(getSamplePhrase(language), { language, voiceId, speed: opts.speed || 1, pause: 0.2 });
});

ipcMain.handle('voice:cancel', async () => {
  if (activeVoiceController) {
    activeVoiceController.abort();
    activeVoiceController = null;
    return { cancelled: true };
  }
  return { cancelled: false };
});

ipcMain.handle('capabilities:get', async (_, options) => {
  const requested = options && options.directml === false ? false : true;
  const capabilities = getCapabilities({});
  return {
    ...capabilities,
    acceleration: resolveAcceleration({ gpu: capabilities.gpu, directmlRequested: requested })
  };
});

ipcMain.handle('align:scenes', async (_, payload) => {
  const data = payload || {};
  if (activeAlignController) activeAlignController.abort();
  const controller = new AbortController();
  activeAlignController = controller;
  try {
    return await alignScenes({
      audioPath: data.audioPath,
      scenes: data.scenes,
      language: data.language,
      duration: data.duration,
      options: { signal: controller.signal }
    });
  } finally {
    if (activeAlignController === controller) activeAlignController = null;
  }
});

function getVendorModelsDir() {
  // In development, vendor is at project root; in production, it's in resources
  const devVendor = path.join(__dirname, '..', 'vendor');
  if (fs.existsSync(devVendor)) return devVendor;
  return path.join(process.resourcesPath, 'vendor');
}

ipcMain.handle('models:list', async () => {
  const dir = getModelsDir(app.getPath('userData'));
  const vendorDir = getVendorModelsDir();
  return { dir, models: listModels(dir, MODEL_CATALOG, vendorDir) };
});

ipcMain.handle('models:listAsync', async () => {
  const dir = getModelsDir(app.getPath('userData'));
  const vendorDir = getVendorModelsDir();
  const models = await listModelsAsync(dir, MODEL_CATALOG, vendorDir);
  return { dir, models };
});

ipcMain.handle('models:download', async (_, modelId) => {
  const dir = getModelsDir(app.getPath('userData'));
  const catalog = KNOWN_MODELS;

  const wanted = normalizeModelId(modelId);

  let selected = catalog;
  if (wanted) {
    selected = catalog.filter(model => model.id === wanted);
    if (selected.length === 0) {
      throw new Error(`${E_MODEL_PATH_INVALID}: modelo desconocido "${wanted}". Válidos: ${catalog.map(model => model.id).join(', ')}`);
    }
  }

  if (activeModelController) activeModelController.abort();
  const controller = new AbortController();
  activeModelController = controller;

  const onProgress = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('models:progress', progress);
    }
  };

  try {
    const results = [];
    for (const model of selected) {
      for (const file of model.files) {
        const result = await downloadModel(model, dir, {
          fileName: file.fileName,
          onProgress,
          signal: controller.signal
        });
        results.push(result);
      }
    }
    return { results, models: listModels(dir) };
  } finally {
    if (activeModelController === controller) activeModelController = null;
  }
});

ipcMain.handle('models:import', async (_, providedPath) => {
  const dir = getModelsDir(app.getPath('userData'));

  const normalized = normalizeImportPath(providedPath, process.env.VM_TEST_MODEL_IN);
  let filePath = normalized.filePath;

  if (!filePath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar modelo',
      buttonLabel: 'Importar',
      filters: [{ name: 'Modelos', extensions: ['onnx', 'bin', 'gguf'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    filePath = result.filePaths[0];
  }

  if (typeof filePath !== 'string' || !filePath.trim()) {
    return null;
  }

  try {
    const imported = importModel(filePath, dir);
    return { imported, models: imported.models || listModels(dir) };
  } catch (err) {
    if (err.message.startsWith(E_MODEL_IMPORT_FAILED) || err.message.startsWith(E_MODEL_PATH_INVALID)) {
      throw err;
    }
    throw new Error(`${E_MODEL_IMPORT_FAILED}: ${err.message}`);
  }
});

ipcMain.handle('models:cancel', async () => {
  if (activeModelController) {
    activeModelController.abort();
    activeModelController = null;
    return { cancelled: true };
  }
  return { cancelled: false };
});

ipcMain.handle('piper:voiceDownload', async (_, voiceId) => {
  const dir = getModelsDir(app.getPath('userData'));
  const catalog = KNOWN_MODELS;
  const piperModel = catalog.find(m => m.id === 'piper');
  if (!piperModel) {
    throw new Error(`${E_MODEL_PATH_INVALID}: modelo piper no encontrado en catálogo`);
  }
  const file = piperModel.files.find(f => f.fileName.startsWith(voiceId));
  if (!file) {
    throw new Error(`${E_MODEL_PATH_INVALID}: voz "${voiceId}" no encontrada en catálogo Piper`);
  }

  if (activeModelController) activeModelController.abort();
  const controller = new AbortController();
  activeModelController = controller;

  const onProgress = (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('piper:voiceProgress', { voiceId, ...progress });
    }
  };

  try {
    const result = await downloadModel(piperModel, dir, {
      fileName: file.fileName,
      onProgress,
      signal: controller.signal
    });
    return { result, models: listModels(dir) };
  } finally {
    if (activeModelController === controller) activeModelController = null;
  }
});

ipcMain.handle('piper:voiceImport', async (_, { onnxPath, jsonPath, voiceId }) => {
  const dir = getModelsDir(app.getPath('userData'));
  const catalog = KNOWN_MODELS;
  const piperModel = catalog.find(m => m.id === 'piper');
  if (!piperModel) {
    throw new Error(`${E_MODEL_PATH_INVALID}: modelo piper no encontrado en catálogo`);
  }

  if (!onnxPath || !jsonPath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Importar voz Piper ${voiceId || ''}`,
      buttonLabel: 'Importar',
      filters: [{ name: 'Modelos Piper', extensions: ['onnx', 'json'] }],
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length !== 2) {
      return null;
    }
    const onnx = result.filePaths.find(p => p.endsWith('.onnx'));
    const json = result.filePaths.find(p => p.endsWith('.json'));
    if (!onnx || !json) {
      throw new Error('Se requieren ambos archivos .onnx y .onnx.json');
    }
    onnxPath = onnx;
    jsonPath = json;
  }

  if (!path.isAbsolute(onnxPath) || !fs.existsSync(onnxPath)) {
    throw new Error(`${E_MODEL_IMPORT_FAILED}: archivo .onnx no encontrado o ruta inválida`);
  }
  if (!path.isAbsolute(jsonPath) || !fs.existsSync(jsonPath)) {
    throw new Error(`${E_MODEL_IMPORT_FAILED}: archivo .onnx.json no encontrado o ruta inválida`);
  }

  try {
    JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    throw new Error(`${E_MODEL_IMPORT_FAILED}: archivo JSON inválido: ${err.message}`);
  }

  const onnxFile = piperModel.files.find(f => f.fileName === `${voiceId}.onnx`);
  const jsonFile = piperModel.files.find(f => f.fileName === `${voiceId}.onnx.json`);
  if (!onnxFile || !jsonFile) {
    throw new Error(`${E_MODEL_PATH_INVALID}: voz "${voiceId}" no encontrada en catálogo`);
  }

  const onnxDest = path.join(dir, 'piper', `${voiceId}.onnx`);
  const jsonDest = path.join(dir, 'piper', `${voiceId}.onnx.json`);
  fs.mkdirSync(path.dirname(onnxDest), { recursive: true });
  fs.copyFileSync(onnxPath, onnxDest);
  fs.copyFileSync(jsonPath, jsonDest);

  const onnxVerification = verifyModelFile(onnxDest, onnxFile);
  const jsonVerification = verifyModelFile(jsonDest, jsonFile);

  if (!onnxVerification.exists || !jsonVerification.exists) {
    throw new Error(`${E_MODEL_IMPORT_FAILED}: no se pudo copiar los archivos`);
  }

  return {
    imported: { onnx: onnxDest, json: jsonDest },
    models: listModels(dir)
  };
});

ipcMain.handle('piper:voiceSample', async (_, { voiceId, text }) => {
  const voicesDir = path.join(app.getPath('userData'), 'voices');
  fs.mkdirSync(voicesDir, { recursive: true });
  const stamp = `piper-${voiceId}-${Date.now()}.wav`;
  const outputPath = path.join(voicesDir, stamp);

  const { synthesizeVoice: synthesizeVoicePiper } = require('./core/voice-piper.js');

  try {
    const result = await synthesizeVoicePiper({
      text: text || 'Prueba de voz Piper.',
      outputPath,
      modelsDir: getModelsDir(app.getPath('userData')),
      language: voiceId.startsWith('en_') ? 'en_US' : 'es_MX',
      voiceId,
      speed: 1.0,
      pause: 0.2
    }, {});
    return { path: result.outputPath, name: path.basename(result.outputPath), duration: result.duration || 0 };
  } catch (err) {
    throw new Error(`E_VOICE_PIPER_FAILED: ${err.message}`);
  }
});

ipcMain.handle('piper:cancel', async () => {
  if (activeModelController) {
    activeModelController.abort();
    activeModelController = null;
    return { cancelled: true };
  }
  return { cancelled: false };
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