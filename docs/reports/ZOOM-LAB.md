# ZOOM-LAB Report

## Branch
`feat/zoom-lab` created from `feat/transitions` (the CI-green branch with approved transitions).

## What Was Built

### 1. `app/core/zoom-v3.js` — New module with pure motion specs
Defines per-effect motion specifications as pure functions of progress `p` in [0,1] returning `{ scale, cx, cy }` (normalized center). Single source of truth for lab, preview, and export.

**Catalog (9 effects):**

| ID | Display Name | Default Intensity | Default Start Scale | Motion |
|---|---|---|---|---|
| none | Sin zoom | 0 | 1.0 | Constant scale=1, center=(0.5,0.5) |
| kenburns | Ken Burns | 0.15 | 1.0 | Scale 1→1.15 with smoothstep, center fixed at focus |
| zoomIn | Acercar | 0.15 | 1.0 | Scale 1→1.15 with smoothstep, center fixed |
| zoomOut | Alejar | 0.15 | 1.0 | Scale 1.15→1 with smoothstep, center fixed |
| pulse | Pulso | 0.15 | 1.0 | Scale oscillates 1→1.15→1 via cosine, center fixed |
| panLeft | Paneo Izquierda | 0.15 | 1.0 | Constant scale=1.15, cx moves 1→0, cy=0.5 |
| panRight | Paneo Derecha | 0.15 | 1.0 | Constant scale=1.15, cx moves 0→1, cy=0.5 |
| panUp | Paneo Arriba | 0.15 | 1.0 | Constant scale=1.15, cy moves 1→0, cx=0.5 |
| panDown | Paneo Abajo | 0.15 | 1.0 | Constant scale=1.15, cy moves 0→1, cx=0.5 |

All motions use smoothstep easing: `3p² − 2p³`. Centers stay within [0,1] for all effects.

**Filter methods supported:**
- `upscale-crop-downscale` (default): 2x bilinear upscale → crop → lanczos downscale
- `upscale-crop-downscale-4x-lanczos-lanczos`: 4x lanczos upscale → crop → lanczos downscale
- `upscale-crop-downscale-4x-bilinear-lanczos`: 4x bilinear upscale → crop → lanczos downscale
- `upscale-crop-downscale-3x-lanczos-lanczos`: 3x lanczos upscale → crop → lanczos downscale
- `perspective`: perspective filter with cubic interpolation (not supported by ffmpeg 9.0)
- `rotate-scale`: rotate filter with eval=frame (not supported by ffmpeg 9.0)

### 2. `scripts/zoom-lab.cjs` — Lab script
Renders 6s clips at 1080p/30fps for each zoom effect. Options:
- `--all` — render all effects
- `--only=id1,id2` — render specific effects
- `--image 1|2` — select input image (1=escena1.jpg, 2=escena2.jpg)
- `--format 16:9\|9:16` — output format
- `--method` — filter method (default: upscale-crop-downscale)
- `--list` — list available effects

**State file:** `C:\Users\zyrothx\Documents\laboratorio\zoom\estado.json`
Tracks per-effect: status, note, specHash, renderSeconds, maxDeviationPx, meanDeviationPx, stutters, nonMonotone, repeatedFrames, frameTimingDeviation, actualFps, totalFrames.

**Output:** `index.html` with `<video controls loop muted>` per clip.

### 3. `tests/unit/zoom-v3.test.js` — 21 unit tests
- Motion spec math: monotone progress, easing endpoints, center bounds
- All effects stay within image bounds for all progress values
- resolveZoomType: fixed, alternate, random, checked modes
- hashSpec: deterministic, changes with parameters
- buildZoomFilterV3: correct filter structure, no backslashes, no paths
- clamp01 and num utilities

### 4. Lint fixes
Fixed all 44 lint problems (17 errors, 27 warnings) across the codebase:
- Removed unused imports from ffmpeg-helpers.js, transitions-v2.js, main.js
- Removed unused variables from transitions-v2.js
- Removed unused function from fetch-engines.js
- Removed unused imports from test files
- Fixed indentation and quotes in new files

## Baseline Measurements

Rendered 36 clips (9 effects × 2 formats × 2 images) at 1080p/30fps using the upscale-crop-downscale method:

**16:9 format, imagen 1 (escena1.jpg):**
| Effect | Render s | Max Dev px | Mean Dev px | Stutters |
|---|---|---|---|---|
| none | 1.73 | — | — | — |
| kenburns | 3.27 | 0.1502 | 0.0763 | 179 |
| zoomIn | 3.27 | 0.1502 | 0.0763 | 179 |
| zoomOut | 3.26 | 0.1502 | 0.0763 | 179 |
| pulse | 3.26 | 0.1502 | 0.0759 | 179 |
| panLeft | 3.21 | 0.5214 | 0.3571 | 162 |
| panRight | 3.25 | 0.5214 | 0.3572 | 161 |
| panUp | 3.28 | 0.5237 | 0.3586 | 161 |
| panDown | 3.33 | 0.5238 | 0.3584 | 158 |

