//! Go 판 `engine_test.go` 를 참고해 더 넓게 훑는 엔진 시험.
//!
//! 표로 뽑아 온 `cases.tsv` 와 `engine.rs` 가 이미 보는 것 위에,
//! 낱자 전수 · 겹받침 전수 · 모드 순환 · 흔한 낱말을 더 둔다.

mod common;

use chunjiin_engine::{
    check_double, get_unicode, HangulState, InputMode, State, KEY_COUNT, MODE_COUNT, MODE_NAMES,
};
use chunjiin_testkit as kit;
use common::run_keys;

const GROUP: &str = "조합 엔진 · 계산으로 만드는 시험";

fn hangul(cho: &'static str, jung: &'static str, jong: &'static str) -> HangulState {
    HangulState {
        chosung: cho,
        jungsung: jung,
        jongsung: jong,
        ..HangulState::default()
    }
}

fn uni(h: &HangulState, jong: &str) -> u32 {
    get_unicode(h, jong).map(|c| c as u32).unwrap_or(0)
}

// ---------------------------------------------------------------------
// 초성 · 중성 낱자 전수 (Go TestGetUnicode 를 표 전체로 넓힘)
// ---------------------------------------------------------------------

#[test]
fn all_choseong_jamo() {
    const CHO: [(&str, u32); 19] = [
        ("ㄱ", 0x3131),
        ("ㄲ", 0x3132),
        ("ㄴ", 0x3134),
        ("ㄷ", 0x3137),
        ("ㄸ", 0x3138),
        ("ㄹ", 0x3139),
        ("ㅁ", 0x3141),
        ("ㅂ", 0x3142),
        ("ㅃ", 0x3143),
        ("ㅅ", 0x3145),
        ("ㅆ", 0x3146),
        ("ㅇ", 0x3147),
        ("ㅈ", 0x3148),
        ("ㅉ", 0x3149),
        ("ㅊ", 0x314A),
        ("ㅋ", 0x314B),
        ("ㅌ", 0x314C),
        ("ㅍ", 0x314D),
        ("ㅎ", 0x314E),
    ];
    let mut tally = kit::Tally::default();
    for (cho, want) in CHO {
        let got = uni(&hangul(cho, "", ""), "");
        tally.add(kit::check(
            got == want,
            GROUP,
            "초성 낱자 전수",
            cho,
            &format!("U+{got:04X}"),
        ));
    }
    tally.assert_clean("초성 낱자 전수");
}

#[test]
fn all_jungseong_jamo() {
    const JUNG: [(&str, u32); 21] = [
        ("ㅏ", 0x314F),
        ("ㅐ", 0x3150),
        ("ㅑ", 0x3151),
        ("ㅒ", 0x3152),
        ("ㅓ", 0x3153),
        ("ㅔ", 0x3154),
        ("ㅕ", 0x3155),
        ("ㅖ", 0x3156),
        ("ㅗ", 0x3157),
        ("ㅘ", 0x3158),
        ("ㅙ", 0x3159),
        ("ㅚ", 0x315A),
        ("ㅛ", 0x315B),
        ("ㅜ", 0x315C),
        ("ㅝ", 0x315D),
        ("ㅞ", 0x315E),
        ("ㅟ", 0x315F),
        ("ㅠ", 0x3160),
        ("ㅡ", 0x3161),
        ("ㅢ", 0x3162),
        ("ㅣ", 0x3163),
    ];
    let mut tally = kit::Tally::default();
    for (jung, want) in JUNG {
        let got = uni(&hangul("", jung, ""), "");
        tally.add(kit::check(
            got == want,
            GROUP,
            "중성 낱자 전수",
            jung,
            &format!("U+{got:04X}"),
        ));
    }
    tally.assert_clean("중성 낱자 전수");
}

// ---------------------------------------------------------------------
// 겹받침 전수: 유효 11쌍 + 나머지 전부 빈 문자열
// ---------------------------------------------------------------------

#[test]
fn check_double_all_pairs() {
    const CONS: [&str; 14] = [
        "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
    ];
    const VALID: [(&str, &str, &str); 11] = [
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
    ];
    let mut tally = kit::Tally::default();
    for a in CONS {
        for b in CONS {
            let want = VALID
                .iter()
                .find(|(x, y, _)| *x == a && *y == b)
                .map(|(_, _, w)| *w)
                .unwrap_or("");
            let got = check_double(a, b);
            let note = if want.is_empty() {
                format!("{a}+{b} -> 아님")
            } else {
                format!("{a}+{b} -> {got}")
            };
            tally.add(kit::check(
                got == want,
                GROUP,
                "겹받침 전수",
                &format!("{a}+{b}"),
                &note,
            ));
        }
    }
    tally.assert_clean("겹받침 전수");
}

