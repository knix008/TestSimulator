#!/bin/bash
# Runs after the .deb is unpacked (dpkg postinst). Every step is best-effort:
# a package install must never fail because a desktop tool is missing.
set -u
APP_DIR="/opt/Command Center"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true

# The chrome-sandbox helper must be setuid root on kernels without
# unprivileged user namespaces (electron-builder does this too; harmless twice).
if [ -f "$APP_DIR/chrome-sandbox" ]; then
  chown root:root "$APP_DIR/chrome-sandbox" 2>/dev/null || true
  chmod 4755 "$APP_DIR/chrome-sandbox" 2>/dev/null || true
fi
exit 0
