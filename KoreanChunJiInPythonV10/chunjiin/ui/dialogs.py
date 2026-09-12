"""dialogs.py - 사용법 · 정보 · 설정 창.

세 창 모두 진짜 창으로 띄운다(C++ 판도 그랬다). **스크롤 막대가 없고,
단추 아래에 빈 자리가 남지 않는다.** 크기를 못박지 않고 내용에 맞추기
때문이다. Qt 는 위젯이 스스로 알맞은 크기를 알려 주므로(`sizeHint`)
배치자에 담기만 하면 된다.

사용법은 70줄이다. 한 줄로 세우면 창이 화면보다 길어져 스크롤이 생긴다.
그래서 `[ 제목 ]` 단위로 잘라 두 칸에 나눠 놓는다(`help.two_columns`).

설정 창과 정보 창의 표는 값 칸이 같은 자리에서 시작해야 한다. 여분 폭을
값 칸이 가져가지 않으면 이름 칸이 까닭 없이 벌어져 값이 저 멀리 떨어져
선다. 그래서 값 칸(1열)에만 늘어남을 준다.
"""

from __future__ import annotations

import platform
import sys
from dataclasses import replace

from PySide6.QtCore import QSize, Qt
from PySide6.QtGui import QColor, QFontMetricsF, QPainter
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from chunjiin.ui import font as fontmod
from chunjiin.ui import help as helpmod
from chunjiin.ui import settings as setmod
from chunjiin.ui.lang import LANGS, Lang
from chunjiin.ui.textgrid import cells, char_columns, line_columns

# 딸린 창 본문의 여백이다. 글이 창 테두리에 바싹 붙으면 읽기 나쁘다.
MARGIN = (20, 16, 20, 12)
# 이름표 칸과 값 칸 사이의 틈이다. 설정·정보 창의 표가 함께 쓴다.
GRID_GAP = 14
# 사용법 본문의 글꼴 크기(px)와 두 칸 사이 틈이다.
HELP_FONT_PX = 13
HELP_COL_GAP = 10


def _vline():
    """두 칸 사이에 긋는 세로줄이다."""
    f = QFrame()
    f.setFrameShape(QFrame.Shape.NoFrame)
    f.setProperty("divider", True)
    f.setFixedWidth(1)
    return f


def _button_row(*buttons, left=None):
    """창 아래에 오른쪽으로 붙이는 단추 줄이다. `left` 는 맨 왼쪽에 따로 둔다."""
    row = QHBoxLayout()
    row.setContentsMargins(0, 4, 0, 0)
    row.setSpacing(8)
    if left is not None:
        row.addWidget(left)
    row.addStretch(1)
    for b in buttons:
        row.addWidget(b)
    return row


def _separator():
    f = QFrame()
    f.setFrameShape(QFrame.Shape.NoFrame)
    f.setProperty("divider", True)
    f.setFixedHeight(1)
    return f


class HelpColumn(QWidget):
    """사용법 한 칸이다. 글자를 칸 격자에 세워 그린다.

    자판 그림과 모음 조합표는 한글 한 자가 두 칸이라는 전제로 그려져
    있다. 고정폭 글꼴에 맡기면 글꼴마다 한글과 아스키의 폭 비율이 달라
    열이 밀린다. 그래서 `textgrid` 가 센 칸 번호대로 한 글자씩 놓는다.
    """

    def __init__(self, text, parent=None):
        super().__init__(parent)
        self._lines = text.split("\n")
        self._font = fontmod.font(HELP_FONT_PX)
        fm = QFontMetricsF(self._font)
        # 한 칸의 폭은 한글 한 자의 절반이다(숫자 한 자보다 좁으면 숫자에 맞춘다).
        # 가장 넓은 영문자(W, m)에 맞추면 칸이 다 벌어져 글이 띄엄띄엄 보인다.
        # 넓은 영문자 몇 개가 제 칸을 조금 넘는 쪽이 낫다.
        self._cell = max(fm.horizontalAdvance("0"), fm.horizontalAdvance("가") / 2)
        self._line_h = fm.height() * 1.15
        self._ascent = fm.ascent()
        self._cols = max((line_columns(line) for line in self._lines), default=0)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.setFixedSize(self.sizeHint())

    def sizeHint(self):
        return QSize(int(self._cols * self._cell + 2), int(len(self._lines) * self._line_h + 2))

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.TextAntialiasing, True)
        p.setFont(self._font)
        p.setPen(QColor(self.palette().color(self.foregroundRole())))
        fm = QFontMetricsF(self._font)
        for row, line in enumerate(self._lines):
            y = row * self._line_h + self._ascent + 1
            if line.startswith("["):
                p.setFont(fontmod.font(HELP_FONT_PX, bold=True))
            # 한 칸짜리 글자(아스키)는 이어진 만큼 한 덩이로 그려 글꼴의 자간을
            # 살리고, 두 칸짜리 글자(한글)는 제 두 칸 가운데에 하나씩 놓는다.
            run, run_col = [], 0
            for col, ch in cells(line):
                if ch != " " and char_columns(ch) == 1:
                    if not run:
                        run_col = col
                    run.append(ch)
                    continue
                if run:
                    p.drawText(int(run_col * self._cell), int(y), "".join(run))
                    run = []
                if ch == " ":
                    continue
                w = fm.horizontalAdvance(ch)
                p.drawText(int(col * self._cell + (self._cell * 2 - w) / 2), int(y), ch)
            if run:
                p.drawText(int(run_col * self._cell), int(y), "".join(run))
            if line.startswith("["):
                p.setFont(self._font)
        p.end()


