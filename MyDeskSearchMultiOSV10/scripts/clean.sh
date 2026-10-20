#!/usr/bin/env bash
# Remove build output: Cargo target, dist/, and installers copied to the repository root.
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$here/.." && pwd)
cd "$root"

cargo clean

if [ -d "$root/dist" ]; then
    rm -rf "$root/dist"
    printf 'Removed %s\n' "$root/dist"
fi

find "$root" -maxdepth 1 -type f \( \
    -name 'MyDeskSearch-*.zip' -o \
    -name 'MyDeskSearch-*-setup.exe' -o \
    -name 'MyDeskSearch-*.tar.gz' -o \
    -name 'MyDeskSearch-*.pkg' -o \
    -name 'mydesksearch_*.deb' -o \
    -name 'mydesksearch*_setup.exe' -o \
    -name 'mydesksearch*.msi' -o \
    -name 'DeskSearch-*.zip' -o \
    -name 'DeskSearch-*-setup.exe' \
    \) -print -delete

printf 'Clean finished.\n'
