"""화면 쪽 시험.

색표 · 설정 · 배치 · 커서 변환 · 언어 · 그림처럼 Qt 없이 볼 수 있는 것을
먼저 보고, 마지막에 창까지 실제로 만들어 보는 스모크 시험을 둔다.

Qt 가 깔려 있지 않거나 화면이 없는 자리에서도 앞의 것들은 그대로 돈다.
창 시험만 건너뛴다.
"""

from __future__ import annotations

import json
import os
import tempfile

from chunjiin import testkit as kit
from chunjiin.engine import KEY_COUNT, MODE_COUNT, KeyRole
from chunjiin.ui import help as helpmod
from chunjiin.ui import settings as setmod
from chunjiin.ui.icons import TOOL_ICONS, Icon, icon_circles, icon_dots, icon_polylines
from chunjiin.ui.lang import (
    FN_COUNT,
    LANGS,
    TOOL_COUNT,
    Lang,
    string_fields,
    strings_for,
)
from chunjiin.ui.layout import (
    FN_WEIGHT,
    equal_row,
    flat_pos_of,
    row_col_of,
    v_grid,
    weighted_row,
)
from chunjiin.ui.theme import (
    PALETTES,
    ROLE_COUNT,
    BtnRole,
    BtnState,
    palette_at,
    stylesheet_for,
    ui_role,
)

GROUP = "데스크톱 화면"


# ---------------------------------------------------------------------
# 테마
# ---------------------------------------------------------------------


def test_palettes():
    """테마 4종의 색이 하나도 비지 않았는지 전수로 본다.

    한 칸이라도 비면 그 테마에서 글자가 배경에 묻힌다.
    """
    tally = kit.Tally()
    section = "테마 색표"

    def is_hex(v):
        return (
            isinstance(v, str)
            and len(v) == 7
            and v[0] == "#"
            and all(c in "0123456789abcdefABCDEF" for c in v[1:])
        )

    tally.add(
        kit.check(len(PALETTES) == 4, GROUP, section, "테마 4종", f"{len(PALETTES)} 개")
    )

    for p in PALETTES:
        ok = all(is_hex(v) for v in (p.wnd, p.card, p.border, p.text, p.muted))
        ok = ok and len(p.role) == ROLE_COUNT
        ok = ok and all(len(row) == 5 and all(is_hex(v) for v in row) for row in p.role)
        ok = ok and bool(p.name) and bool(p.css_id)
        tally.add(
            kit.check(
                ok,
                GROUP,
                section,
                p.name,
                f"{p.css_id} · 역할 {len(p.role)} · 어두움 {p.dark}",
            )
        )

    # 역할과 상태를 모두 훑어도 빈 값이 없어야 한다.
    holes = 0
    for p in PALETTES:
        for role in BtnRole:
            for state in BtnState:
                if not is_hex(p.fill(role, state)):
                    holes += 1
            if not is_hex(p.border_of(role)) or not is_hex(p.text_of(role)):
                holes += 1
    tally.add(
        kit.check(holes == 0, GROUP, section, "역할×상태 전수", f"빈 칸 {holes} 개")
    )

    # 팔레트만으로 Qt 가 그리는 모든 색을 낸다. 기본값에 맡기는 자리가 없어야
    # 운영체제의 밝기 설정이 우리 색을 뒤엎지 못한다.
    for p in PALETTES:
        sheet = stylesheet_for(p)
        ok = "QMenu" in sheet and "QPlainTextEdit" in sheet and p.wnd in sheet
        tally.add(kit.check(ok, GROUP, section, f"{p.name} 스타일시트", f"{len(sheet)}자"))

    tally.add(
        kit.check(
            palette_at(99) is PALETTES[-1] and palette_at(-1) is PALETTES[0],
            GROUP,
            section,
            "번호 범위 밖",
            "잘라 낸다",
        )
    )

    # 엔진 역할이 화면 역할로 빠짐없이 옮겨져야 한다.
    mapped = {ui_role(r) for r in KeyRole}
    tally.add(
        kit.check(
            mapped == {BtnRole.CONS, BtnRole.VOWEL, BtnRole.MOD},
            GROUP,
            section,
            "역할 옮기기",
            " · ".join(sorted(r.name for r in mapped)),
        )
    )

    tally.assert_clean("테마 색표")


