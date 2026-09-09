//! input.rs - 천지인 입력 오토마타. KoreanChunJiInC++ 의 src/input.c 이식.
//!
//! 키 배열 (인덱스 0~11, 3열 4행)
//!
//! ```text
//! ㅣ     ·      ㅡ        0  1  2
//! ㄱㅋ   ㄴㄹ   ㄷㅌ      3  4  5
//! ㅂㅍ   ㅅㅎ   ㅈㅊ      6  7  8
//! . ,    ㅇㅁ   ? !       9  10 11
//! ```
//!
//! 자음 키는 연타하면 순환한다(ㄱ→ㅋ→ㄲ→ㄱ...).
//! 거센소리·된소리가 모두 순환에 들어 있으므로 획추가/쌍자음 키는 두지 않고,
//! 그 자리에 문장부호 키를 둔다.

use crate::chunjiin::{check_double, get_unicode, HangulState, InputMode, JamoSlot, State};
use crate::chunjiin::{KEY_COUNT, MODE_COUNT};

pub(crate) const KEY_I: usize = 0; // ㅣ
pub(crate) const KEY_DOT: usize = 1; // 아래아
pub(crate) const KEY_EU: usize = 2; // ㅡ
pub(crate) const KEY_PUNCT1: usize = 9; // . ,
pub(crate) const KEY_PUNCT2: usize = 11; // ? !

/// 자음 키의 순환 목록이다. 자음 키가 아니면 비어 있다.
// 키 번호와 나란히 읽을 수 있게 한 줄에 한 키씩 둔다.
#[rustfmt::skip]
const CONS_CYCLE: [&[&str]; KEY_COUNT] = [
    &[],                 // 0  ㅣ
    &[],                 // 1  아래아
    &[],                 // 2  ㅡ
    &["ㄱ", "ㅋ", "ㄲ"], // 3
    &["ㄴ", "ㄹ"],       // 4
    &["ㄷ", "ㅌ", "ㄸ"], // 5
    &["ㅂ", "ㅍ", "ㅃ"], // 6
    &["ㅅ", "ㅎ", "ㅆ"], // 7
    &["ㅈ", "ㅊ", "ㅉ"], // 8
    &[],                 // 9  . ,
    &["ㅇ", "ㅁ"],       // 10
    &[],                 // 11 ? !
];

/// 모음 전이표의 한 줄이다.
///
/// `from` 상태에서 ㅣ / 아래아 / ㅡ 키를 눌렀을 때의 다음 상태를 담는다.
/// [`NO_VOWEL`] 이면 그 조합은 존재하지 않으므로 현재 음절을 확정하고
/// 새 음절을 시작한다. `prev` 는 백스페이스로 한 단계 되돌릴 때의 상태다.
struct VowelRule {
    from: &'static str,
    by_i: &'static str,
    by_dot: &'static str,
    by_eu: &'static str,
    prev: &'static str,
}

/// 그런 조합이 없다는 표시다(원본의 NULL).
const NO_VOWEL: &str = "-";

