#!/bin/bash
# Installs Image2Text.app from the same folder (the disk image).
# The user picks English or Korean, then chooses a Desktop alias and a Dock
# shortcut. On macOS the Dock is the Start menu shortcut.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
app="$here/Image2Text.app"
if [[ ! -d "$app" ]]; then
  echo "Image2Text.app 을 이 설치 스크립트와 같은 폴더에서 찾지 못했습니다." >&2
  exit 1
fi

default_item="English"
case "${LANG:-}" in
  ko*|KO*) default_item="한국어" ;;
esac

language=$(osascript <<APPLESCRIPT
set picked to choose from list {"English", "한국어"} with title "Image2Text" with prompt "Choose the installation language.
설치 언어를 선택하세요." default items {"${default_item}"}
if picked is false then
  return "cancel"
end if
return item 1 of picked
APPLESCRIPT
)

if [[ "$language" == "cancel" || -z "$language" ]]; then
  echo "설치를 취소했습니다."
  exit 0
fi

if [[ "$language" == "한국어" ]]; then
  code="ko"
  prompt="설치 후 만들 바로가기를 선택하세요. macOS의 시작 메뉴 바로가기는 Dock에 추가됩니다."
  desktop_label="바탕화면에 바로가기 만들기"
  menu_label="시작 메뉴에 바로가기 만들기"
else
  code="en"
  prompt="Choose which shortcuts to create after installation. On macOS the Start menu shortcut is added to the Dock."
  desktop_label="Create a Desktop shortcut"
  menu_label="Create a Start Menu shortcut"
fi

picks=$(osascript <<APPLESCRIPT
set picked to choose from list {"${desktop_label}", "${menu_label}"} with title "Image2Text" with prompt "${prompt}" default items {"${desktop_label}", "${menu_label}"} with multiple selections allowed
if picked is false then
  return "cancel"
end if
set AppleScript's text item delimiters to "|"
return picked as text
APPLESCRIPT
)

want_desktop=1
want_menu=1
if [[ "$picks" != "cancel" ]]; then
  want_desktop=0
  want_menu=0
  [[ "$picks" == *"바탕화면"* || "$picks" == *"Desktop"* ]] && want_desktop=1
  [[ "$picks" == *"시작"* || "$picks" == *"Start"* ]] && want_menu=1
fi

dest="$HOME/Applications/Image2Text.app"
mkdir -p "$HOME/Applications"
rm -rf "$dest"
cp -R "$app" "$dest"
xattr -dr com.apple.quarantine "$dest" 2>/dev/null || true

support="$HOME/Library/Application Support/com.image2text.app"
mkdir -p "$support"
printf '%s\n' "$code" > "$support/install-language.txt"
mkdir -p "$dest/Contents/Resources"
printf '%s\n' "$code" > "$dest/Contents/Resources/install-language.txt"

if [[ "$want_desktop" == "1" ]]; then
  rm -f "$HOME/Desktop/Image2Text" "$HOME/Desktop/Image2Text.app"
  osascript -e "tell application \"Finder\" to make alias file to POSIX file \"$dest\" at POSIX file \"$HOME/Desktop\"" >/dev/null
else
  rm -f "$HOME/Desktop/Image2Text" "$HOME/Desktop/Image2Text.app" "$HOME/Desktop/Image2Text alias"
fi

if [[ "$want_menu" == "1" ]]; then
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://${dest}/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>" || true
  killall Dock >/dev/null 2>&1 || true
fi

echo "Image2Text를 설치했습니다. 언어: $code"
