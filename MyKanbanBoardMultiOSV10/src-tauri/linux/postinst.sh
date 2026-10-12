#!/bin/sh
# Registers the .mkanban document type and its icon.
update-mime-database /usr/share/mime >/dev/null 2>&1 || true
gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
exit 0
