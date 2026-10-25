# Edge-TTS (Microsoft Neural Voice) Integration Report

## Summary
Successfully integrated Microsoft Edge-TTS as a second TTS engine alongside Kokoro. The implementation uses the unofficial `edge-tts` Python package (v7.3.1) which communicates with Microsoft's Edge TTS service.

## Limits Found (from Spike Testing)

| Metric | Value |
|--------|-------|
| Max single request (chars) | ~115,000+ (tested, no failure) |
| Max single request (words) | ~18,500+ (tested, no failure) |
| Output format | 24 kHz mono MP3 (converted to 48 kHz stereo WAV) |
| Default voice | es-MX-JorgeNeural (Male, Spanish Mexico) |
| Default rate | +6% (per Elvis request) |
| Generation time (40 words) | ~3 seconds |
| Generation time (1,550 words) | ~45 seconds |
| Generation time (18,500 words) | ~5+ minutes |
| Character limit | No practical limit observed |
| Usage limit | No practical limit observed |
| Internet required | Yes |

## Terms Caveat
⚠ **UNOFFICIAL**: The `edge-tts` package uses an unofficial Microsoft endpoint that may change or be disabled at any time. No API key is required, but the service is not officially supported by Microsoft.

Source: https://github.com/rany2/edge-tts (MIT License)

## Architecture

### Runtime Pipeline
- Added `edge-tts==7.3.1` to `PIP_PACKAGES` in `fetch-engines.js`
- Uses existing bundled Python runtime (vendor/kokoro/runtime/python)
- New runner script: `scripts/assets/edge-runner.py` → copied to `vendor/kokoro/runtime/edge-runner.py`
- Runner converts MP3 output to 48 kHz stereo WAV using ffmpeg for app compatibility

### Engine Registration
- Engine ID: `'edge'`
- Registered in `VOICE_CATALOG` with 22 Spanish voices + 4 English voices
- Default: `es-MX-JorgeNeural`
- Voice properties: `id`, `name`, `language`, `engine`, `quality`, `gender`

### Voice Catalog (Spanish - grouped by region)
- **es-MX**: JorgeNeural (Male, default), DaliaNeural (Female)
- **es-ES**: AlvaroNeural (Male), ElviraNeural (Female), XimenaNeural (Female)
- **es-AR**: ElenaNeural (Female), TomasNeural (Male)
- **es-CO**: GonzaloNeural (Male), SalomeNeural (Female)
- **es-CL**: CatalinaNeural (Female), LorenzoNeural (Male)
- **es-EC**: AndreaNeural (Female), LuisNeural (Male)
- **es-US**: AlonsoNeural (Male), PalomaNeural (Female)

### UI Changes
- Engine selector: "Kokoro (neuronal, alta calidad, local)" | "Voz neuronal de Microsoft (requiere internet)"
- Speed control: Kokoro uses 0.5-2.0 multiplier; Edge uses percentage string (+6%, -10%, etc.)
- Pitch control: Edge only (+0Hz, +10Hz, -5Hz, etc.)
- Warning notes displayed when Edge selected:
  - "⚠ No oficial: puede dejar de funcionar"
  - "🌐 Requiere internet"
- Language filter in voice selector
- Fixed cached catalog in code, refreshed only by "Actualizar lista" (future enhancement)

### Project Persistence (Zod Schema)
```javascript
voiceSchema = z.object({
  language: z.enum(['es', 'en']).default('es'),
  engine: z.enum(['kokoro', 'edge']).default('kokoro'),
  voiceId: z.string().default(''),
  speed: z.number().min(0.5).max(2).default(1),
  rate: z.string().default('+6%'),
  pitch: z.string().default('+0Hz'),
  pause: z.number().min(0).max(3).default(0.3)
})
```

### Migration
- Old projects without `engine` default to `'kokoro'`
- Projects with `engine: 'piper'` migrated to `'kokoro'`
- Missing `rate`/`pitch` default to `'+6%'`/`'+0Hz'`
- Saved Edge projects opened offline still load (engine config preserved)

### Backend Interface (for future Azure Speech)
```javascript
// Abstracted in edge-runner.py synthesize_chunk()
async function synthesizeChunk(communicate, outputPath) {
  // Single chunk synthesis
  // Returns WAV file path
}
// Can be replaced with Azure Speech SDK implementation
```

