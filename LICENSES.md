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
  grafema-a-fonema. El inglés no lo requiere (misaki, MIT). Si se redistribuye un
  paquete con espeak-ng incrustado, revisar la implicación GPL.

## Voz de respaldo: Piper

- Código Piper (rhasspy/piper): **MIT**.
- Pesos por voz: licencia individual (CC0, CC-BY, etc.). Verificar la licencia de
  cada voz concreta antes de distribuirla.

## Alineación (Whisper): whisper.cpp

- whisper.cpp (ggerganov): **MIT**.
- Pesos de Whisper: licencia del modelo original (MIT para las distribuciones
  comunitarias `tiny`/`base`/`small`/`medium`; revisar el repo del modelo elegido).

## Cómo instalar los motores reales (prueba manual)

La app no falla si faltan los motores: muestra un aviso con instrucciones.

1. Kokoro (ONNX): descargar `kokoro-v1.0.onnx` y `voices-v1.0.bin` en
   `userData/models`, y un ejecutable que los consuma. Definir `VM_KOKORO_BIN`
   (ruta absoluta) y opcionalmente `VM_KOKORO_MODEL`.
2. Piper (respaldo): definir `VM_PIPER_BIN` (ruta absoluta) y `VM_PIPER_MODEL`.
3. Whisper (alineación): binario `whisper.cpp` y modelo `ggml-*.bin` en
   `userData/models`. Definir `VM_WHISPER_BIN` y `VM_WHISPER_MODEL`.

## Modo de prueba (CI)

En CI (`NODE_ENV=test` / `ELECTRON_TEST=1`) se usa un motor de voz **simulado**
(`app/workers/voice-worker.js`) que genera un `.wav` real en un proceso hijo, y una
alineación simulada. No se descargan modelos reales durante las pruebas.

## GPU

- Backend de alineación: **Vulkan** si hay binario compatible de whisper.cpp; en
  caso contrario CPU.
- Voz: CPU por defecto, con opción "Probar DirectML" (ONNX Runtime) y respaldo
  automático a CPU si la GPU falla.
