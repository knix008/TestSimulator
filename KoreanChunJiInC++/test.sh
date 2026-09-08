#!/usr/bin/env bash
# 천지인 오토마타 시험 실행기 (MSYS2 / Git Bash 용)
#
#   ./test.sh          빌드 후 항목마다 PASS/FAIL + 요약
#   ./test.sh -q       실패한 항목과 요약만
#   ./test.sh -b       빌드만
#
# 종료 코드는 전부 통과하면 0, 하나라도 실패하면 1 이다.

set -u

cd "$(dirname "$0")"

ENGINE="src/chunjiin.c src/input.c"
SUITE="tests/test_engine.c"
OUT="build/test_engine.exe"
CFLAGS="-std=gnu11 -Wall -Wextra -Werror -O1 -Iinclude"

case "${1:-}" in
    -h|--help)
        echo "사용법: ./test.sh [-q|-b|-h]"
        echo "  (없음)  항목마다 PASS/FAIL 을 찍고 마지막에 요약"
        echo "  -q      실패한 항목과 요약만"
        echo "  -b      빌드만 하고 실행하지 않음"
        exit 0
        ;;
esac

if ! command -v gcc >/dev/null 2>&1; then
    echo "gcc 를 찾을 수 없습니다. MSYS2 UCRT64 환경에서 실행하세요." >&2
    exit 1
fi

mkdir -p build

echo "building $OUT"
if ! gcc $CFLAGS -o "$OUT" $ENGINE "$SUITE"; then
    echo
    echo "COMPILE FAILED" >&2
    exit 1
fi

if [ "${1:-}" = "-b" ]; then
    echo "built. not running."
    exit 0
fi

echo
if "./$OUT" "$@"; then
    echo
    echo "ALL TESTS PASSED"
    exit 0
else
    echo
    echo "TESTS FAILED" >&2
    exit 1
fi
