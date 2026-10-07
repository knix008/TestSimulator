#!/usr/bin/env bash
# run.sh
#
# 빌드한 프로그램을 띄운다. libvosk 와 모델을 찾을 수 있도록 환경을 맞춰 준다.
#
# 사용법:
#   ./run.sh                      # 기본 GUI (그 OS 의 네이티브 판)
#   ./run.sh gui-gtk4             # GTK4 판 (따로 빌드했을 때)
#   ./run.sh cli --list-devices   # CLI (뒤 인자는 그대로 넘어간다)
#   ./run.sh cli --wav tests/data/sample-ko.wav
#   ./run.sh tests                # 코어 시험
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$ROOT"   # 실행 파일은 프로젝트 루트에 놓인다

TARGET="gui"
if [ $# -gt 0 ]; then
    case "$1" in
        gui|gui-native|gui-gtk4|cli|tests) TARGET="$1"; shift ;;
        -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    esac
fi

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31m오류: %s\033[0m\n' "$*" >&2; exit 1; }

OS="$(uname -s)"
EXE_SUFFIX=""
case "$OS" in MINGW*|MSYS*|CYGWIN*) EXE_SUFFIX=".exe" ;; esac

EXE="$BIN/kstt-$TARGET$EXE_SUFFIX"
[ -x "$EXE" ] || die "$EXE 가 없습니다. 먼저 ./build.sh 를 실행하세요."

# libvosk 가 있는 곳들
VOSK_DIRS=""
for dir in "$ROOT"/third_party/vosk-*; do
    [ -d "$dir" ] && VOSK_DIRS="$dir:$VOSK_DIRS"
done

case "$OS" in
    MINGW*|MSYS*|CYGWIN*)
        MSYS_ROOT="${MSYS2_ROOT:-/c/Msys64}"
        [ -d "$MSYS_ROOT/mingw64/bin" ] || MSYS_ROOT="/msys64"
        # GTK 런타임(mingw64)과 libvosk 를 모두 찾을 수 있게
        export PATH="$BIN:$MSYS_ROOT/mingw64/bin:$PATH"
        ;;
    Darwin)
        export DYLD_LIBRARY_PATH="$BIN:$VOSK_DIRS${DYLD_LIBRARY_PATH:-}"
        ;;
    *)
        export LD_LIBRARY_PATH="$BIN:$VOSK_DIRS${LD_LIBRARY_PATH:-}"
        ;;
esac

# 모델 위치를 코어에 알려 준다 (창 안에서 바꿀 수도 있다)
if [ -z "${KSTT_MODEL:-}" ]; then
    for dir in "$ROOT"/models/vosk-model-*ko*; do
        if [ -d "$dir" ]; then
            export KSTT_MODEL="$dir"
            break
        fi
    done
fi

say "실행: $(basename "$EXE") ${KSTT_MODEL:+(모델 $(basename "$KSTT_MODEL"))}"
exec "$EXE" "$@"
