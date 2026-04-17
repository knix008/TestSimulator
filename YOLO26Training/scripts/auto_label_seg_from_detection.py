from pathlib import Path
import shutil


DET_ROOT = Path("yolo_dataset")
SEG_ROOT = Path("yolo_dataset_seg")


def bbox_to_polygon_line(line: str) -> str:
    parts = line.split()
    if len(parts) != 5:
        raise ValueError(f"Expected detection label format 'cls cx cy w h', got: {line}")

    cls_id, cx, cy, w, h = parts
    cx = float(cx)
    cy = float(cy)
    w = float(w)
    h = float(h)

    x1 = max(0.0, cx - (w / 2))
    y1 = max(0.0, cy - (h / 2))
    x2 = min(1.0, cx + (w / 2))
    y2 = min(1.0, cy + (h / 2))

    return f"{cls_id} {x1:.6f} {y1:.6f} {x2:.6f} {y1:.6f} {x2:.6f} {y2:.6f} {x1:.6f} {y2:.6f}"


def convert_labels(det_labels_dir: Path, seg_labels_dir: Path) -> None:
    seg_labels_dir.mkdir(parents=True, exist_ok=True)
    label_files = sorted(det_labels_dir.glob("*.txt"))
    if not label_files:
        raise FileNotFoundError(f"No detection label files found in {det_labels_dir.resolve()}")

    for det_file in label_files:
        seg_file = seg_labels_dir / det_file.name
        content = det_file.read_text(encoding="utf-8").strip()
        if not content:
            seg_file.write_text("", encoding="utf-8")
            continue

        seg_lines = [bbox_to_polygon_line(line) for line in content.splitlines() if line.strip()]
        seg_file.write_text("\n".join(seg_lines) + "\n", encoding="utf-8")


def main() -> None:
    if not DET_ROOT.exists():
        raise FileNotFoundError(f"Detection dataset root not found: {DET_ROOT.resolve()}")

    if SEG_ROOT.exists():
        shutil.rmtree(SEG_ROOT)
    shutil.copytree(DET_ROOT, SEG_ROOT)

    convert_labels(DET_ROOT / "labels" / "train", SEG_ROOT / "labels" / "train")
    convert_labels(DET_ROOT / "labels" / "val", SEG_ROOT / "labels" / "val")

    print(f"Segmentation pseudo-label dataset created: {SEG_ROOT.resolve()}")


if __name__ == "__main__":
    main()
