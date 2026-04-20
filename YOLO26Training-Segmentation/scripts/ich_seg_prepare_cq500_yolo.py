"""
Download Seg-CQ500 (Zenodo) if needed, extract, and build a YOLO-segmentation dataset.

Source: https://zenodo.org/records/8063221 — intracranial hemorrhage voxel masks for 51
non-contrast head CT volumes from the CQ500 set (Spahr et al., Front. Neuroimaging 2023).

Citation: see Zenodo record and doi:10.3389/fnimg.2023.1157565

Output layout (Ultralytics segment):
  <out_root>/images/{train,val}/<stem>_z<idx>.png
  <out_root>/labels/{train,val}/<stem>_z<idx>.txt   # class 0 = hemorrhage polygon

HU window for display follows the Seg-CQ500 paper: clip [-50, 150] then scale to uint8.
"""

from __future__ import annotations

import argparse
import csv
import random
import shutil
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ZIP = ROOT / "dataset" / "staging" / "Seg-CQ500.zip"
DEFAULT_EXTRACT = ROOT / "dataset" / "staging" / "Seg-CQ500_extracted"
DEFAULT_OUT = ROOT / "dataset" / "ich_cq500_yolo_seg"
ZENODO_URL = "https://zenodo.org/records/8063221/files/Seg-CQ500.zip?download=1"
EXPECTED_BYTES = 2459717672
_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


def _count_images_in_dir(d: Path) -> int:
    if not d.is_dir():
        return 0
    return sum(1 for p in d.iterdir() if p.is_file() and p.suffix.lower() in _IMAGE_EXT)


def _yolo_seg_dataset_ready(out_root: Path) -> bool:
    """Non-empty train/val image splits (Ultralytics segment layout)."""
    for split in ("train", "val"):
        if _count_images_in_dir(out_root / "images" / split) < 1:
            return False
    return True


def _extract_ready(extract_dir: Path) -> bool:
    """Extracted tree already contains pairable CT/mask NIfTI volumes."""
    if not extract_dir.is_dir():
        return False
    try:
        return len(discover_ct_mask_pairs(extract_dir)) > 0
    except (FileNotFoundError, RuntimeError):
        return False


def _zip_is_complete(path: Path) -> bool:
    """True only if size matches Zenodo payload and central directory reads."""
    if not path.is_file():
        return False
    if path.stat().st_size != EXPECTED_BYTES:
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            zf.namelist()
    except zipfile.BadZipFile:
        return False
    return True


def _is_mask_filename(name: str) -> bool:
    n = name.lower()
    keys = ("mask", "label", "seg", "hem", "ich", "gt", "annotation")
    return any(k in n for k in keys) and "ct" not in n


def _stem_key(p: Path) -> str:
    s = p.name.lower().replace(".nii.gz", "").replace(".nii", "")
    for suf in ("_mask", "-mask", "_label", "_seg", "_hem", "_ich", "_gt"):
        if s.endswith(suf):
            s = s[: -len(suf)]
    return s


def _is_junk_nifti_path(p: Path) -> bool:
    """macOS zip metadata (__MACOSX, AppleDouble ._*) is not valid NIfTI."""
    norm = str(p).replace("\\", "/").lower()
    if "__macosx/" in norm or norm.endswith("__macosx"):
        return True
    return p.name.startswith("._")


