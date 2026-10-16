const { test, expect } = require('@playwright/test');
const {
  FPS,
  buildVideoFilterGraph,
  buildAudioFilterGraph,
  buildFullFilterGraph,
  validateOffsets,
  calculateTotalDuration,
  normalizeScenesToDuration,
  sceneInputDuration,
  transitionDurationFor,
  fixAsarPath
} = require('../../app/core/ffmpeg-helpers.js');
const { buildFfmpegArgs } = require('../../app/core/ffmpeg-renderer.js');
const { resolveOutputConfig } = require('../../app/core/output-formats.js');

const outputConfig = resolveOutputConfig('16:9');

const scenes = [
  { number: 1, duration: 5 },
  { number: 2, duration: 4 },
  { number: 3, duration: 6 }
];

const images = [
  { name: 'escena1.png', path: 'C:\\media\\escena1.png' },
  { name: 'escena2.png', path: 'C:\\media\\escena2.png' },
  { name: 'escena3.png', path: 'C:\\media\\escena3.png' }
];

const narration = { name: 'narration.wav', path: 'C:\\media\\narration.wav' };
const music = { name: 'music.wav', path: 'C:\\media\\music.wav' };

function extractOffsets(graph) {
  return [...graph.matchAll(/offset=([\d.]+)/g)].map(m => parseFloat(m[1]));
}

function extractBrackets(graph) {
  return [...graph.matchAll(/\[([^\]]*)\]/g)].map(m => m[1]);
}

function extractXfades(graph) {
  return [...graph.matchAll(/xfade=transition=([a-z]+):duration=([\d.]+):offset=([\d.]+)/g)]
    .map(m => ({ transition: m[1], duration: parseFloat(m[2]), offset: parseFloat(m[3]) }));
}

test.describe('filtergraph - no paths between brackets', () => {
  test('video graph never contains input file paths', () => {
    const graph = buildVideoFilterGraph(scenes, { outputConfig, transitionType: 'fade', transitionDuration: 1 });
    for (const img of images) {
      expect(graph).not.toContain(img.path);
      expect(graph).not.toContain(img.name);
    }
    expect(graph).not.toMatch(/[A-Za-z]:\\/);
    expect(graph).not.toContain('\\');
  });

  test('full graph with music never contains paths', () => {
    const graph = buildFullFilterGraph(scenes, { outputConfig, hasMusic: true, totalDuration: 15 });
    expect(graph).not.toMatch(/[A-Za-z]:\\/);
    expect(graph).not.toContain('\\');
    [narration, music].forEach(f => expect(graph).not.toContain(f.path));
  });

  test('all bracket tokens are safe labels or stream indices', () => {
    const graph = buildFullFilterGraph(scenes, { outputConfig, hasMusic: true, totalDuration: 15 });
    const tokens = extractBrackets(graph);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9]+(?::[av])?$/);
    }
  });
});

test.describe('filtergraph - indices match -i order', () => {
  test('without music: narration is input N', () => {
    const { args } = buildFfmpegArgs({ scenes, images, narration, outputConfig, outputPath: 'C:\\out.mp4' });
    const inputIndices = args.reduce((acc, arg, i) => {
      if (arg === '-i') acc.push(args[i + 1]);
      return acc;
    }, []);
    expect(inputIndices).toEqual([...images.map(i => i.path), narration.path]);

    const graphIndex = args[args.indexOf('-filter_complex') + 1];
    expect(graphIndex).toContain('[0:v]');
    expect(graphIndex).toContain('[1:v]');
    expect(graphIndex).toContain('[2:v]');
    expect(graphIndex).toContain('[3:a]');
    expect(graphIndex).not.toContain('[4:a]');
  });

  test('with music: music is input N+1', () => {
    const { args } = buildFfmpegArgs({ scenes, images, narration, music, outputConfig, outputPath: 'C:\\out.mp4' });
    const inputIndices = args.reduce((acc, arg, i) => {
      if (arg === '-i') acc.push(args[i + 1]);
      return acc;
    }, []);
    expect(inputIndices).toEqual([...images.map(i => i.path), narration.path, music.path]);

    const graphIndex = args[args.indexOf('-filter_complex') + 1];
    expect(graphIndex).toContain('[3:a]');
    expect(graphIndex).toContain('[4:a]');
  });

  test('audio graph uses narration index N and music index N+1', () => {
    const withMusic = buildAudioFilterGraph({ inputCount: 3, hasMusic: true, totalDuration: 15 });
    expect(withMusic).toContain('[3:a]');
    expect(withMusic).toContain('[4:a]');

    const withoutMusic = buildAudioFilterGraph({ inputCount: 3, hasMusic: false, totalDuration: 15 });
    expect(withoutMusic).toContain('[3:a]');
    expect(withoutMusic).not.toContain('[4:a]');
  });
});

