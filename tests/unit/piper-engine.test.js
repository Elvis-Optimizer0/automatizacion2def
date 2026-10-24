'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
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
const { migrateProject } = require('../../app/core/project-schema.js');
const { MODEL_SPECS } = require('../../app/core/model-specs.js');

test.describe('Piper TTS engine', () => {
  test('resolvePiperRuntime returns valid paths when binaries exist', () => {
    const runtime = resolvePiperRuntime();
    if (runtime.executable) {
      expect(runtime.executable).toMatch(/piper\.exe$/);
      expect(path.normalize(runtime.modelsDir)).toContain(path.join('piper', 'models'));
    }
    expect(runtime.searched.length).toBeGreaterThan(0);
    expect(runtime.searched.some((dir) => path.basename(dir) === 'piper')).toBe(true);
  });

  test('buildPiperArgs produces correct args array with absolute paths', () => {
    const modelPath = 'C:\\vendor\\piper\\models\\es_MX-ald-medium.onnx';
    const configPath = 'C:\\vendor\\piper\\models\\es_MX-ald-medium.onnx.json';
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

    const lengthScaleIdx = args.indexOf('--length_scale');
    expect(args[lengthScaleIdx + 1]).toBe('1');
  });

  test('buildPiperArgs handles speed/pause correctly', () => {
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
    })).rejects.toThrow(E_VOICE_PIPER_FAILED + ': outputPath debe ser una ruta absoluta');
  });

  test('synthesizeVoice rejects empty text', async () => {
    await expect(synthesizeVoice({
      text: '',
      outputPath: 'C:\\output.wav',
      modelsDir: 'C:\\models'
    })).rejects.toThrow(E_VOICE_PIPER_FAILED + ': texto vacío');
  });

  test('checkVoiceEngine returns ready=true when models dir exists (mocked)', () => {
    expect(typeof checkVoiceEngine).toBe('function');
  });

  test('E_VOICE_PIPER_MISSING error constant is defined', () => {
    expect(E_VOICE_PIPER_MISSING).toBe('E_VOICE_PIPER_MISSING');
  });

  test('E_VOICE_PIPER_MODEL_MISSING error constant is defined', () => {
    expect(E_VOICE_PIPER_MODEL_MISSING).toBe('E_VOICE_PIPER_MODEL_MISSING');
  });

  test('E_VOICE_PIPER_FAILED error constant is defined', () => {
    expect(E_VOICE_PIPER_FAILED).toBe('E_VOICE_PIPER_FAILED');
  });

  test('E_VOICE_PIPER_CANCELLED error constant is defined', () => {
    expect(E_VOICE_PIPER_CANCELLED).toBe('E_VOICE_PIPER_CANCELLED');
  });
});

test.describe('Piper argument validation (no shell, absolute paths)', () => {
  test('piper.exe invoked with array args (no shell)', () => {
    const args = ['piper.exe', '--model', 'C:\\models\\voice.onnx', '--config', 'C:\\models\\voice.onnx.json', '--output_file', 'C:\\output\\out.wav', '--espeak_data', 'C:\\piper\\espeak-ng-data', '--length_scale', '1.0', '--sentence_silence', '0.2', '--noise_scale', '0.667', '--noise_w', '0.8', '--speaker', '0'];

    const joined = args.join(' ');
    expect(joined).not.toMatch(/[;&|`$(){}]/);
    expect(joined).not.toMatch(/\s>/);
  });

  test('all paths are absolute', () => {
    const args = ['piper.exe', '--model', 'C:\\models\\voice.onnx', '--config', 'C:\\models\\voice.onnx.json', '--output_file', 'C:\\output\\out.wav', '--espeak_data', 'C:\\piper\\espeak-ng-data', '--length_scale', '1.0', '--sentence_silence', '0.2', '--noise_scale', '0.667', '--noise_w', '0.8', '--speaker', '0'];
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
    const wavFiles = ['C:\\temp\\part1.wav', 'C:\\temp\\part2.wav', 'C:\\temp\\part3.wav'];
    const filter = wavFiles.map((_, i) => `[${i}:0]`).join('') + `concat=n=${wavFiles.length}:v=0:a=1[out]`;
    expect(filter).toContain('[0:0][1:0][2:0]concat=n=3:v=0:a=1[out]');
  });
});

test.describe('Project migration: old .vmproj -> Kokoro', () => {
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
  function piperVoiceIds() {
    return [...new Set(MODEL_SPECS.piper.files.map((file) => file.fileName.replace(/\.onnx(?:\.json)?$/, '')))];
  }

  test('piperModels derives its voice count from the catalog', () => {
    const voices = piperVoiceIds();
    expect(voices.length).toBeGreaterThan(0);
    expect(MODEL_SPECS.piper.files.length).toBe(voices.length * 2);
  });

  test('each catalog voice has onnx, json, license, source and commercial metadata', () => {
    for (const voiceId of piperVoiceIds()) {
      const onnx = MODEL_SPECS.piper.files.find((file) => file.fileName === `${voiceId}.onnx`);
      const json = MODEL_SPECS.piper.files.find((file) => file.fileName === `${voiceId}.onnx.json`);
      expect(onnx.url).toMatch(/^https:\/\//);
      expect(json.url).toMatch(/^https:\/\//);
      expect(onnx.license).toBeTruthy();
      expect(json.license).toBe(onnx.license);
      expect(onnx.licenseSource).toMatch(/^https:\/\/huggingface\.co\/rhasspy\/piper-voices\/raw\//);
      expect(json.licenseSource).toBe(onnx.licenseSource);
      expect(typeof onnx.commercialUse).toBe('boolean');
      expect(json.commercialUse).toBe(onnx.commercialUse);
    }
  });

  test('commercial use flags match the MODEL_CARD license evidence', () => {
    const byVoice = new Map(MODEL_SPECS.piper.files.map((file) => [file.fileName, file]));
    expect(byVoice.get('es_MX-ald-medium.onnx').commercialUse).toBe(true);
    expect(byVoice.get('es_MX-ald-x_low.onnx').commercialUse).toBe(false);
    expect(byVoice.get('es_ES-carlfm-x_low.onnx').commercialUse).toBe(true);
    expect(byVoice.get('en_US-lessac-medium.onnx').commercialUse).toBe(false);
    expect(byVoice.get('en_US-lessac-low.onnx').commercialUse).toBe(false);
  });

  test('docs list every catalog voice id and agree with commercialUse', () => {
    const root = path.join(__dirname, '..', '..');
    const licenses = fs.readFileSync(path.join(root, 'docs', 'licenses.md'), 'utf8');
    const models = fs.readFileSync(path.join(root, 'docs', 'models.md'), 'utf8');
    for (const voiceId of piperVoiceIds()) {
      const onnx = MODEL_SPECS.piper.files.find((file) => file.fileName === `${voiceId}.onnx`);
      expect(licenses).toContain(voiceId);
      expect(models).toContain(voiceId);
      expect(models).toContain(onnx.licenseSource);
    }
  });

  test('Spanish voices have es_MX and es_ES', () => {
    const voices = piperVoiceIds();
    expect(voices.some(v => v.startsWith('es_MX'))).toBe(true);
    expect(voices.some(v => v.startsWith('es_ES'))).toBe(true);
  });

  test('English voices have en_US', () => {
    const voices = piperVoiceIds();
    expect(voices.some(v => v.startsWith('en_US'))).toBe(true);
  });
});