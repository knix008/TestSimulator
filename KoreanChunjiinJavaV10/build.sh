#!/usr/bin/env sh
#
# build.sh - Linux · macOS (그리고 Windows 의 Git Bash · WSL) 에서 빌드한다.
#
#   ./build.sh          out/classes 에 컴파일하고 dist/Chunjiin.jar 를 만든다
#   ./build.sh --jar-only   시험 코드는 빼고 실행판만 만든다 (기본과 같다)
#
# 의존성이 하나도 없으므로 javac 와 jar 만 있으면 된다.
#
# 단계마다 무엇을 얼마나 했는지 찍는다. 무엇이 실제로 들어갔는지,
# 어디서 시간이 걸리는지 눈으로 보려는 것이다.
set -e

cd "$(dirname "$0")"
. scripts/find-jdk.sh

APP_NAME="천지인 한글 입력기"
MAIN_CLASS=com.shkwon.chunjiin.Main

JAR="$JDK_HOME/bin/jar"
[ -x "$JAR" ] || JAR="$JDK_HOME/bin/jar.exe"

OUT=out/classes
DIST=dist
JAR_PATH="$DIST/Chunjiin.jar"

# 경고를 켠다. serial 만 뺀다. Swing 을 물려받은 창마다 serialVersionUID 가
# 없다고 하는데, 창을 파일로 저장할 일이 없으니 들을 것이 없다.
LINT=-Xlint:all,-serial

LABEL_WIDTH=13
RULE_WIDTH=64

# 한글은 터미널에서 두 칸을 차지한다. 글자 수로 자리를 맞추면 어긋난다.
# UTF-8 에서 한글은 3바이트 1글자이므로 (글자수 + 바이트수) / 2 가 곧 칸 수다.
#
# 글자 수를 `wc -m` 으로 세면 안 된다. 로케일이 UTF-8 이 아닌 자리
# (Git Bash 가 흔히 그렇다) 에서는 바이트를 세어 버려 자리가 어긋난다.
# 대신 이어 붙는 바이트(0x80~0xBF) 를 빼면 로케일과 무관하게 글자 수가 나온다.
disp_width() {
    _bytes=$(printf '%s' "$1" | LC_ALL=C wc -c | tr -d ' ')
    _cont=$(printf '%s' "$1" | LC_ALL=C tr -dc '\200-\277' | LC_ALL=C wc -c | tr -d ' ')
    _chars=$(( _bytes - _cont ))
    echo $(( (_chars + _bytes) / 2 ))
}

rule() {
    _i=0
    _line=""
    while [ "$_i" -lt "$RULE_WIDTH" ]; do
        _line="$_line─"
        _i=$(( _i + 1 ))
    done
    printf '%s\n' "$_line"
}

# 왼쪽에 이름, 가운데에 내용, 오른쪽 끝에 걸린 시간.
field() {
    _label="$1"
    _value="$2"
    _tail="$3"
    _gap=$(( LABEL_WIDTH - $(disp_width "$_label") ))
    if [ "$_gap" -lt 1 ]; then _gap=1; fi
    _line=$(printf ' %s%*s%s' "$_label" "$_gap" '' "$_value")
    if [ -n "$_tail" ]; then
        _stop=$(( RULE_WIDTH - 1 - $(disp_width "$_tail") ))
        _now=$(disp_width "$_line")
        if [ "$_stop" -gt "$_now" ]; then
            _line=$(printf '%s%*s' "$_line" $(( _stop - _now )) '')
        else
            _line="$_line  "
        fi
        _line="$_line$_tail"
    fi
    printf '%s\n' "$_line"
}

detail() { printf '   %*s%s\n' "$LABEL_WIDTH" '' "$1"; }

fmt_size() {
    awk -v b="$1" 'BEGIN {
        if (b >= 1048576) printf "%.1f MB", b / 1048576
        else if (b >= 1024) printf "%.1f KB", b / 1024
        else printf "%d B", b
    }'
}

fmt_span() { awk -v ms="$1" 'BEGIN { printf "%.1f초", ms / 1000 }'; }

# GNU date 는 나노초까지 준다. macOS 의 date 는 %N 을 모르고 글자 N 을 그대로
# 남기므로, 그럴 때는 초 단위로 물러선다.
now_ms() {
    _n=$(date +%s%N 2>/dev/null)
    case "$_n" in
        *N|"") echo $(( $(date +%s) * 1000 )) ;;
        *)     echo $(( _n / 1000000 )) ;;
    esac
}

# 목록 파일에 적힌 파일들의 바이트를 다 더한다.
sum_bytes() {
    while IFS= read -r _f; do wc -c < "$_f"; done < "$1" |
        awk '{ s += $1 } END { print s + 0 }'
}

# 클래스 파일 머리에 어느 자바로 돌릴 수 있는지 적혀 있다. 45 가 자바 1.1 이다.
class_target() {
    _bytes=$(od -An -tu1 -j6 -N2 "$1" 2>/dev/null)
    _hi=$(echo $_bytes | cut -d' ' -f1)
    _lo=$(echo $_bytes | cut -d' ' -f2)
    if [ -z "$_hi" ] || [ -z "$_lo" ]; then
        echo 0
    else
        echo $(( _hi * 256 + _lo - 44 ))
    fi
}

