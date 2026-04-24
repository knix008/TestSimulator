#!/bin/bash

# ==========================================================
# RTSP Server Dependencies Installation Script for macOS
# ==========================================================

set -e

echo "=========================================="
echo "macOS 의존성 설치 스크립트"
echo "=========================================="
echo ""

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew가 설치되어 있지 않습니다."
    echo ""
    echo "Homebrew를 먼저 설치해주세요:"
    echo "/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo ""
    exit 1
fi

echo "✅ Homebrew 확인됨"
echo ""

# Update Homebrew
echo "📦 Homebrew 업데이트 중..."
brew update

# Install dependencies
echo ""
echo "📦 의존성 패키지 설치 중..."
echo ""

# Install pkg-config
echo "- pkg-config 설치..."
brew install pkg-config

# Install GTK3
echo "- GTK3 설치..."
brew install gtk+3

# Install GStreamer and plugins
echo "- GStreamer 설치..."
brew install gstreamer

echo "- GStreamer 플러그인 설치..."
brew install gst-plugins-base
brew install gst-plugins-good
brew install gst-plugins-bad
brew install gst-plugins-ugly
brew install gst-libav

# Install GStreamer RTSP Server
echo "- GStreamer RTSP Server 설치..."
brew install gst-rtsp-server

# Install build tools
echo "- 빌드 도구 설치..."
brew install make
brew install gcc

echo ""
echo "=========================================="
echo "✅ 모든 의존성 설치 완료!"
echo "=========================================="
echo ""
echo "이제 다음 명령으로 프로그램을 빌드할 수 있습니다:"
echo "  make"
echo ""
echo "실행:"
echo "  ./rtsp-server"
echo ""
