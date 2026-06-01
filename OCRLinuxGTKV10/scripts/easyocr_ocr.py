#!/usr/bin/env python3
"""EasyOCR bridge for OCRLinuxGTKV10 — outputs JSON to stdout."""
import json
import os
import sys


def build_line(words):
    words = sorted(words, key=lambda w: w["x"])
    return {
        "text": " ".join(w["text"] for w in words),
        "words": [
            {"text": w["text"], "x": w["x"], "y": w["y"], "w": w["w"], "h": w["h"]}
            for w in words
        ],
    }


def num(v):
    return float(v) if hasattr(v, "item") else float(v)


def map_result(detections):
    entries = []
    if not detections:
        return {"text": "", "lines": []}

    for bbox, text, conf in detections:
        text = (text or "").strip()
        if not text:
            continue
        xs = [num(p[0]) for p in bbox]
        ys = [num(p[1]) for p in bbox]
        x, y = min(xs), min(ys)
        w, h = max(xs) - x, max(ys) - y
        cy = y + h / 2.0
        entries.append({"text": text, "x": x, "y": y, "w": w, "h": h, "cy": cy})

    entries.sort(key=lambda e: (e["cy"], e["x"]))
    lines = []
    current = []
    line_y = None
    threshold = 15.0

    for e in entries:
        if line_y is None or abs(e["cy"] - line_y) > threshold:
            if current:
                lines.append(build_line(current))
            current = [e]
            line_y = e["cy"]
        else:
            current.append(e)

    if current:
        lines.append(build_line(current))

    text = "\n".join(line["text"] for line in lines)
    return {"text": text, "lines": lines}


def emit_json(data):
    sys.stdout.write(json.dumps(data, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def main():
    if len(sys.argv) < 2:
        emit_json({"error": "usage: easyocr_ocr.py <image> [models_dir]"})
        sys.exit(1)

    image_path = sys.argv[1]
    model_dir = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        import easyocr
    except ImportError as exc:
        emit_json({"error": f"easyocr not installed: {exc}"})
        sys.exit(2)

    try:
        kwargs = {"lang_list": ["ko", "en"], "gpu": False, "verbose": False}
        if model_dir:
            kwargs["model_storage_directory"] = model_dir
        reader = easyocr.Reader(**kwargs)
        result = reader.readtext(image_path)
        emit_json(map_result(result))
    except Exception as exc:
        emit_json({"error": str(exc)})
        sys.exit(3)


if __name__ == "__main__":
    main()
