"""
Brain CT intracranial hemorrhage (ICH) — YOLO instance segmentation train → ONNX → val → report.

Expects a **local** YOLO-segmentation layout (Ultralytics-compatible):
  <dataset_root>/
    images/train, images/val
    labels/train, labels/val   # polygon lines: class x1 y1 x2 y2 ... (normalized 0–1)

Refs:
  - Segmentation task: https://docs.ultralytics.com/tasks/segment/
  - Dataset format: https://docs.ultralytics.com/datasets/segment/
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import textwrap
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASET_STAGING = ROOT / "dataset"
DEFAULT_DATASET_ROOT = DATASET_STAGING / "ich_cq500_yolo_seg"
YAML_PATH = ROOT / "configs" / "ich_seg_data.yaml"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
DEFAULT_SEG_WEIGHTS = MODELS_DIR / "yolo26n-seg.pt"
EXPORT_ONNX_NAME = "ich_yolo26n_seg.onnx"
EXPORT_BEST_NAME = "ich_yolo26n_seg_best.pt"
_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


def _count_images(d: Path) -> int:
    if not d.is_dir():
        return 0
    return sum(1 for p in d.iterdir() if p.is_file() and p.suffix.lower() in _IMAGE_EXT)


def maybe_move_root_pretrained_seg_pt() -> None:
    """Legacy: yolo26n-seg.pt in project root → models/yolo26n-seg.pt."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    root_pt = ROOT / "yolo26n-seg.pt"
    dest = DEFAULT_SEG_WEIGHTS
    if not root_pt.is_file():
        return
    if dest.is_file():
        print(
            f"Note: both {root_pt} and {dest} exist; using models copy. "
            "Remove the duplicate in the project root if you no longer need it."
        )
        return
    shutil.move(str(root_pt), str(dest))
    print(f"Moved pretrained weights: {root_pt} → {dest}")


def _assert_yolo_seg_layout(candidate: Path, *, require_images: bool) -> Path:
    """Root with images/{train,val} and labels/{train,val}. Optionally require ≥1 image per split."""
    base = candidate.resolve()
    it = base / "images" / "train"
    iv = base / "images" / "val"
    lt = base / "labels" / "train"
    lv = base / "labels" / "val"
    for d, label in (
        (it, "images/train"),
        (iv, "images/val"),
        (lt, "labels/train"),
        (lv, "labels/val"),
    ):
        if not d.is_dir():
            raise FileNotFoundError(
                f"Missing `{label}` under {base}. "
                "Create the YOLO-segmentation folder layout (see Ultralytics segment dataset docs)."
            )
    if require_images:
        if _count_images(it) < 1:
            raise FileNotFoundError(
                f"No image files ({', '.join(sorted(_IMAGE_EXT))}) in {it}. "
                "Add CT slices (e.g. PNG) after DICOM conversion."
            )
        if _count_images(iv) < 1:
            raise FileNotFoundError(
                f"No image files in {iv}. Add at least one validation slice."
            )
    return base


def write_seg_data_yaml(dataset_root: Path, out_yaml: Path, nc: int, class_names: list[str]) -> None:
    if nc < 1:
        raise ValueError("nc must be >= 1")
    if len(class_names) != nc:
        raise ValueError(f"class_names length ({len(class_names)}) must equal nc ({nc})")
    out_yaml.parent.mkdir(parents=True, exist_ok=True)
    root_posix = dataset_root.as_posix()
    names_lines = "\n".join(f"  {i}: {class_names[i]}" for i in range(nc))
    text = textwrap.dedent(
        f"""\
        # Auto-generated — ICH / brain hemorrhage segmentation (YOLO polygon labels).
        # Format: https://docs.ultralytics.com/datasets/segment/
        path: {root_posix}
        train: images/train
        val: images/val
        nc: {nc}
        names:
        {names_lines}
        """
    )
    out_yaml.write_text(text, encoding="utf-8")
    print(f"Wrote data yaml: {out_yaml}")


