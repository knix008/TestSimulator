#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# sherpa-model.sh — Download Korean VITS TTS model for Sherpa-ONNX
#
# Usage:
#   ./scripts/sherpa-model.sh [MODEL_DIR]
#
# MODEL_DIR (optional, default: ./models)
#   Directory where the model will be saved.
#
# Downloaded model:
#   vits-mimic3-ko_KO-kss_low
#   - ONNX model file (.onnx)
#   - Config file (.onnx.json)
#   - Tokens file (tokens.txt)
#   - espeak-ng-data/ (phoneme data)
# ─────────────────────────────────────────────────────────────────────────────
set -e

MODEL_NAME="vits-mimic3-ko_KO-kss_low"
MODEL_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${MODEL_NAME}.tar.bz2"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODEL_DIR="${1:-$ROOT_DIR/models}"
DEST="$MODEL_DIR/$MODEL_NAME"

# ── Already present? ──────────────────────────────────────────────────────────

if [ -f "$DEST/tokens.txt" ] && [ -s "$DEST/ko_KO-kss_low.onnx" ]; then
    echo "[sherpa-model] Already present: $DEST/"
    echo "  To re-download, remove the directory first:"
    echo "    rm -rf $DEST"
    exit 0
fi

# ── Download ──────────────────────────────────────────────────────────────────

echo "=== Korean VITS Model: $MODEL_NAME ==="
echo "  Destination: $DEST/"
echo ""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo ">>> Downloading model archive..."
if command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$TMP_DIR/model.tar.bz2" "$MODEL_URL"
elif command -v curl >/dev/null 2>&1; then
    curl -L --progress-bar -o "$TMP_DIR/model.tar.bz2" "$MODEL_URL"
else
    echo "ERROR: wget or curl required."
    exit 1
fi

echo ">>> Extracting..."
cd "$TMP_DIR" && tar -xjf model.tar.bz2

mkdir -p "$MODEL_DIR"
cp -r "$TMP_DIR/$MODEL_NAME" "$MODEL_DIR/"

# Remove example scripts (not needed at runtime)
rm -f "$DEST/vits-mimic3.py" "$DEST/vits-mimic3.sh" 2>/dev/null || true

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "=== Model installed ==="
echo "  Directory : $DEST/"
echo "  Files:"
ls "$DEST/" | sed 's/^/    /'
echo ""

ONNX_SIZE=$(du -sh "$DEST/ko_KO-kss_low.onnx" 2>/dev/null | cut -f1 || echo "?")
echo "  ONNX model size : $ONNX_SIZE"
echo ""
echo "The model will be auto-discovered at runtime from ./models/"
echo "You can also place models in ~/.local/share/sherpa-onnx/"
