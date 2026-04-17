import argparse
from pathlib import Path
import shutil

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
        description="Collect only images with positive detections or masks."
    )
    parser.add_argument("--source", type=str, default="data", help="Image file or directory")
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
        default="positive_predictions",
        help="Output directory for positive results",
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

    det_raw_dir = output_dir / "detection_positive" / "raw"
    det_vis_dir = output_dir / "detection_positive" / "vis"
    seg_raw_dir = output_dir / "segmentation_positive" / "raw"
    seg_vis_dir = output_dir / "segmentation_positive" / "vis"
    for d in [det_raw_dir, det_vis_dir, seg_raw_dir, seg_vis_dir]:
        d.mkdir(parents=True, exist_ok=True)

    det_count = 0
    seg_count = 0

    for image_path in images:
        det_result = detect_model.predict(
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

        relative_path = image_path.relative_to(source) if source.is_dir() else Path(image_path.name)

        if det_result.boxes is not None and len(det_result.boxes) > 0:
            det_count += 1
            out_raw = det_raw_dir / relative_path
            out_vis = det_vis_dir / relative_path
            out_raw.parent.mkdir(parents=True, exist_ok=True)
            out_vis.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(image_path, out_raw)
            det_result.save(filename=str(out_vis))

        if seg_result.masks is not None and len(seg_result.masks) > 0:
            seg_count += 1
            out_raw = seg_raw_dir / relative_path
            out_vis = seg_vis_dir / relative_path
            out_raw.parent.mkdir(parents=True, exist_ok=True)
            out_vis.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(image_path, out_raw)
            seg_result.save(filename=str(out_vis))

    print(f"Processed images: {len(images)}")
    print(f"Detection positives: {det_count}")
    print(f"Segmentation positives: {seg_count}")
    print(f"Saved to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
