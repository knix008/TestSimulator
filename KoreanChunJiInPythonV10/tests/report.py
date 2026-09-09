"""시험을 돌리고 결과를 구역별로 정리해 보여 준다.

Rust 판 `crates/testreport` 에 해당한다. 다만 저쪽은 `cargo test` 를 따로
띄워 그 출력을 읽었지만, 여기서는 시험 함수를 곧바로 불러 표준 출력만
가로챈다. 파이썬은 시험 틀을 밖에서 들여올 필요가 없기 때문이다.

pytest 를 깔지 않아도 돈다. 시험 파일은 `tests/test_*.py` 이고, 그 안의
`test_*` 함수를 이름 차례대로 부른다. 각 함수는 `chunjiin.testkit` 의
`check()` 로 항목마다 한 줄을 남기고, 여기서 그것을 모은다.

    python -m tests.report              구역별 집계와 요약
    python -m tests.report -v           항목마다 한 줄씩
    python -m tests.report -run 낱말    이름이 맞는 것만
    python -m tests.report --no-color   색을 쓰지 않는다

색은 화면으로 나갈 때만 쓴다. 파일이나 파이프로 흘려보낼 때 색 부호가
섞이면 읽기 나쁘기 때문이다. `--color` / `--no-color` 로 못박을 수 있고
`NO_COLOR` · `FORCE_COLOR` 환경 변수도 따른다.

칸은 **눈에 보이는 폭**으로 맞춘다. 한글은 터미널에서 두 칸을 차지하므로
글자 수로 채우면 세로로 어긋난다. 폭은 묶음 전체를 한꺼번에 재므로 묶음이
달라도 숫자 열이 같은 자리에 선다.
"""

from __future__ import annotations

import argparse
import contextlib
import importlib
import io
import os
import pkgutil
import sys
import traceback
import unicodedata
from dataclasses import dataclass

MARK = "@@CASE"


# ---------------------------------------------------------------------
# 칸 맞추기
#
# 한글은 터미널에서 두 칸을 차지한다. 그래서 파이썬의 `"{:<28}"` 처럼
# **글자 수**로 채우면 한글이 섞인 이름들이 세로로 어긋난다. 눈에 보이는
# 폭으로 세어 직접 채운다.
# ---------------------------------------------------------------------


def width(text):
    """터미널에서 차지하는 칸 수다."""
    return sum(
        2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in text
    )


def pad(text, cols, right=False):
    """`cols` 칸이 되도록 빈칸을 채운다. 넘치면 그대로 둔다."""
    room = max(0, cols - width(text))
    return (" " * room + text) if right else (text + " " * room)


# ---------------------------------------------------------------------
# 색
# ---------------------------------------------------------------------


class Ink:
    """ANSI 색이다. 켤 수 없으면 모두 빈 문자열이 된다."""

    def __init__(self, on):
        self.on = on

    def _(self, code, text):
        return f"\033[{code}m{text}\033[0m" if self.on else text

    def bold(self, t):
        return self._("1", t)

    def dim(self, t):
        return self._("2", t)

    def green(self, t):
        return self._("32", t)

    def red(self, t):
        return self._("1;31", t)

    def cyan(self, t):
        return self._("1;36", t)

    def yellow(self, t):
        return self._("33", t)


def color_enabled(choice=None):
    """색을 켤지 정한다.

    `--color` / `--no-color` 가 먼저고, 그 다음이 `NO_COLOR` ·
    `FORCE_COLOR` 같은 흔한 환경 변수다. 아무 말이 없으면 화면으로 나갈
    때만 켠다. 파일이나 파이프로 흘려보낼 때 색 부호가 섞이면 읽기 나쁘다.
    """
    if choice is not None:
        return choice
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR") or os.environ.get("CLICOLOR_FORCE"):
        return True
    if not (hasattr(sys.stdout, "isatty") and sys.stdout.isatty()):
        return False
    return _enable_windows_vt()


def _enable_windows_vt():
    """옛 Windows 콘솔은 색 부호를 켜 주어야 알아듣는다.

    Windows Terminal 은 이미 켜져 있고, 옛 conhost 는 여기서 켠다.
    켜지지 않으면 색을 쓰지 않는다. 부호가 글자로 찍히느니 낫다.
    """
    if sys.platform != "win32":
        return True
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
        mode = ctypes.c_uint32()
        if not kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            return False
        enable_vt = 0x0004  # ENABLE_VIRTUAL_TERMINAL_PROCESSING
        if mode.value & enable_vt:
            return True
        return bool(kernel32.SetConsoleMode(handle, mode.value | enable_vt))
    except (OSError, AttributeError):
        return False


