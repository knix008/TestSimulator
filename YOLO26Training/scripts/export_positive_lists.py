import argparse
import csv
from pathlib import Path

from ultralytics import YOLO


def list_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted([p for p in root.rglob("*") if p.is_file()])


def get_top_prediction(model: YOLO, image_path: Path, device: str, conf: float) -> tuple[str, float]:
    result = model.predict(source=str(image_path), device=device, conf=conf, verbose=False)[0]
    if result.boxes is None or len(result.boxes) == 0:
        return "none", 0.0

    confs = result.boxes.conf.tolist()
    clss = result.boxes.cls.tolist()
    best_idx = max(range(len(confs)), key=lambda i: confs[i])
    class_id = int(clss[best_idx])
    class_name = result.names.get(class_id, str(class_id))
    return class_name, float(confs[best_idx])


def write_csv(
    paths: list[Path],
    base_dir: Path,
    output_csv: Path,
    task_name: str,
    model: YOLO,
    raw_root: Path,
    device: str,
    conf: float,
) -> list[list[str]]:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    rows: list[list[str]] = []
    with output_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "index",
                "task",
                "relative_path",
                "absolute_path",
                "predicted_class",
                "confidence",
            ]
        )
        for idx, path in enumerate(paths, start=1):
            relative_path = path.relative_to(raw_root.parent / "vis")
            raw_image = raw_root / relative_path
            pred_class, pred_conf = get_top_prediction(model, raw_image, device=device, conf=conf)
            row = [
                str(idx),
                task_name,
                str(path.relative_to(base_dir)),
                str(path.resolve()),
                pred_class,
                f"{pred_conf:.6f}",
            ]
            writer.writerow(row)
            rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Export positive prediction file lists to CSV.")
    parser.add_argument(
        "--base-dir",
        type=str,
        default="positive_predictions",
        help="Base directory of positive prediction outputs",
    )
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
    parser.add_argument("--device", type=str, default="0", help="Inference device (e.g. 0, cpu)")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()

    base_dir = Path(args.base_dir)
    det_dir = base_dir / "detection_positive" / "vis"
    seg_dir = base_dir / "segmentation_positive" / "vis"
    det_raw_dir = base_dir / "detection_positive" / "raw"
    seg_raw_dir = base_dir / "segmentation_positive" / "raw"

    det_paths = list_files(det_dir)
    seg_paths = list_files(seg_dir)

    detect_model = YOLO(args.detect_model)
    seg_model = YOLO(args.seg_model)

    det_csv = base_dir / "detection_positive_list.csv"
    seg_csv = base_dir / "segmentation_positive_list.csv"
    all_csv = base_dir / "all_positive_list.csv"

    det_rows = write_csv(
        det_paths,
        base_dir,
        det_csv,
        "detection",
        detect_model,
        det_raw_dir,
        device=args.device,
        conf=args.conf,
    )
    seg_rows = write_csv(
        seg_paths,
        base_dir,
        seg_csv,
        "segmentation",
        seg_model,
        seg_raw_dir,
        device=args.device,
        conf=args.conf,
    )

    all_rows = det_rows + seg_rows
    all_csv.parent.mkdir(parents=True, exist_ok=True)
    with all_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "index",
                "task",
                "relative_path",
                "absolute_path",
                "predicted_class",
                "confidence",
            ]
        )
        for idx, row in enumerate(all_rows, start=1):
            writer.writerow([str(idx)] + row[1:])

    print(f"Detection list: {det_csv.resolve()} ({len(det_paths)} files)")
    print(f"Segmentation list: {seg_csv.resolve()} ({len(seg_paths)} files)")
    print(f"Combined list: {all_csv.resolve()} ({len(det_paths) + len(seg_paths)} files)")


if __name__ == "__main__":
    main()
