#!/bin/sh
rm -f /etc/image2text/install-language
rmdir /etc/image2text 2>/dev/null || true
rm -f /usr/lib/image2text/image2text.desktop
rmdir /usr/lib/image2text 2>/dev/null || true

remove_for() {
  home=$1
  [ -n "$home" ] && [ -d "$home" ] || return 0
  rm -f "$home/Desktop/Image2Text.desktop"
  rm -f "$home/.local/share/applications/Image2Text.desktop"
  if [ -f "$home/.config/user-dirs.dirs" ]; then
    desk=$(sed -n 's/^XDG_DESKTOP_DIR="\(.*\)"/\1/p' "$home/.config/user-dirs.dirs" | head -n 1)
    desk=$(printf '%s' "$desk" | sed "s|\$HOME|$home|")
    [ -n "$desk" ] && rm -f "$desk/Image2Text.desktop"
  fi
}

if [ -n "${SUDO_USER:-}" ]; then
  home=$(getent passwd "$SUDO_USER" 2>/dev/null | cut -d: -f6)
  remove_for "$home"
fi
exit 0
