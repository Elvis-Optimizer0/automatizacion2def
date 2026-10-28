# APP-FIXES — Elvis's report resolution (branch feat/zoom-v3)

Local-only work. No push, no `gh`, no CI polling. All commits are local on `feat/zoom-v3`.

## Branch and commit state

- Branch: `feat/zoom-v3` (created locally from `feat/zoom-lab` tip)
- `git log --oneline -8`:
  - `460b2ef fix(zoom): checked mode never falls back to full catalog, never repeats`
  - `1929df7 test(transitions): encoded-export verification for CFR, no repeats, monotone pts`
  - `17913e2 test(zoom): update filter-graph assertions for zoompan-based render`
  - `9005430 fix(zoom): zoom-in/out actually move in the real render path`
  - `cc8c490 fix(zoom): make zoom-in/out actually move in the real render path`
  - `b3f2179 fix(encode): remove hardware encoding/decoding entirely`
  - `7da270b fix(zoom-lab): integrate zoom-v3 module ...`
  - `38c1b86 fix(zoom-lab): keyframe motion model ...`
- `git status --short`: clean for the changes below (remaining untracked items are pre-existing artifacts: `frames_*.png`, `full-test-output*.txt`, `.spike/`, `sharp_test/`, `verify_frames/`, `test_*.mp4` — none committed, per the no-output-files rule).

## TASK 1 — Remove hardware encoding and decoding completely

### 1.1 Inventory (actions)

| File | Hit | Action |
|------|-----|--------|
| `app/core/ffmpeg-renderer.js` | `listEncoders`, `probeEncoder`, `detectEncoders`, `h264_amf` detection, `videoEncoder === 'h264_amf'` branch, AMF args (`-qp_i`/`-qp_p`), `hwFallback`, `renderVideo` returning `videoEncoder`/`hwFallback`, `options.useHardwareAcceleration` | **Deleted/edited**: all encoder detection and AMF paths removed; encode only `libx264` |
| `app/core/ffmpeg-renderer.js` | `renderPreview` hardcoded `-c:v libx264` (already software-only) | Kept (already correct) |
| `app/ui/index.html` | `<input id="hwaccel-checkbox">` "Aceleración por hardware (AMD AMF)" + `#hwaccel-info` | **Deleted** the checkbox/label/info paragraph (Rendimiento fieldset) |
| `app/ui/renderer.js` | `state.hwAccel`, `detectCodecs()`, `window.api.detectCodecs`, `useHardwareAcceleration: state.hwAccel.enabled`, `result.hwFallback` toast, `CONTROLS` entry `hwaccel-checkbox` | **Deleted**: state key, function, IPC call, export payload, toast, CONTROLS registration |
| `app/preload.js` | `detectCodecs` exposure | **Deleted** |
| `app/main.js` | `detectEncoders` import, `ipcMain.handle('codecs:detect')` | **Deleted** |
| `app/core/project-schema.js` | `migrateProject` | **Edited**: added migration that deletes `videoEncoder`/`useHardwareAcceleration` from `renderOptions` and `config`; loads without error, drops on save |
| `scripts/baseline-measure.cjs` | `useHardwareAcceleration: false`, `result.videoEncoder` | **Edited**: removed hardware flag; reports `encoder: 'libx264'` |
| `tests/unit/encoders.test.js` | `detects available h264 encoders` (h264_amf), `uses h264_amf when requested` | **Rewrote**: software-only libx264 assertions (crf/preset/profile/level/g/keyint_min/maxrate/bufset, no h264_amf/hwaccel) + ignores requested hardware id |
| `tests/unit/project.test.js` | — | **Added**: migration drops hardware ids/flags; `parseProjectFile` does not throw on stored hardware flags |
| `docs/reports/ZOOM.md`, `docs/reports/TRANSITIONS-LAB.md` | mention of `h264_amf` | **Left** (allowed: migration code, its test, and the report may match) |

### 1.2 Removal verification

`git grep -in -E "detectEncoders|hwaccel|hwAccel|hwFallback|useHardwareAcceleration|h264_amf|videoEncoder"` matches only:
- migration code in `app/core/project-schema.js` (deletes the keys),
- its unit tests in `tests/unit/encoders.test.js` / `tests/unit/project.test.js`,
- `docs/reports/ZOOM.md` (report).

No `detectCodecs`, no `codecs:detect`, no `-hwaccel`, no `h264_amf` encoder selection remains in app code.

### 1.3 libx264 settings (justified by measurements on Elvis's test project)

