#!/usr/bin/env sh
#
# run.sh - 프로그램을 띄운다.
#
# 언제나 먼저 다시 빌드한다. 고친 코드가 반영되지 않은 예전 JAR 이
# 도는 일이 없어야 하기 때문이다.
#
#   ./run.sh            빌드하고 창을 띄운다
#   ./run.sh --no-build 이미 만들어 둔 JAR 을 그대로 띄운다
set -e

cd "$(dirname "$0")"

if [ "$1" = "--no-build" ]; then
  shift
else
  ./build.sh
fi

. scripts/find-jdk.sh

exec "$JAVA_BIN" -Dfile.encoding=UTF-8 -jar dist/Chunjiin.jar "$@"