// ---------------------------------------------------------------------
// 자음 순환 (도움말 표와 같아야 한다)
// ---------------------------------------------------------------------

#[test]
fn consonant_cycle() {
    const CYCLES: [(&str, &str); 19] = [
        ("3", "ㄱ"),
        ("33", "ㅋ"),
        ("333", "ㄲ"),
        ("4", "ㄴ"),
        ("44", "ㄹ"),
        ("5", "ㄷ"),
        ("55", "ㅌ"),
        ("555", "ㄸ"),
        ("6", "ㅂ"),
        ("66", "ㅍ"),
        ("666", "ㅃ"),
        ("7", "ㅅ"),
        ("77", "ㅎ"),
        ("777", "ㅆ"),
        ("8", "ㅈ"),
        ("88", "ㅊ"),
        ("888", "ㅉ"),
        ("a", "ㅇ"),
        ("aa", "ㅁ"),
    ];
    let mut tally = kit::Tally::default();
    for (seq, want) in CYCLES {
        let mut s = State::new();
        run_keys(&mut s, seq);
        s.commit();
        tally.add(kit::check(
            s.text() == want,
            GROUP,
            "자음 순환 전수",
            want,
            &format!("{seq} -> {:?}", s.text()),
        ));
    }
    tally.assert_clean("자음 순환 전수");
}

// ---------------------------------------------------------------------
// 초성 + ㅏ 열네 글자
// ---------------------------------------------------------------------

#[test]
fn choseong_plus_a() {
    const CASES: [(&str, &str); 14] = [
        ("301", "가"),
        ("401", "나"),
        ("501", "다"),
        ("4401", "라"),
        ("aa01", "마"),
        ("601", "바"),
        ("701", "사"),
        ("a01", "아"),
        ("801", "자"),
        ("8801", "차"),
        ("3301", "카"),
        ("5501", "타"),
        ("6601", "파"),
        ("7701", "하"),
    ];
    let mut tally = kit::Tally::default();
    for (seq, want) in CASES {
        let mut s = State::new();
        run_keys(&mut s, seq);
        s.commit();
        tally.add(kit::check(
            s.text() == want,
            GROUP,
            "초성+ㅏ",
            want,
            &format!("{seq} -> {:?}", s.text()),
        ));
    }
    tally.assert_clean("초성+ㅏ");
}

// ---------------------------------------------------------------------
// Go 판에 없는 흔한 낱말 (시퀀스는 천지인 규칙으로 직접 짠다)
// ---------------------------------------------------------------------

#[test]
fn extra_words() {
    const CASES: [(&str, &str); 12] = [
        ("88104|80|a04", "천지인"),
        ("7701|4244", "하늘"),
        ("55501a", "땅"),
        ("701|4401a", "사랑"),
        ("a06|441103|30", "입력기"),
        ("77013|3112", "학교"),
        ("8804|321", "친구"),
        ("aa103|501", "먹다"),
        ("821|7100|a112", "주세요"),
        ("301aa7017701640501", "감사합니다"),
        ("77014|32|44_a06|441103|30", "한글 입력기"),
        ("a014|4110a_701|4401a", "안녕 사랑"),
    ];
    let mut tally = kit::Tally::default();
    for (seq, want) in CASES {
        let mut s = State::new();
        run_keys(&mut s, seq);
        s.commit();
        tally.add(kit::check(
            s.text() == want,
            GROUP,
            "추가 낱말",
            want,
            &format!("{seq} -> {:?}", s.text()),
        ));
    }
    tally.assert_clean("추가 낱말");
}

// ---------------------------------------------------------------------
// 모드 순환 · 숫자 · 기호 · 상태
// ---------------------------------------------------------------------

#[test]
fn mode_cycle() {
    let mut tally = kit::Tally::default();
    let mut s = State::new();
    for (i, want) in MODE_NAMES.iter().enumerate() {
        tally.add(kit::check(
            s.mode_name() == *want,
            GROUP,
            "모드 순환",
            want,
            &format!("단계 {i}"),
        ));
        s.cycle_mode();
    }
    tally.add(kit::check(
        s.now_mode == InputMode::Hangul,
        GROUP,
        "모드 순환",
        "한 바퀴",
        "다시 한글",
    ));
    tally.add(kit::check(
        InputMode::from_index(MODE_COUNT).is_none(),
        GROUP,
        "모드 순환",
        "범위 밖 번호",
        "None",
    ));
    tally.assert_clean("모드 순환");
}

