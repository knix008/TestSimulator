#!/bin/bash
# Runs after the .deb is unpacked (dpkg postinst).
#
# The generated .desktop file already declares the MIME type; this registers
# the type itself with shared-mime-info, installs the document icon under the
# name the MIME database expects, and makes CaptureMaster the default handler
# for .cmcap files. Every step is best-effort: a package install must never
# fail because a desktop database tool is missing.
set -u
APP_DIR="/opt/CaptureMaster"
RES="$APP_DIR/resources"
MIME_XML="$RES/capturemaster-mime.xml"
DESKTOP_ID="capturemaster.desktop"

# A reinstall over an older copy: dpkg replaces the files, but a stale
# registration must not linger.
rm -f /usr/share/mime/packages/capturemaster-mime.xml 2>/dev/null || true

if [ -f "$MIME_XML" ]; then
  mkdir -p /usr/share/mime/packages
  cp -f "$MIME_XML" /usr/share/mime/packages/capturemaster-mime.xml
fi

if [ -f "$RES/file.png" ]; then
  for size in 512 256 128 64 48; do
    dir="/usr/share/icons/hicolor/${size}x${size}/mimetypes"
    mkdir -p "$dir"
    cp -f "$RES/file.png" "$dir/application-x-capturemaster-capture.png"
  done
fi

command -v update-mime-database >/dev/null 2>&1 && update-mime-database /usr/share/mime >/dev/null 2>&1 || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
command -v xdg-mime >/dev/null 2>&1 && xdg-mime default "$DESKTOP_ID" application/x-capturemaster-capture >/dev/null 2>&1 || true

# The chrome-sandbox helper must be setuid root on kernels without
# unprivileged user namespaces (electron-builder does this too; harmless twice).
if [ -f "$APP_DIR/chrome-sandbox" ]; then
  chown root:root "$APP_DIR/chrome-sandbox" 2>/dev/null || true
  chmod 4755 "$APP_DIR/chrome-sandbox" 2>/dev/null || true
fi
exit 0
