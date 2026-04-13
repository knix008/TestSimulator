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


def main() -> None:
    p = argparse.ArgumentParser(
        description="Wrapper: runs yolo segment train for YOLO11n-seg (brain CT/MRI seg dataset)."
    )
    p.add_argument("--data", required=True, help="Path to YOLO segmentation data.yaml")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--model", default="yolo11n-seg.pt", help="Ultralytics checkpoint to start from")
    args = p.parse_args()

    from ultralytics import YOLO

    model = YOLO(args.model)
    model.train(
        task="segment",
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
    )
    print("Training finished. Export ONNX with tools/export_yolo11_brain_onnx.py --weights runs/segment/train/weights/best.pt")


if __name__ == "__main__":
    main()
