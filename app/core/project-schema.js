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
  DEFAULT_TRANSITION_SEED,
  DEFAULT_SLIDE_SPEED
} = require('./ffmpeg-helpers.js');
const { SUBTITLE_ANIMATIONS } = require('./subtitles.js');

const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/);

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

const subtitleShadowSchema = z.object({
  enabled: z.boolean().default(false),
  color: HEX_COLOR.default('#000000'),
  opacity: z.number().min(0).max(1).default(0.7),
  distance: z.number().min(0).max(100).default(3),
  angle: z.number().min(0).max(360).default(45),
  blur: z.number().min(0).max(100).default(4)
}).default({});

const subtitleBackgroundSchema = z.object({
  enabled: z.boolean().default(false),
  color: HEX_COLOR.default('#000000'),
  opacity: z.number().min(0).max(1).default(0.5)
}).default({});

const subtitleHighlightSchema = z.object({
  enabled: z.boolean().default(false),
  colors: z.record(z.string(), HEX_COLOR).default({}),
  terms: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(200).default(30),
  detect: z.object({
    numbers: z.boolean().default(true),
    percent: z.boolean().default(true),
    currency: z.boolean().default(true)
  }).default({})
}).default({});

const subtitlesSchema = z.object({
  enabled: z.boolean().default(false),
  fontFamily: z.string().default('Roboto'),
  fontFile: z.string().default(''),
  fontSizeH: z.number().min(8).max(400).default(48),
  fontSizeV: z.number().min(8).max(400).default(64),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  letterSpacing: z.number().min(-20).max(50).default(0),
  textColor: HEX_COLOR.default('#ffffff'),
  outlineWidth: z.number().min(0).max(50).default(0),
  outlineColor: HEX_COLOR.default('#000000'),
  alignment: z.number().int().min(1).max(9).default(2),
  marginH: z.number().min(0).max(1000).default(40),
  marginV: z.number().min(0).max(1000).default(40),
  delay: z.number().min(-2).max(5).default(0),
  autoVoiceStart: z.boolean().default(true),
  wordHighlight: z.boolean().default(false),
  background: subtitleBackgroundSchema,
  shadow: subtitleShadowSchema,
  highlight: subtitleHighlightSchema,
  animation: z.enum(SUBTITLE_ANIMATIONS).default('none')
}).default({});

const voiceSchema = z.object({
  language: z.enum(['es', 'en']).default('es'),
  engine: z.enum(['kokoro', 'edge']).default('kokoro'),
  voiceId: z.string().default(''),
  speed: z.number().min(0.5).max(2).default(1),
  rate: z.string().default('+6%'),
  pitch: z.string().default('+0Hz'),
  pause: z.number().min(0).max(3).default(0.3)
}).default({});

const configSchema = z.object({
  outputs: z.array(z.enum(OUTPUT_IDS_TUPLE)).min(1).default([...DEFAULT_OUTPUTS]),
  fitMode: z.enum(['cover', 'blur', 'frame']).default('cover'),
  frameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#000000'),
  backgroundMode: z.enum(BACKGROUND_MODES).default(DEFAULT_BACKGROUND_MODE),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(DEFAULT_BACKGROUND_COLOR),
  musicVolume: z.number().min(0).max(1).default(0.3),
  voice: voiceSchema,
  extras: extrasSchema,
  subtitles: subtitlesSchema
}).default({});

const renderOptionsSchema = z.object({
  zoomEnabled: z.boolean().default(true),
  zoomType: z.enum(ZOOM_TYPES).default('kenburns'),
  zoomMode: z.enum(ZOOM_MODES).default('fixed'),
  zoomCheckedEffects: z.array(z.enum(ZOOM_TYPES)).default([]),
  zoomSeed: z.number().int().default(DEFAULT_ZOOM_SEED),
  zoomStartScale: z.number().min(1).max(4).default(1.0),
  zoomIntensity: z.number().min(0).max(1).default(0.15),
  zoomSpeed: z.number().min(0.25).max(3.0).default(1.0),
  zoomDurationSec: z.number().min(0.5).max(120).default(6.0),
  transitionType: z.enum(TRANSITION_TYPES).default('fade'),
  transitionMode: z.enum(TRANSITION_MODES).default('fixed'),
  transitionSeed: z.number().int().default(DEFAULT_TRANSITION_SEED),
  transitionDuration: z.number().min(0).max(10).default(1.0),
  slideSpeed: z.number().min(0.7).max(2.0).default(DEFAULT_SLIDE_SPEED)
}).default({});

const sceneZoomSchema = z.object({
  type: z.enum(ZOOM_TYPES).optional(),
  startScale: z.number().min(1).max(4).optional(),
  intensity: z.number().min(0).max(1).optional(),
  start: z.object({
    cx: z.number().min(0).max(1).default(0.5),
    cy: z.number().min(0).max(1).default(0.5),
    scale: z.number().min(0.1).max(10).default(1.0)
  }).optional(),
  end: z.object({
    cx: z.number().min(0).max(1).default(0.5),
    cy: z.number().min(0).max(1).default(0.5),
    scale: z.number().min(0.1).max(10).default(1.0)
  }).optional()
}).optional();