@dataclass
class Case:
    """시험이 남긴 줄에서 뽑아낸 항목 하나다."""

    passed: bool
    # 큰 묶음. "조합 엔진 · C++ 원본에서 뽑아 온 자료" 같은 것
    group: str
    # 구역. "모음 전이표 전수" 같은 것
    section: str
    name: str
    # 무엇을 눌러 무엇이 나와야 하는지
    detail: str


def parse_line(line):
    """시험이 남긴 한 줄을 푼다. 우리 줄이 아니면 None 이다.

        @@CASE<탭>ok<탭>묶음<탭>구역<탭>이름<탭>설명

    시험 함수는 보통 글도 함께 찍으므로 줄 처음이 아니라 표시가 나오는
    자리부터 읽는다.
    """
    at = line.find(MARK)
    if at < 0:
        return None

    f = line[at + len(MARK):].split("\t")
    # 맨 앞은 표시 바로 뒤의 빈 칸이다.
    if len(f) < 6:
        return None

    return Case(f[1] == "ok", f[2], f[3], f[4], f[5])


class Report:
    """모은 항목들이다. 나온 차례를 그대로 지킨다."""

    def __init__(self):
        self.cases = []
        # 시험 함수가 통째로 넘어진 경우다. 항목 집계와 따로 모은다.
        self.crashes = []

    def add(self, c):
        self.cases.append(c)

    @property
    def total(self):
        return len(self.cases)

    @property
    def failed(self):
        return sum(1 for c in self.cases if not c.passed)

    @property
    def passed(self):
        return sum(1 for c in self.cases if c.passed)

    def retain(self, word):
        """이름 · 구역 · 묶음에 낱말이 들어간 것만 남긴다."""
        self.cases = [
            c
            for c in self.cases
            if word in c.name or word in c.section or word in c.group
        ]

    def _groups(self):
        """묶음과 구역을 나온 차례대로 돌려준다."""
        out = []
        for c in self.cases:
            for group, sections in out:
                if group == c.group:
                    if c.section not in sections:
                        sections.append(c.section)
                    break
            else:
                out.append((c.group, [c.section]))
        return out

    def _in_section(self, group, section):
        return [c for c in self.cases if c.group == group and c.section == section]

    # 구역 이름 칸의 최소 폭이다. 이름이 짧아도 숫자 열이 들쭉날쭉하지
    # 않게 바닥을 깔아 둔다.
    NAME_MIN = 26
    # 합계 줄에 쓰는 이름이다. 칸 폭을 잴 때 함께 센다.
    TOTAL_LABEL = "묶음 합계"

    def _columns(self):
        """이름 칸과 숫자 칸의 폭을 미리 잰다.

        **모든 묶음을 한꺼번에 재서** 묶음이 달라도 숫자 열이 같은 자리에
        서게 한다. 묶음마다 따로 재면 위아래로 어긋난다.
        """
        names = [c.section for c in self.cases] + [self.TOTAL_LABEL]
        name_w = max([self.NAME_MIN] + [width(n) for n in names])
        # 항목 이름 칸도 같은 뜻으로 한꺼번에 잰다(-v 로 펼쳤을 때).
        case_w = max([self.NAME_MIN] + [width(c.name) for c in self.cases])

        totals = []
        for group, sections in self._groups():
            g_total = 0
            for section in sections:
                n = len(self._in_section(group, section))
                totals.append(n)
                g_total += n
            totals.append(g_total)
        num_w = max(len(str(t)) for t in totals) if totals else 1
        return name_w, case_w, num_w

    def print(self, verbose=False, ink=None):
        """구역별 집계와 요약을 찍는다."""
        if not self.cases and not self.crashes:
            return

        ink = ink or Ink(False)
        name_w, case_w, num_w = self._columns()
        # 표 한 줄의 폭. 가르는 줄을 여기에 맞춘다.
        rule = 2 + 4 + 2 + name_w + 2 + num_w * 2 + 1
        rule = max(rule, 60)

        print()
        print(ink.bold("천지인 한글 입력기 - 시험"))
        print(ink.dim("═" * rule))

        for group, sections in self._groups():
            g_pass = g_total = 0
            print()
            print(ink.cyan(f"[ {group} ]"))

            for section in sections:
                rows = self._in_section(group, section)
                npass = sum(1 for c in rows if c.passed)
                g_pass += npass
                g_total += len(rows)
                ok = npass == len(rows)

                mark = ink.green(" ok ") if ok else ink.red("FAIL")
                count = f"{pad(str(npass), num_w, right=True)}/{pad(str(len(rows)), num_w)}"
                line = f"  {mark}  {pad(section, name_w)}  "
                print(line + (ink.dim(count) if ok else ink.red(count)))

                if verbose:
                    for c in rows:
                        m = ink.green("·") if c.passed else ink.red("✗")
                        name = pad(c.name, case_w)
                        print(f"        {m} {name}  {ink.dim(c.detail)}")

            print(
                ink.dim(f"  {'':4}  {pad(self.TOTAL_LABEL, name_w)}  ")
                + ink.bold(
                    f"{pad(str(g_pass), num_w, right=True)}/{pad(str(g_total), num_w)}"
                )
            )

        # 틀린 것이 있으면 어느 구역의 어느 항목이 왜 틀렸는지 따로 모은다.
        bad = [c for c in self.cases if not c.passed]
        if bad:
            print()
            print(ink.dim("─" * rule))
            print(ink.red(f"틀린 항목 {len(bad)}"))
            for c in bad:
                print(f"  {ink.yellow(c.group + ' · ' + c.section + ' · ' + c.name)}")
                print(f"      {c.detail}")

        if self.crashes:
            print()
            print(ink.dim("─" * rule))
            print(ink.red(f"넘어진 시험 {len(self.crashes)}"))
            for where, err in self.crashes:
                print(f"  {ink.yellow(where)}")
                for line in err.rstrip().splitlines():
                    print(f"      {ink.dim(line)}")

        clean = self.failed == 0 and not self.crashes
        print()
        print(ink.dim("═" * rule))
        verdict = "모두 통과" if clean else "실패"
        head = ink.green(pad(verdict, 10)) if clean else ink.red(pad(verdict, 10))
        tail = f"{self.total} 항목 중 {self.passed} 통과, {self.failed} 실패"
        print(head + " " + (tail if clean else ink.red(tail)))
        print()


