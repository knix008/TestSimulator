#!/bin/sh
# Lets the desktop offer MyPhotoManager in "Open with" for images.
update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
