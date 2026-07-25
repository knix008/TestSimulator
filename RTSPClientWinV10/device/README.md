# Device integration

## Civetweb

1. Copy `civetweb/call_api.c` and `call_api.h` into the firmware tree.
2. After `mg_start(...)`:

```c
#include "call_api.h"
/* ... */
call_api_register(ctx);
```

3. Link with pthread if not already linked.

## Scripts

Deploy `scripts/` to the device (e.g. `/opt/rtsp-call/scripts`) and `chmod +x`.

Tune for your board:

- Hardware H.264: replace `x264enc` with `v4l2h264enc` / `mpph264enc` / `omxh264enc`
- Display: `VIDEO_SINK=kmssink` or `waylandsink`
- Audio: correct `alsasrc` device

If RTSP is already always on:

```sh
export ASSUME_EXTERNAL_RTSP_SERVER=1
export CALL_DEVICE_RTSP_URL=rtsp://<device-ip>:8554/device
```

## Mock (PC)

```sh
python mock_signaling_server.py --port 8080
```
