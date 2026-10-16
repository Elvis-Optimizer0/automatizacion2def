const { z } = require('zod');
const {
  OUTPUT_IDS,
  DEFAULT_OUTPUTS,
  FOCUS_KEYS,
  DEFAULT_FOCUS,
  DEFAULT_SCALE,
  SCALE_MIN,
  SCALE_MAX,
  BACKGROUND_MODES,
  DEFAULT_BACKGROUND_MODE,
  DEFAULT_BACKGROUND_COLOR,
  FORMAT_FOCUS_KEY
} = require('./output-formats.js');
const {
  ZOOM_TYPES,
  ZOOM_MODES,
  DEFAULT_ZOOM_SEED,
  TRANSITION_TYPES,
  TRANSITION_MODES,
  DEFAULT_TRANSITION_SEED
} = require('./ffmpeg-helpers.js');

const FOCUS_KEYS_TUPLE = FOCUS_KEYS;
const OUTPUT_IDS_TUPLE = OUTPUT_IDS;

const focusSchema = z.object({
  x: z.number().min(0).max(1).default(DEFAULT_FOCUS.x),
  y: z.number().min(0).max(1).default(DEFAULT_FOCUS.y),
  scale: z.number().min(SCALE_MIN).max(SCALE_MAX).default(DEFAULT_SCALE)
}).default({});

const imageSchema = z.object({
  name: z.string(),
  path: z.string(),
  focus169: focusSchema,
  focus916: focusSchema,
  focus11: focusSchema,
  focus45: focusSchema
});

const extrasSchema = z.object({
  badge: z.object({
    enabled: z.boolean().default(false),
    text: z.string().default(''),
    position: z.enum(['topLeft', 'topRight', 'bottomLeft', 'bottomRight']).default('topRight'),
    animation: z.enum(['none', 'fade', 'pulse', 'slide', 'pop']).default('fade')
  }).default({}),
  lowerThird: z.object({
    enabled: z.boolean().default(false),
    text: z.string().default(''),
    opacity: z.number().min(0).max(1).default(0.6)
  }).default({}),
  progressBar: z.object({
    enabled: z.boolean().default(false),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff0000'),
    height: z.number().min(1).max(200).default(8)
  }).default({})
}).default({});

const configSchema = z.object({
  outputs: z.array(z.enum(OUTPUT_IDS_TUPLE)).min(1).default([...DEFAULT_OUTPUTS]),
  fitMode: z.enum(['cover', 'blur', 'frame']).default('cover'),
  frameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#000000'),
  backgroundMode: z.enum(BACKGROUND_MODES).default(DEFAULT_BACKGROUND_MODE),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(DEFAULT_BACKGROUND_COLOR),
  musicVolume: z.number().min(0).max(1).default(0.3),
  extras: extrasSchema
}).default({});

const renderOptionsSchema = z.object({
  zoomEnabled: z.boolean().default(true),
  zoomType: z.enum(ZOOM_TYPES).default('kenburns'),
  zoomMode: z.enum(ZOOM_MODES).default('fixed'),
  zoomSeed: z.number().int().default(DEFAULT_ZOOM_SEED),
  zoomStartScale: z.number().min(1).max(4).default(1.0),
  zoomIntensity: z.number().min(0).max(1).default(0.15),
  transitionType: z.enum(TRANSITION_TYPES).default('fade'),
  transitionMode: z.enum(TRANSITION_MODES).default('fixed'),
  transitionSeed: z.number().int().default(DEFAULT_TRANSITION_SEED),
  transitionDuration: z.number().min(0).max(10).default(1.0)
}).default({});

const sceneZoomSchema = z.object({
  type: z.enum(ZOOM_TYPES).optional(),
  startScale: z.number().min(1).max(4).optional(),
  intensity: z.number().min(0).max(1).optional()
}).optional();

const sceneTransitionSchema = z.object({
  type: z.enum(TRANSITION_TYPES).optional()
}).optional();

const sceneSchema = z.object({
  number: z.number(),
  duration: z.number().positive(),
  zoom: sceneZoomSchema,
  transition: sceneTransitionSchema
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
    return { ...DEFAULT_FOCUS, scale: DEFAULT_SCALE };
  }
  return {
    x: focus.x,
    y: focus.y,
    scale: typeof focus.scale === 'number' ? focus.scale : DEFAULT_SCALE
  };
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
