# Train YOLO11n-seg on a brain CT (or MRI) segmentation dataset in YOLO segment format, then export ONNX.
#
# Important:
#   - Ultralytics "brain-tumor" zip (brain-tumor.yaml) ships YOLO *detection* labels (boxes), not polygons.
#     yolo segment train requires labels with segmentation masks (YOLO-seg format). Prepare CT data with
#     polygon/mask labels (e.g. Roboflow export "YOLOv8 Segmentation", or convert from NIfTI masks).
#   - For CT-only training, filter your dataset to CT slices only before training.
#
# Example after you have a dataset root with images/ + labels/ (seg) and a data.yaml:
#   pip install ultralytics
#   yolo segment train model=yolo11n-seg.pt data=your_brain_ct_seg.yaml epochs=100 imgsz=640 batch=8
#
# Then export:
#   python export_yolo11_brain_onnx.py --weights runs/segment/train/weights/best.pt --out brain_ct_yolo11n_seg.onnx
#
# data.yaml template (2 classes, same names/order as Ultralytics brain-tumor.yaml):
#   path: /path/to/dataset
#   train: images/train
#   val: images/val
#   names:
#     0: negative
#     1: positive

from __future__ import annotations

import argparse

YOLO11_SEG_MODEL_DEFAULT = "yolo11n-seg.pt"


def main() -> None:
    p = argparse.ArgumentParser(
        description="Wrapper: runs yolo segment train for YOLO11n-seg (brain CT/MRI seg dataset)."
    )
    p.add_argument("--data", required=True, help="Path to YOLO segmentation data.yaml")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--model", default=YOLO11_SEG_MODEL_DEFAULT, help="Ultralytics checkpoint to start from")
    p.add_argument(
        "--project",
        default=None,
        help="Ultralytics project directory (default: Ultralytics runs/segment)",
    )
    p.add_argument(
        "--name",
        default=None,
        help="Run name under project (default: train, train2, …)",
    )
    p.add_argument(
        "--device",
        default=None,
        help="예: 0, cpu. 미지정이면 Ultralytics 기본(가능 시 GPU).",
    )
    args = p.parse_args()

    from ultralytics import YOLO

    yolo11_model = YOLO(args.model)
    train_kw: dict = {
        "task": "segment",
        "data": args.data,
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
    }
    if args.project:
        train_kw["project"] = args.project
    if args.name:
        train_kw["name"] = args.name
    if args.device:
        train_kw["device"] = args.device
    yolo11_model.train(**train_kw)
    print(
        "Training finished. Export ONNX, e.g.:\n"
        "  python export_yolo11_brain_onnx.py --weights runs/segment/train/weights/best.pt --out brain_ct_yolo11n_seg.onnx\n"
        "Or use brain_ct_pipeline.py export (fixed path: runs/brain_ct_seg/train/weights/best.pt)."
    )


if __name__ == "__main__":
    main()
