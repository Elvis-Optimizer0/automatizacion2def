const { test, expect } = require('@playwright/test');
const { buildFfmpegArgs, getFfmpegPath } = require('../../app/core/ffmpeg-renderer.js');
const { resolveOutputConfig } = require('../../app/core/output-formats.js');

function baseOptions(extra = {}) {
  return {
    scenes: [{ number: 1, duration: 4, text: 'hola', focus: { x: 0.5, y: 0.5, scale: 1 } }],
    images: [{ name: 'a.png', path: 'C:\\tmp\\a.png', focus169: { x: 0.5, y: 0.5, scale: 1 } }],
    narration: { name: 'n.wav', path: 'C:\\tmp\\n.wav' },
    outputPath: 'C:\\tmp\\out.mp4',
    outputConfig: resolveOutputConfig('16:9'),
    config: {},
    renderOptions: {},
    ...extra
  };
}

test.describe('encoders', () => {
  test('uses libx264 by default with software-only settings', () => {
    const { args } = buildFfmpegArgs(baseOptions());
    const index = args.indexOf('-c:v');
    expect(args[index + 1]).toBe('libx264');
    expect(args).toContain('-crf');
    expect(args).toContain('-preset');
    expect(args).toContain('-profile:v');
    expect(args).toContain('high');
    expect(args).toContain('-level');
    expect(args).toContain('4.2');
    expect(args).toContain('-g');
    expect(args).toContain('60');
    expect(args).toContain('-keyint_min');
    expect(args).toContain('30');
    expect(args).toContain('-maxrate');
    expect(args).toContain('16M');
    expect(args).toContain('-bufsize');
    expect(args).toContain('32M');
    expect(args).not.toContain('h264_amf');
    expect(args).not.toContain('-hwaccel');
    expect(getFfmpegPath()).toContain('ffmpeg');
  });

  test('ignores a requested hardware encoder id and still uses libx264', () => {
    const { args } = buildFfmpegArgs(baseOptions({ videoEncoder: 'h264_amf' }));
    const index = args.indexOf('-c:v');
    expect(args[index + 1]).toBe('libx264');
    expect(args).not.toContain('h264_amf');
    expect(args).not.toContain('-qp_i');
  });
});
