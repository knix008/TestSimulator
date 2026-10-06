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

CONFIG="${HOME}/Library/Application Support/com.mycalendar.multios"
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
