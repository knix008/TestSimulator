#!/bin/bash
# Runs after the .deb is removed (dpkg postrm). User data under
# ~/.config/My Editor is deliberately left alone.
set -u
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
