'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolvePiperRuntime: resolveBundledPiperRuntime } = require('./runtime-paths.js');

const E_VOICE_PIPER_MISSING = 'E_VOICE_PIPER_MISSING';
const E_VOICE_PIPER_MODEL_MISSING = 'E_VOICE_PIPER_MODEL_MISSING';
const E_VOICE_PIPER_FAILED = 'E_VOICE_PIPER_FAILED';
const E_VOICE_PIPER_CANCELLED = 'E_VOICE_PIPER_CANCELLED';

function resolvePiperRuntime(options = {}) {
  const runtime = resolveBundledPiperRuntime(options);
  if (!runtime.executable) {
    return {
      executable: null,
      piperDataDir: null,
      modelsDir: null,
      dir: null,
      searched: runtime.searched
    };
  }

  return {
    executable: runtime.executable,
    piperDataDir: runtime.piperDataDir,
    modelsDir: runtime.modelsDir,
    dir: runtime.dir,
    searched: runtime.searched
  };
}

function resolvePiperPaths(modelsDirParam) {
  const runtime = resolvePiperRuntime();
  if (!runtime.executable) {
    throw new Error(`${E_VOICE_PIPER_MISSING}: piper.exe no encontrado. Ejecute fetch-engines.`);
  }
  if (!fs.existsSync(runtime.piperDataDir)) {
    throw new Error(`${E_VOICE_PIPER_MISSING}: espeak-ng-data no encontrado en ${runtime.piperDataDir}. Ejecute fetch-engines.`);
  }

  const modelsDir = modelsDirParam
    ? path.join(modelsDirParam, 'piper')
    : runtime.modelsDir;
  return { piperExe: runtime.executable, piperDataDir: runtime.piperDataDir, modelsDir };
}

function buildPiperArgs(options, modelPath, configPath, piperExe, piperDataDir) {
  const args = [piperExe];

  args.push('--model', modelPath);
  args.push('--config', configPath);

  if (options.outputPath) {
    args.push('--output_file', options.outputPath);
  } else {
    args.push('--output_raw');
  }

  args.push('--espeak_data', piperDataDir);

  if (options.speaker !== undefined) {
    args.push('--speaker', String(options.speaker));
  }

  if (options.noise_scale !== undefined) {
    args.push('--noise_scale', String(options.noise_scale));
  }

  // Auto-convert speed to length_scale if length_scale not provided
  const lengthScale = options.length_scale !== undefined
    ? options.length_scale
    : (options.speed !== undefined ? 1.0 / options.speed : 1.0);
  args.push('--length_scale', String(lengthScale));

  if (options.noise_w !== undefined) {
    args.push('--noise_w', String(options.noise_w));
  }

  if (options.noise_scale !== undefined) {
    args.push('--noise_scale', String(options.noise_scale));
  }

  // Accept both sentence_silence and pause as aliases
  const sentenceSilence = options.sentence_silence !== undefined ? options.sentence_silence : options.pause;
  if (sentenceSilence !== undefined) {
    args.push('--sentence_silence', String(sentenceSilence));
  }

  if (options.speaker !== undefined) {
    args.push('--speaker', String(options.speaker));
  }

  return args;
}