# ---------------------------------------------------------------------
# 시험 찾아 돌리기
# ---------------------------------------------------------------------


def find_tests(package="tests"):
    """`tests/test_*.py` 안의 `test_*` 함수를 모두 찾는다.

    파일 차례는 이름 순, 함수 차례는 파일에 적힌 순이다. 구역이 원본에
    나온 차례대로 보이게 하려면 적힌 순을 지켜야 한다.
    """
    pkg = importlib.import_module(package)
    found = []
    for info in sorted(
        pkgutil.iter_modules(pkg.__path__), key=lambda m: m.name
    ):
        if not info.name.startswith("test_"):
            continue
        mod = importlib.import_module(f"{package}.{info.name}")
        names = [n for n in vars(mod) if n.startswith("test_")]
        # 정의된 차례를 지킨다. 함수는 코드 줄 번호로 세운다.
        names.sort(key=lambda n: getattr(vars(mod)[n], "__code__").co_firstlineno)
        for n in names:
            found.append((f"{info.name}.{n}", vars(mod)[n]))
    return found


def run(word=None, verbose=False):
    """시험을 다 돌리고 보고서를 돌려준다."""
    report = Report()

    for where, fn in find_tests():
        buf = io.StringIO()
        crashed = None
        try:
            with contextlib.redirect_stdout(buf):
                fn()
        except AssertionError:
            # 시험 함수는 끝에서 한 번만 assert 한다. 어느 항목이 틀렸는지는
            # 이미 @@CASE 줄에 남아 있으므로 여기서 더 적지 않는다.
            pass
        except Exception:  # noqa: BLE001 - 무엇이든 보고서에 남긴다
            crashed = traceback.format_exc()

        for line in buf.getvalue().splitlines():
            c = parse_line(line)
            if c:
                report.add(c)
        if crashed:
            report.crashes.append((where, crashed))

    if word:
        report.retain(word)
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="python -m tests.report",
        description="천지인 시험을 돌리고 구역별로 정리해 보여 준다.",
    )
    ap.add_argument("-v", "--detail", action="store_true", help="항목마다 한 줄씩")
    ap.add_argument("-run", "--run", metavar="낱말", help="이름이 맞는 것만")
    ap.add_argument(
        "--color",
        dest="color",
        action="store_true",
        default=None,
        help="색을 쓴다 (기본은 화면으로 나갈 때만)",
    )
    ap.add_argument(
        "--no-color", dest="color", action="store_false", help="색을 쓰지 않는다"
    )
    args = ap.parse_args(argv)

    report = run(args.run, args.detail)

    if report.total == 0 and not report.crashes:
        # 빈 보고서가 "0개 중 0개 통과" 로 조용히 넘어가지 않게 한다.
        # 그것을 보고 다 잘 돌아간다고 믿게 되기 때문이다.
        print("시험 항목을 하나도 찾지 못했습니다.", file=sys.stderr)
        return 2

    report.print(args.detail, Ink(color_enabled(args.color)))
    return 1 if (report.failed or report.crashes) else 0


if __name__ == "__main__":
    # 저장소 루트를 import 경로에 넣는다. 설치하지 않고도 돌게 하려는 것이다.
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    raise SystemExit(main())
