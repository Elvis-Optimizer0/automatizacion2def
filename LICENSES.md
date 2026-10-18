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
- `soundfile` (libsndfile, Bastian Bechtold / Erik de Castro Lopo): **BSD-3-Clause**.
- `numpy`: **BSD-3-Clause**. `phonemizer` (Mathieu Bernard): **GPL-3.0**.
- `espeakng-loader`: **GPL-3.0** (empaqueta espeak-ng).
- Python embebido (python.org, PSF): **PSF-2.0**.

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

Motores completos dentro del instalador, sin variables de entorno. **El instalador
pesa ~400 MB más** (≈ 250 MB de Python + paquetes y ≈ 490 MB de modelos; total
final del instalador del orden de ~700 MB). Los binarios **no se versionan** (límite
de 100 MB de GitHub): se obtienen con `npm run fetch-engines`, que descarga, verifica
SHA-256 y deja todo en `vendor/`. En la app instalada, `extraResources` copia
`vendor/kokoro` → `resources/kokoro` y `vendor/whisper` → `resources/whisper`; la app
resuelve las rutas sola (`app/core/runtime-paths.js`). `vendor/` está en `.gitignore`.

Versiones fijadas por el script (verificadas 2026-10-18):

| Componente | Origen | Versión |
| --- | --- | --- |
| Python embebido Windows x64 | python.org | 3.13.16 |
| pip (bootstrap) | PyPI (`pip`) | 26.2.1 |
| kokoro-onnx | PyPI | 0.6.1 |
| onnxruntime | PyPI | 1.31.0 |
| numpy | PyPI | 2.5.4 |
| soundfile | PyPI | 0.14.0 |
| phonemizer | PyPI | 3.4.0 |
| espeakng-loader | PyPI | 0.2.4 |
| espeak-ng (datos + DLL) | GitHub espeak-ng | 1.52.0 |
| whisper.cpp (Windows x64) | GitHub whisper.cpp | b5454 |
| Kokoro-82M ONNX + voces | GitHub kokoro-onnx | v1.0 / v1.1 |
| ggml-base.bin (Whisper) | Hugging Face whisper.cpp | base |

Layout generado:

```
vendor/kokoro/                      -> resources/kokoro/
  runtime/kokoro-runtime.exe        (lanzador C# compilado que invoca el Python embebido)
  runtime/runner.py                 (síntesis kokoro-onnx -> wav 24 kHz)
  runtime/python/                   (Python 3.13.16 embebido + pip + paquetes)
  espeak-ng/                        (espeak-ng.exe, libespeak-ng.dll, espeak-ng-data; GPL-3.0)
  models/kokoro-v1.0.onnx
  models/voices-v1.0.bin

vendor/whisper/                     -> resources/whisper/
  bin/whisper-cli.exe + DLLs        (whisper.cpp, build CPU)
  models/ggml-base.bin
```

`kokoro-runtime.exe` acepta `--output <ruta.wav> --voice <id> --lang <es|en> [--speed]`
y además recibe el texto por stdin como JSON (lo envía la app).

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
