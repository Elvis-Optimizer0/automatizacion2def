const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const ffmpegStatic = require('ffmpeg-static');
const { ZOOM_PRESETS, generateMotionSequence, validateMotionSpec, FPS } = require('./zoom-v3.js');

const SCENE_DURATION = 6;
const FPS_VAL = FPS || 30;
const TOTAL_FRAMES = FPS_VAL * SCENE_DURATION;

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve({ ok: true, stderr });
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', err => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
  });
}

function getFormatDims(format) {
  if (format === '9:16') return { w: 1080, h: 1920 };
  return { w: 1920, h: 1080 };
}

async function renderScene(scenePlan, imagePath, options = {}) {
  const format = options.format || '16:9';
  const { w: outW, h: outH } = getFormatDims(format);
  const effect = scenePlan.effect;
  const duration = Number(scenePlan.duration || SCENE_DURATION);

  if (!effect) {
    throw new Error('scenePlan.effect is required');
  }

  const motionSpec = ZOOM_PRESETS[effect];
  if (!motionSpec) {
    throw new Error(`Unknown effect '${effect}'. Available: ${Object.keys(ZOOM_PRESETS).join(', ')}`);
  }

  validateMotionSpec(motionSpec);

  // Build motion sequence using zoom-v3.js (import only, no copied logic)
  const motionSequence = generateMotionSequence(motionSpec, TOTAL_FRAMES);

  // Upscale source 4x for sub-pixel precision (matching zoom-lab approach)
  const UPSCALE = 4;
  const srcMeta = await sharp(imagePath).metadata();
  const srcW = srcMeta.width;
  const srcH = srcMeta.height;
  const upW = srcW * UPSCALE;
  const upH = srcH * UPSCALE;
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'render-scene-'));
  const upscaledPath = path.join(tmpDir, 'upscaled.png');

  await sharp(imagePath)
    .resize(upW, upH, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(upscaledPath);

  // Compute padding needed for scale < 1.0 (zoom out beyond source)
  const minScale = Math.min(...motionSequence.map(m => m.scale));
  const padW = minScale < 1.0 ? Math.ceil(upW * (1 / minScale - 1) / 2) : 0;
  const padH = minScale < 1.0 ? Math.ceil(upH * (1 / minScale - 1) / 2) : 0;
  const paddedPath = padW > 0 || padH > 0
    ? path.join(tmpDir, 'padded.png')
    : upscaledPath;

  if (padW > 0 || padH > 0) {
    await sharp(upscaledPath)
      .extend({ top: padH, bottom: padH, left: padW, right: padW, background: { r: 0, g: 0, b: 0 } })
      .png()
      .toFile(paddedPath);
  }

  const padOffsetX = padW;
  const padOffsetY = padH;
  const paddedW = upW + 2 * padW;
  const paddedH = upH + 2 * padH;

  // Generate each frame: crop at 4x (sub-pixel at output), downscale to output
  const framesDir = path.join(tmpDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const m = motionSequence[i];
    const centerX = m.cx * upW + padOffsetX;
    const centerY = m.cy * upH + padOffsetY;
    const cropW = Math.round(upW / m.scale);
    const cropH = Math.round(upH / m.scale);
    const cropX = Math.round(Math.max(0, Math.min(paddedW - cropW, centerX - cropW / 2)));
    const cropY = Math.round(Math.max(0, Math.min(paddedH - cropH, centerY - cropH / 2)));

    await sharp(paddedPath)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toFile(path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`));
  }

// Encode frames to lossless intermediate with FFV1
  // Try FFV1 in MKV container (more compatible than MP4 for FFV1)
  const safeFormat = format.replace(':', '_');
  // Ensure .mkv extension is always present
  var outputFileName = 'scene_' + effect + '_' + safeFormat + '.mkv';
  var outputPath = path.join(options.workDir || fs.mkdtempSync(path.join(require('os').tmpdir(), 'render-scene-')), outputFileName);

  const encodeArgs = [
    '-y',
    '-framerate', String(FPS_VAL),
    '-i', path.join(framesDir, 'frame_%04d.png'),
    '-c:v', 'ffv1',
    '-pix_fmt', 'yuv422p',
    '-r', String(FPS_VAL),
    '-an',
    outputPath
  ];

  const renderStart = Date.now();
  let encodeOutput = '';
  try {
    const result = await runFfmpeg(encodeArgs);
    encodeOutput = result.stderr;
  } catch (e) {
    // FFV1 failed, try utvideo
    const utArgs = [
      '-y',
      '-framerate', String(FPS_VAL),
      '-i', path.join(framesDir, 'frame_%04d.png'),
      '-c:v', 'utvideo',
      '-pix_fmt', 'yuv422p',
      '-r', String(FPS_VAL),
      '-an',
      outputPath
    ];
    try {
      await runFfmpeg(utArgs);
    } catch (e2) {
      // Both failed, fall back to libx264 CRF 0 in MKV
      const fallbackArgs = [
        '-y',
        '-framerate', String(FPS_VAL),
        '-i', path.join(framesDir, 'frame_%04d.png'),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '0',
        '-pix_fmt', 'yuv420p',
        '-r', String(FPS_VAL),
        '-an',
        outputPath
      ];
      await runFfmpeg(fallbackArgs);
      outputPath = outputPath + '.fallback';
    }
  }

  const renderSeconds = ((Date.now() - renderStart) / 1000).toFixed(2);

  // Probe the output
  let probe = { ok: false, codec_name: 'unknown', width: outW, height: outH, duration: renderSeconds };
  try {
    const probArgs = ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt,duration', '-of', 'json', outputPath];
    const { spawn } = require('child_process');
    const ffprobeStatic = require('ffprobe-static');
    const pfProc = spawn(ffprobeStatic.path, probArgs, { windowsHide: true });
    let pfStdout = '';
    pfProc.stdout.on('data', d => { pfStdout += d.toString(); });
    pfProc.on('close', code => {
      try {
        const info = JSON.parse(pfStdout);
        probe = { ok: true, ...info };
      } catch { }
    });
  } catch { }

  // Clean up temp files
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }

  const codec = fs.existsSync(outputPath) && outputPath.includes('.mkv') && !outputPath.includes('.fallback') ? 'ffv1' :
                fs.existsSync(outputPath) && outputPath.includes('.utvideo') ? 'utvideo' : 'libx264-CRF0';

  return {
    outputPath,
    duration,
    renderSeconds,
    effect,
    format,
    width: outW,
    height: outH,
    fps: FPS_VAL,
    totalFrames: TOTAL_FRAMES,
    codec,
    probe: {
      width: probe.width || outW, height: probe.height || outH,
      codec_name: probe.codec_name || codec, pix_fmt: probe.pix_fmt,
      r_frame_rate: probe.r_frame_rate, format: probe.format, duration: probe.duration
    }
  };
}

module.exports = {
  renderScene,
  FPS: FPS_VAL,
  ZOOM_PRESETS,
  getFormatDims,
  TOTAL_FRAMES
};