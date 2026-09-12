"""input.py - 천지인 입력 오토마타. KoreanChunJiInC++ 의 src/input.c 이식.

키 배열 (인덱스 0~11, 3열 4행)

    ㅣ     ·      ㅡ        0  1  2
    ㄱㅋ   ㄴㄹ   ㄷㅌ      3  4  5
    ㅂㅍ   ㅅㅎ   ㅈㅊ      6  7  8
    . ,    ㅇㅁ   ? !       9  10 11

자음 키는 연타하면 순환한다(ㄱ→ㅋ→ㄲ→ㄱ...).
거센소리·된소리가 모두 순환에 들어 있으므로 획추가/쌍자음 키는 두지 않고,
그 자리에 문장부호 키를 둔다.
"""

from __future__ import annotations

from chunjiin.engine.chunjiin import (
    KEY_COUNT,
    MODE_COUNT,
    HangulState,
    InputMode,
    JamoSlot,
    StateBase,
    check_double,
    get_unicode,
)

KEY_I = 0  # ㅣ
KEY_DOT = 1  # 아래아
KEY_EU = 2  # ㅡ
KEY_PUNCT1 = 9  # . ,
KEY_PUNCT2 = 11  # ? !

# 자음 키의 순환 목록이다. 자음 키가 아니면 비어 있다.
# 키 번호와 나란히 읽을 수 있게 한 줄에 한 키씩 둔다.
CONS_CYCLE = (
    (),  # 0  ㅣ
    (),  # 1  아래아
    (),  # 2  ㅡ
    ("ㄱ", "ㅋ", "ㄲ"),  # 3
    ("ㄴ", "ㄹ"),  # 4
    ("ㄷ", "ㅌ", "ㄸ"),  # 5
    ("ㅂ", "ㅍ", "ㅃ"),  # 6
    ("ㅅ", "ㅎ", "ㅆ"),  # 7
    ("ㅈ", "ㅊ", "ㅉ"),  # 8
    (),  # 9  . ,
    ("ㅇ", "ㅁ"),  # 10
    (),  # 11 ? !
)

# 그런 조합이 없다는 표시다(원본의 NULL).
NO_VOWEL = "-"

# 모음 전이표. (현재 중성, ㅣ, 아래아, ㅡ, 되돌릴 중성).
#
# NO_VOWEL 이면 그 조합은 없으므로 현재 음절을 확정하고 새 음절을 시작한다.
# 마지막 칸은 백스페이스로 한 단계 되돌릴 때 쓴다.
#
# ㅝ 는 ㅠ + ㅣ 로 들어온다. ㅠㅣ 라는 모음이 없기 때문에 그 자리를 ㅝ 로
# 쓰는 것이 천지인의 규칙이다. 표 모양은 원본과 눈으로 대조할 수 있게 그대로 둔다.
VOWEL_RULES = (
    #  from     ㅣ         아래아     ㅡ         prev
    ("",     "ㅣ",     "·",      "ㅡ",     ""),
    ("·",    "ㅓ",     "‥",      "ㅗ",     ""),
    ("‥",    "ㅕ",     "·",      "ㅛ",     "·"),
    ("ㅣ",   NO_VOWEL, "ㅏ",     NO_VOWEL, ""),
    ("ㅡ",   "ㅢ",     "ㅜ",     NO_VOWEL, ""),
    ("ㅏ",   "ㅐ",     "ㅑ",     NO_VOWEL, "ㅣ"),
    ("ㅑ",   "ㅒ",     "ㅏ",     NO_VOWEL, "ㅏ"),
    ("ㅓ",   "ㅔ",     "ㅕ",     NO_VOWEL, "·"),
    ("ㅕ",   "ㅖ",     "ㅓ",     NO_VOWEL, "ㅓ"),
    ("ㅗ",   "ㅚ",     "ㅛ",     NO_VOWEL, "·"),
    ("ㅛ",   NO_VOWEL, "ㅗ",     NO_VOWEL, "ㅗ"),
    ("ㅜ",   "ㅟ",     "ㅠ",     NO_VOWEL, "ㅡ"),
    ("ㅠ",   "ㅝ",     "ㅜ",     NO_VOWEL, "ㅜ"),
    ("ㅚ",   NO_VOWEL, "ㅘ",     NO_VOWEL, "ㅗ"),
    ("ㅘ",   "ㅙ",     NO_VOWEL, NO_VOWEL, "ㅚ"),
    ("ㅝ",   "ㅞ",     NO_VOWEL, NO_VOWEL, "ㅠ"),
    ("ㅐ",   NO_VOWEL, NO_VOWEL, NO_VOWEL, "ㅏ"),
    ("ㅒ",   NO_VOWEL, NO_VOWEL, NO_VOWEL, "ㅑ"),
    ("ㅔ",   NO_VOWEL, NO_VOWEL, NO_VOWEL, "ㅓ"),
    ("ㅖ",   NO_VOWEL, NO_VOWEL, NO_VOWEL, "ㅕ"),
    ("ㅙ",   NO_VOWEL, NO_VOWEL, NO_VOWEL, "ㅘ"),
    ("ㅞ",   NO_VOWEL, NO_VOWEL, NO_VOWEL, "ㅝ"),
    ("ㅟ",   NO_VOWEL, NO_VOWEL, NO_VOWEL, "ㅜ"),
    ("ㅢ",   NO_VOWEL, NO_VOWEL, NO_VOWEL, "ㅡ"),
)

