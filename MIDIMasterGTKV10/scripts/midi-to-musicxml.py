#!/usr/bin/env python3
"""Convert MIDI to MusicXML for Verovio (requires music21)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from strip_musicxml_titles import strip_titles


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: midi-to-musicxml.py input.mid output.musicxml", file=sys.stderr)
        return 1

    try:
        from music21 import converter, tempo as m21tempo
    except ImportError:
        print(
            "music21 is not installed. Run:\n"
            "  pip install --user music21\n"
            "or: sudo apt-get install python3-pip && pip install music21",
            file=sys.stderr,
        )
        return 2

    src, dst = sys.argv[1], sys.argv[2]
    try:
        score = converter.parse(src)
        if score.metadata:
            score.metadata.title = ""
            score.metadata.movementName = ""
            score.metadata.movementNumber = ""
            score.metadata.composer = ""
        for mark in list(score.recurse().getElementsByClass(m21tempo.MetronomeMark)):
            site = mark.activeSite
            if site is not None:
                site.remove(mark)
        score.write("musicxml", dst)
        strip_titles(dst)
    except Exception as exc:
        print(f"Conversion failed: {exc}", file=sys.stderr)
        return 3

    return 0


if __name__ == "__main__":
    sys.exit(main())
