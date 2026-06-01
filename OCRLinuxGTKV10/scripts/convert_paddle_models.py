#!/usr/bin/env python3
"""
PP-OCRv5 Korean 모델 → ONNX 변환 (빌드 시 1회 실행)

1. paddle2onnx 설치 (paddlepaddle 불필요, standalone 변환)
2. PP-OCRv5 Korean rec .pdiparams 다운로드
3. ONNX 변환 → models/paddle_onnx/rec.onnx

실패 시 조용히 종료 (Makefile이 PP-OCRv1 fallback을 처리)
"""
import os
import sys
import shutil
import subprocess
import tempfile
import urllib.request

# ── 대상 경로 ───────────────────────────────────────────────────────────────
OUTPUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "models/paddle_onnx"
OUTPUT_REC = os.path.join(OUTPUT_DIR, "rec.onnx")

# PP-OCRv5 Korean recognition model (PaddleOCR inference format)
REC_JSON_URL   = "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/inference.json"
REC_PARAMS_URL = "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec/resolve/main/inference.pdiparams"

# 변환 후 rec.onnx 최소 크기 (v5 모델은 ~3 MB 이상)
MIN_SIZE_BYTES = 2_000_000


def log(msg):
    print(f"       {msg}", flush=True)


def try_install_paddle2onnx():
    try:
        import paddle2onnx  # noqa: F401
        return True
    except ImportError:
        pass
    log("→ paddle2onnx 설치 중...")
    r = subprocess.run(
        [sys.executable, "-m", "pip", "install", "paddle2onnx", "-q",
         "--disable-pip-version-check"],
        capture_output=True)
    if r.returncode != 0:
        return False
    try:
        import paddle2onnx  # noqa: F401
        return True
    except ImportError:
        return False


def download(url, dest):
    log(f"↓ {os.path.basename(dest)}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "OCRLinuxGTKV10/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, \
             open(dest, "wb") as f:
            shutil.copyfileobj(resp, f)
        return True
    except Exception as e:
        log(f"다운로드 실패: {e}")
        return False


def convert(model_dir, output_path):
    """paddle2onnx CLI로 변환 (dynamic width axis 설정)."""
    cmd = [
        sys.executable, "-m", "paddle2onnx",
        "--model_dir",        model_dir,
        "--model_filename",   "inference.json",
        "--params_filename",  "inference.pdiparams",
        "--save_file",        output_path,
        "--opset_version",    "11",
        "--input_shape_dict", '{"x": [1, 3, 48, -1]}',
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        log(f"변환 오류: {r.stderr[:200]}")
        return False
    return os.path.isfile(output_path) and os.path.getsize(output_path) >= MIN_SIZE_BYTES


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 이미 v5 ONNX가 있으면 건너뜀 (크기로 구별: v1=3.2MB, v5=3MB+)
    if os.path.isfile(OUTPUT_REC) and os.path.getsize(OUTPUT_REC) >= MIN_SIZE_BYTES:
        # v1과 v5는 같은 크기일 수 있으므로 강제 재변환 방지 flag 확인
        flag = OUTPUT_REC + ".v5"
        if os.path.isfile(flag):
            log("rec.onnx (PP-OCRv5) 이미 존재")
            return

    if not try_install_paddle2onnx():
        log("paddle2onnx 없음 — PP-OCRv1 fallback 사용")
        sys.exit(0)

    with tempfile.TemporaryDirectory() as tmpdir:
        json_path   = os.path.join(tmpdir, "inference.json")
        params_path = os.path.join(tmpdir, "inference.pdiparams")

        if not download(REC_JSON_URL, json_path):
            sys.exit(0)
        if not download(REC_PARAMS_URL, params_path):
            sys.exit(0)

        log("→ PP-OCRv5 Korean → ONNX 변환 중...")
        if not convert(tmpdir, OUTPUT_REC):
            log("변환 실패 — PP-OCRv1 fallback 사용")
            # 실패한 파일 제거
            if os.path.isfile(OUTPUT_REC):
                os.remove(OUTPUT_REC)
            sys.exit(0)

    # 성공 표시
    open(OUTPUT_REC + ".v5", "w").close()
    log(f"✔ rec.onnx (PP-OCRv5 Korean ONNX, "
        f"{os.path.getsize(OUTPUT_REC) // 1024} KB)")


if __name__ == "__main__":
    main()