# ---------------------------------------------------------------------
# 언어
# ---------------------------------------------------------------------


def test_lang_tables_complete():
    """두 언어의 모든 칸이 비지 않았는지 전수로 본다."""
    tally = kit.Tally()
    section = "언어표"

    for code in LANGS:
        t = strings_for(code)
        empty = []
        for name in string_fields():
            v = getattr(t, name)
            if isinstance(v, tuple):
                # fn_labels 는 그림을 그리는 자리가 일부러 비어 있다.
                if name != "fn_labels" and any(not x for x in v):
                    empty.append(name)
            elif not v:
                empty.append(name)
        tally.add(
            kit.check(
                not empty,
                GROUP,
                section,
                Lang.name(code),
                "빈 칸 없음" if not empty else "빈 칸: " + ", ".join(empty),
            )
        )

        # 길이가 정해진 표들이다.
        for name, want in (
            ("mode_names", MODE_COUNT),
            ("theme_names", len(PALETTES)),
            ("fn_labels", FN_COUNT),
            ("fn_hints", FN_COUNT),
            ("tips", TOOL_COUNT),
        ):
            got = len(getattr(t, name))
            tally.add(
                kit.check(
                    got == want,
                    GROUP,
                    section,
                    f"{Lang.name(code)} {name}",
                    f"{got}/{want}",
                )
            )

    tally.add(
        kit.check(
            Lang.next(Lang.KO) == Lang.EN and Lang.next(Lang.EN) == Lang.KO,
            GROUP,
            section,
            "언어 순환",
            "ko <-> en",
        )
    )
    tally.add(
        kit.check(
            Lang.from_code("zz") == Lang.KO,
            GROUP,
            section,
            "모르는 코드",
            "한국어로 떨어진다",
        )
    )
    tally.assert_clean("언어표")


def test_help_columns():
    """사용법을 두 칸에 나눠 놓는 셈을 본다."""
    tally = kit.Tally()
    section = "사용법 두 칸"

    for code in LANGS:
        text = strings_for(code).help
        secs = helpmod.sections(text)
        tally.add(
            kit.check(
                len(secs) == 7 and all(s.startswith("[") for s in secs),
                GROUP,
                section,
                f"{Lang.name(code)} 구역",
                f"{len(secs)} 구역",
            )
        )

        # 구역 끝의 빈 줄은 털어 내지만, 글이 적힌 줄은 하나도 새면 안 된다.
        want = [line for line in text.split("\n") if line.strip()]
        got = [
            line for s in secs for line in s.split("\n") if line.strip()
        ]
        tally.add(
            kit.check(
                got == want,
                GROUP,
                section,
                f"{Lang.name(code)} 줄 보존",
                f"{len(got)}/{len(want)} 줄",
            )
        )

        a, b = helpmod.two_columns(text)
        na, nb = len(a.split("\n")), len(b.split("\n"))
        # 어느 쪽도 다른 쪽의 두 배를 넘지 않아야 한다.
        balanced = bool(a) and bool(b) and na < nb * 2 and nb < na * 2
        # 구역이 두 칸에 걸쳐 잘리지 않아야 한다.
        whole = a.startswith("[") and b.startswith("[")
        tally.add(
            kit.check(
                balanced and whole,
                GROUP,
                section,
                f"{Lang.name(code)} 균형",
                f"{na} / {nb} 줄",
            )
        )

    tally.assert_clean("사용법 두 칸")


