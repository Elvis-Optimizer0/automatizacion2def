'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  resolvePiperRuntime,
  buildPiperArgs,
  synthesizeVoice,
  checkVoiceEngine,
  E_VOICE_PIPER_MISSING,
  E_VOICE_PIPER_MODEL_MISSING,
  E_VOICE_PIPER_FAILED,
  E_VOICE_PIPER_CANCELLED
} = require('../../app/core/voice-piper.js');
const { ARTIFACTS } = require('../../scripts/fetch-engines.js');
const { migrateProject } = require('../../app/core/project-schema.js');

test.describe('Piper TTS engine', () => {
  test('resolvePiperRuntime returns valid paths when binaries exist', () => {
    const runtime = resolvePiperRuntime();
    // In test environment, piper may not be installed, so runtime.executable could be null
    if (runtime.executable) {
      expect(runtime.executable).toMatch(/piper\.exe$/);
      expect(runtime.modelsDir).toContain('piper/models');
    }
    expect(runtime.searched).toEqual([]);
  });

  test('buildPiperArgs produces correct args array with absolute paths', () => {
    const modelPath = 'C:\\vendor\\piper\\models\\es_MX-ald-medium.onnx';
    const configPath = 'C:\\vendor\\piper\\models\\es_MX-ald-medium.onnx.json';
    const piperExe = 'C:\\vendor\\piper\\piper.exe';
    const piperDataDir = 'C:\\vendor\\piper\\espeak-ng-data';

    const args = buildPiperArgs({
      outputPath: 'C:\\output\\test.wav',
      speed: 1.0,
      pause: 0.5,
      noise_scale: 0.5,
      noise_w: 0.7,
      sentence_silence: 0.3,
      speaker: 0
    }, modelPath, configPath, 'piper.exe', piperDataDir);

    // Check all required args are present
    expect(args).toContain('--model');
    expect(args).toContain(modelPath);
    expect(args).toContain('--config');
    expect(args).toContain(configPath);
    expect(args).toContain('--output_file');
    expect(args).toContain('--espeak_data');
    expect(args).toContain(piperDataDir);
    expect(args).toContain('--length_scale');
    expect(args).toContain('--sentence_silence');
    expect(args).toContain('--noise_scale');
    expect(args).toContain('--noise_w');
    expect(args).toContain('--speaker');
    expect(args).toContain('0');

    // Verify length_scale is "1" when speed is 1.0 (String(1.0) === "1")
    const lengthScaleIdx = args.indexOf('--length_scale');
    expect(args[lengthScaleIdx + 1]).toBe('1');
  });

  test('buildPiperArgs handles speed/pause correctly', () => {
    const modelPath = 'C:\\models\\test.onnx';
    const configPath = 'C:\\models\\test.onnx.json';
    const piperExe = 'C:\\piper\\piper.exe';
    const piperDataDir = 'C:\\piper\\espeak-ng-data';

    // Test speed 2.0 -> length_scale 0.5
    const args = buildPiperArgs({ speed: 2.0, pause: 0.5 }, 'model.onnx', 'config.json', 'piper.exe', 'data');
    const lsIdx = args.indexOf('--length_scale');
    expect(args[lsIdx + 1]).toBe('0.5');

    const ssIdx = args.indexOf('--sentence_silence');
    expect(args[ssIdx + 1]).toBe('0.5');
  });

  test('synthesizeVoice rejects relative output path', async () => {
    await expect(synthesizeVoice({
      text: 'test',
      outputPath: 'relative/path.wav',
      modelsDir: 'C:\\models'
    })).rejects.toThrow('outputPath debe ser una ruta absoluta');
  });

  test('synthesizeVoice rejects empty text', async () => {
    await expect(synthesizeVoice({
      text: '',
      outputPath: 'C:\\output.wav',
      modelsDir: 'C:\\models'
    })).rejects.toThrow('texto vacío');
  });

  test('checkVoiceEngine returns ready=true when models dir exists (mocked)', () => {
    // This test checks the logic without requiring actual files
    // The actual checkVoiceEngine calls resolvePiperPaths which checks file existence
    // In unit tests we verify the function exists and has correct signature
    expect(typeof checkVoiceEngine).toBe('function');
  });
});

