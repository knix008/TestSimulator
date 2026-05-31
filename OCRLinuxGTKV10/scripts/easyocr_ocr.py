#!/usr/bin/env python3
"""EasyOCR bridge for OCRLinuxGTKV10 — outputs JSON to stdout."""
import json
import sys


def num(v):
    return float(v) if hasattr(v, "item") else float(v)


def map_result(results):
    lines = []
    for item in results or []:
        box, text, conf = item[0], item[1], item[2] if len(item) > 2 else 1.0
        text = (text or "").strip()
        if not text:
            continue
        xs = [num(p[0]) for p in box]
        ys = [num(p[1]) for p in box]
        x, y = min(xs), min(ys)
        w, h = max(xs) - x, max(ys) - y
        word = {"text": text, "x": x, "y": y, "w": w, "h": h}
        lines.append({"text": text, "words": [word]})

    full = "\n".join(line["text"] for line in lines)
    return {"text": full, "lines": lines}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: easyocr_ocr.py <image> [models_dir]"}))
        sys.exit(1)

    image_path = sys.argv[1]
    models_dir = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        import easyocr
    except ImportError as exc:
        print(json.dumps({"error": f"easyocr not installed: {exc}"}))
        sys.exit(2)

    try:
        reader = easyocr.Reader(
            ["ko", "en"],
            gpu=False,
            model_storage_directory=models_dir if models_dir else None,
            verbose=False,
        )
        results = reader.readtext(image_path)
        print(json.dumps(map_result(results), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(3)


if __name__ == "__main__":
    main()
