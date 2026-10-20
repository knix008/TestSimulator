#!/usr/bin/env bash
# Remove build output from the repository root.
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec bash "$here/scripts/clean.sh" "$@"
