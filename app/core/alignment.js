const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { resolveWhisperRuntime } = require('./runtime-paths.js');

const E_ALIGN_ENGINE_MISSING = 'E_ALIGN_ENGINE_MISSING';
const E_ALIGN_FAILED = 'E_ALIGN_FAILED';
const E_ALIGN_PATH_INVALID = 'E_ALIGN_PATH_INVALID';
const E_ALIGN_CANCELLED = 'E_ALIGN_CANCELLED';

const SUPPORTED_LANGUAGES = ['es', 'en'];

function normalizeLanguage(language) {
  const value = String(language == null ? '' : language).toLowerCase();
  return SUPPORTED_LANGUAGES.includes(value) ? value : 'es';
}

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test' || env.ELECTRON_TEST === '1' || env.VM_TEST_ALIGN === '1';
}

function tokenize(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

function simulateWordTimings(text, duration, options = {}) {
  const words = tokenize(text);
  if (words.length === 0) return [];
  const wordsPerSecond = typeof options.wordsPerSecond === 'number' && options.wordsPerSecond > 0
    ? options.wordsPerSecond
    : null;
  const total = typeof duration === 'number' && duration > 0
    ? duration
    : (wordsPerSecond ? words.length / wordsPerSecond : words.length * 0.35);
  const span = total / words.length;
  return words.map((word, index) => ({
    word,
    start: Number((index * span).toFixed(3)),
    end: Number(((index + 1) * span).toFixed(3))
  }));
}

function resolveEngine(env = process.env, options = {}) {
  const bundled = resolveWhisperRuntime(options);
  if (bundled.executable && bundled.modelPath) {
    return { executable: bundled.executable, modelPath: bundled.modelPath, source: 'bundled' };
  }

  const executable = env.VM_WHISPER_BIN;
  const modelPath = env.VM_WHISPER_MODEL;
  if (!executable || !path.isAbsolute(executable) || !fs.existsSync(executable)) return null;
  if (!modelPath || !path.isAbsolute(modelPath) || !fs.existsSync(modelPath)) return null;
  return { executable, modelPath, source: 'env' };
}

function describeAlignmentMissing(options = {}) {
  const bundled = resolveWhisperRuntime(options);
  const details = [];
  if (!bundled.executable) {
    details.push(`falta whisper-cli (se busca en ${bundled.searched.join(' o ')})`);
  }
  if (!bundled.modelPath) {
    details.push('falta el modelo ggml-base.bin (se busca en <whisper>/models o <whisper>)');
  }
  if (details.length === 0) details.push('el runtime de whisper.cpp empaquetado está incompleto');
  return `${E_ALIGN_ENGINE_MISSING}: ${details.join('; ')}`;
}

function parseWhisperJson(data) {
  const words = [];
  const segments = data && Array.isArray(data.transcription) ? data.transcription : [];
  for (const segment of segments) {
    const tokens = Array.isArray(segment.tokens) ? segment.tokens : [];
    for (const token of tokens) {
      const text = String(token.text == null ? '' : token.text).trim();
      if (!text) continue;
      const offsets = token.offsets || {};
      if (typeof offsets.from !== 'number' || typeof offsets.to !== 'number') continue;
      words.push({
        word: text,
        start: Number((offsets.from / 1000).toFixed(3)),
        end: Number((offsets.to / 1000).toFixed(3))
      });
    }
  }
  return words;
}

function runWhisper({ executable, modelPath, audioPath, language }, options = {}) {
  return new Promise((resolve, reject) => {
    const outputBase = path.join(os.tmpdir(), `vm-align-${process.pid}-${Date.now()}`);
    const args = [
      '-m', modelPath,
      '-f', audioPath,
      '-oj',
      '-of', outputBase,
      '-l', normalizeLanguage(language)
    ];
    const child = spawn(executable, args, { windowsHide: true });
    let stderr = '';
    let cancelled = false;

    const onAbort = () => {
      cancelled = true;
      child.kill();
    };
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort);
    }

    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => reject(new Error(`${E_ALIGN_FAILED}: ${err.message}`)));
    child.on('close', (code) => {
      if (cancelled) {
        reject(new Error(`${E_ALIGN_CANCELLED}: alineación cancelada`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${E_ALIGN_FAILED}: whisper.cpp terminó con código ${code}. ${stderr.trim()}`));
        return;
      }
      const jsonPath = `${outputBase}.json`;
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        resolve(parseWhisperJson(data));
      } catch (err) {
        reject(new Error(`${E_ALIGN_FAILED}: ${err.message}`));
      } finally {
        try { fs.unlinkSync(jsonPath); } catch (_e) { /* ignore */ }
      }
    });
  });
}

async function alignAudio({ audioPath, text, duration, language, env = process.env, options = {} } = {}) {
  const lang = normalizeLanguage(language);
  if (!isTestMode(env) && (!audioPath || !path.isAbsolute(audioPath) || !fs.existsSync(audioPath))) {
    throw new Error(`${E_ALIGN_PATH_INVALID}: audio no encontrado o ruta no absoluta`);
  }

  if (isTestMode(env) || options.simulate) {
    return simulateWordTimings(text, duration, options);
  }

  const engine = resolveEngine(env, options);
  if (!engine) {
    throw new Error(describeAlignmentMissing(options));
  }
  return runWhisper({ ...engine, audioPath, language: lang }, options);
}

function clampScenes(scenes, audioDuration) {
  const total = typeof audioDuration === 'number' && audioDuration > 0 ? audioDuration : null;
  let previousEnd = 0;
  return scenes.map((scene, index) => {
    const start = index === 0 ? 0 : Math.max(previousEnd, scene.start);
    let end = Math.max(scene.end, start + 0.1);
    if (total != null && index === scenes.length - 1) {
      end = Math.max(start + 0.1, Math.min(end, total));
    }
    previousEnd = end;
    return {
      ...scene,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number(Math.max(0.1, end - start).toFixed(3))
    };
  });
}

function mapWordsToScenes(scenes, words, audioDuration) {
  const list = Array.isArray(scenes) ? scenes : [];
  const timings = Array.isArray(words) ? words : [];
  const fallbackTotal = timings.length ? timings[timings.length - 1].end : 0;
  const total = typeof audioDuration === 'number' && audioDuration > 0 ? audioDuration : fallbackTotal;

  let cursor = 0;
  let runningTime = 0;
  const mapped = list.map((scene, index) => {
    const text = scene.text == null ? '' : scene.text;
    const tokens = tokenize(text);
    const count = tokens.length;
    const slice = count > 0 ? timings.slice(cursor, cursor + count) : [];
    cursor += count;

    let start;
    let end;
    if (slice.length > 0) {
      start = slice[0].start;
      end = slice[slice.length - 1].end;
    } else {
      const remaining = Math.max(0, total - runningTime);
      const remainingScenes = list.length - index;
      start = runningTime;
      end = runningTime + (remainingScenes > 0 ? remaining / remainingScenes : remaining);
    }
    runningTime = end;

    return {
      number: scene.number != null ? scene.number : index + 1,
      text,
      start,
      end,
      duration: Math.max(0.1, end - start),
      words: slice
    };
  });

  return clampScenes(mapped, audioDuration);
}

async function alignScenes({ audioPath, scenes, language, duration, env = process.env, options = {} } = {}) {
  const list = Array.isArray(scenes) ? scenes : [];
  if (list.length === 0) {
    throw new Error(`${E_ALIGN_FAILED}: se necesita al menos una escena`);
  }
  const text = list.map(scene => (scene && scene.text) || '').join(' ');
  const words = await alignAudio({ audioPath, text, duration, language, env, options });
  const mapped = mapWordsToScenes(list, words, duration);
  return { words, scenes: mapped };
}

module.exports = {
  E_ALIGN_ENGINE_MISSING,
  E_ALIGN_FAILED,
  E_ALIGN_PATH_INVALID,
  E_ALIGN_CANCELLED,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  isTestMode,
  tokenize,
  simulateWordTimings,
  resolveEngine,
  describeAlignmentMissing,
  parseWhisperJson,
  runWhisper,
  alignAudio,
  clampScenes,
  mapWordsToScenes,
  alignScenes
};