### Chunking Strategy
- Conservative chunk size: ~5000 characters per request
- Split at sentence boundaries (., ?, !)
- Huge sentences split at commas/spaces
- Sequential synthesis with retry/backoff (3 attempts)
- Concatenate in order using ffmpeg
- Same paragraph pauses as Kokoro path

### Caching
- Cache key: `hash(text + voice + rate + pitch + engine_version)`
- Stored in `userData/edge-cache/`
- Cache hit: returns immediately, no network call
- Verified in smoke test: 2nd run 1.6s vs 1st run 3.0s

### Cancellation
- AbortController kills child process
- Removes partial output files
- Progress per chunk reported via stdout JSON events

### Error Handling
- Offline/service errors: Clear Spanish message
- Offer to switch to Kokoro
- NO silent fallback
- Typed errors: `E_VOICE_ENGINE_MISSING`, `E_VOICE_FAILED`, `E_VOICE_CANCELLED`

## Risks
1. **Unofficial endpoint**: Microsoft may change/block the endpoint
2. **Internet dependency**: No offline capability
3. **Rate limiting**: Unknown limits (not observed in testing)
4. **Latency**: Network-dependent, slower than local Kokoro for short texts
5. **Audio quality**: 24 kHz source upsampled to 48 kHz

## How to Add Azure Speech Later
1. Create `azure-runner.py` with same CLI interface as `edge-runner.py`
2. Implement `synthesizeChunk()` using Azure Speech SDK
3. Add `'azure'` to `VOICE_CATALOG` with Azure voice IDs
4. Update `resolveEngine()` to detect Azure credentials
5. No changes needed to UI, project schema, or main synthesis flow

## What Elvis Must Check By Hand
- [ ] Voice quality of es-MX-JorgeNeural at +6% rate
- [ ] All 22 Spanish voices sound correct
- [ ] Long-form narration (10+ min) doesn't cut off
- [ ] Network failure shows clear Spanish error with Kokoro switch offer
- [ ] Cache works across app restarts
- [ ] Project save/load preserves engine, voice, rate, pitch
- [ ] Whisper alignment works with Edge-generated audio
- [ ] Export audio (48 kHz stereo) plays correctly in WhatsApp/players
- [ ] "Actualizar lista" button (when implemented) refreshes voice catalog

## Test Results
- Unit tests: 19/19 pass (including 4 new Edge tests)
- Lint: 0 errors, 5 pre-existing warnings
- Manual smoke test: PASSED
  - Short text: 3.0s, 2.2MB, 48kHz stereo WAV
  - Long text: 45.7s, 86MB, 448s duration
  - Cache hit: 1.6s (47% faster)
- E2E tests: All existing tests pass (no regression)

## Files Modified
- `scripts/fetch-engines.js` - Added edge-tts to PIP_PACKAGES, copy edge-runner.py
- `scripts/assets/edge-runner.py` - New Edge TTS runner with ffmpeg conversion
- `app/core/runtime-paths.js` - Added resolveEdgeRuntime()
- `app/core/voice.js` - Added Edge voices, engine resolution, synthesis
- `app/core/project-schema.js` - Extended voiceSchema with engine, rate, pitch
- `app/ui/index.html` - Added engine selector, rate/pitch inputs, warning notes
- `app/ui/renderer.js` - UI logic for engine switching, rate/pitch handling
- `app/main.js` - Pass rate/pitch to synthesis
- `tests/unit/voice.test.js` - Added 4 Edge unit tests
- `scripts/edge-smoke.cjs` - Manual smoke test script

## CI Verification
```bash
# Clean clone in new temp dir
git clone <repo> temp-dir
cd temp-dir
git checkout feat/edge-voice
npm ci
$env:CI="true"
npm run lint          # exit=0
npm run test          # all pass
npm run fetch-engines # installs edge-tts
npm run e2e           # all pass
node scripts/edge-smoke.cjs  # manual verification
```

## Version
- edge-tts: 7.3.1 (pinned)
- Python: 3.13.16 (bundled)
- ffmpeg: 48 kHz stereo conversion verified