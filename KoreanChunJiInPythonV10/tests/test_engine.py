"""자료로 뽑아 올 수 없는 엔진 시험.

기대값이 표로 적혀 있는 항목은 C++ 원본에서 뽑아 `tests/cases.tsv` 에 두고
`test_cases.py` 가 돌린다. 여기 남은 것은 C 쪽에서도 계산으로 만들어지거나
(영문 26자 전수, 라벨-입력 일치) 원본 함수를 직접 부르는 시험이라
자료로 옮길 수 없다.
"""

from __future__ import annotations

from chunjiin import testkit as kit
from chunjiin.engine import (
    KEY_COUNT,
    MAX_TEXT_LEN,
    MODE_COUNT,
    MODE_NAMES,
    HangulState,
    InputMode,
    KeyRole,
    check_double,
    get_unicode,
)
from chunjiin.engine.chunjiin import COMPAT_CHO, COMPAT_JONG, COMPAT_JUNG
from tests.common import State, run_keys

GROUP = "조합 엔진 · 계산으로 만드는 시험"


# ---------------------------------------------------------------------
# 영문 26자 전수
# ---------------------------------------------------------------------


def test_english_alphabet():
    """알파벳 26자를 소문자·대문자로 모두 눌러 본다.

    키 0~8 에 세 글자씩. i 번째 키를 (j+1) 번 누르면 그 키의 j 번째 글자다.
    """
    sets = ("abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwx", "yz")
    tally = kit.Tally()

    for upper in (False, True):
        mode = "U" if upper else "E"
        section = "영문 대문자 전수" if upper else "영문 소문자 전수"

        for key, chars in enumerate(sets):
            for i, ch in enumerate(chars):
                # i 번째 글자를 얻으려면 그 키를 (i+1) 번 누른다
                seq = mode + str(key) * (i + 1)
                want = ch.upper() if upper else ch

                s = State()
                run_keys(s, seq)
                s.commit()

                got = s.text()
                tally.add(
                    kit.check(got == want, GROUP, section, want, f"{seq} -> {got}")
                )
    tally.assert_clean("영문 26자 전수")


# ---------------------------------------------------------------------
# 라벨 - 입력 일치
# ---------------------------------------------------------------------


def test_key_labels():
    """버튼에 적힌 글자와 실제로 들어가는 글자가 맞는지 본다.

    키를 한 번 눌렀을 때 나오는 문자는 라벨의 첫 글자여야 한다.
    (배열을 바꿨을 때 라벨만 그대로 남는 실수를 막는다)
    """
    modes = (
        ("한글", "H"),
        ("영소", "E"),
        ("영대", "U"),
        ("숫자", "N"),
        ("기호", "S"),
    )
    tally = kit.Tally()

    for name, seq in modes:
        for key in range(KEY_COUNT):
            s = State()
            run_keys(s, seq)

            label = s.key_label(key)
            if not label:
                tally.add(
                    kit.check(
                        False,
                        GROUP,
                        "라벨-입력 일치",
                        f"{name} 키{key}",
                        "라벨이 비어 있다",
                    )
                )
                continue
            want = label[0]

            s.key(key)
            s.commit()
            got = s.text()

            tally.add(
                kit.check(
                    got == want,
                    GROUP,
                    "라벨-입력 일치",
                    f"{name} 키{key}",
                    f"라벨 {label} -> {got}",
                )
            )
    tally.assert_clean("라벨-입력 일치")


# ---------------------------------------------------------------------
# 표시 API 경계
# ---------------------------------------------------------------------


