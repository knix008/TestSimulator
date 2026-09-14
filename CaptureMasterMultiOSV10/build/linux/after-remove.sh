#!/bin/bash
# Runs after the .deb is removed (dpkg postrm). Undoes after-install.sh.
# User data under ~/.config/CaptureMaster is deliberately left alone: the app
# itself asks whether to delete it the next time it is installed and started.
set -u
rm -f /usr/share/mime/packages/capturemaster-mime.xml 2>/dev/null || true
for size in 512 256 128 64 48; do
  rm -f "/usr/share/icons/hicolor/${size}x${size}/mimetypes/application-x-capturemaster-capture.png" 2>/dev/null || true
done
command -v update-mime-database >/dev/null 2>&1 && update-mime-database /usr/share/mime >/dev/null 2>&1 || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
