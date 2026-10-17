const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpegStatic = require('ffmpeg-static');
const {
  FPS,
  fixAsarPath,
  buildFullFilterGraph,
  calculateTotalDuration,
  normalizeScenesToDuration,
  resolveInputDurations
} = require('./ffmpeg-helpers.js');
const {
  assertOutputConfig,
  resolveOutputConfig,
  withOutputSuffix,
  E_OUTPUT_CONFIG_MISSING
} = require('./output-formats.js');
const { parseRenderPayload, imageFocus } = require('./project-schema.js');
const { buildAss, E_SUBTITLES_FAILED } = require('./subtitles.js');

const E_FFMPEG_MISSING = 'E_FFMPEG_MISSING';
const E_INPUT_MISSING = 'E_INPUT_MISSING';
const E_FFMPEG_FAILED = 'E_FFMPEG_FAILED';

function getFfmpegPath() {
  return fixAsarPath(ffmpegStatic);
}

function getFontPath() {
  return fixAsarPath(path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf'));
}

function getFontsDir() {
  return fixAsarPath(path.join(__dirname, '..', 'assets', 'fonts'));
}

function verifyBinaries() {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error(`${E_FFMPEG_MISSING}: ffmpeg binary not found at ${ffmpegPath}`);
  }
  try {
    fs.accessSync(ffmpegPath, fs.constants.X_OK);
  } catch {
    throw new Error(`${E_FFMPEG_MISSING}: ffmpeg binary not executable at ${ffmpegPath}`);
  }
  return ffmpegPath;
}

function validateInputPaths(inputs) {
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (!input || typeof input.path !== 'string' || !input.path) {
      throw new Error(`${E_INPUT_MISSING}: input ${i} is missing a path`);
    }
    if (!path.isAbsolute(input.path)) {
      throw new Error(`${E_INPUT_MISSING}: input ${i} (${input.name}) path is not absolute: ${input.path}`);
    }
    if (!fs.existsSync(input.path)) {
      throw new Error(`${E_INPUT_MISSING}: input ${i} (${input.name}) not found: ${input.path}`);
    }
  }
}

function parseFfmpegProgress(chunk, totalDuration) {
  const timeMatch = chunk.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!timeMatch) return null;

  const h = parseInt(timeMatch[1], 10);
  const m = parseInt(timeMatch[2], 10);
  const s = parseFloat(timeMatch[3]);
  const current = h * 3600 + m * 60 + s;
  const progress = totalDuration > 0
    ? Math.min(100, Math.max(0, Math.round((current / totalDuration) * 100)))
    : 0;

  return { current, progress };
}

function resolveOutputConfigs(options, payload) {
  if (Array.isArray(options.outputConfigs) && options.outputConfigs.length > 0) {
    return options.outputConfigs.map(assertOutputConfig);
  }
  if (options.outputConfig) {
    return [assertOutputConfig(options.outputConfig)];
  }
  if (Array.isArray(options.outputIds) && options.outputIds.length > 0) {
    return options.outputIds.map(resolveOutputConfig);
  }
  return payload.config.outputs.map(resolveOutputConfig);
}

function buildFfmpegArgs(options) {
  const {
    scenes,
    images,
    narration,
    music,
    outputPath,
    outputConfig,
    config = {},
    renderOptions = {},
    subtitlesPath,
    fontsDir
  } = options;

  assertOutputConfig(outputConfig);

  if (!scenes || scenes.length === 0) {
    throw new Error(`${E_INPUT_MISSING}: no scenes to render`);
  }
  if (!images || images.length < scenes.length) {
    throw new Error(`${E_INPUT_MISSING}: expected ${scenes.length} images, got ${images ? images.length : 0}`);
  }
  if (!narration || !narration.path) {
    throw new Error(`${E_INPUT_MISSING}: narration audio is required`);
  }

  const fitMode = config.fitMode || 'cover';
  const frameColor = config.frameColor || '#000000';
  const backgroundMode = config.backgroundMode || 'color';
  const backgroundColor = config.backgroundColor || '#000000';
  const musicVolume = config.musicVolume != null ? config.musicVolume : 0.3;
  const transitionType = renderOptions.transitionType || 'fade';
  const transitionMode = renderOptions.transitionMode || 'fixed';
  const transitionSeed = renderOptions.transitionSeed;
  const transitionDuration = renderOptions.transitionDuration != null
    ? renderOptions.transitionDuration
    : 1.0;
  const inputDurations = resolveInputDurations(scenes, {
    transitionType,
    transitionMode,
    transitionSeed,
    transitionDuration
  });

  const orderedImages = images.slice(0, scenes.length);
  const sceneFilters = orderedImages.map((img, index) => ({
    ...scenes[index],
    focus: imageFocus(img, outputConfig.id)
  }));

  const inputLabels = [];
  const args = ['-y'];

  orderedImages.forEach((img, index) => {
    inputLabels.push({ type: 'video', name: img.name, path: img.path });
    args.push(
      '-framerate', String(FPS),
      '-loop', '1',
      '-t', String(inputDurations[index]),
      '-i', img.path
    );
  });

  args.push('-i', narration.path);
  inputLabels.push({ type: 'audio', name: narration.name, path: narration.path });

  if (music && music.path) {
    args.push('-i', music.path);
    inputLabels.push({ type: 'music', name: music.name, path: music.path });
  }

  const hasMusic = !!(music && music.path);
  const totalDuration = calculateTotalDuration(scenes);

  const filterGraph = buildFullFilterGraph(sceneFilters, {
    outputConfig,
    fitMode,
    frameColor,
    backgroundMode,
    backgroundColor,
    extras: config.extras,
    fontPath: getFontPath(),
    subtitlesPath,
    fontsDir,
    hasMusic,
    totalDuration,
    musicVolume,
    zoomEnabled: renderOptions.zoomEnabled,
    zoomType: renderOptions.zoomType,
    zoomMode: renderOptions.zoomMode,
    zoomSeed: renderOptions.zoomSeed,
    zoomStartScale: renderOptions.zoomStartScale,
    zoomIntensity: renderOptions.zoomIntensity,
    transitionType,
    transitionMode,
    transitionSeed,
    transitionDuration
  });

  args.push(
    '-filter_complex', filterGraph,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-shortest',
    outputPath
  );

  return { args, totalDuration, inputLabels };
}

