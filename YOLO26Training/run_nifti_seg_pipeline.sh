#!/bin/bash
# NIfTI segmentation pipeline:
# 1) pair check
# 2) NIfTI -> YOLO seg conversion
# 3) train + ONNX export
# 4) optional inference + positive collection

set -euo pipefail

CT_DIR="${1:-}"
MASK_DIR="${2:-}"
EPOCHS="${3:-50}"
RUN_NAME="${4:-ct_seg_real_labels}"
DEVICE="${5:-0}"

if [ -z "$CT_DIR" ] || [ -z "$MASK_DIR" ]; then
  echo "Usage: ./run_nifti_seg_pipeline.sh <ct_dir> <mask_dir> [epochs] [run_name] [device]"
  exit 1
fi

if [ ! -d "venv" ]; then
  echo "[INFO] venv not found. Running setup.sh ..."
  bash setup.sh
fi

source venv/bin/activate
pip install -r requirements.txt

echo "[1/3] Checking NIfTI pairs..."
python scripts/check_nifti_pairs.py --ct-dir "$CT_DIR" --mask-dir "$MASK_DIR"

echo "[2/3] Converting NIfTI to YOLO segmentation dataset..."
python scripts/convert_nifti_ct_to_yolo_seg.py \
  --ct-dir "$CT_DIR" \
  --mask-dir "$MASK_DIR" \
  --output-root "yolo_dataset_seg_real" \
  --class-id 0 \
  --class-name "hemorrhage"

echo "[3/3] Training segmentation model (epochs=${EPOCHS}, run=${RUN_NAME}, device=${DEVICE})..."
python scripts/train_yolo26.py \
  --task "segment" \
  --data "yolo_dataset_seg_real/dataset.yaml" \
  --model "yolo26-seg.yaml" \
  --onnx-name "yolo26-brain-ct-seg-real.onnx" \
  --epochs "${EPOCHS}" \
  --name "${RUN_NAME}" \
  --project "yolo26_runs" \
  --device "${DEVICE}"

echo "Done."
echo "  runs/segment/yolo26_runs/${RUN_NAME}/weights/best.pt"
echo "  models/yolo26-brain-ct-seg-real.onnx"
