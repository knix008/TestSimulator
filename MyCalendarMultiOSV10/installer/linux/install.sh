#!/usr/bin/env bash
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

if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
  CONFIG="${XDG_CONFIG_HOME}/my-calendar"
else
  CONFIG="${HOME}/.config/my-calendar"
fi
mkdir -p "$CONFIG"
printf '%s\n' "$LANG_CODE" > "${CONFIG}/install-language.txt"
echo "Saved ${LANG_CODE} to ${CONFIG}/install-language.txt"

shopt -s nullglob
debs=("${ROOT}/src-tauri/target/release/bundle/deb/"*.deb)
rpms=("${ROOT}/src-tauri/target/release/bundle/rpm/"*.rpm)
images=("${ROOT}/src-tauri/target/release/bundle/appimage/"*.AppImage)

if [[ ${#debs[@]} -gt 0 ]]; then
  sudo dpkg -i "${debs[0]}" || sudo apt-get install -f -y
elif [[ ${#rpms[@]} -gt 0 ]]; then
  sudo rpm -Uvh "${rpms[0]}"
elif [[ ${#images[@]} -gt 0 ]]; then
  mkdir -p "${HOME}/.local/bin"
  install -m 755 "${images[0]}" "${HOME}/.local/bin/my-calendar.AppImage"
  echo "Installed ${HOME}/.local/bin/my-calendar.AppImage"
else
  echo "No Linux bundle found. From the project folder run: npm run build:linux"
fi
