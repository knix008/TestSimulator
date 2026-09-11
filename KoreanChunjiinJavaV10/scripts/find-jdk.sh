#!/usr/bin/env sh
#
# find-jdk.sh - 쓸 만한 JDK 를 찾아 환경을 맞춰 준다. 없으면 설치까지 한다.
#
# 다른 스크립트가 `. scripts/find-jdk.sh` 로 불러 쓴다.
# 찾으면 JAVAC, JAVA_BIN, JDK_HOME, JDK_MAJOR 를 채우고 JAVA_HOME 과 PATH 도
# 그 JDK 로 맞춘다.
#
# 이 프로그램은 텍스트 블록(Java 15) 과 instanceof 패턴(Java 16) 을 쓰므로
# JDK 17 이상이라야 한다. 그래서 처음 만난 javac 를 그냥 쓰지 않는다.
# 후보의 버전을 확인해 조건에 맞는 것만 고른다. 옛 JDK 가 PATH 앞자리에
# 있어도 알아서 비켜 간다.
#
# 고르는 차례
#   1. JAVA_HOME          (17 이상일 때만)
#   2. PATH 위의 javac    (17 이상일 때만)
#   3. JDK 가 흔히 놓이는 자리 가운데 가장 높은 버전
#
# 하나도 없으면 꾸러미 관리자로 설치할지 물어본다. 묻지 말고 바로 깔게 하려면
#   CHUNJIIN_INSTALL_JDK=1 ./build.sh
# 손대지 못하게 하려면
#   CHUNJIIN_INSTALL_JDK=no ./build.sh

JDK_MINIMUM=17

JAVAC=""
JAVA_BIN=""
JDK_HOME=""
JDK_MAJOR=0

# 찾은 것을 적어 둔다. 못 쓸 때 무엇이 있었는지 알려 주려는 것이다.
# 한 줄에 "버전<탭>자리<탭>어디서" 로 쌓는다.
JDK_SEEN=""

# '1.8.0_302' 는 8, '23.0.1' 은 23. 자바 9 에서 번호 매기는 법이 바뀌었다.
jdk_major() {
    _javac="$1"
    _home=$(dirname "$(dirname "$_javac")")
    _version=""

    # release 파일이 가장 빠르다. JDK 안에 늘 들어 있고 프로그램을 띄우지 않아도 된다.
    if [ -r "$_home/release" ]; then
        _version=$(sed -n 's/^JAVA_VERSION="\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p' "$_home/release" | head -1)
    fi

    # 없으면 물어본다. javac 8 은 -version 을 표준 오류로 내므로 둘을 합쳐 받는다.
    if [ -z "$_version" ]; then
        _version=$("$_javac" -version 2>&1 | sed -n 's/^javac \([0-9][0-9._]*\).*/\1/p' | head -1)
    fi

    case "$_version" in
        "")  echo 0 ;;
        1.*) echo "$_version" | cut -d. -f2 ;;
        *)   echo "$_version" | cut -d. -f1 ;;
    esac
}

# $(...) 는 끝의 개행을 지운다. 그것으로 이어 붙이면 앞 줄 끝과 뒷 줄 머리가
# 들러붙으므로, 명령 치환을 거치지 않고 곧바로 잇는다. 사이에 든 것은 TAB 이다.
note_jdk() {
    # 같은 JDK 가 PATH 에도 있고 흔한 자리에도 있으면 한 번만 적는다.
    case "$JDK_SEEN" in
        *"	$2	"*) return 0 ;;
    esac
    JDK_SEEN="$JDK_SEEN$1	$2	$3
"
}

use_jdk() {
    JAVAC="$1"
    JDK_MAJOR="$2"
    JDK_HOME=$(dirname "$(dirname "$1")")
    JAVA_BIN="$JDK_HOME/bin/java"
    [ -x "$JAVA_BIN" ] || JAVA_BIN="$JDK_HOME/bin/java.exe"

    # 이어 도는 것들 - jpackage, jlink, 자식 프로세스 - 이 모두 같은 JDK 를
    # 보도록 환경을 맞춘다.
    JAVA_HOME="$JDK_HOME"
    export JAVA_HOME
    PATH="$JDK_HOME/bin:$PATH"
    export PATH
}

