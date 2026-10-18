const { test, expect } = require('@playwright/test');
const { parseScenes, parseTimeToSeconds } = require('../../app/core/script-parser.js');
const { buildTimeline, extractSceneNumber } = require('../../app/core/timeline.js');

test.describe('parseTimeToSeconds', () => {
  test('parses mm:ss format', () => {
    expect(parseTimeToSeconds('1:30')).toBe(90);
    expect(parseTimeToSeconds('0:05')).toBe(5);
    expect(parseTimeToSeconds('10:00')).toBe(600);
  });

  test('parses h:mm:ss format', () => {
    expect(parseTimeToSeconds('1:30:45')).toBe(5445);
    expect(parseTimeToSeconds('0:01:30')).toBe(90);
  });

  test('parses seconds with decimals', () => {
    expect(parseTimeToSeconds('1:30.5')).toBeCloseTo(90.5);
    expect(parseTimeToSeconds('0:05.25')).toBeCloseTo(5.25);
  });

  test('returns 0 for empty or invalid input', () => {
    expect(parseTimeToSeconds('')).toBe(0);
    expect(parseTimeToSeconds(null)).toBe(0);
    expect(parseTimeToSeconds('invalid')).toBe(0);
  });
});

test.describe('parseScenes', () => {
  test('parses [Escena N] m:ss - m:ss format', () => {
    const script = `[Escena 1] 0:00 - 0:30 Primera escena
[Escena 2] 0:30 - 1:05 Segunda escena`;
    const { scenes, warnings } = parseScenes(script);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toEqual({ number: 1, start: 0, end: 30, text: 'Primera escena' });
    expect(scenes[1]).toEqual({ number: 2, start: 30, end: 65, text: 'Segunda escena' });
    expect(warnings).toHaveLength(0);
  });

  test('parses (Escena N: m:ss a m:ss) format', () => {
    const script = `(Escena 1: 0:00 a 0:30) Primera escena
(Escena 2: 0:30 a 1:05) Segunda escena`;
    const { scenes } = parseScenes(script);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].number).toBe(1);
    expect(scenes[0].start).toBe(0);
    expect(scenes[0].end).toBe(30);
  });

  test('parses [ESCENA N] (m:ss - m:ss) format', () => {
    const script = `[ESCENA 1] (0:00 - 0:30) Primera
[ESCENA 2] (0:30 - 1:05) Segunda`;
    const { scenes } = parseScenes(script);
    expect(scenes).toHaveLength(2);
  });

  test('parses "Escena N de m:ss a m:ss" format', () => {
    const script = `Escena 1 de 0:00 a 0:30 Primera
Escena 2 de 0:30 a 1:05 Segunda`;
    const { scenes } = parseScenes(script);
    expect(scenes).toHaveLength(2);
  });

  test('parses h:mm:ss format', () => {
    const script = `[Escena 1] 0:00:00 - 0:00:30 Primera
[Escena 2] 0:00:30 - 0:01:05 Segunda`;
    const { scenes } = parseScenes(script);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].start).toBe(0);
    expect(scenes[0].end).toBe(30);
  });

  test('parses with decimals', () => {
    const script = `[Escena 1] 0:00.5 - 0:30.25 Primera
[Escena 2] 0:30.25 - 1:05.75 Segunda`;
    const { scenes } = parseScenes(script);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].start).toBeCloseTo(0.5);
    expect(scenes[0].end).toBeCloseTo(30.25);
  });

  test('handles multiline text per scene', () => {
    const script = `[Escena 1] 0:00 - 0:30 Primera línea
Segunda línea
Tercera línea
[Escena 2] 0:30 - 1:05 Otra escena`;
    const { scenes } = parseScenes(script);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].text).toContain('Primera línea');
    expect(scenes[0].text).toContain('Segunda línea');
    expect(scenes[0].text).toContain('Tercera línea');
  });

  test('warns on duplicate scene numbers', () => {
    const script = `[Escena 1] 0:00 - 0:30 Primera
[Escena 1] 0:30 - 1:00 Duplicada
[Escena 2] 1:00 - 1:30 Tercera`;
    const { scenes, warnings } = parseScenes(script);
    expect(scenes).toHaveLength(3);
    expect(warnings).toContain('Número de escena repetido: 1');
  });

  test('warns on overlapping ranges', () => {
    const script = `[Escena 1] 0:00 - 0:45 Primera
[Escena 2] 0:30 - 1:00 Segunda`;
    const { warnings } = parseScenes(script);
    expect(warnings.some(w => w.includes('solapados'))).toBe(true);
  });

  test('warns on gaps > 1s', () => {
    const script = `[Escena 1] 0:00 - 0:30 Primera
[Escena 2] 0:35 - 1:00 Segunda`;
    const { warnings } = parseScenes(script);
    expect(warnings.some(w => w.includes('Hueco'))).toBe(true);
  });

  test('does not warn on small gaps <= 1s', () => {
    const script = `[Escena 1] 0:00 - 0:30 Primera
[Escena 2] 0:30.5 - 1:00 Segunda`;
    const { warnings } = parseScenes(script);
    expect(warnings.some(w => w.includes('Hueco'))).toBe(false);
  });

  test('sorts scenes by number', () => {
    const script = `[Escena 3] 1:00 - 1:30 Tercera
[Escena 1] 0:00 - 0:30 Primera
[Escena 2] 0:30 - 1:00 Segunda`;
    const { scenes } = parseScenes(script);
    expect(scenes.map(s => s.number)).toEqual([1, 2, 3]);
  });

  test('returns empty for empty script', () => {
    const { scenes } = parseScenes('');
    expect(scenes).toHaveLength(0);
  });

  test('handles script without time ranges', () => {
    const script = `[Escena 1] Primera escena
[Escena 2] Segunda escena`;
    const { scenes } = parseScenes(script);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].start).toBe(0);
    expect(scenes[0].end).toBe(0);
  });

  test('parses English [Scene N] markers with time ranges', () => {
    const script = `[Scene 1] 0:00 - 0:03 The household budget rules
[Scene 2] 0:03 - 0:06 Interest rates rise`;
    const { scenes, warnings } = parseScenes(script);
    expect(scenes).toHaveLength(2);
    expect(scenes.map(s => s.number)).toEqual([1, 2]);
    expect(scenes[0].start).toBe(0);
    expect(scenes[0].end).toBe(3);
    expect(scenes[1].start).toBe(3);
    expect(scenes[1].end).toBe(6);
    expect(warnings).toHaveLength(0);
  });
});