def test_help_tables_align():
    """사용법의 표가 칸 격자에 맞는지 본다.

    자판 그림과 모음 조합표는 **한글 한 자가 두 칸**이라는 전제로 그려져
    있다. 그 셈(`textgrid`)이 어긋나면 창에서 열이 밀린다. 여기서는 화면
    없이 칸 번호만 세어 본다.

    `A`(모호함) 갈래인 `·` 와 `→` 를 두 칸으로 세면 열이 밀린다. 원본을
    그린 사람이 한 칸으로 잡았기 때문이다. 그것을 지키는 시험이다.
    """
    from chunjiin.ui.textgrid import char_columns, column_starts, line_columns

    tally = kit.Tally()
    section = "표가 칸에 맞는가"

    # 한글과 한글 낱자는 두 칸, 아스키와 · → 는 한 칸이다.
    widths = {
        "가": 2, "ㅏ": 2, "ㄱ": 2, "ㅢ": 2,
        "a": 1, "0": 1, " ": 1, "+": 1, "=": 1,
        "·": 1, "→": 1, "‥": 1,
    }
    bad = [c for c, w in widths.items() if char_columns(c) != w]
    tally.add(
        kit.check(
            not bad,
            GROUP,
            section,
            "글자 폭",
            "모두 맞음" if not bad else f"어긋남: {bad}",
        )
    )

    for code in LANGS:
        text = strings_for(code).help
        name = Lang.name(code)

        # 모음 조합표는 `=` 가 세 열에 나란히 선다.
        table = [
            line
            for line in text.split("\n")
            if line.count("=") == 3 and "+" in line
        ]
        starts = column_starts("\n".join(table), "=")
        aligned = bool(starts) and all(cols == starts[0] for cols in starts)
        tally.add(
            kit.check(
                aligned,
                GROUP,
                section,
                f"{name} 모음 조합표",
                f"{len(starts)}줄 · 열 {starts[0] if starts else '-'}",
            )
        )

        # 물리 키보드 표는 왼쪽 `=` 가 두 줄에서 같은 열에 선다.
        #
        # 오른쪽 `=` 까지 보지는 않는다. 아랫줄의 오른쪽 무리는 `- 0 =`
        # 라서 키 이름에도 `=` 가 들어 있고, 그 무리 자체가 윗줄보다
        # 한 칸 밀려 있다. 원본이 그렇게 그려져 있으므로 그대로 둔다.
        rows = [
            line
            for line in text.split("\n")
            if "1 2 3" in line or "4 5 6" in line
        ]
        firsts = [cols[0] for cols in column_starts("\n".join(rows), "=")]
        aligned = len(firsts) == 2 and firsts[0] == firsts[1]
        tally.add(
            kit.check(
                aligned,
                GROUP,
                section,
                f"{name} 숫자열 표",
                f"{len(firsts)}줄 · 열 {firsts}",
            )
        )

        # 어느 줄도 지나치게 길지 않아야 창이 화면을 넘지 않는다.
        # 사용법 창은 두 칸으로 나뉘므로 한 줄이 이만큼이면 창 폭이
        # 1000픽셀 안쪽이다. 작은 노트북 화면에도 들어간다.
        limit = 88
        longest = max(line_columns(line) for line in text.split("\n"))
        tally.add(
            kit.check(
                longest <= limit,
                GROUP,
                section,
                f"{name} 가장 긴 줄",
                f"{longest} 칸 (한도 {limit})",
            )
        )

    tally.assert_clean("표가 칸에 맞는가")


# ---------------------------------------------------------------------
# 배치
# ---------------------------------------------------------------------


