# Licencias de Voces Piper

Este documento describe la licencia de cada voz disponible en el catálogo de Piper TTS.

## Voces en Español (México)

| Voz | Licencia | Origen | Uso Comercial |
|-----|----------|--------|---------------|
| es_MX-ald-medium | Unlicense | https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/ | ✅ Sí |
| es_MX-ald-x_low | Unlicense | https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/x_low/ | ✅ Sí |

## Voces en Español (España)

| Voz | Licencia | Origen | Uso Comercial |
|-----|----------|--------|---------------|
| es_ES-carlfm-x_low | Public domain | https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/ | ✅ Sí |
| es_ES-carlfm-medium | Public domain | https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/medium/ | ✅ Sí |

## Voces en Inglés (EE. UU.)

| Voz | Licencia | Origen | Uso Comercial |
|-----|----------|--------|---------------|
| en_US-lessac-medium | **Blizzard (non-commercial)** | https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/ | ❌ **NO** |
| en_US-lessac-low | **Blizzard (non-commercial)** | https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/ | ❌ **NO** |

---

## Notas importantes

### Voz Blizzard (en_US-lessac-*)
Las voces `en_US-lessac-medium` y `en_US-lessac-low` tienen licencia **Blizzard (non-commercial)**. Esto significa que **NO pueden usarse con fines comerciales** sin obtener una licencia separada de Blizzard Entertainment.

> ⚠️ **ADVERTENCIA**: El uso comercial de estas voces está prohibido por su licencia. Si planeas usar Video Maker para proyectos comerciales, evita seleccionar estas voces o consulta con Blizzard Entertainment para obtener la licencia correspondiente.

### Voces Unlicense / Public Domain
Las voces en español (es_MX y es_ES) tienen licencias permisivas (Unlicense / Public domain) que permiten uso comercial sin restricciones.

---

## Referencias

- Catálogo de voces: `app/core/model-specs.js` (modelo `piper`)
- Gestión de descargas: `app/core/models.js` (canal `piper:voiceDownload`)
- UI de selección: `app/ui/renderer.js` (panel `piper-voices-panel`)
- Ver también: `docs/models.md` para información sobre el sistema de modelos