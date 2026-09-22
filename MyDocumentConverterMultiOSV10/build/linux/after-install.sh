#!/bin/bash
# Registers the .mdcv project type with its own icon, and refreshes the
# desktop database so file managers show it straight away.
set -e
ICON_DIR=/usr/share/icons/hicolor/512x512
MIME_DIR=/usr/share/mime/packages
mkdir -p "$ICON_DIR/mimetypes" "$MIME_DIR"
RES="/opt/My Document Converter V1.0/resources"
if [ ! -d "$RES" ]; then RES="/opt/${productFilename}/resources"; fi
if [ -f "$RES/file-icon.png" ]; then
  cp "$RES/file-icon.png" "$ICON_DIR/mimetypes/application-x-mydocumentconverter.png"
fi
cat > "$MIME_DIR/mydocumentconverter.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-mydocumentconverter">
    <comment>My Document Converter project</comment>
    <comment xml:lang="ko">My Document Converter 프로젝트</comment>
    <glob pattern="*.mdcv"/>
    <icon name="application-x-mydocumentconverter"/>
  </mime-type>
</mime-info>
XML
update-mime-database /usr/share/mime >/dev/null 2>&1 || true
update-desktop-database >/dev/null 2>&1 || true
gtk-update-icon-cache -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
