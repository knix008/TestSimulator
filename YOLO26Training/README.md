# YOLO26 Brain CT Training

This project trains Ultralytics YOLO26 for Brain CT classes:

- aneurysm
- cancer
- tumor

It now provides **two separate pipelines**:

1. Detection pipeline
2. Segmentation pipeline (auto-generated from detection labels)

Both pipelines export ONNX with different final file names.

## Project Files

- `scripts/download_kaggle_ct.py`: download dataset from Kaggle
- `scripts/convert_to_yolo.py`: build YOLO **detection** dataset (`yolo_dataset`)
- `scripts/auto_label_seg_from_detection.py`: convert detection labels to pseudo segmentation labels (`yolo_dataset_seg`)
- `scripts/train_yolo26.py`: task-based trainer (`detect` or `segment`) + ONNX export
- `run_detection_pipeline.sh`: detection-only full pipeline
- `run_segmentation_pipeline.sh`: segmentation-only full pipeline
- `yolo_data_det.yaml`: detection dataset config
- `yolo_data_seg.yaml`: segmentation dataset config

## 1) Setup

```bash
bash setup.sh
source venv/bin/activate
```

Windows PowerShell:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

### GPU/CUDA quick check

Run this before training:

```powershell
.\venv\Scripts\python.exe scripts\check_cuda.py
```

## 2) Kaggle Credential

Put your Kaggle API key in `kaggle.json` in project root.

```json
{
  "username": "YOUR_KAGGLE_USERNAME",
  "key": "YOUR_KAGGLE_KEY"
}
```

## 3) Detection Pipeline (Standalone)

Runs end-to-end:

1. download dataset
2. convert to detection labels
3. train detection
4. export detection ONNX

```bash
./run_detection_pipeline.sh
```

Windows PowerShell:

```powershell
.\run_detection_pipeline.ps1
```

Optional args:

```bash
./run_detection_pipeline.sh <epochs> <run_name>
```

PowerShell args:

```powershell
.\run_detection_pipeline.ps1 -Epochs 30 -RunName ct_brain_det_auto -Device 0
```

Defaults:

- epochs: `30`
- run name: `ct_brain_det_auto`

Final ONNX:

- `models/yolo26-brain-ct-det.onnx`

## 4) Segmentation Pipeline (Standalone)

Runs end-to-end:

1. auto-generate pseudo segmentation labels from detection labels
2. train segmentation
3. export segmentation ONNX

```bash
./run_segmentation_pipeline.sh
```

Optional args:

```bash
./run_segmentation_pipeline.sh <epochs> <run_name>
```

Defaults:

- epochs: `50`
- run name: `ct_brain_seg_auto`

Prerequisite:

- `yolo_dataset/labels/train` must exist (run detection pipeline first)

Final ONNX:

- `models/yolo26-brain-ct-seg.onnx`

## 5) Direct Training Command (Advanced)

You can call the trainer directly:

```bash
python scripts/train_yolo26.py --task detect --data yolo_data_det.yaml --model yolo26.yaml
python scripts/train_yolo26.py --task segment --data yolo_data_seg.yaml --model yolo26-seg.yaml
```

If `yolo26.yaml` (or `yolo26-seg.yaml`) is not present in your environment, replace `--model` with an available Ultralytics model (for example `yolo11n.pt`) or provide your custom YOLO26 model yaml/weights path.

GPU training is the default (`--device 0`). If CUDA is unavailable, training exits with an explicit error.

Useful args:

- `--epochs` (default: detect=30, segment=50)
- `--name`
- `--project`
- `--onnx-name`

## 6) Outputs

Detection run artifacts:

- `runs/detect/yolo26_runs/<det_run_name>/weights/best.pt`
- `runs/detect/yolo26_runs/<det_run_name>/weights/last.pt`

Segmentation run artifacts:

- `runs/segment/yolo26_runs/<seg_run_name>/weights/best.pt`
- `runs/segment/yolo26_runs/<seg_run_name>/weights/last.pt`

Exported ONNX:

- `models/yolo26-brain-ct-det.onnx`
- `models/yolo26-brain-ct-seg.onnx`

## 7) Inference (Detection + Segmentation Visualization)

Run prediction on a single CT image or a folder, and save visualized outputs.

PowerShell example:

```powershell
.\venv\Scripts\python.exe scripts\infer_ct.py `
  --source ".\data\files\some_ct_image.jpg" `
  --detect-model "runs/detect/yolo26_runs/ct_brain_det_gpu/weights/best.pt" `
  --seg-model "runs/segment/yolo26_runs/ct_brain_seg_gpu/weights/best.pt" `
  --output-dir "inference_outputs" `
  --device 0
```

Output folders:

- `inference_outputs/detection`
- `inference_outputs/segmentation`

You can also pass a directory to `--source` to run batch inference on multiple CT images.

### Collect only positive predictions

If you want only images where prediction exists:

```powershell
.\venv\Scripts\python.exe scripts\collect_positive_predictions.py `
  --source ".\data" `
  --detect-model "runs/detect/yolo26_runs/ct_brain_det_gpu/weights/best.pt" `
  --seg-model "runs/segment/yolo26_runs/ct_brain_seg_gpu/weights/best.pt" `
  --output-dir "positive_predictions" `
  --device 0
```

Output structure:

- `positive_predictions/detection_positive/raw`
- `positive_predictions/detection_positive/vis`
- `positive_predictions/segmentation_positive/raw`
- `positive_predictions/segmentation_positive/vis`

## Notes

- Current segmentation labels are auto-generated from detection boxes (rectangle polygons), so segmentation accuracy is limited.
- ONNX export uses `onnx`, `onnxruntime`, and `onnxslim` (auto-installed by Ultralytics if missing).
- For real segmentation performance, replace pseudo labels with true lesion masks/polygons.

## Real Segmentation Labels (Recommended)

The Kaggle dataset used here is classification-oriented and does not include lesion masks.

To get meaningful segmentation quality:

1. Prepare annotation subset:
   ```bash
   python scripts/prepare_annotation_subset.py
   ```
2. Annotate lesion polygons in CVAT/Label Studio
3. Export as Ultralytics YOLO Segmentation format
4. Replace labels in `yolo_dataset_seg/labels/train` and `yolo_dataset_seg/labels/val`

See `ANNOTATION_GUIDE.md` for details.
