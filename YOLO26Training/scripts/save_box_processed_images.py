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
        images = sorted([p for p in source.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS])
        if not images:
            raise FileNotFoundError(f"No images found in directory: {source}")
        return images
    raise FileNotFoundError(f"Source path does not exist: {source}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Save only images with detected boxes.")
    parser.add_argument("--source", type=str, default="data", help="Image file or directory")
    parser.add_argument(
        "--detect-model",
        type=str,
        default="runs/detect/yolo26_runs/ct_brain_det_gpu/weights/best.pt",
        help="Path to detection model weights",
    )
    parser.add_argument("--output-dir", type=str, default="box_processed_images", help="Output directory")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size")
    parser.add_argument("--conf", type=float, default=0.10, help="Confidence threshold")
    parser.add_argument("--device", type=str, default="0", help="Inference device (e.g. 0, cpu)")
    args = parser.parse_args()

    source = Path(args.source)
    images = collect_images(source)
    detect_model = YOLO(args.detect_model)

    output_dir = Path(args.output_dir)
    raw_dir = output_dir / "raw"
    vis_dir = output_dir / "vis"
    raw_dir.mkdir(parents=True, exist_ok=True)
    vis_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    for image_path in images:
        result = detect_model.predict(
            source=str(image_path),
            imgsz=args.imgsz,
            conf=args.conf,
            device=args.device,
            verbose=False,
        )[0]

        if result.boxes is None or len(result.boxes) == 0:
            continue

        count += 1
        rel = image_path.relative_to(source) if source.is_dir() else Path(image_path.name)
        out_raw = raw_dir / rel
        out_vis = vis_dir / rel
        out_raw.parent.mkdir(parents=True, exist_ok=True)
        out_vis.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image_path, out_raw)
        result.save(filename=str(out_vis))

    print(f"Processed images: {len(images)}")
    print(f"Box-positive images saved: {count}")
    print(f"Saved to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
