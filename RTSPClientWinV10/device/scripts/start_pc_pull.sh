#!/bin/sh
# Pull PC RTSP stream and play on device display/speaker.
# Usage: start_pc_pull.sh rtsp://PC_IP:8554/pc

set -eu

PC_URL="${1:-}"
if [ -z "$PC_URL" ]; then
  echo "usage: $0 rtsp://host:port/mount" >&2
  exit 1
fi

PID_DIR="${CALL_PID_DIR:-/tmp/rtsp-call}"
mkdir -p "$PID_DIR"

if [ -f "$PID_DIR/pull.pid" ] && kill -0 "$(cat "$PID_DIR/pull.pid")" 2>/dev/null; then
  kill "$(cat "$PID_DIR/pull.pid")" 2>/dev/null || true
  sleep 0.3
fi

# Display sink: autovideosink / kmssink / waylandsink / fbdevsink depending on board.
VIDEO_SINK="${VIDEO_SINK:-autovideosink}"
AUDIO_SINK="${AUDIO_SINK:-autoaudiosink}"

gst-launch-1.0 -e \
  rtspsrc location="$PC_URL" latency=120 protocols=tcp name=src \
  src. ! application/x-rtp,media=video ! rtph264depay ! avdec_h264 ! videoconvert ! "$VIDEO_SINK" sync=false \
  src. ! application/x-rtp,media=audio ! decodebin ! audioconvert ! audioresample ! "$AUDIO_SINK" sync=false \
  &

echo $! > "$PID_DIR/pull.pid"
echo "pulling $PC_URL"
