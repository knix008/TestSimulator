# -*- coding: utf-8 -*-
"""Train YOLO26n-seg on brain CT/MRI segmentation layout (Ultralytics).

Prerequisites:
  pip install -r requirements-train.txt
  python download_brain_dataset.py   # creates data/brain_ct_seg/data.yaml

Or run the full pipeline:
  python pipeline_train_brain.py
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path


YOLO26_SEG_MODEL_DEFAULT = "yolo26n-seg.pt"


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for path in [cur, *cur.parents]:
        if (path / "YOLO26BrainV20.sln").is_file() or (path / "YOLO26BrainV20.slnx").is_file():
            return path
    raise FileNotFoundError(
        f"Could not find YOLO26BrainV20.sln or YOLO26BrainV20.slnx from: {start}"
    )


def resolve_data_yaml(explicit_data: str | None, explicit_repo: str | None) -> str:
    if explicit_data:
        return str(Path(explicit_data).expanduser().resolve())

    if explicit_repo:
        repo = Path(explicit_repo).expanduser().resolve()
    else:
        repo = find_repo_root(Path(__file__).resolve().parent)

    yml = repo / "data" / "brain_ct_seg" / "data.yaml"
    if not yml.is_file():
        raise FileNotFoundError(
            f"Dataset YAML not found: {yml}\n"
            "Run: python tools/download_brain_dataset.py\n"
            "Or: python tools/pipeline_train_brain.py"
        )
    return str(yml)


def pick_device(user_device: str | None) -> str:
    if user_device:
        return user_device

    try:
        import torch

        if torch.cuda.is_available():
            return "0"
    except Exception:
        pass

    return "cpu"


def default_workers() -> int:
    try:
        n = os.cpu_count() or 4
        return max(1, min(8, n))
    except Exception:
        return 4


def main() -> int:
    p = argparse.ArgumentParser(
        description="Ultralytics YOLO26n-seg training for data/brain_ct_seg (segmentation).",
    )
    p.add_argument(
        "--data",
        default=None,
        help="Path to data.yaml (default: <repo>/data/brain_ct_seg/data.yaml).",
    )
    p.add_argument(
        "--repo",
        default=None,
        help="Repository root containing YOLO26BrainV20.sln (used when --data is omitted).",
    )
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument(
        "--model",
        default=YOLO26_SEG_MODEL_DEFAULT,
        help="Ultralytics checkpoint to start from (default: yolo26n-seg.pt).",
    )
    p.add_argument(
        "--project",
        default=None,
        help="Ultralytics project directory (default: <repo>/runs).",
    )
    p.add_argument(
        "--name",
        default="brain_ct_yolo26n_seg",
        help="Run name under project (default: brain_ct_yolo26n_seg).",
    )
    p.add_argument(
        "--exist-ok",
        action="store_true",
        help="Allow reusing an existing run directory (Ultralytics exist_ok).",
    )
    p.add_argument(
        "--device",
        default=None,
        help="Device, e.g. 0 or cpu. If omitted: GPU 0 when CUDA available, else cpu.",
    )
    p.add_argument(
        "--workers",
        type=int,
        default=None,
        help=f"Dataloader workers (default: min(8, cpu_count), currently {default_workers()}).",
    )
    p.add_argument("--patience", type=int, default=30, help="Early stopping patience (epochs).")
    p.add_argument("--seed", type=int, default=42, help="Random seed.")
    p.add_argument(
        "--no-amp",
        action="store_true",
        help="Disable AMP (automatic mixed precision).",
    )
    p.add_argument(
        "--cos-lr",
        action="store_true",
        help="Use cosine LR schedule (often helps fine-tuning).",
    )
    p.add_argument(
        "--close-mosaic",
        type=int,
        default=10,
        help="Ultralytics close_mosaic: last N epochs without mosaic (default: 10).",
    )
    args = p.parse_args()

    repo = Path(args.repo).expanduser().resolve() if args.repo else find_repo_root(Path(__file__).resolve().parent)
    # Default dataset: rewrite data.yaml without a frozen absolute path: (fixes D: vs C: / moved repo).
    if args.data is None:
        from download_brain_dataset import write_data_yaml

        write_data_yaml(repo)

    data_yaml = resolve_data_yaml(args.data, str(repo) if args.repo else None)
    project_dir = Path(args.project).expanduser().resolve() if args.project else (repo / "runs")
    project_dir.mkdir(parents=True, exist_ok=True)

    device = pick_device(args.device)
    workers = args.workers if args.workers is not None else default_workers()
    use_amp = not args.no_amp and device != "cpu"

    from ultralytics import YOLO

    model = YOLO(args.model)
    train_kw: dict = {
        "task": "segment",
        "data": data_yaml,
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "device": device,
        "workers": workers,
        "project": str(project_dir),
        "name": args.name,
        "exist_ok": args.exist_ok,
        "patience": args.patience,
        "seed": args.seed,
        "plots": True,
        "amp": use_amp,
        "verbose": True,
        "close_mosaic": args.close_mosaic,
    }
    if args.cos_lr:
        train_kw["cos_lr"] = True

    print(f"Repository: {repo}")
    print(f"Dataset YAML: {data_yaml}")
    print(f"Project: {project_dir}")
    print(f"Run name: {args.name}")
    print(f"Device: {device}  workers: {workers}  AMP: {use_amp}")
    model.train(**train_kw)

    best = project_dir / args.name / "weights" / "best.pt"
    print()
    print("Training finished.")
    print(f"  Best weights: {best}")
    print("Export ONNX, e.g.:")
    print(
        f'  python export_yolo26_brain_onnx.py --weights "{best}" --out "{repo / "models" / "brain_ct_yolo26v20_seg.onnx"}"'
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
