import argparse
from pathlib import Path

import cv2
from ultralytics import YOLO


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}


def collect_images(source: Path) -> list[Path]:
    if source.is_file():
        if source.suffix.lower() not in IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported image file extension: {source.suffix}")
        return [source]

    if source.is_dir():
        images = sorted(
            [p for p in source.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
        )
        if not images:
            raise FileNotFoundError(f"No images found in directory: {source}")
        return images

    raise FileNotFoundError(f"Source path does not exist: {source}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run detection+segmentation inference and save visualized outputs."
    )
    parser.add_argument("--source", required=True, type=str, help="Input image file or directory")
    parser.add_argument(
        "--detect-model",
        type=str,
        default="runs/detect/yolo26_runs/ct_brain_det_gpu/weights/best.pt",
        help="Path to detection model weights",
    )
    parser.add_argument(
        "--seg-model",
        type=str,
        default="runs/segment/yolo26_runs/ct_brain_seg_gpu/weights/best.pt",
        help="Path to segmentation model weights",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="inference_outputs",
        help="Directory to save visualized results",
    )
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size")
    parser.add_argument("--conf", type=float, default=0.10, help="Confidence threshold")
    parser.add_argument("--device", type=str, default="0", help="Inference device (e.g. 0, cpu)")
    args = parser.parse_args()

    source = Path(args.source)
    detect_model_path = Path(args.detect_model)
    seg_model_path = Path(args.seg_model)
    output_dir = Path(args.output_dir)

    if not detect_model_path.exists():
        raise FileNotFoundError(f"Detection model not found: {detect_model_path.resolve()}")
    if not seg_model_path.exists():
        raise FileNotFoundError(f"Segmentation model not found: {seg_model_path.resolve()}")

    images = collect_images(source)
    detect_model = YOLO(str(detect_model_path))
    seg_model = YOLO(str(seg_model_path))

    detect_dir = output_dir / "detection"
    seg_dir = output_dir / "segmentation"
    detect_dir.mkdir(parents=True, exist_ok=True)
    seg_dir.mkdir(parents=True, exist_ok=True)

    for image_path in images:
        detect_result = detect_model.predict(
            source=str(image_path),
            imgsz=args.imgsz,
            conf=args.conf,
            device=args.device,
            verbose=False,
        )[0]
        seg_result = seg_model.predict(
            source=str(image_path),
            imgsz=args.imgsz,
            conf=args.conf,
            device=args.device,
            verbose=False,
        )[0]

        detect_vis = detect_result.plot()
        seg_vis = seg_result.plot()

        if source.is_dir():
            relative_path = image_path.relative_to(source)
        else:
            relative_path = Path(image_path.name)

        detect_output = detect_dir / relative_path
        seg_output = seg_dir / relative_path
        detect_output.parent.mkdir(parents=True, exist_ok=True)
        seg_output.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(detect_output), detect_vis)
        cv2.imwrite(str(seg_output), seg_vis)

    print(f"Inference completed for {len(images)} image(s).")
    print(f"Detection visualizations: {detect_dir.resolve()}")
    print(f"Segmentation visualizations: {seg_dir.resolve()}")


if __name__ == "__main__":
    main()
