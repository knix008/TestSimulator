//! 천지인 조합 엔진의 회귀 시험.
//!
//! 기대값을 손으로 옮겨 적지 않는다. KoreanChunJiInC++/tests/test_engine.c 에서
//! 뽑아 `tests/cases.tsv` 에 적어 둔 것을 읽어 돈다. 원본이 고쳐지면 아래를
//! 다시 돌려 자료를 갱신한다.
//!
//! ```sh
//! ./scripts/gen-testcases.sh          # 또는 scripts\gen-testcases.ps1
//! ```
//!
//! C 코드에서도 계산으로 만들어지는 항목(영문 26자 전수, 라벨-입력 일치)과
//! 원본 함수를 직접 부르는 항목은 자료로 옮길 수 없어 `engine.rs` 에 둔다.

mod common;

use chunjiin_engine::State;
use chunjiin_testkit as kit;
use common::run_keys;

const GROUP: &str = "조합 엔진 · C++ 원본에서 뽑아 온 자료";
/// 시험 자료의 자리다. 저장소 루트의 `test/` 에 둔다.
/// 통합 시험은 꾸러미 폴더에서 도므로 거기서부터 거슬러 올라간다.
const CASES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../test/cases.tsv");

fn load() -> Vec<kit::Case> {
    kit::load_cases(CASES).unwrap_or_else(|e| panic!("{e}"))
}

/// 한 항목을 돌리고 결과를 견준다. 맞으면 참이다.
fn run_case(c: &kit::Case) -> bool {
    let mut s = State::new();
    run_keys(&mut s, &c.seq);

    // 무엇을 눌러 무엇이 나와야 하는지 남긴다. 이름만으로는 그 항목이
    // 무엇을 보는지 알 수 없기 때문이다.
    let detail = format!("{}  {} -> {}", c.kind_label(), c.seq, c.show());

    let (ok, note) = match c.kind.as_str() {
        // 확정한 뒤 버퍼를 비교한다.
        "expect" => {
            s.commit();
            let got = s.text();
            (got == c.want, format!("{:?}", got))
        }
        // 확정하지 않고, 조합 중인 모습 그대로 비교한다.
        "live" => {
            let got = s.text();
            (got == c.want, format!("{:?} (조합 중)", got))
        }
        "cursor" => {
            let got = s.text();
            let want_cur = c.cursor.expect("cursor 항목에 커서 위치가 없다");
            (
                got == c.want && s.cursor_pos == want_cur,
                format!("{:?} @{}", got, s.cursor_pos),
            )
        }
        "comp" => {
            let got = s.composition_text();
            (got == c.want, format!("{:?}", got))
        }
        "mode" => {
            let got = s.mode_name();
            (got == c.want, format!("{:?}", got))
        }
        other => panic!("모르는 종류: {other:?}"),
    };

    let detail = if ok {
        detail
    } else {
        format!("{detail}   그런데 {note}")
    };
    kit::check(ok, GROUP, &c.section, &c.name, &detail);
    ok
}

/// C++ 판에서 뽑아 온 항목을 구역별로 돌린다.
#[test]
fn cpp_suite() {
    let rows = load();
    let mut tally = kit::Tally::default();

    // 구역은 원본에 나온 차례를 그대로 지킨다. 자료가 그 차례로 적혀
    // 있으므로 따로 정렬하지 않는다.
    for c in &rows {
        tally.add(run_case(c));
    }

    let sections = {
        let mut seen: Vec<&str> = Vec::new();
        for c in &rows {
            if !seen.contains(&c.section.as_str()) {
                seen.push(&c.section);
            }
        }
        seen.len()
    };

    println!("{} 구역 {} 항목", sections, rows.len());
    tally.assert_clean("C++ 원본 회귀 시험");
}

/// 뽑아 온 자료 자체가 성한지 본다.
///
/// 뽑아내는 프로그램이 조용히 망가지면 시험이 통째로 비어도 통과해 버린다.
#[test]
fn cases_file_shape() {
    let rows = load();
    let mut tally = kit::Tally::default();

    // C++ 판에서 뽑아 올 수 있는 항목 수. 원본이 늘거나 줄면 이 값도 고친다.
    const WANT_COUNT: usize = 430;

    let section = "자료 검사";
    tally.add(kit::check(
        rows.len() == WANT_COUNT,
        GROUP,
        section,
        "항목 수",
        &format!("{} 개 (기대 {WANT_COUNT} 개)", rows.len()),
    ));

    let mut shape_ok = true;
    for (i, r) in rows.iter().enumerate() {
        if r.section.is_empty() || r.name.is_empty() {
            println!("{i} 번째 항목에 구역이나 이름이 없다: {r:?}");
            shape_ok = false;
        }
        if r.kind == "cursor" && r.cursor.is_none() {
            println!("{i} 번째 cursor 항목에 커서 위치가 없다: {r:?}");
            shape_ok = false;
        }
    }
    tally.add(kit::check(
        shape_ok,
        GROUP,
        section,
        "칸이 다 찼는가",
        "구역 · 이름 · 커서 위치",
    ));

    // 다섯 가지 비교 축이 모두 들어 있어야 한다.
    for kind in ["expect", "live", "cursor", "comp", "mode"] {
        let n = rows.iter().filter(|r| r.kind == kind).count();
        tally.add(kit::check(
            n > 0,
            GROUP,
            section,
            &format!("{kind} 항목이 있는가"),
            &format!("{n} 개"),
        ));
    }

    tally.assert_clean("시험 자료 검사");
}
