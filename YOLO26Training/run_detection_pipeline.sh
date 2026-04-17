#!/bin/bash
# Detection-only pipeline:
# 1) Download dataset
# 2) Build detection dataset
# 3) Train detection + export ONNX

set -euo pipefail

DET_EPOCHS="${1:-30}"
DET_RUN_NAME="${2:-ct_brain_det_auto}"

if [ ! -d "venv" ]; then
  echo "[INFO] venv not found. Running setup.sh ..."
  bash setup.sh
fi

source venv/bin/activate

echo "[1/3] Downloading dataset from Kaggle..."
python scripts/download_kaggle_ct.py

echo "[2/3] Converting dataset to YOLO detection format..."
python scripts/convert_to_yolo.py

echo "[3/3] Training detection model (epochs=${DET_EPOCHS}, run=${DET_RUN_NAME})..."
python scripts/train_yolo26.py \
  --task "detect" \
  --data "yolo_data_det.yaml" \
  --model "yolo26.yaml" \
  --onnx-name "yolo26-brain-ct-det.onnx" \
  --epochs "${DET_EPOCHS}" \
  --name "${DET_RUN_NAME}" \
  --project "yolo26_runs" \
  --device "cpu"

echo "Done. Detection outputs:"
echo "  runs/detect/yolo26_runs/${DET_RUN_NAME}/weights/best.pt"
echo "  runs/detect/yolo26_runs/${DET_RUN_NAME}/weights/last.pt"
echo "  models/yolo26-brain-ct-det.onnx"