def _try_discover_from_seg_cq500_csv(search_root: Path) -> list[tuple[Path, Path]] | None:
    """Seg-CQ500 ships data/volumes/info.csv with CT_fn and mask_fn (ICH_mask)."""
    for info_csv in sorted(search_root.rglob("info.csv")):
        if info_csv.parent.name.lower() != "volumes":
            continue
        try:
            with info_csv.open(newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                if not reader.fieldnames:
                    continue
                lower_map = {h.strip().lower(): h.strip() for h in reader.fieldnames}
                if "ct_fn" not in lower_map or "mask_fn" not in lower_map:
                    continue
                ct_col = lower_map["ct_fn"]
                mask_col = lower_map["mask_fn"]
                base = info_csv.parent
                out: list[tuple[Path, Path]] = []
                for row in reader:
                    ct_rel = (row.get(ct_col) or "").strip().replace("\\", "/")
                    mk_rel = (row.get(mask_col) or "").strip().replace("\\", "/")
                    if not ct_rel or not mk_rel:
                        continue
                    ct_p = (base / ct_rel).resolve()
                    mk_p = (base / mk_rel).resolve()
                    if not ct_p.is_file() or not mk_p.is_file():
                        continue
                    out.append((ct_p, mk_p))
                if out:
                    uniq: dict[tuple[str, str], tuple[Path, Path]] = {}
                    for a, b in out:
                        uniq[(str(a.resolve()), str(b.resolve()))] = (a, b)
                    pairs = sorted(uniq.values(), key=lambda t: str(t[0]).lower())
                    return pairs
        except OSError:
            continue
    return None


def _pick_ct_in_mask_folder(mask_path: Path, imgs: list[Path]) -> Path | None:
    """Prefer dataset CT.nii over brain.nii.gz (brain envelope is not the scan)."""
    parent = mask_path.parent
    for name in ("CT.nii.gz", "CT.nii"):
        p = parent / name
        if p.is_file():
            return p
    siblings = [im for im in imgs if im.parent == mask_path.parent and im != mask_path]
    for im in sorted(siblings, key=lambda p: p.name.lower()):
        low = im.name.lower()
        if low.startswith("brain."):
            continue
        if low.startswith("ct."):
            return im
    return siblings[0] if siblings else None


def discover_ct_mask_pairs(search_root: Path) -> list[tuple[Path, Path]]:
    raw = sorted(
        set(search_root.rglob("*.nii.gz")) | set(search_root.rglob("*.nii")),
        key=lambda p: str(p).lower(),
    )
    niftis = [p for p in raw if not _is_junk_nifti_path(p)]
    if not niftis:
        raise FileNotFoundError(f"No NIfTI under {search_root}")

    from_csv = _try_discover_from_seg_cq500_csv(search_root)
    if from_csv:
        return from_csv

    masks = [p for p in niftis if _is_mask_filename(p.name)]
    imgs = [p for p in niftis if p not in masks]
    if not masks:
        masks = [
            p
            for p in niftis
            if "mask" in p.parent.name.lower() or "label" in p.parent.name.lower()
        ]
        imgs = [p for p in niftis if p not in masks]

    pairs: list[tuple[Path, Path]] = []
    for m in masks:
        key = _stem_key(m)
        best: Path | None = None
        for im in imgs:
            if im == m:
                continue
            ik = _stem_key(im)
            if ik == key or key in ik or ik in key:
                best = im
                break
        if best is None:
            best = _pick_ct_in_mask_folder(m, imgs)
        if best is None:
            continue
        ct_p, mk_p = (best, m) if not _is_mask_filename(best.name) else (m, best)
        if _is_mask_filename(ct_p.name):
            ct_p, mk_p = mk_p, ct_p
        pairs.append((ct_p, mk_p))

    uniq: dict[tuple[str, str], tuple[Path, Path]] = {}
    for a, b in pairs:
        uniq[(str(a.resolve()), str(b.resolve()))] = (a, b)
    pairs = list(uniq.values())
    if not pairs:
        raise RuntimeError(
            "Could not pair CT and mask NIfTI files. Inspect the extracted zip layout under "
            f"{search_root} and adjust naming heuristics in ich_seg_prepare_cq500_yolo.py."
        )
    return pairs


def download_zip(dest: Path, *, _restarted: bool = False) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size > EXPECTED_BYTES:
        big = dest.stat().st_size
        print(f"Truncating zip from {big} to {EXPECTED_BYTES} bytes (trailing garbage after disconnect).")
        with open(dest, "r+b") as f:
            f.truncate(EXPECTED_BYTES)
        if _zip_is_complete(dest):
            print("Zip is valid after truncate.")
            return
        print("Truncate did not yield a valid zip; removing and re-downloading.")
        dest.unlink(missing_ok=True)

    start = dest.stat().st_size if dest.is_file() else 0
    if start >= EXPECTED_BYTES and _zip_is_complete(dest):
        print(f"Zip already complete: {dest}")
        return
    if start >= EXPECTED_BYTES and not _zip_is_complete(dest):
        print(f"Zip has expected size but is unreadable; re-downloading: {dest}")
        dest.unlink(missing_ok=True)
        start = 0

    headers = {"User-Agent": "YOLO26Training-Segmentation-prepare/1.0"}
    if start > 0:
        headers["Range"] = f"bytes={start}-"
        print(f"Resuming download from byte {start} …")
    else:
        print(f"Downloading Seg-CQ500 (~{EXPECTED_BYTES // (1024**3)} GiB) …")
    req = urllib.request.Request(ZENODO_URL, headers=headers)
    mode = "ab" if start > 0 else "wb"
    max_retries = 12
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                code = resp.getcode() if hasattr(resp, "getcode") else getattr(resp, "status", 200)
                if start > 0 and code != 206:
                    if _restarted:
                        raise RuntimeError(
                            f"Byte-range resume not supported (HTTP {code}). Delete and retry: {dest}"
                        )
                    print("Server did not return 206 Partial Content; restarting download from scratch.")
                    dest.unlink(missing_ok=True)
                    download_zip(dest, _restarted=True)
                    return
                with open(dest, mode) as out:
                    shutil.copyfileobj(resp, out, length=1024 * 1024)
            break
        except (ConnectionResetError, BrokenPipeError, TimeoutError, OSError) as e:
            if attempt + 1 >= max_retries:
                raise RuntimeError(
                    f"Download failed after {max_retries} attempts (last error: {e}). "
                    f"Re-run this script to resume from byte {dest.stat().st_size if dest.is_file() else 0}."
                ) from e
            wait = min(8.0, 1.5 ** attempt)
            print(f"Network error ({type(e).__name__}: {e}); retrying in {wait:.1f}s …")
            time.sleep(wait)
            start = dest.stat().st_size if dest.is_file() else 0
            if start > EXPECTED_BYTES:
                dest.unlink(missing_ok=True)
                start = 0
            if start >= EXPECTED_BYTES:
                break
            headers = {"User-Agent": "YOLO26Training-Segmentation-prepare/1.0"}
            if start > 0:
                headers["Range"] = f"bytes={start}-"
            req = urllib.request.Request(ZENODO_URL, headers=headers)
            mode = "ab" if start > 0 else "wb"
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP error during download: {e}") from e
    sz = dest.stat().st_size
    if sz != EXPECTED_BYTES:
        print(f"Download stopped at {sz} bytes (expected {EXPECTED_BYTES}). Run again to resume.")
    elif _zip_is_complete(dest):
        print(f"Saved complete zip: {dest}")
    else:
        print(f"Warning: size matches but zip validation failed: {dest}")


def extract_zip(zip_path: Path, extract_to: Path) -> None:
    extract_to.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_to)
    except zipfile.BadZipFile as e:
        raise RuntimeError(
            f"Invalid or incomplete zip (download may have been interrupted): {zip_path}\n"
            f"Expected exactly {EXPECTED_BYTES} bytes. Current size: {zip_path.stat().st_size if zip_path.is_file() else 0}.\n"
            "Fix: delete this file, then run again without --skip-download (download will resume if the server supports HTTP Range)."
        ) from e
    print(f"Extracted to: {extract_to}")


