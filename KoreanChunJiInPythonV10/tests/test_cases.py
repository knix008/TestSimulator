"""천지인 조합 엔진의 회귀 시험.

기대값을 손으로 옮겨 적지 않는다. KoreanChunJiInC++/tests/test_engine.c 에서
뽑아 `test/cases.tsv` 에 적어 둔 것을 읽어 돈다. 그 파일은 Rust 판
(`KoreanChunJiInRustV10`)이 `gen-testcases` 로 만든 것을 그대로 가져왔다.

C 코드에서도 계산으로 만들어지는 항목(영문 26자 전수, 라벨-입력 일치)과
원본 함수를 직접 부르는 항목은 자료로 옮길 수 없어 `test_engine.py` 에 둔다.
"""

from __future__ import annotations

from chunjiin import testkit as kit
from tests.common import State, run_keys

GROUP = "조합 엔진"


def load():
    return kit.load_cases()


def run_case(c):
    """한 항목을 돌리고 결과를 견준다. 맞으면 참이다."""
    s = State()
    run_keys(s, c.seq)

    # 무엇을 눌러 무엇이 나와야 하는지 남긴다. 이름만으로는 그 항목이
    # 무엇을 보는지 알 수 없기 때문이다.
    detail = f"{c.kind_label()}  {c.seq} -> {c.show()}"

    if c.kind == "expect":
        # 확정한 뒤 버퍼를 비교한다.
        s.commit()
        got = s.text()
        ok, note = got == c.want, repr(got)
    elif c.kind == "live":
        # 확정하지 않고, 조합 중인 모습 그대로 비교한다.
        got = s.text()
        ok, note = got == c.want, f"{got!r} (조합 중)"
    elif c.kind == "cursor":
        got = s.text()
        assert c.cursor is not None, "cursor 항목에 커서 위치가 없다"
        ok = got == c.want and s.cursor_pos == c.cursor
        note = f"{got!r} @{s.cursor_pos}"
    elif c.kind == "comp":
        got = s.composition_text()
        ok, note = got == c.want, repr(got)
    elif c.kind == "mode":
        got = s.mode_name()
        ok, note = got == c.want, repr(got)
    else:
        raise AssertionError(f"모르는 종류: {c.kind!r}")

    if not ok:
        detail = f"{detail}   그런데 {note}"
    kit.check(ok, GROUP, c.section, c.name, detail)
    return ok


def test_cpp_suite():
    """C++ 판에서 뽑아 온 항목을 구역별로 돌린다."""
    rows = load()
    tally = kit.Tally()

    # 구역은 원본에 나온 차례를 그대로 지킨다. 자료가 그 차례로 적혀
    # 있으므로 따로 정렬하지 않는다.
    for c in rows:
        tally.add(run_case(c))

    seen = []
    for c in rows:
        if c.section not in seen:
            seen.append(c.section)

    print(f"{len(seen)} 구역 {len(rows)} 항목")
    tally.assert_clean("C++ 원본 회귀 시험")


def test_cases_file_shape():
    """뽑아 온 자료 자체가 성한지 본다.

    뽑아내는 프로그램이 조용히 망가지면 시험이 통째로 비어도 통과해 버린다.
    """
    rows = load()
    tally = kit.Tally()

    # C++ 판에서 뽑아 올 수 있는 항목 수. 원본이 늘거나 줄면 이 값도 고친다.
    want_count = 430
    section = "자료 검사"

    tally.add(
        kit.check(
            len(rows) == want_count,
            GROUP,
            section,
            "항목 수",
            f"{len(rows)} 개 (기대 {want_count} 개)",
        )
    )

    shape_ok = True
    for i, r in enumerate(rows):
        if not r.section or not r.name:
            print(f"{i} 번째 항목에 구역이나 이름이 없다: {r}")
            shape_ok = False
        if r.kind == "cursor" and r.cursor is None:
            print(f"{i} 번째 cursor 항목에 커서 위치가 없다: {r}")
            shape_ok = False
    tally.add(
        kit.check(shape_ok, GROUP, section, "칸이 다 찼는가", "구역 · 이름 · 커서 위치")
    )

    # 다섯 가지 비교 축이 모두 들어 있어야 한다.
    for kind in ("expect", "live", "cursor", "comp", "mode"):
        n = sum(1 for r in rows if r.kind == kind)
        tally.add(
            kit.check(n > 0, GROUP, section, f"{kind} 항목이 있는가", f"{n} 개")
        )

    tally.assert_clean("시험 자료 검사")
