#!/usr/bin/env bash
# Prepares a Debian/Ubuntu machine (or WSL) to build MyISOMaker for Linux:
# the WebKitGTK/GTK development libraries Tauri compiles against, the ISO tools the tests use,
# and — when missing — Node.js 22 and Rust in the user's home folder.
#   bash scripts/setup-linux.sh        then   npm ci && npm run build:linux
set -euo pipefail
SUDO=''
if [ "$(id -u)" -ne 0 ]; then SUDO='sudo'; fi
$SUDO apt-get update
$SUDO apt-get install -y \
  build-essential curl file pkg-config \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
  libssl-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libxdo-dev \
  xorriso squashfs-tools fuseiso
# AppImage tools need FUSE 2 (renamed libfuse2t64 on Ubuntu 24.04)
$SUDO apt-get install -y libfuse2 || $SUDO apt-get install -y libfuse2t64
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  echo 'Rust installed: run  source "$HOME/.cargo/env"  or open a new shell.'
fi
echo 'Ready: npm ci && npm run build:linux'
