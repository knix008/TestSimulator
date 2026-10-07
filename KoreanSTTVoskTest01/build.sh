#!/usr/bin/env bash
# build.sh
#
# Linux / macOS / MSYS2(Windows) 공용 빌드 스크립트. g++ (또는 clang++) + CMake 를 쓴다.
#
# 사용법:
#   ./build.sh                  # Release 빌드
#   ./build.sh --debug          # Debug 빌드
#   ./build.sh --clean          # 산출물을 지우고 처음부터 (clean.sh 와 같은 범위)
#   ./build.sh --gui gtk4       # GTK4 판 GUI (기본은 그 OS 의 네이티브 GUI)
#   ./build.sh --gui all        # 네이티브 + GTK4 둘 다
#   ./build.sh --no-gui         # GUI 없이 코어+CLI+시험만
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT/build"
BUILD_TYPE="Release"
CLEAN=0
GUI="native"   # native | gtk4 | all | none

while [ $# -gt 0 ]; do
    case "$1" in
        --debug) BUILD_TYPE="Debug" ;;
        --release) BUILD_TYPE="Release" ;;
        --clean) CLEAN=1 ;;
        --no-gui) GUI="none" ;;
        --gui)
            shift
            case "${1:-}" in
                native|gtk4|all|none) GUI="$1" ;;
                *) echo "--gui 는 native / gtk4 / all / none 중 하나여야 합니다" >&2; exit 2 ;;
            esac
            ;;
        -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "알 수 없는 옵션: $1" >&2; exit 2 ;;
    esac
    shift
done

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31m오류: %s\033[0m\n' "$*" >&2; exit 1; }

OS="$(uname -s)"

# Windows(MSYS2): Vosk 공식 빌드가 MSVCRT 계열이므로 같은 계열인 MINGW64 툴체인을
# 써야 한다. UCRT64 로 빌드하면 GTK 가 끌어오는 UCRT 판 libstdc++ 와 Vosk 가 쓰는
# MSVCRT 판이 한 프로세스에서 부딪혀 libvosk.dll 적재가 실패한다.
case "$OS" in
    MINGW*|MSYS*)
        MSYS_ROOT="${MSYS2_ROOT:-/c/Msys64}"
        [ -d "$MSYS_ROOT/mingw64/bin" ] || MSYS_ROOT="/msys64"
        [ -d "$MSYS_ROOT/mingw64/bin" ] ||
            die "MSYS2 의 mingw64 환경을 찾을 수 없습니다. MSYS2_ROOT 를 지정하세요."
        export PATH="$MSYS_ROOT/mingw64/bin:$PATH"
        export CXX="${CXX:-$MSYS_ROOT/mingw64/bin/g++.exe}"
        say "MinGW64(MSVCRT) 툴체인을 씁니다: $CXX"
        ;;
esac

command -v cmake >/dev/null 2>&1 || die "cmake 가 없습니다. ./fetch_deps.sh 를 먼저 보세요."

if [ "$CLEAN" -eq 1 ]; then
    # 실행 파일이 루트에 놓이므로 build/ 만 지워서는 부족하다.
    "$ROOT/clean.sh"
fi

GENERATOR_ARGS=()
if command -v ninja >/dev/null 2>&1; then
    GENERATOR_ARGS=(-G Ninja)
fi

say "구성 ($BUILD_TYPE, GUI=$GUI)"
cmake -S "$ROOT" -B "$BUILD_DIR" "${GENERATOR_ARGS[@]}" \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
    -DKSTT_GUI="$GUI"

say "빌드"
cmake --build "$BUILD_DIR" --parallel

say "만들어진 실행 파일 (프로젝트 루트)"
# glob 으로 실제 파일만 센다. MSYS 에서 [ -e kstt-cli ] 는 kstt-cli.exe 에도
# 참이라, 이름을 하나씩 확인하면 같은 파일이 두 번 나온다.
for candidate in "$ROOT"/kstt-*; do
    [ -e "$candidate" ] || continue
    printf '    %s\n' "$(basename "$candidate")"
done

say "끝났습니다. 다음: ./run.sh (GUI) 또는 ./test.sh"
