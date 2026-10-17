const fs = require('fs');
const path = require('path');

const E_FONT_IMPORT_FAILED = 'E_FONT_IMPORT_FAILED';
const E_FONT_INVALID = 'E_FONT_INVALID';
const SUPPORTED_FONT_EXTENSIONS = ['.ttf', '.otf'];

function fixAsarPath(p) {
  return String(p).replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
}

function isSupportedFont(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return SUPPORTED_FONT_EXTENSIONS.includes(ext);
}

function decodeName(buffer, offset, length, platformID) {
  if (platformID === 1) {
    return buffer.toString('latin1', offset, offset + length);
  }
  let out = '';
  for (let i = 0; i + 1 < length; i += 2) {
    out += String.fromCharCode(buffer.readUInt16BE(offset + i));
  }
  return out;
}

function readFontFamily(filePath) {
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (err) {
    throw new Error(`${E_FONT_INVALID}: ${err.message}`);
  }

  if (buffer.length < 12) {
    throw new Error(`${E_FONT_INVALID}: archivo demasiado pequeno`);
  }

  const sfnt = buffer.toString('latin1', 0, 4);
  const validSfnt = sfnt === '\u0000\u0001\u0000\u0000' || sfnt === 'OTTO' || sfnt === 'true';
  if (!validSfnt) {
    throw new Error(`${E_FONT_INVALID}: no es una tipografia TrueType/OpenType`);
  }

  const numTables = buffer.readUInt16BE(4);
  let nameOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > buffer.length) break;
    if (buffer.toString('latin1', rec, rec + 4) === 'name') {
      nameOffset = buffer.readUInt32BE(rec + 8);
      break;
    }
  }

  if (nameOffset < 0 || nameOffset + 6 > buffer.length) {
    throw new Error(`${E_FONT_INVALID}: falta la tabla name`);
  }

  const count = buffer.readUInt16BE(nameOffset + 2);
  const storageOffset = nameOffset + buffer.readUInt16BE(nameOffset + 4);
  const families = {};

  for (let i = 0; i < count; i++) {
    const rec = nameOffset + 6 + i * 12;
    if (rec + 12 > buffer.length) break;
    const platformID = buffer.readUInt16BE(rec);
    const nameID = buffer.readUInt16BE(rec + 6);
    if (nameID !== 1 && nameID !== 16) continue;
    const length = buffer.readUInt16BE(rec + 8);
    const offset = buffer.readUInt16BE(rec + 10);
    const start = storageOffset + offset;
    if (start + length > buffer.length) continue;
    const value = decodeName(buffer, start, length, platformID).trim();
    if (!value) continue;
    const priority = (nameID === 16 ? 2 : 0) + (platformID === 3 || platformID === 0 ? 1 : 0);
    if (families[value] === undefined || families[value] < priority) {
      families[value] = priority;
    }
  }

  const entries = Object.keys(families);
  if (!entries.length) {
    return path.basename(filePath).replace(/\.(ttf|otf)$/i, '');
  }
  entries.sort((a, b) => families[b] - families[a]);
  return entries[0];
}

function listFontsInDir(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const fonts = [];
  for (const name of names) {
    if (!isSupportedFont(name)) continue;
    const full = path.join(dir, name);
    try {
      fonts.push({ file: name, family: readFontFamily(full), path: full });
    } catch {
      // skip unreadable or invalid font files
    }
  }
  fonts.sort((a, b) => a.family.localeCompare(b.family));
  return fonts;
}

function getBundledFontsDir() {
  return fixAsarPath(path.join(__dirname, '..', 'assets', 'fonts'));
}

function getUserFontsDir(userDataPath) {
  return path.join(userDataPath, 'fonts');
}

function importFontFromPath(sourcePath, targetDir) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`${E_FONT_IMPORT_FAILED}: archivo no encontrado`);
  }
  if (!isSupportedFont(sourcePath)) {
    throw new Error(`${E_FONT_IMPORT_FAILED}: formato no soportado (usa .ttf u .otf)`);
  }

  let family;
  try {
    family = readFontFamily(sourcePath);
  } catch (err) {
    throw new Error(`${E_FONT_IMPORT_FAILED}: ${err.message}`);
  }

  const ext = path.extname(sourcePath).toLowerCase();
  const safe = family.replace(/[^0-9a-zA-Z]+/g, '-').replace(/^-+|-+$/g, '') || 'fuente';
  fs.mkdirSync(targetDir, { recursive: true });

  let dest = path.join(targetDir, `${safe}${ext}`);
  let counter = 1;
  while (fs.existsSync(dest)) {
    dest = path.join(targetDir, `${safe}-${counter}${ext}`);
    counter += 1;
  }

  try {
    fs.copyFileSync(sourcePath, dest);
  } catch (err) {
    throw new Error(`${E_FONT_IMPORT_FAILED}: ${err.message}`);
  }

  return { file: path.basename(dest), family, path: dest };
}

function mergeFontsIntoDir(destDir, dirs) {
  fs.mkdirSync(destDir, { recursive: true });
  const families = [];
  for (const dir of dirs || []) {
    if (!dir) continue;
    for (const font of listFontsInDir(dir)) {
      try {
        fs.copyFileSync(font.path, path.join(destDir, font.file));
        families.push(font.family);
      } catch {
        // best-effort copy; libass falls back to its default font
      }
    }
  }
  return families;
}

module.exports = {
  E_FONT_IMPORT_FAILED,
  E_FONT_INVALID,
  SUPPORTED_FONT_EXTENSIONS,
  fixAsarPath,
  isSupportedFont,
  readFontFamily,
  listFontsInDir,
  getBundledFontsDir,
  getUserFontsDir,
  importFontFromPath,
  mergeFontsIntoDir
};
