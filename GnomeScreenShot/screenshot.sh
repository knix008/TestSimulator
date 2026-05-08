#!/bin/bash
# Screenshot launcher with X11 backend to bypass Wayland security restrictions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GDK_BACKEND=x11
exec "${SCRIPT_DIR}/screenshot" "$@"
