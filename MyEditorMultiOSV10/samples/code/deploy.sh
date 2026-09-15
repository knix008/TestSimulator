#!/usr/bin/env bash
# Shell — functions, conditionals, loops
set -euo pipefail

TARGET="${1:-dist}"
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

if [[ ! -d "$TARGET" ]]; then
  log "creating $TARGET"
  mkdir -p "$TARGET"
fi

for f in *.txt; do
  [[ -e "$f" ]] || continue
  cp -- "$f" "$TARGET/"
  log "copied $f"
done
log "done"
