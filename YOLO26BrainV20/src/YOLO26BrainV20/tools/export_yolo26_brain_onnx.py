# Export a trained Ultralytics YOLO model (detect or segment, e.g. YOLO26n-seg) to ONNX for YOLO26BrainV20 (C#).
# Usage:
#   pip install -r requirements-export.txt
#   python export_yolo26_brain_onnx.py --weights best.pt --out brain_seg.onnx
#
# For segmentation, --weights should be a segment checkpoint (e.g. runs/segment/train/weights/best.pt).

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--weights",
        required=True,
        help="Trained .pt checkpoint (e.g. runs/segment/train/weights/best.pt for YOLO26n-seg)",
    )
    p.add_argument("--out", default="brain.onnx", help="Output ONNX path")
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--opset", type=int, default=12)
    args = p.parse_args()

    from ultralytics import YOLO

    model = YOLO(args.weights)
    exported = model.export(
        format="onnx",
        imgsz=args.imgsz,
        opset=args.opset,
        simplify=True,
    )
    import shutil

    out_path = exported[0] if isinstance(exported, (list, tuple)) else exported
    out_path = str(out_path)
    if Path(args.out).resolve() != Path(out_path).resolve():
        shutil.move(out_path, args.out)
        print("Wrote", args.out)
    else:
        print("Wrote", out_path)


if __name__ == "__main__":
    main()
