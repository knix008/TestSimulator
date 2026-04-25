# GTK RTSP Player Server

`rtspserver` is a single GTK application that does both:
- local video playback
- RTSP server streaming

## Features
- Open local video file later with `Open` button
- Playback controls: `Play`, `Pause`, `Stop`
- Click video area to toggle pause/resume
- Pause/play overlay icons on the video
- Playback progress bar
- RTSP server UI controls in the window:
  - Port and mount-point input
  - `Start Server` / `Stop Server` buttons
  - Current RTSP URL label
  - RTSP log panel

## RTSP URL
Default URL:

`rtsp://127.0.0.1:8554/stream`

You can change port and mount in the GUI before starting the server.

## Build
```bash
make deps
make
```

## Run
```bash
make run
make run VIDEO=/absolute/path/to/video.mp4
```

## RTSP Client Test
After starting the server in the app window:

- VLC:
  - Open Media -> Network -> `rtsp://127.0.0.1:8554/stream`
- ffplay:
  ```bash
  ffplay -rtsp_transport tcp rtsp://127.0.0.1:8554/stream
  ```

If you changed port or mount in the app, use that URL instead.

## Dependencies
- GTK3
- GStreamer 1.0
- GStreamer RTSP Server
- GStreamer plugins (base/good/bad/ugly/libav)

## Notes
- On Linux, dependencies are installed by `make deps` using `apt`.
- On macOS, dependencies are installed by `make deps` using Homebrew.
- On macOS, install Xcode command line tools first:
  ```bash
  xcode-select --install
  ```
