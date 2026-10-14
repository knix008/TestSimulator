#!/bin/sh
# Runs after the deb or rpm is unpacked. Icon caches are refreshed, then the
# user chooses the installer language and the desktop / applications-menu shortcuts.
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
if [ -f /usr/lib/image2text/install-choices.sh ]; then
  sh /usr/lib/image2text/install-choices.sh --system || true
fi
exit 0
