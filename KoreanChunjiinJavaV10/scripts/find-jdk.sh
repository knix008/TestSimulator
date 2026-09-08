#!/usr/bin/env sh
#
# find-jdk.sh - javac 와 java 가 어디에 있는지 찾는다.
#
# 다른 스크립트가 `. scripts/find-jdk.sh` 로 불러 쓴다.
# 찾으면 JAVAC 와 JAVA_BIN 두 변수를 채우고, 못 찾으면 안내를 찍고 끝낸다.
#
# 찾는 차례
#   1. JAVA_HOME
#   2. PATH 위의 javac
#   3. 운영체제별로 JDK 가 흔히 놓이는 자리
#

JAVAC=""
JAVA_BIN=""

# 1) JAVA_HOME
if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
  JAVAC="$JAVA_HOME/bin/javac"
  JAVA_BIN="$JAVA_HOME/bin/java"
fi

# 2) PATH
if [ -z "$JAVAC" ] && command -v javac >/dev/null 2>&1; then
  JAVAC="$(command -v javac)"
  JAVA_BIN="$(command -v java)"
fi

# 3) 흔한 자리
if [ -z "$JAVAC" ]; then
  for candidate in \
    /usr/lib/jvm/*/bin/javac \
    /usr/java/*/bin/javac \
    /Library/Java/JavaVirtualMachines/*/Contents/Home/bin/javac \
    "$HOME/Library/Java/JavaVirtualMachines"/*/Contents/Home/bin/javac \
    "$HOME/.sdkman/candidates/java/current/bin/javac" \
    "/c/Program Files/Java"/*/bin/javac.exe \
    "/c/Program Files/Eclipse Adoptium"/*/bin/javac.exe \
    "/c/Program Files/Microsoft"/*/bin/javac.exe \
    "/c/Program Files/Amazon Corretto"/*/bin/javac.exe \
    "/c/Program Files/Android/openjdk"/*/bin/javac.exe
  do
    if [ -x "$candidate" ]; then
      JAVAC="$candidate"
      JAVA_BIN="$(dirname "$candidate")/java"
      [ -x "$JAVA_BIN" ] || JAVA_BIN="$(dirname "$candidate")/java.exe"
      break
    fi
  done
fi

if [ -z "$JAVAC" ]; then
  echo "JDK 를 찾지 못했습니다." >&2
  echo "" >&2
  echo "  JDK 17 이상을 설치한 뒤 다시 해 보세요." >&2
  echo "    macOS   brew install --cask temurin" >&2
  echo "    Ubuntu  sudo apt install openjdk-21-jdk" >&2
  echo "    Fedora  sudo dnf install java-21-openjdk-devel" >&2
  echo "    그 밖    https://adoptium.net" >&2
  echo "" >&2
  echo "  이미 설치했다면 JAVA_HOME 을 알려 주세요." >&2
  echo "    JAVA_HOME=/path/to/jdk ./build.sh" >&2
  exit 1
fi
