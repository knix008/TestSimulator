#!/usr/bin/env sh
#
# build.sh - Linux · macOS (그리고 Windows 의 Git Bash · WSL) 에서 빌드한다.
#
#   ./build.sh          out/classes 에 컴파일하고 dist/Chunjiin.jar 를 만든다
#   ./build.sh --jar-only   시험 코드는 빼고 실행판만 만든다 (기본과 같다)
#
# 의존성이 하나도 없으므로 javac 와 jar 만 있으면 된다.
set -e

cd "$(dirname "$0")"
. scripts/find-jdk.sh

JAR="$(dirname "$JAVAC")/jar"
[ -x "$JAR" ] || JAR="$(dirname "$JAVAC")/jar.exe"

OUT=out/classes
DIST=dist

echo "JDK    $("$JAVA_BIN" --version | head -n 1)"

rm -rf "$OUT" "$DIST"
mkdir -p "$OUT" "$DIST"

# 1) 자원 (아이콘, 빌드 시각)
cp -r src/main/resources/. "$OUT/"
date '+%Y-%m-%d %H:%M' > "$OUT/build-stamp.txt"

# 2) 컴파일
echo "컴파일 ..."
find src/main/java -name '*.java' > out/sources.txt
"$JAVAC" -encoding UTF-8 -d "$OUT" @out/sources.txt

# 3) 실행 가능한 JAR
echo "묶는 중 ..."
"$JAR" --create --file "$DIST/Chunjiin.jar" \
  --main-class com.shkwon.chunjiin.Main \
  -C "$OUT" .

echo ""
echo "다 됐습니다.  $DIST/Chunjiin.jar"
echo "  실행   ./run.sh   또는   java -jar $DIST/Chunjiin.jar"