def window_ct_slice(slc: "object", lo: float = -50.0, hi: float = 150.0) -> "object":
    import numpy as np

    x = np.asarray(slc, dtype=np.float32)
    x = np.clip(x, lo, hi)
    x = (x - lo) / max(hi - lo, 1e-6)
    return (x * 255.0).astype(np.uint8)


def mask_to_yolo_polygons(
    bin_mask: "object", class_id: int = 0, min_area_px: int = 8
) -> list[str]:
    import cv2
    import numpy as np

    m = (np.asarray(bin_mask) > 0).astype(np.uint8) * 255
    h, w = m.shape[:2]
    if m.max() == 0:
        return []
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    lines: list[str] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area_px:
            continue
        if len(cnt) < 3:
            continue
        eps = 0.002 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, eps, True)
        pts = approx.reshape(-1, 2)
        if len(pts) < 3:
            continue
        flat: list[float] = []
        for px, py in pts:
            flat.append(float(px) / w)
            flat.append(float(py) / h)
        lines.append(str(class_id) + " " + " ".join(f"{v:.6f}" for v in flat))
    return lines


def volume_to_slices(
    ct_path: Path,
    mask_path: Path,
    out_img_dir: Path,
    out_lbl_dir: Path,
    stem: str,
    *,
    skip_empty_mask_slices: bool,
) -> int:
    import cv2
    import nibabel as nib
    import numpy as np

    ct_img = nib.load(str(ct_path))
    mk_img = nib.load(str(mask_path))
    ct = np.asanyarray(ct_img.dataobj)
    mk = np.asanyarray(mk_img.dataobj)
    if ct.shape != mk.shape:
        raise ValueError(f"Shape mismatch {ct.shape} vs {mk.shape} for {ct_path} / {mask_path}")

    if ct.ndim == 4:
        ct = ct[..., 0]
        mk = mk[..., 0]
    if ct.ndim != 3:
        raise ValueError(f"Expected 3D volume, got {ct.shape}")

    n_written = 0
    for z in range(ct.shape[2]):
        slc_ct = ct[:, :, z]
        slc_mk = mk[:, :, z]
        if skip_empty_mask_slices and not np.any(slc_mk > 0):
            continue
        vis = window_ct_slice(slc_ct)
        if vis.ndim == 2:
            vis_bgr = np.stack([vis, vis, vis], axis=-1)
        else:
            vis_bgr = vis
        base = f"{stem}_z{z:04d}"
        img_path = out_img_dir / f"{base}.png"
        lbl_path = out_lbl_dir / f"{base}.txt"
        polys = mask_to_yolo_polygons(slc_mk, class_id=0)
        cv2.imwrite(str(img_path), vis_bgr)
        lbl_path.write_text("\n".join(polys) + ("\n" if polys else ""), encoding="utf-8")
        n_written += 1
    return n_written


