# -*- coding: utf-8 -*-
"""
뇌 CT 슬라이스용 파이프라인 예시: 가중치 다운로드 → 세그멘테이션·검출 추론 → (선택) ONNX보내기.

중요 (도메인):
  - Ultralytics 기본 체크포인트(yolo11n-seg.pt, yolo11n.pt)는 **COCO**로 사전학습된 범용 모델입니다.
    의료 뇌 CT에 맞는 결과를 얻으려면 **뇌 CT(또는 MRI) 라벨**로 파인튜닝한 뒤 export 하세요.
    학습 예: train_yolo11n_seg_brain_ct.py, ONNX: export_yolo11_brain_onnx.py

동작:
  1) 첫 실행 시 Ultralytics가 yolo11n-seg / yolo11n 가중치를 캐시에 받습니다.
  2) (기본) Ultralytics 뇌 종양 데모 슬라이스 이미지를 받아 같은 출력 폴더에 저장합니다.
  3) 세그 모델로 인스턴스 세그(박스+마스크), 검출 모델로 박스 검출을 각각 실행하고 결과 이미지를 저장합니다.
  4) --export-onnx 를 주면 두 모델을 ONNX로보냅니다 (C# 앱에서 사용 가능).

의존성:
  pip install -r requirements-export.txt

예:
  python brain_ct_yolo_download_and_infer.py --out runs/brain_ct_demo
  python brain_ct_yolo_download_and_infer.py --image path/to/slice.png --out runs/out --export-onnx
"""

from __future__ import annotations

import argparse
import shutil
import urllib.request
from pathlib import Path


BRAIN_SAMPLE_URL = (
    "https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor-sample.jpg"
)
BRAIN_SAMPLE_NAME = "brain_tumor_sample.jpg"


def _download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "YOLO11BrainV10-brain_ct_yolo_download_and_infer/1.0"},
    )
    with urllib.request.urlopen(req, timeout=300) as resp:  # noqa: S310 — fixed Ultralytics URL
        dest.write_bytes(resp.read())


def _ensure_sample_image(out_dir: Path, image_arg: str | None) -> Path:
    if image_arg:
        p = Path(image_arg).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(f"--image not found: {p}")
        return p
    target = out_dir / BRAIN_SAMPLE_NAME
    if not target.is_file():
        print(f"Downloading sample slice -> {target}")
        _download_file(BRAIN_SAMPLE_URL, target)
    else:
        print(f"Using existing sample: {target}")
    return target


def main() -> None:
    p = argparse.ArgumentParser(
        description="Download YOLO11n-seg + YOLO11n (Ultralytics cache), run seg + det, optional ONNX export.",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path("runs") / "brain_ct_demo",
        help="Output directory (images + predict runs + optional ONNX).",
    )
    p.add_argument(
        "--image",
        default=None,
        help="Input slice (PNG, JPEG, DICOM not handled here - use C# app). Default: download brain-tumor sample into --out.",
    )
    p.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Confidence threshold for predict().",
    )
    p.add_argument(
        "--export-onnx",
        action="store_true",
        help="Also export yolo11n-seg and yolo11n to ONNX in --out (for YOLO11BrainV10 C#).",
    )
    p.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Image size for predict/export.",
    )
    args = p.parse_args()

    out_dir: Path = args.out.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    from ultralytics import YOLO

    image_path = _ensure_sample_image(out_dir, args.image)
    print(f"Input image: {image_path}")

    # Triggers download into Ultralytics user cache on first use.
    print("Loading yolo11n-seg.pt (instance segmentation, COCO-pretrained) …")
    model_seg = YOLO("yolo11n-seg.pt")
    print("Loading yolo11n.pt (detection only, COCO-pretrained) …")
    model_det = YOLO("yolo11n.pt")

    # Ultralytics writes under project/name/
    seg_name = "predict_segmentation"
    det_name = "predict_detection"

    print("Running segmentation …")
    model_seg.predict(
        source=str(image_path),
        conf=args.conf,
        save=True,
        project=str(out_dir),
        name=seg_name,
        exist_ok=True,
        verbose=False,
    )

    print("Running detection …")
    model_det.predict(
        source=str(image_path),
        conf=args.conf,
        save=True,
        project=str(out_dir),
        name=det_name,
        exist_ok=True,
        verbose=False,
    )

    seg_vis = out_dir / seg_name / image_path.name
    det_vis = out_dir / det_name / image_path.name
    print("Done.")
    print(f"  Segmentation output: {seg_vis}")
    print(f"  Detection output:    {det_vis}")

    if args.export_onnx:
        onnx_dir = out_dir / "onnx"
        onnx_dir.mkdir(parents=True, exist_ok=True)
        seg_out = model_seg.export(format="onnx", imgsz=args.imgsz, simplify=True)
        det_out = model_det.export(format="onnx", imgsz=args.imgsz, simplify=True)
        seg_path = Path(seg_out[0] if isinstance(seg_out, (list, tuple)) else seg_out)
        det_path = Path(det_out[0] if isinstance(det_out, (list, tuple)) else det_out)
        dest_seg = onnx_dir / "yolo11n-seg.onnx"
        dest_det = onnx_dir / "yolo11n.onnx"
        shutil.copy2(seg_path, dest_seg)
        shutil.copy2(det_path, dest_det)
        print(f"  ONNX (seg): {dest_seg}")
        print(f"  ONNX (det): {dest_det}")
        print(
            "C# 앱: 세그 ONNX는 마스크 포함, 검출 ONNX는 박스만. "
            "클래스는 COCO 80개 — brain-tumor용 negative,positive 와 다르면 data.yaml에 맞게 학습·export 하세요."
        )


if __name__ == "__main__":
    main()