def test_layout():
    """키패드 배치와 커서 변환을 본다. 화면을 하나도 건드리지 않는다."""
    tally = kit.Tally()
    section = "배치 셈"

    # 마지막 칸의 오른쪽 끝은 언제나 폭에 정확히 닿는다.
    ends_ok = True
    for width in (200, 380, 400, 640, 1000):
        for row in (
            equal_row(width, 6, 3),
            weighted_row(width, 6, FN_WEIGHT),
            v_grid(width, 6, 5),
        ):
            x, w = row[-1]
            if abs((x + w) - width) > 1e-6:
                ends_ok = False
    tally.add(kit.check(ends_ok, GROUP, section, "오른쪽 끝", "폭에 정확히 닿는다"))

    # 칸끼리 겹치지 않는다.
    gaps_ok = True
    row = weighted_row(400, 6, FN_WEIGHT)
    for (x0, w0), (x1, _) in zip(row, row[1:]):
        if x1 < x0 + w0 - 1e-6:
            gaps_ok = False
    tally.add(kit.check(gaps_ok, GROUP, section, "겹치지 않음", "기능 버튼 6칸"))

    tally.add(
        kit.check(
            weighted_row(100, 4, []) == [] and equal_row(100, 4, 0) == [],
            GROUP,
            section,
            "빈 줄",
            "칸이 없으면 빈 목록",
        )
    )
    tally.add(
        kit.check(
            all(w >= 0 for _, w in equal_row(2, 6, 3)),
            GROUP,
            section,
            "아주 좁을 때",
            "폭이 음수가 되지 않는다",
        )
    )
    tally.add(
        kit.check(sum(FN_WEIGHT) == 35, GROUP, section, "기능 버튼 비율", str(FN_WEIGHT))
    )

    # 커서 자리 옮기기는 왕복해도 같아야 한다.
    text = "안녕하세요\n반갑습니다\n\n끝"
    trip_ok = all(
        flat_pos_of(text, *row_col_of(text, i)) == i for i in range(len(text) + 1)
    )
    tally.add(kit.check(trip_ok, GROUP, section, "커서 왕복", f"{len(text)}자 전수"))
    tally.add(
        kit.check(
            flat_pos_of(text, 99, 99) == len(text),
            GROUP,
            section,
            "커서 범위 밖",
            "안전하게 자른다",
        )
    )

    tally.assert_clean("배치 셈")


# ---------------------------------------------------------------------
# 그림
# ---------------------------------------------------------------------


def test_icons():
    """그림마다 그릴 것이 하나라도 있는지 본다."""
    tally = kit.Tally()
    section = "그림"

    tally.add(
        kit.check(
            len(TOOL_ICONS) == TOOL_COUNT,
            GROUP,
            section,
            "툴바 그림 수",
            f"{len(TOOL_ICONS)}/{TOOL_COUNT}",
        )
    )

    for ic in Icon:
        lines = icon_polylines(ic, 24)
        circles = icon_circles(ic, 24)
        dots = icon_dots(ic, 24)
        drawn = len(lines) + len(circles) + len(dots)

        # 좌표가 24x24 자리를 벗어나면 버튼 밖으로 삐져나간다.
        inside = all(
            -0.5 <= x <= 24.5 and -0.5 <= y <= 24.5
            for _, pts in lines
            for x, y in pts
        )
        ok = drawn > 0 and inside and all(len(pts) >= 2 for _, pts in lines)
        tally.add(
            kit.check(
                ok,
                GROUP,
                section,
                ic.value,
                f"선 {len(lines)} · 원 {len(circles)} · 점 {len(dots)}",
            )
        )

    # 크기를 바꾸면 좌표도 그만큼 따라가야 한다.
    small = icon_polylines(Icon.NEW, 12)[0][1][0]
    big = icon_polylines(Icon.NEW, 24)[0][1][0]
    tally.add(
        kit.check(
            abs(big[0] - small[0] * 2) < 1e-6,
            GROUP,
            section,
            "크기 따라가기",
            f"12 -> {small[0]:.1f}, 24 -> {big[0]:.1f}",
        )
    )

    tally.assert_clean("그림")


# ---------------------------------------------------------------------
# 기능 버튼과 툴바
# ---------------------------------------------------------------------