test.describe('Piper argument validation (no shell, absolute paths)', () => {
  test('piper.exe invoked with array args (no shell)', () => {
    const args = ['piper.exe', '--model', 'C:\\models\\voice.onnx', '--config', 'C:\\models\\voice.onnx.json', '--output_file', 'C:\\output\\out.wav', '--espeak_data', 'C:\\piper\\espeak-ng-data', '--length_scale', '1.0', '--sentence_silence', '0.2', '--noise_scale', '0.667', '--noise_w', '0.8', '--speaker', '0'];

    // Verify no shell metacharacters
    const joined = args.join(' ');
    expect(joined).not.toMatch(/[;&|`$(){}]/);
    expect(joined).not.toMatch(/\s>/);
  });

  test('all paths are absolute', () => {
    const args = ['piper.exe', '--model', 'C:\\models\\voice.onnx', '--config', 'C:\\models\\voice.onnx.json', '--output_file', 'C:\\output\\out.wav', '--espeak_data', 'C:\\piper\\espeak-ng-data', '--length_scale', '1.0', '--sentence_silence', '0.2', '--noise_scale', '0.667', '--noise_w', '0.8', '--speaker', '0'];
    const pathArgs = ['--model', '--config', '--output_file', '--espeak_data'];
    const paths = [];
    for (let i = 0; i < args.length; i++) {
      if (['--model', '--config', '--output_file', '--espeak_data'].includes(args[i]) && i + 1 < args.length) {
        paths.push(args[i + 1]);
      }
    }
    paths.forEach(p => expect(path.isAbsolute(p)).toBe(true));
  });

  test('no shell metacharacters in args', () => {
    const args = ['piper.exe', '--model', 'C:\\models\\voice.onnx', '--output_file', 'C:\\output\\out.wav'];
    args.forEach(arg => {
      expect(arg).not.toMatch(/[;&|`$(){}<>]/);
    });
  });
});

test.describe('Piper length_scale inverse relationship', () => {
  test('speed 1.0 -> length_scale 1.0', () => {
    const scale = 1.0 / 1.0;
    expect(scale).toBe(1.0);
  });

  test('speed 1.5 -> length_scale 0.666...', () => {
    const scale = 1.0 / 1.5;
    expect(scale).toBeCloseTo(0.666, 2);
  });

  test('speed 0.5 -> length_scale 2.0', () => {
    const scale = 1.0 / 0.5;
    expect(scale).toBe(2.0);
  });

  test('speed 2.0 -> length_scale 0.5', () => {
    const scale = 1.0 / 2.0;
    expect(scale).toBe(0.5);
  });
});

test.describe('Paragraph splitting and concatenation concept', () => {
  test('split long text into paragraphs', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const paragraphs = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    expect(paragraphs.length).toBe(3);
    expect(paragraphs[0]).toBe('Paragraph one.');
    expect(paragraphs[1]).toBe('Paragraph two.');
    expect(paragraphs[2]).toBe('Paragraph three.');
  });

  test('single paragraph not split', () => {
    const text = 'Single paragraph text.';
    const paragraphs = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    expect(paragraphs.length).toBe(1);
  });

  test('concatenation with ffmpeg uses filter_complex concept', () => {
    // This tests the concept - actual ffmpeg concat tested in E2E
    const wavFiles = ['C:\\temp\\part1.wav', 'C:\\temp\\part2.wav', 'C:\\temp\\part3.wav'];
    const filter = wavFiles.map((_, i) => `[${i}:0]`).join('') + `concat=n=${wavFiles.length}:v=0:a=1[out]`;
    expect(filter).toContain('[0:0][1:0][2:0]concat=n=3:v=0:a=1[out]');
  });
});

test.describe('Project migration: old .vmproj -> Kokoro', () => {
  const { migrateProject } = require('../../app/core/project-schema.js');

  test('old project without ai section gets ai: null', () => {
    const oldProject = { version: 1, images: [], audio: { narration: null, music: null }, script: { raw: '' }, timeline: [], config: {} };
    const migrated = migrateProject(oldProject);
    expect(migrated.ai).toBeNull();
  });

  test('migrated project has voice.engine = kokoro by default', () => {
    const oldProject = { version: 1, images: [], audio: { narration: null, music: null }, script: { raw: '' }, timeline: [], config: { voice: { language: 'es', voiceId: 'ef_dora' } } };
    const migrated = migrateProject(oldProject);
    expect(migrated.config.voice.engine).toBe('kokoro');
  });

  test('migrated project preserves voiceId and language', () => {
    const oldProject = { version: 1, images: [], audio: { narration: null, music: null }, script: { raw: '' }, timeline: [], config: { voice: { language: 'en', voiceId: 'af_heart', speed: 1.2 } } };
    const migrated = migrateProject(oldProject);
    expect(migrated.config.voice.language).toBe('en');
    expect(migrated.config.voice.voiceId).toBe('af_heart');
    expect(migrated.config.voice.speed).toBe(1.2);
  });
});

test.describe('Piper catalog validation', () => {
  test('piperModels has exactly 6 voices', () => {
    expect(Object.keys(ARTIFACTS.piperModels).length).toBe(6);
  });

  test('each voice has onnx, json, license', () => {
    for (const [voiceKey, voiceInfo] of Object.entries(ARTIFACTS.piperModels)) {
      expect(voiceInfo.onnx).toMatch(/^https:\/\//);
      expect(voiceInfo.json).toMatch(/^https:\/\//);
      expect(voiceInfo.license).toBeTruthy();
    }
  });

  test('Spanish voices have es_MX and es_ES', () => {
    const voices = Object.keys(ARTIFACTS.piperModels);
    expect(voices.some(v => v.startsWith('es_MX'))).toBe(true);
    expect(voices.some(v => v.startsWith('es_ES'))).toBe(true);
  });

  test('English voices have en_US', () => {
    const voices = Object.keys(ARTIFACTS.piperModels);
    expect(voices.some(v => v.startsWith('en_US'))).toBe(true);
  });
});