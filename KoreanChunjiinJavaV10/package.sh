#!/usr/bin/env sh
#
# package.sh - 설치 파일을 만든다 (Linux · macOS, Windows 의 Git Bash 도 된다).
#
#   ./package.sh              운영체제에 맞는 설치 파일
#   ./package.sh --portable   설치 없이 풀어 쓰는 압축본만
#   ./package.sh --type deb   만들 종류를 직접 고른다 (exe msi dmg pkg deb rpm)
#   ./package.sh --no-wix     Windows 에서 WiX 를 받아 오지 않는다 (그냥 멈춘다)
#
# Windows 의 exe / msi 는 WiX Toolset 3.14 가 있어야 만든다.
# 없으면 **자동으로 받아서** tools/wix314 에 풀고 그대로 이어서 빌드한다.
# 관리자 권한도, .NET 3.5 도 필요 없다.
#
# 만들어진 것은 release/ 에 놓이고, 손 닿는 자리에 두려고 프로젝트 루트로도
# 복사한다 (원본 C 판이 chunjiin-setup.exe 를 저장소 루트에 두었던 것과 같다).
#
#
# 왜 자바를 따로 깔지 않아도 되는가
# ---------------------------------
# jlink 로 이 프로그램이 실제로 쓰는 모듈만 골라 작은 자바 런타임을 만들고,
# jpackage 가 그것을 설치 파일 **안에** 넣는다.
# 그래서 받는 쪽에는 자바가 없어도 되고, 설치 중에 무엇을 더 내려받지도 않는다.
# 이미 깔린 자바가 있어도 건드리지 않는다. 버전이 서로 어긋날 일이 없다.
set -e

cd "$(dirname "$0")"
. scripts/find-jdk.sh

BIN="$(dirname "$JAVAC")"
JDK_HOME="$(dirname "$BIN")"
JLINK="$BIN/jlink"
JPACKAGE="$BIN/jpackage"
JDEPS="$BIN/jdeps"
JAR_CMD="$BIN/jar"
JMOD="$BIN/jmod"
[ -x "$JLINK" ] || JLINK="$JLINK.exe"
[ -x "$JPACKAGE" ] || JPACKAGE="$JPACKAGE.exe"
[ -x "$JDEPS" ] || JDEPS="$JDEPS.exe"
[ -x "$JMOD" ] || JMOD="$JMOD.exe"

APP_NAME=Chunjiin
APP_VERSION=1.0.0
VENDOR=SHKWON
DESCRIPTION="천지인 한글 입력기"

RELEASE=release
RUNTIME=out/runtime

PORTABLE=0
TYPE=""
NO_WIX=0

while [ $# -gt 0 ]; do
  case "$1" in
    --portable) PORTABLE=1 ;;
    --no-wix) NO_WIX=1 ;;
    --type) shift; TYPE="$1" ;;
    -h|--help)
      sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "모르는 옵션: $1" >&2; exit 1 ;;
  esac
  shift
done

if [ ! -x "$JPACKAGE" ]; then
  echo "jpackage 가 없습니다. JDK 17 이상이 필요합니다." >&2
  exit 1
fi

# 운영체제별 기본값
case "$(uname -s)" in
  Darwin)  OS=mac;   DEFAULT_TYPE=dmg; ICON=""; ;;
  Linux)   OS=linux; DEFAULT_TYPE=deb; ICON=src/main/resources/icons/256x256.png; ;;
  MINGW*|MSYS*|CYGWIN*) OS=win; DEFAULT_TYPE=exe; ICON=src/main/resources/icons/icon.ico
    # MSI 는 문자열을 코드 페이지 1252 로 담고 jpackage 는 -cultures:en-us 로 고정한다.
    # 설치 프로그램에 들어가는 글에 한글을 쓰면 light.exe 가 LGHT0311 로 멈추므로
    # 여기서만 ASCII 로 바꾼다. 창 제목과 화면은 그대로 한글이다.
    DESCRIPTION="Chunjiin - Korean 12-key Hangul input"
    ;;
  *)       OS=linux; DEFAULT_TYPE=app-image; ICON=""; ;;
esac

[ -n "$TYPE" ] || TYPE="$DEFAULT_TYPE"
[ "$PORTABLE" -eq 1 ] && TYPE=app-image

