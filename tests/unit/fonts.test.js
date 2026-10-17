const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  E_FONT_IMPORT_FAILED,
  E_FONT_INVALID,
  isSupportedFont,
  readFontFamily,
  listFontsInDir,
  getBundledFontsDir,
  importFontFromPath,
  mergeFontsIntoDir
} = require('../../app/core/fonts.js');

const bundledDir = getBundledFontsDir();

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vm-fonts-'));
}

test.describe('fonts', () => {
  test('reads the family name from each bundled font', () => {
    const expected = {
      'Roboto-Variable.ttf': 'Roboto',
      'OpenSans-Variable.ttf': 'Open Sans',
      'Montserrat-Variable.ttf': 'Montserrat',
      'PlayfairDisplay-Variable.ttf': 'Playfair Display',
      'Oswald-Variable.ttf': 'Oswald',
      'DejaVuSans-Bold.ttf': 'DejaVu Sans'
    };
    for (const [file, family] of Object.entries(expected)) {
      expect(readFontFamily(path.join(bundledDir, file))).toBe(family);
    }
  });

  test('lists all bundled fonts sorted by family', () => {
    const fonts = listFontsInDir(bundledDir);
    const families = fonts.map(f => f.family);
    expect(families).toEqual(expect.arrayContaining([
      'Roboto', 'Open Sans', 'Montserrat', 'Playfair Display', 'Oswald', 'DejaVu Sans'
    ]));
    expect([...families].sort((a, b) => a.localeCompare(b))).toEqual(families);
  });

  test('imports a font into the user fonts directory', () => {
    const userDir = makeTempDir();
    const result = importFontFromPath(path.join(bundledDir, 'Oswald-Variable.ttf'), userDir);

    expect(result.family).toBe('Oswald');
    expect(fs.existsSync(result.path)).toBe(true);
    const listed = listFontsInDir(userDir);
    expect(listed.map(f => f.family)).toContain('Oswald');
  });

  test('rejects unsupported extensions and missing files', () => {
    const userDir = makeTempDir();
    const txtPath = path.join(userDir, 'nota.txt');
    fs.writeFileSync(txtPath, 'hola', 'utf-8');
    expect(() => importFontFromPath(txtPath, userDir)).toThrow(/E_FONT_IMPORT_FAILED/);
    expect(() => importFontFromPath(path.join(userDir, 'nope.ttf'), userDir)).toThrow(/E_FONT_IMPORT_FAILED/);
  });

  test('rejects corrupt font data', () => {
    const dir = makeTempDir();
    const bad = path.join(dir, 'bad.ttf');
    fs.writeFileSync(bad, Buffer.from('this is not a font at all'), 'utf-8');
    expect(() => readFontFamily(bad)).toThrow(new RegExp(E_FONT_INVALID));
    expect(isSupportedFont('a.ttf')).toBe(true);
    expect(isSupportedFont('a.OTF')).toBe(true);
    expect(isSupportedFont('a.woff')).toBe(false);
    expect(E_FONT_IMPORT_FAILED).toBe('E_FONT_IMPORT_FAILED');
  });

  test('merges bundled and user fonts into one directory', () => {
    const userDir = makeTempDir();
    importFontFromPath(path.join(bundledDir, 'Montserrat-Variable.ttf'), userDir);
    const merged = makeTempDir();
    const families = mergeFontsIntoDir(merged, [bundledDir, userDir]);
    expect(families).toEqual(expect.arrayContaining(['Roboto', 'Montserrat']));
    expect(fs.existsSync(path.join(merged, 'Roboto-Variable.ttf'))).toBe(true);
    expect(fs.existsSync(path.join(merged, 'Montserrat-Variable.ttf'))).toBe(true);
  });
});