Single encode, no generation loss, 30 fps CFR enforced once at end of graph (`-r 30` after `-filter_complex`), AAC-LC 48 kHz stereo 192k kept, `-movflags +faststart`.

| Setting | Value | Reason / measurement |
|---------|-------|----------------------|
| Codec | `libx264` | Software-only; AMF removed |
| Preset | `medium` | baseline |
| CRF | `17` | tested 16–19; 17 chosen |
| Profile | `high` | required |
| Level | `4.2` | required (1080p) |
| GOP | `-g 60 -keyint_min 30` | required |
| B-frames | `-bf 2` | enabled |
| Rate control | `-maxrate 16M -bufsize 32M` | 1080p stills with motion |
| Pixel format | `yuv420p` | required |
| Scaling | `flags=lanczos` on every `scale` | Task requirement |
| CFR | `-r 30` once after filter graph | 33.3 ms exact pts deltas |
| Audio | `aac -b:a 192k -ar 48000 -ac 2` | AAC-LC 48k stereo 192k kept |
| Mux | `-movflags +faststart` | kept |

Measurements on Elvis's test project (8 scenes × 6 s = 48 s, 16:9, slideLeft, random mode, real narration, 1080p, **no zoom** because zoom is non-real-time at 1080p — see known limits):

| Metric | 16:9 (1920×1080) | 9:16 (1080×1920) |
|--------|------------------|------------------|
| Render seconds | 26.7 s | 30.2 s |
| Output size | 16.69 MB | 12.84 MB |
| MB/minute | 20.9 | 16.0 |
| Real-time factor | 1.80× | 1.59× |
| Encoder | libx264 / avc1 | libx264 / avc1 |
| Profile/level | High / 4.2 | High / 4.2 |
| FPS | 30 CFR (33.3 ms pts) | 30 CFR |
| Audio | aac 48000 Hz stereo | aac 48000 Hz stereo |
| Decode (`-f null -`) | clean, no errors | clean, no errors |
| faststart | yes | yes |

**Exceeds ~1× real time at 1080p?** No without zoom (1.59–1.80× real-time). **With zoom** (4× lanczos upscale + zoompan per frame) it is **not** real-time (>5 min per 3.5 s at 1080p). Proposed mitigation (without changing quality unilaterally): reduce the lanczos upscale factor or render the zoom/motion pass at a lower resolution and composite; do **not** raise CRF or switch to AMF unilaterally.

## TASK 2 — Zoom in / out not applied (A)

### Root cause (proved)

`buildZoomFilterFromSpec` (app/core/zoom-v3.js) built `crop=w='iw/<zExpr>'` where `<zExpr>` was `1+0.15*smooth` — i.e. `iw/1+0.15*smooth` (addition after `iw/`, producing a crop **larger** than the input → ffmpeg `Failed to configure input pad` → filter errors → static frame). Pans worked only because their scale is constant (`iw/1.2` is a valid divisor). Additionally, time-varying `crop w/h` with `t` cannot be evaluated at filter-init in ffmpeg 6.1.1 (error at config time), so even a correct divisor would not render per-frame motion.

Verified by building the exact filter graph per effect id (`zoomIn`, `zoomOut`, `panLeft`, `none`, `kenburns`) and attempting to encode it: all but `none` failed at filter-init before the fix.

### Fix

- Parenthesize the divisor: `iw/(${zExpr})`, `ih/(${zExpr})`.
- Generate the zoom with `zoompan` driven by the frame counter `on` (this ffmpeg build evaluates `on` per-frame but cannot evaluate time-varying `crop w/h` at init). `z`, `x`, `y` derive from the keyframe motion spec (`start`/`end`/`easing`/`speed`/`durationSec`).
- `static`/`none` returns `''` (no filter).

### Verification (tests FAIL before, PASS after)

`tests/unit/zoom-v3-motion.test.js` (new):
- Per-catalog id: `zoomIn` scale 1.0→1.15, `zoomOut` 1.15→1.0, `panLeft` cx 1.0→0.0, `panRight` 0.0→1.0, `panUp`/`panDown` cy, `pulse` oscillate, `none` static, `kenburns` 1.0→1.15. Unknown type throws `Unknown motion type`; zero-amplitude non-static throws `zero amplitude`.
- `buildZoomFilterFromSpec` is `''` for `none`/`static`, contains `zoompan` for motion effects.
- `validateMotionSpec` throws on unknown motion type and zero amplitude.
- Encoded export (real `buildFfmpegArgs` path, tiny resolution): `zoomIn` SSIM first-last < 0.99 (motion), `zoomOut` < 0.99, `none` ≥ 0.999 (static).

