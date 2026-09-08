#!/bin/sh
# test.sh - 시험을 돌리고 구역별로 정리해서 보여 준다. (Linux / macOS)
#
#   ./test.sh              구역별 집계와 요약
#   ./test.sh -v           항목마다 한 줄씩
#   ./test.sh --cover      덮은 정도(coverage)까지
#   ./test.sh --run 낱말   이름이 맞는 것만
#
# 무엇을 보는가
#   test/       엔진 회귀 시험. KoreanChunJiInC++ 의 tests/test_engine.c 에서
#               뽑아 온 430항목과, 자료로 뽑을 수 없는 항목들.
#   internal/ui 색표 · 설정 · 배치 · 커서 변환 · 언어, 그리고 창까지 만들어
#               보는 스모크 시험.
#
# 정리해서 보여 주는 일은 cmd/testreport 가 한다.
# 그냥 go test 를 쓰고 싶으면 `go test ./...` 로도 된다.
set -eu

cd "$(dirname "$0")"

case "${1:-}" in
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

exec go run ./cmd/testreport "$@"
