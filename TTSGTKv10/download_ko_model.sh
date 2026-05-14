#!/bin/bash
# Install Piper TTS binary and download Korean model files.

set -e

MODEL_DIR="${HOME}/.local/share/piper"
HF_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss"

MODELS=(
    "medium:ko_KR-kss-medium"
    "low:ko_KR-kss-low"
)

# ── 1. Install piper binary ──────────────────────────────────────────────────

install_piper() {
    if command -v piper >/dev/null 2>&1 || command -v piper-tts >/dev/null 2>&1; then
        echo "[piper] Binary already installed."
        return 0
    fi

    echo "[piper] Installing piper-tts via pip..."

    if command -v pip3 >/dev/null 2>&1; then
        pip3 install --user piper-tts
    elif command -v pip >/dev/null 2>&1; then
        pip install --user piper-tts
    else
        echo ""
        echo "ERROR: pip not found. Install piper manually:"
        echo "  Option A (pip):  pip install piper-tts"
        echo "  Option B (binary): https://github.com/rhasspy/piper/releases"
        exit 1
    fi

    # pip --user installs scripts to ~/.local/bin; ensure it is in PATH
    export PATH="${HOME}/.local/bin:${PATH}"

    if ! command -v piper-tts >/dev/null 2>&1 && ! command -v piper >/dev/null 2>&1; then
        echo ""
        echo "WARNING: piper binary not found in PATH after install."
        echo "Add ~/.local/bin to your PATH:"
        echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc"
        echo "  source ~/.bashrc"
    else
        echo "[piper] Binary installed successfully."
    fi
}

# ── 2. Download model files ──────────────────────────────────────────────────

download_model() {
    local quality="$1"   # "medium" or "low"
    local basename="$2"  # e.g. "ko_KR-kss-medium"

    local onnx="${basename}.onnx"
    local json="${basename}.onnx.json"
    local url="${HF_BASE}/${quality}"

    mkdir -p "${MODEL_DIR}"

    echo ""
    echo "[model] Downloading ${basename} (${quality})..."

    if [ -f "${MODEL_DIR}/${onnx}" ] && [ -f "${MODEL_DIR}/${json}" ]; then
        echo "[model] Already exists, skipping: ${onnx}"
        return 0
    fi

    if command -v wget >/dev/null 2>&1; then
        wget -q --show-progress -O "${MODEL_DIR}/${onnx}" "${url}/${onnx}"
        wget -q --show-progress -O "${MODEL_DIR}/${json}" "${url}/${json}"
    elif command -v curl >/dev/null 2>&1; then
        curl -L --progress-bar -o "${MODEL_DIR}/${onnx}" "${url}/${onnx}"
        curl -L --progress-bar -o "${MODEL_DIR}/${json}" "${url}/${json}"
    else
        echo "ERROR: wget or curl required for downloading models."
        exit 1
    fi

    echo "[model] Saved to: ${MODEL_DIR}/${onnx}"
}

# ── Main ─────────────────────────────────────────────────────────────────────

echo "=== Piper TTS Korean Model Installer ==="
echo ""

install_piper

echo ""
echo "Which quality model do you want to download?"
echo "  1) medium  — better quality, larger file (~63 MB) [recommended]"
echo "  2) low     — faster, smaller file (~14 MB)"
echo "  3) both"
echo ""
read -r -p "Choice [1]: " CHOICE
CHOICE="${CHOICE:-1}"

case "$CHOICE" in
    1) download_model "medium" "ko_KR-kss-medium" ;;
    2) download_model "low"    "ko_KR-kss-low"    ;;
    3)
        download_model "medium" "ko_KR-kss-medium"
        download_model "low"    "ko_KR-kss-low"
        ;;
    *) echo "Invalid choice."; exit 1 ;;
esac

echo ""
echo "Done!  Model directory: ${MODEL_DIR}"
echo ""
echo "Restart tts_simulator — 'Piper TTS' will appear in the engine dropdown."
echo "Select engine: Piper TTS  /  voice: ko_KR-kss-medium"
