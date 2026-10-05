#!/bin/sh
# Remove a previous MyMerge install, then ask before deleting saved data.
if [ -d /opt/MyMerge ]; then
  rm -rf /opt/MyMerge
fi
DATA="${XDG_CONFIG_HOME:-$HOME/.config}/MyMerge"
if [ -d "$DATA" ]; then
  answer=""
  if command -v zenity >/dev/null 2>&1 && [ -n "$DISPLAY" ]; then
    if zenity --question --title="MyMerge" --text="저장된 데이터가 있습니다. 삭제하시겠습니까?
Saved data was found. Do you want to delete it?"; then
      answer=yes
    else
      answer=no
    fi
  elif [ -t 0 ]; then
    printf "Saved data was found. Do you want to delete it? / 저장된 데이터가 있습니다. 삭제하시겠습니까? [y/N] "
    read answer
  fi
  case "$answer" in
    y|Y|yes|YES) rm -rf "$DATA" ;;
  esac
fi