def test_display_api():
    """표시용 API 의 경계를 본다."""
    tally = kit.Tally()
    section = "표시 API"

    s = State()
    tally.add(
        kit.check(
            s.key_label(KEY_COUNT) == "",
            GROUP,
            section,
            "라벨 12",
            "범위 밖은 빈 문자열",
        )
    )

    all_filled = True
    for m in range(MODE_COUNT):
        st = State()
        st.set_mode_index(m)
        for k in range(KEY_COUNT):
            if not st.key_label(k):
                print(f"{st.mode_name()} 모드 키{k} 라벨이 비었다")
                all_filled = False
    tally.add(
        kit.check(all_filled, GROUP, section, "라벨 빈칸 없음", "다섯 모드 12키")
    )

    st = State()
    roles = (
        (0, KeyRole.VOWEL),
        (1, KeyRole.VOWEL),
        (2, KeyRole.VOWEL),
        (3, KeyRole.CONS),
        (9, KeyRole.MOD),
        (11, KeyRole.MOD),
    )
    roles_ok = all(st.key_role_of(k) == want for k, want in roles)

    # 한글 모드가 아니면 12키가 모두 같은 색이다
    st = State()
    st.set_mode(InputMode.NUMBER)
    roles_ok = roles_ok and all(
        st.key_role_of(k) == KeyRole.CONS for k in range(KEY_COUNT)
    )

    tally.add(kit.check(roles_ok, GROUP, section, "역할 구분", "모음 · 자음 · 부호"))

    st = State()
    run_keys(st, "301")
    want = "한글    조합 ㄱ + ㅏ + -    1자"
    tally.add(
        kit.check(st.status_text() == want, GROUP, section, "상태줄", st.status_text())
    )

    tally.add(
        kit.check(
            all(bool(n) for n in MODE_NAMES),
            GROUP,
            section,
            "모드 이름 5개",
            " · ".join(MODE_NAMES),
        )
    )

    tally.assert_clean("표시 API")


# ---------------------------------------------------------------------
# 원본 chunjiin.c 함수 직접 확인
# ---------------------------------------------------------------------


def test_check_double_table():
    pairs = (
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
        ("ㄱ", "ㄱ", ""),
        ("ㄴ", "ㅅ", ""),
        ("ㄹ", "ㄴ", ""),
        ("ㅁ", "ㅅ", ""),
        ("ㅅ", "ㅅ", ""),
        ("ㅇ", "ㄱ", ""),
    )
    tally = kit.Tally()

    for a, b, want in pairs:
        got = check_double(a, b)
        note = f"{a} + {b} -> 겹받침 아님" if not want else f"{a} + {b} -> {got}"
        tally.add(kit.check(got == want, GROUP, "겹받침 표", f"{a}+{b}", note))
    tally.assert_clean("겹받침 표")


def test_get_unicode_table():
    cases = (
        ("빈 상태", "", "", "", 0),
        ("초성만 ㄱ", "ㄱ", "", "", 0x3131),
        ("초성만 ㅎ", "ㅎ", "", "", 0x314E),
        ("중성만 ㅏ", "", "ㅏ", "", 0x314F),
        ("중성만 ㅣ", "", "ㅣ", "", 0x3163),
        ("아래아 중간", "ㄱ", "·", "", 0x3131),
        ("가", "ㄱ", "ㅏ", "", 0xAC00),
        ("간", "ㄱ", "ㅏ", "ㄴ", 0xAC04),
        ("힣", "ㅎ", "ㅣ", "ㅎ", 0xD7A3),
    )
    tally = kit.Tally()

    for name, cho, jung, jong, want in cases:
        h = HangulState(chosung=cho, jungsung=jung, jongsung=jong)
        code = get_unicode(h, jong)
        got = ord(code) if code is not None else 0

        def dash(v):
            return v if v else "-"

        tally.add(
            kit.check(
                got == want,
                GROUP,
                "유니코드 조합",
                name,
                f"{dash(cho)}+{dash(jung)}+{dash(jong)} -> U+{got:04X}",
            )
        )
    tally.assert_clean("유니코드 조합")


def test_compat_tables():
    """호환 자모 표가 원본과 길이·값이 같은지 본다.

    Rust 판은 코드포인트를 하나씩 적었고 여기서는 글자를 그대로 적었다.
    옮겨 적으면서 한 칸이 밀리면 조합이 통째로 어긋나므로 전수로 확인한다.
    """
    tally = kit.Tally()
    section = "호환 자모 표"

    for name, table, count, first, last in (
        ("초성", COMPAT_CHO, 19, 0x3131, 0x314E),
        ("중성", COMPAT_JUNG, 21, 0x314F, 0x3163),
        ("종성", COMPAT_JONG, 28, 0x0000, 0x314E),
    ):
        ok = len(table) == count and ord(table[0]) == first and ord(table[-1]) == last
        tally.add(
            kit.check(
                ok,
                GROUP,
                section,
                f"{name} {count}칸",
                f"{len(table)}칸 U+{ord(table[0]):04X}..U+{ord(table[-1]):04X}",
            )
        )

    # 표 안에 같은 글자가 두 번 나오면 어딘가 밀린 것이다(종성 0번은 뺀다).
    for name, table in (
        ("초성", COMPAT_CHO),
        ("중성", COMPAT_JUNG),
        ("종성", COMPAT_JONG[1:]),
    ):
        tally.add(
            kit.check(
                len(set(table)) == len(table),
                GROUP,
                section,
                f"{name} 겹치지 않음",
                f"{len(set(table))}/{len(table)} 가지",
            )
        )

    tally.assert_clean("호환 자모 표")


