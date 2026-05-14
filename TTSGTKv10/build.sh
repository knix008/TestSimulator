#!/bin/bash
set -e

make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

echo ""
echo "Run with: ./build/tts_simulator"
