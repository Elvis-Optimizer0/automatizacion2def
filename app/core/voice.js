const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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
  { id: 'es_piper', name: 'Piper Español', language: 'es', engine: 'piper', quality: 'media' },
  { id: 'af_heart', name: 'Heart', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'af_bella', name: 'Bella', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'af_nicole', name: 'Nicole', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'am_michael', name: 'Michael', language: 'en', engine: 'kokoro', quality: 'alta' },
  { id: 'am_adam', name: 'Adam', language: 'en', engine: 'kokoro', quality: 'media' },
  { id: 'bf_emma', name: 'Emma', language: 'en', engine: 'kokoro', quality: 'media' },
  { id: 'bm_george', name: 'George', language: 'en', engine: 'kokoro', quality: 'media' },
  { id: 'en_piper', name: 'Piper English', language: 'en', engine: 'piper', quality: 'media' }
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

function listVoices(language) {
  const lang = normalizeLanguage(language);
  return VOICE_CATALOG.filter(voice => voice.language === lang);
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

function resolveEngine(voiceId, env = process.env) {
  const voice = getVoice(voiceId);
  const engine = voice ? voice.engine : 'kokoro';

  if (engine === 'piper') {
    const bin = env.VM_PIPER_BIN;
    if (bin && path.isAbsolute(bin) && fs.existsSync(bin)) {
      return { engine: 'piper', executable: bin, model: env.VM_PIPER_MODEL || '' };
    }
  }

  const kokoroBin = env.VM_KOKORO_BIN;
  if (kokoroBin && path.isAbsolute(kokoroBin) && fs.existsSync(kokoroBin)) {
    return { engine: 'kokoro', executable: kokoroBin, model: env.VM_KOKORO_MODEL || '' };
  }

  if (env.VM_PIPER_BIN && path.isAbsolute(env.VM_PIPER_BIN) && fs.existsSync(env.VM_PIPER_BIN)) {
    return { engine: 'piper', executable: env.VM_PIPER_BIN, model: env.VM_PIPER_MODEL || '' };
  }

  return null;
}

function buildEngineArgs(engine, options) {
  if (engine.engine === 'piper') {
    const args = ['-m', engine.model || '', '-f', options.outputPath];
    if (options.speed) args.push('--length_scale', String(1 / options.speed));
    return args;
  }
  const voice = getVoice(options.voiceId);
  const args = ['--output', options.outputPath];
  if (options.voiceId) args.push('--voice', options.voiceId);
  if (voice && voice.language) args.push('--lang', voice.language);
  if (options.speed) args.push('--speed', String(options.speed));
  return args;
}

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
    if (testMode) {
      command = process.execPath;
      args = [path.join(__dirname, '..', 'workers', 'voice-worker.js')];
    } else {
      const engine = resolveEngine(opts.voiceId, env);
      if (!engine) {
        reject(new Error(`${E_VOICE_ENGINE_MISSING}: no local voice engine found. Instala Kokoro (ONNX) o Piper y define VM_KOKORO_BIN / VM_PIPER_BIN.`));
        return;
      }
      command = engine.executable;
      args = buildEngineArgs(engine, { ...opts, outputPath, language, speed });
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

    const onAbort = () => {
      cancelled = true;
      try { child.kill(); } catch (err) { void err; }
    };

    const cleanup = () => {
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

    if (testMode) {
      child.stdin.write(JSON.stringify({ outputPath, duration, text, language, speed, pause }));
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
  synthesizeVoice
};