def train_and_export_seg(
    data_yaml: Path,
    weights: str,
    epochs: int,
    imgsz: int,
    batch: int,
    device: str,
    project: str,
    name: str,
    patience: int,
    workers: int,
) -> tuple[Path, Path]:
    import torch
    from ultralytics import YOLO

    if device != "cpu" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but not available. Use --device cpu.")

    data_yaml = data_yaml.resolve()
    if not data_yaml.exists():
        raise FileNotFoundError(data_yaml)

    w = Path(weights).expanduser()
    w = (ROOT / w).resolve() if not w.is_absolute() else w.resolve()
    w.parent.mkdir(parents=True, exist_ok=True)
    weights_resolved = str(w)
    print(f"Loading segmentation model: {weights_resolved}")
    model = YOLO(weights_resolved)
    print("Starting segmentation training...")
    tr = model.train(
        task="segment",
        data=str(data_yaml),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        workers=workers,
        patience=patience,
        project=project,
        name=name,
        exist_ok=True,
        amp=(device != "cpu"),
    )
    save_dir = (ROOT / "runs" / "segment" / project / name).resolve()
    if tr is not None and hasattr(tr, "save_dir") and tr.save_dir:
        save_dir = Path(tr.save_dir).resolve()
    best_pt = save_dir / "weights" / "best.pt"
    if not best_pt.exists():
        raise FileNotFoundError(f"Missing weights after train: {best_pt}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    export_model = YOLO(str(best_pt))
    onnx_path = Path(export_model.export(format="onnx", imgsz=imgsz, dynamic=True, simplify=True))
    if not onnx_path.exists():
        raise FileNotFoundError(f"ONNX export failed: {onnx_path}")
    dest_onnx = MODELS_DIR / EXPORT_ONNX_NAME
    dest_best = MODELS_DIR / EXPORT_BEST_NAME
    shutil.copy2(onnx_path, dest_onnx)
    shutil.copy2(best_pt, dest_best)
    print(f"ONNX: {dest_onnx}")
    return best_pt, save_dir


def evaluate_seg(best_pt: Path, data_yaml: Path, imgsz: int, device: str) -> dict:
    """Run Ultralytics val; save plots under ``reports/val`` (not under ``runs/``)."""
    from ultralytics import YOLO

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(best_pt))
    metrics = model.val(
        task="segment",
        data=str(data_yaml),
        imgsz=imgsz,
        device=device,
        plots=True,
        project=str(REPORTS_DIR.resolve()),
        name="val",
        exist_ok=True,
    )
    val_dir = (REPORTS_DIR / "val").resolve()
    out: dict = {}
    try:
        if hasattr(metrics, "results_dict") and metrics.results_dict:
            for k, v in metrics.results_dict.items():
                if hasattr(v, "item"):
                    out[k] = float(v.item())
                elif isinstance(v, (int, float)):
                    out[k] = float(v)
                else:
                    out[k] = str(v)
        else:
            out["summary"] = str(metrics)
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e)
    out["val_artifacts_dir"] = str(val_dir)
    return out


def write_report(
    report_path: Path,
    *,
    dataset_root: Path,
    data_yaml: Path,
    best_pt: Path,
    onnx_path: Path,
    metrics: dict,
    args: argparse.Namespace,
    train_save_dir: Path | None,
) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Brain CT ICH (hemorrhage) — segmentation training report",
        "",
        f"_Generated: {ts}_",
        "",
        "## Dataset layout (YOLO segment)",
        "- Images: `<root>/images/train`, `<root>/images/val`",
        "- Labels: `<root>/labels/train`, `<root>/labels/val` (polygon coordinates, normalized)",
        "- Docs: https://docs.ultralytics.com/datasets/segment/",
        "",
        "## Configuration",
        f"- **epochs**: {args.epochs}",
        f"- **imgsz**: {args.imgsz}",
        f"- **batch**: {args.batch}",
        f"- **device**: {args.device}",
        f"- **weights (init)**: {args.weights}",
        f"- **dataset root**: `{dataset_root}`",
        f"- **data yaml**: `{data_yaml}`",
        f"- **nc / names**: {args.nc} / {args.class_names}",
        "",
        "## Artifacts",
        f"- **best.pt**: `{best_pt}`",
        f"- **copy under models/**: `{MODELS_DIR / EXPORT_BEST_NAME}`",
        f"- **ONNX**: `{onnx_path}`",
        "",
        "## Reports directory (`reports/`)",
        "Training and validation outputs for this run are written under the project `reports/` folder:",
        f"- **This summary**: `{report_path}`",
        f"- **Validation metrics (JSON)**: `{REPORTS_DIR / 'ich_seg_val_metrics.json'}`",
        f"- **Training curves (PNG)**: `{REPORTS_DIR / 'ich_seg_training_curves.png'}` (from `results.csv` when available)",
        f"- **Ultralytics val plots**: `{metrics.get('val_artifacts_dir', str(REPORTS_DIR / 'val'))}` *(Ultralytics plots=True)*",
        "",
        "## Validation metrics",
        "```json",
        json.dumps(
            {k: v for k, v in metrics.items() if k != "val_artifacts_dir"},
            indent=2,
            default=str,
        ),
        "```",
        "",
    ]
    if train_save_dir:
        rcsv = train_save_dir / "results.csv"
        if rcsv.exists():
            lines += [
                "## Training curves",
                f"- CSV: `{rcsv}`",
                f"- Run folder: `{train_save_dir}`",
                "",
            ]
        for png in sorted(train_save_dir.glob("*.png"))[:12]:
            lines.append(f"- plot: `{png}`")
        if any(train_save_dir.glob("*.png")):
            lines.append("")
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written: {report_path}")


