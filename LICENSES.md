# Licencias y dependencias

Este documento describe las licencias de las dependencias y de los motores locales
(voz y alineación) que Video Maker puede invocar. Verificado en 2026-10-17.

## Aplicación

- Video Maker: MIT.

## Dependencias empaquetadas (npm)

| Paquete | Licencia |
| --- | --- |
| electron | MIT |
| electron-builder | MIT |
| zod | MIT |
| ffmpeg-static (binario FFmpeg) | LGPL/GPL según build |
| ffprobe-static (binario FFprobe) | LGPL/GPL según build |

Los binarios de FFmpeg/FFprobe se desempaquetan con `asarUnpack` y se invocan con
`spawn` + arreglo de argumentos (nunca por shell).

## Voz local (motor principal: Kokoro)

- Runtime `kokoro-onnx` (thewh1teagle): **MIT**.
- Pesos del modelo Kokoro-82M v1.0 (hexgrad): **Apache-2.0** (uso comercial permitido,
  con atribución). Modelo de ~82M parámetros, salida 24 kHz mono.
- Voces en español (v1.0): `ef_dora` (Dora), `em_alex` (Alex), `em_santa` (Santa).
- Voces en inglés (v1.0): americanas (`af_heart`, `af_bella`, `af_nicole`,
  `am_adam`, `am_michael`, ...) y británicas (`bf_emma`, `bm_george`, ...).
- Nota G2P: el español requiere `espeak-ng` (**GPL-3.0**) como motor
  grafema-a-fonema. El inglés no lo requiere (misaki, MIT).
- `onnxruntime` (Microsoft): **MIT**.
- Python embebido (python-build-standalone, astral-sh): **Apache-2.0/MIT** según build.

> **AVISO GPL-3.0:** este paquete (uso personal, no distribuido) incrusta `espeak-ng`,
> que es **GPL-3.0**. Mientras la app **solo se use de forma personal y no se
> distribuya**, no hay obligación de liberar el código. **Antes de distribuir**
> (vender, regalar, publicar) un instalador con espeak-ng incrustado, revisar la
> implicación GPL-3.0. Alternativa sin GPL: usar solo voces en inglés (misaki) o
> sustituir espeak-ng por un G2P español con licencia permisiva.

## Voz de respaldo: Piper

- Código Piper (rhasspy/piper): **MIT**.
- Pesos por voz: licencia individual (CC0, CC-BY, etc.). Verificar la licencia de
  cada voz concreta antes de distribuirla.

## Alineación (Whisper): whisper.cpp

- whisper.cpp (ggerganov): **MIT**.
- Pesos de Whisper: licencia del modelo original (MIT para las distribuciones
  comunitarias `tiny`/`base`/`small`/`medium`; revisar el repo del modelo elegido).

## Empaquetado de los motores (extraResources)

El instalador incluye los motores completos, sin variables de entorno. En desarrollo
se leen desde `vendor/`; en la app instalada desde `resources/` (el
`extraResources` de `package.json` copia `vendor/kokoro` → `resources/kokoro` y
`vendor/whisper` → `resources/whisper`). La app resuelve estas rutas sola
(`app/core/runtime-paths.js`).

Layout esperado (coloca aquí los binarios; no se versionan):

```
vendor/kokoro/                      -> resources/kokoro/
  runtime/kokoro-runtime.exe        (lanzador del Python embebido + kokoro-onnx)
  espeak-ng/                        (datos/dlls G2P español, GPL-3.0)
  models/kokoro-v1.0.onnx
  models/voices-v1.0.bin

vendor/whisper/                     -> resources/whisper/
  bin/whisper-cli.exe               (whisper.cpp, build CPU o Vulkan)
  models/ggml-base.bin
```

El runtime de Kokoro (Python embebido + `kokoro-onnx` + `onnxruntime` + `espeak-ng`)
puede ser un `.exe` autocontenido o un lanzador que invoque el intérprete embebido.
El wrapper debe aceptar `--output <ruta.wav> --voice <id> --lang <es|en> [--speed]`.

### Vulkan

- **CPU siempre es viable** con el build oficial de whisper.cpp.
- **Vulkan** solo es viable si se incluye un build de whisper.cpp **compilado con el
  backend Vulkan**. Si existe, la app lo usa; si no, cae a CPU automáticamente
  (el backend se decide en `app/core/capabilities.js`).

### Variables de entorno

`VM_*` quedan **solo para el modo test/CI** (motores simulados y overrides de rutas).
En uso real **no hay que configurar nada**: con los motores empaquetados,
"Generar voz" produce un `.wav` real en `userData/voices`
(`%APPDATA%/Video Maker/voices`).

## Prueba manual del motor real (no ejecutable en CI)

En CI los binarios (~400 MB) no están disponibles, así que la prueba E2E usa el motor
**simulado** (`app/workers/voice-worker.js`) y la alineación simulada. Para validar el
motor real, tras colocar los binarios en `vendor/`:

1. `npm start` con `vendor/kokoro` y `vendor/whisper` colocados.
2. Comprobar que el selector de voces no muestra aviso de "no disponible".
3. Pulsar "Generar voz" con un texto corto; debe crear un `.wav` real en
   `userData/voices` y mostrarlo en la lista.
4. Verificar la duración con `ffprobe`:
   `ffprobe -v error -show_entries format=duration -of default=nw=1 userData/voices/voz-*.wav`
   → debe ser **> 0**.
5. Pulsar "Sincronizar escenas" y comprobar que se guardan `words` por escena.

## Modo de prueba (CI)

En CI (`NODE_ENV=test` / `ELECTRON_TEST=1`) se usa un motor de voz **simulado**
(`app/workers/voice-worker.js`) que genera un `.wav` real en un proceso hijo, y una
alineación simulada. No se descargan modelos reales ni se necesitan binarios.

## GPU

- Backend de alineación: **Vulkan** si hay binario compatible de whisper.cpp; en
  caso contrario CPU.
- Voz: CPU por defecto, con opción "Probar DirectML" (ONNX Runtime) y respaldo
  automático a CPU si la GPU falla.
