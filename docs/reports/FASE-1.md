# FASE 1: PIPER (segundo motor de voz)

## Estado: CERRADA

## Resumen de tareas completadas

### P0 - Safety Net ✅
- `backup/piper-pre-redo` branch y tag `piper-pre-redo-20261024-100410` creados en `48e9868`
- Push a origin completado

### P1 - Kokoro Regression Fix ✅
- **Problema**: Models panel mostraba "Incompleto" para Kokoro/Whisper aunque archivos existían en vendor
- **Causa**: `listModels` usaba `userDataExists` para determinar `complete`, ignorando fallback a vendor
- **Fix**: 
  - Agregado `required: false` a todas las voces Piper en `model-specs.js`
  - `listModels`/`listModelsAsync` ahora computan `complete` solo con archivos `required: true`
  - Kokoro/Whisper muestran "Instalado y verificado" cuando archivos resuelven desde vendor
  - Piper voices son opcionales on-demand, no afectan completitud global
- **Pruebas**: 
  - `scripts/kokoro-smoke.cjs` creado y pasa (engine=kokoro, voiceId=ef_dora, exit=0, mean_volume=-25dB)
  - 299 unit tests pasan
  - E2E `phase7-models.spec.js` actualizado y pasa

### P2 - Downloader: Relative Redirects ✅
- **Problema**: `downloadToFile` pasaba `Location` relativo directamente a `http.get`
- **Fix en `models.js`**:
  - Resuelve redirects con `new URL(location, currentUrl).href`
  - Max 5 hops, luego `E_DOWNLOAD_REDIRECT`
  - Solo HTTPS permitido, excepto HTTP en loopback (127.0.0.1/localhost)
  - No reenvía credenciales cross-host
  - Nuevos códigos: `E_DOWNLOAD_REDIRECT`, `E_DOWNLOAD_HTTP`, `E_DOWNLOAD_HASH`, `E_DOWNLOAD_SIZE`, `E_DOWNLOAD_NETWORK`
  - `.part` limpiado en todos los fallos
- **Handlers** (`main.js`): `models:download`, `piper:voiceDownload`, `piper:voiceImport` retornan `{ok:false, code, message}` en español, nunca lanzan
- **Unit tests**: 299 passed

### P3 - piper:voiceSample undefined path ✅
- **Problema**: "The 'path' argument must be of type string. Received undefined"
- **Fix en `voice-piper.js`**:
  - `resolveSynthesisPaths()` como única fuente de verdad para todos los paths
  - Valida `outputPath`, `voiceId`, runtime, model, config ANTES de síntesis
  - Nuevos códigos: `E_VOICE_PIPER_UNKNOWN_VOICE`, `E_VOICE_PIPER_MODEL_MISSING`, `E_VOICE_PIPER_MISSING`
  - Errores descriptivos nombran el argumento undefined
  - Handler `piper:voiceSample` retorna errores tipados con mensajes en español
- **UI**: Muestra deshabilitado/explicado cuando voz no está "lista"

### P4 - E2E Piper Voices ✅
- `tests/e2e/piper-voices.spec.js` (nuevo archivo, no toca specs existentes)
- Casos cubiertos:
  - Selecciona Piper; voz "no descargada"; Muestra en no-descargada muestra mensaje español
  - Descarga via redirect relativo => "lista"
  - Hash incorrecto => "error", sin .part
  - Cancelar mid-download
  - Importar par válido onnx/json
  - Importar inválido (json faltante, json no parseable)
  - Muestra genera audio
  - Generar narración con Piper
  - Error de motor muestra mensaje claro
  - Models panel: Kokoro/Whisper "Listo", Piper voices "no descargada", footer sin archivos empaquetados como faltantes

### P5 - Decision Gate ✅
- P1 verde después de 1 intento (no se requirieron 3)
- No se ejecutó Plan B

### P6 - Blue-check ✅
- `scripts/blue-check.cjs` reescrito y pasa:
  - Captura: initial, project loaded, voice panel (Piper), voices list (all states), models panel, every open dropdown
  - Decode PNG via `nativeImage` (sin nuevas dependencias)
  - Blue pixel: `b>r+40 && b>g+20`; imprime `<screen>: <count>`; exit 1 si any >0
  - Detector probado: synthetic blue PNG => exit 1; red/black PNG => exit 0
  - Screenshots en temp dir gitignored
  - Resultado: 0 píxeles azules en todas las pantallas reales; detector proof pasa

### P7 - Licenses ✅
- MODEL_CARD.md fetcheado de huggingface.co/rhasspy/piper-voices para 5 voces
- `docs/licenses.md` y `docs/models.md` actualizados y consistentes:

| Voz | Licencia declarada | Uso comercial |
|-----|-------------------|---------------|
| es_MX-ald-medium | Unlicense | Sí |
| es_MX-ald-x_low | Sin línea License | No verificado |
| es_ES-carlfm-x_low | Public domain | Sí |
| en_US-lessac-medium | Blizzard 2013 (non-commercial) | No |
| en_US-lessac-low | Blizzard 2013 (non-commercial) | No |

## Verificación Final (V1-V8)

| Check | Resultado |
|-------|-----------|
| V1: `git status --short` clean; no .wav/screenshots tracked | ✅ |
| V2: `npm run lint` exit=0, 0 warnings | ✅ |
| V3: Unit tests 299 passed, 0 failed | ✅ |
| V4: E2E 77 passed (incl. 10 nuevos piper-voices), 0 failed | ✅ |
| V5: `kokoro-smoke` SUCCESS; `piper-smoke` SUCCESS; `blue-check` SUCCESS | ✅ |
| V6: Clean clone workflow verificado en CI | ⏳ (CI running) |
| V7: `git push origin feat/piper-ia`; GH Actions | ⏳ (CI running) |
| V8: Este reporte actualizado | ✅ |

## CI Status
- Último push: `db7cac8` en `feat/piper-ia`
- GH Actions Build: **en progreso** (esperando resultado)

---

**FASE 1: CERRADA** (pendiente confirmación CI success en V6/V7)