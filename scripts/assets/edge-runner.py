import argparse
import asyncio
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


async def synthesize_chunk(communicate, output_path):
    """Synthesize a single chunk and save as WAV."""
    try:
        with open(output_path, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
        return True
    except Exception as exc:
        emit({"type": "error", "message": f"fallo la sintesis: {exc}"})
        return False


def mp3_to_wav(mp3_path, wav_path):
    """Convert MP3 to 48kHz stereo WAV using ffmpeg."""
    import subprocess
    try:
        result = subprocess.run([
            "ffmpeg", "-y", "-i", mp3_path,
            "-ar", "48000", "-ac", "2",
            "-c:a", "pcm_s16le", wav_path
        ], capture_output=True, timeout=60)
        if result.returncode != 0:
            emit({"type": "error", "message": f"ffmpeg conversion failed: {result.stderr.decode()}"})
            return False
        return True
    except Exception as exc:
        emit({"type": "error", "message": f"ffmpeg error: {exc}"})
        return False


def get_wav_duration(wav_path):
    """Get duration of WAV file."""
    try:
        with wave.open(wav_path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / float(rate)
    except Exception:
        return 0.0


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", default="es-MX-JorgeNeural")
    parser.add_argument("--lang", default="es")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--rate", default="+6%")
    parser.add_argument("--pitch", default="+0Hz")
    args = parser.parse_args()

    payload = read_payload()
    text = str(payload.get("text") or "").strip()
    voice = payload.get("voiceId") or args.voice
    lang = payload.get("language") or args.lang
    speed = float(payload.get("speed") or args.speed)
    rate = payload.get("rate") or args.rate
    pitch = payload.get("pitch") or args.pitch
    output = payload.get("outputPath") or args.output

    if not text:
        emit({"type": "error", "message": "no se recibio texto para sintetizar"})
        return 3

    try:
        import edge_tts
    except Exception as exc:
        emit({"type": "error", "message": f"no se pudo importar edge_tts: {exc}"})
        return 5

    emit({"type": "progress", "progress": 10, "message": "preparando sintesis"})

    try:
        # edge-tts rate format: "+6%" or "-10%"
        # edge-tts pitch format: "+0Hz" or "-10Hz"
        # edge-tts doesn't have speed parameter, rate is used instead
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    except Exception as exc:
        emit({"type": "error", "message": f"error creando communicate: {exc}"})
        return 6

    # Create temp MP3 file
    mp3_path = output.replace(".wav", ".mp3")
    directory = os.path.dirname(os.path.abspath(mp3_path))
    if directory:
        os.makedirs(directory, exist_ok=True)

    emit({"type": "progress", "progress": 30, "message": "sintetizando voz"})

    try:
        await communicate.save(mp3_path)
    except Exception as exc:
        emit({"type": "error", "message": f"fallo la sintesis: {exc}"})
        return 6

    emit({"type": "progress", "progress": 80, "message": "convirtiendo audio"})

    # Convert MP3 to 48kHz stereo WAV
    if not mp3_to_wav(mp3_path, output):
        return 7

    # Clean up temp MP3
    try:
        os.remove(mp3_path)
    except Exception:
        pass

    duration = get_wav_duration(output)
    emit({"type": "progress", "progress": 100, "message": "listo"})
    emit({"type": "done", "outputPath": output, "duration": duration})
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))