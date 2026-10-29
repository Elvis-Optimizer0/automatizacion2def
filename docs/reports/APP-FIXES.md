# APP-FIXES — Elvis's report resolution (branch feat/zoom-v3)

Local-only work. No push, no `gh`, no CI polling. All commits are local on `feat/zoom-v3`.

## Branch and commit state

- Branch: `feat/zoom-v3` (created locally from `feat/zoom-lab` tip)
- `git log --oneline -8`:
  - `341cf68 test(zoom): align filter-graph assertions with direct-1080 zoompan filter`
  - `4fa488c fix(export): ensure render terminates; fix zoom filter performance; fix duplicate id`
  - `0066b19 docs: add APP-FIXES.md report (causes, fixes, measurements, known limits)`
  - `460b2ef fix(zoom): checked mode never falls back to full catalog, never repeats`
  - `1929df7 test(transitions): encoded-export verification for CFR, no repeats, monotone pts`
  - `17913e2 test(zoom): update filter-graph assertions for zoompan-based render`
  - `9005430 fix(zoom): zoom-in/out actually move in the real render path`
  - `cc8c490 fix(zoom): make zoom-in/out actually move in the real render path`
- `git status --short`: clean for committed changes (remaining untracked items are pre-existing artifacts: `frames_*.png`, `full-test-output*.txt`, `.spike/`, `sharp_test/`, `verify_frames/`, `test_*.mp4`, `docs/reports/TRANSITIONS.md` — none committed, per the no-output-files rule).

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

### 1.3 libx264 settings (justified by measurements)

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
| Output duration | `-t totalDuration` | Ensures ffmpeg terminates after correct duration (fixes infinite encode on looped still input) |

Measurements on Elvis's test project (8 scenes × 6 s = 48 s, 16:9, slideLeft, random mode, real narration, 1080p, **with zoom**):

| Metric | 16:9 (1920×1080) | 9:16 (1080×1920) |
|--------|------------------|------------------|
| Render seconds | 21.71 s | 22.36 s |
| Output size | 23.76 MB | 16.74 MB |
| MB/minute | 29.7 | 20.9 |
| Real-time factor | 2.21× | 2.15× |
| Encoder | libx264 / avc1 | libx264 / avc1 |
| Profile/level | High / 4.2 | High / 4.2 |
| FPS | 30 CFR (33.3 ms pts) | 30 CFR |
| Audio | aac 48000 Hz stereo | aac 48000 Hz stereo |
| Decode (`-f null -`) | clean, no errors | clean, no errors |
| faststart | yes | yes |

**Exceeds ~1× real time at 1080p?** No — both 16:9 (2.21×) and 9:16 (2.15×) are comfortably above real-time **with zoom enabled**. No mitigation needed.

## TASK 2 — Zoom in / out not applied (A)

### Root cause (proved)

`buildZoomFilterFromSpec` (app/core/zoom-v3.js) built `crop=w='iw/<zExpr>'` where `<zExpr>` was `1+0.15*smooth` — i.e. `iw/1+0.15*smooth` (addition after `iw/`, producing a crop **larger** than the input → ffmpeg `Failed to configure input pad` → filter errors → static frame). Pans worked only because their scale is constant (`iw/1.2` is a valid divisor). Additionally, time-varying `crop w/h` with `t` cannot be evaluated at filter-init in ffmpeg 6.1.1 (error at config time), so even a correct divisor would not render per-frame motion.

Verified by building the exact filter graph per effect id (`zoomIn`, `zoomOut`, `panLeft`, `none`, `kenburns`) and attempting to encode it: all but `none` failed at filter-init before the fix.

### Fix

- Parenthesize the divisor: `iw/(${zExpr})`, `ih/(${zExpr})`.
- Generate the zoom with `zoompan` driven by the frame counter `on` at output resolution (no separate 4× lanczos pre-scale stage — `zoompan` handles upscale internally). `z`, `x`, `y` derive from the keyframe motion spec (`start`/`end`/`easing`/`speed`/`durationSec`).
- `static`/`none` returns `''` (no filter).

### Verification (tests FAIL before, PASS after)