def main() -> None:
    parser = argparse.ArgumentParser(description="Seg-CQ500 → YOLO segment dataset (ICH).")
    parser.add_argument("--zip-path", type=str, default=str(DEFAULT_ZIP))
    parser.add_argument("--extract-dir", type=str, default=str(DEFAULT_EXTRACT))
    parser.add_argument("--out-root", type=str, default=str(DEFAULT_OUT))
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument(
        "--wipe-zip",
        action="store_true",
        help="Delete the local zip and download again from scratch.",
    )
    parser.add_argument("--force-extract", action="store_true")
    parser.add_argument(
        "--force-rebuild",
        action="store_true",
        help="Rebuild the YOLO dataset folder even if train/val images already exist.",
    )
    parser.add_argument("--train-ratio", type=float, default=0.85)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--include-negative-slices",
        action="store_true",
        help="Export every slice (large); default: only slices with hemorrhage mask.",
    )
    args = parser.parse_args()
    zip_path = Path(args.zip_path)
    if not zip_path.is_absolute():
        zip_path = (ROOT / zip_path).resolve()
    extract_dir = Path(args.extract_dir)
    if not extract_dir.is_absolute():
        extract_dir = (ROOT / extract_dir).resolve()
    out_root = Path(args.out_root)
    if not out_root.is_absolute():
        out_root = (ROOT / out_root).resolve()

    if args.wipe_zip and args.skip_download:
        raise SystemExit("--wipe-zip cannot be combined with --skip-download (zip was removed; download is disabled).")

    if args.wipe_zip and zip_path.is_file():
        try:
            zip_path.unlink()
            print(f"Removed --wipe-zip: {zip_path}")
        except PermissionError as e:
            raise SystemExit(
                f"Cannot delete zip (in use by another process): {zip_path}\n"
                "Close other terminals / Python jobs using this file, or run:\n"
                "  Get-CimInstance Win32_Process -Filter \"Name = 'python.exe'\" | "
                "Where-Object { $_.CommandLine -match 'ich_seg_prepare_cq500' } | "
                "% { Stop-Process -Id $_.ProcessId -Force }\n"
                f"Original error: {e}"
            ) from e

    extract_ok = _extract_ready(extract_dir)
    yolo_ok = _yolo_seg_dataset_ready(out_root)

    if yolo_ok and not args.force_rebuild and not args.force_extract:
        print(
            f"YOLO segmentation dataset already present at:\n  {out_root}\n"
            "Skipping download, extract, and conversion. Use --force-rebuild to regenerate."
        )
        return

    zip_ok = _zip_is_complete(zip_path)

    if not args.skip_download:
        if args.wipe_zip:
            download_zip(zip_path)
            zip_ok = _zip_is_complete(zip_path)
        elif zip_ok:
            print(f"Valid Seg-CQ500.zip already at:\n  {zip_path}\nSkipping download.")
        else:
            if extract_ok:
                print(
                    "Partial or stale extract exists, but ZIP is not complete - "
                    f"finishing download ({zip_path.stat().st_size if zip_path.is_file() else 0} / "
                    f"{EXPECTED_BYTES} bytes) before extract/conversion."
                )
            download_zip(zip_path)
            zip_ok = _zip_is_complete(zip_path)
    elif not zip_ok and not extract_ok:
        raise SystemExit(
            "--skip-download but neither a complete zip nor extracted NIfTI is available.\n"
            f"  zip: {zip_path}\n"
            f"  extract: {extract_dir}"
        )

    if not args.skip_download and not zip_ok:
        cur = zip_path.stat().st_size if zip_path.is_file() else 0
        raise SystemExit(
            f"ZIP not complete ({cur} / {EXPECTED_BYTES} bytes). "
            "Re-run this script to resume the download.\n"
            "Extract and YOLO conversion run only after the official zip is complete and valid."
        )

    if args.force_extract and extract_dir.exists():
        shutil.rmtree(extract_dir)
        extract_ok = False

    has_extract_files = extract_dir.is_dir() and any(extract_dir.iterdir())
    need_extract = args.force_extract or not has_extract_files
    if need_extract:
        if not zip_ok:
            if not zip_path.is_file():
                raise FileNotFoundError(
                    f"Cannot extract: missing zip and no usable extract dir.\nExpected zip: {zip_path}"
                )
            cur = zip_path.stat().st_size
            raise SystemExit(
                f"Seg-CQ500.zip is not complete ({cur} / {EXPECTED_BYTES} bytes).\n"
                "Re-run this script to resume the download, or place a complete zip at the path above."
            )
        extract_zip(zip_path, extract_dir)

    pairs = discover_ct_mask_pairs(extract_dir)
    print(f"Found {len(pairs)} CT/mask volume pairs.")

    for sub in ("images/train", "images/val", "labels/train", "labels/val"):
        (out_root / sub).mkdir(parents=True, exist_ok=True)

    rng = random.Random(args.seed)
    order = list(range(len(pairs)))
    rng.shuffle(order)
    n_train = max(1, int(len(pairs) * args.train_ratio))
    train_indices = set(order[:n_train])

    skip_empty = not args.include_negative_slices
    total_slices = 0
    for idx, (ct_p, mk_p) in enumerate(pairs):
        stem = f"case{idx:04d}"
        split = "train" if idx in train_indices else "val"
        img_d = out_root / "images" / split
        lbl_d = out_root / "labels" / split
        n = volume_to_slices(
            ct_p,
            mk_p,
            img_d,
            lbl_d,
            stem,
            skip_empty_mask_slices=skip_empty,
        )
        total_slices += n
        print(f"  {stem} ({split}): {n} slices from {ct_p.name}")

    print(f"Done. YOLO root: {out_root}  (total PNG slices: {total_slices})")
    print(
        "Train with (first CUDA GPU; use --device cpu if no GPU):\n"
        f'  python scripts/ich_seg_pipeline.py --dataset-root "{out_root}" '
        "--class-names hemorrhage --nc 1 --device 0 --epochs 30 --batch 8"
    )


if __name__ == "__main__":
    main()
