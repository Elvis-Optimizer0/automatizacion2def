const { test, expect } = require('@playwright/test');
const {
  OUTPUT_IDS,
  resolveOutputConfig,
  assertOutputConfig,
  withOutputSuffix,
  E_OUTPUT_CONFIG_MISSING
} = require('../../app/core/output-formats.js');
const {
  buildSceneVideoFilter,
  buildVideoFilterGraph,
  clampScale
} = require('../../app/core/ffmpeg-helpers.js');
const {
  configSchema,
  imageSchema,
  renderPayloadSchema,
  parseRenderPayload,
  imageFocus
} = require('../../app/core/project-schema.js');

const scene = { number: 1, duration: 5 };

const focusScene = (focus) => ({ ...scene, focus });

const FORMAT_DIMENSIONS = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350]
};

test.describe('output formats', () => {
  test('exposes the four supported ids', () => {
    expect(OUTPUT_IDS).toEqual(['16:9', '9:16', '1:1', '4:5']);
  });

  test('resolves correct dimensions per format', () => {
    for (const id of OUTPUT_IDS) {
      const [w, h] = FORMAT_DIMENSIONS[id];
      const config = resolveOutputConfig(id);
      expect(config.w).toBe(w);
      expect(config.h).toBe(h);
      expect(config.id).toBe(id);
    }
  });

  test('filtergraph uses the format dimensions', () => {
    for (const id of OUTPUT_IDS) {
      const [w, h] = FORMAT_DIMENSIONS[id];
      const filter = buildSceneVideoFilter(scene, 0, {
        outputConfig: resolveOutputConfig(id),
        zoomEnabled: false
      });
      expect(filter).toContain(`scale=${w}:${h}:force_original_aspect_ratio=increase`);
      expect(filter).toContain(`crop=${w}:${h}`);
    }
  });

  test('guard throws E_OUTPUT_CONFIG_MISSING when config missing', () => {
    expect(() => buildSceneVideoFilter(scene, 0, { zoomEnabled: false })).toThrow(/E_OUTPUT_CONFIG_MISSING/);
    expect(() => buildVideoFilterGraph([scene], { zoomEnabled: false })).toThrow(/E_OUTPUT_CONFIG_MISSING/);
    expect(() => assertOutputConfig(null)).toThrow(E_OUTPUT_CONFIG_MISSING);
    expect(() => resolveOutputConfig('nope')).toThrow(E_OUTPUT_CONFIG_MISSING);
  });

  test('withOutputSuffix adds suffix only for non-default formats', () => {
    expect(withOutputSuffix('C:\\v\\video.mp4', resolveOutputConfig('16:9'))).toBe('C:\\v\\video.mp4');
    expect(withOutputSuffix('C:\\v\\video.mp4', resolveOutputConfig('9:16'))).toBe('C:\\v\\video_9x16.mp4');
    expect(withOutputSuffix('C:\\v\\video.mp4', resolveOutputConfig('1:1'))).toBe('C:\\v\\video_1x1.mp4');
    expect(withOutputSuffix('C:\\v\\video.mp4', resolveOutputConfig('4:5'))).toBe('C:\\v\\video_4x5.mp4');
  });
});

