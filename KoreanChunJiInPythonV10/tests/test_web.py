"""웹 판 시험.

서버를 임의 포트로 실제로 띄워 놓고 두드려 본다. 화면 파일이 잘 내려오는지,
API 가 데스크톱 판과 같은 결과를 내는지, 서버 밖으로 새지 않는지를 본다.
"""

from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request

from chunjiin import testkit as kit
from chunjiin.engine import KEY_COUNT
from chunjiin.web.server import (
    browse_url,
    clean_path,
    make_server,
    mime_of,
    parse_addr,
    site_dir,
    snapshot,
)
from tests.common import State, run_keys

GROUP = "웹 판"


# ---------------------------------------------------------------------
# 순수한 셈 - 서버를 띄우지 않고 본다
# ---------------------------------------------------------------------


def test_paths_and_mime():
    tally = kit.Tally()
    section = "경로 · 형식"

    for target, want in (
        ("/", "index.html"),
        ("/index.html", "index.html"),
        ("/app.js?v=2", "app.js"),
        # 서버 밖으로 나가려는 시도는 막힌다.
        ("/../../etc/passwd", "etc/passwd"),
        ("/a/../b.css", "b.css"),
        ("/./x/./y.png", "x/y.png"),
        ("/..", "index.html"),
    ):
        got = clean_path(target)
        tally.add(kit.check(got == want, GROUP, section, target, got))

    for name, want in (
        ("app.js", "text/javascript; charset=utf-8"),
        ("style.css", "text/css; charset=utf-8"),
        ("index.html", "text/html; charset=utf-8"),
        ("chunjiin.png", "image/png"),
        ("무엇", "application/octet-stream"),
    ):
        got = mime_of(name)
        tally.add(kit.check(got == want, GROUP, section, f"형식 {name}", got))

    for addr, want in (
        ("127.0.0.1:8080", "http://localhost:8080"),
        (":8080", "http://localhost:8080"),
        ("0.0.0.0:9000", "http://localhost:9000"),
        ("192.168.0.5:80", "http://192.168.0.5:80"),
    ):
        got = browse_url(addr)
        tally.add(kit.check(got == want, GROUP, section, f"주소 {addr}", got))

    tally.add(
        kit.check(
            parse_addr(":8080") == ("0.0.0.0", 8080),
            GROUP,
            section,
            "앞을 비우면",
            "모든 이름에 연다",
        )
    )

    tally.assert_clean("경로 · 형식")


def test_snapshot_matches_engine():
    """상태 객체가 화면이 필요로 하는 것을 다 담고 있는지 본다."""
    tally = kit.Tally()
    section = "상태 객체"

    s = State()
    run_keys(s, "301")
    snap = snapshot(s)

    want_keys = {
        "text",
        "cursor",
        "length",
        "mode",
        "modeName",
        "modeNames",
        "composition",
        "composing",
        "labels",
        "roles",
    }
    tally.add(
        kit.check(
            set(snap) == want_keys,
            GROUP,
            section,
            "칸 이름",
            " · ".join(sorted(snap)),
        )
    )
    tally.add(
        kit.check(
            snap["text"] == s.text()
            and snap["cursor"] == s.cursor_pos
            and snap["length"] == len(s)
            and snap["composition"] == s.composition_text(),
            GROUP,
            section,
            "엔진과 같은 값",
            f"{snap['text']!r} @{snap['cursor']} · {snap['composition']}",
        )
    )
    tally.add(
        kit.check(
            len(snap["labels"]) == KEY_COUNT and len(snap["roles"]) == KEY_COUNT,
            GROUP,
            section,
            "12키 라벨 · 역할",
            f"{len(snap['labels'])} · {len(snap['roles'])}",
        )
    )
    tally.add(
        kit.check(
            set(snap["roles"]) <= {"cons", "vowel", "mod"},
            GROUP,
            section,
            "역할 이름",
            " · ".join(sorted(set(snap["roles"]))),
        )
    )
    # JSON 으로 만들었다 풀어도 같아야 한다.
    tally.add(
        kit.check(
            json.loads(json.dumps(snap, ensure_ascii=False)) == snap,
            GROUP,
            section,
            "JSON 왕복",
            "값이 그대로다",
        )
    )

    tally.assert_clean("상태 객체")


def test_site_files_exist():
    """웹 화면 파일이 다 있는지 본다. 하나라도 없으면 흰 창이 뜬다."""
    tally = kit.Tally()
    section = "화면 파일"

    root = site_dir()
    for name in ("index.html", "app.js", "style.css", "chunjiin.png"):
        path = os.path.join(root, name)
        exists = os.path.isfile(path)
        size = os.path.getsize(path) if exists else 0
        tally.add(kit.check(exists and size > 0, GROUP, section, name, f"{size} 바이트"))

    # app.js 는 모듈이 아니어야 한다. WASM 을 들여오던 자리가 남아 있으면
    # 브라우저가 조용히 멎는다.
    js = open(os.path.join(root, "app.js"), encoding="utf-8").read()
    tally.add(
        kit.check(
            "chunjiin_wasm" not in js and "import " not in js,
            GROUP,
            section,
            "WASM 자국 없음",
            "서버 API 만 쓴다",
        )
    )
    html = open(os.path.join(root, "index.html"), encoding="utf-8").read()
    tally.add(
        kit.check(
            'type="module"' not in html and 'src="app.js"' in html,
            GROUP,
            section,
            "index.html 이음새",
            "평범한 script 하나",
        )
    )

    tally.assert_clean("화면 파일")


# ---------------------------------------------------------------------
# 서버를 실제로 띄워 본다
# ---------------------------------------------------------------------


