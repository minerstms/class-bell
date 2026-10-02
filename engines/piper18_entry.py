"""Self-contained entry point for Piper 1.8. ClassBell runs the frozen program, not Python."""

import sys
from pathlib import Path


def piper_data_dir():
    if not getattr(sys, "frozen", False):
        return None
    roots = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        roots.append(Path(meipass))
    roots.append(Path(sys.executable).resolve().parent / "_internal")
    for root in roots:
        candidate = root / "piper" / "espeak-ng-data"
        if candidate.is_dir():
            return candidate
    return None


def main():
    import piper.phonemize_espeak as phonemize_espeak
    import piper.voice as voice

    found = piper_data_dir()
    if found is not None:
        phonemize_espeak.ESPEAK_DATA_DIR = found
        voice.ESPEAK_DATA_DIR = found
    from piper.__main__ import main as piper_main

    piper_main()


if __name__ == "__main__":
    main()
