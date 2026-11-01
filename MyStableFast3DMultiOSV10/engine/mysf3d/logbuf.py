"""The engine's log: a ring buffer the app reads through /api/logs.

Everything ends up here: the engine's own messages, the output of the package
installer, and whatever libraries print to stdout / stderr (tee'd). Each line
also goes to the real stdout so a launcher that started the engine in a
terminal sees it.
"""

import collections
import io
import sys
import threading
import time

LEVELS = ("debug", "info", "warn", "error")


class LogBuffer:
    def __init__(self, capacity=5000, echo=None):
        self._lines = collections.deque(maxlen=capacity)
        self._seq = 0
        self._lock = threading.Lock()
        self._echo = echo

    def add(self, level, msg, src="engine"):
        if level not in LEVELS:
            level = "info"
        text = str(msg).rstrip()
        if not text:
            return None
        with self._lock:
            self._seq += 1
            line = {
                "seq": self._seq,
                "t": int(time.time() * 1000),
                "level": level,
                "src": src,
                "msg": text,
            }
            self._lines.append(line)
        if self._echo is not None:
            try:
                self._echo.write(f"[{level}] {text}\n")
                self._echo.flush()
            except Exception:
                pass
        return line

    def info(self, msg, src="engine"):
        return self.add("info", msg, src)

    def warn(self, msg, src="engine"):
        return self.add("warn", msg, src)

    def error(self, msg, src="engine"):
        return self.add("error", msg, src)

    def debug(self, msg, src="engine"):
        return self.add("debug", msg, src)

    def since(self, after=0, limit=2000):
        """Lines with seq > after (oldest first) and the seq to ask from next."""
        with self._lock:
            out = [line for line in self._lines if line["seq"] > after]
            last = self._seq
        if len(out) > limit:
            out = out[-limit:]
        return out, last

    @property
    def last_seq(self):
        with self._lock:
            return self._seq


class TeeStream(io.TextIOBase):
    """A stdout / stderr replacement that also feeds the log buffer.

    Progress bars rewrite their line with \\r; only the text after the last \\r
    of a line is kept, so a finished bar becomes one line instead of hundreds.
    """

    def __init__(self, log, level, src):
        super().__init__()
        self._log = log
        self._level = level
        self._src = src
        self._pending = ""
        self._lock = threading.Lock()

    def writable(self):
        return True

    def write(self, s):
        if not isinstance(s, str):
            s = str(s)
        with self._lock:
            self._pending += s
            *done, rest = self._pending.split("\n")
            self._pending = rest[-4000:]
        for line in done:
            line = line.rsplit("\r", 1)[-1]
            if line.strip():
                self._log.add(self._level, line, self._src)
        return len(s)

    def flush(self):
        pass

    def isatty(self):
        return False


def install_tee(log):
    """Routes print() and library output into the log. The log's own echo goes
    to the original stdout, so nothing is printed twice."""
    sys.stdout = TeeStream(log, "info", "py")
    sys.stderr = TeeStream(log, "warn", "py")
