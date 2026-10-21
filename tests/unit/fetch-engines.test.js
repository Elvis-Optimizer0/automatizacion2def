const { test, expect } = require('@playwright/test');

const { ARTIFACTS, PIP_PACKAGES, CONFIG_VERSION, PYTHON_VERSION, configHash } = require('../../scripts/fetch-engines.js');

test.describe('fetch-engines configuration', () => {
  test('every artifact has an https url and a pinned 64-hex sha256', () => {
    const keys = Object.keys(ARTIFACTS);
    expect(keys.length).toBeGreaterThanOrEqual(7);
    for (const key of keys) {
      const artifact = ARTIFACTS[key];
      if (key === 'piperModels') {
        // piperModels is an object of voice configurations, not a single artifact
        expect(typeof artifact).toBe('object');
        for (const [voiceKey, voiceInfo] of Object.entries(artifact)) {
          expect(voiceInfo.onnx).toMatch(/^https:\/\//);
          expect(voiceInfo.json).toMatch(/^https:\/\//);
          expect(voiceInfo.license).toBeTruthy();
        }
        continue;
      }
      expect(artifact.url, `${key} url`).toMatch(/^https:\/\//);
      expect(artifact.sha256, `${key} sha256`).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.file, `${key} file`).toBeTruthy();
    }
  });

  test('no two artifacts share the same sha256 or cache file name', () => {
    const artifacts = Object.values(ARTIFACTS).filter(item => typeof item === 'object' && item.sha256);
    const hashes = artifacts.map((item) => item.sha256);
    const files = artifacts.map((item) => item.file);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(new Set(files).size).toBe(files.length);
  });

  test('python packages are pinned to exact versions', () => {
    expect(PIP_PACKAGES.length).toBeGreaterThan(0);
    for (const pkg of PIP_PACKAGES) {
      expect(pkg).toMatch(/^[a-z0-9-]+==[0-9]/);
    }
    expect(PIP_PACKAGES.some((pkg) => pkg.startsWith('kokoro-onnx=='))).toBe(true);
    expect(PIP_PACKAGES.some((pkg) => pkg.startsWith('onnxruntime=='))).toBe(true);
  });

  test('reports a stable configuration hash and version', () => {
    expect(PYTHON_VERSION).toMatch(/^3\.13\./);
    expect(CONFIG_VERSION).toBeTruthy();
    expect(configHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(configHash()).toBe(configHash());
  });
});
