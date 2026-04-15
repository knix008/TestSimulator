# -*- coding: utf-8 -*-
"""
Ultralytics 공개 brain-tumor 데이터셋을 내려받아 저장소의 data/brain_ct_seg/ 에 채웁니다.

실제 동작은 brain_ct_pipeline.py 의 fetch 와 동일합니다(검출 박스 → 세그용 사각형 폴리곤 변환).

  pip install -r requirements-export.txt

  python download_brain_dataset.py
  python download_brain_dataset.py --force
  python download_brain_dataset.py --repo C:\\path\\to\\YOLO11BrainV10

데이터: https://docs.ultralytics.com/datasets/detect/brain-tumor/ (AGPL-3.0)
"""

from __future__ import annotations

import argparse
import runpy
import sys
from pathlib import Path


def main() -> None:
    p = argparse.ArgumentParser(
        description="Download Ultralytics brain-tumor.zip into data/brain_ct_seg (via brain_ct_pipeline fetch).",
    )
    p.add_argument(
        "--repo",
        type=Path,
        default=None,
        help="Repository root containing YOLO11BrainV10.sln (default: auto-detect from script location).",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Clear existing train/val images and labels under data/brain_ct_seg, then re-download.",
    )
    ns, rest = p.parse_known_args()
    if rest:
        p.error(f"unexpected arguments: {' '.join(rest)}")

    tools_dir = Path(__file__).resolve().parent
    pipeline = tools_dir / "brain_ct_pipeline.py"
    if not pipeline.is_file():
        print(f"Missing: {pipeline}", file=sys.stderr)
        raise SystemExit(1)

    argv = [str(pipeline)]
    if ns.repo is not None:
        argv.extend(["--repo", str(ns.repo.expanduser().resolve())])
    argv.append("fetch")
    if ns.force:
        argv.append("--force")

    sys.argv = argv
    runpy.run_path(str(pipeline), run_name="__main__")


if __name__ == "__main__":
    main()
