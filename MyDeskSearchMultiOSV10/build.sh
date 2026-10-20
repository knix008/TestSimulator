#!/usr/bin/env bash
# Build the installer from the repository root.
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec bash "$here/scripts/build.sh" "$@"
