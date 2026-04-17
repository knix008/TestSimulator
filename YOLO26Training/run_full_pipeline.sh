#!/bin/bash
# End-to-end pipeline:
# 1) Download dataset
# 2) Convert to YOLO segmentation format
# 3) Train model
# 4) Export ONNX (inside train_yolo26.py)

set -euo pipefail

EPOCHS="${1:-5}"
RUN_NAME="${2:-ct_brain_seg_auto}"

if [ ! -d "venv" ]; then
  echo "[INFO] venv not found. Running setup.sh ..."
  bash setup.sh
fi

source venv/bin/activate

echo "[1/4] Downloading dataset from Kaggle..."
python download_kaggle_ct.py

echo "[2/4] Converting dataset to YOLO segmentation format..."
python convert_to_yolo.py

echo "[3/4] Training segmentation model (epochs=${EPOCHS}, run=${RUN_NAME})..."
python train_yolo26.py \
  --epochs "${EPOCHS}" \
  --name "${RUN_NAME}" \
  --project "yolo26_runs" \
  --device "cpu"

echo "[4/4] Done. ONNX export is completed by train_yolo26.py"
echo "Outputs:"
echo "  runs/segment/yolo26_runs/${RUN_NAME}/weights/best.pt"
echo "  runs/segment/yolo26_runs/${RUN_NAME}/weights/last.pt"
echo "  models/yolo26-brain-ct-seg.onnx"
