const { test, expect } = require('@playwright/test');
const { generateGridSource, computeMotionSequence, detectBlobs, fitSimilarity, OUT_W, OUT_H } = require('../../scripts/lib/motion-tracker.cjs');
const fs = require('fs');
const path = require('path');

test.describe('motion-tracker core functions', () => {
  test('generateGridSource creates PNG with markers', async () => {
    const tmpPath = path.join(require('os').tmpdir(), 'test-grid.png');
    const { markers, w, h } = await generateGridSource({ outPath: tmpPath, gridNx: 5, gridNy: 4, markerSize: 20 });
    expect(markers.length).toBe(12); // (5-1)*(4-1)
    expect(w).toBe(3840);
    expect(h).toBe(2160);
    expect(fs.existsSync(tmpPath)).toBe(true);
    fs.unlinkSync(tmpPath);
  });

  test('computeMotionSequence zoomIn produces correct keyframes', () => {
    const seq = computeMotionSequence(2.0, 'zoomIn', 1.0, 1.0, 1.15);
    expect(seq.length).toBe(60); // 2s * 30fps
    expect(seq[0].scale).toBeCloseTo(1.0, 3);
    expect(seq[0].cx).toBe(0.5);
    expect(seq[0].cy).toBe(0.5);
    expect(seq[seq.length - 1].scale).toBeCloseTo(1.15, 2);
    expect(seq[seq.length - 1].cx).toBe(0.5);
  });

  test('computeMotionSequence panLeft has constant scale', () => {
    const seq = computeMotionSequence(2.0, 'panLeft', 1.0);
    const scales = seq.map(f => f.scale);
    const mean = scales.reduce((a, b) => a + b, 0) / scales.length;
    expect(mean).toBeCloseTo(1.2, 2);
    expect(seq[0].cx).toBeCloseTo(1.0, 2);
    expect(seq[seq.length - 1].cx).toBeCloseTo(0.0, 2);
  });

  test('detectBlobs finds marker centroids', async () => {
    const { markers } = await generateGridSource({ outPath: path.join(require('os').tmpdir(), 'test-grid2.png'), gridNx: 4, gridNy: 3, markerSize: 30 });
    const frame = { data: Buffer.alloc(OUT_W * OUT_H, 255), w: OUT_W, h: OUT_H };
    const expected = markers.map(m => ({
      x: OUT_W * (0.5 + (m.u - 0.5) * 1.0),
      y: OUT_H * (0.5 + (m.v - 0.5) * 1.0)
    }));
    const blobs = detectBlobs(frame, expected, 30);
    expect(blobs.length).toBe(markers.length);
  });

  test('fitSimilarity recovers identity transform', () => {
    const markers = [
      { u: 0.2, v: 0.3 },
      { u: 0.5, v: 0.5 },
      { u: 0.8, v: 0.7 }
    ];
    const blobs = [
      { cx: OUT_W * 0.2, cy: OUT_H * 0.3, weight: 1 },
      { cx: OUT_W * 0.5, cy: OUT_H * 0.5, weight: 1 },
      { cx: OUT_W * 0.8, cy: OUT_H * 0.7, weight: 1 }
    ];
    const fit = fitSimilarity(markers, blobs, OUT_W, OUT_H);
    expect(fit.scale).toBeCloseTo(1.0, 5);
    expect(fit.cx).toBeCloseTo(0.5, 5);
    expect(fit.cy).toBeCloseTo(0.5, 5);
  });

  test('fitSimilarity recovers scale 2.0', () => {
    const markers = [
      { u: 0.2, v: 0.3 },
      { u: 0.5, v: 0.5 },
      { u: 0.8, v: 0.7 }
    ];
    const blobs = [
      { cx: OUT_W * (0.5 + (0.2 - 0.5) * 2.0), cy: OUT_H * (0.5 + (0.3 - 0.5) * 2.0), weight: 1 },
      { cx: OUT_W * 0.5, cy: OUT_H * 0.5, weight: 1 },
      { cx: OUT_W * (0.5 + (0.8 - 0.5) * 2.0), cy: OUT_H * (0.5 + (0.7 - 0.5) * 2.0), weight: 1 }
    ];
    const fit = fitSimilarity(markers, blobs, OUT_W, OUT_H);
    expect(fit.scale).toBeCloseTo(2.0, 3);
    expect(fit.cx).toBeCloseTo(0.5, 3);
  });
});