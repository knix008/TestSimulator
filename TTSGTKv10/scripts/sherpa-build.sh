#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# sherpa-build.sh — Clone Sherpa-ONNX source and build from scratch
#
# Usage:
#   ./scripts/sherpa-build.sh [ARCH] [SYSROOT]
#
# ARCH values:
#   (empty)   — native host build
#   aarch64   — ARM 64-bit cross-compilation
#   armhf     — ARM 32-bit cross-compilation
#
# SYSROOT (optional):
#   Path to target sysroot for cross-compilation
#   e.g. ./scripts/sherpa-build.sh aarch64 /opt/sysroot-aarch64
#
# Output:
#   deps/sherpa-onnx-src/   — cloned source + build tree
#   deps/sherpa-onnx/lib/   — built shared libraries
#   deps/sherpa-onnx/include/ — C API header
#
# Requirements:
#   cmake, git, C++ compiler (or cross-compiler for ARM)
#   Internet access (cmake downloads ONNX Runtime automatically)
# ─────────────────────────────────────────────────────────────────────────────
set -e

SHERPA_VERSION="1.13.2"
SHERPA_REPO="https://github.com/k2-fsa/sherpa-onnx.git"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$ROOT_DIR/deps/sherpa-onnx-src"
DEST_DIR="$ROOT_DIR/deps/sherpa-onnx"
NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

ARCH="${1:-native}"
SYSROOT="${2:-}"

# ── Determine cross-compilation settings ─────────────────────────────────────

case "$ARCH" in
    native | x86_64 | "")
        ARCH=native
        CROSS_PREFIX=""
        TOOLCHAIN_FILE=""
        ;;
    aarch64)
        CROSS_PREFIX="aarch64-linux-gnu-"
        TOOLCHAIN_FILE="aarch64-linux-gnu.toolchain.cmake"
        ;;
    armhf | armv7)
        ARCH=armhf
        CROSS_PREFIX="arm-linux-gnueabihf-"
        TOOLCHAIN_FILE="arm-linux-gnueabihf.toolchain.cmake"
        ;;
    *)
        echo "ERROR: Unknown ARCH '$ARCH'. Supported: native, aarch64, armhf"
        exit 1
        ;;
esac

CXX="${CROSS_PREFIX}c++"

# ── Check tools ───────────────────────────────────────────────────────────────

echo "=== Sherpa-ONNX v${SHERPA_VERSION} — Source Build ==="
echo "  Architecture  : $ARCH"
[ -n "$CROSS_PREFIX" ] && echo "  Cross-compiler: ${CROSS_PREFIX}gcc"
[ -n "$SYSROOT"      ] && echo "  Sysroot       : $SYSROOT"
echo "  Source dir    : $SRC_DIR"
echo "  Output dir    : $DEST_DIR"
echo "  Jobs          : $NPROC"
echo ""

for tool in git cmake "$CXX"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "ERROR: '$tool' not found."
        if [ "$tool" = "cmake" ] || [ "$tool" = "git" ]; then
            echo "  Run: sudo apt install cmake git  (Linux)"
            echo "       brew install cmake git       (macOS)"
        else
            echo "  Run: sudo apt install gcc-${CROSS_PREFIX%-} g++-${CROSS_PREFIX%-}"
            echo "       make cross-deps"
        fi
        exit 1
    fi
done

# ── Clone ─────────────────────────────────────────────────────────────────────

if [ ! -d "$SRC_DIR/.git" ]; then
    echo ">>> Cloning Sherpa-ONNX v${SHERPA_VERSION}..."
    git clone --depth=1 --branch "v${SHERPA_VERSION}" \
        "$SHERPA_REPO" "$SRC_DIR"
else
    echo "  [src] Already cloned: $SRC_DIR"
fi

# ── CMake configure ───────────────────────────────────────────────────────────

BUILD_DIR="$SRC_DIR/build"
LIB_OUT="$BUILD_DIR/lib"

CMAKE_ARGS=(
    -DSHERPA_ONNX_ENABLE_C_API=ON
    -DBUILD_SHARED_LIBS=ON
    -DSHERPA_ONNX_ENABLE_BINARY=OFF
    -DSHERPA_ONNX_ENABLE_TEST=OFF
    -DSHERPA_ONNX_ENABLE_PYTHON=OFF
    -DCMAKE_BUILD_TYPE=Release
    "-DCMAKE_LIBRARY_OUTPUT_DIRECTORY=$LIB_OUT"
    "--log-level=WARNING"
)

if [ -n "$TOOLCHAIN_FILE" ]; then
    CMAKE_ARGS+=("-DCMAKE_TOOLCHAIN_FILE=$SRC_DIR/toolchains/$TOOLCHAIN_FILE")
fi

if [ -n "$SYSROOT" ]; then
    CMAKE_ARGS+=("-DCMAKE_SYSROOT=$SYSROOT")
fi

echo ">>> Configuring (will download ONNX Runtime — requires internet)..."
cmake -B "$BUILD_DIR" -S "$SRC_DIR" "${CMAKE_ARGS[@]}" 2>&1 \
    | grep -v '^-- '

# ── Build ─────────────────────────────────────────────────────────────────────

echo ">>> Building with $NPROC jobs (this may take several minutes)..."
cmake --build "$BUILD_DIR" -j"$NPROC" 2>&1 \
    | grep -v '^gmake\|^-- \|Entering dir\|Leaving dir' \
    | sed 's|.*\[\([[:space:]0-9]*%\)\].*[/ ]\([^/ ]*\)\.\(cc\|cpp\|c\)\.o.*|  [\1] \2.\3|; /^\[/d'

# ── Install ───────────────────────────────────────────────────────────────────

echo ">>> Installing to $DEST_DIR/..."
mkdir -p "$DEST_DIR/lib" "$DEST_DIR/include/sherpa-onnx/c-api"

# Copy all built .so files from the library output directory
if [ -d "$LIB_OUT" ]; then
    find "$LIB_OUT" -name "*.so*" -exec cp -P {} "$DEST_DIR/lib/" \;
fi

# Also search for libonnxruntime (may be elsewhere in the build tree)
find "$BUILD_DIR" -name "libonnxruntime.so*" \
    ! -path "$LIB_OUT/*" \
    -exec cp -P {} "$DEST_DIR/lib/" \; 2>/dev/null || true

# Copy the C API header
cp "$SRC_DIR/sherpa-onnx/c-api/c-api.h" \
    "$DEST_DIR/include/sherpa-onnx/c-api/"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "=== Build complete ==="
echo "  Libraries:"
ls "$DEST_DIR/lib/"
echo ""
echo "  Header : $DEST_DIR/include/sherpa-onnx/c-api/c-api.h"
echo ""
echo "Next step: build the project"
echo "  make build"
[ "$ARCH" != "native" ] && echo "  make build ARCH=$ARCH"
