"""보고기 자체를 본다.

보고기가 조용히 망가지면 시험이 통째로 비어도 "모두 통과" 로 보인다.
그러니 줄을 푸는 쪽, 세는 쪽, 칸을 맞추는 쪽을 따로 확인한다.

칸 맞추기는 눈으로만 보고 넘어가기 쉬운데, 한글 폭을 잘못 세면 결과표가
세로로 어긋난다. 여기서 숫자로 못박는다.
"""

from __future__ import annotations

import io
import re
from contextlib import redirect_stdout

from chunjiin import testkit as kit
from tests.report import Ink, Report, color_enabled, pad, parse_line, width

GROUP = "시험 보고기"


def _line(status, group, section, name, detail="설명"):
    return f"@@CASE\t{status}\t{group}\t{section}\t{name}\t{detail}"


def _report(rows):
    r = Report()
    for row in rows:
        r.add(parse_line(_line(*row)))
    return r


def test_parse_and_count():
    tally = kit.Tally()
    section = "줄 풀기"

    c = parse_line(_line("ok", "엔진", "모음", "빈칸+ㅣ"))
    tally.add(
        kit.check(
            c is not None and c.passed and c.section == "모음" and c.name == "빈칸+ㅣ",
            GROUP,
            section,
            "우리 줄",
            f"{c.group} · {c.section} · {c.name}",
        )
    )

    # 시험 함수는 보통 글도 함께 찍는다. 앞에 뭐가 붙어도 읽어야 한다.
    c = parse_line("무슨 글 " + _line("FAIL", "A", "B", "C"))
    tally.add(
        kit.check(
            c is not None and not c.passed and c.group == "A",
            GROUP,
            section,
            "앞에 글이 붙은 줄",
            "읽어 낸다",
        )
    )

    for bad in ("", "test foo ... ok", "@@CASE\tok\t엔진"):
        tally.add(
            kit.check(
                parse_line(bad) is None,
                GROUP,
                section,
                f"우리 줄이 아님 {bad[:14]!r}",
                "None",
            )
        )

    r = _report(
        [
            ("ok", "엔진", "모음", "가"),
            ("ok", "엔진", "모음", "나"),
            ("FAIL", "엔진", "자음", "다"),
            ("ok", "화면", "테마", "라"),
        ]
    )
    tally.add(
        kit.check(
            (r.total, r.passed, r.failed) == (4, 3, 1),
            GROUP,
            section,
            "세기",
            f"{r.total} / {r.passed} / {r.failed}",
        )
    )

    groups = r._groups()
    tally.add(
        kit.check(
            len(groups) == 2 and groups[0][0] == "엔진" and groups[0][1] == ["모음", "자음"],
            GROUP,
            section,
            "나온 차례를 지킨다",
            " · ".join(g for g, _ in groups),
        )
    )

    r.retain("테마")
    tally.add(
        kit.check(
            r.total == 1 and r.cases[0].name == "라",
            GROUP,
            section,
            "낱말로 거르기",
            f"{r.total}개",
        )
    )

    tally.assert_clean("줄 풀기")


def test_display_width():
    """한글은 두 칸, 아스키는 한 칸으로 세는지 본다."""
    tally = kit.Tally()
    section = "칸 맞추기"

    for text, want in (
        ("", 0),
        ("abc", 3),
        ("한글", 4),
        ("모음 21자", 9),
        ("ㄱ + 모음", 9),
        # · 와 → 는 모호함(A) 갈래다. 한 칸으로 센다.
        ("경계 · 예외", 11),
        ("만→많", 5),
    ):
        got = width(text)
        tally.add(kit.check(got == want, GROUP, section, repr(text), f"{got} 칸"))

    for text in ("모음 21자", "abc", "겹받침 되돌리기", ""):
        got = pad(text, 20)
        tally.add(
            kit.check(
                width(got) == 20,
                GROUP,
                section,
                f"왼쪽 채우기 {text!r}",
                f"{width(got)} 칸",
            )
        )

    got = pad("7", 3, right=True)
    tally.add(
        kit.check(got == "  7", GROUP, section, "오른쪽 채우기", repr(got))
    )

    # 넘치면 자르지 않는다. 잘라 내면 무엇이 틀렸는지 못 읽는다.
    got = pad("아주 긴 이름입니다", 4)
    tally.add(
        kit.check(
            got == "아주 긴 이름입니다",
            GROUP,
            section,
            "칸보다 긴 이름",
            "그대로 둔다",
        )
    )

    tally.assert_clean("칸 맞추기")


