#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# sherpa-install.sh — Download pre-built Sherpa-ONNX shared library
#
# Usage:
#   ./scripts/sherpa-install.sh [ARCH]
#
# ARCH values:
#   (empty)   — auto-detect host architecture
#   x86_64    — Linux x86-64
#   aarch64   — ARM 64-bit
#   armhf     — ARM 32-bit (hard-float)
#
# Output:
#   deps/sherpa-onnx/lib/     — shared libraries (.so)
#   deps/sherpa-onnx/include/ — C API header
# ─────────────────────────────────────────────────────────────────────────────
set -e

SHERPA_VERSION="1.13.2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$ROOT_DIR/deps/sherpa-onnx"

# ── Determine architecture ────────────────────────────────────────────────────

ARCH="${1:-$(uname -m)}"

case "$ARCH" in
    x86_64 | amd64)
        LIB_TAG="linux-x64-shared-lib"
        ;;
    aarch64 | arm64)
        LIB_TAG="linux-aarch64-shared"
        ;;
    armhf | armv7* | arm)
        LIB_TAG="linux-arm-gnueabihf-shared"
        ;;
    *)
        echo "ERROR: Unsupported architecture: $ARCH"
        echo "  Supported: x86_64, aarch64, armhf"
        exit 1
        ;;
esac

LIB_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_VERSION}/sherpa-onnx-v${SHERPA_VERSION}-${LIB_TAG}.tar.bz2"
HEADER_URL="https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v${SHERPA_VERSION}/sherpa-onnx/c-api/c-api.h"

# ── Already installed? ────────────────────────────────────────────────────────

if [ -f "$DEST_DIR/lib/libsherpa-onnx-c-api.so" ]; then
    echo "[sherpa-install] Already installed: $DEST_DIR/lib/"
    echo "  To reinstall, remove the directory first:"
    echo "    rm -rf $DEST_DIR"
    exit 0
fi

# ── Download ──────────────────────────────────────────────────────────────────

echo "=== Sherpa-ONNX v${SHERPA_VERSION} — Pre-built Library ==="
echo "  Architecture : $ARCH  ($LIB_TAG)"
echo "  Destination  : $DEST_DIR/"
echo ""

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo ">>> Downloading library..."
if command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$TMP_DIR/sherpa.tar.bz2" "$LIB_URL"
elif command -v curl >/dev/null 2>&1; then
    curl -L --progress-bar -o "$TMP_DIR/sherpa.tar.bz2" "$LIB_URL"
else
    echo "ERROR: wget or curl required."
    exit 1
fi

echo ">>> Extracting..."
cd "$TMP_DIR" && tar -xjf sherpa.tar.bz2

# ── Install libraries ─────────────────────────────────────────────────────────

mkdir -p "$DEST_DIR/lib" "$DEST_DIR/include/sherpa-onnx/c-api"

find "$TMP_DIR" -name "*.so" -exec cp {} "$DEST_DIR/lib/" \;

echo ">>> Downloading C API header..."
if command -v curl >/dev/null 2>&1; then
    curl -sL "$HEADER_URL" -o "$DEST_DIR/include/sherpa-onnx/c-api/c-api.h"
else
    wget -q -O "$DEST_DIR/include/sherpa-onnx/c-api/c-api.h" "$HEADER_URL"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "=== Installed ==="
ls "$DEST_DIR/lib/"
echo ""
echo "  Header : $DEST_DIR/include/sherpa-onnx/c-api/c-api.h"
echo ""
echo "Next step: build the project"
echo "  make build"
echo "  make build ARCH=$ARCH"
