#!/bin/sh
# test.sh - 시험을 돌리고 구역별로 정리해서 보여 준다. (Linux / macOS)
#
#   ./test.sh              구역별 집계와 요약
#   ./test.sh --detail     항목마다 한 줄씩
#   ./test.sh --run 낱말   이름이 맞는 것만
#   ./test.sh --plain      cargo test 를 그대로 (정리하지 않는다)
#
# 무엇을 보는가
#   crates/engine/tests  엔진 회귀 시험. KoreanChunJiInC++ 의 tests/test_engine.c
#                        에서 뽑아 온 430항목(test/cases.tsv)과, 자료로 뽑을 수
#                        없는 항목들.
#   crates/ui/tests      색표 · 설정 · 배치 · 커서 변환 · 언어 · 그림, 그리고
#                        창까지 만들어 보는 스모크 시험.
#   그 밖               서버 경로 처리, 시험 자료 읽기, 보고기 자체.
#
# 정리해서 보여 주는 일은 crates/testreport 가 한다.
set -eu

root=$(cd "$(dirname "$0")" && pwd)
cd "$root"

args=""
while [ $# -gt 0 ]; do
    case "$1" in
        --detail) args="$args -v"; shift ;;
        --run) args="$args -run $2"; shift 2 ;;
        --plain)
            . "$root/scripts/prereq.sh"
            exec cargo test --workspace
            ;;
        -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $1" >&2; exit 1 ;;
    esac
done

# rustc 가 없으면 rustup 으로 넣는다. PATH 가 이어지게 source 한다.
. "$root/scripts/prereq.sh"

# shellcheck disable=SC2086
exec cargo run -q -p chunjiin-testreport -- $args
