const E_SUBTITLES_FAILED = 'E_SUBTITLES_FAILED';

const MAX_LINE_CHARS = 42;
const MAX_LINES = 2;
const SUBTITLE_ANIMATIONS = ['none', 'fade', 'pop'];
const SUBTITLE_ALIGNMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const DEFAULT_SUBTITLE_STYLE = {
  fontFamily: 'Roboto',
  fontFile: '',
  fontSizeH: 48,
  fontSizeV: 64,
  bold: false,
  italic: false,
  letterSpacing: 0,
  textColor: '#ffffff',
  outlineWidth: 0,
  outlineColor: '#000000',
  alignment: 2,
  marginH: 40,
  marginV: 40,
  delay: 0,
  autoVoiceStart: true,
  background: { enabled: false, color: '#000000', opacity: 0.5 },
  shadow: { enabled: false, color: '#000000', opacity: 0.7, distance: 3, angle: 45, blur: 4 },
  animation: 'none'
};

function safeHex(color) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000';
}

function clampUnit(value, fallback = 1) {
  if (typeof value !== 'number' || isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function hexToAssColor(color, opacity = 1) {
  const hex = safeHex(color);
  const alpha = Math.round((1 - clampUnit(opacity)) * 255).toString(16).padStart(2, '0');
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H${alpha}${b}${g}${r}&`.toUpperCase();
}

function assTime(seconds) {
  const total = Math.max(0, typeof seconds === 'number' && !isNaN(seconds) ? seconds : 0);
  const cs = Math.round(total * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function normalizeText(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function escapeAssText(text) {
  return String(text).replace(/[{}]/g, c => (c === '{' ? '(' : ')')).replace(/\\[nN]/g, ' ');
}

function wrapLines(text, maxChars = MAX_LINE_CHARS) {
  const words = normalizeText(text).split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function splitIntoPhrases(text, maxChars = MAX_LINE_CHARS, maxLines = MAX_LINES) {
  const lines = wrapLines(text, maxChars);
  if (lines.length === 0) return [];
  const phrases = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    phrases.push(lines.slice(i, i + maxLines).join('\n'));
  }
  return phrases;
}

function distributeTimings(phrases, start, duration) {
  const base = typeof start === 'number' && !isNaN(start) ? start : 0;
  const total = typeof duration === 'number' && duration > 0 ? duration : 0;
  if (phrases.length === 0) return [];
  const counts = phrases.map(p => Math.max(1, p.replace(/\n/g, '').length));
  const sum = counts.reduce((a, b) => a + b, 0);
  let accumulated = base;
  return phrases.map((text, index) => {
    const isLast = index === phrases.length - 1;
    const span = isLast ? base + total - accumulated : (total * counts[index]) / sum;
    const event = { text, start: accumulated, end: accumulated + span };
    accumulated += span;
    return event;
  });
}

function isVerticalFormat(outputConfig) {
  return !!outputConfig && outputConfig.h > outputConfig.w;
}

function fontSizeFor(style, outputConfig) {
  const h = typeof style.fontSizeH === 'number' ? style.fontSizeH : DEFAULT_SUBTITLE_STYLE.fontSizeH;
  const v = typeof style.fontSizeV === 'number' ? style.fontSizeV : DEFAULT_SUBTITLE_STYLE.fontSizeV;
  return isVerticalFormat(outputConfig) ? v : h;
}

function anchorPoint(alignment, w, h, marginH, marginV) {
  const col = ((alignment - 1) % 3);
  const row = Math.floor((alignment - 1) / 3);
  const x = col === 0 ? marginH : (col === 1 ? Math.round(w / 2) : w - marginH);
  const y = row === 0 ? h - marginV : (row === 1 ? Math.round(h / 2) : marginV);
  return { x, y };
}

function animationTags(animation) {
  if (animation === 'fade') return '\\fad(250,250)';
  if (animation === 'pop') return '\\fscx60\\fscy60\\t(0,250,\\fscx100\\fscy100)';
  return '';
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyKeywordColors(line, style) {
  const highlight = (style && style.highlight) || {};
  if (!highlight.enabled || !highlight.colors || typeof highlight.colors !== 'object') return line;
  const mainColor = hexToAssColor(style.textColor, 1);
  let result = line;
  const entries = Object.keys(highlight.colors);
  for (const key of entries) {
    const term = String(key).trim();
    if (!term) continue;
    const assColor = hexToAssColor(highlight.colors[key], 1);
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(term)})(?![\\p{L}\\p{N}])`, 'giu');
    result = result.replace(pattern, (match, pre, word) => `${pre}{\\1c${assColor}}${word}{\\1c${mainColor}}`);
  }
  return result;
}