#[test]
fn number_and_symbol_first_tap() {
    let mut tally = kit::Tally::default();
    for key in 0..KEY_COUNT {
        let mut s = State::new();
        run_keys(&mut s, "N");
        let label = s.key_label(key);
        let want = label.chars().next().unwrap().to_string();
        s.key(key as i32);
        s.commit();
        tally.add(kit::check(
            s.text() == want,
            GROUP,
            "숫자 첫 타",
            &format!("키{key}"),
            &format!("{label} -> {:?}", s.text()),
        ));
    }
    for key in 0..KEY_COUNT {
        let mut s = State::new();
        run_keys(&mut s, "S");
        let label = s.key_label(key);
        let want = label.chars().next().unwrap().to_string();
        s.key(key as i32);
        s.commit();
        tally.add(kit::check(
            s.text() == want,
            GROUP,
            "기호 첫 타",
            &format!("키{key}"),
            &format!("{label} -> {:?}", s.text()),
        ));
    }
    tally.assert_clean("숫자 · 기호 첫 타");
}

#[test]
fn composition_and_status() {
    let mut tally = kit::Tally::default();
    let section = "조합 상태";

    let empty = State::new();
    tally.add(kit::check(
        empty.composition_text().is_empty() && empty.is_empty(),
        GROUP,
        section,
        "빈 상태",
        "조합 글 없음",
    ));

    let mut s = State::new();
    run_keys(&mut s, "3");
    tally.add(kit::check(
        s.composition_text() == "ㄱ + - + -",
        GROUP,
        section,
        "초성만",
        &s.composition_text(),
    ));

    let mut s = State::new();
    run_keys(&mut s, "301");
    tally.add(kit::check(
        s.composition_text() == "ㄱ + ㅏ + -",
        GROUP,
        section,
        "가 조합중",
        &s.composition_text(),
    ));

    let mut s = State::new();
    run_keys(&mut s, "3014");
    tally.add(kit::check(
        s.composition_text().contains('ㄴ'),
        GROUP,
        section,
        "간 조합중",
        &s.composition_text(),
    ));

    let mut s = State::new();
    run_keys(&mut s, "E0");
    tally.add(kit::check(
        s.status_text().starts_with("영문 abc"),
        GROUP,
        section,
        "영소 상태줄",
        &s.status_text(),
    ));

    tally.assert_clean("조합 상태");
}

#[test]
fn edit_operations() {
    let mut tally = kit::Tally::default();
    let section = "편집 동작";

    let mut s = State::new();
    run_keys(&mut s, "301401{701");
    s.commit();
    tally.add(kit::check(
        s.text() == "사가나",
        GROUP,
        section,
        "맨 앞 삽입",
        &format!("{:?}", s.text()),
    ));

    let mut s = State::new();
        run_keys(&mut s, "301401<");
        tally.add(kit::check(
            s.text() == "가니",
            GROUP,
            section,
            "조합 중 백스페이스",
            &format!("{:?}", s.text()),
        ));

    let mut s = State::new();
    run_keys(&mut s, "301_401");
    s.commit();
    tally.add(kit::check(
        s.text() == "가 나",
        GROUP,
        section,
        "스페이스",
        &format!("{:?}", s.text()),
    ));

    let mut s = State::new();
    run_keys(&mut s, "301/401");
    s.commit();
    tally.add(kit::check(
        s.text() == "가\n나",
        GROUP,
        section,
        "줄바꿈",
        &format!("{:?}", s.text()),
    ));

    let mut s = State::new();
    run_keys(&mut s, "301401[");
    tally.add(kit::check(
        s.cursor_pos == 1,
        GROUP,
        section,
        "커서 왼쪽",
        &format!("@{}", s.cursor_pos),
    ));

    let mut s = State::new();
    s.insert_str("가다");
    s.set_cursor(1);
    s.insert_str("나");
    tally.add(kit::check(
        s.text() == "가나다",
        GROUP,
        section,
        "가운데 끼우기",
        &format!("{:?}", s.text()),
    ));

    tally.assert_clean("편집 동작");
}