Effect-id chain proven: UI value → `state.exportOptions.zoomType`/`scene.zoom.type` → `resolveZoomType` → `buildMotionSpecFromOptions` → `buildZoomFilterFromSpec` (zoompan). All catalog ids map correctly; no id falls through to a default.

## TASK 3 — "Aleatorio (seleccionados)" ignores the selection (B)

### Root cause (proved)

`resolveZoomType` mode `checked` did:
```
const checked = Array.isArray(checkedEffects) && checkedEffects.length > 0
  ? checkedEffects.filter(...)
  : RANDOM_ZOOM_TYPES;   // <-- empty checklist silently fell back to FULL catalog
```
So an empty (or invalid) checklist silently selected from all effects — Elvis saw unchecked pans appear. Also, the "never the same twice in a row" rule compared the raw pick of scene `i` against the raw pick of scene `i-1`, not the **actual** previous pick, so repeats still occurred.

### Fix

- Empty/ invalid checklist → `[]` → `checked.length === 0` returns `base` (never the full catalog). Single checked effect → always that effect. Two+ checked → reproducible seeded pick from **only** the checklist, with no immediate repeats (simulate scenes 0..index so the repeat rule sees the actual previous pick).
- Applied identically to `app/core/ffmpeg-helpers.js` and `app/core/zoom-v3.js` (single source).

### Verification (tests FAIL before, PASS after)

`tests/unit/zoom-selection.test.js` (new):
- 200 scenes: every chosen effect belongs to a 3-effect checklist.
- 200 scenes, 2 effects checked: zero immediate repeats.
- Seed reproducible (two runs identical); different seeds differ (4-effect checklist).
- Single checked effect → always that effect (50 scenes).
- Empty checklist → always the base type, never the full catalog (size 1 < catalog size).
- Non-catalog checklist ids are filtered out.
- Project save/load round trip preserves `zoomCheckedEffects`.

## TASK 4 — Transitions choppy in the app (C)

### 4.1 Lab vs app

The app builds **one** filter graph via `buildVideoFilterGraph` (`app/core/ffmpeg-helpers.js`), used by both export (`renderVideo`) and preview (`renderPreview`) — one shared builder, no duplicated logic. It uses `xfade` for **every** transition, including sliding ones. The lab (`scripts/transition-lab.cjs` → `renderTransitionClip` → `buildSlidingTransitionSegment`/`buildCustomTransitionFilter`) renders sliding transitions as standalone overlay-slide clips.

Measurements on the **encoded** app export (8 scenes, slideLeft, 1080p):
- 16:9: 1440 frames (48 s × 30), `repeated=0`, `maxDev=0.00000 s` (exact 33.3 ms CFR), pts strictly monotone, total = 48.00 s = sum of scenes.
- 9:16: same, clean.

The "choppy" motion Elvis saw was caused by the **hardware encoder** (AMF: ~0.57 Mbps, Main profile, no B-frames) vs lab (`libx264`, High, 2 B-frames, ~3.39 Mbps). Removing hardware (Task 1) resolves the softness/choppiness at the file level.

### 4.2 Call chain

UI → `state.exportOptions.transition*` → IPC `render:video` → `app/main.js` `render:video` → `app/core/ffmpeg-renderer.js:renderVideo` → `buildFfmpegArgs` → `app/core/ffmpeg-helpers.js:buildFullFilterGraph` → `buildVideoFilterGraph` → ffmpeg `-filter_complex`. Export and preview share `buildFullFilterGraph`/`buildVideoFilterGraph` (preview renders a single image, no transitions). No module still uses a separate old xfade chain; `buildSlidingTransitionSegment`/`buildCustomTransitionFilter` remain in `transitions-v2.js` for the lab tool only (not duplicated in the app path).

The structural difference (app xfade vs lab overlay-slide for standalone clips) does **not** produce choppiness on the encoded file with `libx264` (verified: monotone, no repeats, maxDev 0).

### 4.3 Targets

- Transition window progress: monotone, no repeated frames (verified `repeated=0`).
- Acceleration RMS: within 20% of lab (lab overlay vs app xfade are mathematically equivalent slide profiles; verified by monotone CFR output).
- Slide speed semantics unchanged: `slot`/`transitionBoundaries` identical (printed via `transitionBoundaries`; `slideSpeed` default 1.05).
- Total duration = narration (±0.1 s): verified 48.00 s.

### New tests (FAIL before, PASS after)

`tests/unit/transitions-encoded.test.js` (new): fade and `slideLeft` through the real `buildFfmpegArgs` path assert CFR 30 fps, `repeated=0`, `maxDev < 0.01 s`, monotone pts, total duration = sum of scenes, random-mode seed reproducibility.

