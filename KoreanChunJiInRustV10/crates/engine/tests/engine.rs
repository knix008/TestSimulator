//! 자료로 뽑아 올 수 없는 엔진 시험.
//!
//! 기대값이 표로 적혀 있는 항목은 C++ 원본에서 뽑아 `cases.tsv` 에 두고
//! `cases.rs` 가 돌린다. 여기 남은 것은 C 쪽에서도 계산으로 만들어지거나
//! (영문 26자 전수, 라벨-입력 일치) 원본 함수를 직접 부르는 시험이라
//! 자료로 옮길 수 없다.

mod common;

use chunjiin_engine::{
    check_double, get_unicode, HangulState, InputMode, KeyRole, State, KEY_COUNT, MAX_TEXT_LEN,
    MODE_COUNT, MODE_NAMES,
};
use chunjiin_testkit as kit;
use common::run_keys;

const GROUP: &str = "조합 엔진 · 계산으로 만드는 시험";

// ---------------------------------------------------------------------
// 영문 26자 전수
// ---------------------------------------------------------------------

/// 알파벳 26자를 소문자·대문자로 모두 눌러 본다.
/// 키 0~8 에 세 글자씩. i 번째 키를 (j+1) 번 누르면 그 키의 j 번째 글자다.
#[test]
fn english_alphabet() {
    const SETS: [&str; 9] = ["abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwx", "yz"];
    let mut tally = kit::Tally::default();

    for upper in [false, true] {
        let mode = if upper { "U" } else { "E" };
        let section = if upper {
            "영문 대문자 전수"
        } else {
            "영문 소문자 전수"
        };

        for (key, set) in SETS.iter().enumerate() {
            for (i, ch) in set.chars().enumerate() {
                // i 번째 글자를 얻으려면 그 키를 (i+1) 번 누른다
                let digit = (b'0' + key as u8) as char;
                let seq = format!("{mode}{}", digit.to_string().repeat(i + 1));
                let want = if upper {
                    ch.to_ascii_uppercase().to_string()
                } else {
                    ch.to_string()
                };

                let mut s = State::new();
                run_keys(&mut s, &seq);
                s.commit();

                let got = s.text();
                tally.add(kit::check(
                    got == want,
                    GROUP,
                    section,
                    &want,
                    &format!("{seq} -> {got}"),
                ));
            }
        }
    }
    tally.assert_clean("영문 26자 전수");
}

// ---------------------------------------------------------------------
// 라벨 - 입력 일치
// ---------------------------------------------------------------------

/// 버튼에 적힌 글자와 실제로 들어가는 글자가 맞는지 본다.
///
/// 키를 한 번 눌렀을 때 나오는 문자는 라벨의 첫 글자여야 한다.
/// (배열을 바꿨을 때 라벨만 그대로 남는 실수를 막는다)
#[test]
fn key_labels() {
    const MODES: [(&str, &str); 5] = [
        ("한글", "H"),
        ("영소", "E"),
        ("영대", "U"),
        ("숫자", "N"),
        ("기호", "S"),
    ];
    let mut tally = kit::Tally::default();

    for (name, seq) in MODES {
        for key in 0..KEY_COUNT {
            let mut s = State::new();
            run_keys(&mut s, seq);

            let label = s.key_label(key);
            if label.is_empty() {
                tally.add(kit::check(
                    false,
                    GROUP,
                    "라벨-입력 일치",
                    &format!("{name} 키{key}"),
                    "라벨이 비어 있다",
                ));
                continue;
            }
            let want = label.chars().next().unwrap().to_string();

            s.key(key as i32);
            s.commit();
            let got = s.text();

            tally.add(kit::check(
                got == want,
                GROUP,
                "라벨-입력 일치",
                &format!("{name} 키{key}"),
                &format!("라벨 {label} -> {got}"),
            ));
        }
    }
    tally.assert_clean("라벨-입력 일치");
}

