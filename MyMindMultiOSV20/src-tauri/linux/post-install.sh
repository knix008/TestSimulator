#!/bin/sh
# Makes the system learn the .mmap file type and its icon. A missing tool is not an error.
update-mime-database /usr/share/mime 2>/dev/null || true
gtk-update-icon-cache -q -t /usr/share/icons/hicolor 2>/dev/null || true
update-desktop-database -q /usr/share/applications 2>/dev/null || true
exit 0