/// 모음 전이표. `-` 는 그런 모음이 없다는 뜻이다.
///
/// `ㅝ` 는 `ㅠ` + `ㅣ` 로 들어온다. `ㅠㅣ` 라는 모음이 없기 때문에
/// 그 자리를 `ㅝ` 로 쓰는 것이 천지인의 규칙이다.
#[rustfmt::skip]
const VOWEL_RULES: [VowelRule; 24] = [
    //             from      ㅣ         아래아     ㅡ         prev
    VowelRule { from: "",   by_i: "ㅣ",     by_dot: "·",      by_eu: "ㅡ",     prev: ""   },
    VowelRule { from: "·",  by_i: "ㅓ",     by_dot: "‥",      by_eu: "ㅗ",     prev: ""   },
    VowelRule { from: "‥",  by_i: "ㅕ",     by_dot: "·",      by_eu: "ㅛ",     prev: "·"  },
    VowelRule { from: "ㅣ", by_i: NO_VOWEL, by_dot: "ㅏ",     by_eu: NO_VOWEL, prev: ""   },
    VowelRule { from: "ㅡ", by_i: "ㅢ",     by_dot: "ㅜ",     by_eu: NO_VOWEL, prev: ""   },
    VowelRule { from: "ㅏ", by_i: "ㅐ",     by_dot: "ㅑ",     by_eu: NO_VOWEL, prev: "ㅣ" },
    VowelRule { from: "ㅑ", by_i: "ㅒ",     by_dot: "ㅏ",     by_eu: NO_VOWEL, prev: "ㅏ" },
    VowelRule { from: "ㅓ", by_i: "ㅔ",     by_dot: "ㅕ",     by_eu: NO_VOWEL, prev: "·"  },
    VowelRule { from: "ㅕ", by_i: "ㅖ",     by_dot: "ㅓ",     by_eu: NO_VOWEL, prev: "ㅓ" },
    VowelRule { from: "ㅗ", by_i: "ㅚ",     by_dot: "ㅛ",     by_eu: NO_VOWEL, prev: "·"  },
    VowelRule { from: "ㅛ", by_i: NO_VOWEL, by_dot: "ㅗ",     by_eu: NO_VOWEL, prev: "ㅗ" },
    VowelRule { from: "ㅜ", by_i: "ㅟ",     by_dot: "ㅠ",     by_eu: NO_VOWEL, prev: "ㅡ" },
    VowelRule { from: "ㅠ", by_i: "ㅝ",     by_dot: "ㅜ",     by_eu: NO_VOWEL, prev: "ㅜ" },
    VowelRule { from: "ㅚ", by_i: NO_VOWEL, by_dot: "ㅘ",     by_eu: NO_VOWEL, prev: "ㅗ" },
    VowelRule { from: "ㅘ", by_i: "ㅙ",     by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅚ" },
    VowelRule { from: "ㅝ", by_i: "ㅞ",     by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅠ" },
    VowelRule { from: "ㅐ", by_i: NO_VOWEL, by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅏ" },
    VowelRule { from: "ㅒ", by_i: NO_VOWEL, by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅑ" },
    VowelRule { from: "ㅔ", by_i: NO_VOWEL, by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅓ" },
    VowelRule { from: "ㅖ", by_i: NO_VOWEL, by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅕ" },
    VowelRule { from: "ㅙ", by_i: NO_VOWEL, by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅘ" },
    VowelRule { from: "ㅞ", by_i: NO_VOWEL, by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅝ" },
    VowelRule { from: "ㅟ", by_i: NO_VOWEL, by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅜ" },
    VowelRule { from: "ㅢ", by_i: NO_VOWEL, by_dot: NO_VOWEL, by_eu: NO_VOWEL, prev: "ㅡ" },
];

/// 받침으로 쓸 수 있는 자음이다 (ㄸ ㅃ ㅉ 은 불가).
// 키 번호와 나란히 읽을 수 있게 한 줄에 한 키씩 둔다.
#[rustfmt::skip]
const VALID_JONG: [&str; 16] = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

// ---------------------------------------------------------------------
// 작은 도우미들
// ---------------------------------------------------------------------

fn is_dot_state(jung: &str) -> bool {
    jung == "·" || jung == "‥"
}

fn is_valid_jong(c: &str) -> bool {
    !c.is_empty() && VALID_JONG.contains(&c)
}

/// `jong` + `c` 가 겹받침을 이루는지 본다.
fn can_combine_jong(jong: &str, c: &str) -> bool {
    !check_double(jong, c).is_empty()
}

fn find_vowel_rule(jung: &str) -> Option<&'static VowelRule> {
    VOWEL_RULES.iter().find(|r| r.from == jung)
}

/// 모음 전이 결과를 돌려준다. 불가능하면 `None` 이다.
fn vowel_next(jung: &str, key: usize) -> Option<&'static str> {
    let r = find_vowel_rule(jung)?;
    let v = match key {
        KEY_I => r.by_i,
        KEY_DOT => r.by_dot,
        KEY_EU => r.by_eu,
        _ => return None,
    };
    if v == NO_VOWEL {
        return None;
    }
    Some(v)
}

fn vowel_prev(jung: &str) -> &'static str {
    find_vowel_rule(jung).map(|r| r.prev).unwrap_or("")
}

fn cycle_len(key: usize) -> usize {
    CONS_CYCLE[key].len()
}

pub(crate) fn is_cons_key(key: usize) -> bool {
    key < KEY_COUNT && !CONS_CYCLE[key].is_empty()
}

pub(crate) fn is_vowel_key(key: usize) -> bool {
    key == KEY_I || key == KEY_DOT || key == KEY_EU
}

/// 지금 조합에서 "마지막으로 채워진 자음 자리" 를 읽는다.
/// 자음 자리가 아니면 `None` 이다.
fn cons_slot(h: &HangulState) -> Option<&'static str> {
    match h.step {
        JamoSlot::Chosung => Some(h.chosung),
        JamoSlot::Jongsung => Some(h.jongsung),
        JamoSlot::Jongsung2 => Some(h.jongsung2),
        _ => None,
    }
}

fn set_cons_slot(h: &mut HangulState, v: &'static str) {
    match h.step {
        JamoSlot::Chosung => h.chosung = v,
        JamoSlot::Jongsung => h.jongsung = v,
        JamoSlot::Jongsung2 => h.jongsung2 = v,
        _ => {}
    }
}

/// 조합 중인 상태를 화면에 보여줄 문자열로 만든다. 최대 2칸.
///
/// 아래아만 찍힌 중간 상태에서는 [`get_unicode`] 가 `None` 을 돌려주므로
/// 아무것도 보이지 않는다. 그래서 이때는 초성(있으면)과 아래아를 직접 이어
/// `"ㄱ·"`, `"·"`, `"‥"` 처럼 눈에 보이게 만든다.
fn compose_display(h: &HangulState) -> Vec<char> {
    let mut out: Vec<char> = Vec::with_capacity(2);

    if is_dot_state(h.jungsung) {
        if !h.chosung.is_empty() {
            // 초성 홀로일 때의 호환 자모를 얻으려고 중성을 잠시 비운다
            let mut tmp = *h;
            tmp.jungsung = "";
            if let Some(code) = get_unicode(&tmp, "") {
                out.push(code);
            }
        }
        // 아래아 한 개 또는 두 개
        if let Some(c) = h.jungsung.chars().next() {
            out.push(c);
        }
        return out;
    }

    let real_jong = if !h.jongsung2.is_empty() {
        let merged = check_double(h.jongsung, h.jongsung2);
        if merged.is_empty() {
            h.jongsung
        } else {
            merged
        }
    } else {
        h.jongsung
    };

    if let Some(code) = get_unicode(h, real_jong) {
        out.push(code);
    }
    out
}

impl State {
    // -----------------------------------------------------------------
    // 화면 출력 - 조합 중인 글자는 cursor_pos-1 자리에서 계속 갱신된다
    // -----------------------------------------------------------------

    /// 조합 중인 글자를 화면에 반영한다.
    /// 직전에 그려 둔 `compose_len` 칸을 지우고 새로 그린다.
    pub(crate) fn write_hangul(&mut self) {
        let shown = compose_display(&self.hangul);

        while self.compose_len > 0 {
            self.delete_char();
            self.compose_len -= 1;
        }
        for ch in shown {
            let before = self.text_buffer.len();
            self.text_insert(ch);
            if self.text_buffer.len() > before {
                self.compose_len += 1;
            }
        }
        self.hangul.flag_writing = self.compose_len > 0;
    }

    pub(crate) fn write_engnum(&mut self) {
        let Some(ch) = self.engnum else {
            return;
        };

        if self.flag_engdelete && self.cursor_pos > 0 {
            let at = self.cursor_pos - 1;
            self.text_buffer[at] = ch;
        } else {
            self.text_insert(ch);
        }
        self.flag_engdelete = true;
        self.flag_initengnum = true;
    }

    // -----------------------------------------------------------------
    // 음절 확정
    // -----------------------------------------------------------------

    /// 현재 조합을 버퍼에 반영하고 새 음절을 시작할 수 있는 상태로 만든다.
    ///
    /// 아직 모음이 되지 못한 아래아도 그대로 둔다. 사용자가 그걸 남길
    /// 생각이었는지 아닌지 알 수 없으므로 임의로 지우지 않는다.
    fn commit_and_start(&mut self) {
        self.write_hangul();
        self.hangul.reset(); // flag_writing = false -> 다음 글자는 새로 삽입
        self.hangul.flag_addcursor = true;
        self.compose_len = 0; // 이미 찍힌 칸은 확정 글자가 된다
        self.prev_mergeable = false;
        self.last_key = -1;
        self.tap_count = 0;
    }

    /// 조합 중인 글자를 확정한다(더 이상 수정되지 않게 만든다).
    pub fn commit(&mut self) {
        if self.now_mode == InputMode::Hangul {
            if self.hangul.flag_writing {
                self.write_hangul();
            }
            self.hangul.reset();
            self.compose_len = 0;
        } else {
            self.init_engnum();
        }
        self.prev_mergeable = false;
        self.last_key = -1;
        self.tap_count = 0;
    }

    // -----------------------------------------------------------------
    // 한글 오토마타
    // -----------------------------------------------------------------

    /// 자음 `c` 를 새 음절의 초성으로 삼는다.
    ///
    /// `mergeable` 이면 방금 확정한 음절을 기억해 둔다. 같은 키를 한 번 더
    /// 눌러 겹받침이 되는 자음이 나오면 [`State::try_merge_jong`] 이 도로 합친다.
    fn start_with_chosung(&mut self, c: &'static str, key: usize, mergeable: bool) {
        let previous = self.hangul;

        self.commit_and_start();
        if mergeable {
            self.prev_syllable = previous;
            self.prev_mergeable = true;
        }
        self.hangul.chosung = c;
        self.hangul.step = JamoSlot::Chosung;
        self.last_key = key as i32;
        self.tap_count = 0;
    }

    /// 떨어져 나온 초성을 앞 음절의 겹받침으로 되돌린다.
    ///
    /// 성공하면 조합 영역이 앞 칸까지 넓어지고, 이어지는
    /// [`State::write_hangul`] 이 두 칸을 지우고 합쳐진 한 글자를 그린다.
    fn try_merge_jong(&mut self, key: usize) -> bool {
        let n = cycle_len(key);

        if self.hangul.step != JamoSlot::Chosung || !self.hangul.jungsung.is_empty() {
            return false;
        }
        if self.prev_syllable.jongsung.is_empty() || !self.prev_syllable.jongsung2.is_empty() {
            return false;
        }

        for i in 1..=n {
            let idx = (self.tap_count + i) % n;
            let cand = CONS_CYCLE[key][idx];

            if !can_combine_jong(self.prev_syllable.jongsung, cand) {
                continue;
            }

            self.compose_len += 1; // 앞 칸(확정된 음절)도 다시 그린다
            self.hangul = self.prev_syllable;
            self.hangul.jongsung2 = cand;
            self.hangul.step = JamoSlot::Jongsung2;
            self.hangul.flag_writing = true;
            self.tap_count = idx;
            return true;
        }
        false
    }

    /// 같은 자음 키 연타 시 현재 자리에서 다음 후보로 순환한다.
    fn cycle_consonant(&mut self, key: usize) -> bool {
        let n = cycle_len(key);
        let Some(slot) = cons_slot(&self.hangul) else {
            return false;
        };
        if slot.is_empty() || n == 0 {
            return false;
        }

        // 다음 후보부터 한 바퀴 돌면서 이 자리에 넣을 수 있는 것을 찾는다
        for i in 1..=n {
            let idx = (self.tap_count + i) % n;
            let cand = CONS_CYCLE[key][idx];

            if n > 1 && cand == slot {
                continue;
            }
            if self.hangul.step == JamoSlot::Jongsung && !is_valid_jong(cand) {
                continue;
            }
            if self.hangul.step == JamoSlot::Jongsung2
                && !can_combine_jong(self.hangul.jongsung, cand)
            {
                continue;
            }

            set_cons_slot(&mut self.hangul, cand);
            self.tap_count = idx;
            self.hangul.flag_doubled = idx == 2; // 순환 3번째 자리는 항상 된소리
            return true;
        }
        false
    }

    fn hangul_consonant(&mut self, key: usize) {
        let c = CONS_CYCLE[key][0];
        let mergeable = self.prev_mergeable;

        self.prev_mergeable = false;

        if self.last_key == key as i32 {
            if mergeable && self.try_merge_jong(key) {
                return;
            }
            if self.cycle_consonant(key) {
                return;
            }
        }

        if self.hangul.chosung.is_empty() && self.hangul.jungsung.is_empty() {
            // 빈 음절 -> 초성
            self.hangul.chosung = c;
            self.hangul.step = JamoSlot::Chosung;
            self.last_key = key as i32;
            self.tap_count = 0;
            return;
        }

        if self.hangul.jungsung.is_empty() || is_dot_state(self.hangul.jungsung) {
            // 초성만 있거나 아래아만 찍힌 상태 -> 앞을 확정하고 새 음절
            self.start_with_chosung(c, key, false);
            return;
        }

        if self.hangul.chosung.is_empty() {
            // 모음만 있던 상태 -> 앞을 확정하고 새 음절
            self.start_with_chosung(c, key, false);
            return;
        }

        if self.hangul.jongsung.is_empty() {
            if is_valid_jong(c) {
                self.hangul.jongsung = c;
                self.hangul.step = JamoSlot::Jongsung;
                self.last_key = key as i32;
                self.tap_count = 0;
            } else {
                self.start_with_chosung(c, key, false);
            }
            return;
        }

        if self.hangul.jongsung2.is_empty() && can_combine_jong(self.hangul.jongsung, c) {
            self.hangul.jongsung2 = c;
            self.hangul.step = JamoSlot::Jongsung2;
            self.last_key = key as i32;
            self.tap_count = 0;
            return;
        }

        // 받침 뒤에 붙지 못한 자음 -> 새 음절.
        // 겹받침으로 되돌아올 수 있게 기억해 둔다.
        let mergeable = self.hangul.jongsung2.is_empty();
        self.start_with_chosung(c, key, mergeable);
    }

    fn hangul_vowel(&mut self, key: usize) {
        self.prev_mergeable = false;

        // 받침이 있으면 연음: 마지막 자음을 새 음절의 초성으로 넘긴다
        if !self.hangul.jongsung.is_empty() {
            let moved;

            if !self.hangul.jongsung2.is_empty() {
                moved = self.hangul.jongsung2;
                self.hangul.jongsung2 = "";
            } else {
                moved = self.hangul.jongsung;
                self.hangul.jongsung = "";
            }

            self.commit_and_start(); // 받침을 뺀 모습으로 앞 글자 확정
            self.hangul.chosung = moved;
            self.hangul.step = JamoSlot::Chosung;
        }

        let next = match vowel_next(self.hangul.jungsung, key) {
            Some(v) => v,
            None => {
                // 이어질 수 없는 모음 조합 -> 앞을 확정하고 새 음절의 중성으로
                self.commit_and_start();
                match vowel_next("", key) {
                    Some(v) => v,
                    None => return,
                }
            }
        };

        self.hangul.jungsung = next;
        self.hangul.step = JamoSlot::Jungsung;
        self.hangul.flag_dotused = is_dot_state(next);
        self.last_key = key as i32;
        self.tap_count = 0;
    }

    fn hangul_punct(&mut self, key: usize) {
        // 문장부호 키 (9 = ". ,", 11 = "? !") 의 순환 목록이다.
        let set: &[char] = if key == KEY_PUNCT2 {
            &['?', '!']
        } else {
            &['.', ',']
        };
        let n = set.len();
        let mut idx = 0;

        self.prev_mergeable = false;

        if self.last_key == key as i32 && !self.hangul.flag_writing && self.cursor_pos > 0 {
            idx = (self.tap_count + 1) % n;
            let at = self.cursor_pos - 1;
            self.text_buffer[at] = set[idx];
        } else {
            self.commit_and_start(); // 조합 중인 글자를 확정하고
            self.text_insert(set[idx]); // 부호를 새로 넣는다
        }
        self.last_key = key as i32;
        self.tap_count = idx;
    }

    pub(crate) fn hangul_make(&mut self, input: usize) {
        if input >= KEY_COUNT {
            return;
        }

        self.hangul.flag_space = false;
        self.hangul.flag_addcursor = false;

        if is_vowel_key(input) {
            self.hangul_vowel(input);
        } else if is_cons_key(input) {
            self.hangul_consonant(input);
        } else if input == KEY_PUNCT1 || input == KEY_PUNCT2 {
            self.hangul_punct(input);
        }
    }
}

// ---------------------------------------------------------------------
// 영문 / 숫자 / 기호
// ---------------------------------------------------------------------

/// 영문 배열이다.
///
/// 한 키에 세 글자까지만 둔다. 그래서 알파벳 26자가 위 3x3 (0~8번) 을 채우고,
/// 마지막 줄 세 키(9~11)가 자주 쓰는 기호를 맡는다.
/// 나머지 기호는 기호 모드에서 넣는다.
/// 띄어쓰기는 스페이스 버튼과 스페이스바가 따로 있으므로 키패드에 두지 않는다.
///
/// ```text
/// abc   def   ghi
/// jkl   mno   pqr
/// stu   vwx   yz
/// .,?   !'"   -:@
/// ```
// 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
#[rustfmt::skip]
pub(crate) const ENG_MAP: [&str; KEY_COUNT] = [
    "abc", "def", "ghi", //
    "jkl", "mno", "pqr", //
    "stu", "vwx", "yz", //
    ".,?", "!'\"", "-:@",
];

/// 키마다 숫자 하나씩이다. 순환하지 않는다.
// 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
#[rustfmt::skip]
pub(crate) const NUM_MAP: [char; KEY_COUNT] =
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/// 기호 모드다. 한 키에 세 개씩, 12키로 36개를 덮는다.
/// 영문 모드에 넣지 못한 기호는 모두 여기에 있다.
// 자판을 눈으로 확인할 수 있게 3열 4행 그대로 둔다.
#[rustfmt::skip]
pub(crate) const SPECIAL_MAP: [&str; KEY_COUNT] = [
    ".,:", "?!;", "'\"`",
    "-_~", "+=*", "/\\|",
    "()&", "[]^", "{}%",
    "<>#", "@$₩",
    "※…・",
];

impl State {
    /// 휴대전화식 멀티탭이다. 같은 키를 연달아 누르면 목록을 돈다.
    fn multitap_make(&mut self, input: usize, set: &str, to_upper: bool) {
        let runes: Vec<char> = set.chars().collect();
        let n = runes.len();
        if n == 0 {
            return;
        }

        if self.last_key == input as i32 && self.flag_engdelete {
            self.tap_count = (self.tap_count + 1) % n;
        } else {
            self.tap_count = 0;
            self.flag_engdelete = false; // 새 문자로 삽입
        }

        let mut c = runes[self.tap_count];
        if to_upper && c.is_ascii_lowercase() {
            c = c.to_ascii_uppercase();
        }
        self.engnum = Some(c);
        self.last_key = input as i32;
    }

    pub(crate) fn eng_make(&mut self, input: usize) {
        if input >= KEY_COUNT {
            return;
        }
        let upper = self.now_mode == InputMode::UpperEnglish;
        self.multitap_make(input, ENG_MAP[input], upper);
    }

    pub(crate) fn special_make(&mut self, input: usize) {
        if input >= KEY_COUNT {
            return;
        }
        self.multitap_make(input, SPECIAL_MAP[input], false);
    }

    pub(crate) fn num_make(&mut self, input: usize) {
        if input >= KEY_COUNT {
            return;
        }
        self.engnum = Some(NUM_MAP[input]);
        self.flag_engdelete = false;
        self.last_key = -1;
        self.tap_count = 0;
    }

    // -----------------------------------------------------------------
    // GUI 용 편집 API
    // -----------------------------------------------------------------

    /// 원본 `chunjiin_init()` 에 더해 확장 필드까지 초기화한다.
    pub fn reset(&mut self) {
        self.chunjiin_init();
        self.last_key = -1;
        self.tap_count = 0;
        self.compose_len = 0;
        self.prev_mergeable = false;
        self.prev_syllable.reset();
    }

    /// 모드를 유지한 채 전체를 지운다.
    pub fn clear(&mut self) {
        let mode = self.now_mode;
        self.reset();
        self.now_mode = mode;
    }

    /// 임의의 문자를 커서 위치에 그대로 넣는다
    /// (공백, 줄바꿈, 물리 키보드 직접 입력).
    pub fn insert_char(&mut self, ch: char) {
        self.commit();
        self.text_insert(ch);
    }

    /// 여러 글자를 차례로 넣는다(붙여넣기, 파일 열기).
    /// 캐리지 리턴은 버린다.
    pub fn insert_str(&mut self, text: &str) {
        for ch in text.chars() {
            if ch == '\r' {
                continue;
            }
            self.insert_char(ch);
        }
    }

    /// 조합을 확정한 뒤 공백을 넣는다.
    pub fn space(&mut self) {
        self.insert_char(' ');
        self.hangul.flag_space = true;
    }

    /// 조합 중이면 낱자 단위로 되돌리고, 아니면 글자를 지운다.
    pub fn backspace(&mut self) {
        if self.now_mode == InputMode::Hangul && self.hangul.flag_writing {
            let h = &mut self.hangul;

            if !h.jongsung2.is_empty() {
                h.jongsung2 = "";
                h.step = JamoSlot::Jongsung;
            } else if !h.jongsung.is_empty() {
                h.jongsung = "";
                h.step = if h.jungsung.is_empty() {
                    JamoSlot::Chosung
                } else {
                    JamoSlot::Jungsung
                };
            } else if !h.jungsung.is_empty() {
                h.jungsung = vowel_prev(h.jungsung);
                h.step = if !h.jungsung.is_empty() {
                    JamoSlot::Jungsung
                } else if !h.chosung.is_empty() {
                    JamoSlot::Chosung
                } else {
                    JamoSlot::None
                };
            } else if !h.chosung.is_empty() {
                h.chosung = "";
                h.step = JamoSlot::None;
            }

            self.write_hangul();

            if self.hangul.is_empty() {
                self.hangul.reset();
            }
            self.prev_mergeable = false;
            self.last_key = -1;
            self.tap_count = 0;
            return;
        }

        self.commit();
        self.delete_char();
    }

    /// 커서 뒤의 한 글자를 지운다.
    pub fn delete(&mut self) {
        if self.cursor_pos < self.text_buffer.len() {
            self.move_cursor(1);
            self.backspace();
        }
    }

    /// 커서를 `delta` 만큼 옮긴다. 조합은 확정된다.
    pub fn move_cursor(&mut self, delta: i32) {
        self.commit();
        let pos = self.cursor_pos as i64 + delta as i64;
        self.cursor_pos = pos.clamp(0, self.text_buffer.len() as i64) as usize;
        self.clamp_cursor();
    }

    /// 커서를 절대 위치로 옮긴다. 조합은 확정된다.
    pub fn set_cursor(&mut self, pos: usize) {
        self.commit();
        self.cursor_pos = pos.min(self.text_buffer.len());
        self.clamp_cursor();
    }

    /// 입력 모드를 바꾼다. 조합은 확정된다.
    pub fn set_mode(&mut self, mode: InputMode) {
        self.commit();
        self.now_mode = mode;
        self.init_engnum();
        self.last_key = -1;
        self.tap_count = 0;
    }

    /// 번호로 입력 모드를 바꾼다. 범위를 벗어나면 아무것도 하지 않는다.
    pub fn set_mode_index(&mut self, index: usize) {
        if index >= MODE_COUNT {
            return;
        }
        if let Some(m) = InputMode::from_index(index) {
            self.set_mode(m);
        }
    }

    /// 한글 -> 영소 -> 영대 -> 숫자 -> 기호 -> 한글 순으로 돈다.
    pub fn cycle_mode(&mut self) {
        self.set_mode(self.now_mode.next());
    }

    /// 연타 순환을 끊는다.
    ///
    /// `"안녕"` 처럼 같은 키(ㄴ)가 연달아 필요한 경우, 이 호출 이후의 같은
    /// 키는 순환(ㄴ→ㄹ)이 아니라 새 자음 입력으로 처리된다. 조합 자체는
    /// 유지된다.
    pub fn break_multitap(&mut self) {
        self.last_key = -1;
        self.tap_count = 0;
        if self.now_mode != InputMode::Hangul {
            self.flag_engdelete = false;
        }
    }

    /// 버퍼를 통째로 갈아 끼우고 커서를 끝으로 보낸다(파일 열기용).
    pub fn set_text(&mut self, text: &str) {
        self.clear();
        self.insert_str(text);
    }
}
