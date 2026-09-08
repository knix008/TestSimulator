#!/bin/sh
# test.sh - 시험을 돌린다. (Linux / macOS)
#
#   ./test.sh              요약만 본다
#   ./test.sh -v           항목마다 PASS/FAIL 을 본다
#   ./test.sh --cover      덮은 정도(coverage)까지 잰다
#
# test/      엔진 회귀 시험. KoreanChunJiInC++ 의 tests/test_engine.c 에서
#            뽑아 온 430항목과, 뽑을 수 없는 항목들.
# internal/ui 색표 · 설정 · 배치 · 커서 변환 · 언어, 그리고 창까지 만들어
#            보는 스모크 시험.
set -eu

cd "$(dirname "$0")"

opts=""
cover=0
for arg in "$@"; do
    case "$arg" in
        -v) opts="$opts -v" ;;
        --cover) cover=1 ;;
        -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $arg" >&2; exit 1 ;;
    esac
done

echo "== 천지인 회귀 시험"

if [ "$cover" -eq 1 ]; then
    # shellcheck disable=SC2086
    go test $opts -cover -coverprofile=coverage.out ./...
    echo "-- 덮은 정도"
    go tool cover -func=coverage.out | tail -1
else
    # shellcheck disable=SC2086
    go test $opts ./...
fi

echo "== 모두 통과"
