#!/bin/bash
# PandocLinux 의존성 설치 및 빌드 스크립트
# 지원 배포판: Ubuntu / Debian 계열

set -e

echo "======================================"
echo "  PandocLinux 의존성 설치 스크립트"
echo "======================================"
echo ""

# ── 1. 시스템 패키지 업데이트 ──────────────────────────────────────
echo "[1/5] 패키지 목록 업데이트..."
sudo apt-get update -qq

# ── 2. 빌드 도구 (gcc, cmake, pkg-config) 설치 ────────────────────
echo "[2/5] 빌드 도구 설치 (gcc, cmake, pkg-config)..."
sudo apt-get install -y \
    build-essential \
    cmake \
    pkg-config

echo "  → GCC  : $(gcc --version | head -1)"
echo "  → CMake: $(cmake --version | head -1)"

# ── 3. GTK3 개발 헤더 설치 ────────────────────────────────────────
echo "[3/5] GTK3 개발 라이브러리 설치..."
sudo apt-get install -y \
    libgtk-3-dev

echo "  → GTK3 버전: $(pkg-config --modversion gtk+-3.0)"

# ── 4. Pandoc 설치 ─────────────────────────────────────────────────
echo "[4/5] Pandoc 설치..."
if command -v pandoc &>/dev/null; then
    echo "  → Pandoc 이미 설치됨: $(pandoc --version | head -1)"
else
    sudo apt-get install -y pandoc
    echo "  → Pandoc 설치 완료: $(pandoc --version | head -1)"
fi

# ── 5. (선택) PDF 출력용 LaTeX 설치 ───────────────────────────────
echo "[5/5] PDF 출력용 LaTeX 설치 (선택 사항)..."
read -r -p "  PDF 변환을 위해 texlive-xetex 를 설치하시겠습니까? [y/N] " ans
if [[ "${ans,,}" == "y" ]]; then
    sudo apt-get install -y texlive-xetex texlive-fonts-recommended texlive-lang-cjk
    echo "  → LaTeX 설치 완료"
else
    echo "  → 건너뜀 (나중에 설치하려면: sudo apt install texlive-xetex)"
fi

# ── 빌드 ──────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  프로젝트 빌드"
echo "======================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"

mkdir -p "${BUILD_DIR}"
cmake -S "${SCRIPT_DIR}" -B "${BUILD_DIR}" -DCMAKE_BUILD_TYPE=Release
cmake --build "${BUILD_DIR}" --parallel "$(nproc)"

echo ""
echo "======================================"
echo "  빌드 완료! 실행 방법:"
echo "    ${BUILD_DIR}/pandoc-linux"
echo "  또는:"
echo "    ./build/pandoc-linux"
echo "======================================"
