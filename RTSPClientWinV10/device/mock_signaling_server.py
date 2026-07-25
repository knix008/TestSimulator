#!/usr/bin/env python3
"""
LAN mock of the Civetweb /api/call/* signaling API.
Use this to develop/test the Windows client without the embedded device.

  python device/mock_signaling_server.py --host 0.0.0.0 --port 8080

Optional: set DEVICE_RTSP_URL to a real camera RTSP URL for playback testing.
"""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


class CallState:
    def __init__(self, device_rtsp_url: str) -> None:
        self.lock = threading.Lock()
        self.state = "idle"
        self.session_id = ""
        self.device_rtsp_url = device_rtsp_url
        self.pc_rtsp_url = ""
        self.message = ""

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "ok": True,
                "state": self.state,
                "session_id": self.session_id,
                "device_rtsp_url": self.device_rtsp_url,
                "pc_rtsp_url": self.pc_rtsp_url,
                "message": self.message,
            }


def make_handler(state: CallState):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path == "/api/call/status":
                self._send(200, state.snapshot())
            else:
                self._send(404, {"ok": False, "message": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length", "0") or "0")
            raw = self.rfile.read(length) if length > 0 else b"{}"
            try:
                data = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                self._send(400, {"ok": False, "message": "invalid json"})
                return

            if path == "/api/call/start":
                pc_url = (data.get("pc_rtsp_url") or "").strip()
                if not pc_url:
                    self._send(400, {"ok": False, "state": "error", "message": "pc_rtsp_url required"})
                    return
                with state.lock:
                    if state.state == "active":
                        self._send(409, {"ok": False, "state": "active", "message": "call already active"})
                        return
                    state.state = "active"
                    state.session_id = f"sess-{int(time.time())}"
                    state.pc_rtsp_url = pc_url
                    state.message = "mock active (no GStreamer pull on this host)"
                    print(f"[mock] call start session={state.session_id} pc={pc_url}")
                    payload = {
                        "ok": True,
                        "state": "active",
                        "session_id": state.session_id,
                        "device_rtsp_url": state.device_rtsp_url,
                        "message": state.message,
                    }
                self._send(200, payload)
                return

            if path == "/api/call/hangup":
                with state.lock:
                    state.state = "idle"
                    state.session_id = ""
                    state.pc_rtsp_url = ""
                    state.message = "ended"
                    print("[mock] hangup")
                self._send(200, {"ok": True, "state": "idle", "message": "ended"})
                return

            self._send(404, {"ok": False, "message": "not found"})

        def log_message(self, fmt: str, *args) -> None:
            print("%s - %s" % (self.address_string(), fmt % args))

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Mock Civetweb call signaling server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument(
        "--device-rtsp-url",
        default=os.environ.get("DEVICE_RTSP_URL", "rtsp://127.0.0.1:8554/device"),
    )
    args = parser.parse_args()

    state = CallState(args.device_rtsp_url)
    httpd = ThreadingHTTPServer((args.host, args.port), make_handler(state))
    print(f"Mock signaling on http://{args.host}:{args.port}")
    print(f"device_rtsp_url = {args.device_rtsp_url}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
