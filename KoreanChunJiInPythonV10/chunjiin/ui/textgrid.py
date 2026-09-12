"""textgrid.py - 글자를 칸 격자에 세우는 셈. 화면을 하나도 건드리지 않는다.

사용법의 자판 그림과 모음 조합표는 **한글 한 자가 두 칸**이라는 전제로
그려져 있다. 창에서 그 표가 흐트러지지 않으려면 한글이 아스키 두 칸과
정확히 같은 폭으로 그려져야 한다. 그래서 사용법 창은 글자를 고정폭
글꼴에 맡기지 않고, 여기서 센 칸 번호대로 한 글자씩 자리를 잡아 놓는다.

`A`(모호함) 갈래인 `·` 와 `→` 는 한 칸이다. 원본을 그린 사람이 그렇게
잡았기 때문이다. 두 칸으로 세면 열이 밀린다.
"""

from __future__ import annotations

import unicodedata


def char_columns(ch):
    """글자 하나가 차지하는 칸 수다. 한글은 두 칸, 그 밖에는 한 칸, 결합 부호는 0 이다."""
    if unicodedata.combining(ch):
        return 0
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1


def line_columns(line):
    """한 줄이 차지하는 칸 수다."""
    return sum(char_columns(c) for c in line)


def column_of(line, index):
    """`index` 번째 글자가 시작하는 칸 번호다."""
    return line_columns(line[:index])


def column_starts(text, ch):
    """줄마다 `ch` 가 서는 칸 번호들이다. 줄마다 목록 하나씩이다."""
    out = []
    for line in text.split("\n"):
        cols = []
        at = 0
        for c in line:
            if c == ch:
                cols.append(at)
            at += char_columns(c)
        out.append(cols)
    return out


def cells(line):
    """한 줄을 (칸 번호, 글자) 로 푼다. 사용법 창이 이 자리대로 글자를 놓는다."""
    out = []
    at = 0
    for c in line:
        out.append((at, c))
        at += char_columns(c)
    return out


__all__ = ["cells", "char_columns", "column_of", "column_starts", "line_columns"]