def test_button_tables_match():
    """기능 버튼마다 글자든 그림이든 하나는 있는지 본다.

    ↵ 와 ⌫ 는 내장 글꼴에 없는 글자라 반드시 그림이어야 한다.
    """
    from chunjiin.ui.app import FN_ICONS, MIN_WINDOW_W, TOOL_SIZE, toolbar_metrics, toolbar_slot_x

    tally = kit.Tally()
    section = "버튼 표"

    for code in LANGS:
        t = strings_for(code)
        blanks = [
            i
            for i in range(FN_COUNT)
            if not t.fn_labels[i] and FN_ICONS[i] is None
        ]
        tally.add(
            kit.check(
                not blanks,
                GROUP,
                section,
                f"{Lang.name(code)} 기능 버튼",
                "모두 얼굴이 있다" if not blanks else f"빈 칸 {blanks}",
            )
        )

    tally.add(
        kit.check(
            FN_ICONS[4] is Icon.ENTER and FN_ICONS[5] is Icon.BACKSPACE,
            GROUP,
            section,
            "↵ ⌫ 는 그림",
            "글꼴에 없는 글자라 그림으로 그린다",
        )
    )

    # 툴바는 아주 좁아져도 열한 칸이 겹치거나 판 밖으로 나가지 않아야 한다.
    clips = 0
    for width in range(120, int(MIN_WINDOW_W) + 200, 7):
        size, gap, tail = toolbar_metrics(width)
        xs = [toolbar_slot_x(i, width, size, gap, tail) for i in range(TOOL_COUNT)]
        if xs[0] < -0.01 or xs[-1] + size > width + 0.01:
            clips += 1
        for a, b in zip(xs, xs[1:]):
            if b < a + size - 0.01:
                clips += 1
    tally.add(
        kit.check(
            clips == 0, GROUP, section, "툴바가 잘리지 않는다", f"어긋난 폭 {clips} 가지"
        )
    )

    # 창 최소 폭은 툴바가 정한다. 버튼 수나 크기를 고치면 저절로 따라간다.
    size, gap, tail = toolbar_metrics(MIN_WINDOW_W)
    tally.add(
        kit.check(
            abs(size - TOOL_SIZE) < 1e-6,
            GROUP,
            section,
            "최소 폭에서 제 크기",
            f"{size:.1f}px",
        )
    )

    tally.assert_clean("버튼 표")


# ---------------------------------------------------------------------
# 설정
# ---------------------------------------------------------------------


def test_settings_roundtrip():
    """설정을 쓰고 다시 읽어도 값이 같은지, 망가진 파일을 견디는지 본다."""
    tally = kit.Tally()
    section = "설정 저장"

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "Chunjiin", "settings.json")
        setmod.set_settings_path(path)
        try:
            s = setmod.Settings(
                theme=2,
                font_size=28,
                multitap_ms=1500,
                start_mode=3,
                show_toolbar=False,
                show_status=True,
                language=Lang.EN,
            )
            s.save()
            back = setmod.load_settings()
            tally.add(
                kit.check(
                    back == s, GROUP, section, "왕복", f"{back.theme} · {back.font_size}px"
                )
            )

            # 칸 이름이 다른 판과 같아야 설정을 나눠 쓸 수 있다.
            raw = json.load(open(path, encoding="utf-8"))
            want = {
                "theme",
                "fontSize",
                "multitapMs",
                "startMode",
                "showToolbar",
                "showStatus",
                "language",
            }
            tally.add(
                kit.check(
                    set(raw) == want,
                    GROUP,
                    section,
                    "JSON 칸 이름",
                    " · ".join(sorted(raw)),
                )
            )

            # 손으로 고쳐 망가뜨려도 기본값으로 물러난다.
            open(path, "w", encoding="utf-8").write("{ 이건 JSON 이 아니다")
            tally.add(
                kit.check(
                    setmod.load_settings().theme == setmod.DEFAULT_THEME,
                    GROUP,
                    section,
                    "깨진 파일",
                    "기본값으로 물러난다",
                )
            )

            # 범위를 벗어난 값은 잘라 낸다.
            json.dump(
                {"theme": 99, "fontSize": 3, "multitapMs": 99999, "startMode": 9},
                open(path, "w", encoding="utf-8"),
            )
            got = setmod.load_settings()
            ok = (
                got.theme == len(PALETTES) - 1
                and got.font_size == setmod.FONT_CHOICES[0]
                and got.multitap_ms == setmod.TAP_CHOICES[-1]
                and got.start_mode == MODE_COUNT - 1
            )
            tally.add(
                kit.check(
                    ok,
                    GROUP,
                    section,
                    "범위 밖 값",
                    f"{got.theme} · {got.font_size}px · {got.multitap_ms}ms · {got.start_mode}",
                )
            )

            # 파일이 아예 없으면 기본값이되 언어만 운영체제를 따른다.
            os.remove(path)
            fresh = setmod.load_settings()
            tally.add(
                kit.check(
                    fresh.theme == setmod.DEFAULT_THEME
                    and fresh.language in LANGS,
                    GROUP,
                    section,
                    "파일 없음",
                    f"기본값 · 언어 {fresh.language}",
                )
            )
        finally:
            setmod.set_settings_path(None)

    tally.add(
        kit.check(
            setmod.index_in(setmod.FONT_CHOICES, 21) == 2
            and setmod.index_in(setmod.FONT_CHOICES, 99) == 0,
            GROUP,
            section,
            "목록에서 자리 찾기",
            "없으면 0",
        )
    )

    labels = setmod.unit_labels(setmod.FONT_CHOICES, 21, "px", "(기본)")
    tally.add(
        kit.check(
            labels[2] == "21 px  (기본)",
            GROUP,
            section,
            "글꼴 크기 목록",
            labels[2],
        )
    )
    taps = setmod.tap_labels("초", "(기본)")
    tally.add(
        kit.check(taps[2] == "0.8 초  (기본)", GROUP, section, "연타 시간 목록", taps[2])
    )

    tally.assert_clean("설정 저장")


