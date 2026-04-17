# Segmentation Annotation Guide

This dataset does not include lesion masks, so you need to create segmentation labels first.

## 1) Prepare annotation subset

```bash
source venv/bin/activate
python scripts/prepare_annotation_subset.py
```

This creates:

- `annotation/images/` (initial image set for labeling)
- `annotation/mapping.csv` (source-image mapping)
- `annotation/classes.txt` (class names)

## 2) Annotate in CVAT (recommended)

1. Start CVAT (local Docker) or use hosted CVAT.
2. Create a new task with labels:
   - `aneurysm`
   - `cancer`
   - `tumor`
3. Upload all images from `annotation/images/`.
4. Draw polygon masks around lesions for each image.
5. Export annotations as **Ultralytics YOLO Segmentation**.

## 3) Place exported labels into project dataset

After export, put files into:

- `yolo_dataset_seg/labels/train`
- `yolo_dataset_seg/labels/val`

Each label line must look like:

```text
<class_id> x1 y1 x2 y2 x3 y3 ...
```

Coordinates must be normalized to `[0, 1]`.

## 4) Train segmentation model

```bash
python scripts/train_yolo26.py --task segment --data yolo_data_seg.yaml --model yolo26-seg.yaml
```

The training script already validates segmentation label format before starting.

## Practical tips

- Start with 50-100 well-labeled images.
- Prefer fewer but accurate masks over many noisy masks.
- Add difficult cases (small lesions, low contrast, borderline scans) early.
