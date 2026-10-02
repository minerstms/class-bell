"""Self-contained entry point for Kokoro. ClassBell runs the frozen program, not Python."""

import argparse
import sys
import wave
from pathlib import Path

import numpy as np


def prepare_espeak():
    if not getattr(sys, "frozen", False):
        return
    import espeakng_loader

    data = Path(espeakng_loader.get_data_path())
    library = Path(espeakng_loader.get_library_path())
    if not data.is_dir() or not library.is_file():
        raise SystemExit(f"Bundled espeak-ng was not found ({data}, {library}).")


def main():
    prepare_espeak()
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--voices", required=True)
    parser.add_argument("--voice", required=True)
    parser.add_argument("--output_file", required=True)
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--lang", default="en-gb")
    args = parser.parse_args()
    text = " ".join(sys.stdin.read().replace("\r", " ").replace("\n", " ").split()).strip()
    if not text:
        raise SystemExit("There is no text to speak.")
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(args.model, args.voices)
    if args.voice not in list(kokoro.voices.files):
        raise SystemExit(f"Voice {args.voice} is not in this voice pack.")
    samples, rate = kokoro.create(
        text,
        voice=args.voice,
        speed=float(args.speed),
        lang=args.lang,
    )
    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2")
    destination = Path(args.output_file)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(int(rate))
        handle.writeframes(pcm.tobytes())


if __name__ == "__main__":
    main()
