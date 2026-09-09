//! labels.rs - 화면에 보여 줄 문자열들. input.c 의 표시용 구역에 대응한다.
//!
//! 라벨 배열과 입력 배열(`ENG_MAP`, `SPECIAL_MAP` ...)의 순서가 어긋나면
//! 버튼에 적힌 글자와 실제 입력되는 글자가 달라진다. `tests/engine.rs` 의
//! `key_labels` 가 다섯 모드 12키를 전수 확인한다.

use crate::chunjiin::{InputMode, State, KEY_COUNT, MODE_COUNT};
use crate::input::{is_vowel_key, KEY_PUNCT1, KEY_PUNCT2};

// 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
#[rustfmt::skip]
const LABEL_HANGUL: [&str; KEY_COUNT] = [
    "ㅣ", "·", "ㅡ", //
    "ㄱㅋ", "ㄴㄹ", "ㄷㅌ", //
    "ㅂㅍ", "ㅅㅎ", "ㅈㅊ", //
    ". ,", "ㅇㅁ", "? !",
];

/// `ENG_MAP` 과 같은 순서: 알파벳이 0~8번(3x3), 기호가 9~11번
// 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
#[rustfmt::skip]
const LABEL_LOWER: [&str; KEY_COUNT] = [
    "abc", "def", "ghi", //
    "jkl", "mno", "pqr", //
    "stu", "vwx", "yz", //
    ". , ?", "! ' \"", "- : @",
];

// 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
#[rustfmt::skip]
const LABEL_UPPER: [&str; KEY_COUNT] = [
    "ABC", "DEF", "GHI", //
    "JKL", "MNO", "PQR", //
    "STU", "VWX", "YZ", //
    ". , ?", "! ' \"", "- : @",
];

// 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
#[rustfmt::skip]
const LABEL_NUMBER: [&str; KEY_COUNT] =
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

/// `SPECIAL_MAP` 과 같은 순서
// 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
#[rustfmt::skip]
const LABEL_SPECIAL: [&str; KEY_COUNT] = [
    ". , :", "? ! ;", "' \" `",
    "- _ ~", "+ = *", "/ \\ |",
    "( ) &", "[ ] ^", "{ } %",
    "< > #", "@ $ ₩",
    "※ … ・",
];

/// 다섯 모드의 이름이다(메뉴·설정 창에서 쓴다).
pub const MODE_NAMES: [&str; MODE_COUNT] = ["한글", "영문 abc", "영문 ABC", "숫자 123", "기호 !@#"];

/// 키의 역할이다. GUI 가 색을 고를 때 쓴다.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KeyRole {
    /// 자음 · 일반 키
    Cons,
    /// ㅣ · ㅡ
    Vowel,
    /// 문장부호
    Mod,
}

impl KeyRole {
    /// 웹 판이 CSS 클래스로 쓰는 이름이다.
    pub fn name(self) -> &'static str {
        match self {
            KeyRole::Vowel => "vowel",
            KeyRole::Mod => "mod",
            KeyRole::Cons => "cons",
        }
    }
}

impl State {
    /// 현재 모드에서 키 인덱스(0~11)에 표시할 라벨이다.
    pub fn key_label(&self, key: usize) -> &'static str {
        if key >= KEY_COUNT {
            return "";
        }
        match self.now_mode {
            InputMode::Hangul => LABEL_HANGUL[key],
            InputMode::English => LABEL_LOWER[key],
            InputMode::UpperEnglish => LABEL_UPPER[key],
            InputMode::Number => LABEL_NUMBER[key],
            InputMode::Special => LABEL_SPECIAL[key],
        }
    }

    /// 현재 모드 이름이다.
    pub fn mode_name(&self) -> &'static str {
        MODE_NAMES[self.now_mode.index()]
    }

    /// 키패드 버튼의 역할을 돌려준다.
    /// 한글 모드가 아니면 12키를 모두 같은 색으로 그린다.
    pub fn key_role_of(&self, key: usize) -> KeyRole {
        if self.now_mode != InputMode::Hangul {
            return KeyRole::Cons;
        }
        if is_vowel_key(key) {
            KeyRole::Vowel
        } else if key == KEY_PUNCT1 || key == KEY_PUNCT2 {
            KeyRole::Mod
        } else {
            KeyRole::Cons
        }
    }

    /// 조합 중인 낱자 상태를 사람이 읽을 수 있는 문자열로 만든다
    /// (상태 표시줄용). 조합 중이 아니면 빈 문자열이다.
    pub fn composition_text(&self) -> String {
        let h = &self.hangul;

        if self.now_mode != InputMode::Hangul {
            return match self.engnum {
                Some(c) if self.flag_engdelete => c.to_string(),
                _ => String::new(),
            };
        }

        if h.is_empty() {
            return String::new();
        }

        fn dash(v: &str) -> &str {
            if v.is_empty() {
                "-"
            } else {
                v
            }
        }

        format!(
            "{} + {} + {}{}",
            dash(h.chosung),
            dash(h.jungsung),
            dash(h.jongsung),
            h.jongsung2
        )
    }

    /// 상태줄 한 줄이다. `"한글    조합 ㄱ + ㅏ + -    3자"` 꼴.
    pub fn status_text(&self) -> String {
        let comp = self.composition_text();
        let comp = if comp.is_empty() {
            "–".to_string()
        } else {
            comp
        };
        format!("{}    조합 {}    {}자", self.mode_name(), comp, self.len())
    }
}
