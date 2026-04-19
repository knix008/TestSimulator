# YOLO26 Brain Tumor (Ultralytics) — training pipeline & Gradio demo

This repository automates the workflow from the Ultralytics **Brain Tumor** detection dataset ([documentation](https://docs.ultralytics.com/datasets/detect/brain-tumor/)): download data, train YOLO26n, export ONNX, validate, and write reports. It also includes a small **Gradio** app for interactive ONNX inference.

**Classes** (same as upstream [`brain-tumor.yaml`](https://github.com/ultralytics/ultralytics/blob/main/ultralytics/cfg/datasets/brain-tumor.yaml)): **negative** (0), **positive** (1).

---

## One-command run (Windows)

From the repository root:

```powershell
.\brain_tumor_pipeline.ps1
```

Arguments are forwarded to `scripts/brain_tumor_auto_pipeline.py`, for example:

```powershell
# Quick smoke; full defaults are 300 epochs and patience 60
.\brain_tumor_pipeline.ps1 --epochs 5 --batch 8 --device cpu --patience 3 --name quick_run
```

---

## One-command run (Linux / macOS)

```bash
chmod +x ./brain_tumor_pipeline.sh
./brain_tumor_pipeline.sh
```

With arguments:

```bash
./brain_tumor_pipeline.sh --epochs 5 --device cpu --patience 3
```

---

## Manual pipeline (existing venv)

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts\brain_tumor_auto_pipeline.py --imgsz 640 --device 0
```

```bash
source venv/bin/activate
pip install -r requirements.txt
python scripts/brain_tumor_auto_pipeline.py --imgsz 640 --device 0
```

### Useful flags

| Flag | Meaning |
|------|---------|
| `--device cpu` | Train on CPU if CUDA is unavailable |
| `--epochs N` | Max training epochs (**default 300**; early stopping uses `--patience`) |
| `--patience N` | Stop after **N** epochs without validation improvement (**default 60**) |
| `--weights models/yolo26n.pt` | Pretrained checkpoint (Ultralytics downloads here if missing; legacy `yolo26n.pt` in repo root is moved to `models/` on first run when possible) |
| `--force-download` | Re-download and re-extract the dataset zip |
| `--skip-train` | Only prepare the dataset and write `configs/brain_tumor_local.yaml` |

---

## Outputs

| Artifact | Location |
|----------|----------|
| Dataset | `dataset/brain-tumor/` (images + YOLO labels) |
| Data YAML | `configs/brain_tumor_local.yaml` (auto-generated; absolute `path:`) |
| Pretrained backbone (first download) | `models/yolo26n.pt` |
| Training run | `runs/detect/brain_tumor_runs/<run_name>/` |
| Best weights (copy) | `models/brain_tumor_yolo26n_best.pt` |
| ONNX export | `models/brain_tumor_yolo26n.onnx` |
| Report | `reports/brain_tumor_training_report.md` |
| Val metrics JSON | `reports/brain_tumor_val_metrics.json` |
| Learning-curve plot (if `results.csv` + matplotlib) | `reports/brain_tumor_training_curves.png` |

---

## Project layout (main entries)

| Path | Role |
|------|------|
| `scripts/brain_tumor_auto_pipeline.py` | End-to-end train → ONNX → val → report |
| `scripts/sync_positive_train_samples.py` | Copy **train** images with **positive** labels into `sample/` |
| `Brain_tumor_detect_example01.py` | Gradio UI: ONNX pick; uploads + overlays + CSV/JSON → **`result/` only** (not `sample/`) |
| `brain_tumor_pipeline.ps1` / `.sh` | Create venv, install deps, run the auto pipeline |
| `sample/` | Bundled positive train samples only (`sync_positive_train_samples.py`; Gradio does **not** write here) |
| `result/` | Gradio run outputs: upload copy `positive_*.png`, `*_overlay.png`, `*_detections.csv`, `*_meta.json` |

---

## Gradio demo (`Brain_tumor_detect_example01.py`)

- Uses **ONNX** only (`models/*.onnx` dropdown or custom path).
- Each run writes **only under `result/`**: uploaded copy (`positive_<timestamp>.png`), overlay PNG, CSV, and JSON metadata. **`sample/`** is left for curated train positives only.
- Optional: `--model path\to\file.onnx` sets the dropdown default.

```powershell
.\venv\Scripts\python.exe Brain_tumor_detect_example01.py
```

```bash
./venv/bin/python Brain_tumor_detect_example01.py
```

---

## Sample images (`sample/`)

Positive examples are taken from the **training** split (labels with class `1`). Refresh after (re)installing the dataset:

```powershell
.\venv\Scripts\python.exe scripts\sync_positive_train_samples.py
```

Default copies **two** images as `sample_positive_train_01.jpg`, `sample_positive_train_02.jpg` (override with `--count` / `--out-prefix`).

---

## Dependencies (`requirements.txt`)

PyTorch is pulled from the **CUDA 12.8** extra index (`cu128`), matching common Ultralytics GPU setups. For CPU-only machines, switch to CPU wheels and use `--device cpu`. The Gradio path also expects **`onnx`** and **`onnxruntime`** for ONNX inference.

---

## Inference (Python)

After training, you can run PyTorch or ONNX with Ultralytics:

```python
from ultralytics import YOLO

model = YOLO("models/brain_tumor_yolo26n_best.pt")
model.predict("sample/sample_positive_train_01.jpg", save=True)

model_onnx = YOLO("models/brain_tumor_yolo26n.onnx")
model_onnx.predict("sample/sample_positive_train_01.jpg", save=True)
```

See the [Ultralytics brain tumor usage](https://docs.ultralytics.com/datasets/detect/brain-tumor/#usage) section for more examples.

---

## Citation

If you use the Ultralytics brain tumor dataset, cite as described in the [official documentation](https://docs.ultralytics.com/datasets/detect/brain-tumor/).