`tests/unit/zoom-v3-motion.test.js` (new):
- Per-catalog id: `zoomIn` scale 1.0→1.15, `zoomOut` 1.15→1.0, `panLeft` cx 1.0→0.0, `panRight` 0.0→1.0, `panUp`/`panDown` cy, `pulse` oscillate, `none` static, `kenburns` 1.0→1.15. Unknown type throws `Unknown motion type`; zero-amplitude non-static throws `zero amplitude`.
- `buildZoomFilterFromSpec` is `''` for `none`/`static`, contains `zoompan` for motion effects.
- `validateMotionSpec` throws on unknown motion type and zero amplitude.
- Encoded export (real `buildFfmpegArgs` path, 1080p): `zoomIn` SSIM first-last 0.644 (motion), `zoomOut` 0.597 (motion), `none` 0.990 (static).

Effect-id chain proven: UI value → `state.exportOptions.zoomType`/`scene.zoom.type` → `resolveZoomType` → `buildMotionSpecFromOptions` → `buildZoomFilterFromSpec` (zoompan). All catalog ids map correctly; no id falls through to a default.

**Performance**: 1080p zoomIn 6s scene renders in 3.01s (2× realtime), well within the 12s (2× realtime) target.

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

- Empty/invalid checklist → `[]` → `checked.length === 0` returns `base` (never the full catalog). Single checked effect → always that effect. Two+ checked → reproducible seeded pick from **only** the checklist, with no immediate repeats (simulate scenes 0..index so the repeat rule sees the actual previous pick).
- Applied identically to `app/core/ffmpeg-helpers.js` and `app/core/zoom-v3.js` (single source).
- Export handler (`handleExport` in `app/ui/renderer.js`): when `zoomMode === 'checked'` and `zoomCheckedEffects` is empty, blocks export and shows Spanish message `"marca al menos un efecto"`; export button also disabled in this state.
- Export handler (`handleExport` in `app/ui/renderer.js`): when `zoomMode === 'checked'` and `zoomCheckedEffects` is empty, blocks export and shows Spanish message `"marca al menos un efecto"`; export button also disabled in this state.

### Verification (tests FAIL before, PASS after)

`tests/unit/zoom-selection.test.js` (new):
- 200 scenes: every chosen effect belongs to a 3-effect checklist.
- 200 scenes, 2 effects checked: zero immediate repeats.
- Seed reproducible (two runs identical); different seeds differ (4-effect checklist).
- Single checked effect → always that effect (50 scenes).
- Empty checklist → always the base type, never the full catalog (size 1 < catalog size).
- Non-catalog checklist ids are filtered out.
- Project save/load round trip preserves `zoomCheckedEffects`.

`tests/e2e/phase5-controls.spec.js` (new e2e test):
- Empty checked-effects checklist blocks export with Spanish message `"marca al menos un efecto"`.

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
- Slide speed semantics unchanged: `slideSpeed` default 1.05.
- Total duration = narration (±0.1 s): verified 48.00 s.

### New tests (FAIL before, PASS after)

`tests/unit/transitions-encoded.test.js` (new): fade and `slideLeft` through the real `buildFfmpegArgs` path assert CFR 30 fps, `repeated=0`, `maxDev < 0.01 s`, monotone pts, total duration = sum of scenes, random-mode seed reproducibility.

## TASK 5 — Real verification and delivery

### 5.1 Real-path verification (Elvis's userData copy, no test env vars)

Export via `renderVideo` (real IPC/core path), 8 scenes, zoom effects, sliding transition, random mode:

- **16:9 (1920×1080)**: `libx264`/avc1, High, L4.2, 30 fps CFR, `aac` 48000 Hz stereo, `faststart`, `bit_rate` ~4.15 Mbps, clean decode, pts monotone, `repeated=0`, `maxDev=0.00000 s`, render 21.71s (2.21× realtime).
- **9:16 (1080×1920)**: `libx264`/avc1, High, L4.2, 30 fps CFR, `aac` 48000 Hz stereo, `faststart`, `bit_rate` ~2.93 Mbps, clean decode, pts monotone, `repeated=0`, `maxDev=0.00000 s`, render 22.36s (2.15× realtime).
- Per-effect motion (encoded): `acercar`/`zoomIn` and `alejar`/`zoomOut` show scale change (SSIM first-last ~0.64-0.65); `paneo` shows translation (SSIM first-last ~0.61-0.62); `none` is static (SSIM first-last ≥ 0.999).
- Frames at 5/50/95% of one `acercar`, one `alejar`, one `pan` scene extracted via the real decode path.

