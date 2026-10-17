const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  E_PRESET_INVALID,
  PRESETS_VERSION,
  buildDefaultPresets,
  migratePresets,
  parsePresetsFile,
  readPresets,
  addPreset,
  renamePreset,
  deletePreset,
  getPresetsPath
} = require('../../app/core/presets.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vm-presets-'));
}

test.describe('presets', () => {
  test('ships three validated default presets', () => {
    const defaults = buildDefaultPresets();
    expect(defaults).toHaveLength(3);
    expect(defaults.map(p => p.name)).toEqual(['Clasico', 'Impacto', 'Elegante']);
    for (const preset of defaults) {
      expect(typeof preset.style.fontFamily).toBe('string');
      expect(typeof preset.style.fontSizeH).toBe('number');
    }
  });

  test('creates the presets file with defaults on first read', () => {
    const dir = makeTempDir();
    const data = readPresets(dir);
    expect(data.version).toBe(PRESETS_VERSION);
    expect(data.presets).toHaveLength(3);
    expect(fs.existsSync(getPresetsPath(dir))).toBe(true);
  });

  test('adds, persists and reloads a custom preset', () => {
    const dir = makeTempDir();
    addPreset(dir, 'Mi estilo', { fontFamily: 'Oswald', fontSizeH: 70, textColor: '#00ff00' });
    const reloaded = readPresets(dir);
    const custom = reloaded.presets.find(p => p.name === 'Mi estilo');
    expect(custom).toBeTruthy();
    expect(custom.style.fontFamily).toBe('Oswald');
    expect(custom.style.fontSizeH).toBe(70);
    expect(custom.style.textColor).toBe('#00ff00');
  });

  test('upserts when saving with an existing name', () => {
    const dir = makeTempDir();
    addPreset(dir, 'Dup', { fontFamily: 'Roboto', fontSizeH: 20 });
    addPreset(dir, 'dup', { fontFamily: 'Oswald', fontSizeH: 30 });
    const presets = readPresets(dir);
    expect(presets.presets.filter(p => p.name.toLowerCase() === 'dup')).toHaveLength(1);
    expect(presets.presets.find(p => p.name.toLowerCase() === 'dup').style.fontFamily).toBe('Oswald');
  });

  test('renames and deletes presets', () => {
    const dir = makeTempDir();
    addPreset(dir, 'Viejo', { fontFamily: 'Roboto' });
    renamePreset(dir, 'Viejo', 'Nuevo');
    let presets = readPresets(dir).presets;
    expect(presets.some(p => p.name === 'Nuevo')).toBe(true);
    expect(presets.some(p => p.name === 'Viejo')).toBe(false);

    deletePreset(dir, 'Nuevo');
    presets = readPresets(dir).presets;
    expect(presets.some(p => p.name === 'Nuevo')).toBe(false);

    expect(() => renamePreset(dir, 'NoExiste', 'X')).toThrow(new RegExp(E_PRESET_INVALID));
    expect(() => deletePreset(dir, 'NoExiste')).toThrow(new RegExp(E_PRESET_INVALID));
    expect(() => addPreset(dir, '   ', {})).toThrow(new RegExp(E_PRESET_INVALID));
  });

  test('migrates legacy files and rejects malformed payloads', () => {
    expect(migratePresets({ presets: [] })).toEqual({ version: PRESETS_VERSION, presets: [] });
    expect(migratePresets(null)).toEqual({ version: PRESETS_VERSION, presets: [] });
    expect(() => parsePresetsFile({ version: 1, presets: [{ style: {} }] })).toThrow(new RegExp(E_PRESET_INVALID));
    expect(() => parsePresetsFile({ version: 1, presets: [{ name: 'x', style: { fontSizeH: 9999 } }] })).toThrow(new RegExp(E_PRESET_INVALID));
  });
});
