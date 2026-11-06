#!/bin/sh
# Tell the desktop about the file types and their icons.
update-mime-database /usr/share/mime >/dev/null 2>&1 || true
update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
gtk-update-icon-cache -q -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
