const SCENE_MARKER = /^\s*(?:\[|\()?\s*(?:escena|scene|parte|part)\s*[:#]?\s*\d+\s*(?:\]|\))?/i;

const SQUARE_BRACKETS = /\[[^\]]*\]/g;
const PARENS_DIRECTIONS = /\((?:[^)]{0,80})\)/g;

const TIME_RANGE = /\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/gi;
const TIME_RANGE_WORDS = /(?:de|from)\s+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s+(?:a|to)\s+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/gi;
const TIMESTAMP_ONLY = /^\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)?\s*$/;

const TECHNICAL_LABELS = new RegExp(
  '(?:^\\s*)?(?:' +
  [
    'voz en off', 'voz de off', 'voice ?over', 'narrador', 'narradora', 'narrator',
    'locutor', 'locutora', 'plano', 'toma', 'encuadre', 'shot', 'escena', 'scene',
    'b-?roll', 'broll', 'texto en pantalla', 'on screen text', 'subt[ií]tulo', 'subtitle',
    'música', 'musica', 'music', 'sfx', 'efecto de sonido', 'sound effect',
    'transición', 'transition', 'corte a', 'cut to', 'fundido', 'fade'
  ].join('|') +
  ')\\s*[:#]\\s*',
  'gi'
);

function normalizeLanguage(language) {
  const value = String(language == null ? '' : language).trim().toLowerCase();
  if (value === 'en' || value === 'eng' || value === 'english') return 'en';
  return 'es';
}

function cleanLine(line) {
  let text = String(line == null ? '' : line);
  text = text.replace(SCENE_MARKER, ' ');
  text = text.replace(TIME_RANGE, ' ');
  text = text.replace(TIME_RANGE_WORDS, ' ');
  text = text.replace(TECHNICAL_LABELS, ' ');
  text = text.replace(SQUARE_BRACKETS, ' ');
  text = text.replace(PARENS_DIRECTIONS, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function cleanScriptForVoice(script, _language = 'es') {
  const lines = String(script == null ? '' : script).split(/\r?\n/);
  const cleaned = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (TIMESTAMP_ONLY.test(trimmed)) continue;

    let text = cleanLine(trimmed);
    text = text.replace(/^[-–—•·*]\s*/, '').trim();
    if (!text) continue;
    if (TIMESTAMP_ONLY.test(text)) continue;

    cleaned.push(text);
  }

  while (cleaned.length > 0 && TIMESTAMP_ONLY.test(cleaned[0])) cleaned.shift();
  while (cleaned.length > 0 && TIMESTAMP_ONLY.test(cleaned[cleaned.length - 1])) cleaned.pop();

  return cleaned.join('\n');
}

module.exports = {
  cleanLine,
  cleanScriptForVoice,
  normalizeLanguage,
  SCENE_MARKER,
  TECHNICAL_LABELS,
  TIMESTAMP_ONLY
};
