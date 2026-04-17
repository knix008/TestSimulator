import argparse
import csv
from pathlib import Path

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
    parser = argparse.ArgumentParser(description="Analyze prediction positive rates across confidence thresholds.")
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
        "--thresholds",
        type=str,
        default="0.25,0.10,0.05,0.01",
        help="Comma-separated confidence thresholds",
    )
    parser.add_argument("--device", type=str, default="0", help="Inference device (e.g. 0, cpu)")
    parser.add_argument("--output-csv", type=str, default="confidence_analysis.csv", help="Output CSV path")
    parser.add_argument("--output-md", type=str, default="confidence_analysis.md", help="Output markdown report path")
    args = parser.parse_args()

    source = Path(args.source)
    images = collect_images(source)
    total = len(images)
    thresholds = [float(x.strip()) for x in args.thresholds.split(",") if x.strip()]

    detect_model = YOLO(args.detect_model)
    seg_model = YOLO(args.seg_model)

    rows: list[tuple[float, int, int, float, float]] = []
    for th in thresholds:
        det_pos = 0
        seg_pos = 0
        for image_path in images:
            det_result = detect_model.predict(source=str(image_path), conf=th, device=args.device, verbose=False)[0]
            seg_result = seg_model.predict(source=str(image_path), conf=th, device=args.device, verbose=False)[0]
            if det_result.boxes is not None and len(det_result.boxes) > 0:
                det_pos += 1
            if seg_result.masks is not None and len(seg_result.masks) > 0:
                seg_pos += 1
        rows.append((th, det_pos, seg_pos, det_pos / total, seg_pos / total))

    csv_path = Path(args.output_csv)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            ["threshold", "total_images", "detection_positive", "segmentation_positive", "detection_rate", "segmentation_rate"]
        )
        for th, det_pos, seg_pos, det_rate, seg_rate in rows:
            writer.writerow([f"{th:.4f}", total, det_pos, seg_pos, f"{det_rate:.6f}", f"{seg_rate:.6f}"])

    md_path = Path(args.output_md)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Confidence Threshold Analysis",
        "",
        f"- Total images: `{total}`",
        f"- Detection model: `{args.detect_model}`",
        f"- Segmentation model: `{args.seg_model}`",
        "",
        "| Threshold | Detection Positive | Segmentation Positive | Detection Rate | Segmentation Rate |",
        "|---:|---:|---:|---:|---:|",
    ]
    for th, det_pos, seg_pos, det_rate, seg_rate in rows:
        lines.append(f"| {th:.2f} | {det_pos} | {seg_pos} | {det_rate:.2%} | {seg_rate:.2%} |")
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Saved CSV: {csv_path.resolve()}")
    print(f"Saved MD: {md_path.resolve()}")


if __name__ == "__main__":
    main()