class _Client:
    """쿠키를 들고 다니는 아주 작은 클라이언트다."""

    def __init__(self, base):
        self.base = base
        self.cookie = None

    def _open(self, req):
        if self.cookie:
            req.add_header("Cookie", self.cookie)
        with urllib.request.urlopen(req, timeout=10) as r:
            got = r.headers.get("Set-Cookie")
            if got:
                self.cookie = got.split(";")[0]
            return r.status, r.headers.get("Content-Type"), r.read()

    def get(self, path):
        return self._open(urllib.request.Request(self.base + path))

    def call(self, name, args=None):
        req = urllib.request.Request(
            self.base + "api/" + name,
            data=json.dumps(args or {}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return json.loads(self._open(req)[2].decode("utf-8"))


def test_server_roundtrip():
    tally = kit.Tally()
    section = "서버"

    server = make_server(":0", quiet=True)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        c = _Client(f"http://127.0.0.1:{port}/")

        for path, want_mime in (
            ("", "text/html; charset=utf-8"),
            ("app.js", "text/javascript; charset=utf-8"),
            ("style.css", "text/css; charset=utf-8"),
            ("chunjiin.png", "image/png"),
        ):
            status, mime, body = c.get(path)
            ok = status == 200 and mime == want_mime and len(body) > 0
            tally.add(
                kit.check(
                    ok, GROUP, section, f"GET /{path or '(뿌리)'}", f"{status} {mime} {len(body)}B"
                )
            )

        # 같은 키 시퀀스를 엔진에 바로 넣은 것과 서버를 거친 것이 같아야 한다.
        seq = (3, 0, 1, 4)
        for k in seq:
            snap = c.call("key", {"i": k})
        snap = c.call("commit")

        direct = State()
        for k in seq:
            direct.key(k)
        direct.commit()

        tally.add(
            kit.check(
                snap["text"] == direct.text(),
                GROUP,
                section,
                "서버와 엔진이 같다",
                f"{snap['text']!r} == {direct.text()!r}",
            )
        )

        snap = c.call("cycleMode")
        tally.add(
            kit.check(
                snap["mode"] == 1 and snap["labels"][0] == "abc",
                GROUP,
                section,
                "모드 순환",
                f"{snap['mode']} {snap['modeName']}",
            )
        )
        snap = c.call("setMode", {"mode": 0})
        snap = c.call("insertText", {"text": "붙여넣기"})
        tally.add(
            kit.check(
                snap["text"].endswith("붙여넣기"),
                GROUP,
                section,
                "붙여넣기",
                repr(snap["text"]),
            )
        )
        snap = c.call("setText", {"text": "새 글"})
        tally.add(
            kit.check(
                snap["text"] == "새 글" and snap["cursor"] == 3,
                GROUP,
                section,
                "통째로 갈아 끼우기",
                f"{snap['text']!r} @{snap['cursor']}",
            )
        )

        # 다른 브라우저(쿠키 없음)는 글이 섞이지 않아야 한다.
        other = _Client(f"http://127.0.0.1:{port}/")
        fresh = other.call("state")
        mine = c.call("state")
        tally.add(
            kit.check(
                fresh["text"] == "" and mine["text"] == "새 글",
                GROUP,
                section,
                "세션이 갈린다",
                f"새 손님 {fresh['text']!r} · 나 {mine['text']!r}",
            )
        )

        # 서버 밖으로 나가려는 시도와 모르는 동작은 404 다.
        for what, fn in (
            ("바깥 파일", lambda: c.get("../../chunjiin/engine/input.py")),
            ("모르는 동작", lambda: c.call("nope")),
        ):
            try:
                fn()
                code = 200
            except urllib.error.HTTPError as e:
                code = e.code
            tally.add(kit.check(code == 404, GROUP, section, what, f"{code}"))

    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    tally.assert_clean("서버")


def test_browser_ui():
    """웹 화면(app.js)을 브라우저 없이 실제로 돌려 본다.

    브라우저를 내려받지 않고도 배선이 성한지 본다. `tests/webui.mjs` 가
    아주 작은 DOM 을 흉내 내고 진짜 서버에 붙여 키를 눌러 본다. 그것이
    남긴 `@@CASE` 줄을 그대로 우리 보고서에 옮긴다.

    Node 가 없으면 건너뛴다. 여기서 잡으려는 것은 조합 결과가 아니라
    화면이 멎지 않는가이고, 조합은 엔진 시험이 이미 전수로 본다.
    """
    import shutil
    import subprocess

    section = "브라우저 없이 화면 돌리기"

    node = shutil.which("node")
    if not node:
        kit.check(True, GROUP, section, "건너뜀", "node 가 없다")
        return

    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)

    server = make_server(":0", quiet=True)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        out = subprocess.run(
            [node, os.path.join("tests", "webui.mjs"), f"http://127.0.0.1:{port}/"],
            cwd=root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    # 화면 쪽이 남긴 줄을 그대로 옮긴다. 보고기가 알아본다.
    lines = [ln for ln in (out.stdout or "").splitlines() if kit.MARK in ln]
    for ln in lines:
        print(ln)

    if not lines:
        kit.check(
            False,
            GROUP,
            section,
            "돌지 않았다",
            (out.stderr or "").strip().replace("\n", " ")[:200] or "남긴 줄이 없다",
        )
        raise AssertionError("웹 화면 시험이 아무것도 남기지 않았다")

    assert out.returncode == 0, (
        f"웹 화면 시험이 실패했다 (exit {out.returncode})\n"
        f"{(out.stderr or '').strip()[:2000]}"
    )
