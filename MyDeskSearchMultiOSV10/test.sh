#!/usr/bin/env bash
# Run every feature test from the repository root.
set -euo pipefail
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec bash "$here/scripts/test.sh" "$@"
