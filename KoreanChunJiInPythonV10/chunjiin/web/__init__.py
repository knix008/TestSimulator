"""웹 판 서버. `python -m chunjiin.web` 으로 띄운다. 표준 라이브러리만 쓴다."""

from chunjiin.web.server import main, make_server, snapshot

__all__ = ["main", "make_server", "snapshot"]
