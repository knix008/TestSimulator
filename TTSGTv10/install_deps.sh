#!/bin/bash
# Install build dependencies for TTS Simulator

set -e

echo "Installing TTS Simulator dependencies..."

sudo apt-get update

sudo apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    libgtk-3-dev \
    libespeak-ng-dev \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libsndfile1-dev \
    libmp3lame-dev \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-pulseaudio \
    festival \
    festvox-kallpc16k 2>/dev/null || true

echo ""
echo "Done! Run ./build.sh to build the project."
