"""Copy a few image + YOLO-seg label pairs into sample/ for Gradio or manual tests."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = ROOT / "dataset" / "ich_cq500_yolo_seg"
DEFAULT_OUT = ROOT / "sample" / "segmentation"


def _default_verify_weights() -> Path | None:
    for rel in (
        Path("runs/segment/ich_cq500_seg/train1/weights/best.pt"),
        Path("models/ich_yolo26n_seg_best.pt"),
    ):
        p = (ROOT / rel).resolve()
        if p.is_file():
            return p
    return None


def volume_key(stem: str) -> str:
    parts = stem.split("_z")
    return parts[0] if parts else stem


def _nonempty_label_stems(img_dir: Path, lbl_dir: Path) -> list[str]:
    stems: list[str] = []
    for png in sorted(img_dir.glob("*.png")):
        stem = png.stem
        lt = lbl_dir / f"{stem}.txt"
        if not lt.is_file():
            continue
        if not lt.read_text(encoding="utf-8").strip():
            continue
        stems.append(stem)
    return stems


def _pick_with_model_verify(
    img_dir: Path,
    lbl_dir: Path,
    weights: Path,
    count: int,
    min_conf: float,
) -> list[str]:
    """Prefer distinct volumes; keep only slices where the segment model reaches min_conf (eval at conf=0.001)."""
    from ultralytics import YOLO

    model = YOLO(str(weights), task="segment")
    candidates = _nonempty_label_stems(img_dir, lbl_dir)
    picked: list[str] = []
    used_volumes: set[str] = set()
    for stem in candidates:
        vk = volume_key(stem)
        if vk in used_volumes:
            continue
        png = img_dir / f"{stem}.png"
        r = model.predict(source=str(png), conf=0.001, verbose=False)[0]
        if r.boxes is None or len(r.boxes) == 0:
            continue
        if float(r.boxes.conf.max()) < min_conf:
            continue
        picked.append(stem)
        used_volumes.add(vk)
        if len(picked) >= count:
            return picked

    for stem in candidates:
        if stem in picked:
            continue
        png = img_dir / f"{stem}.png"
        r = model.predict(source=str(png), conf=0.001, verbose=False)[0]
        if r.boxes is None or len(r.boxes) == 0:
            continue
        if float(r.boxes.conf.max()) < min_conf:
            continue
        picked.append(stem)
        if len(picked) >= count:
            return picked
    return picked


def _pick_heuristic_distinct_volumes(candidates: list[str], count: int) -> list[str]:
    stems: list[str] = []
    used_volumes: set[str] = set()
    for stem in candidates:
        vk = volume_key(stem)
        if vk in used_volumes:
            continue
        stems.append(stem)
        used_volumes.add(vk)
        if len(stems) >= count:
            return stems
    for stem in candidates:
        if stem in stems:
            continue
        stems.append(stem)
        if len(stems) >= count:
            break
    return stems


def main() -> None:
    p = argparse.ArgumentParser(description="Copy N image+label pairs to sample/ for Gradio.")
    p.add_argument("--dataset-root", type=str, default=str(DEFAULT_DATASET))
    p.add_argument("--out-dir", type=str, default=str(DEFAULT_OUT))
    p.add_argument("--count", type=int, default=2)
    p.add_argument("--split", type=str, default="val", choices=("train", "val"))
    p.add_argument(
        "--verify-weights",
        type=str,
        default="",
        help="Segment .pt to score slices (default: train best.pt or models copy if present). Empty = skip.",
    )
    p.add_argument(
        "--verify-conf",
        type=float,
        default=0.22,
        help="Minimum max(conf) on a slice to accept (model checked at conf=0.001).",
    )
    p.add_argument("--no-verify", action="store_true", help="Ignore --verify-weights and use label-only heuristic.")
    args = p.parse_args()

    ds = Path(args.dataset_root)
    if not ds.is_absolute():
        ds = (ROOT / ds).resolve()
    out = Path(args.out_dir)
    if not out.is_absolute():
        out = (ROOT / out).resolve()

    img_dir = ds / "images" / args.split
    lbl_dir = ds / "labels" / args.split
    if not img_dir.is_dir() or not lbl_dir.is_dir():
        raise SystemExit(f"Missing images or labels under {ds} for split={args.split}")

    candidates = _nonempty_label_stems(img_dir, lbl_dir)
    if not candidates:
        raise SystemExit(f"No labeled PNGs under {img_dir}")

    wpath: Path | None = None
    if not args.no_verify:
        if str(args.verify_weights).strip():
            wpath = Path(args.verify_weights)
            if not wpath.is_absolute():
                wpath = (ROOT / wpath).resolve()
        else:
            wpath = _default_verify_weights()

    stems: list[str] = []
    if wpath is not None and wpath.is_file():
        stems = _pick_with_model_verify(img_dir, lbl_dir, wpath, args.count, float(args.verify_conf))
        if len(stems) < args.count:
            print(
                f"Warning: model verify ({wpath.name}, min max-conf {args.verify_conf}) "
                f"only yielded {len(stems)} slice(s); filling with heuristic picks."
            )
        if len(stems) < args.count:
            rest = _pick_heuristic_distinct_volumes(candidates, args.count)
            for s in rest:
                if s not in stems:
                    stems.append(s)
                if len(stems) >= args.count:
                    break
    else:
        if not args.no_verify:
            print("Warning: no verify weights found; using label-only distinct-volume heuristic.")
        stems = _pick_heuristic_distinct_volumes(candidates, args.count)

    if len(stems) < args.count:
        for png in sorted(img_dir.glob("*.png")):
            stem = png.stem
            if stem in stems:
                continue
            if (lbl_dir / f"{stem}.txt").is_file():
                stems.append(stem)
            if len(stems) >= args.count:
                break

    if not stems:
        raise SystemExit(f"No PNG + label pairs found under {img_dir}")

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    manifest: list[dict[str, str]] = []
    for i, stem in enumerate(stems[: args.count], start=1):
        sub = out / f"case{i:02d}"
        sub.mkdir(parents=True, exist_ok=False)
        src_img = img_dir / f"{stem}.png"
        src_lbl = lbl_dir / f"{stem}.txt"
        shutil.copy2(src_img, sub / "image.png")
        shutil.copy2(src_lbl, sub / "label.txt")
        manifest.append(
            {
                "id": f"case{i:02d}",
                "stem": stem,
                "split": args.split,
                "image": str((sub / "image.png").relative_to(out)).replace("\\", "/"),
                "label": str((sub / "label.txt").relative_to(out)).replace("\\", "/"),
            }
        )

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest)} sample(s) under:\n  {out}")
    for m in manifest:
        print(f"  - {m['id']}: {m['stem']} ({m['split']})")


if __name__ == "__main__":
    main()
