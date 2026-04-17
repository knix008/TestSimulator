# YOLO26 Brain CT Training

This project trains an Ultralytics YOLO26 model on Brain CT data for 3 classes:

- aneurysm
- cancer
- tumor

It currently supports a segmentation-oriented pipeline and ONNX export after training.

## Project Files

- `download_kaggle_ct.py`: download dataset from Kaggle
- `convert_to_yolo.py`: convert dataset into YOLO segmentation label format
- `prepare_annotation_subset.py`: prepare starter images for manual mask labeling
- `yolo_data.yaml`: dataset config for Ultralytics
- `train_yolo26.py`: train YOLO26 segmentation model and export ONNX

## 1) Setup

```bash
bash setup.sh
source venv/bin/activate
```

## 2) Kaggle Credential

Put your Kaggle API key in `kaggle.json` in project root.

Example:

```json
{
  "username": "YOUR_KAGGLE_USERNAME",
  "key": "YOUR_KAGGLE_KEY"
}
```

## 3) Download Dataset

```bash
python download_kaggle_ct.py
```

## 4) Convert to YOLO Format (Segmentation)

```bash
python convert_to_yolo.py
```

> `convert_to_yolo.py` currently creates placeholder full-image polygons.
> This is useful for pipeline tests only, not for real clinical segmentation performance.

Output directories:

- `yolo_dataset/images/train`
- `yolo_dataset/images/val`
- `yolo_dataset/labels/train`
- `yolo_dataset/labels/val`

## 5) Train Segmentation Model

```bash
python train_yolo26.py
```

Default behavior in `train_yolo26.py`:

- uses `yolo26-seg.yaml`
- validates segmentation label format before training
- trains model
- exports `best.pt` to ONNX automatically

### Quick test run (5 epochs)

```bash
python -c "from ultralytics import YOLO; m=YOLO('yolo26-seg.yaml'); m.train(data='yolo_data.yaml', epochs=5, imgsz=640, batch=8, device='cpu', workers=4, patience=5, amp=False, project='yolo26_runs', name='ct_brain_seg_epoch5', exist_ok=True)"
```

### ONNX export (manual)

```bash
python -c "from ultralytics import YOLO; m=YOLO('runs/segment/yolo26_runs/ct_brain_seg_epoch5/weights/best.pt'); print(m.export(format='onnx', imgsz=640, dynamic=True, simplify=True))"
```

## 6) Output

Training outputs are saved under:

- `runs/segment/yolo26_runs/ct_brain_seg_exp`

Key files:

- `weights/best.pt`
- `weights/last.pt`
- `weights/best.onnx`

## End-to-end Pipeline

Run the full flow from scratch:

```bash
python download_kaggle_ct.py
python convert_to_yolo.py
python train_yolo26.py
```

If you trained with a custom run name, ONNX will be inside that run's `weights` directory.

## Notes

- Segmentation quality depends on true mask/polygon annotations.
- If labels are box-only format (`class cx cy w h`), segmentation training is not suitable.
- ONNX export requires `onnx`, `onnxruntime`, and `onnxslim` (auto-installed by Ultralytics if missing).

## Real Segmentation Labels (Important)

The downloaded Kaggle dataset is classification-oriented and does not contain lesion masks.

To get real segmentation performance:

1. Prepare annotation subset:
   ```bash
   python prepare_annotation_subset.py
   ```
2. Annotate polygon masks in CVAT (or Label Studio)
3. Export as Ultralytics YOLO Segmentation
4. Replace `yolo_dataset/labels/train` and `yolo_dataset/labels/val` with real labels

See `ANNOTATION_GUIDE.md` for the full workflow.
