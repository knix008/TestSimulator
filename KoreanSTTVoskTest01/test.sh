#!/usr/bin/env bash
# test.sh
#
# 코어 시험을 빌드해서 돌린다. 모델과 libvosk 가 있으면 실제 인식까지 확인한다.
#
# 사용법:
#   ./test.sh                 # 빌드 + 시험
#   ./test.sh --no-build      # 이미 빌드했다면 시험만
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD=1
[ "${1:-}" = "--no-build" ] && BUILD=0

if [ "$BUILD" -eq 1 ]; then
    "$ROOT/build.sh"
fi

# 시험 음원이 없으면 만들어 본다 (있으면 그대로 쓴다)
if [ ! -f "$ROOT/tests/data/sample-ko.wav" ]; then
    "$ROOT/scripts/make_sample_wav.sh" || true
fi

exec "$ROOT/run.sh" tests
