"""labels.py - 화면에 보여 줄 문자열들. input.c 의 표시용 구역에 대응한다.

라벨 배열과 입력 배열(ENG_MAP, SPECIAL_MAP ...)의 순서가 어긋나면
버튼에 적힌 글자와 실제 입력되는 글자가 달라진다. tests/test_engine.py 의
`test_key_labels` 가 다섯 모드 12키를 전수 확인한다.
"""

from __future__ import annotations

from enum import Enum

from chunjiin.engine.chunjiin import KEY_COUNT, InputMode
from chunjiin.engine.input import KEY_PUNCT1, KEY_PUNCT2, StateInput, is_vowel_key

# 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
LABEL_HANGUL = (
    "ㅣ", "·", "ㅡ",
    "ㄱㅋ", "ㄴㄹ", "ㄷㅌ",
    "ㅂㅍ", "ㅅㅎ", "ㅈㅊ",
    ". ,", "ㅇㅁ", "? !",
)

# ENG_MAP 과 같은 순서: 알파벳이 0~8번(3x3), 기호가 9~11번
LABEL_LOWER = (
    "abc", "def", "ghi",
    "jkl", "mno", "pqr",
    "stu", "vwx", "yz",
    ". , ?", "! ' \"", "- : @",
)

LABEL_UPPER = (
    "ABC", "DEF", "GHI",
    "JKL", "MNO", "PQR",
    "STU", "VWX", "YZ",
    ". , ?", "! ' \"", "- : @",
)

LABEL_NUMBER = ("1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#")

# SPECIAL_MAP 과 같은 순서
LABEL_SPECIAL = (
    ". , :", "? ! ;", "' \" `",
    "- _ ~", "+ = *", "/ \\ |",
    "( ) &", "[ ] ^", "{ } %",
    "< > #", "@ $ ₩", "※ … ・",
)

_LABELS = {
    InputMode.HANGUL: LABEL_HANGUL,
    InputMode.ENGLISH: LABEL_LOWER,
    InputMode.UPPER_ENGLISH: LABEL_UPPER,
    InputMode.NUMBER: LABEL_NUMBER,
    InputMode.SPECIAL: LABEL_SPECIAL,
}

# 다섯 모드의 이름이다(메뉴·설정 창에서 쓴다). 차례는 InputMode 의 번호다.
MODE_NAMES = ("한글", "영문 abc", "영문 ABC", "숫자 123", "기호 !@#")


class KeyRole(Enum):
    """키의 역할이다. GUI 가 색을 고를 때 쓴다. 값은 웹 판이 CSS 클래스로 쓰는 이름이다."""

    CONS = "cons"  # 자음 · 일반 키
    VOWEL = "vowel"  # ㅣ · ㅡ
    MOD = "mod"  # 문장부호


class State(StateInput):
    """입력기 전체 상태다. 쓰는 쪽은 이것 하나만 보면 된다."""

    def key_label(self, key):
        """현재 모드에서 키 인덱스(0~11)에 표시할 라벨이다. 범위 밖은 빈 문자열이다."""
        if not 0 <= key < KEY_COUNT:
            return ""
        return _LABELS[self.now_mode][key]

    def mode_name(self):
        """현재 모드 이름이다."""
        return MODE_NAMES[self.now_mode.index]

    def key_role_of(self, key):
        """키패드 버튼의 역할이다. 한글 모드가 아니면 12키를 모두 같은 색으로 그린다."""
        if self.now_mode != InputMode.HANGUL:
            return KeyRole.CONS
        if is_vowel_key(key):
            return KeyRole.VOWEL
        if key in (KEY_PUNCT1, KEY_PUNCT2):
            return KeyRole.MOD
        return KeyRole.CONS

    def composition_text(self):
        """조합 중인 낱자 상태를 사람이 읽을 수 있는 문자열로 만든다(상태 표시줄용).

        조합 중이 아니면 빈 문자열이다.
        """
        h = self.hangul

        if self.now_mode != InputMode.HANGUL:
            if self.engnum is not None and self.flag_engdelete:
                return self.engnum
            return ""

        if h.is_empty():
            return ""

        def dash(v):
            return v if v else "-"

        return f"{dash(h.chosung)} + {dash(h.jungsung)} + {dash(h.jongsung)}{h.jongsung2}"

    def status_text(self):
        """상태줄 한 줄이다. "한글    조합 ㄱ + ㅏ + -    3자" 꼴."""
        comp = self.composition_text() or "–"
        return f"{self.mode_name()}    조합 {comp}    {len(self)}자"
