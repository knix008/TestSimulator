import argparse
from pathlib import Path

import nibabel as nib
import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser(description="Quick quality check for paired CT/mask NIfTI datasets.")
    parser.add_argument("--ct-dir", type=str, required=True, help="Directory containing CT NIfTI files")
    parser.add_argument("--mask-dir", type=str, required=True, help="Directory containing mask NIfTI files")
    args = parser.parse_args()

    ct_dir = Path(args.ct_dir)
    mask_dir = Path(args.mask_dir)
    if not ct_dir.exists():
        raise FileNotFoundError(f"CT directory not found: {ct_dir.resolve()}")
    if not mask_dir.exists():
        raise FileNotFoundError(f"Mask directory not found: {mask_dir.resolve()}")

    ct_files = sorted(ct_dir.glob("*.nii*"))
    mask_files = sorted(mask_dir.glob("*.nii*"))
    ct_names = {p.name for p in ct_files}
    mask_names = {p.name for p in mask_files}

    only_ct = sorted(ct_names - mask_names)
    only_mask = sorted(mask_names - ct_names)
    common = sorted(ct_names & mask_names)

    print(f"CT files: {len(ct_files)}")
    print(f"Mask files: {len(mask_files)}")
    print(f"Matched pairs: {len(common)}")
    print(f"CT only: {len(only_ct)}")
    print(f"Mask only: {len(only_mask)}")

    if only_ct:
        print("Example CT-only files:")
        for name in only_ct[:10]:
            print(f"  - {name}")
    if only_mask:
        print("Example Mask-only files:")
        for name in only_mask[:10]:
            print(f"  - {name}")

    if not common:
        print("No matched pairs found.")
        return

    shape_mismatch = 0
    total_slices = 0
    positive_slices = 0
    empty_mask_volumes = 0

    for name in common:
        ct_path = ct_dir / name
        mask_path = mask_dir / name
        ct_vol = nib.load(str(ct_path)).get_fdata()
        mask_vol = nib.load(str(mask_path)).get_fdata()

        if ct_vol.shape != mask_vol.shape:
            shape_mismatch += 1
            continue

        z_dim = ct_vol.shape[2]
        total_slices += z_dim
        per_slice_positive = np.any(mask_vol > 0, axis=(0, 1))
        positive = int(per_slice_positive.sum())
        positive_slices += positive
        if positive == 0:
            empty_mask_volumes += 1

    valid_pairs = len(common) - shape_mismatch
    print(f"Shape mismatches: {shape_mismatch}")
    print(f"Valid pairs: {valid_pairs}")
    if valid_pairs > 0:
        print(f"Empty-mask volumes: {empty_mask_volumes}")
    if total_slices > 0:
        print(f"Total slices: {total_slices}")
        print(f"Positive-mask slices: {positive_slices}")
        print(f"Positive slice ratio: {positive_slices / total_slices:.2%}")


if __name__ == "__main__":
    main()
