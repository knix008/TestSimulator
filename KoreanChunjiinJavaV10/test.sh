#!/usr/bin/env sh
#
# test.sh - 시험을 돌린다.
#
#   ./test.sh          엔진 회귀 시험 584항목 (항목마다 PASS/FAIL 과 요약)
#   ./test.sh -q       실패한 항목과 요약만
#   ./test.sh --app    엔진 시험 뒤에 창까지 띄우는 화면 시험 21항목
#   ./test.sh --only-app  화면 시험만
#   ./test.sh --shots  docs/images 에 테마 4종 그림을 다시 찍는다
#
# 엔진 시험은 창을 띄우지 않으므로 화면 없는 서버에서도 돈다.
# 화면 시험은 창을 띄우고 Robot 으로 키를 눌러 보므로 화면이 있어야 한다
# (없으면 조용히 건너뛴다).
set -e

cd "$(dirname "$0")"
. scripts/find-jdk.sh

OUT=out/test-classes

RUN_ENGINE=1
RUN_APP=0
RUN_SHOTS=0
ARGS=""

for arg in "$@"; do
  case "$arg" in
    --app) RUN_APP=1 ;;
    --only-app) RUN_APP=1; RUN_ENGINE=0 ;;
    --shots) RUN_SHOTS=1; RUN_ENGINE=0 ;;
    *) ARGS="$ARGS $arg" ;;
  esac
done

rm -rf "$OUT"
mkdir -p "$OUT"

find src/main/java src/test/java -name '*.java' > out/test-sources.txt
"$JAVAC" -encoding UTF-8 -d "$OUT" @out/test-sources.txt
cp -r src/main/resources/. "$OUT/"

STATUS=0

if [ "$RUN_ENGINE" -eq 1 ]; then
  # shellcheck disable=SC2086
  "$JAVA_BIN" -Dfile.encoding=UTF-8 -cp "$OUT" com.shkwon.chunjiin.EngineTest $ARGS || STATUS=$?
fi

if [ "$RUN_APP" -eq 1 ] && [ "$STATUS" -eq 0 ]; then
  echo ""
  "$JAVA_BIN" -Dfile.encoding=UTF-8 -cp "$OUT" com.shkwon.chunjiin.AppSmokeTest || STATUS=$?
fi

if [ "$RUN_SHOTS" -eq 1 ] && [ "$STATUS" -eq 0 ]; then
  "$JAVA_BIN" -Dfile.encoding=UTF-8 -cp "$OUT" com.shkwon.chunjiin.Screenshots || STATUS=$?
fi

exit "$STATUS"
