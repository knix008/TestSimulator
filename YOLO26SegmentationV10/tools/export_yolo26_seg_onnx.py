"""
Export Ultralytics YOLO26-seg weights to ONNX (called from C# app).
Requires: pip install ultralytics
"""
import argparse
import shutil
import sys
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--weights", required=True, help="Path to .pt weights")
    p.add_argument("--out", required=True, help="Output .onnx path")
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--opset", type=int, default=12)
    args = p.parse_args()

    weights = Path(args.weights)
    out = Path(args.out)
    if not weights.is_file():
        print(f"ERROR: weights not found: {weights}", file=sys.stderr)
        return 2

    try:
        from ultralytics import YOLO
    except ImportError:
        print(
            "ERROR: ultralytics not installed. Run: pip install ultralytics",
            file=sys.stderr,
        )
        return 3

    out.parent.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(weights))
    model.export(
        format="onnx",
        imgsz=args.imgsz,
        simplify=True,
        opset=args.opset,
        half=False,
    )
    produced = weights.with_suffix(".onnx")
    if not produced.is_file():
        print(f"ERROR: export did not create {produced}", file=sys.stderr)
        return 4

    if produced.resolve() != out.resolve():
        shutil.move(str(produced), str(out))
    print(f"OK: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