function synthesizeVoicePiper(options, hooks = {}) {
  return new Promise((resolve, reject) => {
    const {
      text,
      outputPath,
      modelsDir,
      language,
      voiceId
    } = options;

    if (!outputPath || !path.isAbsolute(outputPath)) {
      reject(new Error(`${E_VOICE_PIPER_FAILED}: outputPath debe ser una ruta absoluta`));
      return;
    }

    if (!text || !text.trim()) {
      reject(new Error(`${E_VOICE_PIPER_FAILED}: texto vacío`));
      return;
    }

    const resolved = resolvePiperPaths(modelsDir);

    const voiceMap = {
      'es_MX-ald-medium': { model: 'es_MX-ald-medium', language: 'es_MX' },
      'es_MX-ald-x_low': { model: 'es_MX-ald-x_low', language: 'es_MX' },
      'es_ES-carlfm-x_low': { model: 'es_ES-carlfm-x_low', language: 'es_ES' },
      'en_US-lessac-medium': { model: 'en_US-lessac-medium', language: 'en_US' },
      'en_US-lessac-low': { model: 'en_US-lessac-low', language: 'en_US' }
    };

    const voiceKey = voiceId || voiceMap[language] || 'es_MX-ald-medium';
    const modelFile = `${voiceKey}.onnx`;
    const configFile = `${voiceKey}.onnx.json`;

    const modelPath = path.join(resolved.modelsDir, modelFile);
    const configPath = path.join(resolved.modelsDir, configFile);

    if (!fs.existsSync(modelPath)) {
      throw new Error(`${E_VOICE_PIPER_MODEL_MISSING}: modelo no encontrado: ${modelPath}`);
    }
    if (!fs.existsSync(configPath)) {
      throw new Error(`${E_VOICE_PIPER_MODEL_MISSING}: config no encontrado: ${configPath}`);
    }

    const tempOutputPath = outputPath.replace('.wav', '_piper_temp.wav');

    const piperArgs = buildPiperArgs({
      outputPath: tempOutputPath,
      speaker: 0,
      noise_scale: 0.667,
      length_scale: 1.0 / (options.speed || 1.0),
      noise_w: 0.8,
      sentence_silence: options.pause || 0.2
    }, modelPath, configPath, resolved.piperExe, resolved.piperDataDir);

    let cancelled = false;
    let settled = false;
    let errorOutput = '';

    const signal = hooks.signal;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const onAbort = () => {
      cancelled = true;
      if (child) child.kill();
    };

    if (signal) {
      if (signal.aborted) { reject(new Error(E_VOICE_PIPER_CANCELLED + ': synthesis cancelled')); return; }
      if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort);
    }

    const childEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };

    const child = spawn(resolved.piperExe, piperArgs.slice(1), {
      windowsHide: true,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdin.write(Buffer.from(text, 'utf8'));
    child.stdin.end();

    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    child.on('error', (err) => {
      if (cancelled) return;
      finish(reject, new Error(E_VOICE_PIPER_FAILED + ': ' + err.message));
    });

    child.on('close', (code) => {
      if (cancelled) {
        finish(reject, new Error(E_VOICE_PIPER_CANCELLED + ': synthesis cancelled'));
        return;
      }
      if (code !== 0) {
        finish(reject, new Error(E_VOICE_PIPER_FAILED + ': piper exited with code ' + code + ': ' + errorOutput));
        return;
      }
      if (!fs.existsSync(tempOutputPath)) {
        finish(reject, new Error(E_VOICE_PIPER_FAILED + ': output file not created'));
        return;
      }
      fs.renameSync(tempOutputPath, outputPath);
      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        finish(reject, new Error(E_VOICE_PIPER_FAILED + ': output file is empty'));
        return;
      }
      finish(resolve, { path: outputPath, duration: 0 });
    });

    setTimeout(() => {
      if (!settled && child) {
        child.kill();
      }
    }, 300000);
  });
}

function checkVoiceEnginePiper(modelsDir) {
  const resolved = resolvePiperPaths(modelsDir);

  const details = [];
  let ready = true;

  const modelsDirPath = resolved.modelsDir;
  if (!fs.existsSync(modelsDirPath)) {
    ready = false;
    details.push(`directorio de modelos no existe: ${modelsDirPath}`);
  }

  return { ready, modelFound: fs.existsSync(modelsDirPath), modelDir: modelsDirPath, missingFiles: [], details };
}

module.exports = {
  E_VOICE_PIPER_MISSING,
  E_VOICE_PIPER_MODEL_MISSING,
  E_VOICE_PIPER_FAILED,
  E_VOICE_PIPER_CANCELLED,
  resolvePiperRuntime,
  buildPiperArgs,
  synthesizeVoice: synthesizeVoicePiper,
  checkVoiceEngine: checkVoiceEnginePiper
};