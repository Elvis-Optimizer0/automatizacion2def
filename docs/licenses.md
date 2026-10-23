# Licencias de Voces Piper

Este documento describe la licencia declarada en el `MODEL_CARD` de cada voz disponible en el catálogo de Piper TTS.

## Voces en Español (México)

| Voz | Línea de licencia en `MODEL_CARD` | Uso comercial |
|-----|------------------------------------|---------------|
| es_MX-ald-medium | `* License: http://unlicense.org` | Sí |
| es_MX-ald-x_low | Sin línea `License` | No verificado; no aprobado para uso comercial |

## Voces en Español (España)

| Voz | Línea de licencia en `MODEL_CARD` | Uso comercial |
|-----|------------------------------------|---------------|
| es_ES-carlfm-x_low | `* License: Public domain` | Sí |

## Voces en Inglés (EE. UU.)

| Voz | Línea de licencia en `MODEL_CARD` | Uso comercial |
|-----|------------------------------------|---------------|
| en_US-lessac-medium | `* License: https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html` | No |
| en_US-lessac-low | `* License: https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html` | No |

## Notas importantes

### es_MX-ald-x_low

El `MODEL_CARD` no contiene una línea `License`. El catálogo conserva `commercialUse: false`; no se infiere permiso comercial a partir de la voz `es_MX-ald-medium` ni del dataset sintético descrito por la tarjeta.

### en_US-lessac-*

Las tarjetas `en_US-lessac-medium` y `en_US-lessac-low` remiten a la licencia de investigación Blizzard 2013. Esa licencia limita el uso a `Research Purposes` y excluye expresamente el desarrollo, marketing, comercialización, venta o licenciamiento comercial de productos o servicios de síntesis de voz. Por eso el catálogo marca ambas voces con `commercialUse: false`.

### es_MX-ald-medium y es_ES-carlfm-x_low

`es_MX-ald-medium` declara Unlicense y `es_ES-carlfm-x_low` declara Public domain. Ambas voces están marcadas con `commercialUse: true`.

## Referencias

- `es_MX-ald-medium`: https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD
- `es_MX-ald-x_low`: https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/x_low/MODEL_CARD
- `es_ES-carlfm-x_low`: https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_ES/carlfm/x_low/MODEL_CARD
- `en_US-lessac-medium`: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD
- `en_US-lessac-low`: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/low/MODEL_CARD
- Catálogo de voces: `app/core/model-specs.js` (modelo `piper`)
- Gestión de descargas: `app/core/models.js` (canal `piper:voiceDownload`)
- UI de selección: `app/ui/renderer.js` (panel `piper-voices-panel`)
- Ver también: `docs/models.md` para información sobre el sistema de modelos
