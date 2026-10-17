const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { subtitlesSchema } = require('./project-schema.js');

const E_PRESET_INVALID = 'E_PRESET_INVALID';
const PRESETS_VERSION = 1;
const PRESETS_FILENAME = 'presets.json';

const presetSchema = z.object({
  name: z.string().min(1).max(60),
  style: subtitlesSchema
});

const presetsFileSchema = z.object({
  version: z.number().default(PRESETS_VERSION),
  presets: z.array(presetSchema).default([])
});

const RAW_DEFAULT_PRESETS = [
  {
    name: 'Clasico',
    style: {
      fontFamily: 'Roboto',
      fontSizeH: 48,
      fontSizeV: 64,
      textColor: '#ffffff',
      outlineWidth: 2,
      outlineColor: '#000000',
      alignment: 2
    }
  },
  {
    name: 'Impacto',
    style: {
      fontFamily: 'Montserrat',
      fontSizeH: 60,
      fontSizeV: 78,
      bold: true,
      textColor: '#ffd400',
      outlineWidth: 3,
      outlineColor: '#000000',
      alignment: 2,
      animation: 'pop'
    }
  },
  {
    name: 'Elegante',
    style: {
      fontFamily: 'Playfair Display',
      fontSizeH: 44,
      fontSizeV: 58,
      textColor: '#f5f5f5',
      alignment: 2,
      background: { enabled: true, color: '#000000', opacity: 0.55 },
      shadow: { enabled: true, color: '#000000', opacity: 0.6, distance: 2, angle: 45, blur: 6 }
    }
  }
];

function buildDefaultPresets() {
  return RAW_DEFAULT_PRESETS.map(preset => presetSchema.parse(preset));
}

function getPresetsPath(userDataPath) {
  return path.join(userDataPath, PRESETS_FILENAME);
}

function migratePresets(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (typeof source.version !== 'number') {
    return { version: PRESETS_VERSION, presets: Array.isArray(source.presets) ? source.presets : [] };
  }
  return { version: source.version, presets: Array.isArray(source.presets) ? source.presets : [] };
}

function parsePresetsFile(raw) {
  const result = presetsFileSchema.safeParse(migratePresets(raw));
  if (!result.success) {
    throw new Error(`${E_PRESET_INVALID}: ${result.error.issues[0] ? result.error.issues[0].message : 'formato invalido'}`);
  }
  return result.data;
}

function writePresetsFile(userDataPath, data) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const filePath = getPresetsPath(userDataPath);
  fs.writeFileSync(filePath, JSON.stringify({ version: PRESETS_VERSION, presets: data.presets }, null, 2), 'utf-8');
  return filePath;
}

function readPresets(userDataPath) {
  const filePath = getPresetsPath(userDataPath);
  if (!fs.existsSync(filePath)) {
    const defaults = buildDefaultPresets();
    writePresetsFile(userDataPath, { presets: defaults });
    return { version: PRESETS_VERSION, presets: defaults };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new Error(`${E_PRESET_INVALID}: ${err.message}`);
  }
  const parsed = parsePresetsFile(raw);
  if (parsed.presets.length === 0) {
    parsed.presets = buildDefaultPresets();
    writePresetsFile(userDataPath, parsed);
  }
  return parsed;
}

function addPreset(userDataPath, name, style) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new Error(`${E_PRESET_INVALID}: el nombre es obligatorio`);
  }

  const parsedStyle = subtitlesSchema.safeParse(style || {});
  if (!parsedStyle.success) {
    throw new Error(`${E_PRESET_INVALID}: ${parsedStyle.error.issues[0] ? parsedStyle.error.issues[0].message : 'estilo invalido'}`);
  }

  const current = readPresets(userDataPath);
  const preset = { name: trimmed, style: parsedStyle.data };
  const index = current.presets.findIndex(item => item.name.toLowerCase() === trimmed.toLowerCase());
  if (index >= 0) {
    current.presets[index] = preset;
  } else {
    current.presets.push(preset);
  }
  writePresetsFile(userDataPath, current);
  return current.presets;
}

function renamePreset(userDataPath, oldName, newName) {
  const target = String(oldName || '').trim().toLowerCase();
  const trimmed = String(newName || '').trim();
  if (!trimmed) {
    throw new Error(`${E_PRESET_INVALID}: el nombre es obligatorio`);
  }

  const current = readPresets(userDataPath);
  const index = current.presets.findIndex(item => item.name.toLowerCase() === target);
  if (index < 0) {
    throw new Error(`${E_PRESET_INVALID}: preset no encontrado`);
  }
  if (current.presets.some((item, i) => i !== index && item.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`${E_PRESET_INVALID}: ya existe un preset con ese nombre`);
  }
  current.presets[index].name = trimmed;
  writePresetsFile(userDataPath, current);
  return current.presets;
}

function deletePreset(userDataPath, name) {
  const target = String(name || '').trim().toLowerCase();
  const current = readPresets(userDataPath);
  const next = current.presets.filter(item => item.name.toLowerCase() !== target);
  if (next.length === current.presets.length) {
    throw new Error(`${E_PRESET_INVALID}: preset no encontrado`);
  }
  current.presets = next;
  writePresetsFile(userDataPath, current);
  return current.presets;
}

module.exports = {
  E_PRESET_INVALID,
  PRESETS_VERSION,
  PRESETS_FILENAME,
  presetSchema,
  presetsFileSchema,
  buildDefaultPresets,
  getPresetsPath,
  migratePresets,
  parsePresetsFile,
  readPresets,
  addPreset,
  renamePreset,
  deletePreset
};
