"""
YOLO26 Detect 가중치(.pt)를 Ultralytics 릴리스에서 받고 ONNX로 내보냅니다.

사용 예:
  python python/download_and_export_onnx.py
  python python/download_and_export_onnx.py --model yolo26s.pt
  python python/download_and_export_onnx.py --models-dir D:\\weights
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 같은 폴더의 yolo26_detect 모듈
sys.path.insert(0, str(Path(__file__).resolve().parent))
from yolo26_detect import download_weights


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    default_models = root / "models"

    p = argparse.ArgumentParser(
        description="YOLO26 .pt 다운로드 후 ONNX 변환 (C# 샘플은 기본 e2e 출력 사용)"
    )
    p.add_argument(
        "--models-dir",
        type=Path,
        default=default_models,
        help="가중치·ONNX 저장 폴더 (기본: 프로젝트/models)",
    )
    p.add_argument(
        "--model",
        default="yolo26n.pt",
        help="모델 파일명 또는 베이스명 (예: yolo26n, yolo26n.pt)",
    )
    p.add_argument("--imgsz", type=int, default=640, help="입력 크기")
    p.add_argument(
        "--no-end2end",
        action="store_true",
        help="one-to-many 헤드로 내보냄 (기본 e2e와 출력 형식이 달라짐)",
    )
    p.add_argument(
        "--skip-download",
        action="store_true",
        help="이미 .pt가 있다고 가정하고 다운로드 단계만 건너뜀(파일 없으면 실패)",
    )
    args = p.parse_args()

    models_dir = args.models_dir.resolve()
    models_dir.mkdir(parents=True, exist_ok=True)

    if args.skip_download:
        from yolo26_detect import resolve_weights_path

        weights = resolve_weights_path(args.model, models_dir)
        if not weights.exists():
            raise SystemExit(f"--skip-download 인데 파일이 없습니다: {weights}")
    else:
        weights = download_weights(args.model, models_dir)

    print("ONNX 변환 중...")
    from ultralytics import YOLO

    m = YOLO(str(weights))
    out = m.export(
        format="onnx",
        imgsz=args.imgsz,
        simplify=True,
        end2end=not args.no_end2end,
    )
    out_path = Path(out)
    print(f"완료: {out_path.resolve()}")


if __name__ == "__main__":
    main()
