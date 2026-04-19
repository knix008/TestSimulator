"""
End-to-end automation: dataset (Ultralytics brain-tumor) → YOLO26n train → ONNX → val → report.

References:
  - Dataset & usage: https://docs.ultralytics.com/datasets/detect/brain-tumor/
  - YAML upstream: https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/datasets/brain-tumor.yaml

Assumes this file lives in <project>/scripts/; run with project venv Python after install.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import textwrap
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ZIP_URL = (
    "https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor.zip"
)
DATASET_STAGING = ROOT / "dataset"
YAML_PATH = ROOT / "configs" / "brain_tumor_local.yaml"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
# Pretrained checkpoint: keep under models/ so Ultralytics downloads there by default path.
DEFAULT_PRETRAINED_PT = MODELS_DIR / "yolo26n.pt"


def maybe_move_root_pretrained_pt() -> None:
    """Legacy: yolo26n.pt in project root → models/yolo26n.pt (once, if dest missing)."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    root_pt = ROOT / "yolo26n.pt"
    dest = DEFAULT_PRETRAINED_PT
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


def _find_dataset_root(search_under: Path) -> Path:
    """Locate YOLO layout .../images/train under extracted tree."""
    direct = search_under / "images" / "train"
    if direct.is_dir() and any(direct.iterdir()):
        return search_under.resolve()
    for train_dir in search_under.rglob("images/train"):
        if train_dir.is_dir() and any(train_dir.iterdir()):
            return train_dir.parent.parent.resolve()
    raise FileNotFoundError(
        f"No non-empty images/train found under {search_under}. "
        "Re-download or check the zip layout."
    )


def download_brain_tumor_zip(url: str, extract_to: Path, force: bool) -> Path:
    DATASET_STAGING.mkdir(parents=True, exist_ok=True)
    zip_path = DATASET_STAGING / "brain-tumor.zip"
    extract_to = extract_to.resolve()
    extract_to.mkdir(parents=True, exist_ok=True)

    if not force:
        try:
            return _find_dataset_root(extract_to)
        except FileNotFoundError:
            pass
    else:
        if extract_to.exists():
            shutil.rmtree(extract_to)
            extract_to.mkdir(parents=True, exist_ok=True)

    print(f"Downloading: {url}")
    with urllib.request.urlopen(url, timeout=120) as resp, open(zip_path, "wb") as out:
        shutil.copyfileobj(resp, out, length=1024 * 1024)
    print(f"Saved: {zip_path}")

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_to)
    print(f"Extracted to: {extract_to}")
    root = _find_dataset_root(extract_to)
    print(f"Dataset root: {root}")
    return root


def write_data_yaml(dataset_root: Path, out_yaml: Path) -> None:
    out_yaml.parent.mkdir(parents=True, exist_ok=True)
    # Ultralytics resolves paths relative to yaml location unless absolute.
    root_posix = dataset_root.as_posix()
    text = textwrap.dedent(
        f"""\
        # Auto-generated for local training (Ultralytics brain-tumor layout).
        # Docs: https://docs.ultralytics.com/datasets/detect/brain-tumor/
        path: {root_posix}
        train: images/train
        val: images/val
        nc: 2
        names:
          0: negative
          1: positive
        """
    )
    out_yaml.write_text(text, encoding="utf-8")
    print(f"Wrote data yaml: {out_yaml}")


