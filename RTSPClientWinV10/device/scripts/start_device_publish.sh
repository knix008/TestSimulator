#!/bin/sh
# Publish device camera+mic on RTSP (GStreamer RTSP server helper).
#
# Env:
#   VIDEO_SRC, AUDIO_SRC, RTSP_PORT, RTSP_MOUNT
#   GST_RTSP_LAUNCH  - path to your gst-rtsp-server launcher (e.g. test-launch)
#   ASSUME_EXTERNAL_RTSP_SERVER=1 - skip launch if RTSP already running

set -eu

RTSP_PORT="${RTSP_PORT:-8554}"
RTSP_MOUNT="${RTSP_MOUNT:-/device}"
VIDEO_SRC="${VIDEO_SRC:-/dev/video0}"
AUDIO_SRC="${AUDIO_SRC:-hw:0,0}"
PID_DIR="${CALL_PID_DIR:-/tmp/rtsp-call}"
mkdir -p "$PID_DIR"

if [ -f "$PID_DIR/publish.pid" ] && kill -0 "$(cat "$PID_DIR/publish.pid")" 2>/dev/null; then
  echo "device publish already running"
  exit 0
fi

if [ -n "${ASSUME_EXTERNAL_RTSP_SERVER:-}" ]; then
  echo "ASSUME_EXTERNAL_RTSP_SERVER set — skipping publish launch"
  exit 0
fi

LAUNCH_BIN="${GST_RTSP_LAUNCH:-test-launch}"

# Adjust encoder for SoC: v4l2h264enc / mpph264enc / omxh264enc / x264enc
PIPELINE="( v4l2src device=${VIDEO_SRC} ! videoconvert ! video/x-raw,width=1280,height=720,framerate=30/1 ! x264enc tune=zerolatency speed-preset=ultrafast bitrate=1500 key-int-max=30 ! rtph264pay name=pay0 pt=96 alsasrc device=${AUDIO_SRC} ! audioconvert ! audioresample ! opusenc bitrate=64000 ! rtpopuspay name=pay1 pt=97 )"

if ! command -v "$LAUNCH_BIN" >/dev/null 2>&1; then
  echo "ERROR: '$LAUNCH_BIN' not found." >&2
  echo "Set GST_RTSP_LAUNCH to your RTSP server binary, or ASSUME_EXTERNAL_RTSP_SERVER=1." >&2
  exit 1
fi

"$LAUNCH_BIN" "$PIPELINE" &
echo $! > "$PID_DIR/publish.pid"
echo "started $LAUNCH_BIN mount=${RTSP_MOUNT} port=${RTSP_PORT}"