class HelpDialog(QDialog):
    """사용법 창이다. 본문을 두 칸에 나눠 놓고 아래에 닫기 단추를 붙인다."""

    def __init__(self, txt, on_close=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle(txt.help_title)
        self.setWindowIcon(fontmod.window_icon())
        self._on_close = on_close

        left, right = helpmod.two_columns(txt.help)

        body = QVBoxLayout(self)
        body.setContentsMargins(*MARGIN)
        body.setSpacing(6)

        cols = QHBoxLayout()
        cols.setSpacing(HELP_COL_GAP)
        cols.addWidget(HelpColumn(left), 0, Qt.AlignmentFlag.AlignTop)
        cols.addWidget(_vline())
        cols.addWidget(HelpColumn(right), 0, Qt.AlignmentFlag.AlignTop)
        body.addLayout(cols)

        body.addWidget(_separator())
        close = QPushButton(txt.close)
        close.setDefault(True)
        close.clicked.connect(self.accept)
        body.addLayout(_button_row(close))
        self.setSizeGripEnabled(False)

    def done(self, r):
        super().done(r)
        if self._on_close:
            self._on_close()


def _bold_label(text, px=13):
    lab = QLabel(text)
    lab.setFont(fontmod.font(px, bold=True))
    return lab


def _label(text, px=14):
    lab = QLabel(text)
    lab.setFont(fontmod.font(px))
    lab.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
    return lab


class AboutDialog(QDialog):
    """프로그램 정보 창이다.

    이름·판 번호를 머리에 두고, 그 아래에 이름표와 값을 두 줄로 세운다.
    값은 어느 것도 접지 않는다. 접으면 폭에 따라 높이가 달라져서 창을
    내용에 맞출 수가 없다. 설정 파일 경로처럼 긴 값은 마지막에 따로 한 줄을 준다.
    """

    def __init__(self, txt, version, theme_name, on_close=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle(txt.about_title)
        self.setWindowIcon(fontmod.window_icon())
        self._on_close = on_close

        body = QVBoxLayout(self)
        body.setContentsMargins(*MARGIN)
        body.setSpacing(6)

        body.addWidget(_bold_label(f"{txt.app_title}   {version}", 16))
        body.addWidget(_label(txt.about_body))
        body.addSpacing(4)
        body.addWidget(_separator())
        body.addSpacing(2)

        try:
            from PySide6 import __version__ as pyside_ver
        except ImportError:  # pragma: no cover
            pyside_ver = "?"
        rows = (
            (txt.about_author, "SHKWON  (knix008@naver.com)"),
            (txt.about_engine, "KoreanChunJiInC++ : chunjiin.c / input.c"),
            (txt.about_build, f"Python {platform.python_version()}  ·  PySide6 {pyside_ver}"),
            (txt.about_platform, f"{sys.platform}/{platform.machine().lower() or '?'}"),
            (txt.about_font, "Noto Sans KR (SIL OFL 1.1)"),
            (txt.about_theme, theme_name),
        )
        grid = QGridLayout()
        grid.setHorizontalSpacing(GRID_GAP)
        grid.setVerticalSpacing(6)
        grid.setColumnStretch(1, 1)  # 여분 폭은 값 칸이 가져간다
        for r, (k, v) in enumerate(rows):
            grid.addWidget(_bold_label(k), r, 0, Qt.AlignmentFlag.AlignLeft)
            grid.addWidget(_label(v), r, 1, Qt.AlignmentFlag.AlignLeft)
        # 설정 파일 경로는 표 아래에 따로 두 줄을 차지한다.
        n = len(rows)
        grid.addWidget(_bold_label(txt.about_settings), n, 0, 1, 2)
        grid.addWidget(_label(setmod.settings_location(), 12), n + 1, 0, 1, 2)
        body.addLayout(grid)

        body.addSpacing(4)
        body.addWidget(_separator())
        close = QPushButton(txt.close)
        close.setDefault(True)
        close.clicked.connect(self.accept)
        body.addLayout(_button_row(close))
        self.setSizeGripEnabled(False)

    def done(self, r):
        super().done(r)
        if self._on_close:
            self._on_close()


class SettingsDialog(QDialog):
    """설정 창이다. 고르는 즉시 적용해서 미리 보여 준다.

    `on_preview(settings)` 는 값이 바뀔 때마다, `on_done(settings, ok)` 는
    창이 닫힐 때 불린다. 취소하면 열 때의 값으로 되돌려 미리 보여 준다.
    """

    def __init__(self, settings, txt, on_preview=None, on_done=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle(txt.set_title)
        self.setWindowIcon(fontmod.window_icon())
        self._txt = txt
        self._backup = replace(settings)
        self.value = replace(settings)
        self._on_preview = on_preview
        self._on_done = on_done
        self._building = True

        body = QVBoxLayout(self)
        body.setContentsMargins(*MARGIN)
        body.setSpacing(8)

        grid = QGridLayout()
        grid.setHorizontalSpacing(GRID_GAP)
        grid.setVerticalSpacing(10)
        grid.setColumnStretch(1, 1)  # 여분 폭은 값 칸이 가져간다

        self.theme = self._combo(list(txt.theme_names), settings.theme)
        self.language = self._combo([Lang.name(c) for c in LANGS], setmod.index_in(LANGS, settings.language))
        self.font_size = self._combo(
            setmod.unit_labels(setmod.FONT_CHOICES, setmod.DEFAULT_FONT_SIZE, txt.unit_px, txt.mark_default),
            setmod.index_in(setmod.FONT_CHOICES, settings.font_size),
        )
        self.tap = self._combo(
            setmod.tap_labels(txt.unit_sec, txt.mark_default),
            setmod.index_in(setmod.TAP_CHOICES, settings.multitap_ms),
        )
        self.start_mode = self._combo(list(txt.mode_names), settings.start_mode)

        for r, (name, combo) in enumerate((
            (txt.set_theme, self.theme),
            (txt.set_language, self.language),
            (txt.set_font_size, self.font_size),
            (txt.set_tap_time, self.tap),
            (txt.set_start_mode, self.start_mode),
        )):
            grid.addWidget(_label(name), r, 0, Qt.AlignmentFlag.AlignLeft)
            grid.addWidget(combo, r, 1, Qt.AlignmentFlag.AlignLeft)
        body.addLayout(grid)

        # 켜고 끄는 것은 이름표 칸이 없다. 표 밖에 두어 왼쪽에 나란히 세운다.
        self.show_toolbar = QCheckBox(txt.show_toolbar)
        self.show_toolbar.setChecked(settings.show_toolbar)
        self.show_status = QCheckBox(txt.show_status)
        self.show_status.setChecked(settings.show_status)
        for cb in (self.show_toolbar, self.show_status):
            cb.setFont(fontmod.font(14))
            cb.toggled.connect(self._changed)
            body.addWidget(cb)

        body.addWidget(_separator())
        defaults = QPushButton(txt.set_default)
        defaults.clicked.connect(self._defaults)
        cancel = QPushButton(txt.set_cancel)
        cancel.clicked.connect(self.reject)
        ok = QPushButton(txt.set_ok)
        ok.setDefault(True)
        ok.clicked.connect(self.accept)
        body.addLayout(_button_row(cancel, ok, left=defaults))
        self.setSizeGripEnabled(False)
        self._building = False

    def _combo(self, items, at):
        c = QComboBox()
        c.setFont(fontmod.font(14))
        c.addItems(items)
        c.setCurrentIndex(max(0, min(len(items) - 1, at)))
        c.setMinimumWidth(200)
        c.currentIndexChanged.connect(self._changed)
        return c

    def _read(self):
        """창의 상태를 Settings 로 읽는다."""
        return setmod.Settings(
            theme=self.theme.currentIndex(),
            language=LANGS[self.language.currentIndex()],
            font_size=setmod.FONT_CHOICES[self.font_size.currentIndex()],
            multitap_ms=setmod.TAP_CHOICES[self.tap.currentIndex()],
            start_mode=self.start_mode.currentIndex(),
            show_toolbar=self.show_toolbar.isChecked(),
            show_status=self.show_status.isChecked(),
        )

    def _write(self, s):
        """Settings 를 창에 옮긴다. 옮기는 동안은 바뀜을 알리지 않는다."""
        self._building = True
        self.theme.setCurrentIndex(s.theme)
        self.language.setCurrentIndex(setmod.index_in(LANGS, s.language))
        self.font_size.setCurrentIndex(setmod.index_in(setmod.FONT_CHOICES, s.font_size))
        self.tap.setCurrentIndex(setmod.index_in(setmod.TAP_CHOICES, s.multitap_ms))
        self.start_mode.setCurrentIndex(s.start_mode)
        self.show_toolbar.setChecked(s.show_toolbar)
        self.show_status.setChecked(s.show_status)
        self._building = False
        self._changed()

    def _changed(self, *_):
        if self._building:
            return
        self.value = self._read()
        if self._on_preview:
            self._on_preview(self.value)

    def _defaults(self):
        # 언어는 기본값 단추로 되돌리지 않는다.
        self._write(setmod.Settings(language=self.value.language))

    def done(self, r):
        ok = r == QDialog.DialogCode.Accepted
        final = self.value if ok else self._backup
        if not ok and self._on_preview:
            self._on_preview(final)
        super().done(r)
        if self._on_done:
            self._on_done(final, ok)


__all__ = ["AboutDialog", "HelpColumn", "HelpDialog", "SettingsDialog"]