WHOLE_START=$(now_ms)
STAMP=$(date '+%Y-%m-%d %H:%M')

echo ""
rule
echo " $APP_NAME  빌드"
rule

field "JDK" "$("$JAVA_BIN" --version | head -n 1)"
field "자리" "$JDK_HOME"
field "빌드 시각" "$STAMP"
echo ""

mkdir -p out

# 1) 비우기
STEP=$(now_ms)
WIPED=""
for _dir in "$OUT" "$DIST"; do
    if [ -d "$_dir" ]; then
        rm -rf "$_dir"
        if [ -n "$WIPED" ]; then WIPED="$WIPED  "; fi
        WIPED="$WIPED$_dir"
    fi
done
mkdir -p "$OUT" "$DIST"
if [ -z "$WIPED" ]; then WIPED="지울 것이 없었습니다"; fi
field "비우기" "$WIPED" "$(fmt_span $(( $(now_ms) - STEP )))"

# 2) 자원 (아이콘, 빌드 시각)
STEP=$(now_ms)
cp -r src/main/resources/. "$OUT/"
printf '%s\n' "$STAMP" > "$OUT/build-stamp.txt"
find src/main/resources -type f > out/resources.txt
RES_COUNT=$(wc -l < out/resources.txt | tr -d ' ')
RES_BYTES=$(sum_bytes out/resources.txt)
field "자원" "$RES_COUNT개  $(fmt_size "$RES_BYTES")" "$(fmt_span $(( $(now_ms) - STEP )))"
sed 's#/[^/]*$##' out/resources.txt | sed 's#^src/main/resources/##' | sort | uniq -c |
    while read -r _n _dir; do detail "$_dir  $_n개"; done

# 3) 컴파일
STEP=$(now_ms)
find src/main/java -name '*.java' > out/sources.txt
SRC_COUNT=$(wc -l < out/sources.txt | tr -d ' ')
SRC_BYTES=$(sum_bytes out/sources.txt)
SRC_LINES=$(while IFS= read -r _f; do wc -l < "$_f"; done < out/sources.txt |
    awk '{ s += $1 } END { print s + 0 }')
field "원본" "$SRC_COUNT개  $SRC_LINES줄  $(fmt_size "$SRC_BYTES")"

# 오류는 그 자리에서 다 보여 준다. 어디가 잘못됐는지 알아야 고친다.
if ! "$JAVAC" -encoding UTF-8 "$LINT" -d "$OUT" @out/sources.txt > out/javac.log 2>&1; then
    echo ""
    cat out/javac.log
    echo ""
    echo "컴파일 실패.  원본 $SRC_COUNT개 가운데 오류가 있습니다." >&2
    exit 1
fi

find "$OUT" -name '*.class' > out/classes.txt
CLASS_COUNT=$(wc -l < out/classes.txt | tr -d ' ')
WARN_COUNT=$(awk '/: warning:|: 경고:/ { n++ } END { print n + 0 }' out/javac.log)
if [ "$WARN_COUNT" -gt 0 ]; then WARN_TEXT="경고 $WARN_COUNT개"; else WARN_TEXT="경고 없음"; fi
field "컴파일" "클래스 $CLASS_COUNT개  $WARN_TEXT" "$(fmt_span $(( $(now_ms) - STEP )))"
detail "$LINT"

sed "s#^$OUT/##" out/classes.txt | awk -F/ '
    { if (NF == 1) p = "(기본)"; else { p = $1; for (i = 2; i < NF; i++) p = p "." $i } c[p]++ }
    END { for (k in c) print k, c[k] }' | sort |
    while read -r _pkg _n; do detail "$_pkg  $_n개"; done

# 경고는 요약 뒤에 붙인다. 앞에 두면 줄줄이 흘러 단계가 안 보인다.
# 원본 발췌와 캐럿은 빼고 무엇이 어디서 났는지만 남긴다.
grep -E ': warning:|: 경고:' out/javac.log 2>/dev/null |
    while IFS= read -r _w; do detail "$_w"; done || true

TARGET=$(class_target "$(head -n 1 out/classes.txt)")
field "바이트코드" "Java $TARGET"
if [ "$TARGET" -gt "$JDK_MINIMUM" ]; then
    detail "이 JAR 은 Java $TARGET 이상에서만 돕니다. JDK $JDK_MINIMUM 로는 못 돌립니다."
else
    detail "Java $TARGET 이상이면 돕니다"
fi

# 4) 실행 가능한 JAR
STEP=$(now_ms)
"$JAR" --create --file "$JAR_PATH" --main-class "$MAIN_CLASS" -C "$OUT" .
JAR_BYTES=$(wc -c < "$JAR_PATH" | tr -d ' ')
JAR_ENTRIES=$("$JAR" --list --file "$JAR_PATH" | wc -l | tr -d ' ')
field "묶기" "$JAR_PATH  $(fmt_size "$JAR_BYTES")  항목 $JAR_ENTRIES개" "$(fmt_span $(( $(now_ms) - STEP )))"
detail "주 클래스  $MAIN_CLASS"

rule
echo " 다 됐습니다.  모두 $(fmt_span $(( $(now_ms) - WHOLE_START )))"
echo "   실행   ./run.sh   또는   java -jar $JAR_PATH"
echo ""