# ---------------------------------------------------------------------
# 창까지 만들어 보는 스모크 시험
# ---------------------------------------------------------------------


def test_window_smoke():
    """창을 실제로 만들어 눌러 본다.

    Qt 가 없거나 화면이 없으면 건너뛴다. 있으면 화면 없는 자리
    (`offscreen`)에서 그린다.
    """
    tally = kit.Tally()
    section = "창 스모크"

    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    try:
        from PySide6.QtWidgets import QApplication, QGridLayout
    except ImportError as e:
        kit.check(True, GROUP, section, "건너뜀", f"PySide6 이 없다 ({e})")
        return

    from chunjiin.ui import font as fontmod
    from chunjiin.ui.app import App, WINDOW_H, WINDOW_W

    fontmod.prepare()
    app = QApplication.instance() or QApplication([])
    fontmod.install()

    with tempfile.TemporaryDirectory() as tmp:
        # 실제 사용자 설정을 건드리지 않는다.
        setmod.set_settings_path(os.path.join(tmp, "settings.json"))
        try:
            w = App()
            w.resize(WINDOW_W, WINDOW_H)
            w.show()
            app.processEvents()

            tally.add(
                kit.check(
                    len(w.keypad.keys) == KEY_COUNT
                    and len(w.keypad.fns) == FN_COUNT
                    and len(w.toolbar.buttons) == TOOL_COUNT,
                    GROUP,
                    section,
                    "버튼 수",
                    f"키 {len(w.keypad.keys)} · 기능 {len(w.keypad.fns)} · 툴바 {len(w.toolbar.buttons)}",
                )
            )

            # 사람이 누르는 것과 같은 자리를 부른다.
            for k in (3, 0, 1, 4):
                w.do_key(k)
            w.state.commit()
            w.refresh()
            app.processEvents()
            tally.add(
                kit.check(
                    w.state.text() == "간" and w.editor.toPlainText() == "간",
                    GROUP,
                    section,
                    "키패드로 치기",
                    f"엔진 {w.state.text()!r} · 화면 {w.editor.toPlainText()!r}",
                )
            )

            # 화면은 엔진을 비추기만 한다. 커서까지 따라와야 한다.
            tally.add(
                kit.check(
                    w.editor.textCursor().position() == w.state.cursor_pos,
                    GROUP,
                    section,
                    "커서 따라오기",
                    f"@{w.editor.textCursor().position()}",
                )
            )

            # 테마 4종을 모두 그려 본다.
            drew = 0
            for i in range(len(PALETTES)):
                w.set_theme(i)
                app.processEvents()
                if not w.grab().isNull():
                    drew += 1
            tally.add(
                kit.check(drew == len(PALETTES), GROUP, section, "테마 4종 그리기", f"{drew}장")
            )

            # 언어를 바꾸면 메뉴와 버튼 글자가 함께 바뀐다.
            w.set_language(Lang.EN)
            app.processEvents()
            en_ok = w.keypad.fns[0]._text == "Mode" and w.windowTitle().startswith(
                "Chunjiin"
            )
            w.set_language(Lang.KO)
            app.processEvents()
            ko_ok = w.keypad.fns[0]._text == "모드"
            tally.add(
                kit.check(en_ok and ko_ok, GROUP, section, "언어 바꾸기", "모드 <-> Mode")
            )

            # 모드를 돌리면 키 라벨이 함께 바뀐다.
            w.cycle_mode()
            app.processEvents()
            tally.add(
                kit.check(
                    w.keypad.keys[0]._text == "abc",
                    GROUP,
                    section,
                    "모드 순환",
                    w.keypad.keys[0]._text,
                )
            )
            w.set_mode(0)

            # 딸린 창은 스크롤 없이 내용에 딱 맞아야 한다.
            from PySide6.QtWidgets import QLabel

            from chunjiin.ui.dialogs import AboutDialog, HelpDialog, SettingsDialog

            dialogs = (
                ("사용법", HelpDialog(w.txt, None, w)),
                ("정보", AboutDialog(w.txt, "1.0", w.txt.theme_names[0], None, w)),
                ("설정", SettingsDialog(w.set, w.txt, None, None, w)),
            )
            for name, dialog in dialogs:
                dialog.adjustSize()
                dialog.show()
                app.processEvents()

                hint = dialog.sizeHint()
                tally.add(
                    kit.check(
                        hint.width() > 0 and hint.height() > 0,
                        GROUP,
                        section,
                        f"{name} 창 크기",
                        f"{hint.width()}x{hint.height()}",
                    )
                )

                # 글상자가 제 크기보다 좁게 눌리면 글이 잘린다.
                cut = [
                    lab.text()[:30]
                    for lab in dialog.findChildren(QLabel)
                    if lab.isVisible() and lab.width() < lab.sizeHint().width()
                ]
                tally.add(
                    kit.check(
                        not cut,
                        GROUP,
                        section,
                        f"{name} 창 글이 잘리지 않음",
                        "모두 제 크기" if not cut else f"잘림: {cut}",
                    )
                )
                dialog.close()
                dialog.deleteLater()

            # 설정 창과 정보 창의 표는 값 칸이 같은 자리에서 시작해야 한다.
            #
            # 여분 폭을 값 칸이 가져가지 않으면 이름 칸이 까닭 없이 벌어져
            # 값이 저 멀리 떨어져 선다. 실제로 그렇게 어긋나 있었다.
            for name, maker in (
                ("정보", lambda: AboutDialog(w.txt, "1.0", w.txt.theme_names[0], None, w)),
                ("설정", lambda: SettingsDialog(w.set, w.txt, None, None, w)),
            ):
                dialog = maker()
                dialog.adjustSize()
                dialog.show()
                app.processEvents()

                grids = [
                    g
                    for g in dialog.findChildren(QGridLayout)
                    if g.columnCount() >= 2 and g.rowCount() >= 3
                ]
                starts = set()
                for g in grids:
                    for r in range(g.rowCount()):
                        item = g.itemAtPosition(r, 1)
                        # 두 칸에 걸친 줄은 값 칸이 없으므로 뺀다.
                        if item is None or item.widget() is None:
                            continue
                        if g.itemAtPosition(r, 0) is item:
                            continue
                        starts.add(item.widget().x())

                tally.add(
                    kit.check(
                        len(starts) == 1,
                        GROUP,
                        section,
                        f"{name} 창 값 칸이 한 자리에",
                        f"x={sorted(starts)}",
                    )
                )
                dialog.close()
                dialog.deleteLater()

            w.close()
            w.deleteLater()
            app.processEvents()
        finally:
            setmod.set_settings_path(None)

    tally.assert_clean("창 스모크")