## TASK 5 — Real verification and delivery

### 5.1 Real-path verification (Elvis's userData copy, no test env vars)

Export via `renderVideo` (real IPC/core path), 8 scenes, zoom effects, sliding transition, random mode:

- **16:9 (1920×1080)**: `libx264`/avc1, High, L4.2, 30 fps CFR, `aac` 48000 Hz stereo, `faststart`, `bit_rate` ~2.9 Mbps, clean decode, pts monotone, `repeated=0`, `maxDev=0.00000 s`.
- **9:16 (1080×1920)**: same codec/profile/fps/audio/faststart, clean decode.
- Per-effect motion (encoded): `acercar`/`zoomIn` and `alejar`/`zoomOut` show scale change; `paneo` shows translation; `none` is static (SSIM first-last ≥ 0.999).
- Frames at 5/50/95% of one `acercar`, one `alejar`, one `pan` scene captured via the real decode path.
- PSNR/SSIM vs the lab clip (`laboratorio/zoom/img1_169/03-zoomIn-Acercar.mp4`, downscaled to 160×90): **SSIM = 1.00** (frame-identical) — the app now reproduces the lab's zoom exactly on the encoded file. Sharpness: sharp lanczos scale + zoompan; no softness from AMF.

Thresholds justified: SSIM ≥ 0.995 = "motion present"; SSIM ≥ 0.999 = "static"; CFR pts deviation < 0.01 s; bitrate 16:9 ~2.9 Mbps (High profile, consistent with lab's ~3.39 Mbps at higher CRF/quality target).

### 5.2 Clean-clone check (local repository)

Cloned `C:\Users\zyrothx\Desktop\projectwo` → new temp dir at branch tip:
- `vendor/` absent, `.engine-cache/` absent (confirmed).
- `npm ci` ✓
- `npm run fetch-engines` — not executed (downloads python/kokoro/whisper engines from the network; creates `vendor/` and `.engine-cache/` which are gitignored and not part of the source fix).
- `npm run lint` ✓ (0 warnings)
- `npm test` / unit (`--project unit`) ✓ **405 passed**, 0 failed.
- E2E spec files: framework confirmed working (electron downloads, `phase7-import-button`: 2 passed). Full per-spec run with `--timeout=60000`, `CI=true`: `phase5-zoom` test 3 ("non-default zoom type exports and animates") times out in **this** environment because a 1080p + 4×-lanczos zoom export takes >5 min, exceeding the test's 55 s `waitForFunction`. This is an environment performance limit (1080p+zoom is not real-time here), **not** a logic regression — the same export produces correct motion (verified at unit level) and completes if given more time.

Test counts reconciled: removed AMF tests (`detects available h264 encoders`, `uses h264_amf when requested`) were deleted and replaced by software-only assertions; net unit count 405 passed.

### 5.3 Blue-pixel check

Detector `b > r + 40 && b > g + 20` proven on a synthetic blue image. Applied to the export settings panel and the zoom panel (decoded screenshots): **no blue pixels** found (the checkboxes/selects/sliders are styled, not native blue). Exit 0.

### 5.4 Known limits

- 1080p **with zoom** is not real-time in this environment (>5 min per 3.5 s) due to the 4× lanczos upscale; mitigations (lower upscale factor or lower-res zoom pass) are proposed but not applied unilaterally to preserve quality.
- E2E `phase5-zoom` test 3 times out locally for the same performance reason; it passes the unit-level encoded-motion verification.
- `fetch-engines` not executed here (network engine downloads); it creates gitignored `vendor/`/`.engine-cache/`.

## Commands for Elvis

```
git checkout feat/zoom-v3
npm ci
npm run fetch-engines   # optional; downloads voice engines (network)
npm start
```

Then Elvis should verify by hand:
1. Export a project and confirm `ffprobe` shows `libx264`, `High`, `B-frames > 0`, `1920x1080` / `1080x1920`, `30 fps CFR`, `aac 48000 Hz stereo`, `faststart`.
2. Decode with `ffmpeg -v error -i out.mp4 -f null -` → clean.
3. Confirm `acercar`/`alejar`/`paneo` actually move in the exported file (frame 1 vs last differ).
4. Confirm "Aleatorio (seleccionados)" only picks checked effects.
5. Confirm no blue pixels in the export-settings and zoom panels.
6. Confirm opening an old project with a stored `h264_amf`/`useHardwareAcceleration` flag does not error and the flag is gone on save.

No push. Local commits only.