// ---------------------------------------------------------------------
// 표시 API 경계
// ---------------------------------------------------------------------

/// 표시용 API 의 경계를 본다.
#[test]
fn display_api() {
    let mut tally = kit::Tally::default();
    let section = "표시 API";
    let s = State::new();

    tally.add(kit::check(
        s.key_label(KEY_COUNT).is_empty(),
        GROUP,
        section,
        "라벨 12",
        "범위 밖은 빈 문자열",
    ));

    let mut all_filled = true;
    for m in 0..MODE_COUNT {
        let mut st = State::new();
        st.set_mode_index(m);
        for k in 0..KEY_COUNT {
            if st.key_label(k).is_empty() {
                println!("{} 모드 키{k} 라벨이 비었다", st.mode_name());
                all_filled = false;
            }
        }
    }
    tally.add(kit::check(
        all_filled,
        GROUP,
        section,
        "라벨 빈칸 없음",
        "다섯 모드 12키",
    ));

    let st = State::new();
    let roles = [
        (0, KeyRole::Vowel),
        (1, KeyRole::Vowel),
        (2, KeyRole::Vowel),
        (3, KeyRole::Cons),
        (9, KeyRole::Mod),
        (11, KeyRole::Mod),
    ];
    let mut roles_ok = roles.iter().all(|(k, want)| st.key_role_of(*k) == *want);

    // 한글 모드가 아니면 12키가 모두 같은 색이다
    let mut st = State::new();
    st.set_mode(InputMode::Number);
    roles_ok &= (0..KEY_COUNT).all(|k| st.key_role_of(k) == KeyRole::Cons);

    tally.add(kit::check(
        roles_ok,
        GROUP,
        section,
        "역할 구분",
        "모음 · 자음 · 부호",
    ));

    let mut st = State::new();
    run_keys(&mut st, "301");
    let want = "한글    조합 ㄱ + ㅏ + -    1자";
    tally.add(kit::check(
        st.status_text() == want,
        GROUP,
        section,
        "상태줄",
        &st.status_text(),
    ));

    tally.add(kit::check(
        MODE_NAMES.iter().all(|n| !n.is_empty()),
        GROUP,
        section,
        "모드 이름 5개",
        &MODE_NAMES.join(" · "),
    ));

    tally.assert_clean("표시 API");
}

// ---------------------------------------------------------------------
// 원본 chunjiin.c 함수 직접 확인
// ---------------------------------------------------------------------

#[test]
fn check_double_table() {
    const PAIRS: [(&str, &str, &str); 17] = [
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
    ];
    let mut tally = kit::Tally::default();

    for (a, b, want) in PAIRS {
        let got = check_double(a, b);
        let note = if want.is_empty() {
            format!("{a} + {b} -> 겹받침 아님")
        } else {
            format!("{a} + {b} -> {got}")
        };
        tally.add(kit::check(
            got == want,
            GROUP,
            "겹받침 표",
            &format!("{a}+{b}"),
            &note,
        ));
    }
    tally.assert_clean("겹받침 표");
}

#[test]
fn get_unicode_table() {
    const CASES: [(&str, &str, &str, &str, u32); 9] = [
        ("빈 상태", "", "", "", 0),
        ("초성만 ㄱ", "ㄱ", "", "", 0x3131),
        ("초성만 ㅎ", "ㅎ", "", "", 0x314E),
        ("중성만 ㅏ", "", "ㅏ", "", 0x314F),
        ("중성만 ㅣ", "", "ㅣ", "", 0x3163),
        ("아래아 중간", "ㄱ", "·", "", 0x3131),
        ("가", "ㄱ", "ㅏ", "", 0xAC00),
        ("간", "ㄱ", "ㅏ", "ㄴ", 0xAC04),
        ("힣", "ㅎ", "ㅣ", "ㅎ", 0xD7A3),
    ];
    let mut tally = kit::Tally::default();

    for (name, cho, jung, jong, want) in CASES {
        let h = HangulState {
            chosung: cho,
            jungsung: jung,
            jongsung: jong,
            ..HangulState::default()
        };
        let got = get_unicode(&h, jong).map(|c| c as u32).unwrap_or(0);

        let dash = |v: &str| if v.is_empty() { "-" } else { v }.to_string();
        tally.add(kit::check(
            got == want,
            GROUP,
            "유니코드 조합",
            name,
            &format!("{}+{}+{} -> U+{got:04X}", dash(cho), dash(jung), dash(jong)),
        ));
    }
    tally.assert_clean("유니코드 조합");
}

