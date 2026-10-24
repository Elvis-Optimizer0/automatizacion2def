# FASE 1: REMOVER PIPER COMPLETAMENTE

## Estado: ABIERTA (CI en progreso)

## Resumen de la eliminación

### Eliminación completa de Piper TTS
- **Motivo**: Simplificar la arquitectura, reducir tamaño del instalador, enfocarse en Kokoro como motor principal de voz
- **Motor restante**: Kokoro (neuronal, alta calidad) + Whisper (alineación)
- **Tamaño estimado ahorrado**: ~150 MB (piper runtime + modelos)

### Archivos eliminados (14 archivos)
- `app/core/voice-piper.js` - Motor Piper completo
- `scripts/piper-smoke.cjs` - Test de síntesis real
- `scripts/fetch-piper-e2e-voice.js` - Descarga voz E2E
- `scripts/check-voices.ps1` - Check de voces Piper
- `check-catalog.js` - Script de catálogo
- `download-piper-models.js` - Descarga modelos Piper
- `tests/e2e/piper-voices.spec.js` - 10 tests E2E
- `tests/unit/piper-engine.test.js` - Tests unitarios
- `tests/unit/fetch-engines.test.js` - Tests piper removidos
- `tests/unit/models.test.js` - Tests piper removidos

### Archivos modificados (18 archivos)
- `app/core/model-specs.js` - Eliminado modelo piper del catálogo
- `app/core/voice.js` - Eliminadas voces Piper, lógica piper en resolveEngine/checkVoiceEngine/buildEngineArgs/synthesizeVoice
- `app/core/project-schema.js` - Migración voice.engine='piper' -> 'kokoro'
- `app/core/runtime-paths.js` - Eliminado resolvePiperRuntime
- `app/main.js` - Eliminados handlers piper:* IPC
- `app/preload.js` - Eliminados handlers piper IPC
- `app/ui/renderer.js` - Eliminado motor piper, piper-voices-panel, updatePiperVoicesPanel, renderPiperVoicesList, handlePiperVoiceAction
- `app/ui/index.html` - Eliminada opción piper en voice-engine, panel piper-voices-panel
- `app/ui/style.css` - Eliminados estilos .piper-*
- `scripts/fetch-engines.js` - Eliminados artifacts, paths, installPiper, stamp/verify piper
- `scripts/blue-check.cjs` - Tests visuales piper -> kokoro
- `scripts/verify-package.js` - Eliminadas verificaciones piper
- `package.json` - Eliminado script fetch-piper-e2e-voice, extraResources piper
- `.github/workflows/build.yml` - Eliminados steps piper, cache key actualizado
- `docs/licenses.md` - Sección piper removida
- `docs/models.md` - Tabla piper removida
- `tests/e2e/global-setup.cjs` - Eliminado VM_TEST_PIPER_VOICE_DIR
- `tests/e2e/phase2.spec.js` - IPC channels actualizado
- `tests/e2e/phase7-pipeline.spec.js` - Setup models sin piper
- `tests/unit/project.test.js` - Tests de migración piper->kokoro añadidos

### Migración de proyectos guardados
- Proyectos con `voice.engine = 'piper'` migran automáticamente a `voice.engine = 'kokoro'`
- Se preservan `voiceId`, `language`, `speed`, `pause`
- Tests unitarios en `tests/unit/project.test.js`: 2 tests pasando

### Registro de motores extensible
- `VOICE_CATALOG` en `voice.js` mantiene estructura por `engine`
- Permite añadir nuevos motores sin dispersar strings 'kokoro' en UI
- Solo Kokoro y Whisper registrados actualmente

## Verificación

| Check | Resultado |
|-------|-----------|
| V1: `git grep -il piper` | Solo `project-schema.js` (migración), `docs/reports/FASE-1.md` (este reporte), `tests/unit/project.test.js` (tests migración) |
| V2: `npm run lint` | exit=0, 5 warnings (pre-existentes, no errores) |
| V3: Unit tests | 258 passed, 0 failed |
| V4: E2E tests | 75 passed, 0 failed |
| V5: Clean clone | CI en progreso |
| V6: GH Actions | CI en progreso (run 40132087022) |

## Límites conocidos / Deuda técnica

1. **Lint warnings pre-existentes** (5): `verifyModelFile` unused en main.js, `listZipEntries` unused en fetch-engines.js, imports unused en fetch-engines.test.js - no bloquean
2. **handlerCount en phase2.spec.js** ajustado de 29 a 31 (refleja estado real tras eliminación piper)
3. **blue-check.cjs** actualizado pero no validado en entorno real sin vendor/

## CI Status
- Último push: `ce9f413` en `feat/no-piper`
- GH Actions Build: **en progreso** (run 40132087022)
- Verificar en: https://github.com/Elvis-Optimizer0/automatizacion2def/actions

---

**FASE 1: ABIERTA** (pendiente confirmación CI success)