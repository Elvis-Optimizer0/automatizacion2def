const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const {
  parseLeadingSilence,
  detectLeadingSilence
} = require('../../app/core/ffmpeg-renderer.js');

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, args, { windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr ? result.stderr.toString() : ''}`);
  }
}

test.describe('leading silence detection', () => {
  test('parses a leading silence segment', () => {
    const output = [
      '[silencedetect @ 0x1] silence_start: 0',
      '[silencedetect @ 0x1] silence_end: 1.5 | silence_duration: 1.5'
    ].join('\n');
    expect(parseLeadingSilence(output)).toBeCloseTo(1.5, 3);
  });

  test('ignores silence that does not start at the beginning', () => {
    const output = [
      '[silencedetect @ 0x1] silence_start: 2',
      '[silencedetect @ 0x1] silence_end: 3 | silence_duration: 1'
    ].join('\n');
    expect(parseLeadingSilence(output)).toBe(0);
  });

  test('returns zero with no silence or with silence to the end', () => {
    expect(parseLeadingSilence('')).toBe(0);
    expect(parseLeadingSilence('silence_start: 0')).toBe(0);
  });

  test('detects 1.5s of leading silence in synthesized audio', async () => {
    const out = path.join(os.tmpdir(), `vm-silence-${Date.now()}.wav`);
    try {
      runFfmpeg([
        '-y',
        '-f', 'lavfi', '-t', '1.5', '-i', 'anullsrc=r=44100:cl=mono',
        '-f', 'lavfi', '-t', '3', '-i', 'sine=frequency=440',
        '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[a]',
        '-map', '[a]',
        out
      ]);
      const silence = await detectLeadingSilence(out);
      expect(Math.abs(silence - 1.5)).toBeLessThanOrEqual(0.2);
    } finally {
      if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    }
  });

  test('returns zero for a missing file', async () => {
    const silence = await detectLeadingSilence(path.join(os.tmpdir(), 'vm-missing-audio.wav'));
    expect(silence).toBe(0);
  });
});