def train_and_export(
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
    if not w.is_absolute():
        w = (ROOT / w).resolve()
    else:
        w = w.resolve()
    w.parent.mkdir(parents=True, exist_ok=True)
    weights_resolved = str(w)
    print(f"Loading model: {weights_resolved}")
    model = YOLO(weights_resolved)
    print("Starting training...")
    tr = model.train(
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
    save_dir = (ROOT / "runs" / "detect" / project / name).resolve()
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
    dest_onnx = MODELS_DIR / "brain_tumor_yolo26n.onnx"
    shutil.copy2(onnx_path, dest_onnx)
    shutil.copy2(best_pt, MODELS_DIR / "brain_tumor_yolo26n_best.pt")
    print(f"ONNX: {dest_onnx}")
    return best_pt, save_dir


def evaluate(best_pt: Path, data_yaml: Path, imgsz: int, device: str) -> dict:
    from ultralytics import YOLO

    model = YOLO(str(best_pt))
    metrics = model.val(data=str(data_yaml), imgsz=imgsz, device=device, plots=True)
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
        "# Brain Tumor (Ultralytics) — training report",
        "",
        f"_Generated: {ts}_",
        "",
        "## Reference",
        "- Dataset documentation: https://docs.ultralytics.com/datasets/detect/brain-tumor/",
        "- Upstream YAML: https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/datasets/brain-tumor.yaml",
        "",
        "## Configuration",
        f"- **epochs**: {args.epochs}",
        f"- **imgsz**: {args.imgsz}",
        f"- **batch**: {args.batch}",
        f"- **device**: {args.device}",
        f"- **weights (init)**: {args.weights}",
        f"- **dataset root**: `{dataset_root}`",
        f"- **data yaml**: `{data_yaml}`",
        "",
        "## Artifacts",
        f"- **best.pt**: `{best_pt}`",
        f"- **copy under models/**: `{MODELS_DIR / 'brain_tumor_yolo26n_best.pt'}`",
        f"- **ONNX**: `{onnx_path}`",
        "",
        "## Validation metrics",
        "```json",
        json.dumps(metrics, indent=2, default=str),
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


def maybe_plot_results_csv(results_csv: Path, out_png: Path) -> None:
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
        if "mAP50" in c and "B" in c:
            ycol = c
            break
    if ycol is None:
        for c in df.columns:
            if c.endswith("mAP50") or c == "metrics/mAP50":
                ycol = c
                break
    if ycol is None:
        return
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(df["epoch"], df[ycol], label=ycol)
    ax.set_xlabel("epoch")
    ax.set_ylabel("metric")
    ax.legend()
    ax.set_title("Brain tumor detection — validation metric vs epoch")
    fig.tight_layout()
    out_png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_png, dpi=120)
    plt.close(fig)
    print(f"Saved plot: {out_png}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Automated Ultralytics brain-tumor → YOLO26n → ONNX → val → report."
    )
    parser.add_argument("--dataset-url", default=DEFAULT_ZIP_URL)
    parser.add_argument(
        "--extract-dir",
        type=str,
        default=str(DATASET_STAGING / "brain-tumor"),
        help="Directory to extract the zip into",
    )
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument(
        "--weights",
        type=str,
        default=str(DEFAULT_PRETRAINED_PT),
        help="Ultralytics pretrained path (default: models/yolo26n.pt; first download saves there).",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=300,
        help="Max training epochs (Ultralytics early stopping uses --patience; default 300)",
    )
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", type=str, default="0")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument(
        "--patience",
        type=int,
        default=60,
        help="Early stopping: epochs without val improvement before stop (default 60)",
    )
    parser.add_argument("--project", type=str, default="brain_tumor_runs")
    parser.add_argument("--name", type=str, default="yolo26n_brain_tumor")
    parser.add_argument(
        "--skip-train",
        action="store_true",
        help="Only prepare dataset + yaml (for debugging layout).",
    )
    args = parser.parse_args()
    os.chdir(ROOT)
    maybe_move_root_pretrained_pt()

    extract_dir = Path(args.extract_dir)
    if not extract_dir.is_absolute():
        extract_dir = (ROOT / extract_dir).resolve()

    dataset_root = download_brain_tumor_zip(
        args.dataset_url.strip(),
        extract_dir,
        force=args.force_download,
    )
    write_data_yaml(dataset_root, YAML_PATH)

    if args.skip_train:
        print("Skip train (--skip-train). Done.")
        return

    best_pt, train_save_dir = train_and_export(
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

    metrics = evaluate(best_pt, YAML_PATH, args.imgsz, args.device)
    onnx_path = MODELS_DIR / "brain_tumor_yolo26n.onnx"
    report_md = REPORTS_DIR / "brain_tumor_training_report.md"
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
    metrics_json = REPORTS_DIR / "brain_tumor_val_metrics.json"
    metrics_json.write_text(json.dumps(metrics, indent=2, default=str), encoding="utf-8")
    maybe_plot_results_csv(
        train_save_dir / "results.csv",
        REPORTS_DIR / "brain_tumor_training_curves.png",
    )
    print("All steps finished.")


if __name__ == "__main__":
    main()
