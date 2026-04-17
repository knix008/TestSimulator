import argparse
from pathlib import Path

import cv2
import nibabel as nib
import numpy as np
from sklearn.model_selection import train_test_split


def normalize_to_uint8(slice_2d: np.ndarray, ww: float = 80.0, wl: float = 40.0) -> np.ndarray:
    # Typical brain window for head CT.
    low = wl - (ww / 2.0)
    high = wl + (ww / 2.0)
    clipped = np.clip(slice_2d, low, high)
    norm = ((clipped - low) / (high - low) * 255.0).astype(np.uint8)
    return norm


def mask_to_yolo_polygon(mask_2d: np.ndarray) -> list[float]:
    # Expects binary mask (0/1), returns normalized polygon points x1 y1 x2 y2 ...
    h, w = mask_2d.shape
    contours, _ = cv2.findContours(mask_2d.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    largest = max(contours, key=cv2.contourArea)
    epsilon = 0.003 * cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, epsilon, True)
    points = approx.reshape(-1, 2)
    if len(points) < 3:
        return []

    poly: list[float] = []
    for x, y in points:
        poly.append(float(x) / float(w))
        poly.append(float(y) / float(h))
    return poly


def write_yaml(yaml_path: Path, dataset_root: Path, class_names: list[str]) -> None:
    content = (
        f"train: {str((dataset_root / 'images' / 'train').as_posix())}\n"
        f"val: {str((dataset_root / 'images' / 'val').as_posix())}\n"
        f"nc: {len(class_names)}\n"
        f"names: {class_names}\n"
    )
    yaml_path.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert NIfTI CT + mask volumes to YOLO segmentation dataset.")
    parser.add_argument("--ct-dir", type=str, required=True, help="Directory containing CT NIfTI volumes")
    parser.add_argument("--mask-dir", type=str, required=True, help="Directory containing mask NIfTI volumes")
    parser.add_argument("--output-root", type=str, default="yolo_dataset_seg_real", help="Output YOLO dataset root")
    parser.add_argument("--class-id", type=int, default=0, help="Class id for all masks")
    parser.add_argument("--class-name", type=str, default="hemorrhage", help="Class name for YAML")
    parser.add_argument("--test-size", type=float, default=0.2, help="Validation split ratio")
    parser.add_argument("--random-state", type=int, default=42, help="Random seed for split")
    args = parser.parse_args()

    ct_dir = Path(args.ct_dir)
    mask_dir = Path(args.mask_dir)
    out_root = Path(args.output_root)

    if not ct_dir.exists():
        raise FileNotFoundError(f"CT directory not found: {ct_dir.resolve()}")
    if not mask_dir.exists():
        raise FileNotFoundError(f"Mask directory not found: {mask_dir.resolve()}")

    ct_files = sorted([p for p in ct_dir.glob("*.nii*")])
    if not ct_files:
        raise FileNotFoundError(f"No NIfTI files in CT dir: {ct_dir.resolve()}")

    items: list[tuple[Path, Path]] = []
    for ct_path in ct_files:
        mask_path = mask_dir / ct_path.name
        if mask_path.exists():
            items.append((ct_path, mask_path))
    if not items:
        raise RuntimeError("No matched CT/mask NIfTI pairs found by filename.")

    train_items, val_items = train_test_split(
        items, test_size=args.test_size, random_state=args.random_state
    )

    for split in ["train", "val"]:
        (out_root / "images" / split).mkdir(parents=True, exist_ok=True)
        (out_root / "labels" / split).mkdir(parents=True, exist_ok=True)

    def process_split(split_items: list[tuple[Path, Path]], split_name: str) -> int:
        saved = 0
        for ct_path, mask_path in split_items:
            ct_vol = nib.load(str(ct_path)).get_fdata()
            mask_vol = nib.load(str(mask_path)).get_fdata()
            if ct_vol.shape != mask_vol.shape:
                continue

            stem = ct_path.stem.replace(".nii", "")
            for z in range(ct_vol.shape[2]):
                mask_slice = (mask_vol[:, :, z] > 0).astype(np.uint8)
                if mask_slice.sum() == 0:
                    continue

                ct_slice = ct_vol[:, :, z]
                img = normalize_to_uint8(ct_slice)
                poly = mask_to_yolo_polygon(mask_slice)
                if not poly:
                    continue

                name = f"{stem}_z{z:03d}"
                img_out = out_root / "images" / split_name / f"{name}.jpg"
                lbl_out = out_root / "labels" / split_name / f"{name}.txt"

                cv2.imwrite(str(img_out), img)
                poly_str = " ".join(f"{v:.6f}" for v in poly)
                lbl_out.write_text(f"{args.class_id} {poly_str}\n", encoding="utf-8")
                saved += 1
        return saved

    train_saved = process_split(train_items, "train")
    val_saved = process_split(val_items, "val")

    yaml_path = out_root / "dataset.yaml"
    write_yaml(yaml_path, out_root, [args.class_name])

    print(f"Converted dataset root: {out_root.resolve()}")
    print(f"Train slices saved: {train_saved}")
    print(f"Val slices saved: {val_saved}")
    print(f"YAML: {yaml_path.resolve()}")


if __name__ == "__main__":
    main()
