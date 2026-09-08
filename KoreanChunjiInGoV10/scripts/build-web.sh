#!/bin/sh
# build-web.sh - 웹 판을 만든다. (Linux / macOS)
#
#   ./scripts/build-web.sh          web/ 에 chunjiin.wasm 을 만든다
#   ./scripts/build-web.sh --serve  만든 뒤 서버까지 띄운다
#
# 만들어지는 것
#   web/chunjiin.wasm     조합 엔진 (약 2 MB)
#   web/wasm_exec.js      Go 가 함께 주는 다리 코드
#   chunjiin-serve        web/ 을 품은 서버 실행 파일 (저장소 루트)
#
# web/ 을 그대로 정적 호스팅(GitHub Pages 등)에 올려도 된다.
# 그때는 .wasm 의 MIME 형식이 application/wasm 인지 확인한다.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

serve=0
[ "${1:-}" = "--serve" ] && serve=1

echo "-- WASM 엔진"
GOOS=js GOARCH=wasm go build -ldflags "-s -w" -o web/chunjiin.wasm ./cmd/chunjiin-wasm

echo "-- wasm_exec.js"
goroot=$(go env GOROOT)
if [ -f "$goroot/lib/wasm/wasm_exec.js" ]; then
    cp "$goroot/lib/wasm/wasm_exec.js" web/wasm_exec.js
else
    cp "$goroot/misc/wasm/wasm_exec.js" web/wasm_exec.js
fi

cp assets/chunjiin.png web/chunjiin.png

echo "-- 서버"
site="$root/cmd/chunjiin-serve/site"
rm -rf "$site"
mkdir -p "$site"
cp web/index.html web/style.css web/app.js web/wasm_exec.js \
   web/chunjiin.wasm web/chunjiin.png "$site/"
go build -ldflags "-s -w" -o chunjiin-serve ./cmd/chunjiin-serve

echo "   web/chunjiin.wasm  $(du -h web/chunjiin.wasm | cut -f1)"
echo "   chunjiin-serve     $(du -h chunjiin-serve | cut -f1)"

if [ "$serve" -eq 1 ]; then
    exec "$root/chunjiin-serve"
fi
