#!/usr/bin/env bash
# Full automation: venv → deps → brain-tumor dataset → YOLO26n train → ONNX → val → report
# Ref: https://docs.ultralytics.com/datasets/detect/brain-tumor/
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
VENV_PY="${ROOT}/venv/bin/python"
VENV_PIP="${ROOT}/venv/bin/pip"

if [[ ! -x "${VENV_PY}" ]]; then
  echo "Creating venv..."
  python3 -m venv "${ROOT}/venv"
fi

"${VENV_PY}" -m pip install --upgrade pip
"${VENV_PY}" -m pip install -r "${ROOT}/requirements.txt"

exec "${VENV_PY}" "${ROOT}/scripts/brain_tumor_auto_pipeline.py" "$@"
