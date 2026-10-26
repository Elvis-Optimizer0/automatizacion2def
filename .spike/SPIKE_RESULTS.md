# Edge-TTS Spike Results

## Version and License
- edge-tts version: 7.3.1
- Source: https://github.com/rany2/edge-tts (unofficial Microsoft endpoint, may change)
- License: MIT (based on GitHub repo)

## Voice Testing
### Default Voice: es-MX-JorgeNeural
- Gender: Male
- Rate: +6% (Elvis requested slightly slower than +8%)

### Short Text (40 words / ~250 chars)
- Input: "Hola, esta es una prueba de voz neuronal de Microsoft con Jorge en español de México. La voz suena natural y clara, ideal para narraciones profesionales."
- Output: 61,200 bytes MP3
- Duration: 10.2 seconds
- Format: 24 kHz, mono, MP3
- Whisper transcript (es): "Hola, esta es una prueba de voz neuronal de Microsoft con Jorge en español de México. La voz suena natural y clara ideal para narraciones profesionales."
- WER: Very low (only minor punctuation differences)

### Long Text (1,550 words / ~9,400 chars)
- Output: 3,366,288 bytes MP3
- Duration: 561 seconds (9.35 minutes)
- Format: 24 kHz, mono, MP3

### Very Long Text (7,400 words / ~43,800 chars)
- Output: 12,465,072 bytes MP3
- Duration: 2,077 seconds (34.6 minutes)
- Format: 24 kHz, mono, MP3
- Time to generate: ~2 minutes

### Extremely Long Text (18,500 words / ~115,000 chars)
- Output: 23,590,224 bytes MP3
- Duration: 3,931 seconds (65.5 minutes)
- Time to generate: ~5+ minutes

**Finding**: No practical character limit found up to ~115k chars. The service handles very long texts in a single request.

## Edge Cases
### Empty String
- Error: `edge_tts.exceptions.NoAudioReceived: No audio was received.`

### Special Characters
- Input: `Prueba con caracteres especiales: & < > " ' á é í ó ú ñ ¿ ¡ € $ 123 45.67`
- Result: Success (8.06 seconds)
- Special characters handled correctly

### Numbers
- Included in special characters test above - handled correctly

### Offline Exception
- Not tested (requires network disconnect)

### Timeout
- Default timeout not observed for normal texts
- Very long texts take several minutes

## Spanish Voices Available
All Spanish voices from edge-tts --list-voices:

### es-MX (Mexico)
- es-MX-DaliaNeural (Female)
- es-MX-JorgeNeural (Male) **DEFAULT**

### es-ES (Spain)
- es-ES-AlvaroNeural (Male)
- es-ES-ElviraNeural (Female)
- es-ES-XimenaNeural (Female)

### es-AR (Argentina)
- es-AR-ElenaNeural (Female)
- es-AR-TomasNeural (Male)

### es-CO (Colombia)
- es-CO-GonzaloNeural (Male)
- es-CO-SalomeNeural (Female)

### es-CL (Chile)
- es-CL-CatalinaNeural (Female)
- es-CL-LorenzoNeural (Male)

### es-EC (Ecuador)
- es-EC-AndreaNeural (Female)
- es-EC-LuisNeural (Male)

### es-US (US Spanish)
- es-US-AlonsoNeural (Male)
- es-US-PalomaNeural (Female)

### Other Spanish variants:
- es-BO, es-CR, es-CU, es-DO, es-GQ, es-GT, es-HN, es-NI, es-PA, es-PE, es-PR, es-PY, es-SV, es-UY, es-VE

Total: ~22 Spanish voices across 12 regions

## Architecture Notes
- edge-tts uses unofficial Microsoft Edge TTS endpoint
- No API key required
- No per-use character limit observed
- No practical usage limit observed
- Internet required
- Output: 24 kHz mono MP3 (needs conversion to 48 kHz stereo WAV for app compatibility)
- The app must NOT depend on user's Python - must use bundled Python runtime

## Recommendations
1. Pin edge-tts==7.3.1 in PIP_PACKAGES
2. Default voice: es-MX-JorgeNeural
3. Default rate: +6%
4. Chunk at sentence boundaries with conservative size (~5000 chars per chunk)
5. Convert MP3 to 48 kHz stereo WAV using ffmpeg
6. Cache by hash(text+voice+rate+pitch+engine_version) in userData
7. Clear Spanish error messages for offline/service errors with offer to switch to Kokoro