"""theme.py - 테마 4종과 Qt 겉모습.

색은 KoreanChunJiInC++ 의 src/main.c `THEMES[]` 표를 그대로 옮긴 것이다
(Rust 판 `PALETTES` 와 같은 값). 창 배경 · 카드 · 테두리 · 글자 · 흐린
글자와, 버튼 역할마다 다섯 가지 색(기본 · 호버 · 눌림 · 테두리 · 글자)을
갖는다.

`stylesheet_for()` 는 팔레트만으로 Qt 가 그리는 모든 색을 낸다. 정하지
않고 Qt 기본값에 맡기는 자리를 두지 않는다. 그렇게 두면 운영체제의 밝기
설정이 우리 팔레트를 뒤엎어, 어떤 테마에서 글자가 배경에 묻힌다.

키패드와 툴바 버튼은 직접 그리므로(widgets.py) 여기서 정하는 색은 메뉴 ·
대화 상자 · 스크롤바 · 편집칸처럼 Qt 가 그리는 부분에만 쓰인다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from chunjiin.engine import KeyRole


class BtnRole(Enum):
    """버튼의 역할이다. 역할마다 색이 다르다. 값은 `Palette.role` 의 줄 번호다."""

    CONS = 0  # 자음 · 일반 키
    VOWEL = 1  # ㅣ · ㅡ
    MOD = 2  # 문장부호
    FN = 3  # 기능 버튼
    PRIMARY = 4  # 모드 전환
    TOOL = 5  # 툴바


# 역할의 가짓수다.
ROLE_COUNT = len(BtnRole)


class BtnState(Enum):
    """버튼 상태다. 어느 색을 쓸지 고르는 데 쓴다. 값은 역할 줄 안의 칸 번호다."""

    BASE = 0
    HOVER = 1
    PRESS = 2


# 역할별 색의 자리.
COLOR_BASE, COLOR_HOVER, COLOR_PRESS, COLOR_BORDER, COLOR_TEXT = range(5)

_UI_ROLE = {KeyRole.CONS: BtnRole.CONS, KeyRole.VOWEL: BtnRole.VOWEL, KeyRole.MOD: BtnRole.MOD}


def ui_role(r):
    """엔진이 알려 준 키 역할을 화면 역할로 바꾼다."""
    return _UI_ROLE[r]


@dataclass(frozen=True)
class Palette:
    """테마 하나의 색 묶음이다. 색은 모두 "#RRGGBB" 다."""

    name: str
    css_id: str  # 웹 판 <body data-theme> 의 이름. 두 판이 같은 이름을 쓴다.
    dark: bool

    wnd: str  # 창 배경
    card: str  # 편집 영역 배경
    border: str
    text: str
    muted: str  # 흐린 글자 (상태줄)

    # 여섯 역할 × { 기본, 호버, 눌림, 테두리, 글자 }
    role: tuple

    def fill(self, role, state):
        """역할과 상태에 맞는 배경색이다."""
        return self.role[role.value][state.value]

    def border_of(self, role):
        return self.role[role.value][COLOR_BORDER]

    def text_of(self, role):
        return self.role[role.value][COLOR_TEXT]

    def overlay(self, alpha):
        """버튼 배경 위에 덮을 반투명한 색이다. 밝은 테마는 검정, 어두운 테마는 흰색이다."""
        base = "255, 255, 255" if self.dark else "0, 0, 0"
        return f"rgba({base}, {alpha / 255:.3f})"


def _h(s):
    return "#" + s


def _roles(rows):
    return tuple(tuple(_h(c) for c in row) for row in rows)


# 테마 4종이다. 설정에 저장되는 것은 이 차례의 번호다.
# 각 역할 줄은 { 기본, 호버, 눌림, 테두리, 글자 } 다. 눈으로 대조할 수 있게 표 모양을 지킨다.
PALETTES = (
    Palette(
        name="라이트", css_id="light", dark=False,
        wnd=_h("F6F7FA"), card=_h("FFFFFF"), border=_h("DFE3EA"), text=_h("1F2328"), muted=_h("6B7280"),
        role=_roles((
            #  기본      호버      눌림      테두리    글자
            ("FFFFFF", "F2F5FF", "E3EAFD", "DFE3EA", "1F2328"),  # 자음
            ("EDF2FF", "E3EBFF", "D6E1FD", "D3DEFB", "2749C9"),  # 모음
            ("F1F3F7", "E9ECF2", "DFE3EB", "E0E4EB", "4A5162"),  # 부호
            ("F1F3F7", "E9ECF2", "DFE3EB", "E0E4EB", "333842"),  # 기능
            ("3F62E8", "3557DD", "2C4AC9", "3557DD", "FFFFFF"),  # 모드
            ("F6F7FA", "E7ECF8", "D9E1F5", "F6F7FA", "3B4250"),  # 툴바
        )),
    ),
    Palette(
        name="다크", css_id="dark", dark=True,
        wnd=_h("1E1F22"), card=_h("17181B"), border=_h("33363D"), text=_h("E6E8EB"), muted=_h("9AA1AC"),
        role=_roles((
            ("24262B", "2C2F36", "363A43", "383B43", "E6E8EB"),
            ("21304F", "27395E", "2E446F", "33456B", "A9C4FF"),
            ("1D1F24", "24262B", "2B2E35", "303339", "B7BDC7"),
            ("1D1F24", "24262B", "2B2E35", "303339", "DDE1E7"),
            ("3F62E8", "4A6DF0", "3455CE", "4A6DF0", "FFFFFF"),
            ("1E1F22", "2A2D34", "343840", "1E1F22", "D5D9E0"),
        )),
    ),
    Palette(
        name="세피아", css_id="sepia", dark=False,
        wnd=_h("F3EADA"), card=_h("FBF3E6"), border=_h("DCCDB4"), text=_h("4A3B28"), muted=_h("8A755A"),
        role=_roles((
            ("FBF3E6", "F6EAD6", "EEDCC0", "DCCDB4", "4A3B28"),
            ("F3E3C6", "EEDAB6", "E6CEA2", "D9C09B", "8A5A22"),
            ("EFE4D0", "E9DAC2", "E0CDAF", "D7C6AA", "5A4A34"),
            ("EFE4D0", "E9DAC2", "E0CDAF", "D7C6AA", "4A3B28"),
            ("A9713C", "96632F", "855427", "96632F", "FFF8EC"),
            ("F3EADA", "EADCC4", "E0CEB0", "F3EADA", "5A4A34"),
        )),
    ),
    Palette(
        name="고대비", css_id="contrast", dark=True,
        wnd=_h("000000"), card=_h("000000"), border=_h("FFFFFF"), text=_h("FFFFFF"), muted=_h("FFFF00"),
        role=_roles((
            ("000000", "222222", "444444", "FFFFFF", "FFFFFF"),
            ("000000", "222222", "444444", "FFFF00", "FFFF00"),
            ("000000", "222222", "444444", "00FF00", "00FF00"),
            ("000000", "222222", "444444", "FFFFFF", "FFFFFF"),
            ("FFFF00", "FFEA00", "E6D200", "FFFF00", "000000"),
            ("000000", "333333", "555555", "000000", "FFFF00"),
        )),
    ),
)


def palette_at(i):
    """번호로 테마를 고른다. 범위 밖은 잘라 낸다."""
    return PALETTES[max(0, min(len(PALETTES) - 1, int(i)))]


def theme_names():
    """설정 창과 메뉴에 쓰는 테마 이름 목록이다."""
    return [p.name for p in PALETTES]


def stylesheet_for(p):
    """팔레트를 Qt 스타일시트로 옮긴다.

    메뉴 · 대화 상자 · 편집칸 · 콤보 · 체크 · 스크롤바 · 툴팁까지, Qt 가
    그리는 것은 모두 여기서 색을 받는다. 기본값에 맡기는 자리가 없다.
    """
    fn_base = p.fill(BtnRole.FN, BtnState.BASE)
    fn_hover = p.fill(BtnRole.FN, BtnState.HOVER)
    fn_press = p.fill(BtnRole.FN, BtnState.PRESS)
    fn_text = p.text_of(BtnRole.FN)
    accent = p.fill(BtnRole.PRIMARY, BtnState.BASE)
    accent_text = p.text_of(BtnRole.PRIMARY)
    sel = accent

    return f"""
