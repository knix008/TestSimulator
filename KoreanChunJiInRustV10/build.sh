#!/bin/sh
# build.sh - 바로 실행할 수 있는 실행 파일을 만든다. (Linux / macOS)
#
#   ./build.sh              앱 · 서버 · 설치 프로그램을 만들어 저장소 루트에 둔다
#   ./build.sh --run        빌드한 뒤 곧바로 실행한다
#   ./build.sh --web        웹 판(WASM + 정적 파일)까지 함께 만든다
#   ./build.sh --debug      디버그 빌드 (빠르게 만들고 느리게 돈다)
#
# 배포용 tarball / dmg 은 scripts/package.sh 를 쓴다.
#
# Linux 에서는 창을 띄우는 데 X11(또는 Wayland) 개발 파일이 필요하다.
#   데비안/우분투  sudo apt install libx11-dev libxcursor-dev libxrandr-dev \
#                      libxi-dev libgl1-mesa-dev libxkbcommon-dev
#   페도라         sudo dnf install libX11-devel libXcursor-devel libXrandr-devel \
#                      libXi-devel mesa-libGL-devel libxkbcommon-devel
set -eu

root=$(cd "$(dirname "$0")" && pwd)
cd "$root"

run=0
web=0
debug=0
for arg in "$@"; do
    case "$arg" in
        --run) run=1 ;;
        --web) web=1 ;;
        --debug) debug=1 ;;
        -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
    esac
done

# rustc 가 없으면 rustup 으로 넣는다. PATH 가 이어지게 source 한다.
. "$root/scripts/prereq.sh"
. "$root/scripts/cargo-out.sh"

if [ "$debug" -eq 1 ]; then
    profile=debug
    set -- build
else
    profile=release
    set -- build --release
fi

echo "== 천지인 한글 입력기 빌드"
echo "   $(cargo --version)"
echo "   $(rustc --version)"

echo "-- 데스크톱 앱 · 서버"
cargo "$@" -p chunjiin-app -p chunjiin-serve

# 저장소 루트에 갖다 놓는다. 여기서 바로 실행하고 배포할 수 있다.
for name in chunjiin chunjiin-serve; do
    copy_cargo_bin "$name" "$root" "$profile"
    echo "   $name  $(du -h "$root/$name" | cut -f1)"
done

echo "-- 설치 프로그램"
build_chunjiin_setup "$root" "$profile" "$@"
echo "   chunjiin-setup  $(du -h "$root/chunjiin-setup" | cut -f1)"

if [ "$web" -eq 1 ]; then
    echo "-- 웹 판"
    "$root/scripts/build-web.sh"
fi

echo "== 빌드 완료"

if [ "$run" -eq 1 ]; then
    echo "-- 실행"
    exec "$root/chunjiin"
fi
