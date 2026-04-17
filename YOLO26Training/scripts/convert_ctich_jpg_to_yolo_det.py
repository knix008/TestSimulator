import argparse
import random
from pathlib import Path

import cv2
import yaml


def collect_pairs(root: Path) -> list[tuple[Path, Path]]:
    pairs: list[tuple[Path, Path]] = []
    for mask_path in root.rglob("*_HGE_Seg.jpg"):
        image_path = mask_path.with_name(mask_path.name.replace("_HGE_Seg.jpg", ".jpg"))
        if image_path.exists():
            pairs.append((image_path, mask_path))
    return pairs


def mask_to_bbox(mask_path: Path) -> tuple[float, float, float, float] | None:
    mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return None
    _, binary = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
    ys, xs = (binary > 0).nonzero()
    if len(xs) == 0 or len(ys) == 0:
        return None

    h, w = binary.shape
    x_min, x_max = int(xs.min()), int(xs.max())
    y_min, y_max = int(ys.min()), int(ys.max())

    bw = max(1, x_max - x_min + 1)
    bh = max(1, y_max - y_min + 1)
    cx = x_min + bw / 2.0
    cy = y_min + bh / 2.0

    return (
        min(max(cx / w, 0.0), 1.0),
        min(max(cy / h, 0.0), 1.0),
        min(max(bw / w, 1e-6), 1.0),
        min(max(bh / h, 1e-6), 1.0),
    )


def write_dataset_yaml(output_root: Path, class_name: str) -> None:
    data = {
        "path": str(output_root.resolve()),
        "train": "images/train",
        "val": "images/val",
        "names": {0: class_name},
    }
    with (output_root / "dataset.yaml").open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert CT-ICH JPG+mask into YOLO detection format.")
    parser.add_argument("--dataset-root", type=str, required=True, help="Root containing Patients_CT")
    parser.add_argument("--output-root", type=str, default="yolo_dataset_det_public", help="YOLO detection output root")
    parser.add_argument("--class-name", type=str, default="hemorrhage", help="Single class name")
    parser.add_argument("--val-ratio", type=float, default=0.2, help="Validation split ratio")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    dataset_root = Path(args.dataset_root)
    output_root = Path(args.output_root)
    if not dataset_root.exists():
        raise FileNotFoundError(f"Dataset root not found: {dataset_root.resolve()}")

    pairs = collect_pairs(dataset_root)
    if not pairs:
        raise RuntimeError("No image/mask pairs found with pattern *_HGE_Seg.jpg")

    random.seed(args.seed)
    random.shuffle(pairs)
    val_count = max(1, int(len(pairs) * args.val_ratio))
    val_set = set(pairs[:val_count])

    for split in ("train", "val"):
        (output_root / "images" / split).mkdir(parents=True, exist_ok=True)
        (output_root / "labels" / split).mkdir(parents=True, exist_ok=True)

    kept = 0
    for image_path, mask_path in pairs:
        bbox = mask_to_bbox(mask_path)
        if bbox is None:
            continue

        split = "val" if (image_path, mask_path) in val_set else "train"
        rel_key = image_path.relative_to(dataset_root).with_suffix("")
        safe_name = "_".join(rel_key.parts)

        out_img = output_root / "images" / split / f"{safe_name}.jpg"
        out_lbl = output_root / "labels" / split / f"{safe_name}.txt"

        img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if img is None:
            continue
        cv2.imwrite(str(out_img), img)
        cx, cy, bw, bh = bbox
        out_lbl.write_text(f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n", encoding="utf-8")
        kept += 1

    write_dataset_yaml(output_root, args.class_name)
    print(f"Pairs found: {len(pairs)}")
    print(f"Samples converted (non-empty masks): {kept}")
    print(f"Dataset YAML: {(output_root / 'dataset.yaml').resolve()}")


if __name__ == "__main__":
    main()
