#!/usr/bin/env python3
"""Download Ultralytics brain tumor sample image for YOLO26BrainV10.

Usage:
  python download_sample_assets.py
  python download_sample_assets.py --out-dir "D:/path/to/YOLO26BrainV10/samples"
"""

from __future__ import annotations

import argparse
import shutil
import urllib.request
from pathlib import Path


IMAGE_URL = "https://github.com/ultralytics/assets/releases/download/v0.0.0/brain-tumor-sample.jpg"
IMAGE_NAME = "brain_tumor_sample.jpg"


def resolve_default_samples_dir(script_dir: Path) -> Path:
    for path in [script_dir, *script_dir.parents]:
        marker = path / "samples" / "coco80_labels_comma.txt"
        if marker.is_file():
            return (path / "samples").resolve()

    # Fallback from src/YOLO26BrainV10/tools -> repo root
    repo_root = script_dir.parents[2]
    return (repo_root / "samples").resolve()


def download_to_file(url: str, out_path: Path) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "YOLO26BrainV10-download-sample-assets/1.0"},
    )
    with urllib.request.urlopen(req, timeout=300) as resp:  # noqa: S310 (fixed trusted URL)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("wb") as f:
            shutil.copyfileobj(resp, f)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Downloads the Ultralytics brain-tumor sample slice (CT/MRI-style) for YOLO26BrainV10."
    )
    parser.add_argument(
        "--out-dir",
        default="",
        help="Output directory. Default resolves to <repo>/samples.",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    out_dir = Path(args.out_dir).expanduser().resolve() if args.out_dir else resolve_default_samples_dir(script_dir)
    image_path = out_dir / IMAGE_NAME

    print(f"Output directory: {out_dir}")
    print("Downloading brain tumor sample image (Ultralytics) ...")
    download_to_file(IMAGE_URL, image_path)
    print("Done.")
    print(f"  Image: {image_path}")
    print("  Labels (brain-tumor.yaml): negative,positive")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