QWidget {{
    background: {p.wnd};
    color: {p.text};
    selection-background-color: {sel};
    selection-color: {accent_text};
}}
QMainWindow, QDialog {{ background: {p.wnd}; }}
QMenuBar {{
    background: {p.wnd};
    color: {p.text};
    border-bottom: 1px solid {p.border};
    padding: 2px 4px;
}}
QMenuBar::item {{ background: transparent; padding: 4px 10px; border-radius: 6px; }}
QMenuBar::item:selected {{ background: {fn_hover}; color: {fn_text}; }}
QMenuBar::item:pressed {{ background: {fn_press}; }}
QMenu {{
    background: {p.card};
    color: {p.text};
    border: 1px solid {p.border};
    padding: 4px;
}}
QMenu::item {{ padding: 5px 28px 5px 24px; border-radius: 4px; }}
QMenu::item:selected {{ background: {accent}; color: {accent_text}; }}
QMenu::item:disabled {{ color: {p.muted}; }}
QMenu::separator {{ height: 1px; background: {p.border}; margin: 4px 6px; }}
QMenu::indicator {{ width: 14px; height: 14px; left: 6px; }}
QPlainTextEdit, QTextEdit, QLineEdit {{
    background: {p.card};
    color: {p.text};
    border: 1px solid {p.border};
    border-radius: 8px;
    padding: 6px;
    selection-background-color: {sel};
    selection-color: {accent_text};
}}
QLabel {{ background: transparent; color: {p.text}; }}
QLabel[muted="true"] {{ color: {p.muted}; }}
QPushButton {{
    background: {fn_base};
    color: {fn_text};
    border: 1px solid {p.border};
    border-radius: 6px;
    padding: 5px 16px;
    min-height: 18px;
}}
QPushButton:hover {{ background: {fn_hover}; border-color: {accent}; }}
QPushButton:pressed {{ background: {fn_press}; }}
QPushButton:default {{ border-color: {accent}; }}
QPushButton:disabled {{ color: {p.muted}; }}
QComboBox {{
    background: {fn_base};
    color: {fn_text};
    border: 1px solid {p.border};
    border-radius: 6px;
    padding: 4px 8px;
    min-height: 20px;
}}
QComboBox:hover {{ border-color: {accent}; }}
QComboBox::drop-down {{ border: none; width: 22px; }}
QComboBox QAbstractItemView {{
    background: {p.card};
    color: {p.text};
    border: 1px solid {p.border};
    selection-background-color: {accent};
    selection-color: {accent_text};
    outline: 0;
}}
QCheckBox {{ background: transparent; color: {p.text}; spacing: 8px; }}
QCheckBox::indicator {{
    width: 16px; height: 16px;
    border: 1px solid {p.border};
    border-radius: 4px;
    background: {p.card};
}}
QCheckBox::indicator:checked {{ background: {accent}; border-color: {accent}; }}
QToolTip {{
    background: {p.card};
    color: {p.text};
    border: 1px solid {p.border};
    padding: 4px 6px;
}}
QScrollBar:vertical {{ background: {p.wnd}; width: 12px; margin: 0; }}
QScrollBar::handle:vertical {{ background: {p.border}; border-radius: 5px; min-height: 24px; margin: 2px; }}
QScrollBar::handle:vertical:hover {{ background: {p.muted}; }}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
QScrollBar:horizontal {{ background: {p.wnd}; height: 12px; margin: 0; }}
QScrollBar::handle:horizontal {{ background: {p.border}; border-radius: 5px; min-width: 24px; margin: 2px; }}
QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{ width: 0; }}
QFrame[divider="true"] {{ background: {p.border}; }}
QStatusBar {{ background: {p.wnd}; color: {p.muted}; border-top: 1px solid {p.border}; }}
QMessageBox {{ background: {p.card}; }}
"""


__all__ = [
    "PALETTES",
    "ROLE_COUNT",
    "BtnRole",
    "BtnState",
    "Palette",
    "palette_at",
    "stylesheet_for",
    "theme_names",
    "ui_role",
]