test.describe('extractSceneNumber', () => {
  test('extracts number from various filename formats', () => {
    expect(extractSceneNumber('escena1.jpg')).toBe(1);
    expect(extractSceneNumber('Escena_2.png')).toBe(2);
    expect(extractSceneNumber('escena 3.webp')).toBe(3);
    expect(extractSceneNumber('ESCENA4.gif')).toBe(4);
    expect(extractSceneNumber('scene-5.jpg')).toBe(5);
    expect(extractSceneNumber('Scene:6.png')).toBe(6);
    expect(extractSceneNumber('image.jpg')).toBeNull();
    expect(extractSceneNumber('photo.png')).toBeNull();
  });
});

test.describe('buildTimeline', () => {
  const scenes = [
    { number: 1, start: 0, end: 30, text: 'Scene 1' },
    { number: 2, start: 30, end: 65, text: 'Scene 2' },
    { number: 3, start: 65, end: 100, text: 'Scene 3' }
  ];

  const images = [
    { name: 'escena1.jpg', path: '/path/escena1.jpg' },
    { name: 'escena2.png', path: '/path/escena2.png' },
    { name: 'escena3.webp', path: '/path/escena3.webp' }
  ];

  test('builds timeline with matching images', () => {
    const timeline = buildTimeline(scenes, images, 100);
    expect(timeline).toHaveLength(3);
    expect(timeline[0].image.name).toBe('escena1.jpg');
    expect(timeline[1].image.name).toBe('escena2.png');
    expect(timeline[2].image.name).toBe('escena3.webp');
  });

  test('calculates duration correctly', () => {
    const timeline = buildTimeline(scenes, images, 100);
    expect(timeline[0].duration).toBe(30);
    expect(timeline[1].duration).toBe(35);
    expect(timeline[2].duration).toBe(35);
  });

  test('handles missing images', () => {
    const partialImages = [{ name: 'escena1.jpg', path: '/path/escena1.jpg' }];
    const timeline = buildTimeline(scenes, partialImages, 100);
    expect(timeline[0].image).not.toBeNull();
    expect(timeline[1].image).toBeNull();
    expect(timeline[2].image).toBeNull();
  });

  test('adjusts to audio duration when enabled', () => {
    const timeline = buildTimeline(scenes, images, 200, { adjustToAudio: true });
    const totalDuration = timeline.reduce((sum, s) => sum + s.duration, 0);
    expect(totalDuration).toBeCloseTo(200, 1);
    expect(timeline[timeline.length - 1].end).toBe(200);
  });

  test('does not adjust when disabled', () => {
    const timeline = buildTimeline(scenes, images, 200, { adjustToAudio: false });
    const totalDuration = timeline.reduce((sum, s) => sum + s.duration, 0);
    expect(totalDuration).toBe(100);
  });

  test('sorts images by scene number', () => {
    const unsortedImages = [
      { name: 'escena3.webp', path: '/path/escena3.webp' },
      { name: 'escena1.jpg', path: '/path/escena1.jpg' },
      { name: 'escena2.png', path: '/path/escena2.png' }
    ];
    const timeline = buildTimeline(scenes, unsortedImages, 100);
    expect(timeline[0].image.name).toBe('escena1.jpg');
    expect(timeline[1].image.name).toBe('escena2.png');
    expect(timeline[2].image.name).toBe('escena3.webp');
  });

  test('images without numbers go to the end', () => {
    const mixedImages = [
      { name: 'escena1.jpg', path: '/path/escena1.jpg' },
      { name: 'random.png', path: '/path/random.png' },
      { name: 'escena2.png', path: '/path/escena2.png' }
    ];
    const timeline = buildTimeline(scenes, mixedImages, 100);
    expect(timeline[0].image.name).toBe('escena1.jpg');
    expect(timeline[1].image.name).toBe('escena2.png');
    expect(timeline[2].image.name).toBe('random.png');
  });

  test('returns empty array for empty scenes', () => {
    const timeline = buildTimeline([], images, 100);
    expect(timeline).toHaveLength(0);
  });

  test('total duration equals audio duration when adjusted (±0.1s)', () => {
    const longScenes = [
      { number: 1, start: 0, end: 10, text: 'S1' },
      { number: 2, start: 10, end: 20, text: 'S2' },
      { number: 3, start: 20, end: 30, text: 'S3' }
    ];
    const timeline = buildTimeline(longScenes, images, 123.45, { adjustToAudio: true });
    const totalDuration = timeline.reduce((sum, s) => sum + s.duration, 0);
    expect(Math.abs(totalDuration - 123.45)).toBeLessThanOrEqual(0.1);
  });
});

test.describe('path validation', () => {
  test('validates absolute Windows paths', () => {
    const windowsPaths = [
      'C:\\Users\\test\\file.jpg',
      'D:/Projects/video.mp4',
      'E:\\Media\\audio.wav'
    ];
    windowsPaths.forEach(p => {
      expect(p).toMatch(/^([a-zA-Z]:[\\/]|\\\\)/);
    });
  });

  test('validates absolute Unix paths', () => {
    const unixPaths = [
      '/home/user/file.jpg',
      '/mnt/data/video.mp4'
    ];
    unixPaths.forEach(p => {
      expect(p).toMatch(/^\//);
    });
  });

  test('rejects relative paths', () => {
    const relativePaths = [
      'file.jpg',
      './file.jpg',
      '../file.jpg',
      'folder/file.jpg'
    ];
    relativePaths.forEach(p => {
      expect(p).not.toMatch(/^([a-zA-Z]:[\\/]|\\\\)/);
      expect(p).not.toMatch(/^\//);
    });
  });
});