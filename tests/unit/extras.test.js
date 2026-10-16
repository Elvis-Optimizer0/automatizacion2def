const { test, expect } = require('@playwright/test');
const {
  buildExtrasFilter,
  buildFullFilterGraph,
  hasExtras,
  escapeDrawtext,
  escapeFilterPath,
  calculateTotalDuration
} = require('../../app/core/ffmpeg-helpers.js');
const { parseRenderPayload } = require('../../app/core/project-schema.js');
const { resolveOutputConfig } = require('../../app/core/output-formats.js');

const outputConfig = resolveOutputConfig('16:9');
const fontPath = '/tmp/fonts/DejaVuSans-Bold.ttf';

test.describe('extras (badge, lower third, progress bar)', () => {
  test('hasExtras detects any enabled extra with content', () => {
    expect(hasExtras(undefined)).toBe(false);
    expect(hasExtras({})).toBe(false);
    expect(hasExtras({ badge: { enabled: true, text: '' } })).toBe(false);
    expect(hasExtras({ badge: { enabled: true, text: 'Hola' } })).toBe(true);
    expect(hasExtras({ lowerThird: { enabled: true, text: 'Ana' } })).toBe(true);
    expect(hasExtras({ progressBar: { enabled: true } })).toBe(true);
  });

  test('escapeDrawtext escapes special drawtext characters', () => {
    expect(escapeDrawtext('50%: \'a\'\\b')).toBe('50\\%\\: \\\'a\\\'\\\\b');
  });

  test('escapeFilterPath converts windows paths to ffmpeg form', () => {
    expect(escapeFilterPath('C:\\app\\assets\\fonts\\F.ttf')).toBe('C\\:/app/assets/fonts/F.ttf');
  });

  test('badge, lower third and progress bar produce drawtext and drawbox filters', () => {
    const extras = {
      badge: { enabled: true, text: 'OFERTA', position: 'topRight', animation: 'fade' },
      lowerThird: { enabled: true, text: 'Ana Lopez', opacity: 0.5 },
      progressBar: { enabled: true, color: '#00ff00', height: 12 }
    };
    const filter = buildExtrasFilter({ extras, outputConfig, totalDuration: 6, fontPath, inputLabel: 'vpre', outputLabel: 'vout' });
    expect(filter.startsWith('[vpre]')).toBe(true);
    expect(filter.endsWith('[vout]')).toBe(true);
    expect(filter).toContain('drawtext=');
    expect(filter).toContain('text=\'OFERTA\'');
    expect(filter).toContain('text=\'Ana Lopez\'');
    expect(filter).toContain('alpha=\'min(1,t/1)\'');
    expect(filter).toContain('boxcolor=black@0.5');
    expect(filter).toContain('drawbox=x=0:y=1080-12:w=\'iw*min(1,t/6)\':h=12:color=0x00ff00');
    expect(filter).toContain(`fontfile='${fontPath}'`);
    expect(filter).not.toMatch(/[A-Za-z]:\\/);
  });

  test('animation variants change the badge expression', () => {
    const base = { enabled: true, text: 'X', position: 'topLeft' };
    const pulse = buildExtrasFilter({ extras: { badge: { ...base, animation: 'pulse' } }, outputConfig, totalDuration: 3, fontPath });
    const slide = buildExtrasFilter({ extras: { badge: { ...base, animation: 'slide' } }, outputConfig, totalDuration: 3, fontPath });
    const none = buildExtrasFilter({ extras: { badge: { ...base, animation: 'none' } }, outputConfig, totalDuration: 3, fontPath });
    expect(pulse).toContain('sin(2*PI*t)');
    expect(slide).toContain('(1-min(1,t/0.6))');
    expect(none).not.toContain('alpha=');
  });

  test('buildFullFilterGraph inserts extras between the video join and [vout]', () => {
    const scenes = [{ number: 1, duration: 3 }, { number: 2, duration: 3 }];
    const base = {
      outputConfig,
      fitMode: 'cover',
      zoomEnabled: false,
      transitionType: 'fade',
      transitionDuration: 1,
      hasMusic: false,
      totalDuration: calculateTotalDuration(scenes)
    };
    const without = buildFullFilterGraph(scenes, base);
    expect(without).toContain('copy[vout]');
    expect(without).not.toContain('drawtext');
    expect(without).not.toContain('vmain');

    const withExtras = buildFullFilterGraph(scenes, {
      ...base,
      fontPath,
      extras: { progressBar: { enabled: true, color: '#ff0000', height: 8 } }
    });
    expect(withExtras).toContain('copy[vmain]');
    expect(withExtras).toContain('[vmain]');
    expect(withExtras).toContain('drawbox=');
    expect(withExtras).toContain('[vout]');
    expect(withExtras.indexOf('[vmain]')).toBeLessThan(withExtras.lastIndexOf('[vout]'));
  });

  test('extras defaults and validation via the schema', () => {
    const payload = parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: {
        extras: {
          badge: { enabled: true, text: 'Hola', position: 'bottomLeft', animation: 'slide' },
          progressBar: { enabled: true, color: '#123456', height: 20 }
        }
      },
      renderOptions: {}
    });
    expect(payload.config.extras.badge).toEqual({ enabled: true, text: 'Hola', position: 'bottomLeft', animation: 'slide' });
    expect(payload.config.extras.lowerThird).toEqual({ enabled: false, text: '', opacity: 0.6 });
    expect(payload.config.extras.progressBar).toEqual({ enabled: true, color: '#123456', height: 20 });
  });

  test('invalid extras values are rejected by the schema', () => {
    const make = (extras) => () => parseRenderPayload({
      scenes: [{ number: 1, duration: 4 }],
      images: [{ name: 'a.png', path: 'C:/tmp/a.png' }],
      narration: { name: 'n.wav', path: 'C:/tmp/n.wav' },
      outputPath: 'C:/tmp/out.mp4',
      config: { extras },
      renderOptions: {}
    });
    expect(make({ badge: { position: 'middle' } })).toThrow();
    expect(make({ badge: { animation: 'fly' } })).toThrow();
    expect(make({ progressBar: { color: 'red' } })).toThrow();
    expect(make({ progressBar: { height: 0 } })).toThrow();
  });
});