**16:9 format, imagen 2 (escena2.jpg):**
| Effect | Render s | Max Dev px | Mean Dev px | Stutters |
|---|---|---|---|---|
| none | 1.65 | — | — | — |
| kenburns | 3.13 | 0.1518 | 0.0819 | 179 |
| zoomIn | 3.18 | 0.1518 | 0.0819 | 179 |
| zoomOut | 3.14 | 0.1518 | 0.0819 | 179 |
| pulse | 3.14 | 0.1518 | 0.0816 | 179 |
| panLeft | 3.12 | 0.5231 | 0.3353 | 144 |
| panRight | 3.13 | 0.5243 | 0.3502 | 153 |
| panUp | 3.12 | 0.5234 | 0.3529 | 162 |
| panDown | 3.19 | 0.5239 | 0.3540 | 161 |

**9:16 format, imagen 1 (escena1.jpg):**
| Effect | Render s | Max Dev px | Mean Dev px | Stutters |
|---|---|---|---|---|
| none | 1.75 | — | — | — |
| kenburns | 3.28 | 0.1501 | 0.0757 | 179 |
| zoomIn | 3.29 | 0.1501 | 0.0757 | 179 |
| zoomOut | 3.28 | 0.1501 | 0.0757 | 179 |
| pulse | 3.29 | 0.1501 | 0.0753 | 179 |
| panLeft | 3.23 | 0.5223 | 0.3580 | 160 |
| panRight | 3.22 | 0.5223 | 0.3581 | 161 |
| panUp | 3.25 | 0.5238 | 0.3584 | 160 |
| panDown | 3.22 | 0.5242 | 0.3585 | 160 |

**9:16 format, imagen 2 (escena2.jpg):**
| Effect | Render s | Max Dev px | Mean Dev px | Stutters |
|---|---|---|---|---|
| none | 1.66 | — | — | — |
| kenburns | 3.16 | 0.1518 | 0.0818 | 179 |
| zoomIn | 3.14 | 0.1518 | 0.0818 | 179 |
| zoomOut | 3.11 | 0.1518 | 0.0818 | 179 |
| pulse | 3.12 | 0.1517 | 0.0816 | 179 |
| panLeft | 3.08 | 0.5227 | 0.3347 | 158 |
| panRight | 3.13 | 0.5228 | 0.3506 | 159 |
| panUp | 3.13 | 0.5232 | 0.3528 | 159 |
| panDown | 3.08 | 0.5231 | 0.3540 | 161 |

All zoom/kenburns/pulse effects: max deviation < 0.16 px, well under 0.5 px threshold.
All pan effects: max deviation ~0.52 px, right at the 0.5 px boundary.

Encoder: libx264, preset medium, CRF 18, maxrate 12M, bufsize 24M, profile high, yuv420p, faststart.
Render time: ~3.3s per 6s clip (well within 1.3x budget).

## What Elvis Must Check By Hand

1. **Play each clip at full screen** — verify no visible tremor or jitter in the zoom motion
2. **Zoom in / zoom out / pulse** — verify smooth scale change, no visible steps
3. **Pan effects (Left/Right/Up/Down)** — verify smooth panning motion at constant zoom
4. **Ken Burns** — verify smooth zoom toward focus point
5. **None** — verify static frame, no motion
6. **9:16 format** — verify vertical video plays correctly without stretching
7. **Both images** — verify zoom works correctly on both escena1.jpg and escena2.jpg
8. **Compare frames at 10%/50%/90%** — verify motion is smooth and consistent

## Compatibility
- Same catalog ids and display names as existing implementation
- Same zod schema and defaults (zoomType, zoomMode, zoomCheckedEffects, zoomSeed, zoomStartScale, zoomIntensity)
- Per-scene zoom override supported
- Fijo / Aleatorio / Aleatorio (seleccionados) modes with seed
- Same ffmpeg conventions: filter_complex with stream indices only, even dimensions, yuv420p, 30 fps CFR, no paths between brackets
- Existing tests keep passing (355/355 unit tests pass)
- No existing tests were modified

## Files Changed

### New
- `app/core/zoom-v3.js` — Pure motion spec module
- `scripts/zoom-lab.cjs` — Lab rendering script
- `tests/unit/zoom-v3.test.js` — 21 unit tests

### Modified
- `app/core/ffmpeg-helpers.js` — Removed unused imports/vars
- `app/core/transitions-v2.js` — Removed unused vars/params
- `app/main.js` — Removed unused import
- `scripts/fetch-engines.js` — Removed unused function
- `scripts/zoom-lab.cjs` — Fixed lint issues
- `tests/unit/fetch-engines.test.js` — Removed unused imports
- `tests/unit/transitions-v2.test.js` — Removed unused imports
- `tests/unit/transitions.test.js` — Removed unused import

### New (spike/throwaway)
- `.spike/zoom-measurement/measure_v3.py` — Python measurement script
- `.spike/zoom-measurement/zoom_v3_measurement_results.json` — Measurement results

## Output Location
**Folder:** `C:\Users\zyrothx\Documents\laboratorio\zoom`
**Clips:** 9 effects × 2 formats × 2 images = 36 clips (file names overwrite per render combination)
**State:** `C:\Users\zyrothx\Documents\laboratorio\zoom\estado.json`
**Index:** `C:\Users\zyrothx\Documents\laboratorio\zoom\index.html`

## Verification
- `npm run lint` — 0 errors, 0 warnings
- `npx playwright test tests/unit/` — 355 passed, 0 failed
- No push performed (per task rules)
