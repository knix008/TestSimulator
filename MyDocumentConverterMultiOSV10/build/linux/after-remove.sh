#!/bin/bash
# Undoes after-install.sh: the project type and its icon go with the program.
rm -f /usr/share/mime/packages/mydocumentconverter.xml
rm -f /usr/share/icons/hicolor/512x512/mimetypes/application-x-mydocumentconverter.png
update-mime-database /usr/share/mime >/dev/null 2>&1 || true
update-desktop-database >/dev/null 2>&1 || true
gtk-update-icon-cache -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
