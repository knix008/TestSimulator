# Export a trained Ultralytics YOLO model (detect or segment, e.g. YOLO11n-seg) to ONNX for YOLO11BrainV10 (C#).
# Usage:
#   pip install -r requirements-export.txt
#   python export_yolo11_brain_onnx.py --weights best.pt --out brain_seg.onnx
#
# For segmentation, --weights should be a segment checkpoint (e.g. runs/segment/train/weights/best.pt).

from __future__ import annotations

import argparse
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

YOLO11_SEG_ONNX_DEFAULT_NAME = "brain_ct_yolo11n_seg.onnx"


def _ensure_python_deps(*, auto_install: bool) -> None:
    if importlib.util.find_spec("ultralytics") is not None:
        return
    if not auto_install:
        raise ModuleNotFoundError(
            "ultralytics is not installed. Run pip install -r requirements-export.txt "
            "or re-run with --auto-install."
        )

    tools_dir = Path(__file__).resolve().parent
    req = tools_dir / "requirements-export.txt"
    env = os.environ.copy()
    pip_cmd = [sys.executable, "-m", "pip", "install"]

    if req.is_file():
        subprocess.run(pip_cmd + ["-r", str(req)], check=True, env=env)
    else:
        subprocess.run(pip_cmd + ["ultralytics", "onnx", "onnxsim"], check=True, env=env)

    if importlib.util.find_spec("ultralytics") is None:
        raise ModuleNotFoundError("ultralytics import failed after install.")


def _default_weights(repo: Path | None) -> Path | None:
    if repo is None:
        return None
    p = repo / "runs" / "brain_ct_seg" / "train" / "weights" / "best.pt"
    return p if p.is_file() else None


def main() -> None:
    p = argparse.ArgumentParser(
        description="Export trained Ultralytics YOLO (.pt) to ONNX from Python."
    )
    p.add_argument(
        "--weights",
        default=None,
        help="Trained .pt checkpoint (e.g. runs/segment/train/weights/best.pt for YOLO11n-seg)",
    )
    p.add_argument("--out", default=YOLO11_SEG_ONNX_DEFAULT_NAME, help="Output ONNX path")
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--opset", type=int, default=12)
    p.add_argument(
        "--repo",
        type=Path,
        default=None,
        help="Optional repo root. If --weights is omitted, use runs/brain_ct_seg/train/weights/best.pt",
    )
    p.add_argument(
        "--auto-install",
        action="store_true",
        help="Auto-install Python deps if missing",
    )
    args = p.parse_args()

    weights_path: Path | None = Path(args.weights).expanduser().resolve() if args.weights else None
    if weights_path is None:
        repo = args.repo.expanduser().resolve() if args.repo else None
        weights_path = _default_weights(repo)
    if weights_path is None or not weights_path.is_file():
        raise SystemExit(
            "Missing --weights .pt file. Provide --weights, or pass --repo with "
            "runs/brain_ct_seg/train/weights/best.pt present."
        )

    _ensure_python_deps(auto_install=args.auto_install)
    from ultralytics import YOLO

    yolo11_model = YOLO(str(weights_path))
    exported = yolo11_model.export(
        format="onnx",
        imgsz=args.imgsz,
        opset=args.opset,
        simplify=True,
    )
    import shutil

    dest = Path(args.out).expanduser().resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    out_path = exported[0] if isinstance(exported, (list, tuple)) else exported
    out_path = Path(str(out_path)).expanduser().resolve()
    if dest != out_path:
        shutil.move(str(out_path), str(dest))
        print("Wrote", dest)
    else:
        print("Wrote", out_path)


if __name__ == "__main__":
    main()