def maybe_plot_results_csv_seg(results_csv: Path, out_png: Path) -> None:
    try:
        import matplotlib.pyplot as plt
        import pandas as pd
    except ImportError:
        return
    if not results_csv.exists():
        return
    df = pd.read_csv(results_csv)
    if df.empty or "epoch" not in df.columns:
        return
    ycol = None
    for c in df.columns:
        if "mAP50(M)" in c or "mAP50-95(M)" in c:
            ycol = c
            break
    if ycol is None:
        for c in df.columns:
            if "Mask" in c and "mAP" in c:
                ycol = c
                break
    if ycol is None:
        for c in df.columns:
            if c.endswith("mAP50") or "seg" in c.lower():
                ycol = c
                break
    if ycol is None:
        return
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(df["epoch"], df[ycol], label=ycol)
    ax.set_xlabel("epoch")
    ax.set_ylabel("metric")
    ax.legend()
    ax.set_title("ICH segmentation — validation metric vs epoch")
    fig.tight_layout()
    out_png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_png, dpi=120)
    plt.close(fig)
    print(f"Saved plot: {out_png}")


def parse_class_names(s: str) -> list[str]:
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if not parts:
        raise ValueError("--class-names must list at least one name (comma-separated).")
    return parts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Brain CT ICH YOLO26 segmentation: yaml → train → ONNX → val → report."
    )
    parser.add_argument(
        "--dataset-root",
        type=str,
        default=str(DEFAULT_DATASET_ROOT),
        help="YOLO-seg dataset root (images/{train,val}, labels/{train,val})",
    )
    parser.add_argument(
        "--weights",
        type=str,
        default=str(DEFAULT_SEG_WEIGHTS),
        help="Pretrained segmentation checkpoint (default: models/yolo26n-seg.pt).",
    )
    parser.add_argument("--epochs", type=int, default=300)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--device", type=str, default="0")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--patience", type=int, default=60)
    parser.add_argument("--project", type=str, default="ich_seg_runs")
    parser.add_argument("--name", type=str, default="yolo26n_ich_seg")
    parser.add_argument(
        "--nc",
        type=int,
        default=1,
        help="Number of classes (default 1: hemorrhage).",
    )
    parser.add_argument(
        "--class-names",
        type=str,
        default="hemorrhage",
        help="Comma-separated class names, length must match --nc.",
    )
    parser.add_argument(
        "--skip-train",
        action="store_true",
        help="Only validate dataset root and write data yaml.",
    )
    args = parser.parse_args()
    os.chdir(ROOT)
    maybe_move_root_pretrained_seg_pt()

    dataset_root = Path(args.dataset_root)
    if not dataset_root.is_absolute():
        dataset_root = (ROOT / dataset_root).resolve()

    class_names = parse_class_names(args.class_names)
    if len(class_names) != args.nc:
        parser.error(f"--class-names must have {args.nc} entries (comma-separated), got {len(class_names)}")

    dataset_root = _assert_yolo_seg_layout(dataset_root, require_images=False)
    write_seg_data_yaml(dataset_root, YAML_PATH, args.nc, class_names)

    if args.skip_train:
        print("Skip train (--skip-train). Done.")
        return

    _assert_yolo_seg_layout(dataset_root, require_images=True)

    best_pt, train_save_dir = train_and_export_seg(
        YAML_PATH,
        args.weights,
        args.epochs,
        args.imgsz,
        args.batch,
        args.device,
        args.project,
        args.name,
        args.patience,
        args.workers,
    )

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    metrics = evaluate_seg(best_pt, YAML_PATH, args.imgsz, args.device)
    onnx_path = MODELS_DIR / EXPORT_ONNX_NAME
    report_md = REPORTS_DIR / "ich_seg_training_report.md"
    write_report(
        report_md,
        dataset_root=dataset_root,
        data_yaml=YAML_PATH,
        best_pt=best_pt,
        onnx_path=onnx_path,
        metrics=metrics,
        args=args,
        train_save_dir=train_save_dir,
    )
    metrics_json = REPORTS_DIR / "ich_seg_val_metrics.json"
    metrics_json.write_text(json.dumps(metrics, indent=2, default=str), encoding="utf-8")
    maybe_plot_results_csv_seg(
        train_save_dir / "results.csv",
        REPORTS_DIR / "ich_seg_training_curves.png",
    )
    print("All steps finished.")


if __name__ == "__main__":
    main()
