'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('os');

const E_VOICE_PIPER_MISSING = 'E_VOICE_PIPER_MISSING';
const E_VOICE_PIPER_MODEL_MISSING = 'E_VOICE_PIPER_MODEL_MISSING';
const E_VOICE_PIPER_FAILED = 'E_VOICE_PIPER_FAILED';
const E_VOICE_PIPER_CANCELLED = 'E_VOICE_PIPER_CANCELLED';

function resolvePiperPaths(modelsDir) {
  const piperExe = path.join(__dirname, '..', 'vendor', 'piper', 'piper.exe');
  const piperDataDir = path.join(__dirname, '..', 'vendor', 'piper', 'espeak-ng-data');
  const modelsDir = path.join(__dirname, '..', 'vendor', 'piper', 'models');

  if (!fs.existsSync(piperExe)) {
    throw new Error(`${E_VOICE_PIPER_MISSING}: piper.exe no encontrado en ${piperExe}. Ejecute fetch-engines.`);
  }
  if (!fs.existsSync(piperDataDir)) {
    throw new Error(`${E_VOICE_PIPER_MISSING}: espeak-ng-data no encontrado en ${piperDataDir}. Ejecute fetch-engines.`);
  }

  return { piperExe, piperDataDir, modelsDir };
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

  if (options.length_scale !== undefined) {
    args.push('--length_scale', String(options.length_scale));
  }

  if (options.noise_w !== undefined) {
    args.push('--noise_w', String(options.noise_w));
  }

  if (options.sentence_silence !== undefined) {
    args.push('--sentence_silence', String(options.sentence_silence));
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
      voiceId,
      speed,
      pause
    } = options;

    if (!outputPath || !path.isAbsolute(outputPath)) {
      reject(new Error(`${E_VOICE_PIPER_FAILED}: outputPath debe ser una ruta absoluta`));
      return;
    }

    if (!text || !text.trim()) {
      reject(new Error(`${E_VOICE_PIPER_FAILED}: texto vacío`));
      return;
    }

    const piperPaths = resolvePiperPaths(modelsDir);

    const voiceMap = {
      'es_MX-ald-medium': { model: 'es_MX-ald-medium', language: 'es_MX' },
      'es_MX-ald-x_low': { model: 'es_MX-ald-x_low', language: 'es_MX' },
      'es_ES-carlfm-x_low': { model: 'es_ES-carlfm-x_low', language: 'es_ES' },
      'es_ES-carlfm-medium': { model: 'es_ES-carlfm-medium', language: 'es_ES' },
      'en_US-lessac-medium': { model: 'en_US-lessac-medium', language: 'en_US' },
      'en_US-lessac-low': { model: 'en_US-lessac-low', language: 'en_US' },
      'en_US-lessac-high': { model: 'en_US-lessac-high', language: 'en_US' }
    };

    const voiceKey = voiceId || voiceMap[language] || 'es_MX-ald-medium';
    const modelFile = `${voiceKey}.onnx`;
    const configFile = `${voiceKey}.onnx.json`;

    const modelPath = path.join(__dirname, '..', 'vendor', 'piper', 'models', modelFile);
    const configPath = path.join(__dirname, '..', 'vendor', 'piper', 'models', configFile);

    if (!fs.existsSync(modelPath)) {
      throw new Error(`${E_VOICE_PIPER_MODEL_MISSING}: modelo no encontrado: ${modelPath}`);
    }
    if (!fs.existsSync(configPath)) {
      throw new Error(`${E_VOICE_PIPER_MODEL_MISSING}: config no encontrado: ${configPath}`);
    }

    const tempOutputPath = outputPath.replace('.wav', '_piper_temp.wav');

    const args = buildPiperArgs({
      outputPath: tempOutputPath,
      speaker: 0,
      noise_scale: 0.667,
      length_scale: 1.0 / (options.speed || 1.0),
      noise_w: 0.8,
      sentence_silence: options.pause || 0.2
    }, modelPath, configPath, __dirname, '..', 'vendor', 'piper', 'espeak-ng-data');

    let textBuffer = Buffer.from(text, 'utf8');

    let child;
    let cancelled = false;
    let settled = false;
    let errorOutput = '';

    const onProgress = typeof hooks.onProgress === 'function' ? hooks.onProgress : () => {};
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
      if (signal.aborted) { reject(new Error(`${E_VOICE_PIPER_CANCELLED}: synthesis cancelled`)); return; }
      if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort);
    }

    const childEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };

    child = spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', ['/c', `${path.join(__dirname, '..', 'vendor', 'piper', 'piper.exe')} --model "${path.join(__dirname, '..', 'vendor', 'piper', 'models', `${voiceKey}.onnx`)}" --config "${path.join(__dirname, '..', 'vendor', 'piper', 'models', `${voiceKey}.onnx.json`)}" --output_file "${tempOutputPath}" --espeak_data "${path.join(__dirname, '..', 'vendor', 'piper', 'espeak-ng-data')}" --length_scale ${1.0 / (options.speed || 1.0)} --sentence_silence ${options.pause || 0.2} --noise_scale 0.667 --noise_w 0.8 --speaker 0'], {
      windowsHide: true,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdin.write(Buffer.from(text, 'utf8'));
    child.stdin.end();

    let errorOutput = '';
    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    child.on('error', (err) => {
      if (cancelled) return;
      finish(reject, new Error(`${E_VOICE_PIPER_FAILED}: ${err.message}`));
    });

    child.on('close', (code) => {
      if (cancelled) {
        finish(reject, new Error(`${E_VOICE_PIPER_CANCELLED}: synthesis cancelled`));
        return;
      }
      if (code !== 0) {
        finish(reject, new Error(`${E_VOICE_PIPER_FAILED}: piper exited with code ${code}: ${errorOutput}`));
        return;
      }
      if (!fs.existsSync(tempOutputPath)) {
        finish(reject, new Error(`${E_VOICE_PIPER_FAILED}: output file not created`));
        return;
      }
      fs.renameSync(tempOutputPath, outputPath);
      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        finish(reject, new Error(`${E_VOICE_PIPER_FAILED}: output file is empty`));
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
  const { piperExe, piperDataDir, modelsDir } = resolvePiperPaths(modelsDir);

  const details = [];
  let ready = true;

  const modelsDirPath = path.join(__dirname, '..', 'vendor', 'piper', 'models');
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
  synthesizeVoice: synthesizeVoicePiper,
  checkVoiceEngine: checkVoiceEnginePiper
};