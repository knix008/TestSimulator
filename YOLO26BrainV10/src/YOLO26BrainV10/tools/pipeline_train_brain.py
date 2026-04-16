# -*- coding: utf-8 -*-
"""End-to-end: dataset download (optional) -> YOLO26n-seg train -> ONNX export for YOLO26BrainV10.

Usage (from this directory):
  pip install -r requirements-train.txt
  python pipeline_train_brain.py
  python pipeline_train_brain.py --epochs 50 --skip-download
  python pipeline_train_brain.py --force-download --out-onnx ..\\models\\brain_seg.onnx

Verify last successful run (weights + ONNX on disk):
  python pipeline_train_brain.py --verify
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

MANIFEST_NAME = ".pipeline_last.json"
SCHEMA_VERSION = 1


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    for path in [cur, *cur.parents]:
        if (path / "YOLO26BrainV10.sln").is_file() or (path / "YOLO26BrainV10.slnx").is_file():
            return path
    raise FileNotFoundError(
        f"Could not find YOLO26BrainV10.sln or YOLO26BrainV10.slnx from: {start}"
    )


def _file_status(path: Path) -> tuple[bool, int]:
    if not path.is_file():
        return False, 0
    return True, path.stat().st_size


def print_verification(weights: Path, onnx: Path, *, title: str = "검증") -> int:
    """Print human-readable checks. Returns 0 if all OK, else 1."""
    print()
    print(f"--- {title} ---")
    w_ok, w_sz = _file_status(weights)
    o_ok, o_sz = _file_status(onnx)
    print(f"  weights: {'OK' if w_ok else 'MISSING'}  {weights}")
    if w_ok:
        print(f"            size: {w_sz:,} bytes")
    print(f"  onnx:    {'OK' if o_ok else 'MISSING'}  {onnx}")
    if o_ok:
        print(f"            size: {o_sz:,} bytes")
    if w_ok and o_ok and w_sz > 0 and o_sz > 0:
        print("  결과: 전체 통과 (exit 0)")
        return 0
    print("  결과: 실패 — 파일이 없거나 크기가 0입니다 (exit 1)", file=sys.stderr)
    return 1


def write_manifest(
    repo: Path,
    *,
    run_name: str,
    weights: Path,
    onnx: Path,
    exit_code: int,
) -> None:
    manifest = repo / MANIFEST_NAME
    w_ok, w_sz = _file_status(weights)
    o_ok, o_sz = _file_status(onnx)
    payload = {
        "schema": SCHEMA_VERSION,
        "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "exit_code": exit_code,
        "run_name": run_name,
        "weights": str(weights.resolve()),
        "onnx": str(onnx.resolve()),
        "weights_bytes": w_sz if w_ok else None,
        "onnx_bytes": o_sz if o_ok else None,
        "weights_exists": w_ok,
        "onnx_exists": o_ok,
    }
    manifest.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"(기록됨: {manifest})")


def verify_last_run(repo: Path) -> int:
    manifest = repo / MANIFEST_NAME
    if not manifest.is_file():
        print(
            f"검증할 기록이 없습니다: {manifest}\n"
            "먼저 파이프라인을 한 번 성공적으로 끝까지 실행하세요.",
            file=sys.stderr,
        )
        return 1
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"손상된 매니페스트: {manifest}\n{e}", file=sys.stderr)
        return 1

    w = Path(data.get("weights", ""))
    o = Path(data.get("onnx", ""))
    when = data.get("completed_at_utc", "?")
    print(f"마지막 파이프라인 기록 (UTC): {when}")
    if data.get("exit_code") != 0:
        print(f"참고: 기록된 exit_code={data.get('exit_code')} (성공은 보통 0)", file=sys.stderr)
    return print_verification(w, o, title="저장된 경로 검증")


def main() -> int:
    here = Path(__file__).resolve().parent
    repo = find_repo_root(here)

    p = argparse.ArgumentParser(
        description="Download brain-tumor dataset (optional), train YOLO26n-seg, export ONNX.",
    )
    p.add_argument("--repo", type=Path, default=None, help="Repo root (default: auto-detect).")
    p.add_argument(
        "--verify",
        action="store_true",
        help="학습/다운로드/export는 하지 않고, 마지막 성공 기록(.pipeline_last.json)만 검사합니다.",
    )
    p.add_argument(
        "--skip-download",
        action="store_true",
        help="Do not run download_brain_dataset.py (use existing data/brain_ct_seg).",
    )
    p.add_argument(
        "--force-download",
        action="store_true",
        help="Pass --force to download_brain_dataset.py.",
    )
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--device", default=None, help="e.g. 0 or cpu (forwarded to train script).")
    p.add_argument(
        "--run-name",
        default=None,
        help="Ultralytics run name under project (default: from_scratch_UTCtimestamp).",
    )
    p.add_argument(
        "--out-onnx",
        default=None,
        help="Output ONNX path (default: <repo>/models/brain_ct_yolo26n_seg.onnx).",
    )
    args = p.parse_args()

    if args.repo:
        repo = args.repo.expanduser().resolve()

    if args.verify:
        return verify_last_run(repo)

    py = sys.executable
    download_py = here / "download_brain_dataset.py"
    train_py = here / "train_yolo26n_seg_brain_ct.py"
    export_py = here / "export_yolo26_brain_onnx.py"

    if not args.skip_download:
        cmd = [py, str(download_py), "--repo", str(repo)]
        if args.force_download:
            cmd.append("--force")
        print("+", " ".join(cmd))
        rc = subprocess.call(cmd, cwd=str(here))
        if rc not in (0, 1):
            return int(rc)
        if rc == 1:
            print("(download exited 1: dataset already present; continuing.)")

    run_name = args.run_name or datetime.now(timezone.utc).strftime("from_scratch_%Y%m%d_%H%M%Sutc")
    train_cmd = [
        py,
        str(train_py),
        "--repo",
        str(repo),
        "--epochs",
        str(args.epochs),
        "--imgsz",
        str(args.imgsz),
        "--batch",
        str(args.batch),
        "--project",
        str(repo / "runs"),
        "--name",
        run_name,
        "--exist-ok",
    ]
    if args.device:
        train_cmd.extend(["--device", args.device])
    print("+", " ".join(train_cmd))
    if subprocess.call(train_cmd, cwd=str(here)) != 0:
        return 2

    weights = repo / "runs" / run_name / "weights" / "best.pt"
    if not weights.is_file():
        print(f"ERROR: expected weights not found: {weights}", file=sys.stderr)
        return 3

    out = (
        Path(args.out_onnx).expanduser().resolve()
        if args.out_onnx
        else (repo / "models" / "brain_ct_yolo26n_seg.onnx")
    )
    out.parent.mkdir(parents=True, exist_ok=True)

    export_cmd = [
        py,
        str(export_py),
        "--weights",
        str(weights),
        "--out",
        str(out),
        "--imgsz",
        str(args.imgsz),
    ]
    print("+", " ".join(export_cmd))
    if subprocess.call(export_cmd, cwd=str(here)) != 0:
        return 4

    print()
    print("Pipeline finished.")
    print(f"  ONNX: {out}")
    print(f"  Weights: {weights}")

    v = print_verification(weights, out, title="이번 실행 검증")
    write_manifest(repo, run_name=run_name, weights=weights, onnx=out, exit_code=v)
    return v


if __name__ == "__main__":
    raise SystemExit(main())