test.describe('filtergraph - offsets positive and increasing', () => {
  test('fade offsets are positive and strictly increasing', () => {
    const offsets = extractOffsets(buildVideoFilterGraph(scenes, { outputConfig, transitionType: 'fade', transitionDuration: 1 }));
    expect(offsets.length).toBe(scenes.length - 1);
    for (const offset of offsets) expect(offset).toBeGreaterThan(0);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });

  test('validateOffsets agrees offsets are valid', () => {
    const { valid, offsets } = validateOffsets(scenes, 'fade', 1);
    expect(valid).toBe(true);
    expect(offsets.length).toBe(scenes.length - 1);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });

  test('offset equals cumulative nominal durations', () => {
    const offsets = extractOffsets(buildVideoFilterGraph(scenes, { outputConfig, transitionType: 'fade', transitionDuration: 1 }));
    expect(offsets[0]).toBeCloseTo(scenes[0].duration, 3);
    expect(offsets[1]).toBeCloseTo(scenes[0].duration + scenes[1].duration, 3);
  });
});

test.describe('filtergraph - cut maps to fade', () => {
  test('cut transition never emits transition=cut and uses 1/FPS fade', () => {
    const graph = buildVideoFilterGraph(scenes, { outputConfig, transitionType: 'cut', transitionDuration: 1 });
    expect(graph).not.toMatch(/transition=cut/);
    const xfades = extractXfades(graph);
    expect(xfades.length).toBe(scenes.length - 1);
    for (const xfade of xfades) {
      expect(xfade.transition).toBe('fade');
      expect(xfade.duration).toBeCloseTo(1 / FPS, 4);
    }
  });

  test('transitionDurationFor returns 1/FPS for cut and min() for fade', () => {
    expect(transitionDurationFor(scenes, 1, 'cut', 1)).toBeCloseTo(1 / FPS, 4);
    expect(transitionDurationFor(scenes, 1, 'fade', 1)).toBeCloseTo(1, 4);
    expect(transitionDurationFor(scenes, 1, 'fade', 100)).toBeCloseTo(Math.min(scenes[0].duration / 2, scenes[1].duration / 2), 4);
  });
});

test.describe('total duration equals audio duration', () => {
  test('normalizeScenesToDuration sums to target audio duration', () => {
    const normalized = normalizeScenesToDuration(scenes, 12.34);
    const total = normalized.reduce((sum, s) => sum + s.duration, 0);
    expect(Math.abs(total - 12.34)).toBeLessThanOrEqual(0.1);
  });

  test('calculateTotalDuration of normalized scenes equals audio duration', () => {
    const normalized = normalizeScenesToDuration(scenes, 20);
    expect(calculateTotalDuration(normalized)).toBeCloseTo(20, 1);
  });

  test('extended inputs minus overlaps reproduce the target duration', () => {
    const transitionDuration = 1;
    const transitionType = 'fade';
    const inputTotal = scenes.reduce(
      (sum, _s, i) => sum + sceneInputDuration(scenes, i, transitionType, transitionDuration),
      0
    );
    const overlapTotal = scenes
      .slice(1)
      .reduce((sum, _s, idx) => sum + transitionDurationFor(scenes, idx + 1, transitionType, transitionDuration), 0);
    const videoTotal = inputTotal - overlapTotal;
    expect(videoTotal).toBeCloseTo(calculateTotalDuration(scenes), 3);
  });

  test('rendered duration matches audio within ±0.1s', () => {
    const audioDuration = 6;
    const normalized = normalizeScenesToDuration(scenes, audioDuration);
    expect(Math.abs(calculateTotalDuration(normalized) - audioDuration)).toBeLessThanOrEqual(0.1);
  });
});

test.describe('ffmpeg args encoding', () => {
  test('uses mp4 h264 aac faststart and maps vout/aout', () => {
    const { args } = buildFfmpegArgs({ scenes, images, narration, outputConfig, outputPath: 'C:\\out.mp4' });
    expect(args).toContain('libx264');
    expect(args).toContain('aac');
    expect(args).toContain('yuv420p');
    expect(args).toContain('+faststart');
    expect(args).toContain('[vout]');
    expect(args).toContain('[aout]');
    expect(args).toContain('-r');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
  });

  test('image inputs use framerate 30 and loop', () => {
    const { args } = buildFfmpegArgs({ scenes, images, narration, outputConfig, outputPath: 'C:\\out.mp4' });
    const framerateCount = args.filter(a => a === '-framerate').length;
    const loopCount = args.filter(a => a === '-loop').length;
    expect(framerateCount).toBe(images.length);
    expect(loopCount).toBe(images.length);
    const framerateValues = args.filter((a, i) => args[i - 1] === '-framerate');
    for (const v of framerateValues) expect(v).toBe('30');
  });
});

test.describe('fixAsarPath', () => {
  test('rewrites app.asar to app.asar.unpacked exactly once and is idempotent', () => {
    const input = 'C:\\Program Files\\app\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe';
    const once = fixAsarPath(input);
    expect(once).toContain('app.asar.unpacked');
    expect(once).not.toMatch(/app\.asar(?!\.unpacked)/);
    expect(fixAsarPath(once)).toBe(once);
  });

  test('leaves paths without app.asar unchanged', () => {
    const input = 'C:\\dev\\node_modules\\ffmpeg-static\\ffmpeg.exe';
    expect(fixAsarPath(input)).toBe(input);
  });
});
