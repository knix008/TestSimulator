#!/bin/sh
# Asks for the installer language and whether to create the desktop and
# applications-menu ("Start menu") shortcuts.
#
#   install-choices.sh --system
#       After a deb/rpm install. The package is already unpacked.
#   install-choices.sh --user
#       Installs the AppImage that sits next to this script.
#
# A cancelled dialog keeps the defaults: both shortcuts, language from $LANG.
# DEBIAN_FRONTEND=noninteractive skips the questions and uses those defaults.
set -u

mode=""
appimage=""
icon=""
while [ $# -gt 0 ]; do
  case "$1" in
    --system) mode="system" ;;
    --user) mode="user" ;;
    --appimage) appimage="${2:-}"; shift ;;
    --icon) icon="${2:-}"; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

script_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
if [ -z "$appimage" ]; then
  for candidate in "$script_dir"/Image2Text-*.AppImage "$script_dir"/*.AppImage; do
    if [ -f "$candidate" ]; then
      appimage=$candidate
      break
    fi
  done
fi
if [ -z "$icon" ] && [ -f "$script_dir/image2text.png" ]; then
  icon="$script_dir/image2text.png"
fi
if [ -z "$mode" ]; then
  if [ -n "$appimage" ]; then
    mode="user"
  else
    mode="system"
  fi
fi

lang_code="en"
case "${LANG:-}" in
  ko*|KO*) lang_code="ko" ;;
esac
want_desktop=1
want_menu=1

as_user() {
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    if command -v runuser >/dev/null 2>&1; then
      runuser -u "$SUDO_USER" -- env \
        ${DISPLAY:+DISPLAY="$DISPLAY"} \
        ${WAYLAND_DISPLAY:+WAYLAND_DISPLAY="$WAYLAND_DISPLAY"} \
        ${XDG_RUNTIME_DIR:+XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR"} \
        "$@"
      return
    fi
  fi
  "$@"
}

target_home() {
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    getent passwd "$SUDO_USER" | cut -d: -f6
  else
    printf '%s\n' "${HOME:-}"
  fi
}

desktop_dir() {
  home=$1
  dir="$home/Desktop"
  if [ -f "$home/.config/user-dirs.dirs" ]; then
    raw=$(sed -n 's/^XDG_DESKTOP_DIR="\(.*\)"/\1/p' "$home/.config/user-dirs.dirs" | head -n 1)
    raw=$(printf '%s\n' "$raw" | sed "s|^\$HOME|$home|")
    if [ -n "$raw" ]; then
      dir=$raw
    fi
  fi
  printf '%s\n' "$dir"
}

ask() {
  if [ "${DEBIAN_FRONTEND:-}" = "noninteractive" ]; then
    return 0
  fi
  if [ ! -t 0 ] && [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
    return 0
  fi

  picks=""
  if command -v zenity >/dev/null 2>&1 && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
    chosen=$(as_user zenity --list --radiolist --title="Image2Text" \
      --text="Choose the installation language. / 설치 언어를 선택하세요." \
      --column="" --column="Language" \
      $([ "$lang_code" = "en" ] && printf 'TRUE' || printf 'FALSE') "English" \
      $([ "$lang_code" = "ko" ] && printf 'TRUE' || printf 'FALSE') "한국어" \
      --height=220) || chosen="cancel"
    if [ "$chosen" = "cancel" ] || [ -z "$chosen" ]; then
      :
    elif [ "$chosen" = "한국어" ]; then
      lang_code="ko"
    else
      lang_code="en"
    fi

    if [ "$lang_code" = "ko" ]; then
      prompt="설치 후 만들 바로가기를 선택하세요."
      desktop_label="바탕화면에 바로가기 만들기"
      menu_label="시작 메뉴에 바로가기 만들기"
    else
      prompt="Choose which shortcuts to create after installation."
      desktop_label="Create a Desktop shortcut"
      menu_label="Create a Start Menu shortcut"
    fi
    picks=$(as_user zenity --list --checklist --title="Image2Text" --text="$prompt" \
      --column="" --column="Shortcut" \
      TRUE "$desktop_label" \
      TRUE "$menu_label" \
      --height=220 --separator="|") || picks="cancel"
  elif command -v whiptail >/dev/null 2>&1 && [ -t 0 ]; then
    chosen=$(whiptail --title "Image2Text" --radiolist "Choose the installation language. / 설치 언어를 선택하세요." 12 70 2 \
      "en" "English" $([ "$lang_code" = "en" ] && printf 'ON' || printf 'OFF') \
      "ko" "한국어" $([ "$lang_code" = "ko" ] && printf 'ON' || printf 'OFF') \
      3>&1 1>&2 2>&3) || chosen="cancel"
    if [ "$chosen" = "en" ] || [ "$chosen" = "ko" ]; then
      lang_code=$chosen
    fi
    if [ "$lang_code" = "ko" ]; then
      prompt="설치 후 만들 바로가기를 선택하세요."
      desktop_label="바탕화면에 바로가기 만들기"
      menu_label="시작 메뉴에 바로가기 만들기"
    else
      prompt="Choose which shortcuts to create after installation."
      desktop_label="Create a Desktop shortcut"
      menu_label="Create a Start Menu shortcut"
    fi
    picks=$(whiptail --title "Image2Text" --checklist "$prompt" 12 70 2 \
      "desktop" "$desktop_label" ON \
      "menu" "$menu_label" ON \
      3>&1 1>&2 2>&3) || picks="cancel"
  else
    return 0
  fi

  if [ "$picks" = "cancel" ]; then
    return 0
  fi
  want_desktop=0
  want_menu=0
  case "$picks" in
    *desktop*|*Desktop*|*바탕화면*) want_desktop=1 ;;
  esac
  case "$picks" in
    *menu*|*Start*|*시작*) want_menu=1 ;;
  esac
}

write_language() {
  dest=$1
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$lang_code" > "$dest"
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    chown "$SUDO_USER" "$dest" 2>/dev/null || true
  fi
}

menu_file() {
  for candidate in \
    /usr/share/applications/image2text.desktop \
    /usr/share/applications/Image2Text.desktop \
    /usr/share/applications/com.image2text.desktop.desktop \
    /usr/share/applications/com.image2text.app.desktop
  do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  find /usr/share/applications -maxdepth 1 \( -name '*image2text*.desktop' -o -name '*Image2Text*.desktop' \) 2>/dev/null | head -n 1
}

place_desktop_file() {
  src=$1
  dest=$2
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  chmod 644 "$dest"
  if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    chown "$SUDO_USER" "$dest" 2>/dev/null || true
  fi
}

ask

if [ "$mode" = "system" ]; then
  write_language /etc/image2text/install-language
  found=$(menu_file || true)
  if [ -n "$found" ]; then
    mkdir -p /usr/lib/image2text
    cp "$found" /usr/lib/image2text/image2text.desktop
  fi
  stored=/usr/lib/image2text/image2text.desktop
  if [ "$want_menu" = "1" ] && [ -f "$stored" ] && [ -z "$found" ]; then
    cp "$stored" /usr/share/applications/Image2Text.desktop
    found=/usr/share/applications/Image2Text.desktop
  fi
  if [ "$want_menu" != "1" ] && [ -n "$found" ]; then
    rm -f "$found"
  fi
  home=$(target_home || true)
  if [ -n "$home" ] && [ -f "$stored" ]; then
    desk=$(desktop_dir "$home")
    if [ "$want_desktop" = "1" ]; then
      mkdir -p "$desk"
      place_desktop_file "$stored" "$desk/Image2Text.desktop"
    else
      rm -f "$desk/Image2Text.desktop" "$home/Desktop/Image2Text.desktop"
    fi
  fi
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
  exit 0
fi

if [ ! -f "$appimage" ]; then
  echo "AppImage를 찾지 못했습니다. 이 스크립트와 같은 폴더에 두고 다시 실행하세요." >&2
  exit 1
fi
if [ ! -f "$icon" ]; then
  echo "image2text.png 아이콘을 찾지 못했습니다." >&2
  exit 1
fi

home=$(target_home)
if [ -z "$home" ]; then
  echo "홈 디렉터리를 찾지 못했습니다." >&2
  exit 1
fi
install_dir="$home/.local/opt/image2text"
icon_dir="$home/.local/share/icons/hicolor/256x256/apps"
mkdir -p "$install_dir" "$icon_dir" "$home/.local/share/applications" "$home/.config/image2text"
cp "$appimage" "$install_dir/Image2Text.AppImage"
chmod 755 "$install_dir/Image2Text.AppImage"
cp "$icon" "$icon_dir/image2text.png"
write_language "$home/.config/image2text/install-language"

desktop_body="$home/.local/share/applications/Image2Text.desktop"
cat > "$desktop_body" <<EOF
[Desktop Entry]
Type=Application
Name=Image2Text
Comment=이미지를 텍스트로 바꿉니다
Exec="$install_dir/Image2Text.AppImage"
Icon=$icon_dir/image2text.png
Terminal=false
Categories=Utility;
EOF
chmod 644 "$desktop_body"

if [ "$want_menu" != "1" ]; then
  rm -f "$desktop_body"
fi
desk=$(desktop_dir "$home")
if [ "$want_desktop" = "1" ]; then
  mkdir -p "$desk"
  cp "$home/.local/share/applications/Image2Text.desktop" "$desk/Image2Text.desktop" 2>/dev/null || cat > "$desk/Image2Text.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Image2Text
Comment=이미지를 텍스트로 바꿉니다
Exec="$install_dir/Image2Text.AppImage"
Icon=$icon_dir/image2text.png
Terminal=false
Categories=Utility;
EOF
  chmod 644 "$desk/Image2Text.desktop"
else
  rm -f "$desk/Image2Text.desktop" "$home/Desktop/Image2Text.desktop"
fi

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$home/.local/share/applications" >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$home/.local/share/icons/hicolor" >/dev/null 2>&1 || true
echo "Image2Text를 설치했습니다. 언어: $lang_code"
