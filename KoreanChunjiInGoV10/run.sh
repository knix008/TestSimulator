#!/bin/sh
# run.sh - 천지인 한글 입력기를 바로 실행한다. (Linux / macOS)
#
#   ./run.sh
#
# 실행 파일이 없으면 먼저 빌드한다. 있으면 그대로 띄운다.
set -eu

root=$(cd "$(dirname "$0")" && pwd)
cd "$root"

if [ ! -f "$root/chunjiin" ]; then
    echo "실행 파일이 없어 먼저 빌드합니다."
    "$root/build.sh"
    if [ ! -f "$root/chunjiin" ]; then
        echo "chunjiin 을 만들지 못했다" >&2
        exit 1
    fi
fi

echo "실행  chunjiin"
exec "$root/chunjiin"
