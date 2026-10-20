#!/usr/bin/env bash
# Build the installer for this operating system.
# Windows: scripts/build.ps1
# Linux:   packaging/linux/build.sh
# macOS:   packaging/macos/build.sh
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$here/.." && pwd)
case "$(uname -s)" in
    Linux)
        exec bash "$root/packaging/linux/build.sh" "$@"
        ;;
    Darwin)
        exec bash "$root/packaging/macos/build.sh" "$@"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$here/build.ps1"
        ;;
    *)
        printf 'Run scripts/build.ps1 on Windows, or scripts/build.sh on Linux or macOS.\n' >&2
        exit 1
        ;;
esac
