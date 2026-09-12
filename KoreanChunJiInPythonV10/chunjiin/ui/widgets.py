"""widgets.py - 직접 그리는 키패드 · 툴바 버튼과 그것을 담는 판.

키패드 버튼과 툴바 버튼은 Qt 기본 단추를 쓰지 않고 `QPainter` 로 직접
그린다. 역할(자음 / 모음 / 문장부호 / 기능 / 모드 / 툴바)마다 색이
달라야 하는데, 스타일시트로 버튼마다 다른 색을 주려면 위젯 수만큼
시트를 만들어야 하고 테마를 바꿀 때마다 다시 붙여야 한다. 직접 그리면
팔레트만 갈아 끼우면 된다. C++ 판이 `BS_OWNERDRAW` 로 하던 일과 같다.

버튼은 초점을 받지 않는다(`NoFocus`). 키패드를 눌러도 물리 키보드가
편집칸에 그대로 닿아야 하기 때문이다.

자리는 `layout.py` 가 미리 셈해서 알려 준다. 그 셈은 화면을 하나도
건드리지 않는 순수한 계산이라 창 없이 시험할 수 있다.
"""

from __future__ import annotations

from PySide6.QtCore import QRectF, Qt, Signal
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import QSizePolicy, QWidget

from chunjiin.ui import font as fontmod
from chunjiin.ui.icons import TOOL_ICONS, paint_icon
from chunjiin.ui.lang import FN_COUNT, TOOL_COUNT
from chunjiin.ui.layout import (
    FN_WEIGHT,
    GAP,
    KEY_HEIGHT,
    TOOL_SIZE,
    equal_row,
    toolbar_metrics,
    toolbar_slot_x,
    v_grid,
    weighted_row,
)
from chunjiin.ui.theme import PALETTES, BtnRole, BtnState


class PaintedButton(QWidget):
    """직접 그리는 버튼의 바탕이다. 글자나 그림 하나를 얼굴로 갖는다.

    `_text` 와 `_icon` 가운데 하나만 있다. 시험이 `_text` 로 라벨을 읽는다.
    """

    clicked = Signal()

    def __init__(self, role, radius, parent=None):
        super().__init__(parent)
        self._role = role
        self._radius = radius
        self._text = ""
        self._icon = None
        self._text_size = 16
        self._pal = PALETTES[0]
        self._hover = False
        self._down = False
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.setAttribute(Qt.WidgetAttribute.WA_Hover, True)
        self.setMouseTracking(True)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    # -- 겉모습 --------------------------------------------------------

    def set_face(self, text="", icon=None):
        """얼굴을 바꾼다. 글자가 있으면 글자, 없으면 그림이다."""
        if text != self._text or icon is not self._icon:
            self._text, self._icon = text, icon
            self.update()

    def set_role(self, role):
        if role != self._role:
            self._role = role
            self.update()

    def set_palette(self, pal):
        self._pal = pal
        self.update()

    def set_text_size(self, px):
        self._text_size = px
        self.update()

    def _state(self):
        if self._down:
            return BtnState.PRESS
        if self._hover:
            return BtnState.HOVER
        return BtnState.BASE

    # -- 마우스 ----------------------------------------------------------

    def enterEvent(self, e):
        self._hover = True
        self.update()

    def leaveEvent(self, e):
        self._hover = False
        self._down = False
        self.update()

    def mousePressEvent(self, e):
        if e.button() == Qt.MouseButton.LeftButton:
            self._down = True
            self.update()

    def mouseReleaseEvent(self, e):
        if e.button() != Qt.MouseButton.LeftButton:
            return
        was = self._down
        self._down = False
        self.update()
        if was and self.rect().contains(e.position().toPoint()):
            self.clicked.emit()

    # -- 그리기 ----------------------------------------------------------

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        pal = self._pal
        r = QRectF(self.rect()).adjusted(0.5, 0.5, -0.5, -0.5)

        p.setPen(QPen(QColor(pal.border_of(self._role)), 1.0))
        p.setBrush(QColor(pal.fill(self._role, self._state())))
        p.drawRoundedRect(r, self._radius, self._radius)

        color = pal.text_of(self._role)
        if self._icon is not None:
            self._paint_icon(p, r, color)
        elif self._text:
            p.setPen(QColor(color))
            p.setFont(fontmod.font(self._text_size, bold=True))
            p.drawText(r, Qt.AlignmentFlag.AlignCenter, self._text)
        p.end()

    def _paint_icon(self, p, r, color):
        side = min(r.width(), r.height()) * 0.42
        box = QRectF(r.center().x() - side / 2, r.center().y() - side / 2, side, side)
        paint_icon(p, box, self._icon, color)