# ------------------------------------------------------------------ #
# 0) WiX 확인 - Windows 의 exe / msi 는 이것이 있어야 만든다           #
# ------------------------------------------------------------------ #
#
# jpackage 는 candle.exe 와 light.exe 를 PATH 에서 찾는다.
# 이미 깔려 있으면 그것을 쓰고, 없으면 공식 바이너리 묶음을 받아서 쓴다.
WIX_LOCAL="tools/wix314"
WIX_URL="https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip"

have_wix() {
  command -v candle.exe >/dev/null 2>&1 && return 0

  for candidate in     "$WIX_LOCAL/candle.exe"     "/c/Program Files (x86)/WiX Toolset v3.14/bin/candle.exe"     "/c/Program Files (x86)/WiX Toolset v3.11/bin/candle.exe"
  do
    if [ -x "$candidate" ]; then
      PATH="$(dirname "$candidate"):$PATH"
      export PATH
      return 0
    fi
  done
  return 1
}

get_wix() {
  echo "  받는 중 ..."
  echo "  $WIX_URL"
  mkdir -p tools

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o tools/wix314-binaries.zip "$WIX_URL" || return 1
  else
    # Git Bash 에 curl 이 없으면 PowerShell 을 빌려 쓴다 (여기는 Windows 다)
    powershell.exe -NoProfile -Command       "[Net.ServicePointManager]::SecurityProtocol = 'Tls12';        \$ProgressPreference = 'SilentlyContinue';        Invoke-WebRequest -Uri '$WIX_URL' -OutFile 'tools\wix314-binaries.zip' -UseBasicParsing" || return 1
  fi

  mkdir -p "$WIX_LOCAL"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o tools/wix314-binaries.zip -d "$WIX_LOCAL" || return 1
  else
    powershell.exe -NoProfile -Command       "Expand-Archive -Path 'tools\wix314-binaries.zip' -DestinationPath 'tools\wix314' -Force" || return 1
  fi

  rm -f tools/wix314-binaries.zip
  echo "  풀었습니다   $WIX_LOCAL"
}

if [ "$OS" = "win" ] && { [ "$TYPE" = "exe" ] || [ "$TYPE" = "msi" ]; } && ! have_wix; then
  if [ "$NO_WIX" -eq 1 ]; then
    echo "$TYPE 설치 파일은 WiX Toolset 3.14 가 있어야 만듭니다." >&2
    echo "" >&2
    echo "  받아서 쓰기 (기본)        ./package.sh" >&2
    echo "  설치 프로그램 없이 쓰기   ./package.sh --portable" >&2
    exit 1
  fi

  echo "WiX Toolset 이 없습니다. 받아서 씁니다."
  if ! get_wix || ! have_wix; then
    echo "" >&2
    echo "WiX 를 받지 못했습니다." >&2
    echo "  인터넷에 닿지 않는 자리라면 다른 기계에서 아래를 받아" >&2
    echo "  $WIX_LOCAL 에 풀어 놓고 다시 실행하세요." >&2
    echo "    $WIX_URL" >&2
    echo "" >&2
    echo "  설치 프로그램 없이 쓰려면   ./package.sh --portable" >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------ #
# 1) 프로그램 빌드                                                     #
# ------------------------------------------------------------------ #
./build.sh

rm -rf "$RELEASE" "$RUNTIME"
mkdir -p "$RELEASE"

# ------------------------------------------------------------------ #
# 2) 이 프로그램에 꼭 필요한 모듈만 담은 작은 런타임                    #
# ------------------------------------------------------------------ #
echo ""
echo "런타임 만드는 중 ..."

# jdeps 가 실제로 쓰는 모듈을 알려 준다. 못 알아내면 안전한 목록을 쓴다.
MODULES="$("$JDEPS" --print-module-deps --ignore-missing-deps dist/Chunjiin.jar 2>/dev/null || true)"
[ -n "$MODULES" ] || MODULES="java.base,java.desktop,java.prefs,java.logging"
echo "  모듈   $MODULES"

"$JLINK" \
  --add-modules "$MODULES" \
  --output "$RUNTIME" \
  --strip-debug --no-header-files --no-man-pages --compress=zip-6

echo "  크기   $(du -sh "$RUNTIME" | cut -f1)"