function buildSubtitleEvents(scenes, style, options = {}) {
  const resolvedStyle = { ...DEFAULT_SUBTITLE_STYLE, ...(style || {}) };
  const timeOffset = typeof options.timeOffset === 'number' && !isNaN(options.timeOffset)
    ? options.timeOffset
    : 0;
  const events = [];
  for (const scene of scenes || []) {
    if (!scene || !scene.text) continue;
    const sceneStart = typeof scene.start === 'number' && !isNaN(scene.start) ? scene.start : 0;
    const sceneDuration = typeof scene.duration === 'number' && !isNaN(scene.duration) ? scene.duration : 0;
    const sceneEnd = sceneStart + sceneDuration;
    const phrases = splitIntoPhrases(scene.text);
    const timed = distributeTimings(phrases, sceneStart, sceneDuration);
    for (const item of timed) {
      const start = Math.max(sceneStart, Math.min(item.start + timeOffset, sceneEnd));
      const end = Math.min(sceneEnd, Math.max(item.end + timeOffset, sceneStart));
      if (end <= start) continue;
      const plainLines = item.text.split('\n').map(line => escapeAssText(line));
      const colored = plainLines.map(line => applyKeywordColors(line, resolvedStyle)).join('\\N');
      if (resolvedStyle.shadow && resolvedStyle.shadow.enabled) {
        events.push({ layer: 0, shadow: true, start, end, text: plainLines.join('\\N') });
      }
      events.push({ layer: 1, shadow: false, start, end, text: colored });
    }
  }
  return events;
}

function buildAss(scenes, style, outputConfig, options = {}) {
  const resolvedStyle = { ...DEFAULT_SUBTITLE_STYLE, ...(style || {}) };
  const w = outputConfig && outputConfig.w ? outputConfig.w : 1920;
  const h = outputConfig && outputConfig.h ? outputConfig.h : 1080;
  const fontSize = fontSizeFor(resolvedStyle, outputConfig);
  const alignment = SUBTITLE_ALIGNMENTS.includes(resolvedStyle.alignment) ? resolvedStyle.alignment : 2;
  const marginH = Math.max(0, Math.round(resolvedStyle.marginH));
  const marginV = Math.max(0, Math.round(resolvedStyle.marginV));

  const background = resolvedStyle.background || {};
  const shadow = resolvedStyle.shadow || {};
  const borderStyle = background.enabled ? 3 : 1;
  const outline = background.enabled ? Math.max(1, Math.round(fontSize * 0.2)) : Math.max(0, Math.round(resolvedStyle.outlineWidth));
  const styleShadow = shadow.enabled ? Math.max(1, Math.round(shadow.distance)) : 0;

  const primary = hexToAssColor(resolvedStyle.textColor, 1);
  const outlineColor = hexToAssColor(resolvedStyle.outlineColor, 1);
  const backColor = background.enabled
    ? hexToAssColor(background.color, background.opacity)
    : hexToAssColor('#000000', 1);

  const styleLine = [
    'Style: Default',
    resolvedStyle.fontFamily || DEFAULT_SUBTITLE_STYLE.fontFamily,
    fontSize,
    primary,
    '&H000000FF&',
    outlineColor,
    backColor,
    resolvedStyle.bold ? 1 : 0,
    resolvedStyle.italic ? 1 : 0,
    0, 0,
    100, 100,
    Math.round(resolvedStyle.letterSpacing),
    0,
    borderStyle,
    outline,
    styleShadow,
    alignment,
    marginH, marginH, marginV,
    1
  ].join(',');

  const shadowAnchor = anchorPoint(alignment, w, h, marginH, marginV);
  const shadowTags = shadow.enabled
    ? `\\blur${Math.max(0, Math.round(shadow.blur))}\\1c${hexToAssColor(shadow.color, 1)}\\1a${hexToAssColor(shadow.color, shadow.opacity).slice(2, 4)}`
    : '';
  const rad = (Number(shadow.angle) || 0) * Math.PI / 180;
  const dx = Math.round((Number(shadow.distance) || 0) * Math.cos(rad));
  const dy = Math.round((Number(shadow.distance) || 0) * Math.sin(rad));
  const anim = animationTags(resolvedStyle.animation);

  const events = buildSubtitleEvents(scenes, resolvedStyle, options);
  const dialogue = events.map(event => {
    const prefix = event.shadow
      ? `{\\an${alignment}\\pos(${shadowAnchor.x + dx},${shadowAnchor.y + dy})${shadowTags}}`
      : `{\\an${alignment}${anim}}`;
    return `Dialogue: ${event.layer},${assTime(event.start)},${assTime(event.end)},Default,,0,0,0,,${prefix}${event.text}`;
  });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.601',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogue,
    ''
  ].join('\n');
}

module.exports = {
  E_SUBTITLES_FAILED,
  MAX_LINE_CHARS,
  MAX_LINES,
  SUBTITLE_ANIMATIONS,
  SUBTITLE_ALIGNMENTS,
  DEFAULT_SUBTITLE_STYLE,
  hexToAssColor,
  assTime,
  normalizeText,
  escapeAssText,
  wrapLines,
  splitIntoPhrases,
  distributeTimings,
  isVerticalFormat,
  fontSizeFor,
  anchorPoint,
  applyKeywordColors,
  buildSubtitleEvents,
  buildAss
};