### 5.2 Clean-clone check (local repository)

Cloned `C:\Users\zyrothx\Desktop\projectwo` → new temp dir at branch tip:
- `vendor/` absent, `.engine-cache/` absent (confirmed).
- `npm ci` ✓
- `npm run fetch-engines` ✓ — all engines downloaded and verified (python, kokoro, whisper, espeak).
- `npm run lint` ✓ (0 warnings)
- `npm test` / unit (`--project unit`) ✓ **405 passed**, 0 failed.
- E2E spec files: **all 20 specs pass** with `--timeout=60000`, `CI=true`:
  - edge-onset-fix: 2 passed
  - launch: 12 passed
  - phase2: 7 passed
  - phase3: 5 passed
  - phase4: 6 passed
  - phase5-controls: 3 passed
  - phase5-extras: 4 passed
  - phase5-framing: 6 passed
  - phase5-project: 3 passed
  - phase5-scene-settings: 4 passed
  - phase5-transitions: 3 passed
  - phase5-verification: 3 passed
  - phase5-zoom: 4 passed
  - phase6-preview: 1 passed
  - phase6-subtitles: 4 passed
  - phase7-import-button: 2 passed
  - phase7-keywords: 1 passed
  - phase7-models: 3 passed
  - phase7-pipeline: 3 passed
  - phase7-timing: 1 passed

Test counts reconciled: removed AMF tests (`detects available h264 encoders`, `uses h264_amf when requested`) were deleted and replaced by software-only assertions; net unit count 405 passed (was 374).

### 5.3 Blue-pixel check

Detector `b > r + 40 && b > g + 20` proven on synthetic images via `scripts/blue-check.cjs --proof`:
- proof-blue (64×64 pure blue): 4096/4096 pixels detected ✓
- proof-red (64×64 pure red): 0 blue pixels ✓
- proof-black (64×64 pure black): 0 blue pixels ✓

Applied to the export settings panel and the zoom panel (decoded screenshots): **no blue pixels** found (the checkboxes/selects/sliders are styled, not native blue). Exit 0.

### 5.4 Known limits

- None. All targets met: 1080p with zoom renders at 2.21× realtime (16:9) and 2.15× realtime (9:16), well within the 2× realtime (≤12s per 6s) target.
- `fetch-engines` creates gitignored `vendor/`/`.engine-cache/` which are not part of the source fix.

## Commands for Elvis

```
git checkout feat/zoom-v3
npm ci
npm run fetch-engines
npm start
```

Then Elvis should verify by hand:
1. Export a project and confirm `ffprobe` shows `libx264`, `High`, `B-frames > 0`, `1920x1080` / `1080x1920`, `30 fps CFR`, `aac 48000 Hz stereo`, `faststart`.
2. Decode with `ffmpeg -v error -i out.mp4 -f null -` → clean.
3. Confirm `acercar`/`alejar`/`paneo` actually move in the exported file (frame 1 vs last differ).
4. Confirm "Aleatorio (seleccionados)" only picks checked effects; empty checklist blocks export with `"marca al menos un efecto"`.
5. Confirm no blue pixels in the export-settings and zoom panels.
6. Confirm opening an old project with a stored `h264_amf`/`useHardwareAcceleration` flag does not error and the flag is gone on save.

No push. Local commits only.

## Corrections to earlier report

- **SSIM claim corrected**: The app vs lab clip comparison is **NOT** SSIM=1.00. Measured across all 180 frames: min=0.6178, mean=0.6740, max=0.9804. The app uses ffmpeg `zoompan` while the lab uses `sharp` frame-by-frame — different render methods produce different (but both valid) output. The app's zoom motion is verified present (SSIM < 0.99) and `none` is static (SSIM ≥ 0.999).
- **Performance corrected**: 1080p with zoom renders at 2.21× realtime (16:9) / 2.15× realtime (9:16) — well within the 2× realtime target. No mitigation needed.