# ------------------------------------------------------------------ #
# 2.5) 다시 깔 때 옛 것을 먼저 지우게 만든다 (Windows msi/exe)         #
# ------------------------------------------------------------------ #
#
# jpackage 가 만드는 MSI 는 그대로 두면 두 가지가 아쉽다.
#
#   - ProductCode 가 이름·판에서 결정적으로 나온다. 그래서 같은 판을 다시 깔면
#     윈도우가 "같은 제품"으로 보고 고치기/제거 화면을 띄운다. 새로 깔리지 않는다.
#   - 옛 것을 찾는 조건이 "이 판보다 낮은 것"이라 같은 판은 아예 걸리지 않는다.
#
# jpackage 는 이 둘을 옵션으로 열어 주지 않는다. 대신 WiX 원본(main.wxs)을
# --resource-dir 로 바꿔치기할 수 있으므로, 지금 쓰는 JDK 안에 든 원본을 꺼내
# 딱 두 군데만 고쳐 쓴다. JDK 를 바꿔도 그때의 원본을 꺼내 쓰므로 낡지 않는다.
#
#   Id="$(var.JpProductCode)"  ->  Id="*"        빌드마다 새 제품이 된다
#   IncludeMaximum="...."      ->  "yes"         같은 판도 옛 것으로 친다
#
# 옛 것을 지우는 RemoveExistingProducts 는 jpackage 가 이미 맨 앞(798)에
# 두었으므로, 새로 깔기 전에 통째로 지워진다.
WIX_RES=out/wix

prepare_upgrade_override() {
  rm -rf out/wix-src "$WIX_RES"
  mkdir -p out/wix-src "$WIX_RES"

  [ -x "$JMOD" ] || return 1
  [ -f "$JDK_HOME/jmods/jdk.jpackage.jmod" ] || return 1
  ( cd out/wix-src && "$JMOD" extract "$JDK_HOME/jmods/jdk.jpackage.jmod" ) >/dev/null 2>&1 || return 1

  src=out/wix-src/classes/jdk/jpackage/internal/resources/main.wxs
  [ -f "$src" ] || return 1

  # 1) 빌드마다 새 제품이 되게, 2) 같은 판도 옛 것으로 치게
  sed -e 's|Id="$(var\.JpProductCode)"|Id="*"|' \
      -e 's|IncludeMaximum="$(var\.JpUpgradeVersionOnlyDetectUpgrade)"|IncludeMaximum="yes"|' \
      "$src" > "$WIX_RES/main.wxs.tmp"

  # 3) 똑같은 설치 파일을 조용히(무인) 다시 실행했을 때 통째로 다시 쓰게 한다.
  #    ProductCode 가 같으면 윈도우는 "이미 깔린 그 제품"으로 보고 아무것도 하지 않는다.
  #    REINSTALL=ALL 과 REINSTALLMODE=amus 를 걸어 두면 파일·바로가기·레지스트리를
  #    판을 따지지 않고 모두 새로 쓴다. 지울 때(REMOVE)는 걸지 않는다.
  #
  # 4) 똑같은 설치 파일을 창을 띄워 다시 실행했을 때 "고치기 / 지우기" 를 묻게 한다.
  #    jpackage 는 이 대화상자를 차례에 넣지 않는다. 그래서 그냥 두면 아무것도 묻지 않고
  #    조용히 **지워 버린다**. 깔려 있는 프로그램이 사라지는 것이라 그대로 둘 수 없다.
  awk '/<UIRef Id="JpUI"\/>/ {
         print "    <SetProperty Id=\"REINSTALL\" Value=\"ALL\" After=\"FindRelatedProducts\" Sequence=\"both\">Installed AND NOT REMOVE</SetProperty>"
         print "    <SetProperty Id=\"REINSTALLMODE\" Value=\"amus\" After=\"FindRelatedProducts\" Sequence=\"both\">Installed AND NOT REMOVE</SetProperty>"
       }
       /<InstallUISequence>/ {
         print
         print "      <Show Dialog=\"MaintenanceWelcomeDlg\" Before=\"ProgressDlg\">Installed AND NOT RESUME AND NOT Preselected AND NOT PATCH</Show>"
         next
       }
       { print }' "$WIX_RES/main.wxs.tmp" > "$WIX_RES/main.wxs"
  rm -f "$WIX_RES/main.wxs.tmp"

  # 네 군데가 정말로 바뀌었는지 본다. 앞으로 JDK 가 원본을 바꾸면 여기서 걸린다.
  grep -q 'Id="\*"' "$WIX_RES/main.wxs" || return 1
  grep -q 'IncludeMaximum="yes"' "$WIX_RES/main.wxs" || return 1
  grep -q 'Id="REINSTALLMODE"' "$WIX_RES/main.wxs" || return 1
  grep -q 'MaintenanceWelcomeDlg' "$WIX_RES/main.wxs" || return 1
  return 0
}

