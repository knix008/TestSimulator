#!/usr/bin/env python3
"""PaddleOCR bridge for OCRLinuxGTKV10 — outputs JSON to stdout."""
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


def map_result(ocr_result):
    entries = []
    if not ocr_result:
        return {"text": "", "lines": []}

    for page in ocr_result:
        if not page:
            continue
        for item in page:
            box, text_info = item[0], item[1]
            text = text_info[0] if isinstance(text_info, (list, tuple)) else str(text_info)
            text = (text or "").strip()
            if not text:
                continue
            xs = [num(p[0]) for p in box]
            ys = [num(p[1]) for p in box]
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
        emit_json({"error": "usage: paddle_ocr.py <image> [models_root]"})
        sys.exit(1)

    image_path = sys.argv[1]

    os.environ.setdefault("GLOG_minloglevel", "3")

    try:
        from paddleocr import PaddleOCR
    except ImportError as exc:
        emit_json({"error": f"paddleocr not installed: {exc}"})
        sys.exit(2)

    try:
        # PaddleOCR 2.x: 내장 한국어 모델 사용 (V5 커스텀 모델은 API 버전별 호환 이슈)
        ocr = PaddleOCR(use_angle_cls=True, lang="korean", show_log=False)
        result = ocr.ocr(image_path, cls=True)
        emit_json(map_result(result))
    except Exception as exc:
        emit_json({"error": str(exc)})
        sys.exit(3)


if __name__ == "__main__":
    main()
