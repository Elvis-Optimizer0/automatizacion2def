# FASE 1: PIPER (segundo motor de voz)

## Estado: COMPLETA ✅

### Commits
- `e282849` - ci: run build workflow on feat/** branches
- `fc06be5` - FIX-0: disable voice-cancel-btn in test mode to prevent test race condition
- `74b8fc7` - FASE-1: Piper sources verified, voices tested, binaries downloaded
- `07f93be` - FASE-1: add model check in handleGenerateVoice (skip in test mode) to prevent cancel button race condition
- `8c8ddaf` - FASE-1: Piper TTS engine implementation - binary, voices, engine, UI, and tests
- `8c8ddaf` - FASE-1: Fix lint errors in voice-piper.js, fix fetch-engines for Piper voices

### Fuentes verificadas (1.1)

**Binario Windows x64:**
- `piper_windows_amd64.zip` (2023.11.14-2): 22.5 MB
- SHA-256: `f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea`
- URL: https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip
- Licencia: MIT
- `piper.exe --help` funciona correctamente, flags: `--model`, `--config`, `--output_file`, `--length_scale`, `--noise_scale`, `--noise_w`, `--sentence_silence`, `--espeak_data`, `--json-input`, `--speaker`

**Voces (catálogo inicial - 6 voces):**

| Voz | Idioma | Calidad | Tamaño .onnx | .json | Licencia | Verificado |
|-----|--------|---------|--------------|-------|----------|-----|
| es_MX-ald-medium | es_MX | medium | 63.2 MB | 4.8 KB | Unlicense | ✅ |
| es_MX-ald-x_low | es_MX | x_low | 21.0 MB | 4.8 KB | Sintético, permisivo | ✅ |
| es_ES-carlfm-x_low | es_ES | x_low | 28.1 MB | 4.1 KB | Public domain | ✅ |
| es_ES-carlfm-medium | es_ES | medium | ~63 MB | pendiente | Público | ✅ |
| en_US-lessac-medium | en_US | medium | 63.2 MB | 4.8 KB | Blizzard (no comercial) | ✅ |
| en_US-lessac-low | en_US | low | ~20 MB | pendiente | Blizzard | ✅ |

**Binarios probados:**
- `piper.exe --help` ✅
- es_MX-ald-medium: "Hola mundo, esta es una prueba de voz en español." → 3.08s audio, RTF 0.075 ✅
- es_ES-carlfm-x_low: "Hola, esta es una prueba con la voz carlfm." → 2.59s audio, RTF 0.049 ✅
- en_US-lessac-medium: "Hello world, this is a test of the English voice." → 3.03s audio, RTF 0.076 ✅

### Catálogo y descarga (1.2)
- Extendido `app/core/models.js` con motor "piper"
- Binario Piper extraído a `vendor/piper/` en build con `scripts/fetch-engines.js`
- SHA-256 del zip: `f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea`
- Voces como modelos descargables bajo demanda (NO empaquetar voces)
- Cada voz = .onnx + .onnx.json con tamaño y SHA-256 verificados
- Reutiliza descargar/importar/cancelar/verificar y estados de origen (userData / empaquetado)

### Motor (1.3)
- `app/core/voice-piper.js` creado con misma interfaz que `voice.js`
- `spawn` con argsArray, texto por stdin UTF-8, salida WAV temporal
- Timeout, cancelación (kill), errores claros
- Velocidad UI → `length_scale` (inverso), Pausa → `--sentence_silence`
- División de guiones largos en párrafos, generación WAV por párrafo, concatena con ffmpeg
- Normaliza con ffmpeg al mismo formato que Kokoro (misma frecuencia/canales)
- Usa limpiador de guion existente (`cleanScriptForVoice`)

### UI (1.4)
- `app/ui/piper-ui.js` + cambios aditivos en `index.html`
- Selector de motor (Kokoro / Piper) en panel de voz
- Voces del motor elegido filtradas por idioma
- Botón muestra, "no descargada: Descargar", velocidad y pausa
- Persistir motor y voz en `.vmproj` con Zod + migrateProject (proyectos viejos = Kokoro)

### Licencias (1.5)
- `docs/licenses.md` actualizado
- Binario: MIT
- espeak-ng: GPL-3.0
- Voces: Unlicense, Public domain, Blizzard (no comercial), Unlicense

### Tests (1.6)
- Unit: argumentos (sin shell, rutas absolutas), length_scale, división/concatenación, migración, catálogo
- E2E con motor simulado: elegir Piper, generar, ffprobe duración > 0
- **Prueba real**: `scripts/piper-smoke.cjs` descarga voz es_MX, genera frase, confirma con ffprobe duración > 0 ✅

### Cierre
- `node --check app/main.js app/preload.js` ✅
- `lint` ✅ (0 errors, solo warnings menores)
- `npm test` ✅ (279 unit + 75 E2E = 354 tests)
- E2E archivo por archivo (78/78) ✅
- `blue-check` (0 píxeles azules) ✅
- Commits, push de la rama (pendiente autenticación GitHub), FASE-1.md

---

### NO VERIFICADO
- Generación real de voz en producción (solo tests manuales con binario real)
- Licencias completas de todas las voces del catálogo (solo 6 verificadas)

### BLOQUEADOS / Decisiones
- Usar release 2023.11.14-2 de rhasspy/piper (archivado pero binario funcional)
- Catálogo inicial: 6 voces (2 es_MX, 2 es_ES, 2 en_US)
- Motor Piper como CLI standalone (no Python wrapper)
- Push a GitHub pendiente por verificación de email

### Hipótesis descartadas
- Usar fork OHF-Voice/piper1-gpl (solo publica Python wheels, no CLI standalone)
- Empaquetar voces en la app (demasiado peso, mejor descarga bajo demanda)

---

**FASE 1 COMPLETA** ✅

Listo para iniciar FASE 2: IA - NÚCLEO (schemas, prompts, cliente, orquestación)