UPGRADE_OVERRIDE=0
if [ "$OS" = "win" ] && { [ "$TYPE" = "exe" ] || [ "$TYPE" = "msi" ]; }; then
  if prepare_upgrade_override; then
    UPGRADE_OVERRIDE=1
    echo ""
    echo "다시 깔기 규칙 적용   옛 것을 통째로 지우고 새로 깝니다"
  else
    rm -rf "$WIX_RES"
    echo ""
    echo "알림: JDK 에서 WiX 원본을 꺼내지 못해 다시 깔기 규칙을 넣지 못했습니다." >&2
    echo "      (jmods 폴더가 없는 JDK 입니다) 판이 다르면 업그레이드는 그대로 됩니다." >&2
  fi
fi

# ------------------------------------------------------------------ #
# 3) 설치 파일                                                         #
# ------------------------------------------------------------------ #
echo ""
echo "설치 파일 만드는 중 ($TYPE) ..."

set -- \
  --name "$APP_NAME" \
  --app-version "$APP_VERSION" \
  --vendor "$VENDOR" \
  --description "$DESCRIPTION" \
  --copyright "Copyright (C) 2026 $VENDOR" \
  --input dist \
  --main-jar Chunjiin.jar \
  --main-class com.shkwon.chunjiin.Main \
  --runtime-image "$RUNTIME" \
  --dest "$RELEASE" \
  --type "$TYPE"

[ -n "$ICON" ] && [ -f "$ICON" ] && set -- "$@" --icon "$ICON"
[ "$UPGRADE_OVERRIDE" -eq 1 ] && set -- "$@" --resource-dir "$WIX_RES"

case "$OS" in
  win)
    set -- "$@" --win-dir-chooser --win-menu --win-shortcut --win-shortcut-prompt \
      --win-menu-group "Chunjiin" --win-per-user-install
    ;;
  linux)
    set -- "$@" --linux-shortcut --linux-menu-group Utility \
      --linux-app-category utils --linux-package-name chunjiin
    ;;
  mac)
    set -- "$@" --mac-package-name "$APP_NAME"
    ;;
esac

if ! "$JPACKAGE" "$@"; then
  echo "" >&2
  echo "설치 파일을 만들지 못했습니다." >&2
  case "$OS" in
    win) echo "  Windows 의 exe/msi 는 WiX Toolset 3.14 가 있어야 합니다." >&2
         echo "  (없으면 이 스크립트가 알아서 받습니다. --no-wix 로 끌 수 있습니다.)" >&2 ;;
    linux) echo "  deb 는 dpkg-deb 와 fakeroot, rpm 은 rpmbuild 가 있어야 합니다." >&2
           echo "    sudo apt install fakeroot binutils   /   sudo dnf install rpm-build" >&2 ;;
  esac
  echo "" >&2
  echo "  설치 프로그램 없이 풀어 쓰는 압축본은 이렇게 만듭니다." >&2
  echo "    ./package.sh --portable" >&2
  exit 1
fi

# app-image 는 폴더로 나오므로 압축해서 하나로 만든다
if [ "$TYPE" = "app-image" ]; then
  echo "묶는 중 ..."
  ARCHIVE="$APP_NAME-$APP_VERSION-$OS-portable"
  ( cd "$RELEASE" && \
    if [ "$OS" = "win" ]; then
      "$JAR_CMD" --create --file "$ARCHIVE.zip" "$APP_NAME" 2>/dev/null || zip -qr "$ARCHIVE.zip" "$APP_NAME"
    else
      tar czf "$ARCHIVE.tar.gz" "$APP_NAME"
    fi )
  rm -rf "$RELEASE/$APP_NAME"
fi

# ------------------------------------------------------------------ #
# 4) 손 닿는 자리(프로젝트 루트)로 복사                                #
# ------------------------------------------------------------------ #
echo ""
COPIED=0
for f in "$RELEASE"/*; do
  [ -f "$f" ] || continue
  cp "$f" "./$(basename "$f")"
  echo "복사함 -> $(basename "$f")"
  COPIED=1
done

[ "$COPIED" -eq 1 ] || echo "release/ 에 만들어진 파일이 없습니다."

echo ""
echo "다 됐습니다.  $RELEASE/ 와 프로젝트 루트에 있습니다."
echo "  받는 쪽에 자바가 없어도 됩니다 (런타임이 안에 들어 있습니다)."
