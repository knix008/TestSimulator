"""chunjiin.py - KoreanChunJiInC++ 의 src/chunjiin.c(원본, 수정 금지) 이식.

    get_unicode   초성·중성·종성 -> 한글 음절 한 글자
    check_double  두 자음이 겹받침을 이루는지
    StateBase     버퍼 · 유니코드 조합 · 초기화

낱자는 모두 정적 표(`CONS_CYCLE`, `VOWEL_RULES`, `DOUBLE_JONG`)에서만
나오므로 그냥 `str` 로 든다. 파이썬 문자열은 불변이라 표에서 꺼내 넣기만
하면 된다.

다만 `HangulState` 는 가변 객체다. Rust 판은 `Copy` 라서 대입이 곧
복사였지만 파이썬은 참조다. 앞 음절을 기억해 둘 때 그대로 대입하면 두
이름이 한 몸이 되므로 그 자리마다 `.copy()` 를 쓴다.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum

# 편집 버퍼에 담을 수 있는 최대 문자 수.
#
# 원본이 널 종료 배열이라 4096 중 한 칸을 널에 썼으므로 실제로 담기는 것은
# MAX_TEXT_LEN - 1 자다. 그 값을 그대로 맞춘다.
MAX_TEXT_LEN = 4096

# 천지인 키패드의 키 개수다(0 ~ 11).
KEY_COUNT = 12

# 입력 모드의 가짓수다.
MODE_COUNT = 5


class InputMode(Enum):
    """입력 모드다. 값은 설정 파일에 저장되는 번호이고 Rust 판과 같다."""

    HANGUL = 0
    ENGLISH = 1
    UPPER_ENGLISH = 2
    NUMBER = 3
    SPECIAL = 4

    @staticmethod
    def from_index(i):
        """번호를 모드로 바꾼다. 범위를 벗어나면 None 이다."""
        try:
            return InputMode(i)
        except ValueError:
            return None

    @property
    def index(self):
        """모드의 번호다."""
        return self.value

    def next(self):
        """다음 모드다. 한글 -> 영소 -> 영대 -> 숫자 -> 기호 -> 한글."""
        return InputMode((self.value + 1) % MODE_COUNT)


class JamoSlot(Enum):
    """조합 중인 낱자가 마지막으로 들어간 자리다."""

    NONE = 0
    CHOSUNG = 1
    JUNGSUNG = 2
    JONGSUNG = 3
    JONGSUNG2 = 4


@dataclass
class HangulState:
    """조합 중인 한 음절의 상태다.

    `jungsung` 에는 완성 모음뿐 아니라 중간 상태인 "·"(아래아 1개),
    "‥"(아래아 2개) 도 들어간다. `get_unicode()` 가 이 두 값을
    "아직 모음이 아님" 으로 다룬다.
    """

    chosung: str = ""
    jungsung: str = ""
    jongsung: str = ""
    jongsung2: str = ""  # 겹받침의 두 번째 자음

    step: JamoSlot = JamoSlot.NONE  # 마지막으로 채워진 자리
    flag_writing: bool = False  # 참이면 커서 앞 칸이 조합 중인 글자다

    flag_dotused: bool = False  # 아래아(·)로 시작한 모음인지
    flag_doubled: bool = False  # 현재 자음이 쌍자음으로 바뀐 상태인지
    flag_addcursor: bool = False  # 직전 입력에서 음절이 확정되었는지
    flag_space: bool = False  # 직전 입력이 공백이었는지

    def reset(self):
        """원본 hangul_init() 이다."""
        self.__dict__.update(HangulState().__dict__)

    def is_empty(self):
        """낱자가 하나도 없는 상태인지 본다."""
        return not (self.chosung or self.jungsung or self.jongsung)

    def copy(self):
        """값 복사본이다. 대입은 참조라 이것을 써야 한다."""
        return replace(self)


# ---------------------------------------------------------------------
# 유니코드 조합 - 원본 get_unicode()
# ---------------------------------------------------------------------

# 홀로 보여 줄 때 쓰는 호환 자모. Rust 판은 코드포인트로 적었고 여기서는
# 글자를 그대로 적는다. 원본 chunjiin.c 의 차례를 눈으로 대조할 수 있게 둔다.
COMPAT_CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
COMPAT_JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
COMPAT_JONG = "\0ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"  # 0번은 받침 없음

# 원본의 if/else 사슬을 표로 바꾼 것이다. 사슬 끝의 기본값(ㅎ/ㅣ/ㅎ)도 그대로 둔다.
CHO_ORDER = tuple(COMPAT_CHO)
JUNG_ORDER = tuple(COMPAT_JUNG)
JONG_ORDER = ("",) + tuple(COMPAT_JONG[1:])


def _index_of(order, v, fallback):
    try:
        return order.index(v)
    except ValueError:
        return fallback


def _is_dot(jung):
    return jung in ("·", "‥")


def get_unicode(h, real_jong):
    """조합 상태를 화면에 찍을 글자 하나로 만든다.

    아직 글자가 되지 못했으면 None 이다. 원본 get_unicode() 와 같다.

    주의: 초성이 비어 있으면 cho 가 18(=ㅎ)로 떨어진다. 그래서 초성 없이
    종성만 채우면 엉뚱한 글자가 나온다. 오토마타가 그 상태를 만들지 않는다.
    """
    if not h.chosung and (not h.jungsung or _is_dot(h.jungsung)):
        return None

    cho = _index_of(CHO_ORDER, h.chosung, 18)  # 없으면 ㅎ

    if not h.jungsung and not h.jongsung:
        return COMPAT_CHO[cho]
    if _is_dot(h.jungsung):
        return COMPAT_CHO[cho]

    jung = _index_of(JUNG_ORDER, h.jungsung, 20)  # 없으면 ㅣ

    if not h.chosung and not h.jongsung:
        return COMPAT_JUNG[jung]

    jong = _index_of(JONG_ORDER, real_jong, 27) if real_jong else 0  # 없으면 ㅎ

    if not h.chosung and not h.jungsung:
        return COMPAT_JONG[jong]

    return chr(44032 + cho * 588 + jung * 28 + jong)


# 겹받침 표. 원본 check_double() 과 같다. 열한 줄짜리 표라 훑는 편이 해시보다 싸다.
DOUBLE_JONG = (
    ("ㄱ", "ㅅ", "ㄳ"),
    ("ㄴ", "ㅈ", "ㄵ"),
    ("ㄴ", "ㅎ", "ㄶ"),
    ("ㄹ", "ㄱ", "ㄺ"),
    ("ㄹ", "ㅁ", "ㄻ"),
    ("ㄹ", "ㅂ", "ㄼ"),
    ("ㄹ", "ㅅ", "ㄽ"),
    ("ㄹ", "ㅌ", "ㄾ"),
    ("ㄹ", "ㅍ", "ㄿ"),
    ("ㄹ", "ㅎ", "ㅀ"),
    ("ㅂ", "ㅅ", "ㅄ"),
)


def check_double(jong, jong2):
    """`jong` 뒤에 `jong2` 가 붙어 겹받침이 되는지 본다. 되지 않으면 빈 문자열이다."""
    for a, b, out in DOUBLE_JONG:
        if a == jong and b == jong2:
            return out
    return ""


# ---------------------------------------------------------------------
# 상태 - 버퍼와 초기화. 오토마타는 input.py 가, 표시는 labels.py 가 잇는다.
# ---------------------------------------------------------------------


class StateBase:
    """입력기 전체 상태의 바탕이다. 원본 chunjiin.c 가 다루는 자리까지만 안다."""

    def __init__(self):
        self.hangul = HangulState()
        self.now_mode = InputMode.HANGUL

        self.engnum = None  # 영문/숫자/기호 모드에서 조합 중인 문자
        self.flag_initengnum = False  # engnum 이 화면에 반영되어 있는지
        self.flag_engdelete = False  # 다음 입력이 덮어쓰기(멀티탭 연타)인지

        self.text_buffer = []  # 글자 하나씩
        self.cursor_pos = 0  # 삽입 위치. 조합 중이면 조합 글자는 cursor_pos - compose_len 부터다

        # 아래는 chunjiin.c 가 쓰지 않는 확장 필드다.
        self.last_key = -1  # 직전에 눌린 키, 없으면 -1
        self.tap_count = 0  # 같은 키 연타 위치
        self.compose_len = 0  # 조합 중인 글자가 차지하는 칸 수 (0~2)

        # 겹받침 되돌려 붙이기용. 받침 뒤에 온 자음이 겹받침을 이루지 못해
        # 새 음절로 떨어져 나갔을 때 바로 앞 음절을 기억해 둔다.
        # (만 + ㅅ -> 만ㅅ -> 많)
        self.prev_syllable = HangulState()
        self.prev_mergeable = False

    # -- 버퍼 ------------------------------------------------------------

    def text(self):
        """현재 편집 버퍼다. 원본 wchar_to_utf8() 자리를 대신한다."""
        return "".join(self.text_buffer)

    def __len__(self):
        """편집 버퍼의 글자 수다."""
        return len(self.text_buffer)

    def is_empty(self):
        return not self.text_buffer

    def _clamp_cursor(self):
        """커서를 유효 범위로 보정한다."""
        if self.cursor_pos > MAX_TEXT_LEN - 1:
            self.cursor_pos = MAX_TEXT_LEN - 1
        if self.cursor_pos > len(self.text_buffer):
            self.cursor_pos = len(self.text_buffer)

    # -- 초기화 - 원본 chunjiin_init() -------------------------------------

    def _chunjiin_init(self):
        self.hangul.reset()
        self.now_mode = InputMode.HANGUL
        self._init_engnum()
        self.text_buffer.clear()
        self.cursor_pos = 0
        self._clamp_cursor()

    def _init_engnum(self):
        self.engnum = None
        self.flag_initengnum = False
        self.flag_engdelete = False

    # -- 텍스트 조작 -------------------------------------------------------

    def _delete_char(self):
        """커서 앞의 한 칸을 지운다. 원본 delete_char() 와 같다."""
        if self.cursor_pos == 0:
            return
        del self.text_buffer[self.cursor_pos - 1]
        self.cursor_pos -= 1
        self._clamp_cursor()

    def _text_insert(self, ch):
        """커서 위치에 한 글자를 끼워 넣는다. 가득 차면 버린다."""
        if len(self.text_buffer) >= MAX_TEXT_LEN - 1:
            return
        if self.cursor_pos > len(self.text_buffer):
            self.cursor_pos = len(self.text_buffer)
        self.text_buffer.insert(self.cursor_pos, ch)
        self.cursor_pos += 1
        self._clamp_cursor()
