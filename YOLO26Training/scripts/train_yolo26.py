import argparse
from pathlib import Path
import shutil
from ultralytics import YOLO

def validate_detection_labels(labels_dir: Path) -> None:
    if not labels_dir.exists():
        raise FileNotFoundError(f"Labels directory not found: {labels_dir.resolve()}")

    label_files = sorted(labels_dir.glob("*.txt"))
    if not label_files:
        raise FileNotFoundError(f"No label files found in: {labels_dir.resolve()}")

    for label_file in label_files[:20]:
        text = label_file.read_text(encoding="utf-8").strip()
        if not text:
            continue

        for line in text.splitlines():
            parts = line.split()
            if len(parts) != 5:
                raise ValueError(
                    "Current labels are not detection format. "
                    f"Invalid line in {label_file}: '{line}'"
                )

def validate_segmentation_labels(labels_dir: Path) -> None:
    if not labels_dir.exists():
        raise FileNotFoundError(f"Labels directory not found: {labels_dir.resolve()}")

    label_files = sorted(labels_dir.glob("*.txt"))
    if not label_files:
        raise FileNotFoundError(f"No label files found in: {labels_dir.resolve()}")

    # YOLO segmentation format: class x1 y1 x2 y2 x3 y3 ... (>= 7 columns)
    for label_file in label_files[:20]:
        text = label_file.read_text(encoding="utf-8").strip()
        if not text:
            continue

        for line in text.splitlines():
            parts = line.split()
            if len(parts) < 7:
                raise ValueError(
                    "Current labels appear to be detection format, not segmentation format. "
                    f"Invalid line in {label_file}: '{line}'"
                )

def main() -> None:
    parser = argparse.ArgumentParser(description="Train YOLO26 and export ONNX.")
    recommended_epochs = {"detect": 30, "segment": 50}
    parser.add_argument("--task", choices=["detect", "segment"], default="segment", help="Training task")
    parser.add_argument("--data", type=str, default="yolo_data_det.yaml", help="Dataset yaml path")
    parser.add_argument("--model", type=str, default="", help="Model yaml or weights path")
    parser.add_argument("--onnx-name", type=str, default="", help="Output ONNX filename in models/")
    parser.add_argument("--epochs", type=int, default=None, help="Training epochs (default: detect=30, segment=50)")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--device", type=str, default="cpu", help="Training device (e.g. cpu, 0)")
    parser.add_argument("--workers", type=int, default=4, help="Dataloader workers")
    parser.add_argument("--patience", type=int, default=20, help="Early stopping patience")
    parser.add_argument("--project", type=str, default="yolo26_runs", help="Project directory name")
    parser.add_argument("--name", type=str, default="ct_brain_seg_exp", help="Run name")
    args = parser.parse_args()

    data_yaml = Path(args.data)
    if not data_yaml.exists():
        raise FileNotFoundError(f"Dataset config not found: {data_yaml.resolve()}")

    if args.task == "detect":
        labels_root = Path("yolo_dataset/labels/train")
        validate_detection_labels(labels_root)
        model_name = args.model or "yolo26.yaml"
        default_onnx_name = "yolo26-brain-ct-det.onnx"
    else:
        labels_root = Path("yolo_dataset_seg/labels/train")
        if not labels_root.exists():
            labels_root = Path("yolo_dataset/labels/train")
        validate_segmentation_labels(labels_root)
        model_name = args.model or "yolo26-seg.yaml"
        default_onnx_name = "yolo26-brain-ct-seg.onnx"

    epochs = args.epochs if args.epochs is not None else recommended_epochs[args.task]

    model = YOLO(model_name)

    # 학습
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        workers=args.workers,
        patience=args.patience,
        amp=False,        # CPU에서는 mixed precision 비활성
        project=args.project,
        name=args.name,
        exist_ok=True
    )

    # 학습 완료 후 best.pt를 ONNX로 export
    save_dir = Path(getattr(results, "save_dir", f"runs/segment/{args.project}/{args.name}"))
    best_pt = save_dir / "weights" / "best.pt"
    if not best_pt.exists():
        raise FileNotFoundError(f"Trained weight not found: {best_pt}")

    export_model = YOLO(str(best_pt))
    export_path = Path(str(export_model.export(format="onnx", imgsz=640, dynamic=True, simplify=True)))
    if not export_path.exists():
        raise FileNotFoundError(f"Exported ONNX not found: {export_path}")

    models_dir = Path("models")
    models_dir.mkdir(parents=True, exist_ok=True)
    fixed_onnx_path = models_dir / (args.onnx_name or default_onnx_name)
    shutil.copy2(export_path, fixed_onnx_path)
    print(f"ONNX export completed: {fixed_onnx_path.resolve()}")

if __name__ == '__main__':
    main()
