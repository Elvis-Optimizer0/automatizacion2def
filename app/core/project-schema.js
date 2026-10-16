const { z } = require('zod');
const { OUTPUT_IDS, DEFAULT_OUTPUTS, FOCUS_KEYS, DEFAULT_FOCUS, FORMAT_FOCUS_KEY } = require('./output-formats.js');

const FOCUS_KEYS_TUPLE = FOCUS_KEYS;
const OUTPUT_IDS_TUPLE = OUTPUT_IDS;

const focusSchema = z.object({
  x: z.number().min(0).max(1).default(DEFAULT_FOCUS.x),
  y: z.number().min(0).max(1).default(DEFAULT_FOCUS.y)
}).default({ ...DEFAULT_FOCUS });

const imageSchema = z.object({
  name: z.string(),
  path: z.string(),
  focus169: focusSchema,
  focus916: focusSchema,
  focus11: focusSchema,
  focus45: focusSchema
});

const configSchema = z.object({
  outputs: z.array(z.enum(OUTPUT_IDS_TUPLE)).min(1).default([...DEFAULT_OUTPUTS]),
  fitMode: z.enum(['cover', 'blur', 'frame']).default('cover'),
  frameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#000000'),
  musicVolume: z.number().min(0).max(1).default(0.3)
}).default({});

const renderOptionsSchema = z.object({
  zoomEnabled: z.boolean().default(true),
  zoomStartScale: z.number().min(1).max(4).default(1.0),
  zoomIntensity: z.number().min(0).max(1).default(0.15),
  transitionType: z.enum(['fade', 'cut']).default('fade'),
  transitionDuration: z.number().min(0).max(10).default(1.0)
}).default({});

const sceneSchema = z.object({
  number: z.number(),
  duration: z.number().positive()
});

const audioSchema = z.object({
  name: z.string(),
  path: z.string()
});

const renderPayloadSchema = z.object({
  scenes: z.array(sceneSchema).min(1),
  images: z.array(imageSchema).min(1),
  narration: audioSchema,
  music: audioSchema.nullish(),
  outputPath: z.string(),
  audioDuration: z.number().positive().optional(),
  config: configSchema,
  renderOptions: renderOptionsSchema
});

function parseRenderPayload(payload) {
  return renderPayloadSchema.parse(payload);
}

function imageFocus(image, formatId) {
  const key = FORMAT_FOCUS_KEY[formatId];
  const focus = image && image[key];
  if (!focus || typeof focus.x !== 'number' || typeof focus.y !== 'number') {
    return { ...DEFAULT_FOCUS };
  }
  return { x: focus.x, y: focus.y };
}

module.exports = {
  FOCUS_KEYS_TUPLE,
  focusSchema,
  imageSchema,
  configSchema,
  renderOptionsSchema,
  sceneSchema,
  audioSchema,
  renderPayloadSchema,
  parseRenderPayload,
  imageFocus
};
