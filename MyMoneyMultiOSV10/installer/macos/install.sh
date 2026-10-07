#!/usr/bin/env bash
# MyMoney installer for macOS. Language, full reinstall, and saved-data prompt
# are implemented in installer/cli.js (installer/plan.js).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/installer/cli.js" --dest "${MYMONEY_DEST:-$HOME/Applications/MyMoney}" "$@"