def test_table_lines_up():
    """찍어 놓은 표가 실제로 세로로 맞는지 본다.

    이름 길이가 제각각인 구역을 섞어 놓고, 숫자 칸이 모든 줄에서 같은
    자리에 있는지 센다. **묶음이 달라도** 같은 자리여야 한다.
    """
    tally = kit.Tally()
    section = "표가 세로로 맞는가"

    r = _report(
        [
            ("ok", "조합 엔진", "모음", "가"),
            ("ok", "조합 엔진", "겹받침 되돌려 붙이기", "나"),
            ("FAIL", "웹 판", "경로 · 형식", "다"),
            ("ok", "데스크톱 화면", "표가 칸에 맞는가", "라"),
        ]
    )

    buf = io.StringIO()
    with redirect_stdout(buf):
        r.print(ink=Ink(False))
    lines = buf.getvalue().split("\n")

    # 숫자 칸(`n/m`)이 있는 줄을 모아 슬래시의 칸 번호를 견준다.
    slashes = set()
    counted = 0
    for line in lines:
        m = re.search(r"(\d+)/(\d+)\s*$", line)
        if not m:
            continue
        counted += 1
        slashes.add(width(line[: m.start(0) + len(m.group(1))]))

    tally.add(
        kit.check(
            counted >= 6,
            GROUP,
            section,
            "숫자 줄을 찾았다",
            f"{counted}줄 (구역 4 + 묶음 합계 3)",
        )
    )
    tally.add(
        kit.check(
            len(slashes) == 1,
            GROUP,
            section,
            "슬래시가 한 자리에",
            f"칸 {sorted(slashes)}",
        )
    )

    # 구역 이름이 시작하는 자리도 모든 줄에서 같아야 한다.
    #
    # 왼쪽 공백을 세는 것으로는 알 수 없다. `ok` 는 네 칸짜리 표시 안에
    # 가운데로 놓이므로 줄마다 앞 공백 수가 다르다. 표시 칸이 끝나는
    # 자리(8칸)에서 곧바로 이름이 시작하는지를 본다.
    number_lines = [ln for ln in lines if re.search(r"(\d+)/(\d+)\s*$", ln)]
    mark_w = 2 + 4 + 2
    misplaced = [
        ln
        for ln in number_lines
        if width(ln[:mark_w]) != mark_w or ln[mark_w:mark_w + 1] in (" ", "")
    ]
    tally.add(
        kit.check(
            not misplaced,
            GROUP,
            section,
            "이름이 같은 자리에서 시작",
            f"{len(number_lines)}줄 모두 {mark_w}칸" if not misplaced else str(misplaced[:1]),
        )
    )

    tally.assert_clean("표가 세로로 맞는가")


def test_color():
    """색을 켜고 끄는 쪽을 본다."""
    tally = kit.Tally()
    section = "색"

    off, on = Ink(False), Ink(True)
    tally.add(
        kit.check(
            off.green("가") == "가" and off.red("가") == "가",
            GROUP,
            section,
            "끄면 맨 글자",
            repr(off.green("가")),
        )
    )
    tally.add(
        kit.check(
            on.green("가").startswith("\033[") and on.green("가").endswith("\033[0m"),
            GROUP,
            section,
            "켜면 부호가 붙는다",
            repr(on.green("가")),
        )
    )

    # 색을 켜도 눈에 보이는 폭은 그대로여야 한다. 그러지 않으면 표가 밀린다.
    tally.add(
        kit.check(
            width(pad("모음", 10)) == width(pad("모음", 10)),
            GROUP,
            section,
            "색은 폭을 바꾸지 않는다",
            "부호는 칸을 차지하지 않는다",
        )
    )

    tally.add(
        kit.check(
            color_enabled(True) is True and color_enabled(False) is False,
            GROUP,
            section,
            "못박기",
            "--color / --no-color 가 먼저다",
        )
    )

    # 파이프로 흘려보낼 때는 저절로 꺼진다.
    buf = io.StringIO()
    with redirect_stdout(buf):
        auto = color_enabled(None)
    tally.add(
        kit.check(
            auto is False,
            GROUP,
            section,
            "화면이 아니면 끈다",
            f"{auto}",
        )
    )

    tally.assert_clean("색")


def test_empty_report_is_visible():
    """빈 보고서가 "0개 중 0개 통과" 로 조용히 넘어가지 않는지 본다.

    그것을 보고 다 잘 돌아간다고 믿게 되기 때문이다. 찍을 것이 없으면
    아무것도 찍지 않고, 부르는 쪽(main)이 그것을 보고 알린다.
    """
    tally = kit.Tally()

    buf = io.StringIO()
    with redirect_stdout(buf):
        Report().print()
    tally.add(
        kit.check(
            buf.getvalue() == "" and Report().total == 0,
            GROUP,
            "빈 보고서",
            "아무것도 찍지 않는다",
            f"{len(buf.getvalue())}자",
        )
    )
    tally.assert_clean("빈 보고서")