def test_text_utf8():
    """원본 wchar_to_utf8() 자리를 대신하는 text() 를 본다."""
    cases = (
        ("빈 문자열", ""),
        ("ASCII", "A"),
        ("한 글자", "가"),
        ("여러 글자", "가나다"),
        ("섞임", "a가1!"),
        ("낱자", "ㄱㅏ"),
        ("줄바꿈", "가\n나"),
    )
    tally = kit.Tally()

    for name, src in cases:
        s = State()
        s.insert_str(src)
        ok = s.text() == src and len(s) == len(src)
        tally.add(
            kit.check(ok, GROUP, "UTF-8 왕복", name, f"{s.text()!r} · {len(s)}자")
        )
    tally.assert_clean("UTF-8 왕복")


# ---------------------------------------------------------------------
# 경계 · 예외
# ---------------------------------------------------------------------


def test_edge_cases():
    tally = kit.Tally()
    section = "경계 · 예외"

    s = State()
    s.key(-1)
    s.key(12)
    s.key(99)
    tally.add(
        kit.check(
            s.text() == "", GROUP, section, "범위밖 키", "-1 · 12 · 99 는 무시된다"
        )
    )

    s = State()
    for _ in range(MAX_TEXT_LEN + 100):
        s.insert_char("x")
    ok = len(s) == MAX_TEXT_LEN - 1 and s.cursor_pos < MAX_TEXT_LEN
    tally.add(
        kit.check(ok, GROUP, section, "버퍼 한계", f"{len(s)}자 @{s.cursor_pos}")
    )

    s = State()
    s.commit()
    s.backspace()
    s.move_cursor(-5)
    s.move_cursor(5)
    s.commit()
    tally.add(
        kit.check(
            s.text() == "" and s.cursor_pos == 0,
            GROUP,
            section,
            "빈 상태 조작",
            "확정 · 지우기 · 커서 이동",
        )
    )

    s = State()
    run_keys(s, "301477")
    s.reset()
    ok = (
        s.text() == ""
        and s.cursor_pos == 0
        and s.compose_len == 0
        and s.last_key == -1
        and not s.prev_mergeable
    )
    tally.add(kit.check(ok, GROUP, section, "Reset", "확장 필드까지 지운다"))

    s = State()
    run_keys(s, "301401{")
    s.delete()
    tally.add(kit.check(s.text() == "나", GROUP, section, "Delete", repr(s.text())))

    s = State()
    run_keys(s, "301")
    s.set_text("안녕하세요\r\n반갑습니다")
    want = "안녕하세요\n반갑습니다"
    ok = s.text() == want and s.cursor_pos == len(s)
    tally.add(
        kit.check(
            ok, GROUP, section, "SetText", "캐리지 리턴을 버리고 커서는 끝으로"
        )
    )

    # 앞 음절을 겹받침으로 되돌릴 때 사본을 뜨지 않으면 둘이 한 몸이 되어
    # 뒤엣것을 고치는 순간 앞엣것까지 바뀐다. Rust 판은 `HangulState` 가
    # `Copy` 라 저절로 막혔지만 파이썬에서는 참조로 새는 자리다.
    # 그래서 여기서 따로 본다. (만 -> 만ㅅ -> 많)
    for seq, want, name in (
        ("aa0147", "만ㅅ", "겹받침 못 이룬 자음"),
        ("aa01477", "많", "겹받침 되돌리기"),
    ):
        s = State()
        run_keys(s, seq)
        s.commit()
        tally.add(
            kit.check(
                s.text() == want, GROUP, section, name, f"{seq} -> {s.text()!r}"
            )
        )

    tally.assert_clean("경계 · 예외")