class KeyButton(PaintedButton):
    """키패드 버튼이다. 둥근 네모에 굵은 글자다."""

    def __init__(self, role=BtnRole.CONS, parent=None):
        super().__init__(role, 12.0, parent)


class ToolButton(PaintedButton):
    """툴바 버튼이다. 테두리 없이 그림만 그리고, 위에 머무르면 설명이 뜬다."""

    def __init__(self, icon, parent=None):
        super().__init__(BtnRole.TOOL, 6.0, parent)
        self._icon = icon

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        pal = self._pal
        r = QRectF(self.rect())
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(pal.fill(BtnRole.TOOL, self._state())))
        p.drawRoundedRect(r, self._radius, self._radius)
        inset = r.width() * 0.22
        paint_icon(p, r.adjusted(inset, inset, -inset, -inset), self._icon, pal.text_of(BtnRole.TOOL))
        p.end()


class Keypad(QWidget):
    """천지인 12키와 기능 버튼 6개를 담는 판이다.

    위 4행은 3열 균등, 마지막 행은 기능 버튼을 비율로 나눈다. 자리 셈은
    `layout.py` 가 하고 여기서는 그 결과대로 놓기만 한다.
    """

    key_pressed = Signal(int)
    fn_pressed = Signal(int)

    # 판의 고정 높이다. 5행과 틈, 위아래 여백이다.
    HEIGHT = int(KEY_HEIGHT * 5 + GAP * 4 + 14)

    def __init__(self, fn_icons, parent=None):
        super().__init__(parent)
        self.setFixedHeight(self.HEIGHT)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        self.keys = []
        for i in range(12):
            b = KeyButton(parent=self)
            b.set_text_size(19)
            b.clicked.connect(lambda i=i: self.key_pressed.emit(i))
            self.keys.append(b)

        self.fns = []
        for i in range(FN_COUNT):
            b = KeyButton(BtnRole.PRIMARY if i == 0 else BtnRole.FN, parent=self)
            b.set_text_size(16)
            b._icon = fn_icons[i]
            b.clicked.connect(lambda i=i: self.fn_pressed.emit(i))
            self.fns.append(b)

    def set_palette(self, pal):
        for b in self.keys + self.fns:
            b.set_palette(pal)

    def resizeEvent(self, e):
        w = self.width()
        rows = v_grid(self.height() - 8, GAP, 5)
        top = 4
        for r in range(4):
            y, h = rows[r]
            for c, (x, cw) in enumerate(equal_row(w, GAP, 3)):
                self.keys[r * 3 + c].setGeometry(round(x), round(top + y), round(cw), round(h))
        y, h = rows[4]
        for i, (x, cw) in enumerate(weighted_row(w, GAP, FN_WEIGHT)):
            self.fns[i].setGeometry(round(x), round(top + y), round(cw), round(h))


class Toolbar(QWidget):
    """툴바 열한 칸이다. 마지막 "프로그램 정보" 만 오른쪽 끝으로 민다.

    창은 MIN_WINDOW_W 보다 좁아질 수 없으므로 보통은 제 크기로 그린다.
    그보다 좁아지면 버튼을 줄여서라도 열한 칸을 모두 보인다. 창 관리자가
    최소 크기를 지키지 않을 때 버튼이 잘려 나가지 않게 하려는 것이다.
    """

    tool_pressed = Signal(int)

    HEIGHT = int(TOOL_SIZE + 10)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(self.HEIGHT)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.buttons = []
        for i, ic in enumerate(TOOL_ICONS):
            b = ToolButton(ic, parent=self)
            b.clicked.connect(lambda i=i: self.tool_pressed.emit(i))
            self.buttons.append(b)

    def set_palette(self, pal):
        for b in self.buttons:
            b.set_palette(pal)

    def set_tips(self, tips):
        for b, tip in zip(self.buttons, tips, strict=True):
            b.setToolTip(tip)

    def resizeEvent(self, e):
        # 좌우 여백 8px 안쪽을 툴바 폭으로 본다.
        pad = 8
        w = max(0, self.width() - pad * 2)
        size, gap, tail = toolbar_metrics(w)
        y = (self.height() - size) / 2
        for i in range(TOOL_COUNT):
            x = pad + toolbar_slot_x(i, w, size, gap, tail)
            self.buttons[i].setGeometry(round(x), round(y), round(size), round(size))


__all__ = ["KeyButton", "Keypad", "PaintedButton", "ToolButton", "Toolbar"]
