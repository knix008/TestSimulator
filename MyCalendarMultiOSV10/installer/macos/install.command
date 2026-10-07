#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Select installation language / 설치 언어를 선택하세요"
echo "  1) English"
echo "  2) 한국어"
printf '> '
read -r choice

case "$choice" in
  2|ko|KO|한국어) LANG_CODE="ko" ;;
  1|en|EN|English) LANG_CODE="en" ;;
  *)
    echo "Choose 1 or 2."
    exit 1
    ;;
esac

say() { if [[ "$LANG_CODE" == "ko" ]]; then echo "$1"; else echo "$2"; fi; }

CONFIG="${HOME}/Library/Application Support/com.mycalendar.multios"
# Events and settings live in the webview storage under the app identifier.
DATA_DIRS=(
  "$CONFIG"
  "${HOME}/Library/WebKit/com.mycalendar.multios"
  "${HOME}/Library/Caches/com.mycalendar.multios"
  "${HOME}/Library/Preferences/com.mycalendar.multios.plist"
  "${HOME}/Library/Saved Application State/com.mycalendar.multios.savedState"
)

# An existing install is removed completely before installing again; user data only if asked.
installed=()
for app in "/Applications/My Calendar.app" "${HOME}/Applications/My Calendar.app"; do
  if [[ -e "$app" ]]; then installed+=("$app"); fi
done
if [[ ${#installed[@]} -gt 0 ]]; then
  say "이미 설치된 My Calendar를 찾았습니다. 기존 프로그램을 완전히 삭제한 뒤 새로 설치합니다." \
      "My Calendar is already installed. It will be removed completely and installed again."
  say "일정과 설정 같은 사용자 데이터도 삭제할까요? [y/N]" \
      "Do you also want to delete your user data, such as events and settings? [y/N]"
  printf '> '
  read -r answer
  pkill -x my-calendar 2>/dev/null || true
  for app in "${installed[@]}"; do
    rm -rf "$app" 2>/dev/null || sudo rm -rf "$app"
  done
  rm -f "${HOME}/Library/LaunchAgents/My Calendar.plist"
  case "$answer" in
    y|Y|yes|YES|예|네)
      rm -rf "${DATA_DIRS[@]}"
      say "사용자 데이터를 삭제했습니다." "Deleted the user data."
      ;;
    *) say "사용자 데이터는 남겨 두었습니다." "Kept the user data." ;;
  esac
fi

mkdir -p "$CONFIG"
printf '%s\n' "$LANG_CODE" > "${CONFIG}/install-language.txt"
echo "Saved ${LANG_CODE} to ${CONFIG}/install-language.txt"

shopt -s nullglob
dmgs=("${ROOT}/src-tauri/target/release/bundle/dmg/"*.dmg)
if [[ ${#dmgs[@]} -gt 0 ]]; then
  open "${dmgs[0]}"
  echo "Drag My Calendar into Applications."
else
  echo "No macOS disk image found. From the project folder run: npm run build:macos"
fi
