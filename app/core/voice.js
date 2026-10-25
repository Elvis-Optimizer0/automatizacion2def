const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { checkModelFiles } = require('./models.js');
const { resolveKokoroRuntime, resolveEdgeRuntime } = require('./runtime-paths.js');

const E_VOICE_ENGINE_MISSING = 'E_VOICE_ENGINE_MISSING';
const E_VOICE_FAILED = 'E_VOICE_FAILED';
const E_VOICE_PATH_INVALID = 'E_VOICE_PATH_INVALID';
const E_VOICE_CANCELLED = 'E_VOICE_CANCELLED';

const SUPPORTED_LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'Inglés' }
];

const VOICE_CATALOG = [
  { id: 'ef_dora', name: 'Dora', language: 'es', engine: 'kokoro', quality: 'alta' },
  { id: 'em_alex', name: 'Alex', language: 'es', engine: 'kokoro', quality: 'alta' },
  { id: 'em_santa', name: 'Santa', language: 'es', engine: 'kokoro', quality: 'media' },
  { id: 'af_heart', name: 'Heart', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'af_bella', name: 'Bella', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'af_nicole', name: 'Nicole', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'am_michael', name: 'Michael', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'am_adam', name: 'Adam', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'bf_emma', name: 'Emma', language: 'en', engine: 'kokoro', quality: 'media' },
  { id: 'bm_george', name: 'George', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'es-MX-JorgeNeural', name: 'Jorge (México)', language: 'es', engine: 'edge', quality: 'alta', gender: 'male' },
  { id: 'es-MX-DaliaNeural', name: 'Dalia (México)', language: 'es', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'es-ES-AlvaroNeural', name: 'Álvaro (España)', language: 'es', engine: 'edge', quality: 'alta', gender: 'male' },
  { id: 'es-ES-ElviraNeural', name: 'Elvira (España)', language: 'es', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'es-ES-XimenaNeural', name: 'Ximena (España)', language: 'es', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'es-AR-ElenaNeural', name: 'Elena (Argentina)', language: 'es', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'es-AR-TomasNeural', name: 'Tomás (Argentina)', language: 'es', engine: 'edge', quality: 'alta', gender: 'male' },
  { id: 'es-CO-GonzaloNeural', name: 'Gonzalo (Colombia)', language: 'es', engine: 'edge', quality: 'alta', gender: 'male' },
  { id: 'es-CO-SalomeNeural', name: 'Salomé (Colombia)', language: 'es', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'es-CL-CatalinaNeural', name: 'Catalina (Chile)', language: 'es', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'es-CL-LorenzoNeural', name: 'Lorenzo (Chile)', language: 'es', engine: 'edge', quality: 'alta', gender: 'male' },
  { id: 'es-EC-AndreaNeural', name: 'Andrea (Ecuador)', language: 'es', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'es-EC-LuisNeural', name: 'Luis (Ecuador)', language: 'es', engine: 'edge', quality: 'alta', gender: 'male' },
  { id: 'es-US-AlonsoNeural', name: 'Alonso (EE. UU.)', language: 'es', engine: 'edge', quality: 'alta', gender: 'male' },
  { id: 'es-US-PalomaNeural', name: 'Paloma (EE. UU.)', language: 'es', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'en-US-AriaNeural', name: 'Aria (EE. UU.)', language: 'en', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy (EE. UU.)', language: 'en', engine: 'edge', quality: 'alta', gender: 'male' },
  { id: 'en-US-JennyNeural', name: 'Jenny (EE. UU.)', language: 'en', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'en-GB-LibbyNeural', name: 'Libby (Reino Unido)', language: 'en', engine: 'edge', quality: 'alta', gender: 'female' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (Reino Unido)', language: 'en', engine: 'edge', quality: 'alta', gender: 'male' }
];

const SAMPLE_PHRASES = {
  es: 'Hola, esta es una muestra de la voz seleccionada.',
  en: 'Hello, this is a sample of the selected voice.'
};

function normalizeLanguage(language) {
  const value = String(language == null ? '' : language).trim().toLowerCase();
  if (value === 'en' || value === 'eng' || value === 'english') return 'en';
  return 'es';
}

function listVoices(language, engine) {
  const lang = normalizeLanguage(language);
  let voices = VOICE_CATALOG.filter(voice => voice.language === lang);
  if (engine) {
    voices = voices.filter(voice => voice.engine === engine);
  }
  return voices;
}

function getVoice(voiceId) {
  return VOICE_CATALOG.find(voice => voice.id === voiceId) || null;
}

function getSamplePhrase(language) {
  return SAMPLE_PHRASES[normalizeLanguage(language)];
}

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test' || env.ELECTRON_TEST === '1' || env.VM_TEST_VOICE === '1';
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function simulateSpeechDuration(text, options = {}) {
  const speed = clampNumber(options.speed, 0.5, 2, 1);
  const pause = clampNumber(options.pause, 0, 3, 0.3);
  const paragraphs = String(text == null ? '' : text)
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return 0;
  const words = paragraphs.reduce((sum, line) => sum + (line.match(/\S+/g) || []).length, 0);
  if (words === 0) return 0;
  const base = Math.round((words * 0.35 / speed) * 100) / 100;
  const pauseTotal = Math.max(0, paragraphs.length - 1) * pause;
  return Math.round((base + pauseTotal) * 100) / 100;
}

function isUsableBinary(value) {
  return !!(value && path.isAbsolute(value) && fs.existsSync(value));
}

function resolveEngine(voiceId, env = process.env, options = {}) {
  const voice = getVoice(voiceId);
  const engine = voice ? voice.engine : 'kokoro';

  if (engine === 'kokoro') {
    const bundled = resolveKokoroRuntime(options);
    if (bundled.executable) {
      return {
        engine: 'kokoro',
        executable: bundled.executable,
        modelsDir: bundled.modelsDir,
        model: env.VM_KOKORO_MODEL || '',
        source: 'bundled'
      };
    }
    if (isUsableBinary(env.VM_KOKORO_BIN)) {
      return { engine: 'kokoro', executable: env.VM_KOKORO_BIN, model: env.VM_KOKORO_MODEL || '', source: 'env' };
    }
    return null;
  }

  if (engine === 'edge') {
    const bundled = resolveEdgeRuntime(options);
    if (bundled.runnerPath) {
      const pythonExe = path.join(bundled.dir, 'runtime', 'python', 'python.exe');
      if (fs.existsSync(pythonExe)) {
        return {
          engine: 'edge',
          pythonExe,
          runnerPath: bundled.runnerPath,
          source: 'bundled'
        };
      }
    }
    return null;
  }

  return null;
}

function checkVoiceEngine(voiceId, env = process.env, modelsDir, options = {}) {
  const voice = getVoice(voiceId);
  const engine = voice ? voice.engine : 'kokoro';

  if (engine === 'kokoro') {
    const bundled = resolveKokoroRuntime(options);

    const runtime = bundled.executable
      || (isUsableBinary(env.VM_KOKORO_BIN) ? env.VM_KOKORO_BIN : null);

    const modelsBaseDir = bundled.executable
      ? bundled.modelsDir
      : modelsDir || null;

    const modelInfo = checkModelFiles(modelsBaseDir, engine);

    return {
      engine,
      runtimeEnv: 'VM_KOKORO_BIN',
      runtime,
      bundled: !!bundled.executable,
      bundledDir: bundled.dir,
      runtimeSearchDirs: bundled.searched || [],
      modelsDir: modelsBaseDir,
      modelDir: modelInfo.modelDir,
      modelFound: modelInfo.modelFound,
      missingFiles: modelInfo.missingFiles,
      ready: !!runtime && modelInfo.missingFiles.length === 0
    };
  }

  if (engine === 'edge') {
    const bundled = resolveEdgeRuntime(options);
    const hasPython = !!bundled.dir && fs.existsSync(path.join(bundled.dir, 'runtime', 'python', 'python.exe'));
    const pythonExe = hasPython ? path.join(bundled.dir, 'runtime', 'python', 'python.exe') : null;
    const hasRunner = !!bundled.runnerPath;
    const hasEdgeTts = hasPython && fs.existsSync(path.join(path.dirname(pythonExe), 'Lib', 'site-packages', 'edge_tts', '__init__.py'));

    return {
      engine: 'edge',
      runtimeEnv: 'VM_EDGE_PYTHON',
      runtime: hasPython ? pythonExe : null,
      runnerPath: bundled.runnerPath,
      bundled: hasPython && hasRunner && hasEdgeTts,
      bundledDir: bundled.dir,
      runtimeSearchDirs: bundled.searched || [],
      modelsDir: null,
      modelDir: null,
      modelFound: true,
      missingFiles: [],
      ready: hasPython && hasRunner && hasEdgeTts
    };
  }

  return {
    engine,
    runtime: null,
    ready: false
  };
}

function buildVoiceEngineError(readiness) {
  const details = [];
  if (readiness.modelFound && readiness.missingFiles.length > 0) {
    readiness.missingFiles.forEach((file) => {
      details.push(`falta ${file.fileName} (se busca en ${file.path})`);
    });
  } else if (!readiness.modelFound) {
    details.push(`no se encontraron los archivos del modelo ${readiness.engine} en ${readiness.modelsDir || 'userData/models'}`);
  }
  if (!readiness.runtime) {
    const where = readiness.runtimeSearchDirs && readiness.runtimeSearchDirs.length
      ? ` (se busca en ${readiness.runtimeSearchDirs.join(' o ')})`
      : '';
    details.push(`falta el runtime de ${readiness.engine}${where}`);
  }
  if (readiness.engine === 'edge' && readiness.runtime && !readiness.runnerPath) {
    details.push('falta edge-runner.py en el directorio del runtime');
  }
  if (readiness.engine === 'edge' && readiness.runtime && readiness.runnerPath) {
    const pythonExe = path.join(readiness.bundledDir, 'runtime', 'python', 'python.exe');
    const edgeTtsPath = path.join(path.dirname(pythonExe), 'Lib', 'site-packages', 'edge_tts', '__init__.py');
    if (!fs.existsSync(edgeTtsPath)) {
      details.push('falta el paquete edge-tts en el Python embebido (ejecute fetch-engines)');
    }
  }
  return `${E_VOICE_ENGINE_MISSING}: ${details.length ? details.join('; ') : 'no hay motor de voz instalado'}`;
}

function buildEngineArgs(engine, options) {
  const voice = getVoice(options.voiceId);
  const args = ['--output', options.outputPath];
  if (options.voiceId) args.push('--voice', options.voiceId);
  if (voice && voice.language) args.push('--lang', voice.language);
  if (options.speed) args.push('--speed', String(options.speed));
  if (options.rate) args.push('--rate', String(options.rate));
  if (options.pitch) args.push('--pitch', String(options.pitch));
  return args;
}

const SYNTHESIS_TIMEOUT_MS = 180000;

function synthesizeVoice(options, hooks = {}) {
  return new Promise((resolve, reject) => {
    const opts = options || {};
    const outputPath = opts.outputPath;
    const text = String(opts.text == null ? '' : opts.text).trim();
    const onProgress = typeof hooks.onProgress === 'function' ? hooks.onProgress : () => {};
    const env = opts.env || process.env;

    if (!outputPath || !path.isAbsolute(outputPath)) {
      reject(new Error(`${E_VOICE_PATH_INVALID}: outputPath must be an absolute path`));
      return;
    }
    if (!text) {
      reject(new Error(`${E_VOICE_FAILED}: text is empty`));
      return;
    }

    const language = normalizeLanguage(opts.language);
    const speed = clampNumber(opts.speed, 0.5, 2, 1);
    const pause = clampNumber(opts.pause, 0, 3, 0.3);
    const duration = simulateSpeechDuration(text, { speed, pause });
    const testMode = isTestMode(env);

    let command;
    let args;
    let engine = null;
    if (testMode) {
      command = process.execPath;
      args = [path.join(__dirname, '..', 'workers', 'voice-worker.js')];
    } else {
      const engineOptions = { resourcesDir: opts.resourcesDir, bundled: opts.bundled };
      engine = resolveEngine(opts.voiceId, env, engineOptions);
      const readiness = checkVoiceEngine(opts.voiceId, env, opts.modelsDir, engineOptions);
      if (!engine || !readiness.ready) {
        reject(new Error(buildVoiceEngineError(readiness)));
        return;
      }
      if (engine.engine === 'kokoro') {
        command = engine.executable;
        args = buildEngineArgs(engine, { ...opts, outputPath, language, speed, pause });
      } else if (engine.engine === 'edge') {
        command = engine.pythonExe;
        args = [engine.runnerPath, ...buildEngineArgs(engine, { ...opts, outputPath, language, speed, pause })];
      }
    }

    const childEnv = testMode
      ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      : { ...process.env };

    let child;
    try {
      child = spawn(command, args, { windowsHide: true, env: childEnv });
    } catch (err) {
      reject(new Error(`${E_VOICE_FAILED}: ${err.message}`));
      return;
    }

    if (typeof hooks.onSpawn === 'function') hooks.onSpawn(child);

    let settled = false;
    let cancelled = false;
    let stdout = '';
    let stderr = '';

    const timeoutTimer = setTimeout(() => {
      if (!settled) {
        cancelled = true;
        try { child.kill(); } catch (err) { void err; }
        finish(reject, new Error(`${E_VOICE_FAILED}: synthesis timed out after ${SYNTHESIS_TIMEOUT_MS / 1000}s`));
      }
    }, SYNTHESIS_TIMEOUT_MS);

    const onAbort = () => {
      cancelled = true;
      try { child.kill(); } catch (err) { void err; }
    };

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (hooks.signal && typeof hooks.signal.removeEventListener === 'function') {
        hooks.signal.removeEventListener('abort', onAbort);
      }
    };

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    if (hooks.signal) {
      if (hooks.signal.aborted) {
        onAbort();
      } else if (typeof hooks.signal.addEventListener === 'function') {
        hooks.signal.addEventListener('abort', onAbort);
      }
    }

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      let index;
      while ((index = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, index).trim();
        stdout = stdout.slice(index + 1);
        if (!line) continue;
        let event;
        try { event = JSON.parse(line); } catch (err) { continue; }
        if (event.type === 'progress') onProgress({ progress: event.progress, message: event.message });
        else if (event.type === 'done') finish(resolve, { outputPath: event.outputPath || outputPath, duration: event.duration });
        else if (event.type === 'error') finish(reject, new Error(`${E_VOICE_FAILED}: ${event.message}`));
      }
    });

    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const wantsStdin = testMode || (engine && (engine.engine === 'kokoro' || engine.engine === 'edge'));
    if (wantsStdin) {
      child.stdin.write(JSON.stringify({ outputPath, duration, text, language, speed, pause, voiceId: opts.voiceId, rate: opts.rate, pitch: opts.pitch }));
      child.stdin.end();
    }

    child.on('error', (err) => finish(reject, new Error(`${E_VOICE_FAILED}: ${err.message}`)));
    child.on('close', (code) => {
      if (cancelled) {
        finish(reject, new Error(`${E_VOICE_CANCELLED}: voice generation cancelled`));
        return;
      }
      if (code === 0 && fs.existsSync(outputPath)) {
        finish(resolve, { outputPath, duration });
        return;
      }
      const tail = stderr.trim().split('\n').slice(-3).join(' ');
      finish(reject, new Error(`${E_VOICE_FAILED}: engine exited with code ${code}${tail ? ' ' + tail : ''}`));
    });
  });
}

module.exports = {
  E_VOICE_ENGINE_MISSING,
  E_VOICE_FAILED,
  E_VOICE_PATH_INVALID,
  E_VOICE_CANCELLED,
  SUPPORTED_LANGUAGES,
  VOICE_CATALOG,
  SAMPLE_PHRASES,
  normalizeLanguage,
  listVoices,
  getVoice,
  getSamplePhrase,
  isTestMode,
  simulateSpeechDuration,
  resolveEngine,
  checkVoiceEngine,
  buildVoiceEngineError,
  synthesizeVoice
};