import argparse
import random
from pathlib import Path

import cv2
import yaml


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}


def mask_to_polygons(mask_path: Path, min_area: float = 20.0) -> list[list[float]]:
    mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return []

    h, w = mask.shape[:2]
    _, binary = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    polygons: list[list[float]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        eps = 0.002 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, eps, True)
        if len(approx) < 3:
            continue

        points: list[float] = []
        for p in approx[:, 0, :]:
            x, y = float(p[0]), float(p[1])
            x = min(max(x / w, 0.0), 1.0)
            y = min(max(y / h, 0.0), 1.0)
            points.extend([x, y])

        if len(points) >= 6:
            polygons.append(points)

    return polygons


def collect_pairs(root: Path) -> list[tuple[Path, Path]]:
    pairs: list[tuple[Path, Path]] = []
    for mask_path in root.rglob("*_HGE_Seg.jpg"):
        image_name = mask_path.name.replace("_HGE_Seg.jpg", ".jpg")
        image_path = mask_path.with_name(image_name)
        if image_path.exists():
            pairs.append((image_path, mask_path))
    return pairs


def write_dataset_yaml(output_root: Path, class_name: str) -> None:
    data = {
        "path": str(output_root.resolve()),
        "train": "images/train",
        "val": "images/val",
        "names": {0: class_name},
    }
    yaml_path = output_root / "dataset.yaml"
    with yaml_path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert CT-ICH JPG + mask dataset to YOLO segmentation format.")
    parser.add_argument("--dataset-root", type=str, required=True, help="Root containing Patients_CT")
    parser.add_argument("--output-root", type=str, default="yolo_dataset_seg_public", help="YOLO output root directory")
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
        if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue

        polygons = mask_to_polygons(mask_path)
        if not polygons:
            continue

        split = "val" if (image_path, mask_path) in val_set else "train"
        rel_key = image_path.relative_to(dataset_root).with_suffix("")
        safe_name = "_".join(rel_key.parts)

        out_image = output_root / "images" / split / f"{safe_name}.jpg"
        out_label = output_root / "labels" / split / f"{safe_name}.txt"

        img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if img is None:
            continue
        cv2.imwrite(str(out_image), img)

        lines = []
        for poly in polygons:
            coords = " ".join(f"{v:.6f}" for v in poly)
            lines.append(f"0 {coords}")
        out_label.write_text("\n".join(lines) + "\n", encoding="utf-8")
        kept += 1

    write_dataset_yaml(output_root, args.class_name)
    print(f"Pairs found: {len(pairs)}")
    print(f"Samples converted (non-empty masks): {kept}")
    print(f"Dataset YAML: {(output_root / 'dataset.yaml').resolve()}")


if __name__ == "__main__":
    main()