test.describe('fit modes', () => {
  const outputConfig = resolveOutputConfig('9:16');

  test('cover fills the frame with a focus-driven crop', () => {
    const filter = buildSceneVideoFilter(scene, 0, { outputConfig, fitMode: 'cover', zoomEnabled: false });
    expect(filter).toContain('force_original_aspect_ratio=increase');
    expect(filter).toContain('crop=1080:1920');
  });

  test('crop differs with focus (0.2,0.8) vs (0.5,0.5)', () => {
    const a = buildSceneVideoFilter(focusScene({ x: 0.2, y: 0.8 }), 0, { outputConfig, fitMode: 'cover', zoomEnabled: false });
    const b = buildSceneVideoFilter(focusScene({ x: 0.5, y: 0.5 }), 0, { outputConfig, fitMode: 'cover', zoomEnabled: false });
    expect(a).not.toBe(b);
    expect(a).toContain('(iw-ow)*0.2');
    expect(a).toContain('(ih-oh)*0.8');
    expect(b).toContain('(iw-ow)*0.5');
    expect(b).toContain('(ih-oh)*0.5');
  });

  test('frame mode pads to the format with the chosen color', () => {
    const filter = buildSceneVideoFilter(scene, 0, {
      outputConfig,
      fitMode: 'frame',
      frameColor: '#123456',
      zoomEnabled: false
    });
    expect(filter).toContain('scale=1080:-2');
    expect(filter).toContain('pad=1080:1920:0:');
    expect(filter).toContain('color=#123456');
  });

  test('frame mode rejects unsafe colors', () => {
    const filter = buildSceneVideoFilter(scene, 0, {
      outputConfig,
      fitMode: 'frame',
      frameColor: 'red;evil',
      zoomEnabled: false
    });
    expect(filter).toContain('color=black');
    expect(filter).not.toContain('evil');
  });

  test('blur mode splits the image into blurred background plus contained foreground', () => {
    const filter = buildSceneVideoFilter(scene, 0, { outputConfig, fitMode: 'blur', zoomEnabled: false });
    expect(filter).toContain('split=2');
    expect(filter).toContain('boxblur=luma_radius=');
    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain('overlay=(W-w)/2:(H-h)/2');
  });

  test('every mode and format avoids paths and backslashes', () => {
    for (const id of OUTPUT_IDS) {
      for (const fitMode of ['cover', 'blur', 'frame']) {
        const graph = buildVideoFilterGraph([scene, { number: 2, duration: 4 }], {
          outputConfig: resolveOutputConfig(id),
          fitMode,
          zoomEnabled: true
        });
        expect(graph).not.toContain('\\');
        expect(graph).not.toMatch(/[A-Za-z]:\\/);
        expect(graph).not.toMatch(/\.(png|jpg|wav|mp4)/);
      }
    }
  });
});

test.describe('focus in zoom', () => {
  test('zoompan pans toward the focus point', () => {
    const filter = buildSceneVideoFilter(focusScene({ x: 0.2, y: 0.8 }), 0, {
      outputConfig: resolveOutputConfig('9:16'),
      fitMode: 'cover',
      zoomEnabled: true,
      zoomStartScale: 1.0,
      zoomIntensity: 0.15
    });
    expect(filter).toContain('zoompan=');
    expect(filter).toContain('iw*0.2');
    expect(filter).toContain('ih*0.8');
  });
});

