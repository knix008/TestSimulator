"""icons.py - 툴바와 기능 버튼에 그리는 그림.

Qt 에는 우리가 쓸 아이콘 꾸러미가 없으므로 같은 모양을 선으로 직접
그린다. 이모지를 쓰면 시스템마다 색과 크기가 달라지고, 글꼴 문자
(↵ U+21B5, ⌫ U+232B)는 내장한 Noto Sans KR 에 들어 있지 않아 빈칸이 된다.

좌표는 모두 24x24 자리를 기준으로 적는다. 웹 판 index.html 의
viewBox="0 0 24 24" 와 같은 자리이므로 두 판의 그림이 같다.

좌표를 점 목록으로 푸는 일(`icon_polylines` 들)은 Qt 를 하나도 쓰지
않는 순수한 계산이라 화면 없이 시험할 수 있다. 실제로 붓을 대는 것은
`paint_icon()` 하나다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum


@dataclass(frozen=True)
class IconDef:
    """그림 하나의 정의다. 모두 선으로만 그린다."""

    lines: tuple = ()  # 이어 그리는 선들
    circles: tuple = ()  # 테두리만 그리는 원 (cx, cy, r)
    dots: tuple = ()  # 속을 채운 점 (cx, cy, r)
    ellipses: tuple = ()  # 테두리만 그리는 타원 (cx, cy, rx, ry)
    arcs: tuple = field(default=())  # 호 (cx, cy, r, 시작각, 끝각) - 각은 도(°), 0°가 오른쪽


class Icon(Enum):
    """그림의 이름이다. 값은 웹 판 SVG 의 id 와 같은 이름이다."""

    NEW = "new"
    OPEN = "open"
    SAVE = "save"
    COPY = "copy"
    PASTE = "paste"
    CLEAR = "clear"
    MODE = "mode"
    THEME = "theme"
    LANGUAGE = "language"
    SETTINGS = "settings"
    ABOUT = "about"
    HELP = "help"
    ENTER = "enter"  # 줄바꿈 (↵)
    BACKSPACE = "backspace"  # 지우기 (⌫)


# 아래 좌표표는 24x24 자리에 그린 모양이다. 줄을 바꾸면 형태를 눈으로 좇을 수 없다.
_DEFS = {
    Icon.NEW: IconDef(lines=(
        ((6, 2), (13, 2), (18, 7), (18, 22), (6, 22), (6, 2)),
        ((13, 2), (13, 7), (18, 7)),
    )),
    Icon.OPEN: IconDef(lines=(
        ((3, 6), (10, 6), (12, 8), (21, 8), (21, 20), (3, 20), (3, 6)),
    )),
    Icon.SAVE: IconDef(lines=(
        ((4, 3), (17, 3), (20, 6), (20, 21), (4, 21), (4, 3)),
        ((8, 3), (8, 9), (16, 9), (16, 3)),
        ((8, 13), (16, 13), (16, 21), (8, 21), (8, 13)),
    )),
    Icon.COPY: IconDef(lines=(
        ((9, 9), (21, 9), (21, 21), (9, 21), (9, 9)),
        ((15, 5.5), (15, 3), (3, 3), (3, 15), (5.5, 15)),
    )),
    Icon.PASTE: IconDef(lines=(
        ((9, 3), (15, 3), (15, 6), (9, 6), (9, 3)),
        ((15, 5), (18, 5), (18, 21), (6, 21), (6, 5), (9, 5)),
        ((9, 12), (15, 12)),
        ((9, 16), (15, 16)),
    )),
    Icon.CLEAR: IconDef(lines=(
        ((4, 7), (20, 7)),
        ((10, 11), (10, 17)),
        ((14, 11), (14, 17)),
        ((6, 7), (7, 20), (17, 20), (18, 7)),
        ((9, 7), (9, 4), (15, 4), (15, 7)),
    )),
    # 입력 모드 전환 - 한 바퀴 도는 화살표
    Icon.MODE: IconDef(
        lines=(((20, 4), (20, 11), (13, 11)),),
        arcs=((12, 12, 8, -35, 290),),
    ),
    # 테마 전환 - 팔레트
    Icon.THEME: IconDef(
        lines=(((12, 3), (17, 4.4), (20.4, 8.4), (21, 13), (18.6, 16), (15, 16), (13.6, 17.4), (14.4, 19.6), (14, 21), (10, 20.6), (5.6, 18), (3.2, 13.6), (3.6, 8.6), (7, 4.6), (12, 3)),),
        dots=((7.5, 11, 1.2), (11, 7, 1.2), (15.5, 8.5, 1.2)),
    ),
    # 언어 전환 - 지구본. 테두리 원 · 적도 · 세로 경도선 · 휘어 보이는 경도선(타원)이다.
    Icon.LANGUAGE: IconDef(
        lines=(((3, 12), (21, 12)), ((12, 3), (12, 21))),
        circles=((12, 12, 9),),
        ellipses=((12, 12, 4.6, 9),),
    ),
    # 설정 - 톱니바퀴
    Icon.SETTINGS: IconDef(
        lines=(((12, 2.5), (13.6, 5.1), (16.6, 4.5), (17.1, 7.5), (19.8, 8.9), (18.2, 11.5), (19.8, 14.1), (17.1, 15.5), (16.6, 18.5), (13.6, 17.9), (12, 21.5), (10.4, 18.9), (7.4, 19.5), (6.9, 16.5), (4.2, 15.1), (5.8, 12), (4.2, 9.4), (6.9, 8), (7.4, 5), (10.4, 5.6), (12, 2.5)),),
        circles=((12, 12, 3.2),),
    ),
    # 프로그램 정보 - i
    Icon.ABOUT: IconDef(
        lines=(((12, 11), (12, 17)),),
        circles=((12, 12, 9),),
        dots=((12, 7.6, 1.0),),
    ),
    # 사용법 - ?
    Icon.HELP: IconDef(
        lines=(((9.3, 9.6), (10.4, 7.6), (12.7, 7.4), (14.2, 9), (13.6, 11.2), (12, 12.6), (12, 14.1)),),
        circles=((12, 12, 9),),
        dots=((12, 17.4, 1.0),),
    ),
    # 줄바꿈 (↵). 오른쪽 위에서 내려와 왼쪽으로 꺾이고 화살촉이 붙는다.
    Icon.ENTER: IconDef(lines=(
        ((19.4, 5), (19.4, 13.6), (7.4, 13.6)),
        ((10.4, 10.1), (6.5, 13.6), (10.4, 17.1)),
    )),
    # 지우기 (⌫). 왼쪽이 뾰족한 상자와 가운데 X.
    Icon.BACKSPACE: IconDef(lines=(
        ((9, 5), (19.3, 5), (21, 6.7), (21, 17.3), (19.3, 19), (9, 19), (3, 12), (9, 5)),
        ((12.4, 9.4), (17.4, 14.6)),
        ((17.4, 9.4), (12.4, 14.6)),
    )),
}

# 툴바 단추의 차례다. `Strings.tips` 와 차례가 같아야 한다.
TOOL_ICONS = (
    Icon.NEW,
    Icon.OPEN,
    Icon.SAVE,
    Icon.COPY,
    Icon.PASTE,
    Icon.CLEAR,
    Icon.MODE,
    Icon.THEME,
    Icon.LANGUAGE,
    Icon.SETTINGS,
    Icon.ABOUT,
)


def icon_def(ic):
    return _DEFS[ic]


def _sample(n, f):
    """곡선을 n 도막으로 나눠 점을 뽑는다."""
    return [f(i / n) for i in range(n + 1)]


def icon_polylines(ic, size):
    """그림의 선들을 `size` 크기에 맞춘 점 목록으로 푼다.

    (닫힌 선인가, [(x, y), ...]) 의 목록이다. 타원과 호도 점으로 풀어
    같이 돌려주므로 그리는 쪽은 선만 그으면 된다. 좌표 원점은 (0, 0) 이다.
    """
    d = _DEFS[ic]
    k = size / 24.0
    out = []
    for line in d.lines:
        pts = [(x * k, y * k) for x, y in line]
        out.append((len(pts) > 2 and pts[0] == pts[-1], pts))
    for cx, cy, rx, ry in d.ellipses:
        pts = _sample(48, lambda t, cx=cx, cy=cy, rx=rx, ry=ry: (
            (cx + rx * math.cos(t * math.tau)) * k,
            (cy + ry * math.sin(t * math.tau)) * k,
        ))
        out.append((True, pts))
    for cx, cy, r, a0, a1 in d.arcs:
        f0, f1 = math.radians(a0), math.radians(a1)
        pts = _sample(40, lambda t, cx=cx, cy=cy, r=r, f0=f0, f1=f1: (
            (cx + r * math.cos(f0 + (f1 - f0) * t)) * k,
            (cy + r * math.sin(f0 + (f1 - f0) * t)) * k,
        ))
        out.append((False, pts))
    return out


def icon_circles(ic, size):
    """테두리만 그리는 원들이다. (cx, cy, r)."""
    k = size / 24.0
    return [(cx * k, cy * k, r * k) for cx, cy, r in _DEFS[ic].circles]


def icon_dots(ic, size):
    """속을 채운 점들이다. (cx, cy, r)."""
    k = size / 24.0
    return [(cx * k, cy * k, r * k) for cx, cy, r in _DEFS[ic].dots]


def paint_icon(painter, rect, ic, color):
    """그림을 `rect`(QRectF) 안에 꽉 차게 그린다.

    24x24 자리를 정사각형으로 맞춰 넣으므로 칸이 길쭉해도 찌그러지지
    않는다. 선 굵기는 그림 크기를 따라가므로 작게 그려도 형태가 남는다.
    """
    from PySide6.QtCore import QPointF, Qt
    from PySide6.QtGui import QColor, QPainter, QPen

    size = min(rect.width(), rect.height())
    k = size / 24.0
    ox = rect.center().x() - size / 2
    oy = rect.center().y() - size / 2

    pen = QPen(QColor(color))
    pen.setWidthF(max(1.0, k * 1.7))
    pen.setCapStyle(Qt.PenCapStyle.RoundCap)
    pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)

    painter.save()
    painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
    painter.setPen(pen)
    painter.setBrush(Qt.BrushStyle.NoBrush)

    for _closed, pts in icon_polylines(ic, size):
        painter.drawPolyline([QPointF(ox + x, oy + y) for x, y in pts])
    for cx, cy, r in icon_circles(ic, size):
        painter.drawEllipse(QPointF(ox + cx, oy + cy), r, r)

    painter.setPen(Qt.PenStyle.NoPen)
    painter.setBrush(QColor(color))
    for cx, cy, r in icon_dots(ic, size):
        r = max(1.0, r)
        painter.drawEllipse(QPointF(ox + cx, oy + cy), r, r)
    painter.restore()


__all__ = ["TOOL_ICONS", "Icon", "IconDef", "icon_circles", "icon_def", "icon_dots", "icon_polylines", "paint_icon"]
