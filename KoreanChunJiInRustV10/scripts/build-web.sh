#!/bin/sh
# build-web.sh - 웹 판(WASM + 정적 파일)을 만든다. (Linux / macOS)
#
#   ./scripts/build-web.sh            web/ 에 chunjiin_wasm 을 만든다
#   ./scripts/build-web.sh --serve    만든 뒤 서버까지 띄운다
#
# 필요한 것
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-bindgen-cli
#
# 데스크톱 판과 달리 C 컴파일러가 필요 없다.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

serve=0
for arg in "$@"; do
    case "$arg" in
        --serve) serve=1 ;;
        -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
    esac
done

# rustc 가 없으면 rustup 으로 넣는다. PATH 가 이어지게 source 한다.
. "$root/scripts/prereq.sh"

echo "== 웹 판 빌드"

# 필요한 것이 갖춰졌는지 먼저 본다. 없으면 무엇을 해야 하는지 알려 준다.
if ! rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown; then
    echo "   wasm32 대상이 없습니다. 넣습니다..."
    rustup target add wasm32-unknown-unknown
fi
if ! command -v wasm-bindgen >/dev/null 2>&1; then
    echo "   wasm-bindgen 이 없습니다. 넣습니다..."
    cargo install wasm-bindgen-cli
fi

echo "-- 엔진(WASM)"
# 웹 꾸러미는 작업공간 밖에 있다. 그 폴더에서 따로 빌드한다.
(cd crates/wasm && cargo build --release --target wasm32-unknown-unknown)

wasm=crates/wasm/target/wasm32-unknown-unknown/release/chunjiin_wasm.wasm
[ -f "$wasm" ] || { echo "빌드 결과를 찾지 못했습니다: $wasm" >&2; exit 1; }

echo "-- 자바스크립트 이음새"
wasm-bindgen "$wasm" --out-dir web --target web --no-typescript

size=$(du -h web/chunjiin_wasm_bg.wasm | cut -f1)
echo "   web/chunjiin_wasm_bg.wasm  $size"
echo "== 웹 판 빌드 완료"

if [ "$serve" -eq 1 ]; then
    echo "-- 서버"
    cargo run --release -p chunjiin-serve -- -dir web
fi
