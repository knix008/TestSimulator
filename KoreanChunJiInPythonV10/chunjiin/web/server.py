"""server.py - 웹 판을 띄우는 작은 서버.

    python -m chunjiin.web                       http://localhost:8080
    python -m chunjiin.web -addr 127.0.0.1:9000  다른 자리에서
    python -m chunjiin.web -addr :8080           같은 망의 다른 기기에도
    python -m chunjiin.web -dir web              다른 폴더의 화면을 쓴다
    python -m chunjiin.web -q                    요청 기록을 찍지 않는다

Rust 판은 엔진을 WASM 으로 만들어 브라우저 안에 넣었다. 파이썬은 브라우저에서
돌지 않으므로 그 자리를 이 서버가 대신한다.

    누름 -> POST /api/key -> 상태(JSON) -> render(상태)

조합은 하나도 자바스크립트에서 하지 않는다. 그래서 데스크톱 판과 결과가
어긋날 수 없다. 대신 오갈 것이 생겼으므로 두 가지를 챙긴다.

- 차례: 누른 차례가 곧 조합 차례이므로 app.js 가 요청을 한 줄로 잇는다.
- 세션: 브라우저 탭 하나에 입력기 하나를 쿠키로 매단다. 여러 사람이 같은
  서버에 붙어도 서로의 글이 섞이지 않는다. 오래 쓰지 않은 세션은 치운다.

`http.server` 하나로 정적 파일과 /api/* 를 함께 맡는다. 하는 일이
"파일 내려 주기 + 상태 한 벌" 뿐이라 서버 꾸러미를 들이지 않는다.
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import secrets
import sys
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from chunjiin.engine import KEY_COUNT, MODE_NAMES, InputMode, State

# 기본값은 이 컴퓨터에서만 열린다. 바깥에 열려면 -addr :8080 처럼 앞을
# 비워 준다. 기본값을 :8080 으로 두면 Windows 방화벽이 실행할 때마다
# 허용 여부를 묻는다.
DEFAULT_ADDR = "127.0.0.1:8080"

COOKIE = "chunjiin_session"
SESSION_TTL = 60 * 60  # 이만큼 쓰지 않은 세션은 치운다 (초)
MAX_BODY = 1 << 20  # 요청 본문 상한. 붙여넣기도 이보다 클 일은 없다.

_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
}


# ---------------------------------------------------------------------
# 순수한 셈 - 서버를 띄우지 않고 시험할 수 있다
# ---------------------------------------------------------------------


def site_dir():
    """웹 화면 파일이 있는 폴더다.

    PyInstaller 로 묶였으면 풀어 놓은 임시 폴더의 web/ 이고, 소스로 돌면
    저장소 루트의 web/ 이다.
    """
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return os.path.join(base, "web")
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, "web")


def clean_path(target):
    """요청 경로를 폴더 안의 상대 경로로 다듬는다.

    물음표 뒤는 버리고, `.` 은 없애고, `..` 은 한 단계 올라간다. 뿌리보다
    위로는 올라가지 못하므로 서버 밖의 파일은 내려 주지 않는다. 뿌리는
    index.html 이다.
    """
    path = urlsplit(target).path
    parts = []
    for p in path.split("/"):
        if not p or p == ".":
            continue
        if p == "..":
            if parts:
                parts.pop()
            continue
        parts.append(p)
    rel = posixpath.join(*parts) if parts else ""
    return rel or "index.html"


def mime_of(name):
    """파일 이름의 확장자로 형식을 정한다. 모르면 octet-stream 이다."""
    ext = os.path.splitext(name)[1].lower()
    return _MIME.get(ext, "application/octet-stream")


def parse_addr(addr):
    """`호스트:포트` 를 (호스트, 포트) 로 푼다. 호스트를 비우면 모든 이름에 연다."""
    host, _, port = addr.rpartition(":")
    if not port.isdigit():
        raise ValueError(f"주소를 읽지 못했다: {addr!r} (예: 127.0.0.1:8080, :8080)")
    return (host or "0.0.0.0", int(port))


def browse_url(addr):
    """브라우저에 열어 줄 주소다. 모든 이름에 열었어도 이 컴퓨터에서는 localhost 다."""
    host, port = parse_addr(addr)
    if host in ("0.0.0.0", "127.0.0.1", "", "::"):
        host = "localhost"
    return f"http://{host}:{port}"


def snapshot(s):
    """화면이 그리는 데 필요한 것을 한 벌로 만든다.

    칸 이름은 Rust 판 WASM 이 내보내던 것과 같다. 그래서 web/app.js 의
    그리는 쪽은 두 판에서 거의 같은 코드다.
    """
    return {
        "text": s.text(),
        "cursor": s.cursor_pos,
        "length": len(s),
        "mode": s.now_mode.index,
        "modeName": s.mode_name(),
        "modeNames": list(MODE_NAMES),
        "composition": s.composition_text(),
        "composing": s.now_mode == InputMode.HANGUL and s.hangul.flag_writing,
        "labels": [s.key_label(k) for k in range(KEY_COUNT)],
        "roles": [s.key_role_of(k).value for k in range(KEY_COUNT)],
    }


# ---------------------------------------------------------------------
# 동작 - /api/<이름> 하나가 엔진 메서드 하나다
# ---------------------------------------------------------------------


def _int(args, name, default=0):
    v = args.get(name, default)
    if isinstance(v, bool) or not isinstance(v, int):
        raise ValueError(f"{name} 은 정수여야 한다")
    return v


def _str(args, name):
    v = args.get(name, "")
    if not isinstance(v, str):
        raise ValueError(f"{name} 은 문자열이어야 한다")
    return v


ACTIONS = {
    "state": lambda s, a: None,
    "key": lambda s, a: s.key(_int(a, "i", -1)),
    "commit": lambda s, a: s.commit(),
    "space": lambda s, a: s.space(),
    "enter": lambda s, a: s.insert_char("\n"),
    "backspace": lambda s, a: s.backspace(),
    "del": lambda s, a: s.delete(),
    "clear": lambda s, a: s.clear(),
    "breakMultitap": lambda s, a: s.break_multitap(),
    "moveCursor": lambda s, a: s.move_cursor(_int(a, "delta")),
    "setCursor": lambda s, a: s.set_cursor(_int(a, "pos")),
    "setMode": lambda s, a: s.set_mode_index(_int(a, "mode")),
    "cycleMode": lambda s, a: s.cycle_mode(),
    "insertText": lambda s, a: s.insert_str(_str(a, "text")),
    "setText": lambda s, a: s.set_text(_str(a, "text")),
}


class Sessions:
    """쿠키 하나에 입력기 하나다. 오래 쓰지 않은 것은 치운다."""

    def __init__(self, ttl=SESSION_TTL):
        self.ttl = ttl
        self._lock = threading.Lock()
        self._by_id = {}  # id -> (State, 마지막으로 쓴 시각)

    def get(self, sid):
        """세션을 찾는다. 없거나 만료됐으면 새로 만들고 (id, State, 새로 만들었나) 다."""
        now = time.monotonic()
        with self._lock:
            self._sweep(now)
            if sid and sid in self._by_id:
                state = self._by_id[sid][0]
                self._by_id[sid] = (state, now)
                return sid, state, False
            sid = secrets.token_urlsafe(16)
            state = State()
            self._by_id[sid] = (state, now)
            return sid, state, True

    def _sweep(self, now):
        dead = [k for k, (_, t) in self._by_id.items() if now - t > self.ttl]
        for k in dead:
            del self._by_id[k]

    def __len__(self):
        with self._lock:
            return len(self._by_id)


# ---------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    """정적 파일과 /api/* 를 함께 맡는다. 세션 · 폴더는 서버 객체에서 가져온다."""

    protocol_version = "HTTP/1.1"
    server_version = "chunjiin-serve/1.0"

    def log_message(self, fmt, *args):
        if not self.server.quiet:
            super().log_message(fmt, *args)

    # -- 정적 파일 -------------------------------------------------------

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            return self._api(path[len("/api/") :], {})

        rel = clean_path(self.path)
        full = os.path.normpath(os.path.join(self.server.site, rel))
        # clean_path 가 .. 을 없앴으므로 밖으로 나갈 수 없지만, 한 번 더 본다.
        if not full.startswith(os.path.normpath(self.server.site)) or not os.path.isfile(full):
            return self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain; charset=utf-8")

        with open(full, "rb") as f:
            body = f.read()
        self._send(HTTPStatus.OK, body, mime_of(rel), cache="no-cache")

    # -- API -------------------------------------------------------------

    def do_POST(self):
        path = urlsplit(self.path).path
        if not path.startswith("/api/"):
            return self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain; charset=utf-8")

        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n > MAX_BODY:
            return self._send(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, b"too large", "text/plain")
        raw = self.rfile.read(n) if n > 0 else b""
        try:
            args = json.loads(raw.decode("utf-8")) if raw else {}
            if not isinstance(args, dict):
                raise ValueError("본문은 JSON 객체여야 한다")
        except (ValueError, UnicodeDecodeError) as e:
            return self._send(HTTPStatus.BAD_REQUEST, str(e).encode(), "text/plain; charset=utf-8")

        self._api(path[len("/api/") :], args)

    def _api(self, name, args):
        action = ACTIONS.get(name)
        if action is None:
            return self._send(HTTPStatus.NOT_FOUND, b"unknown action", "text/plain; charset=utf-8")

        sid, state, fresh = self.server.sessions.get(self._cookie())
        try:
            with self.server.lock:
                action(state, args)
                snap = snapshot(state)
        except ValueError as e:
            return self._send(HTTPStatus.BAD_REQUEST, str(e).encode(), "text/plain; charset=utf-8")

        body = json.dumps(snap, ensure_ascii=False).encode("utf-8")
        extra = {}
        if fresh:
            extra["Set-Cookie"] = f"{COOKIE}={sid}; Path=/; HttpOnly; SameSite=Strict"
        self._send(HTTPStatus.OK, body, "application/json; charset=utf-8", cache="no-store", **extra)

    def _cookie(self):
        raw = self.headers.get("Cookie") or ""
        for part in raw.split(";"):
            k, _, v = part.strip().partition("=")
            if k == COOKIE and v:
                return v
        return None

    def _send(self, status, body, mime, cache=None, **headers):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        if cache:
            self.send_header("Cache-Control", cache)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr, site, quiet):
        super().__init__(addr, Handler)
        self.site = site
        self.quiet = quiet
        self.sessions = Sessions()
        # 엔진은 잠금을 모른다. 요청 스레드가 여럿이라 여기서 한 번에 하나만 들인다.
        self.lock = threading.Lock()


def make_server(addr=DEFAULT_ADDR, site=None, quiet=False):
    """서버를 만들어 돌려준다. 아직 돌지는 않는다. `:0` 이면 빈 포트를 잡는다."""
    site = os.path.abspath(site or site_dir())
    if not os.path.isfile(os.path.join(site, "index.html")):
        raise FileNotFoundError(f"웹 화면을 찾지 못했다: {site}")
    return Server(parse_addr(addr), site, quiet)


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="chunjiin-serve", description="천지인 웹 판을 띄운다.", allow_abbrev=False
    )
    ap.add_argument("-addr", "--addr", default=DEFAULT_ADDR, help=f"들을 주소 (기본 {DEFAULT_ADDR})")
    ap.add_argument("-dir", "--dir", help="품고 있는 것 대신 이 폴더의 화면을 쓴다 (개발용)")
    ap.add_argument("-q", "--quiet", action="store_true", help="요청 기록을 찍지 않는다")
    ap.add_argument("-open", "--open", action="store_true", help="브라우저를 함께 연다")
    args = ap.parse_args(argv)

    try:
        server = make_server(args.addr, args.dir, args.quiet)
    except (ValueError, FileNotFoundError, OSError) as e:
        print(e, file=sys.stderr)
        return 2

    host, port = server.server_address[:2]
    url = browse_url(f"{host}:{port}")
    print(f"천지인 웹 판  {url}   (멈추려면 Ctrl+C)")
    if args.open:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


__all__ = [
    "ACTIONS",
    "DEFAULT_ADDR",
    "Sessions",
    "browse_url",
    "clean_path",
    "main",
    "make_server",
    "mime_of",
    "parse_addr",
    "site_dir",
    "snapshot",
]