# 표는 줄로 적어 두고 현재 중성으로 바로 찾을 수 있게 풀어 둔다.
_VOWEL_BY_FROM = {row[0]: row for row in VOWEL_RULES}

# 받침으로 쓸 수 있는 자음이다 (ㄸ ㅃ ㅉ 은 불가).
VALID_JONG = frozenset("ㄱㄲㄴㄷㄹㅁㅂㅅㅆㅇㅈㅊㅋㅌㅍㅎ")


# ---------------------------------------------------------------------
# 작은 도우미들
# ---------------------------------------------------------------------


def _is_dot_state(jung):
    return jung in ("·", "‥")


def _is_valid_jong(c):
    return bool(c) and c in VALID_JONG


def _can_combine_jong(jong, c):
    """`jong` + `c` 가 겹받침을 이루는지 본다."""
    return bool(check_double(jong, c))


def _vowel_next(jung, key):
    """모음 전이 결과다. 불가능하면 None 이다."""
    row = _VOWEL_BY_FROM.get(jung)
    if row is None:
        return None
    if key == KEY_I:
        v = row[1]
    elif key == KEY_DOT:
        v = row[2]
    elif key == KEY_EU:
        v = row[3]
    else:
        return None
    return None if v == NO_VOWEL else v


def _vowel_prev(jung):
    row = _VOWEL_BY_FROM.get(jung)
    return row[4] if row else ""


def is_cons_key(key):
    return 0 <= key < KEY_COUNT and bool(CONS_CYCLE[key])


def is_vowel_key(key):
    return key in (KEY_I, KEY_DOT, KEY_EU)


def _cons_slot(h):
    """지금 조합에서 "마지막으로 채워진 자음 자리" 를 읽는다. 자음 자리가 아니면 None 이다."""
    if h.step == JamoSlot.CHOSUNG:
        return h.chosung
    if h.step == JamoSlot.JONGSUNG:
        return h.jongsung
    if h.step == JamoSlot.JONGSUNG2:
        return h.jongsung2
    return None


def _set_cons_slot(h, v):
    if h.step == JamoSlot.CHOSUNG:
        h.chosung = v
    elif h.step == JamoSlot.JONGSUNG:
        h.jongsung = v
    elif h.step == JamoSlot.JONGSUNG2:
        h.jongsung2 = v


def compose_display(h):
    """조합 중인 상태를 화면에 보여줄 글자들로 만든다. 최대 2칸.

    아래아만 찍힌 중간 상태에서는 get_unicode() 가 None 을 돌려주므로
    아무것도 보이지 않는다. 그래서 이때는 초성(있으면)과 아래아를 직접 이어
    "ㄱ·", "·", "‥" 처럼 눈에 보이게 만든다.
    """
    out = []

    if _is_dot_state(h.jungsung):
        if h.chosung:
            # 초성 홀로일 때의 호환 자모를 얻으려고 중성을 잠시 비운다
            tmp = h.copy()
            tmp.jungsung = ""
            code = get_unicode(tmp, "")
            if code is not None:
                out.append(code)
        out.append(h.jungsung[0])  # 아래아 한 개 또는 두 개
        return out

    real_jong = h.jongsung
    if h.jongsung2:
        merged = check_double(h.jongsung, h.jongsung2)
        if merged:
            real_jong = merged

    code = get_unicode(h, real_jong)
    if code is not None:
        out.append(code)
    return out


