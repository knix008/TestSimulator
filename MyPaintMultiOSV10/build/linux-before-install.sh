#!/bin/sh
# The user picks the installer language. An existing MyPaint is removed
# completely, and saved data is deleted only when the user says so.

LANG_CHOICE=ko

if [ -n "${SUDO_USER:-}" ]; then
  USER_HOME=$(getent passwd "$SUDO_USER" 2>/dev/null | cut -d: -f6)
elif [ -n "${PKEXEC_UID:-}" ]; then
  USER_HOME=$(getent passwd "$PKEXEC_UID" 2>/dev/null | cut -d: -f6)
else
  USER_HOME=$HOME
fi
[ -n "$USER_HOME" ] || USER_HOME=$HOME

run_zenity() {
  if ! command -v zenity >/dev/null 2>&1 || [ -z "${DISPLAY:-}" ]; then
    return 1
  fi
  if [ -n "${SUDO_USER:-}" ]; then
    sudo -u "$SUDO_USER" env DISPLAY="$DISPLAY" zenity "$@"
  else
    zenity "$@"
  fi
}

choice=$(run_zenity --list --radiolist --title="MyPaint" \
  --text="설치에 사용할 언어를 선택하세요.
Choose the installation language." \
  --column="" --column="Language" \
  TRUE "한국어" FALSE "English" 2>/dev/null) || choice=""

if [ -z "$choice" ] && [ -t 0 ]; then
  printf "설치에 사용할 언어를 선택하세요 / Choose the installation language: [1] 한국어  [2] English [1]: "
  read choice || choice=""
fi

case "$choice" in
  2|en|EN|English|english) LANG_CHOICE=en ;;
  *) LANG_CHOICE=ko ;;
esac

if [ -n "${SUDO_USER:-}" ] || [ -n "${PKEXEC_UID:-}" ]; then
  DATA="$USER_HOME/.config/MyPaint"
else
  DATA="${XDG_CONFIG_HOME:-$USER_HOME/.config}/MyPaint"
fi
answer=""
if [ -d "$DATA" ]; then
  if [ "$LANG_CHOICE" = "en" ]; then
    text="Saved data was found. Do you want to delete it?"
  else
    text="저장된 데이터가 있습니다. 삭제하시겠습니까?"
  fi
  if command -v zenity >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
    if run_zenity --question --title="MyPaint" --text="$text"; then
      answer=yes
    else
      answer=no
    fi
  elif [ -t 0 ]; then
    printf "%s [y/N] " "$text"
    read answer || answer=""
  fi
fi

if [ -d /opt/MyPaint ]; then
  rm -rf /opt/MyPaint
fi

case "$answer" in
  y|Y|yes|YES) rm -rf "$DATA" ;;
esac
