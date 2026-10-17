const { test, expect } = require('@playwright/test');
const {
  MAX_LINE_CHARS,
  DEFAULT_SUBTITLE_STYLE,
  hexToAssColor,
  assTime,
  wrapLines,
  splitIntoPhrases,
  distributeTimings,
  isVerticalFormat,
  buildSubtitleEvents,
  buildAss
} = require('../../app/core/subtitles.js');
const {
  buildFullFilterGraph,
  buildSubtitlesFilter,
  escapeSubtitlePath
} = require('../../app/core/ffmpeg-helpers.js');
const { resolveOutputConfig } = require('../../app/core/output-formats.js');

function getStyleLine(ass) {
  return ass.split('\n').find(line => line.startsWith('Style: Default'));
}

function styleFields(ass) {
  const line = getStyleLine(ass);
  return line.split(',').map(part => part.trim());
}

const scenes = [
  { text: 'La deuda sube 30% y el interés $1.000 afecta tu sueldo', start: 0, duration: 6 }
];

test.describe('subtitles core', () => {
  test('default style keeps Outline and Shadow at 0', () => {
    const fields = styleFields(buildAss(scenes, {}, resolveOutputConfig('16:9')));
    expect(fields[15]).toBe('1');
    expect(fields[16]).toBe('0');
    expect(fields[17]).toBe('0');
  });

  test('shadow enabled sets Shadow > 0 and adds a blurred lower layer with offset', () => {
    const ass = buildAss(scenes, { shadow: { enabled: true, blur: 5, distance: 4, angle: 0 } }, resolveOutputConfig('16:9'));
    const fields = styleFields(ass);
    expect(Number(fields[17])).toBeGreaterThan(0);
    expect(ass).toContain('\\blur5');
    expect(ass).toContain('\\pos(');
    const layers = ass.split('\n').filter(l => l.startsWith('Dialogue:')).map(l => l.split(',')[0].replace('Dialogue: ', ''));
    expect(layers).toContain('0');
    expect(layers).toContain('1');
  });

  test('phrases cover the whole text with increasing times inside the scene', () => {
    const text = 'La deuda sube 30% y el interés $1.000 afecta mucho tu sueldo mensual y tu ahorro familiar para el futuro cercano';
    const phrases = splitIntoPhrases(text);
    const timed = distributeTimings(phrases, 10, 8);
    const joined = timed.map(t => t.text.replace(/\n/g, ' ')).join(' ');
    expect(joined).toBe(text.replace(/\s+/g, ' ').trim());
    for (let i = 0; i < timed.length; i++) {
      expect(timed[i].end).toBeGreaterThan(timed[i].start);
      expect(timed[i].start).toBeGreaterThanOrEqual(10);
      expect(timed[i].end).toBeLessThanOrEqual(18 + 1e-9);
      if (i > 0) expect(timed[i].start).toBeGreaterThanOrEqual(timed[i - 1].end - 1e-9);
    }
    expect(timed[timed.length - 1].end).toBeCloseTo(18, 5);
  });

  test('each line stays within the maximum characters and at most two lines', () => {
    const text = 'una frase extremadamente larga que deberia partirse en varias lineas cortas de subtitulo';
    const phrases = splitIntoPhrases(text);
    for (const phrase of phrases) {
      const lines = phrase.split('\n');
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
    }
  });

  test('keyword override injects the chosen color and restores the base color', () => {
    const ass = buildAss(
      scenes,
      {
        textColor: '#ffffff',
        highlight: { enabled: true, colors: { deuda: '#ff0000' } }
      },
      resolveOutputConfig('16:9')
    );
    expect(ass).toContain('{\\1c&H000000FF&}deuda');
    expect(ass).toContain('{\\1c&H00FFFFFF&}');
  });

  test('font size differs between horizontal and vertical formats', () => {
    const horizontal = buildAss(scenes, { fontSizeH: 40, fontSizeV: 70 }, resolveOutputConfig('16:9'));
    const vertical = buildAss(scenes, { fontSizeH: 40, fontSizeV: 70 }, resolveOutputConfig('9:16'));
    expect(styleFields(horizontal)[2]).toBe('40');
    expect(styleFields(vertical)[2]).toBe('70');
    expect(isVerticalFormat(resolveOutputConfig('9:16'))).toBe(true);
    expect(isVerticalFormat(resolveOutputConfig('16:9'))).toBe(false);
  });

  test('background produces an opaque box style', () => {
    const ass = buildAss(scenes, { background: { enabled: true, color: '#112233', opacity: 0.4 } }, resolveOutputConfig('16:9'));
    const fields = styleFields(ass);
    expect(fields[15]).toBe('3');
    expect(ass).toContain('&H99');
  });

  test('animation tags are emitted for fade and pop', () => {
    expect(buildAss(scenes, { animation: 'fade' }, resolveOutputConfig('16:9'))).toContain('\\fad(250,250)');
    expect(buildAss(scenes, { animation: 'pop' }, resolveOutputConfig('16:9'))).toContain('\\t(0,250,');
  });

  test('ass helpers format colors and time', () => {
    expect(hexToAssColor('#ffffff', 1)).toBe('&H00FFFFFF&');
    expect(hexToAssColor('#ff0000', 1)).toBe('&H000000FF&');
    expect(assTime(0)).toBe('0:00:00.00');
    expect(assTime(62.5)).toBe('0:01:02.50');
    expect(wrapLines('a b c d', 3)).toEqual(['a b', 'c d']);
    expect(DEFAULT_SUBTITLE_STYLE.outlineWidth).toBe(0);
  });

  test('subtitle file and fonts paths escape Windows separators and colons', () => {
    expect(escapeSubtitlePath('C:\\tmp\\subs.ass')).toBe('C\\:/tmp/subs.ass');
    const filter = buildSubtitlesFilter({
      subtitlesPath: 'C:\\tmp\\a b.ass',
      fontsDir: 'C:\\app\\assets\\fonts',
      inputLabel: 'vstage0',
      outputLabel: 'vout'
    });
    expect(filter).toBe('[vstage0]subtitles=filename=\'C\\:/tmp/a b.ass\':fontsdir=\'C\\:/app/assets/fonts\'[vout]');
  });

  test('without subtitles the filter graph is unchanged', () => {
    const graphScenes = [{ number: 1, duration: 4, text: 'hola', focus: { x: 0.5, y: 0.5, scale: 1 } }];
    const withoutSubs = buildFullFilterGraph(graphScenes, {
      outputConfig: resolveOutputConfig('16:9'),
      zoomEnabled: false,
      totalDuration: 4
    });
    const withUndefined = buildFullFilterGraph(graphScenes, {
      outputConfig: resolveOutputConfig('16:9'),
      zoomEnabled: false,
      totalDuration: 4,
      subtitlesPath: undefined,
      fontsDir: undefined
    });
    expect(withoutSubs).toBe(withUndefined);
    expect(withoutSubs).not.toContain('subtitles=');
  });

  test('subtitles stage is appended after extras', () => {
    const graphScenes = [{ number: 1, duration: 4, text: 'hola', focus: { x: 0.5, y: 0.5, scale: 1 } }];
    const graph = buildFullFilterGraph(graphScenes, {
      outputConfig: resolveOutputConfig('16:9'),
      zoomEnabled: false,
      totalDuration: 4,
      extras: { badge: { enabled: true, text: 'OFERTA' }, lowerThird: {}, progressBar: { enabled: false } },
      fontPath: 'C:\\f.ttf',
      subtitlesPath: 'C:\\t\\s.ass',
      fontsDir: 'C:\\t'
    });
    const extrasIndex = graph.indexOf('drawtext=');
    const subsIndex = graph.indexOf('subtitles=');
    expect(extrasIndex).toBeGreaterThan(-1);
    expect(subsIndex).toBeGreaterThan(extrasIndex);
    expect(graph).toMatch(/\[vstage0\]/);
  });

  test('events expose monotonic timings per scene', () => {
    const events = buildSubtitleEvents(
      [{ text: 'uno dos tres cuatro cinco seis siete ocho nueve diez', start: 2, duration: 5 }],
      {}
    );
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.end).toBeGreaterThan(event.start);
      expect(event.start).toBeGreaterThanOrEqual(2);
    }
  });

  test('uses the final timeline starts (scene offsets after audio adjust and transitions)', () => {
    const timelineScenes = [
      { text: 'uno dos', start: 0, duration: 3 },
      { text: 'tres cuatro', start: 3, duration: 3.5 },
      { text: 'cinco seis', start: 6.5, duration: 2.5 }
    ];
    const events = buildSubtitleEvents(timelineScenes, {});
    expect(events).toHaveLength(3);
    expect(events[0].start).toBeCloseTo(0, 5);
    expect(events[1].start).toBeCloseTo(3, 5);
    expect(events[2].start).toBeCloseTo(6.5, 5);
    expect(events[2].end).toBeCloseTo(9, 5);
  });

  test('positive delay shifts subtitles later but never past their scene end', () => {
    const events = buildSubtitleEvents([{ text: 'hola mundo', start: 2, duration: 4 }], {}, { timeOffset: 1.5 });
    expect(events[0].start).toBeCloseTo(3.5, 5);
    expect(events[0].end).toBeCloseTo(6, 5);
    expect(events[0].end).toBeLessThanOrEqual(6);
  });

  test('negative delay clamps subtitles so they never start before their scene', () => {
    const events = buildSubtitleEvents([{ text: 'hola mundo', start: 2, duration: 4 }], {}, { timeOffset: -1 });
    expect(events[0].start).toBeCloseTo(2, 5);
    expect(events[0].end).toBeCloseTo(5, 5);
    expect(events[0].start).toBeGreaterThanOrEqual(2);
  });

  test('first subtitle never starts before its scene nor ends after it', () => {
    const events = buildSubtitleEvents(
      [{ text: 'texto de la primera escena con varias palabras para partir en frases', start: 1.5, duration: 4 }],
      {},
      { timeOffset: 3 }
    );
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.start).toBeGreaterThanOrEqual(1.5);
      expect(event.end).toBeLessThanOrEqual(5.5);
      expect(event.end).toBeGreaterThan(event.start);
    }
  });

  test('ass dialogue starts reflect the scene offsets', () => {
    const ass = buildAss(
      [{ text: 'uno dos', start: 0, duration: 3 }, { text: 'tres cuatro', start: 3, duration: 3 }],
      {},
      resolveOutputConfig('16:9')
    );
    const dialogues = ass.split('\n').filter(line => line.startsWith('Dialogue:'));
    expect(dialogues[0]).toContain(',0:00:00.00,');
    expect(dialogues[1]).toContain(',0:00:03.00,');
  });
});
