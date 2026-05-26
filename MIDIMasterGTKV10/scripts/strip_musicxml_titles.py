#!/usr/bin/env python3
"""Remove titles, credits, and part labels from MusicXML before Verovio engraving."""
import sys
import xml.etree.ElementTree as ET

# Elements removed so Verovio does not engrave text at the top of the score.
_STRIP_TAGS = frozenset({
    "credit",
    "movement-title",
    "work-title",
    "movement-number",
    "identification",
    "part-name",
    "part-abbreviation",
    "instrument-name",
    "instrument-abbreviation",
    "creator",
    "rights",
})


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def strip_metronome_marks(root: ET.Element, parent_map: dict) -> None:
    """Remove visual metronome marks (e.g. quarter=100).

    Verovio draws beat-unit notes with SMuFL glyphs; GdkPixbuf/librsvg often
  cannot load the embedded Leipzig text font, so U+E1D5 displays as garbage
  (e.g. '막=100' on Korean systems). Playback tempo is unchanged (MIDI/sound).
    """
    remove = []
    for elem in root.iter():
        if _local(elem.tag) != "direction":
            continue
        for child in list(elem):
            if _local(child.tag) != "direction-type":
                continue
            if any(_local(g.tag) == "metronome" for g in child.iter()):
                remove.append(child)

    for elem in remove:
        parent = parent_map.get(elem)
        if parent is not None:
            parent.remove(elem)


def strip_titles(path: str) -> None:
    tree = ET.parse(path)
    root = tree.getroot()
    parent_map = {child: parent for parent in tree.iter() for child in parent}

    remove = []
    for elem in root.iter():
        if _local(elem.tag) in _STRIP_TAGS:
            remove.append(elem)

    for elem in remove:
        parent = parent_map.get(elem)
        if parent is not None:
            parent.remove(elem)

    strip_metronome_marks(root, parent_map)

    # Drop empty <work> left after removing work-title
    for elem in list(root):
        if _local(elem.tag) == "work" and len(list(elem)) == 0 and not (elem.text and elem.text.strip()):
            root.remove(elem)

    tree.write(path, encoding="UTF-8", xml_declaration=True)


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: strip_musicxml_titles.py file.musicxml", file=sys.stderr)
        return 1
    try:
        strip_titles(sys.argv[1])
    except Exception as exc:
        print(f"strip_musicxml_titles failed: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
