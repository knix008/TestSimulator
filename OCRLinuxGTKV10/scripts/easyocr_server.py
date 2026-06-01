#!/usr/bin/env python3
"""
EasyOCR 영속 서버 — 모델을 한 번 로딩하고 stdin 이미지 경로를 처리합니다.

프로토콜:
  시작 시 → {"status":"ready"} 또는 {"status":"error","message":"..."} 출력
  인식 시 → stdin 에서 이미지 경로 한 줄 읽기
           → stdout 에 JSON 결과 한 줄 출력
"""
import json
import sys
import os
import warnings

warnings.filterwarnings("ignore")

def num(v):
    return float(v) if hasattr(v, "item") else float(v)


def build_line(words):
    words = sorted(words, key=lambda w: w["x"])
    return {
        "text": " ".join(w["text"] for w in words),
        "words": [{"text": w["text"], "x": w["x"], "y": w["y"],
                   "w": w["w"], "h": w["h"]} for w in words],
    }


def map_result(detections):
    if not detections:
        return {"text": "", "lines": []}

    entries = []
    for bbox, text, _conf in detections:
        text = (text or "").strip()
        if not text:
            continue
        xs = [num(p[0]) for p in bbox]
        ys = [num(p[1]) for p in bbox]
        x, y = min(xs), min(ys)
        w, h = max(xs) - x, max(ys) - y
        entries.append({"text": text, "x": x, "y": y, "w": w, "h": h,
                         "cy": y + h / 2.0})

    entries.sort(key=lambda e: (e["cy"], e["x"]))
    lines, current, line_y = [], [], None
    for e in entries:
        if line_y is None or abs(e["cy"] - line_y) > 15.0:
            if current:
                lines.append(build_line(current))
            current, line_y = [e], e["cy"]
        else:
            current.append(e)
    if current:
        lines.append(build_line(current))

    return {"text": "\n".join(l["text"] for l in lines), "lines": lines}


def emit(data):
    sys.stdout.write(json.dumps(data, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    model_dir = sys.argv[1] if len(sys.argv) > 1 else None

    # ── 모델 로딩 (최초 1회) — loading 상태를 stdout 으로 보내 UI 진행 표시 ──
    emit({"status": "loading", "message": "EasyOCR 패키지 확인 중..."})
    try:
        import easyocr
    except ImportError as e:
        emit({"status": "error", "message": f"easyocr not installed: {e}"})
        sys.exit(1)

    emit({"status": "loading", "message": "한국어·영어 모델 로딩 중 (최초 1회, 수 분 걸릴 수 있음)..."})
    try:
        kwargs = {"lang_list": ["ko", "en"], "gpu": False, "verbose": False}
        if model_dir:
            os.makedirs(model_dir, exist_ok=True)
            kwargs["model_storage_directory"] = model_dir
        reader = easyocr.Reader(**kwargs)
    except Exception as e:
        emit({"status": "error", "message": str(e)})
        sys.exit(1)

    emit({"status": "ready"})

    # ── 이미지 요청 루프 ─────────────────────────────────────────────
    for line in sys.stdin:
        path = line.strip()
        if not path:
            continue
        try:
            result = reader.readtext(path)
            emit(map_result(result))
        except Exception as e:
            emit({"error": str(e)})


if __name__ == "__main__":
    main()