# ---------------------------------------------------------------------
# 영문 / 숫자 / 기호 배열
# ---------------------------------------------------------------------

# 영문 배열이다.
#
# 한 키에 세 글자까지만 둔다. 그래서 알파벳 26자가 위 3x3 (0~8번) 을 채우고,
# 마지막 줄 세 키(9~11)가 자주 쓰는 기호를 맡는다. 나머지 기호는 기호
# 모드에서 넣는다. 띄어쓰기는 스페이스 버튼과 스페이스바가 따로 있으므로
# 키패드에 두지 않는다. 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
ENG_MAP = (
    "abc", "def", "ghi",
    "jkl", "mno", "pqr",
    "stu", "vwx", "yz",
    ".,?", "!'\"", "-:@",
)

# 키마다 숫자 하나씩이다. 순환하지 않는다.
NUM_MAP = ("1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#")

# 기호 모드다. 한 키에 세 개씩, 12키로 36개를 덮는다.
# 영문 모드에 넣지 못한 기호는 모두 여기에 있다.
SPECIAL_MAP = (
    ".,:", "?!;", "'\"`",
    "-_~", "+=*", "/\\|",
    "()&", "[]^", "{}%",
    "<>#", "@$₩", "※…・",
)


class StateInput(StateBase):
    """오토마타와 편집 API 다. 원본 input.c 에 해당한다."""

    # -- 화면 출력 - 조합 중인 글자는 cursor_pos-1 자리에서 계속 갱신된다 ----

    def _write_hangul(self):
        """조합 중인 글자를 화면에 반영한다. 직전에 그려 둔 compose_len 칸을 지우고 새로 그린다."""
        shown = compose_display(self.hangul)

        while self.compose_len > 0:
            self._delete_char()
            self.compose_len -= 1
        for ch in shown:
            before = len(self.text_buffer)
            self._text_insert(ch)
            if len(self.text_buffer) > before:
                self.compose_len += 1
        self.hangul.flag_writing = self.compose_len > 0

    def _write_engnum(self):
        ch = self.engnum
        if ch is None:
            return

        if self.flag_engdelete and self.cursor_pos > 0:
            self.text_buffer[self.cursor_pos - 1] = ch
        else:
            self._text_insert(ch)
        self.flag_engdelete = True
        self.flag_initengnum = True

    # -- 입력 처리 - 원본 chunjiin_process_input() ---------------------------

    def key(self, key):
        """키패드 키(0~11) 하나를 처리한다. 범위 밖은 무시한다."""
        if not isinstance(key, int) or not 0 <= key <= 11:
            return

        if self.now_mode == InputMode.HANGUL:
            self._hangul_make(key)
            self._write_hangul()
        elif self.now_mode in (InputMode.ENGLISH, InputMode.UPPER_ENGLISH):
            self._eng_make(key)
            self._write_engnum()
        elif self.now_mode == InputMode.NUMBER:
            self._num_make(key)
            self._write_engnum()
        else:
            self._special_make(key)
            self._write_engnum()

    # -- 음절 확정 -----------------------------------------------------------

    def _commit_and_start(self):
        """현재 조합을 버퍼에 반영하고 새 음절을 시작할 수 있는 상태로 만든다.

        아직 모음이 되지 못한 아래아도 그대로 둔다. 사용자가 그걸 남길
        생각이었는지 아닌지 알 수 없으므로 임의로 지우지 않는다.
        """
        self._write_hangul()
        self.hangul.reset()  # flag_writing = False -> 다음 글자는 새로 삽입
        self.hangul.flag_addcursor = True
        self.compose_len = 0  # 이미 찍힌 칸은 확정 글자가 된다
        self.prev_mergeable = False
        self.last_key = -1
        self.tap_count = 0

    def commit(self):
        """조합 중인 글자를 확정한다(더 이상 수정되지 않게 만든다)."""
        if self.now_mode == InputMode.HANGUL:
            if self.hangul.flag_writing:
                self._write_hangul()
            self.hangul.reset()
            self.compose_len = 0
        else:
            self._init_engnum()
        self.prev_mergeable = False
        self.last_key = -1
        self.tap_count = 0

    # -- 한글 오토마타 -------------------------------------------------------

    def _start_with_chosung(self, c, key, mergeable):
        """자음 c 를 새 음절의 초성으로 삼는다.

        mergeable 이면 방금 확정한 음절을 기억해 둔다. 같은 키를 한 번 더
        눌러 겹받침이 되는 자음이 나오면 _try_merge_jong() 이 도로 합친다.
        """
        previous = self.hangul.copy()  # 참조가 아니라 사본이어야 한다

        self._commit_and_start()
        if mergeable:
            self.prev_syllable = previous
            self.prev_mergeable = True
        self.hangul.chosung = c
        self.hangul.step = JamoSlot.CHOSUNG
        self.last_key = key
        self.tap_count = 0

    def _try_merge_jong(self, key):
        """떨어져 나온 초성을 앞 음절의 겹받침으로 되돌린다.

        성공하면 조합 영역이 앞 칸까지 넓어지고, 이어지는 _write_hangul() 이
        두 칸을 지우고 합쳐진 한 글자를 그린다.
        """
        cycle = CONS_CYCLE[key]
        n = len(cycle)

        if self.hangul.step != JamoSlot.CHOSUNG or self.hangul.jungsung:
            return False
        if not self.prev_syllable.jongsung or self.prev_syllable.jongsung2:
            return False

        for i in range(1, n + 1):
            idx = (self.tap_count + i) % n
            cand = cycle[idx]
            if not _can_combine_jong(self.prev_syllable.jongsung, cand):
                continue

            self.compose_len += 1  # 앞 칸(확정된 음절)도 다시 그린다
            self.hangul = self.prev_syllable.copy()
            self.hangul.jongsung2 = cand
            self.hangul.step = JamoSlot.JONGSUNG2
            self.hangul.flag_writing = True
            self.tap_count = idx
            return True
        return False

    def _cycle_consonant(self, key):
        """같은 자음 키 연타 시 현재 자리에서 다음 후보로 순환한다."""
        cycle = CONS_CYCLE[key]
        n = len(cycle)
        slot = _cons_slot(self.hangul)
        if not slot or n == 0:
            return False

        # 다음 후보부터 한 바퀴 돌면서 이 자리에 넣을 수 있는 것을 찾는다
        for i in range(1, n + 1):
            idx = (self.tap_count + i) % n
            cand = cycle[idx]

            if n > 1 and cand == slot:
                continue
            if self.hangul.step == JamoSlot.JONGSUNG and not _is_valid_jong(cand):
                continue
            if self.hangul.step == JamoSlot.JONGSUNG2 and not _can_combine_jong(
                self.hangul.jongsung, cand
            ):
                continue

            _set_cons_slot(self.hangul, cand)
            self.tap_count = idx
            self.hangul.flag_doubled = idx == 2  # 순환 3번째 자리는 항상 된소리
            return True
        return False

    def _hangul_consonant(self, key):
        c = CONS_CYCLE[key][0]
        mergeable = self.prev_mergeable
        h = self.hangul

        self.prev_mergeable = False

        if self.last_key == key:
            if mergeable and self._try_merge_jong(key):
                return
            if self._cycle_consonant(key):
                return

        if not h.chosung and not h.jungsung:
            # 빈 음절 -> 초성
            h.chosung = c
            h.step = JamoSlot.CHOSUNG
            self.last_key = key
            self.tap_count = 0
            return

        if not h.jungsung or _is_dot_state(h.jungsung):
            # 초성만 있거나 아래아만 찍힌 상태 -> 앞을 확정하고 새 음절
            self._start_with_chosung(c, key, False)
            return

        if not h.chosung:
            # 모음만 있던 상태 -> 앞을 확정하고 새 음절
            self._start_with_chosung(c, key, False)
            return

        if not h.jongsung:
            if _is_valid_jong(c):
                h.jongsung = c
                h.step = JamoSlot.JONGSUNG
                self.last_key = key
                self.tap_count = 0
            else:
                self._start_with_chosung(c, key, False)
            return

        if not h.jongsung2 and _can_combine_jong(h.jongsung, c):
            h.jongsung2 = c
            h.step = JamoSlot.JONGSUNG2
            self.last_key = key
            self.tap_count = 0
            return

        # 받침 뒤에 붙지 못한 자음 -> 새 음절. 겹받침으로 되돌아올 수 있게 기억해 둔다.
        self._start_with_chosung(c, key, not h.jongsung2)

    def _hangul_vowel(self, key):
        self.prev_mergeable = False
        h = self.hangul

        # 받침이 있으면 연음: 마지막 자음을 새 음절의 초성으로 넘긴다
        if h.jongsung:
            if h.jongsung2:
                moved = h.jongsung2
                h.jongsung2 = ""
            else:
                moved = h.jongsung
                h.jongsung = ""

            self._commit_and_start()  # 받침을 뺀 모습으로 앞 글자 확정
            h = self.hangul
            h.chosung = moved
            h.step = JamoSlot.CHOSUNG

        nxt = _vowel_next(h.jungsung, key)
        if nxt is None:
            # 이어질 수 없는 모음 조합 -> 앞을 확정하고 새 음절의 중성으로
            self._commit_and_start()
            h = self.hangul
            nxt = _vowel_next("", key)
            if nxt is None:
                return

        h.jungsung = nxt
        h.step = JamoSlot.JUNGSUNG
        h.flag_dotused = _is_dot_state(nxt)
        self.last_key = key
        self.tap_count = 0

    def _hangul_punct(self, key):
        # 문장부호 키 (9 = ". ,", 11 = "? !") 의 순환 목록이다.
        chars = ("?", "!") if key == KEY_PUNCT2 else (".", ",")
        n = len(chars)
        idx = 0

        self.prev_mergeable = False

        if self.last_key == key and not self.hangul.flag_writing and self.cursor_pos > 0:
            idx = (self.tap_count + 1) % n
            self.text_buffer[self.cursor_pos - 1] = chars[idx]
        else:
            self._commit_and_start()  # 조합 중인 글자를 확정하고
            self._text_insert(chars[idx])  # 부호를 새로 넣는다
        self.last_key = key
        self.tap_count = idx

    def _hangul_make(self, key):
        self.hangul.flag_space = False
        self.hangul.flag_addcursor = False

        if is_vowel_key(key):
            self._hangul_vowel(key)
        elif is_cons_key(key):
            self._hangul_consonant(key)
        elif key in (KEY_PUNCT1, KEY_PUNCT2):
            self._hangul_punct(key)

    # -- 영문 / 숫자 / 기호 --------------------------------------------------

    def _multitap_make(self, key, chars, to_upper):
        """휴대전화식 멀티탭이다. 같은 키를 연달아 누르면 목록을 돈다."""
        n = len(chars)
        if n == 0:
            return

        if self.last_key == key and self.flag_engdelete:
            self.tap_count = (self.tap_count + 1) % n
        else:
            self.tap_count = 0
            self.flag_engdelete = False  # 새 문자로 삽입

        c = chars[self.tap_count]
        if to_upper:
            c = c.upper()
        self.engnum = c
        self.last_key = key

    def _eng_make(self, key):
        self._multitap_make(key, ENG_MAP[key], self.now_mode == InputMode.UPPER_ENGLISH)

    def _special_make(self, key):
        self._multitap_make(key, SPECIAL_MAP[key], False)

    def _num_make(self, key):
        self.engnum = NUM_MAP[key]
        self.flag_engdelete = False
        self.last_key = -1
        self.tap_count = 0

    # -- GUI 용 편집 API -----------------------------------------------------

    def reset(self):
        """원본 chunjiin_init() 에 더해 확장 필드까지 초기화한다."""
        self._chunjiin_init()
        self.last_key = -1
        self.tap_count = 0
        self.compose_len = 0
        self.prev_mergeable = False
        self.prev_syllable.reset()

    def clear(self):
        """모드를 유지한 채 전체를 지운다."""
        mode = self.now_mode
        self.reset()
        self.now_mode = mode

    def insert_char(self, ch):
        """임의의 문자를 커서 위치에 그대로 넣는다 (공백, 줄바꿈, 물리 키보드 직접 입력)."""
        self.commit()
        self._text_insert(ch)

    def insert_str(self, text):
        """여러 글자를 차례로 넣는다(붙여넣기, 파일 열기). 캐리지 리턴은 버린다."""
        for ch in text:
            if ch != "\r":
                self.insert_char(ch)

    def space(self):
        """조합을 확정한 뒤 공백을 넣는다."""
        self.insert_char(" ")
        self.hangul.flag_space = True

    def backspace(self):
        """조합 중이면 낱자 단위로 되돌리고, 아니면 글자를 지운다."""
        if self.now_mode == InputMode.HANGUL and self.hangul.flag_writing:
            h = self.hangul

            if h.jongsung2:
                h.jongsung2 = ""
                h.step = JamoSlot.JONGSUNG
            elif h.jongsung:
                h.jongsung = ""
                h.step = JamoSlot.JUNGSUNG if h.jungsung else JamoSlot.CHOSUNG
            elif h.jungsung:
                h.jungsung = _vowel_prev(h.jungsung)
                if h.jungsung:
                    h.step = JamoSlot.JUNGSUNG
                elif h.chosung:
                    h.step = JamoSlot.CHOSUNG
                else:
                    h.step = JamoSlot.NONE
            elif h.chosung:
                h.chosung = ""
                h.step = JamoSlot.NONE

            self._write_hangul()

            if self.hangul.is_empty():
                self.hangul.reset()
            self.prev_mergeable = False
            self.last_key = -1
            self.tap_count = 0
            return

        self.commit()
        self._delete_char()

    def delete(self):
        """커서 뒤의 한 글자를 지운다."""
        if self.cursor_pos < len(self.text_buffer):
            self.move_cursor(1)
            self.backspace()

    def move_cursor(self, delta):
        """커서를 delta 만큼 옮긴다. 조합은 확정된다."""
        self.commit()
        self.cursor_pos = max(0, min(len(self.text_buffer), self.cursor_pos + delta))
        self._clamp_cursor()

    def set_cursor(self, pos):
        """커서를 절대 위치로 옮긴다. 조합은 확정된다."""
        self.commit()
        self.cursor_pos = max(0, min(len(self.text_buffer), pos))
        self._clamp_cursor()

    def set_mode(self, mode):
        """입력 모드를 바꾼다. 조합은 확정된다."""
        self.commit()
        self.now_mode = mode
        self._init_engnum()
        self.last_key = -1
        self.tap_count = 0

    def set_mode_index(self, index):
        """번호로 입력 모드를 바꾼다. 범위를 벗어나면 아무것도 하지 않는다."""
        mode = InputMode.from_index(index)
        if mode is not None:
            self.set_mode(mode)

    def cycle_mode(self):
        """한글 -> 영소 -> 영대 -> 숫자 -> 기호 -> 한글 순으로 돈다."""
        self.set_mode(self.now_mode.next())

    def break_multitap(self):
        """연타 순환을 끊는다.

        "안녕" 처럼 같은 키(ㄴ)가 연달아 필요한 경우, 이 호출 이후의 같은
        키는 순환(ㄴ→ㄹ)이 아니라 새 자음 입력으로 처리된다. 조합 자체는
        유지된다.
        """
        self.last_key = -1
        self.tap_count = 0
        if self.now_mode != InputMode.HANGUL:
            self.flag_engdelete = False

    def set_text(self, text):
        """버퍼를 통째로 갈아 끼우고 커서를 끝으로 보낸다(파일 열기용)."""
        self.clear()
        self.insert_str(text)


__all__ = [
    "CONS_CYCLE",
    "ENG_MAP",
    "KEY_DOT",
    "KEY_EU",
    "KEY_I",
    "KEY_PUNCT1",
    "KEY_PUNCT2",
    "MODE_COUNT",
    "NUM_MAP",
    "SPECIAL_MAP",
    "VOWEL_RULES",
    "HangulState",
    "StateInput",
    "compose_display",
    "is_cons_key",
    "is_vowel_key",
]
