from __future__ import annotations

import argparse
from pathlib import Path


YOLO26_SEG_MODEL_DEFAULT = "yolo26n-seg.pt"


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for path in [cur, *cur.parents]:
        if (path / "YOLO26BrainV10.sln").is_file() or (path / "YOLO26BrainV10.slnx").is_file():
            return path
    raise FileNotFoundError(
        f"Could not find YOLO26BrainV10.sln or YOLO26BrainV10.slnx from: {start}"
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
            "Run dataset downloader first: python tools/download_brain_dataset.py"
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
        # If torch is unavailable or probing fails, force CPU for predictable behavior.
        pass

    return "cpu"


def main() -> None:
    p = argparse.ArgumentParser(
        description="Wrapper: runs yolo segment train for YOLO26n-seg (brain CT/MRI seg dataset)."
    )
    p.add_argument(
        "--data",
        default=None,
        help="Path to YOLO segmentation data.yaml (default: <repo>/data/brain_ct_seg/data.yaml)",
    )
    p.add_argument(
        "--repo",
        default=None,
        help="Repository root containing YOLO26BrainV10.sln (used when --data is omitted).",
    )
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--model", default=YOLO26_SEG_MODEL_DEFAULT, help="Ultralytics checkpoint to start from")
    p.add_argument(
        "--project",
        default=None,
        help="Ultralytics project directory (default: Ultralytics runs/segment)",
    )
    p.add_argument(
        "--name",
        default=None,
        help="Run name under project (default: train, train2, ...)",
    )
    p.add_argument(
        "--device",
        default=None,
        help="Example: 0, cpu. If omitted, Ultralytics default is used.",
    )
    args = p.parse_args()
    data_yaml = resolve_data_yaml(args.data, args.repo)

    from ultralytics import YOLO

    yolo26_model = YOLO(args.model)
    device = pick_device(args.device)
    train_kw: dict = {
        "task": "segment",
        "data": data_yaml,
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "device": device,
    }
    if args.project:
        train_kw["project"] = args.project
    if args.name:
        train_kw["name"] = args.name
    print(f"Using dataset YAML: {data_yaml}")
    print(f"Using device: {device}")
    yolo26_model.train(**train_kw)
    print(
        "Training finished. Export ONNX, e.g.:\n"
        "  python export_yolo26_brain_onnx.py --weights runs/segment/train/weights/best.pt --out brain_ct_yolo26n_seg.onnx"
    )


if __name__ == "__main__":
    main()
