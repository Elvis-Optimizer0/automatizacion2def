const { test, expect } = require('@playwright/test');
const { detectEncoders, buildFfmpegArgs, getFfmpegPath } = require('../../app/core/ffmpeg-renderer.js');
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
  test('detects available h264 encoders from ffmpeg', async () => {
    const encoders = await detectEncoders(true);
    expect(typeof encoders.h264_amf).toBe('boolean');
    expect(encoders.libx264).toBe(true);
    expect(getFfmpegPath()).toContain('ffmpeg');
  });

  test('uses libx264 by default', () => {
    const { args } = buildFfmpegArgs(baseOptions());
    const index = args.indexOf('-c:v');
    expect(args[index + 1]).toBe('libx264');
    expect(args).toContain('-crf');
  });

  test('uses h264_amf when requested', () => {
    const { args } = buildFfmpegArgs(baseOptions({ videoEncoder: 'h264_amf' }));
    const index = args.indexOf('-c:v');
    expect(args[index + 1]).toBe('h264_amf');
    expect(args).toContain('-qp_i');
  });
});
