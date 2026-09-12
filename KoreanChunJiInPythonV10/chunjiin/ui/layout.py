"""layout.py - 키패드 배치와 커서 자리 옮기기.

위 4행은 3열 균등, 마지막 행은 기능 버튼 6개를 비율로 나눈다.
x 좌표를 누적 비율로 계산해서 반올림 오차가 쌓이지 않게 한다
(C++ 판 `relayout()` 과 같은 방식이다).

여기 있는 것은 모두 순수한 계산이라 화면 없이 시험할 수 있다.
"""

from __future__ import annotations

from chunjiin.ui.lang import TOOL_COUNT

# 기능 버튼의 폭 비율이다(합 35). C++ 판과 같은 값이다.
FN_WEIGHT = (7, 4, 10, 4, 4, 6)

# 키패드 버튼 한 칸의 최소 높이다. 손가락으로 누르기 좋게 넉넉히 잡는다.
KEY_HEIGHT = 54.0
# 버튼 사이의 틈이다.
GAP = 6.0

# 툴바 버튼 한 칸의 크기, 버튼 사이의 틈, 왼쪽 무리와 맨 오른쪽
# "프로그램 정보" 사이에 적어도 두는 틈이다.
TOOL_SIZE = 32.0
TOOL_GAP = 2.0
TOOL_TAIL_GAP = 10.0

# 툴바가 가려지지 않으려면 있어야 하는 최소 폭이다.
#
# 왼쪽에 TOOL_COUNT - 1 칸이 붙어 서고, 틈 하나를 두고, 맨 오른쪽에 한 칸이
# 붙는다. 창을 이보다 좁게 만들 수 없게 막는 값이라 손으로 적지 않고 셈한다.
# 버튼 수나 크기를 고치면 저절로 따라간다.
TOOLBAR_MIN_W = TOOL_SIZE * TOOL_COUNT + TOOL_GAP * (TOOL_COUNT - 2) + TOOL_TAIL_GAP


def toolbar_metrics(width):
    """주어진 폭에 맞는 툴바 칸 크기 · 틈 · 꼬리 틈을 셈한다.

    TOOLBAR_MIN_W 보다 넓으면 제 크기 그대로다. 좁으면 그 비율만큼 모두
    줄인다. 줄여서라도 열한 칸을 다 보이는 편이 몇 개를 잘라 내는 것보다 낫다.
    """
    scale = max(0.1, min(1.0, width / TOOLBAR_MIN_W))
    return TOOL_SIZE * scale, TOOL_GAP * scale, TOOL_TAIL_GAP * scale


def toolbar_slot_x(i, width, size, gap, tail_gap):
    """i 번째 툴바 칸의 왼쪽 자리다(툴바 왼쪽 끝을 0 으로 본다).

    마지막 칸만 오른쪽 끝에 붙인다. 다만 왼쪽 무리를 파고들지는 않는다.
    """
    left_end = (TOOL_COUNT - 1) * (size + gap) - gap
    if i == TOOL_COUNT - 1:
        return max(width - size, left_end + tail_gap)
    return i * (size + gap)


def weighted_row(width, gap, weights):
    """자식들을 가로로 비율만큼 나눈 뒤 각 칸의 (x, 폭) 을 돌려준다.

    `gap` 은 칸 사이의 틈이다. 마지막 칸의 오른쪽 끝은 언제나 `width` 에
    정확히 닿는다.
    """
    n = len(weights)
    if n == 0:
        return []

    total = max(1, sum(weights))
    span = max(0.0, width - gap * (n - 1))

    out = []
    cum = 0
    for i, w in enumerate(weights):
        x0 = gap * i + span * cum / total
        cum += w
        x1 = gap * i + span * cum / total
        out.append((x0, x1 - x0))
    return out


def equal_row(width, gap, n):
    """n 칸을 균등하게 나눈다."""
    return weighted_row(width, gap, [1] * n)


def v_grid(height, gap, n):
    """자식들을 세로로 균등하게 나눈 뒤 각 줄의 (y, 높이) 를 돌려준다 (키패드 5행)."""
    return equal_row(height, gap, n)


# ---------------------------------------------------------------------
# 커서 자리 옮기기
#
# 엔진은 커서를 "버퍼 앞에서 몇 번째 글자" 하나로 들고 있고, 입력칸은
# (줄, 칸) 두 값으로 들고 있다. 그 사이를 옮긴다.
# ---------------------------------------------------------------------


def row_col_of(text, pos):
    """평평한 글자 위치를 (줄, 칸) 으로 바꾼다."""
    row = col = 0
    for i, ch in enumerate(text):
        if i >= pos:
            break
        if ch == "\n":
            row += 1
            col = 0
        else:
            col += 1
    return row, col


def flat_pos_of(text, row, col):
    """(줄, 칸) 을 평평한 글자 위치로 바꾼다. 범위를 넘으면 안전하게 자른다."""
    lines = text.split("\n")
    row = max(0, min(len(lines) - 1, row))
    pos = sum(len(line) + 1 for line in lines[:row])  # 줄바꿈 한 칸
    return pos + max(0, min(len(lines[row]), col))


__all__ = [
    "FN_WEIGHT",
    "GAP",
    "KEY_HEIGHT",
    "TOOLBAR_MIN_W",
    "TOOL_GAP",
    "TOOL_SIZE",
    "TOOL_TAIL_GAP",
    "equal_row",
    "flat_pos_of",
    "row_col_of",
    "toolbar_metrics",
    "toolbar_slot_x",
    "v_grid",
    "weighted_row",
]
