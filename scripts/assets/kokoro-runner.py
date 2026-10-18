import argparse
import json
import os
import sys
import wave


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def read_payload():
    try:
        if sys.stdin is None or sys.stdin.isatty():
            return {}
        raw = sys.stdin.read()
        if raw and raw.strip():
            return json.loads(raw)
    except Exception:
        return {}
    return {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", default="ef_dora")
    parser.add_argument("--lang", default="es")
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    payload = read_payload()
    text = str(payload.get("text") or "").strip()
    voice = payload.get("voiceId") or args.voice
    lang = payload.get("language") or args.lang
    speed = float(payload.get("speed") or args.speed)
    output = payload.get("outputPath") or args.output

    if not text:
        emit({"type": "error", "message": "no se recibio texto para sintetizar"})
        return 3

    here = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.abspath(os.path.join(here, "..", "models"))
    model_path = os.path.join(models_dir, "kokoro-v1.0.onnx")
    voices_path = os.path.join(models_dir, "voices-v1.0.bin")
    for path in (model_path, voices_path):
        if not os.path.exists(path):
            emit({"type": "error", "message": "falta el modelo: " + path})
            return 4

    try:
        from kokoro_onnx import Kokoro
        import numpy as np
    except Exception as exc:
        emit({"type": "error", "message": "no se pudo importar kokoro_onnx: %s" % exc})
        return 5

    emit({"type": "progress", "progress": 15, "message": "cargando modelo"})
    try:
        kokoro = Kokoro(model_path, voices_path)
        emit({"type": "progress", "progress": 45, "message": "sintetizando"})
        samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
    except Exception as exc:
        emit({"type": "error", "message": "fallo la sintesis: %s" % exc})
        return 6

    directory = os.path.dirname(os.path.abspath(output))
    if directory:
        os.makedirs(directory, exist_ok=True)
    pcm = np.clip(np.asarray(samples) * 32767.0, -32768, 32767).astype("<i2")
    with wave.open(output, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(int(sample_rate))
        handle.writeframes(pcm.tobytes())

    duration = len(pcm) / float(sample_rate)
    emit({"type": "progress", "progress": 100, "message": "listo"})
    emit({"type": "done", "outputPath": output, "duration": duration})
    return 0


if __name__ == "__main__":
    sys.exit(main())
