#!/usr/bin/env bash
# Build Verovio shared library into third_party/verovio/install
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VEROVIO_DIR="${VEROVIO_DIR:-$ROOT/third_party/verovio}"
INSTALL_PREFIX="${VEROVIO_INSTALL:-$VEROVIO_DIR/install}"
TAG="${VEROVIO_TAG:-version-4.3.1}"
JOBS="${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)}"

lib_ok() {
    [ -f "$INSTALL_PREFIX/lib/libverovio.so" ] \
        || [ -f "$INSTALL_PREFIX/lib/libverovio.dylib" ]
}

if lib_ok; then
    echo "[verovio] Already installed at $INSTALL_PREFIX"
    exit 0
fi

if [ ! -d "$VEROVIO_DIR/.git" ]; then
    echo "[verovio] Cloning $TAG ..."
    rm -rf "$VEROVIO_DIR"
    git clone --depth 1 --branch "$TAG" \
        https://github.com/rism-digital/verovio.git "$VEROVIO_DIR"
fi

mkdir -p "$VEROVIO_DIR/build"
cd "$VEROVIO_DIR/build"

echo "[verovio] Configuring ..."
cmake ../cmake \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_AS_LIBRARY=ON \
    -DCMAKE_INSTALL_PREFIX="$INSTALL_PREFIX" \
    -DNO_RUNTIME=ON

echo "[verovio] Building ($JOBS jobs) ..."
cmake --build . -j"$JOBS"
cmake --install .

if ! lib_ok; then
    echo "[verovio] ERROR: libverovio not found under $INSTALL_PREFIX/lib" >&2
    exit 1
fi

echo "[verovio] Done: $INSTALL_PREFIX"
