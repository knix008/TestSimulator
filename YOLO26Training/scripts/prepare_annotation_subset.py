from pathlib import Path
import shutil
import pandas as pd


CSV_PATH = Path("data/ct_brain.csv")
IMG_ROOT = Path("data/files")
OUT_ROOT = Path("annotation")
CLASSES = ["aneurysm", "cancer", "tumor"]


def main() -> None:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH.resolve()}")
    if not IMG_ROOT.exists():
        raise FileNotFoundError(f"Image root not found: {IMG_ROOT.resolve()}")

    df = pd.read_csv(CSV_PATH)
    if "jpg" not in df.columns or "type" not in df.columns:
        raise ValueError("ct_brain.csv must include 'jpg' and 'type' columns.")

    # Start with a compact but balanced subset (30/class -> 90 images total).
    # You can increase this count once labeling speed is stable.
    subset = (
        df.groupby("type", group_keys=False)
        .head(30)
        .reset_index(drop=True)
    )

    images_dir = OUT_ROOT / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for idx, row in subset.iterrows():
        rel_path = str(row["jpg"]).lstrip("/")
        src = IMG_ROOT / rel_path
        if not src.exists():
            continue

        stem = Path(rel_path).stem
        class_name = str(row["type"])
        dst_name = f"{idx:04d}_{class_name}_{stem}.jpg"
        dst = images_dir / dst_name
        shutil.copy2(src, dst)
        rows.append(
            {
                "source_relpath": rel_path,
                "copied_image": str(dst.relative_to(OUT_ROOT)),
                "class_name": class_name,
            }
        )

    if not rows:
        raise RuntimeError("No images copied. Check dataset paths.")

    pd.DataFrame(rows).to_csv(OUT_ROOT / "mapping.csv", index=False)
    (OUT_ROOT / "classes.txt").write_text("\n".join(CLASSES) + "\n", encoding="utf-8")

    print(f"Prepared annotation subset: {len(rows)} images")
    print(f"Images: {images_dir.resolve()}")
    print(f"Mapping: {(OUT_ROOT / 'mapping.csv').resolve()}")
    print(f"Classes: {(OUT_ROOT / 'classes.txt').resolve()}")


if __name__ == "__main__":
    main()