/// 원본 `wchar_to_utf8()` 자리를 대신하는 `text()` 를 본다.
#[test]
fn text_utf8() {
    const CASES: [(&str, &str); 7] = [
        ("빈 문자열", ""),
        ("ASCII", "A"),
        ("한 글자", "가"),
        ("여러 글자", "가나다"),
        ("섞임", "a가1!"),
        ("낱자", "ㄱㅏ"),
        ("줄바꿈", "가\n나"),
    ];
    let mut tally = kit::Tally::default();

    for (name, src) in CASES {
        let mut s = State::new();
        s.insert_str(src);
        let ok = s.text() == src && s.len() == src.chars().count();
        tally.add(kit::check(
            ok,
            GROUP,
            "UTF-8 왕복",
            name,
            &format!("{:?} · {}자", s.text(), s.len()),
        ));
    }
    tally.assert_clean("UTF-8 왕복");
}

// ---------------------------------------------------------------------
// 경계 · 예외
// ---------------------------------------------------------------------

#[test]
fn edge_cases() {
    let mut tally = kit::Tally::default();
    let section = "경계 · 예외";

    {
        let mut s = State::new();
        s.key(-1);
        s.key(12);
        s.key(99);
        tally.add(kit::check(
            s.text().is_empty(),
            GROUP,
            section,
            "범위밖 키",
            "-1 · 12 · 99 는 무시된다",
        ));
    }

    {
        let mut s = State::new();
        for _ in 0..MAX_TEXT_LEN + 100 {
            s.insert_char('x');
        }
        let ok = s.len() == MAX_TEXT_LEN - 1 && s.cursor_pos < MAX_TEXT_LEN;
        tally.add(kit::check(
            ok,
            GROUP,
            section,
            "버퍼 한계",
            &format!("{}자 @{}", s.len(), s.cursor_pos),
        ));
    }

    {
        let mut s = State::new();
        s.commit();
        s.backspace();
        s.move_cursor(-5);
        s.move_cursor(5);
        s.commit();
        tally.add(kit::check(
            s.text().is_empty() && s.cursor_pos == 0,
            GROUP,
            section,
            "빈 상태 조작",
            "확정 · 지우기 · 커서 이동",
        ));
    }

    {
        let mut s = State::new();
        run_keys(&mut s, "301477");
        s.reset();
        let ok = s.text().is_empty()
            && s.cursor_pos == 0
            && s.compose_len == 0
            && s.last_key == -1
            && !s.prev_mergeable;
        tally.add(kit::check(
            ok,
            GROUP,
            section,
            "Reset",
            "확장 필드까지 지운다",
        ));
    }

    {
        let mut s = State::new();
        run_keys(&mut s, "301401{");
        s.delete();
        tally.add(kit::check(
            s.text() == "나",
            GROUP,
            section,
            "Delete",
            &format!("{:?}", s.text()),
        ));
    }

    {
        let mut s = State::new();
        run_keys(&mut s, "301");
        s.set_text("안녕하세요\r\n반갑습니다");
        let want = "안녕하세요\n반갑습니다";
        let ok = s.text() == want && s.cursor_pos == s.len();
        tally.add(kit::check(
            ok,
            GROUP,
            section,
            "SetText",
            "캐리지 리턴을 버리고 커서는 끝으로",
        ));
    }

    tally.assert_clean("경계 · 예외");
}
