#!/bin/sh
set -eu

PID_DIR="${CALL_PID_DIR:-/tmp/rtsp-call}"

stop_pidfile() {
  f="$1"
  if [ -f "$f" ]; then
    pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.2
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$f"
  fi
}

stop_pidfile "$PID_DIR/pull.pid"

# Only stop publish if we started it (not an external always-on RTSP server)
if [ -z "${ASSUME_EXTERNAL_RTSP_SERVER:-}" ]; then
  stop_pidfile "$PID_DIR/publish.pid"
fi

echo "call pipelines stopped"
