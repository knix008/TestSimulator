#!/bin/sh
# build.sh - 바로 실행할 수 있는 실행 파일을 만든다. (Linux / macOS)
#
#   ./build.sh              현재 운영체제용으로 빌드하고 저장소 루트에 둔다
#   ./build.sh --run        빌드한 뒤 곧바로 실행한다
#   ./build.sh --web        웹 판(WASM + 정적 파일)까지 함께 만든다
#
# 설치용 파일은 이 스크립트가 만들지 않는다. scripts/package.sh 를 쓴다.
#
# Linux 에서는 Fyne 이 OpenGL 과 X11 개발 파일을 필요로 한다.
#   데비안/우분투  sudo apt install gcc libgl1-mesa-dev xorg-dev
#   페도라         sudo dnf install gcc libX11-devel libXcursor-devel \
#                      libXrandr-devel libXinerama-devel mesa-libGL-devel libXi-devel
set -eu

root=$(cd "$(dirname "$0")" && pwd)
cd "$root"

version=1.0
ldflags="-s -w -X github.com/knix008/chunjiin/internal/ui.Version=$version"

run=0
web=0
for arg in "$@"; do
    case "$arg" in
        --run) run=1 ;;
        --web) web=1 ;;
        -h|--help)
            sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
    esac
done

echo "== 천지인 한글 입력기 빌드"
echo "   Go        $(go version)"

echo "-- 데스크톱 앱"
go build -ldflags "$ldflags" -o chunjiin ./cmd/chunjiin
echo "   chunjiin  $(du -h chunjiin | cut -f1)"

if [ "$web" -eq 1 ]; then
    echo "-- 웹 판"
    "$root/scripts/build-web.sh"
fi

echo "== 빌드 완료"

if [ "$run" -eq 1 ]; then
    echo "-- 실행"
    exec "$root/chunjiin"
fi