test.describe('zod project schema', () => {
  test('config.outputs defaults to [16:9]', () => {
    const parsed = configSchema.parse({});
    expect(parsed.outputs).toEqual(['16:9']);
    expect(parsed.fitMode).toBe('cover');
  });

  test('config.outputs keeps provided formats', () => {
    const parsed = configSchema.parse({ outputs: ['9:16', '1:1'] });
    expect(parsed.outputs).toEqual(['9:16', '1:1']);
  });

  test('image focus fields survive validation', () => {
    const parsed = imageSchema.parse({
      name: 'a.png',
      path: 'C:\\a.png',
      focus169: { x: 0.2, y: 0.8 }
    });
    expect(parsed.focus169).toEqual({ x: 0.2, y: 0.8, scale: 1 });
    expect(parsed.focus916).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  test('missing focus fields default to 0.5/0.5 and scale 1', () => {
    const parsed = imageSchema.parse({ name: 'a.png', path: 'C:\\a.png' });
    expect(parsed.focus169).toEqual({ x: 0.5, y: 0.5, scale: 1 });
    expect(parsed.focus45).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  test('scale survives validation and is clamped to 0.3..3', () => {
    const parsed = imageSchema.parse({
      name: 'a.png',
      path: 'C:\\a.png',
      focus169: { x: 0.1, y: 0.9, scale: 2.5 }
    });
    expect(parsed.focus169.scale).toBe(2.5);
    expect(() => imageSchema.parse({ name: 'a.png', path: 'C:\\a.png', focus169: { scale: 4 } })).toThrow();
    expect(() => imageSchema.parse({ name: 'a.png', path: 'C:\\a.png', focus169: { scale: 0.1 } })).toThrow();
  });

  test('focus would be dropped if not declared (regression guard)', () => {
    const parsed = imageSchema.parse({ name: 'a.png', path: 'C:\\a.png', unrelated: { x: 0.9 } });
    expect(parsed.unrelated).toBeUndefined();
    expect(parsed.focus11).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  test('payload validation keeps focus and outputs', () => {
    const payload = parseRenderPayload({
      scenes: [{ number: 1, duration: 2 }],
      images: [{ name: 'a.png', path: 'C:\\a.png', focus916: { x: 0.3, y: 0.7, scale: 0.6 } }],
      narration: { name: 'n.wav', path: 'C:\\n.wav' },
      outputPath: 'C:\\out.mp4',
      config: { outputs: ['9:16'], fitMode: 'blur' }
    });
    expect(payload.config.outputs).toEqual(['9:16']);
    expect(payload.config.fitMode).toBe('blur');
    expect(payload.images[0].focus916).toEqual({ x: 0.3, y: 0.7, scale: 0.6 });
    expect(payload.renderOptions.zoomEnabled).toBe(true);
  });

  test('renderPayloadSchema rejects empty scenes', () => {
    expect(() => renderPayloadSchema.parse({
      scenes: [],
      images: [{ name: 'a.png', path: 'C:\\a.png' }],
      narration: { name: 'n.wav', path: 'C:\\n.wav' },
      outputPath: 'C:\\out.mp4'
    })).toThrow();
  });

  test('imageFocus maps format id to the right key', () => {
    const image = { focus169: { x: 0.1, y: 0.2 }, focus916: { x: 0.3, y: 0.4, scale: 0.6 } };
    expect(imageFocus(image, '16:9')).toEqual({ x: 0.1, y: 0.2, scale: 1 });
    expect(imageFocus(image, '9:16')).toEqual({ x: 0.3, y: 0.4, scale: 0.6 });
    expect(imageFocus(image, '1:1')).toEqual({ x: 0.5, y: 0.5, scale: 1 });
  });

  test('imageFocus migrates phase 4 focus without scale to scale 1', () => {
    const image = { focus169: { x: 0.2, y: 0.8 } };
    expect(imageFocus(image, '16:9').scale).toBe(1);
  });
});

test.describe('manual framing (scale + background)', () => {
  const outputConfig = resolveOutputConfig('16:9');

  test('scale 1 reproduces the phase 4 filtergraph exactly', () => {
    const withScale = buildSceneVideoFilter({ ...scene, focus: { x: 0.5, y: 0.5, scale: 1 } }, 0, {
      outputConfig,
      fitMode: 'cover',
      zoomEnabled: false
    });
    const withoutScale = buildSceneVideoFilter({ ...scene, focus: { x: 0.5, y: 0.5 } }, 0, {
      outputConfig,
      fitMode: 'cover',
      zoomEnabled: false
    });
    const phase4 = '[0:v]scale=1920:1080:force_original_aspect_ratio=increase,'
      + 'crop=1920:1080:(iw-ow)*0.5:(ih-oh)*0.5[base0];[base0]setsar=1,format=yuv420p[v0]';
    expect(withScale).toBe(phase4);
    expect(withoutScale).toBe(phase4);
  });

  test('scale < 1 pads with the chosen background color', () => {
    const filter = buildSceneVideoFilter({ ...scene, focus: { x: 0.2, y: 0.8, scale: 0.6 } }, 0, {
      outputConfig,
      backgroundMode: 'color',
      backgroundColor: '#123456',
      zoomEnabled: false
    });
    expect(filter).toContain('scale=1152:648:force_original_aspect_ratio=increase');
    expect(filter).toContain('pad=');
    expect(filter).toContain('color=#123456');
    expect(filter).toContain('crop=1920:1080');
    expect(filter).not.toContain('\\');
    expect(filter).not.toMatch(/[A-Za-z]:\\/);
  });

  test('scale < 1 rejects unsafe background colors', () => {
    const filter = buildSceneVideoFilter({ ...scene, focus: { x: 0.5, y: 0.5, scale: 0.6 } }, 0, {
      outputConfig,
      backgroundMode: 'color',
      backgroundColor: 'red;evil',
      zoomEnabled: false
    });
    expect(filter).toContain('color=black');
    expect(filter).not.toContain('evil');
  });

  test('scale < 1 with blur background splits and blurs a cover copy', () => {
    const filter = buildSceneVideoFilter({ ...scene, focus: { x: 0.5, y: 0.5, scale: 0.6 } }, 0, {
      outputConfig,
      backgroundMode: 'blur',
      zoomEnabled: false
    });
    expect(filter).toContain('split=2');
    expect(filter).toContain('boxblur=luma_radius=');
    expect(filter).toContain('overlay=x=');
    expect(filter).not.toContain('\\');
  });

  test('scale > 1 crops a smaller region (target scaled by the factor)', () => {
    const filter = buildSceneVideoFilter({ ...scene, focus: { x: 0.2, y: 0.8, scale: 1.5 } }, 0, {
      outputConfig,
      zoomEnabled: false
    });
    expect(filter).toContain('scale=2880:1620:force_original_aspect_ratio=increase');
    expect(filter).toContain('crop=1920:1080:(iw-ow)*0.2:(ih-oh)*0.8');
    expect(filter).not.toContain('pad=');
  });

  test('focus and scale combine in the crop expressions', () => {
    const filter = buildSceneVideoFilter({ ...scene, focus: { x: 0.7, y: 0.3, scale: 2 } }, 0, {
      outputConfig,
      zoomEnabled: false
    });
    expect(filter).toContain('scale=3840:2160');
    expect(filter).toContain('(iw-ow)*0.7');
    expect(filter).toContain('(ih-oh)*0.3');
  });

  test('animated zoom composes on top of the scaled-out canvas (no new source edges)', () => {
    const graph = buildVideoFilterGraph([focusScene({ x: 0.5, y: 0.5, scale: 0.6 })], {
      outputConfig,
      backgroundMode: 'color',
      backgroundColor: '#112233',
      zoomEnabled: true,
      zoomType: 'kenburns'
    });
    expect(graph).toContain('pad=');
    expect(graph).toContain('color=#112233');
    // zoompan is applied on the upscaled stream [up0], after pre-upscale with bilinear
    expect(graph).toContain('[base0]scale=2880:1620:flags=bilinear[up0]');
    expect(graph).toContain('[up0]zoompan=');
    const upIndex = graph.indexOf('[base0]scale=2880:1620:flags=bilinear[up0]');
    const zoomIndex = graph.indexOf('[up0]zoompan=');
    expect(upIndex).toBeGreaterThan(-1);
    expect(zoomIndex).toBeGreaterThan(upIndex);
    expect(graph).not.toMatch(/\[1:v\]/);
    // Final downscale with lanczos to target resolution and yuv420p
    expect(graph).toContain('[zoomed0]scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[v0]');
  });

  test('animated zoom composes on top of the cropped canvas when scale > 1', () => {
    const graph = buildVideoFilterGraph([focusScene({ x: 0.2, y: 0.8, scale: 1.5 })], {
      outputConfig,
      zoomEnabled: true,
      zoomType: 'kenburns'
    });
    expect(graph).toContain('crop=1920:1080:(iw-ow)*0.2:(ih-oh)*0.8');
    // zoompan is applied on the upscaled stream [up0], after pre-upscale with bilinear
    expect(graph).toContain('[base0]scale=2880:1620:flags=bilinear[up0]');
    expect(graph).toContain('[up0]zoompan=');
    const upIndex = graph.indexOf('[base0]scale=2880:1620:flags=bilinear[up0]');
    const zoomIndex = graph.indexOf('[up0]zoompan=');
    expect(upIndex).toBeGreaterThan(-1);
    expect(zoomIndex).toBeGreaterThan(upIndex);
    expect(graph).not.toMatch(/\[1:v\]/);
    // Final downscale with lanczos to target resolution and yuv420p
    expect(graph).toContain('[zoomed0]scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[v0]');
  });

  test('clampScale keeps values inside 0.3..3 and defaults invalid to 1', () => {
    expect(clampScale(0.1)).toBe(0.3);
    expect(clampScale(5)).toBe(3);
    expect(clampScale(1.75)).toBe(1.75);
    expect(clampScale(undefined)).toBe(1);
    expect(clampScale(NaN)).toBe(1);
  });

  test('every format and background avoids paths and backslashes', () => {
    for (const id of OUTPUT_IDS) {
      for (const scale of [0.4, 1, 2.2]) {
        for (const backgroundMode of ['color', 'blur']) {
          const graph = buildVideoFilterGraph([{ ...scene, focus: { x: 0.3, y: 0.6, scale } }], {
            outputConfig: resolveOutputConfig(id),
            backgroundMode,
            backgroundColor: '#010203',
            zoomEnabled: true
          });
          expect(graph).not.toContain('\\');
          expect(graph).not.toMatch(/[A-Za-z]:\\/);
          expect(graph).not.toMatch(/\.(png|jpg|wav|mp4)/);
        }
      }
    }
  });
});
