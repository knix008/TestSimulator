"""시험 도우미. 시험에서만 쓰고 배포본에는 들어가지 않는다.

Rust 판 `crates/testkit` 과 같다. 하는 일은 둘이다.

1. C++ 판에서 뽑아 온 `tests/cases.tsv` 를 읽는다.
2. 각 항목의 결과를 `tests/report.py` 가 알아볼 수 있는 한 줄로 찍는다.

시험 함수 하나마다 ok/FAIL 만 찍으면 그 안에서 무엇을 얼마나 보고 있는지
알 수 없다. C++ 판 `test_engine` 은 구역별 집계와 전체 요약을 보여 주었는데
그 편이 훨씬 낫다. 그래서 시험이 `check()` 로 항목마다 한 줄을 남기고,
보고기가 그것을 모아 같은 모양으로 정리한다.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# 보고기가 찾아내는 표시다. 보통 글과 섞이지 않을 만한 것을 골랐다.
MARK = "@@CASE"

_KIND_LABEL = {
    "expect": "확정",
    "live": "조합중",
    "cursor": "커서",
    "comp": "상태줄",
    "mode": "모드",
}


def _clean(s):
    """탭과 줄바꿈은 미리 지운다. 그렇지 않으면 칸이 어긋난다."""
    return str(s).replace("\t", " ").replace("\n", "\\n").replace("\r", "")


def emit(ok, group, section, name, detail):
    """항목 하나의 결과를 한 줄로 찍는다.

        @@CASE<탭>ok<탭>묶음<탭>구역<탭>이름<탭>설명
    """
    tag = "ok" if ok else "FAIL"
    print(f"{MARK}\t{tag}\t{_clean(group)}\t{_clean(section)}\t{_clean(name)}\t{_clean(detail)}")


def check(ok, group, section, name, detail):
    """조건이 참이면 통과, 아니면 실패로 남기고 참/거짓을 돌려준다.

    시험 함수가 이것을 모아 세었다가 마지막에 한 번만 assert 하면,
    첫 실패에서 멈추지 않고 어디가 몇 개 틀렸는지 다 볼 수 있다.
    """
    ok = bool(ok)
    emit(ok, group, section, name, detail)
    return ok


class Tally:
    """통과·실패를 세는 그릇이다."""

    def __init__(self):
        self.passed = 0
        self.failed = 0

    def add(self, ok):
        if ok:
            self.passed += 1
        else:
            self.failed += 1

    @property
    def total(self):
        return self.passed + self.failed

    def assert_clean(self, what):
        """시험 함수 끝에서 부른다. 틀린 것이 있으면 그때 멈춘다."""
        assert self.failed == 0, (
            f"{what}: {self.total} 항목 중 {self.failed} 개가 틀렸다 (위의 FAIL 줄을 보라)"
        )


# ---------------------------------------------------------------------
# C++ 판에서 뽑아 온 시험 자료
# ---------------------------------------------------------------------


@dataclass
class Case:
    """cases.tsv 의 한 줄이다."""

    kind: str  # 비교 축: expect · live · cursor · comp · mode
    section: str
    name: str
    seq: str  # 키 시퀀스
    want: str
    cursor: int | None = None

    def kind_label(self):
        """비교 축을 짧은 이름으로 보여 준다."""
        return _KIND_LABEL.get(self.kind, "?")

    def show(self):
        """기대값을 한 줄에 담기 좋게 만든다.

        줄바꿈은 눈에 보이는 \\n 으로 바꾸고, 빈 값은 빈칸이라고 적는다.
        """
        out = self.want.replace("\n", "\\n") or "(빈칸)"
        if self.cursor is not None:
            out += f" @{self.cursor}"
        return out


def cases_path():
    """시험 자료 파일의 자리다. 저장소 루트의 tests/cases.tsv 다."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(root, "tests", "cases.tsv")


def unquote(s):
    """따옴표로 감싼 문자열 리터럴을 푼다. 풀 수 없으면 None 이다.

    자료를 뽑아내는 쪽이 Go 문자열 리터럴로 적는데, 쓰이는 이스케이프는
    `\\\\ \\" \\n \\t \\r` 뿐이라 그대로 읽을 수 있다. 모르는 이스케이프는
    그대로 둔다. 자료가 늘었을 때 조용히 어긋나느니 눈에 보이는 편이 낫다.
    """
    if len(s) < 2 or s[0] != '"' or s[-1] != '"':
        return None
    body = s[1:-1]
    out = []
    i = 0
    table = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"', "'": "'"}
    while i < len(body):
        c = body[i]
        if c != "\\":
            out.append(c)
            i += 1
            continue
        if i + 1 >= len(body):
            return None
        nxt = body[i + 1]
        out.append(table.get(nxt, "\\" + nxt))
        i += 2
    return "".join(out)


def load_cases(path=None):
    """뽑아 둔 시험 자료를 읽는다.

    칸 차례는 `종류 · 구역 · 이름 · 키 시퀀스 · 기대값 · (커서)` 이고,
    값은 따옴표로 감싼 문자열 리터럴이다. 문제가 있으면 ValueError 다.
    """
    path = path or cases_path()
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    except OSError as e:
        raise ValueError(
            f"시험 자료를 열지 못했다: {path} ({e})\n"
            "  Rust 판의 gen-testcases 로 다시 만들어 가져오세요."
        ) from e

    rows = []
    for i, line in enumerate(lines, 1):
        line = line.rstrip("\r")
        if not line or line.startswith("#"):
            continue

        f = line.split("\t")
        if len(f) < 5:
            raise ValueError(f"{path}:{i} 칸이 모자라다: {line!r}")

        def unq(s, i=i):
            v = unquote(s)
            if v is None:
                raise ValueError(f"{path}:{i} 문자열을 풀지 못했다: {s!r}")
            return v

        cursor = None
        if len(f) > 5 and f[5]:
            try:
                cursor = int(f[5])
            except ValueError as e:
                raise ValueError(f"{path}:{i} 커서 위치를 읽지 못했다: {f[5]!r}") from e

        rows.append(Case(f[0], f[1], unq(f[2]), unq(f[3]), unq(f[4]), cursor))

    if not rows:
        raise ValueError("시험 자료가 비었다")
    return rows


__all__ = ["MARK", "Case", "Tally", "cases_path", "check", "emit", "load_cases", "unquote"]