pick_jdk() {
    JAVAC=""
    JDK_SEEN=""
    _best_javac=""
    _best_major=0

    # 1) JAVA_HOME
    if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
        _major=$(jdk_major "$JAVA_HOME/bin/javac")
        note_jdk "$_major" "$JAVA_HOME" "JAVA_HOME"
        if [ "$_major" -ge "$JDK_MINIMUM" ]; then
            use_jdk "$JAVA_HOME/bin/javac" "$_major"
            return 0
        fi
    fi

    # 2) PATH
    if command -v javac >/dev/null 2>&1; then
        _on_path=$(command -v javac)
        _major=$(jdk_major "$_on_path")
        note_jdk "$_major" "$(dirname "$(dirname "$_on_path")")" "PATH"
        if [ "$_major" -ge "$JDK_MINIMUM" ]; then
            use_jdk "$_on_path" "$_major"
            return 0
        fi
    fi

    # 3) 흔한 자리. 여기서는 가장 높은 것을 고른다.
    for _candidate in \
        /usr/lib/jvm/*/bin/javac \
        /usr/java/*/bin/javac \
        /opt/java/*/bin/javac \
        /Library/Java/JavaVirtualMachines/*/Contents/Home/bin/javac \
        "$HOME/Library/Java/JavaVirtualMachines"/*/Contents/Home/bin/javac \
        /opt/homebrew/opt/openjdk*/bin/javac \
        /usr/local/opt/openjdk*/bin/javac \
        "$HOME/.sdkman/candidates/java"/*/bin/javac \
        "$HOME/.jdks"/*/bin/javac \
        "/c/Program Files/Java"/*/bin/javac.exe \
        "/c/Program Files/Eclipse Adoptium"/*/bin/javac.exe \
        "/c/Program Files/Eclipse Foundation"/*/bin/javac.exe \
        "/c/Program Files/Microsoft"/*/bin/javac.exe \
        "/c/Program Files/Amazon Corretto"/*/bin/javac.exe \
        "/c/Program Files/Zulu"/*/bin/javac.exe \
        "/c/Program Files/Android/openjdk"/*/bin/javac.exe
    do
        [ -x "$_candidate" ] || continue
        _major=$(jdk_major "$_candidate")
        if [ "$_major" -lt "$JDK_MINIMUM" ]; then
            note_jdk "$_major" "$(dirname "$(dirname "$_candidate")")" "흔한 자리"
        elif [ "$_major" -gt "$_best_major" ]; then
            _best_major="$_major"
            _best_javac="$_candidate"
        fi
    done

    if [ "$_best_major" -ge "$JDK_MINIMUM" ]; then
        use_jdk "$_best_javac" "$_best_major"
        return 0
    fi

    return 1
}

show_jdk_problem() {
    if [ -n "$JDK_SEEN" ]; then
        echo "JDK $JDK_MINIMUM 이상이 필요한데 찾지 못했습니다." >&2
        echo "" >&2
        echo "  이 컴퓨터에 있는 것은 이것뿐입니다." >&2
        printf '%s' "$JDK_SEEN" | while IFS='	' read -r _m _h _o; do
            [ -n "$_h" ] || continue
            printf '    JDK %-3s %s  (%s)\n' "$_m" "$_h" "$_o" >&2
        done
        echo "" >&2
        echo "  이 프로그램은 텍스트 블록과 instanceof 패턴을 쓰므로 옛 JDK 로는 컴파일되지 않습니다." >&2
    else
        echo "JDK 가 설치되어 있지 않습니다." >&2
        echo "" >&2
        echo "  JDK 가 아니라 JRE 만 깔려 있어도 javac 가 없어 이렇게 됩니다." >&2
    fi
}

show_jdk_help() {
    echo "" >&2
    echo "  JDK $JDK_MINIMUM 이상을 설치한 뒤 다시 해 보세요." >&2
    echo "    macOS   brew install --cask temurin" >&2
    echo "    Ubuntu  sudo apt install openjdk-21-jdk" >&2
    echo "    Fedora  sudo dnf install java-21-openjdk-devel" >&2
    echo "    그 밖    https://adoptium.net" >&2
    echo "" >&2
    echo "  이미 설치했다면 JAVA_HOME 을 알려 주세요." >&2
    echo "    JAVA_HOME=/path/to/jdk ./build.sh" >&2
}

# 이 컴퓨터에 맞는 설치 명령을 고른다. 찾으면 JDK_INSTALL_CMD 에 담고 0.
find_install_cmd() {
    JDK_INSTALL_CMD=""
    if command -v brew >/dev/null 2>&1; then
        JDK_INSTALL_CMD="brew install --cask temurin"
    elif command -v apt-get >/dev/null 2>&1; then
        JDK_INSTALL_CMD="sudo apt-get update && sudo apt-get install -y openjdk-21-jdk"
    elif command -v dnf >/dev/null 2>&1; then
        JDK_INSTALL_CMD="sudo dnf install -y java-21-openjdk-devel"
    elif command -v zypper >/dev/null 2>&1; then
        JDK_INSTALL_CMD="sudo zypper install -y java-21-openjdk-devel"
    elif command -v pacman >/dev/null 2>&1; then
        JDK_INSTALL_CMD="sudo pacman -S --noconfirm jdk21-openjdk"
    elif command -v winget >/dev/null 2>&1; then
        JDK_INSTALL_CMD="winget install --exact --id EclipseAdoptium.Temurin.21.JDK --accept-package-agreements --accept-source-agreements"
    else
        return 1
    fi
    return 0
}

install_jdk() {
    # 부르는 쪽이 `set -e` 를 켜 두었다. `[ ... ] && return 1` 로 쓰면
    # 조건이 어긋났을 때 그 문장 자체가 실패로 잡혀 빌드가 통째로 멎는다.
    if [ "$CHUNJIIN_INSTALL_JDK" = "no" ]; then return 1; fi

    if ! find_install_cmd; then
        echo "" >&2
        echo "  꾸러미 관리자를 찾지 못해 대신 깔아 드리지는 못합니다." >&2
        return 1
    fi

    if [ "$CHUNJIIN_INSTALL_JDK" != "1" ]; then
        # 사람이 없는 자리(CI, 파이프)에서 물으면 아무도 답하지 않는다.
        if [ ! -t 0 ]; then
            echo "" >&2
            echo "  물어볼 자리가 아니어서 설치하지 않았습니다." >&2
            echo "  묻지 말고 깔게 하려면  CHUNJIIN_INSTALL_JDK=1 ./build.sh" >&2
            return 1
        fi
        echo "" >&2
        echo "  다음 명령으로 설치합니다." >&2
        echo "    $JDK_INSTALL_CMD" >&2
        printf '  지금 설치할까요? (y/N) ' >&2
        read -r _answer
        case "$_answer" in
            [yY]*) ;;
            *) echo "  설치하지 않았습니다." >&2; return 1 ;;
        esac
    fi

    echo "" >&2
    echo "JDK 를 설치합니다. 암호를 묻거든 알려 주세요 ..." >&2
    if ! sh -c "$JDK_INSTALL_CMD" >&2; then
        echo "" >&2
        echo "설치를 마치지 못했습니다." >&2
        return 1
    fi

    echo "" >&2
    echo "설치했습니다. 이어서 합니다." >&2
    return 0
}

if ! pick_jdk; then
    show_jdk_problem
    if install_jdk; then
        # 방금 깐 것은 이 셸의 PATH 에 아직 없을 수 있다.
        # 하지만 '흔한 자리' 를 다시 훑으면 나온다.
        if ! pick_jdk; then
            echo "" >&2
            echo "설치는 됐는데 그 JDK 를 찾지 못했습니다." >&2
        fi
    fi
fi

if [ -z "$JAVAC" ]; then
    show_jdk_help
    exit 1
fi

# 비켜 간 것이 있으면 말해 준다. 아무 말 없이 다른 JDK 를 쓰면
# 왜 그런지 몰라 헤매게 된다.
#
# 적어 둔 것 가운데 **낡은 것만** 말한다. JAVA_HOME 은 버전을 재기 전에 적으므로
# 멀쩡한 것도 목록에 든다. 그것까지 찍으면, package.sh 가 JAVA_HOME 을 내보낸 뒤
# 자식 build.sh 가 그것을 물려받는 자리에서 "JDK 23 은 너무 낡아" 같은 헛소리가 난다.
if [ -n "$JDK_SEEN" ]; then
    printf '%s' "$JDK_SEEN" | while IFS='	' read -r _m _h _o; do
        [ -n "$_h" ] || continue
        if [ "$_o" = "흔한 자리" ]; then continue; fi
        if [ "$_m" -ge "$JDK_MINIMUM" ]; then continue; fi
        echo "$_o 의 JDK $_m 은 너무 낡아 건너뜁니다.  $_h" >&2
    done
fi
