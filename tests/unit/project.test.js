const { test, expect } = require('@playwright/test');
const {
  CURRENT_PROJECT_VERSION,
  parseProjectFile,
  migrateProject,
  collectProjectPaths
} = require('../../app/core/project-schema.js');

function baseProject(overrides = {}) {
  return {
    version: 1,
    images: [{ name: 'a.png', path: 'C:/media/a.png', focus169: { x: 0.2, y: 0.8, scale: 0.6 } }],
    audio: { narration: { name: 'n.wav', path: 'C:/media/n.wav', duration: 6 }, music: null },
    script: { raw: '[Escena 1] 0:00 - 0:06 A' },
    timeline: [{ number: 1, duration: 6, zoom: { type: 'panLeft', intensity: 0.3 }, transition: { type: 'circle' } }],
    config: { outputs: ['16:9'], fitMode: 'cover' },
    renderOptions: { zoomType: 'pulse', transitionType: 'slideUp' },
    timelineOptions: { adjustToAudio: true },
    ...overrides
  };
}

test.describe('project file (save/open)', () => {
  test('parses a valid project and preserves absolute paths', () => {
    const project = parseProjectFile(baseProject());
    expect(project.version).toBe(CURRENT_PROJECT_VERSION);
    expect(project.images[0].path).toBe('C:/media/a.png');
    expect(project.images[0].focus169).toEqual({ x: 0.2, y: 0.8, scale: 0.6 });
    expect(project.audio.narration.path).toBe('C:/media/n.wav');
    expect(project.timeline[0].zoom).toEqual({ type: 'panLeft', intensity: 0.3 });
    expect(project.timeline[0].transition).toEqual({ type: 'circle' });
    expect(project.config.extras.badge.enabled).toBe(false);
    expect(project.renderOptions.zoomType).toBe('pulse');
    expect(project.timelineOptions.adjustToAudio).toBe(true);
  });

  test('migrateProject fills containers and stamps the version', () => {
    const migrated = migrateProject({ images: undefined });
    expect(migrated.version).toBe(CURRENT_PROJECT_VERSION);
    expect(migrated.images).toEqual([]);
    expect(migrated.timeline).toEqual([]);
    expect(migrated.audio).toEqual({});
    expect(migrated.script).toEqual({ raw: '' });
  });

  test('a project without an explicit version is treated as version 1', () => {
    const raw = baseProject();
    delete raw.version;
    const project = parseProjectFile(raw);
    expect(project.version).toBe(CURRENT_PROJECT_VERSION);
  });

  test('defaults are applied when the file omits optional sections', () => {
    const project = parseProjectFile({ images: [], timeline: [] });
    expect(project.audio.narration).toBeUndefined();
    expect(project.script.raw).toBe('');
    expect(project.renderOptions.zoomType).toBe('kenburns');
    expect(project.config.outputs).toEqual(['16:9']);
  });

  test('collectProjectPaths gathers images and audio paths', () => {
    const project = parseProjectFile(baseProject({
      audio: { narration: { name: 'n.wav', path: 'C:/media/n.wav' }, music: { name: 'm.mp3', path: 'C:/media/m.mp3' } }
    }));
    expect(collectProjectPaths(project)).toEqual(['C:/media/a.png', 'C:/media/n.wav', 'C:/media/m.mp3']);
  });

  test('invalid project data is rejected', () => {
    expect(() => parseProjectFile({ timeline: [{ number: 1, duration: -3 }] })).toThrow();
    expect(() => parseProjectFile({ config: { extras: { badge: { position: 'middle' } } } })).toThrow();
    expect(() => parseProjectFile(null)).toThrow();
  });
});
