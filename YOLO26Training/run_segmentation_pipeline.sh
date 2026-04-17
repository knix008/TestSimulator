#!/bin/bash
# Segmentation-only pipeline:
# 1) Auto-generate segmentation labels from detection labels
# 2) Train segmentation + export ONNX
#
# Prerequisite: detection dataset must already exist in yolo_dataset/.

set -euo pipefail

SEG_EPOCHS="${1:-50}"
SEG_RUN_NAME="${2:-ct_brain_seg_auto}"

if [ ! -d "venv" ]; then
  echo "[INFO] venv not found. Running setup.sh ..."
  bash setup.sh
fi

if [ ! -d "yolo_dataset/labels/train" ]; then
  echo "[ERROR] Detection labels not found at yolo_dataset/labels/train"
  echo "Run ./run_detection_pipeline.sh first."
  exit 1
fi

source venv/bin/activate

echo "[1/2] Auto-labeling segmentation dataset from detection labels..."
python scripts/auto_label_seg_from_detection.py

echo "[2/2] Training segmentation model (epochs=${SEG_EPOCHS}, run=${SEG_RUN_NAME})..."
python scripts/train_yolo26.py \
  --task "segment" \
  --data "yolo_data_seg.yaml" \
  --model "yolo26-seg.yaml" \
  --onnx-name "yolo26-brain-ct-seg.onnx" \
  --epochs "${SEG_EPOCHS}" \
  --name "${SEG_RUN_NAME}" \
  --project "yolo26_runs" \
  --device "cpu"

echo "Done. Segmentation outputs:"
echo "  runs/segment/yolo26_runs/${SEG_RUN_NAME}/weights/best.pt"
echo "  runs/segment/yolo26_runs/${SEG_RUN_NAME}/weights/last.pt"
echo "  models/yolo26-brain-ct-seg.onnx"
