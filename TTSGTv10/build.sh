#!/bin/bash
set -e

BUILD_DIR="build"

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

echo ""
echo "Build complete: $BUILD_DIR/tts_simulator"
echo "Run with: ./$BUILD_DIR/tts_simulator"
