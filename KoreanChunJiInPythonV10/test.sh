#!/bin/sh
# test.sh - 시험을 돌리고 구역별로 정리해서 보여 준다. (Linux / macOS)
#
#   ./test.sh              구역별 집계와 요약
#   ./test.sh --detail     항목마다 한 줄씩
#   ./test.sh --run 낱말   이름이 맞는 것만
#
# 무엇을 보는가
#   tests/test_cases.py   엔진 회귀 시험. KoreanChunJiInC++ 의 tests/test_engine.c
#                         에서 뽑아 온 430항목(test/cases.tsv).
#   tests/test_engine.py  자료로 뽑을 수 없는 항목 - 영문 26자 전수,
#                         라벨-입력 일치, 원본 함수 직접 확인, 경계·예외.
#   tests/test_ui.py      색표 · 설정 · 배치 · 커서 변환 · 언어 · 그림,
#                         그리고 창까지 만들어 보는 스모크 시험.
#   tests/test_web.py     서버 경로 처리, 상태 객체, 실제로 띄워 두드려 보기.
#
# pytest 를 깔지 않아도 된다. tests/report.py 가 시험을 찾아 돌리고
# 결과를 모아 정리한다.
set -eu

cd "$(dirname "$0")"

# 창을 띄우지 않고 그린다. 화면이 없는 자리(CI, 서버)에서도 돌게 한다.
export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
export PYTHONUTF8=1

# 있는 것을 찾는 것으로는 모자라다. Windows 의 `python3` 은 스토어로
# 데려가는 껍데기일 때가 있어서, 부르면 아무것도 하지 않고 끝난다.
# 그래서 정말로 도는지, 3.10 이상인지 실제로 물어 본다.
python=""
for candidate in python3 python py; do
    path=$(command -v "$candidate" 2>/dev/null) || continue
    ok='import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'
    "$path" -c "$ok" >/dev/null 2>&1 || continue
    python=$path
    break
done
if [ -z "$python" ]; then
    echo "파이썬 3.10 이상을 찾지 못했습니다." >&2
    exit 1
fi

args=""
while [ $# -gt 0 ]; do
    case "$1" in
        --detail|-v) args="$args -v"; shift ;;
        --run) args="$args -run $2"; shift 2 ;;
        -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "모르는 옵션: $1" >&2; exit 1 ;;
    esac
done

# shellcheck disable=SC2086
exec "$python" -m tests.report $args
