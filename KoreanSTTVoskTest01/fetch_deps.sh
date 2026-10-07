#!/usr/bin/env bash
# fetch_deps.sh
#
# Linux / macOS / MSYS2 에서 외부 의존물을 받아 둔다.
#   1) libvosk 공유 라이브러리 (호스트 OS·아키텍처에 맞는 것)  → third_party/
#   2) Vosk 한국어 모델                                        → models/
#   3) 시스템 개발 패키지(GTK4, ALSA 등) 설치 명령 안내 또는 실행
#
# 사용법:
#   ./fetch_deps.sh                 # 라이브러리·모델만 받는다
#   ./fetch_deps.sh --system-deps   # 시스템 패키지까지 설치한다 (sudo 필요)
#   ./fetch_deps.sh --model <이름>  # 다른 Vosk 모델을 받는다
#
# 2026-10 기준 alphacephei.com 이 내놓은 한국어 모델은 vosk-model-small-ko-0.22
# 하나뿐이다. --model 에는 모델 이름을 그대로 적는다 (다른 언어 모델도 받을 수 있다).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VOSK_VERSION="0.3.45"
MODEL_NAME="vosk-model-small-ko-0.22"
INSTALL_SYSTEM_DEPS=0

while [ $# -gt 0 ]; do
    case "$1" in
        --system-deps) INSTALL_SYSTEM_DEPS=1 ;;
        --model)
            shift
            case "${1:-}" in
                small|ko) MODEL_NAME="vosk-model-small-ko-0.22" ;;
                "") die "--model 뒤에 모델 이름이 필요합니다" ;;
                *) MODEL_NAME="$1" ;;
            esac
            ;;
        -h|--help)
            sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) echo "알 수 없는 옵션: $1" >&2; exit 2 ;;
    esac
    shift
done

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m경고: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31m오류: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 플랫폼 판별
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
    Linux)
        case "$ARCH" in
            x86_64)          VOSK_PKG="vosk-linux-x86_64-${VOSK_VERSION}" ;;
            aarch64|arm64)   VOSK_PKG="vosk-linux-aarch64-${VOSK_VERSION}" ;;
            armv7l|armv6l)   VOSK_PKG="vosk-linux-armv7l-${VOSK_VERSION}" ;;
            *) die "지원하지 않는 Linux 아키텍처: $ARCH" ;;
        esac
        ;;
    Darwin)      VOSK_PKG="vosk-osx-${VOSK_VERSION}" ;;
    MINGW*|MSYS*|CYGWIN*) VOSK_PKG="vosk-win64-${VOSK_VERSION}" ;;
    *) die "지원하지 않는 OS: $OS" ;;
esac

say "플랫폼: $OS $ARCH → $VOSK_PKG"

download() {
    local url="$1" out="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fL --progress-bar -o "$out" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q --show-progress -O "$out" "$url"
    else
        die "curl 또는 wget 이 필요합니다"
    fi
}

extract_zip() {
    local zip="$1" dest="$2"
    if command -v unzip >/dev/null 2>&1; then
        unzip -oq "$zip" -d "$dest"
    elif command -v python3 >/dev/null 2>&1; then
        python3 -c "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
            "$zip" "$dest"
    else
        die "unzip 또는 python3 이 필요합니다"
    fi
}

# ---------------------------------------------------------------- libvosk
mkdir -p "$ROOT/third_party"
if [ -d "$ROOT/third_party/$VOSK_PKG" ]; then
    say "libvosk 가 이미 있습니다: third_party/$VOSK_PKG"
else
    say "libvosk 를 받습니다 ($VOSK_PKG)"
    ZIP="$ROOT/third_party/$VOSK_PKG.zip"
    download "https://github.com/alphacep/vosk-api/releases/download/v${VOSK_VERSION}/${VOSK_PKG}.zip" \
        "$ZIP"
    extract_zip "$ZIP" "$ROOT/third_party"
    rm -f "$ZIP"
    ls "$ROOT/third_party/$VOSK_PKG"
fi

# ---------------------------------------------------------------- 한국어 모델
mkdir -p "$ROOT/models"
if [ -d "$ROOT/models/$MODEL_NAME" ]; then
    say "모델이 이미 있습니다: models/$MODEL_NAME"
else
    say "모델을 받습니다 ($MODEL_NAME, 한국어 small 은 내려받기 83MB · 풀면 253MB)"
    ZIP="$ROOT/models/$MODEL_NAME.zip"
    download "https://alphacephei.com/vosk/models/${MODEL_NAME}.zip" "$ZIP"
    extract_zip "$ZIP" "$ROOT/models"
    rm -f "$ZIP"
fi

# ---------------------------------------------------------------- 시스템 패키지
system_deps_command() {
    case "$OS" in
        Darwin)
            echo "brew install cmake ninja pkg-config gtk4"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            # Vosk 공식 Windows 빌드가 MSVCRT 계열이라, 같은 계열인 MINGW64 를 쓴다.
            echo "pacman -S --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-gtk4 \
mingw-w64-x86_64-pkgconf mingw-w64-x86_64-cmake mingw-w64-x86_64-ninja"
            ;;
        Linux)
            if command -v apt-get >/dev/null 2>&1; then
                echo "sudo apt-get install -y build-essential cmake ninja-build pkg-config \
libgtk-4-dev libasound2-dev"
            elif command -v dnf >/dev/null 2>&1; then
                echo "sudo dnf install -y gcc-c++ cmake ninja-build pkgconf-pkg-config \
gtk4-devel alsa-lib-devel"
            elif command -v pacman >/dev/null 2>&1; then
                echo "sudo pacman -S --needed base-devel cmake ninja pkgconf gtk4 alsa-lib"
            elif command -v zypper >/dev/null 2>&1; then
                echo "sudo zypper install -y gcc-c++ cmake ninja pkg-config gtk4-devel \
alsa-devel"
            else
                echo ""
            fi
            ;;
    esac
}

DEPS_CMD="$(system_deps_command)"
if [ -z "$DEPS_CMD" ]; then
    warn "이 배포판의 패키지 설치 명령을 모릅니다. GTK4 개발 패키지와 ALSA 개발 패키지를 직접 설치하세요."
elif [ "$INSTALL_SYSTEM_DEPS" -eq 1 ]; then
    say "시스템 패키지를 설치합니다:"
    echo "    $DEPS_CMD"
    eval "$DEPS_CMD"
else
    say "필요한 시스템 패키지 (아직 없다면 직접 실행하거나 --system-deps 를 주세요):"
    echo "    $DEPS_CMD"
fi

say "끝났습니다. 다음: ./build.sh"