const sceneTransitionSchema = z.object({
  type: z.enum(TRANSITION_TYPES).optional()
}).optional();

const sceneWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number()
});

const sceneSchema = z.object({
  number: z.number(),
  duration: z.number().positive(),
  text: z.string().default(''),
  words: z.array(sceneWordSchema).optional(),
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

const CURRENT_PROJECT_VERSION = 1;

const projectImageSchema = z.object({
  name: z.string(),
  path: z.string(),
  missing: z.boolean().optional(),
  focus169: focusSchema.optional(),
  focus916: focusSchema.optional(),
  focus11: focusSchema.optional(),
  focus45: focusSchema.optional()
});

const projectAudioClipSchema = z.object({
  name: z.string(),
  path: z.string(),
  duration: z.number().optional()
});

const projectSchema = z.object({
  version: z.number().int().default(CURRENT_PROJECT_VERSION),
  savedAt: z.string().optional(),
  images: z.array(projectImageSchema).default([]),
  audio: z.object({
    narration: projectAudioClipSchema.nullish(),
    music: z.object({ name: z.string(), path: z.string() }).nullish()
  }).default({}),
  script: z.object({ raw: z.string().default('') }).default({}),
  timeline: z.array(sceneSchema).default([]),
  config: configSchema,
  renderOptions: renderOptionsSchema,
  timelineOptions: z.object({ adjustToAudio: z.boolean().default(false) }).default({})
}).default({});

function migrateProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const version = Number.isInteger(raw.version) ? raw.version : 1;
  const migrated = { ...raw, version };
  if (!Array.isArray(migrated.images)) migrated.images = [];
  if (!Array.isArray(migrated.timeline)) migrated.timeline = [];
  if (!migrated.audio || typeof migrated.audio !== 'object') migrated.audio = {};
  if (!migrated.script || typeof migrated.script !== 'object') migrated.script = { raw: '' };
  if (!migrated.config || typeof migrated.config !== 'object') migrated.config = {};
  if (!migrated.renderOptions || typeof migrated.renderOptions !== 'object') migrated.renderOptions = {};
  if (!migrated.timelineOptions || typeof migrated.timelineOptions !== 'object') migrated.timelineOptions = {};

  // Migration for voice engine (FASE 1): default to kokoro for old projects
  // and migrate any project with engine='piper' to 'kokoro'
  if (!migrated.config.voice || typeof migrated.config.voice !== 'object') {
    migrated.config.voice = { language: 'es', engine: 'kokoro', voiceId: '', speed: 1, rate: '+6%', pitch: '+0Hz', pause: 0.3 };
  } else {
    if (!migrated.config.voice.engine || migrated.config.voice.engine === 'piper') {
      migrated.config.voice.engine = 'kokoro';
    }
    if (!migrated.config.voice.rate) {
      migrated.config.voice.rate = '+6%';
    }
    if (!migrated.config.voice.pitch) {
      migrated.config.voice.pitch = '+0Hz';
    }
  }

  // Migration for AI settings (FASE 2): default to null
  if (migrated.ai === undefined) {
    migrated.ai = null;
  }

  // Migration for zoom checked effects (FASE 3): default to empty array for old projects
  if (!Array.isArray(migrated.renderOptions.zoomCheckedEffects)) {
    migrated.renderOptions.zoomCheckedEffects = [];
  }

  // Migration for slideSpeed (FASE 4): default to DEFAULT_SLIDE_SPEED for old projects
  if (typeof migrated.renderOptions.slideSpeed !== 'number') {
    migrated.renderOptions.slideSpeed = DEFAULT_SLIDE_SPEED;
  }

  // Migration for zoomSpeed (FASE 5): default to 1.0 for old projects
  if (typeof migrated.renderOptions.zoomSpeed !== 'number') {
    migrated.renderOptions.zoomSpeed = 1.0;
  }

  // Migration for zoomDurationSec (FASE 5): default to 6.0 for old projects
  if (typeof migrated.renderOptions.zoomDurationSec !== 'number') {
    migrated.renderOptions.zoomDurationSec = 6.0;
  }

  return migrated;
}

function parseProjectFile(raw) {
  return projectSchema.parse(migrateProject(raw));
}

function collectProjectPaths(project) {
  const paths = [];
  project.images.forEach((image) => paths.push(image.path));
  if (project.audio && project.audio.narration) paths.push(project.audio.narration.path);
  if (project.audio && project.audio.music) paths.push(project.audio.music.path);
  return paths;
}

module.exports = {
  FOCUS_KEYS_TUPLE,
  focusSchema,
  imageSchema,
  configSchema,
  renderOptionsSchema,
  sceneSchema,
  audioSchema,
  subtitlesSchema,
  voiceSchema,
  renderPayloadSchema,
  parseRenderPayload,
  imageFocus,
  CURRENT_PROJECT_VERSION,
  projectSchema,
  parseProjectFile,
  migrateProject,
  collectProjectPaths
};
