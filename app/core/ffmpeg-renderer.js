const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegStatic = require('ffmpeg-static');
const {
  FPS,
  fixAsarPath,
  buildFullFilterGraph,
  calculateTotalDuration,
  normalizeScenesToDuration,
  sceneInputDuration
} = require('./ffmpeg-helpers.js');

const E_FFMPEG_MISSING = 'E_FFMPEG_MISSING';
const E_INPUT_MISSING = 'E_INPUT_MISSING';
const E_FFMPEG_FAILED = 'E_FFMPEG_FAILED';

function getFfmpegPath() {
  return fixAsarPath(ffmpegStatic);
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

function buildFfmpegArgs(options) {
  const {
    scenes,
    images,
    narration,
    music,
    outputPath,
    renderOptions = {}
  } = options;

  if (!scenes || scenes.length === 0) {
    throw new Error(`${E_INPUT_MISSING}: no scenes to render`);
  }
  if (!images || images.length < scenes.length) {
    throw new Error(`${E_INPUT_MISSING}: expected ${scenes.length} images, got ${images ? images.length : 0}`);
  }
  if (!narration || !narration.path) {
    throw new Error(`${E_INPUT_MISSING}: narration audio is required`);
  }

  const transitionType = renderOptions.transitionType || 'fade';
  const transitionDuration = renderOptions.transitionDuration != null
    ? renderOptions.transitionDuration
    : 1.0;

  const orderedImages = images.slice(0, scenes.length);
  const inputLabels = [];
  const args = ['-y'];

  orderedImages.forEach((img, index) => {
    inputLabels.push({ type: 'video', name: img.name, path: img.path });
    const inputDuration = sceneInputDuration(scenes, index, transitionType, transitionDuration);
    args.push(
      '-framerate', String(FPS),
      '-loop', '1',
      '-t', String(inputDuration),
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

  const filterGraph = buildFullFilterGraph(scenes, {
    hasMusic,
    totalDuration,
    zoomEnabled: renderOptions.zoomEnabled,
    zoomStartScale: renderOptions.zoomStartScale,
    zoomIntensity: renderOptions.zoomIntensity,
    transitionType,
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

function renderVideo(options) {
  return new Promise((resolve, reject) => {
    const { onProgress } = options;

    try {
      verifyBinaries();
    } catch (err) {
      reject(err);
      return;
    }

    let args;
    let totalDuration;
    try {
      const scenes = normalizeScenesToDuration(options.scenes || [], options.audioDuration);
      const built = buildFfmpegArgs({ ...options, scenes });
      validateInputPaths(built.inputLabels);
      args = built.args;
      totalDuration = built.totalDuration;
    } catch (err) {
      reject(err);
      return;
    }

    const ffmpegPath = getFfmpegPath();
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
        resolve({ outputPath: options.outputPath, duration: totalDuration });
      } else {
        const lastLines = stderr.trim().split('\n').slice(-15).join('\n');
        const error = new Error(`${E_FFMPEG_FAILED}: ffmpeg exited with code ${code}\n${lastLines}`);
        error.code = code;
        error.stderr = stderr;
        reject(error);
      }
    });

    proc.on('error', err => {
      reject(new Error(`${E_FFMPEG_FAILED}: ${err.message}`));
    });
  });
}

module.exports = {
  renderVideo,
  buildFfmpegArgs,
  getFfmpegPath,
  verifyBinaries,
  validateInputPaths,
  parseFfmpegProgress,
  E_FFMPEG_MISSING,
  E_INPUT_MISSING,
  E_FFMPEG_FAILED
};
