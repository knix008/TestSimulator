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

say() { if [[ "$LANG_CODE" == "ko" ]]; then echo "$1"; else echo "$2"; fi; }

if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
  CONFIG="${XDG_CONFIG_HOME}/my-calendar"
else
  CONFIG="${HOME}/.config/my-calendar"
fi
APPIMAGE="${HOME}/.local/bin/my-calendar.AppImage"
# Events and settings live in the webview storage under the app identifier.
DATA_DIRS=(
  "${XDG_DATA_HOME:-${HOME}/.local/share}/com.mycalendar.multios"
  "${XDG_CONFIG_HOME:-${HOME}/.config}/com.mycalendar.multios"
  "${XDG_CACHE_HOME:-${HOME}/.cache}/com.mycalendar.multios"
  "$CONFIG"
)

# An existing install is removed completely before installing again; user data only if asked.
installed=()
if dpkg -s my-calendar >/dev/null 2>&1; then installed+=("deb"); fi
if rpm -q my-calendar >/dev/null 2>&1; then installed+=("rpm"); fi
if [[ -e "$APPIMAGE" ]]; then installed+=("appimage"); fi
if [[ ${#installed[@]} -gt 0 ]]; then
  say "이미 설치된 My Calendar를 찾았습니다. 기존 프로그램을 완전히 삭제한 뒤 새로 설치합니다." \
      "My Calendar is already installed. It will be removed completely and installed again."
  say "일정과 설정 같은 사용자 데이터도 삭제할까요? [y/N]" \
      "Do you also want to delete your user data, such as events and settings? [y/N]"
  printf '> '
  read -r answer
  pkill -x my-calendar 2>/dev/null || true
  for kind in "${installed[@]}"; do
    case "$kind" in
      deb) sudo dpkg --purge my-calendar ;;
      rpm) sudo rpm -e my-calendar ;;
      appimage) rm -f "$APPIMAGE" ;;
    esac
  done
  rm -f "${HOME}/.config/autostart/My Calendar.desktop" "${HOME}/.config/autostart/my-calendar.desktop"
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
debs=("${ROOT}/src-tauri/target/release/bundle/deb/"*.deb)
rpms=("${ROOT}/src-tauri/target/release/bundle/rpm/"*.rpm)
images=("${ROOT}/src-tauri/target/release/bundle/appimage/"*.AppImage)

if [[ ${#debs[@]} -gt 0 ]]; then
  sudo dpkg -i "${debs[0]}" || sudo apt-get install -f -y
elif [[ ${#rpms[@]} -gt 0 ]]; then
  sudo rpm -Uvh "${rpms[0]}"
elif [[ ${#images[@]} -gt 0 ]]; then
  mkdir -p "${HOME}/.local/bin"
  install -m 755 "${images[0]}" "$APPIMAGE"
  echo "Installed $APPIMAGE"
else
  echo "No Linux bundle found. From the project folder run: npm run build:linux"
fi
