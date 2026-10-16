const path = require('path');

const E_OUTPUT_CONFIG_MISSING = 'E_OUTPUT_CONFIG_MISSING';

const OUTPUT_FORMATS = {
  '16:9': { id: '16:9', w: 1920, h: 1080, suffix: '' },
  '9:16': { id: '9:16', w: 1080, h: 1920, suffix: '_9x16' },
  '1:1': { id: '1:1', w: 1080, h: 1080, suffix: '_1x1' },
  '4:5': { id: '4:5', w: 1080, h: 1350, suffix: '_4x5' }
};

const OUTPUT_IDS = ['16:9', '9:16', '1:1', '4:5'];
const DEFAULT_OUTPUTS = ['16:9'];

const FORMAT_FOCUS_KEY = {
  '16:9': 'focus169',
  '9:16': 'focus916',
  '1:1': 'focus11',
  '4:5': 'focus45'
};

const FOCUS_KEYS = ['focus169', 'focus916', 'focus11', 'focus45'];
const DEFAULT_FOCUS = { x: 0.5, y: 0.5 };

function resolveOutputConfig(id) {
  const config = OUTPUT_FORMATS[id];
  if (!config) {
    throw new Error(`${E_OUTPUT_CONFIG_MISSING}: unknown output format '${id}'`);
  }
  return { ...config };
}

function assertOutputConfig(config) {
  if (
    !config ||
    typeof config.id !== 'string' ||
    typeof config.w !== 'number' ||
    typeof config.h !== 'number' ||
    config.w <= 0 ||
    config.h <= 0
  ) {
    throw new Error(`${E_OUTPUT_CONFIG_MISSING}: a valid { id, w, h } outputConfig is required`);
  }
  return config;
}

function withOutputSuffix(outputPath, config) {
  if (!config || !config.suffix) return outputPath;
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}${config.suffix}${parsed.ext}`);
}

module.exports = {
  E_OUTPUT_CONFIG_MISSING,
  OUTPUT_FORMATS,
  OUTPUT_IDS,
  DEFAULT_OUTPUTS,
  FORMAT_FOCUS_KEY,
  FOCUS_KEYS,
  DEFAULT_FOCUS,
  resolveOutputConfig,
  assertOutputConfig,
  withOutputSuffix
};