function runFfmpeg(ffmpegPath, args, totalDuration, onProgress, errorPrefix = E_FFMPEG_FAILED) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = '';
    let progressBuffer = '';

    proc.stdout.on('data', () => {});

    proc.stderr.on('data', data => {
      const chunk = data.toString();
      stderr += chunk;
      if (onProgress) {
        progressBuffer += chunk;
        const matches = progressBuffer.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/g);
        progressBuffer = progressBuffer.slice(-256);
        if (matches) {
          const progress = parseFfmpegProgress(matches[matches.length - 1], totalDuration);
          if (progress) onProgress(progress);
        }
      }
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        const lastLines = stderr.trim().split('\n').slice(-15).join('\n');
        const error = new Error(`${errorPrefix}: ffmpeg exited with code ${code}\n${lastLines}`);
        error.code = code;
        error.stderr = stderr;
        reject(error);
      }
    });

    proc.on('error', err => {
      reject(new Error(`${errorPrefix}: ${err.message}`));
    });
  });
}

async function renderVideo(options) {
  const { onProgress } = options;

  verifyBinaries();

  let payload;
  let outputConfigs;
  try {
    payload = parseRenderPayload(options);
    outputConfigs = resolveOutputConfigs(options, payload);
  } catch (err) {
    if (err.message && (err.message.startsWith(E_OUTPUT_CONFIG_MISSING) || err.message.startsWith(E_FFMPEG_MISSING))) {
      throw err;
    }
    throw new Error(`${E_INPUT_MISSING}: invalid render payload: ${err.message}`);
  }

  const scenes = normalizeScenesToDuration(payload.scenes, payload.audioDuration);
  const totalDuration = calculateTotalDuration(scenes);
  const totalFiles = outputConfigs.length;
  const ffmpegPath = getFfmpegPath();
  const outputs = [];

  const subtitlesEnabled = !!(payload.config.subtitles && payload.config.subtitles.enabled);
  let subtitlesDir = null;
  if (subtitlesEnabled) {
    try {
      subtitlesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-subs-'));
    } catch (err) {
      throw new Error(`${E_SUBTITLES_FAILED}: ${err.message}`);
    }
  }

  try {
    for (let index = 0; index < totalFiles; index++) {
      const outputConfig = outputConfigs[index];
      const outputPath = withOutputSuffix(payload.outputPath, outputConfig);

      let subtitlesPath;
      if (subtitlesEnabled) {
        subtitlesPath = path.join(subtitlesDir, `subs-${outputConfig.id.replace(/[:]/g, '')}.ass`);
        let content;
        try {
          content = buildAss(scenes, payload.config.subtitles, outputConfig);
          fs.writeFileSync(subtitlesPath, content, 'utf-8');
        } catch (err) {
          throw new Error(`${E_SUBTITLES_FAILED}: ${err.message}`);
        }
      }

      const built = buildFfmpegArgs({
        scenes,
        images: payload.images,
        narration: payload.narration,
        music: payload.music,
        outputPath,
        outputConfig,
        config: payload.config,
        renderOptions: payload.renderOptions,
        subtitlesPath,
        fontsDir: subtitlesEnabled ? getFontsDir() : undefined
      });
      validateInputPaths(built.inputLabels);

      const onFileProgress = onProgress
        ? (p) => {
          const overall = Math.round(((index + p.progress / 100) / totalFiles) * 100);
          onProgress({ current: p.current, progress: overall, fileIndex: index, fileProgress: p.progress, totalFiles });
        }
        : undefined;

      await runFfmpeg(
        ffmpegPath,
        built.args,
        built.totalDuration,
        onFileProgress,
        subtitlesEnabled ? E_SUBTITLES_FAILED : E_FFMPEG_FAILED
      );
      outputs.push({ id: outputConfig.id, outputPath, duration: totalDuration });
    }
  } finally {
    if (subtitlesDir) {
      try {
        fs.rmSync(subtitlesDir, { recursive: true, force: true });
      } catch {
        // temp cleanup is best-effort; the render result is already reported
      }
    }
  }

  return {
    outputs,
    outputPath: outputs.length > 0 ? outputs[0].outputPath : payload.outputPath,
    duration: totalDuration
  };
}

module.exports = {
  renderVideo,
  buildFfmpegArgs,
  resolveOutputConfigs,
  getFfmpegPath,
  getFontsDir,
  verifyBinaries,
  validateInputPaths,
  parseFfmpegProgress,
  E_FFMPEG_MISSING,
  E_INPUT_MISSING,
  E_FFMPEG_FAILED,
  E_SUBTITLES_FAILED,
  E_OUTPUT_CONFIG_MISSING
};
