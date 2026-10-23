# FASE 1: PIPER (segundo motor de voz)

## Estado: CERRADA CON DEUDA

## Corrección de CI RED #2

### Causa probada

El archivo `piper_windows_amd64.zip` de `rhasspy/piper` release `2023.11.14-2` contiene el runtime dentro de una carpeta superior `piper/`. Sus primeras entradas son:

```text
piper/pkgconfig/
piper/espeak-ng.dll
piper/libtashkeel_model.ort
piper/onnxruntime_providers_shared.dll
piper/onnxruntime.dll
piper/piper_phonemize.dll
piper/piper.exe
piper/espeak-ng-data/voices/
piper/espeak-ng-data/af_dict
```

`PATHS.piperDir` es `vendor/piper`. La extracción anterior escribía el archivo en `vendor/piper/piper/piper.exe`, mientras la comprobación final exigía `vendor/piper/piper.exe`.

Un clone limpio nuevo, sin `vendor/` ni `.engine-cache/`, reprodujo el fallo después de verificar todos los SHA-256:

```text
[fetch-engines] verificado piper (22477236 bytes, sha256 f3c58906402b…)
[fetch-engines] ERROR: faltan archivos tras la instalación:
  ...\vendor\piper\piper.exe
```

El árbol extraído confirmó `vendor/piper/piper/piper.exe` y `vendor/piper/piper/espeak-ng-data/`.

### Corrección

- `scripts/fetch-engines.js` extrae Piper a un directorio temporal.
- El layout se obtiene de las entradas del ZIP y se localiza `piper.exe` sin asumir un nombre de carpeta.
- La carpeta que contiene `piper.exe` se coloca en `vendor/piper/`, de modo que `piper.exe`, las DLL y `espeak-ng-data/es_dict` quedan juntos.
- Una instalación con `piper.exe` pero sin el runtime completo se vuelve a extraer.
- La comprobación final se fortaleció: sigue exigiendo `piper.exe` y además valida las DLL requeridas y `espeak-ng-data/es_dict`.
- `app/core/voice-piper.js` resuelve el runtime en `vendor/piper` durante desarrollo y en `resources/piper` en el paquete; `--espeak_data` apunta a `vendor/piper/espeak-ng-data`.
- `tests/unit/fetch-engines.test.js` cubre, sin red, ZIP con carpeta superior `piper/`, ZIP plano y ausencia de `piper.exe`.

## Voz Piper para E2E

Solo el runtime binario de Piper se instala en `vendor/`. La voz E2E se descarga antes de los tests a `.engine-cache/piper-e2e-voice` y se verifica contra tamaño y SHA-256 del catálogo:

- `es_MX-ald-medium.onnx`: 63,201,294 bytes; SHA-256 `019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63`
- `es_MX-ald-medium.onnx.json`: 4,878 bytes; SHA-256 `5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d`

`tests/e2e/global-setup.cjs` expone esa ubicación mediante `VM_TEST_PIPER_VOICE_DIR`. `tests/e2e/phase7-pipeline.spec.js` copia la voz verificada al `userData` temporal. No se modificaron sus aserciones. El workflow cachea `vendor/` y `.engine-cache/` mediante `actions/cache`.

## Verificación

- Unit: 297 passed, 0 failed.
- E2E por archivo: 75 passed en total, 0 failed.
- `npm run lint`: `exit=0`, sin warnings.
- `scripts/piper-smoke.cjs` ejecuta el binario real con `voiceId=es_MX-ald-medium` y registra engine, comando, código de salida, muestras y volumen.
- Smoke real observado: `exit code=0`, 88,378 muestras a 22,050 Hz, `mean_volume=-15 dB`, `max_volume=0 dB`, por encima del umbral de -50 dB.
- El paquete incluye `resources/piper` y `scripts/verify-package.js` exige el runtime completo.

## Catálogo y licencias

El catálogo contiene cinco voces; las pruebas derivan el conteo desde `app/core/model-specs.js`.

| Voz | Línea exacta de licencia en `MODEL_CARD` | Uso comercial |
|-----|---------------------------------------------|---------------|
| es_MX-ald-medium | `* License: http://unlicense.org` | Sí |
| es_MX-ald-x_low | Sin línea `License` | No verificado; no aprobado |
| es_ES-carlfm-x_low | `* License: Public domain` | Sí |
| en_US-lessac-medium | `* License: https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html` | No |
| en_US-lessac-low | `* License: https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html` | No |

La licencia Blizzard limita el uso a `Research Purposes` y excluye uso comercial. `es_MX-ald-x_low` no declara licencia en su tarjeta, por lo que no se infiere permiso comercial. `docs/licenses.md` y `commercialUse` reflejan esta evidencia.

## Deuda

- T2: E2E dedicado de Piper con stub `VM_PIPER_EXE` y servidor local de voz.
- T3: conteo de píxeles para blue-check.

FASE 1: CERRADA CON DEUDA (T2, T3)
