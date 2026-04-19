"""
Copy up to N images from brain-tumor **train** split that have at least one YOLO box with class id 1 (positive).

Run from project root:
  .\\venv\\Scripts\\python.exe scripts\\sync_positive_train_samples.py
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LABELS_TRAIN = ROOT / "dataset" / "brain-tumor" / "labels" / "train"
IMAGES_TRAIN = ROOT / "dataset" / "brain-tumor" / "images" / "train"
SAMPLE_DIR = ROOT / "sample"
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


def _stem_has_positive_class(label_path: Path) -> bool:
    text = label_path.read_text(encoding="utf-8").strip()
    if not text:
        return False
    for line in text.splitlines():
        parts = line.split()
        if not parts:
            continue
        try:
            if int(float(parts[0])) == 1:
                return True
        except ValueError:
            continue
    return False


def _find_image_for_stem(stem: str) -> Path | None:
    for ext in IMAGE_EXTS:
        p = IMAGES_TRAIN / f"{stem}{ext}"
        if p.is_file():
            return p
    return None


def collect_positive_train_images(limit: int) -> list[Path]:
    if not LABELS_TRAIN.is_dir():
        raise FileNotFoundError(f"Missing labels dir: {LABELS_TRAIN}")
    if not IMAGES_TRAIN.is_dir():
        raise FileNotFoundError(f"Missing images dir: {IMAGES_TRAIN}")

    out: list[Path] = []
    for label in sorted(LABELS_TRAIN.glob("*.txt")):
        if not _stem_has_positive_class(label):
            continue
        img = _find_image_for_stem(label.stem)
        if img is None:
            continue
        out.append(img)
        if len(out) >= limit:
            break
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=2, help="How many positive train images to copy")
    parser.add_argument(
        "--out-prefix",
        default="sample_positive_train",
        help="Output base name: {prefix}_01.jpg, ...",
    )
    args = parser.parse_args()

    images = collect_positive_train_images(args.count)
    if len(images) < args.count:
        raise SystemExit(
            f"Need {args.count} positive train images but only found {len(images)}. "
            f"Check dataset under {LABELS_TRAIN.parent.parent}."
        )

    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    for i, src in enumerate(images, start=1):
        dest = SAMPLE_DIR / f"{args.out_prefix}_{i:02d}{src.suffix.lower()}"
        if dest.suffix not in IMAGE_EXTS:
            dest = dest.with_suffix(".jpg")
        shutil.copy2(src, dest)
        print(f"Copied: {src.relative_to(ROOT)} -> {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
