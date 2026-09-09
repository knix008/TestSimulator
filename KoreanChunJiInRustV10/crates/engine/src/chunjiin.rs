//! chunjiin.rs - KoreanChunJiInC++ 의 src/chunjiin.c(원본, 수정 금지) 이식.
//!
//! ```text
//! get_unicode   초성·중성·종성 -> 한글 음절 코드포인트
//! check_double  두 자음이 겹받침을 이루는지
//! delete_char   커서 앞 한 칸 삭제
//! ```
//!
//! 낱자는 모두 정적 표에서만 나오므로 `&'static str` 로 든다.
//! Go 판이 `string` 을 쓰던 자리이고 값을 새로 만들 일이 없으므로,
//! 배분 없이 그대로 복사된다.

/// 편집 버퍼에 담을 수 있는 최대 문자 수.
///
/// 원본이 널 종료 배열이라 4096 중 한 칸을 널에 썼으므로 실제로 담기는 것은
/// `MAX_TEXT_LEN - 1` 자다. 그 값을 그대로 맞춘다.
pub const MAX_TEXT_LEN: usize = 4096;

/// 천지인 키패드의 키 개수다(0 ~ 11).
pub const KEY_COUNT: usize = 12;

/// 입력 모드다.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum InputMode {
    /// 한글 (천지인)
    #[default]
    Hangul,
    /// 영문 소문자
    English,
    /// 영문 대문자
    UpperEnglish,
    /// 숫자
    Number,
    /// 기호
    Special,
}

/// 입력 모드의 가짓수다.
pub const MODE_COUNT: usize = 5;

impl InputMode {
    /// 번호를 모드로 바꾼다. 범위를 벗어나면 `None` 이다.
    pub fn from_index(i: usize) -> Option<InputMode> {
        Some(match i {
            0 => InputMode::Hangul,
            1 => InputMode::English,
            2 => InputMode::UpperEnglish,
            3 => InputMode::Number,
            4 => InputMode::Special,
            _ => return None,
        })
    }

    /// 모드의 번호다. 설정 파일에 저장되는 값이다.
    pub fn index(self) -> usize {
        match self {
            InputMode::Hangul => 0,
            InputMode::English => 1,
            InputMode::UpperEnglish => 2,
            InputMode::Number => 3,
            InputMode::Special => 4,
        }
    }

    /// 다음 모드다. 한글 -> 영소 -> 영대 -> 숫자 -> 기호 -> 한글.
    pub fn next(self) -> InputMode {
        InputMode::from_index((self.index() + 1) % MODE_COUNT).unwrap()
    }
}

/// 조합 중인 낱자가 마지막으로 들어간 자리다.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum JamoSlot {
    #[default]
    None,
    Chosung,
    Jungsung,
    Jongsung,
    Jongsung2,
}

/// 조합 중인 한 음절의 상태다.
///
/// `jungsung` 에는 완성 모음뿐 아니라 중간 상태인 `"·"`(아래아 1개),
/// `"‥"`(아래아 2개) 도 들어간다. [`get_unicode`] 가 이 두 값을
/// "아직 모음이 아님" 으로 다룬다.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct HangulState {
    pub chosung: &'static str,
    pub jungsung: &'static str,
    pub jongsung: &'static str,
    /// 겹받침의 두 번째 자음
    pub jongsung2: &'static str,

    /// 마지막으로 채워진 자리
    pub step: JamoSlot,
    /// 참이면 `text_buffer[cursor_pos-1]` 이 조합 중인 글자다
    pub flag_writing: bool,

    /// 아래아(·)로 시작한 모음인지
    pub flag_dotused: bool,
    /// 현재 자음이 쌍자음으로 바뀐 상태인지
    pub flag_doubled: bool,
    /// 직전 입력에서 음절이 확정되었는지
    pub flag_addcursor: bool,
    /// 직전 입력이 공백이었는지
    pub flag_space: bool,
}

impl HangulState {
    /// 원본 `hangul_init()` 이다.
    pub fn reset(&mut self) {
        *self = HangulState::default();
    }

    /// 낱자가 하나도 없는 상태인지 본다.
    pub fn is_empty(&self) -> bool {
        self.chosung.is_empty() && self.jungsung.is_empty() && self.jongsung.is_empty()
    }
}

/// 입력기 전체 상태다.
#[derive(Clone, Debug)]
pub struct State {
    pub hangul: HangulState,
    pub now_mode: InputMode,

    /// 영문/숫자/기호 모드에서 조합 중인 문자
    pub engnum: Option<char>,
    /// `engnum` 이 화면에 반영되어 있는지
    pub flag_initengnum: bool,
    /// 다음 입력이 덮어쓰기(멀티탭 연타)인지
    pub flag_engdelete: bool,

    pub text_buffer: Vec<char>,
    /// 삽입 위치. 조합 중이면 조합 글자는 `cursor_pos - compose_len` 부터다
    pub cursor_pos: usize,

    // 아래는 chunjiin.c 가 쓰지 않는 확장 필드다.
    /// 직전에 눌린 키 인덱스, 없으면 -1
    pub last_key: i32,
    /// 같은 키 연타 위치
    pub tap_count: usize,
    /// 조합 중인 글자가 차지하는 칸 수 (0~2)
    pub compose_len: usize,

    /// 겹받침 되돌려 붙이기용.
    ///
    /// 받침 뒤에 온 자음이 겹받침을 이루지 못해 새 음절로 떨어져 나갔을 때,
    /// 바로 앞 음절을 기억해 둔다. 그 자음을 연타해서 겹받침이 되는 자음으로
    /// 바뀌면 앞 음절로 도로 합친다. (만 + ㅅ -> 만ㅅ -> 많)
    pub prev_syllable: HangulState,
    pub prev_mergeable: bool,
}

impl Default for State {
    fn default() -> Self {
        Self::new()
    }
}

impl State {
    /// 초기화된 입력기 상태를 만든다. 새 상태는 항상 이걸로 시작한다.
    pub fn new() -> State {
        let mut s = State {
            hangul: HangulState::default(),
            now_mode: InputMode::Hangul,
            engnum: None,
            flag_initengnum: false,
            flag_engdelete: false,
            text_buffer: Vec::with_capacity(256),
            cursor_pos: 0,
            last_key: -1,
            tap_count: 0,
            compose_len: 0,
            prev_syllable: HangulState::default(),
            prev_mergeable: false,
        };
        s.reset();
        s
    }

    /// 커서를 유효 범위로 보정한다.
    pub(crate) fn clamp_cursor(&mut self) {
        if self.cursor_pos > MAX_TEXT_LEN - 1 {
            self.cursor_pos = MAX_TEXT_LEN - 1;
        }
        if self.cursor_pos > self.text_buffer.len() {
            self.cursor_pos = self.text_buffer.len();
        }
    }

    /// 현재 편집 버퍼를 문자열로 돌려준다.
    ///
    /// 원본의 `wchar_to_utf8()` 자리를 대신한다. Rust 문자열은 이미 UTF-8 이다.
    pub fn text(&self) -> String {
        self.text_buffer.iter().collect()
    }

    /// 편집 버퍼의 글자 수다(바이트 수가 아니다).
    pub fn len(&self) -> usize {
        self.text_buffer.len()
    }

    /// 편집 버퍼가 비었는지 본다.
    pub fn is_empty(&self) -> bool {
        self.text_buffer.is_empty()
    }

    // -----------------------------------------------------------------
    // 초기화 - 원본 chunjiin_init()
    // -----------------------------------------------------------------

    pub(crate) fn chunjiin_init(&mut self) {
        self.hangul.reset();
        self.now_mode = InputMode::Hangul;
        self.init_engnum();
        self.text_buffer.clear();
        self.cursor_pos = 0;
        self.clamp_cursor();
    }

    pub(crate) fn init_engnum(&mut self) {
        self.engnum = None;
        self.flag_initengnum = false;
        self.flag_engdelete = false;
    }

    // -----------------------------------------------------------------
    // 입력 처리 - 원본 chunjiin_process_input()
    // -----------------------------------------------------------------

    /// 키패드 키(0~11) 하나를 처리한다.
    pub fn key(&mut self, input: i32) {
        if !(0..=11).contains(&input) {
            return;
        }
        let input = input as usize;

        match self.now_mode {
            InputMode::Hangul => {
                self.hangul_make(input);
                self.write_hangul();
            }
            InputMode::English | InputMode::UpperEnglish => {
                self.eng_make(input);
                self.write_engnum();
            }
            InputMode::Number => {
                self.num_make(input);
                self.write_engnum();
            }
            InputMode::Special => {
                self.special_make(input);
                self.write_engnum();
            }
        }
    }

    // -----------------------------------------------------------------
    // 텍스트 조작
    // -----------------------------------------------------------------

    /// 커서 앞의 한 칸을 지운다. 원본 `delete_char()` 와 같다.
    pub(crate) fn delete_char(&mut self) {
        if self.cursor_pos == 0 {
            return;
        }
        let i = self.cursor_pos - 1;
        self.text_buffer.remove(i);
        self.cursor_pos -= 1;
        self.clamp_cursor();
    }

    /// 커서 위치에 한 글자를 끼워 넣는다.
    pub(crate) fn text_insert(&mut self, ch: char) {
        if self.text_buffer.len() >= MAX_TEXT_LEN - 1 {
            return;
        }
        if self.cursor_pos > self.text_buffer.len() {
            self.cursor_pos = self.text_buffer.len();
        }
        self.text_buffer.insert(self.cursor_pos, ch);
        self.cursor_pos += 1;
        self.clamp_cursor();
    }
}

// ---------------------------------------------------------------------
// 유니코드 조합 - 원본 get_unicode()
// ---------------------------------------------------------------------

/// 홀로 보여 줄 때 쓰는 초성 호환 자모
// 원본 chunjiin.c 의 차례를 눈으로 대조할 수 있게 그대로 둔다.
#[rustfmt::skip]
const COMPAT_CHO: [char; 19] = [
    '\u{3131}', '\u{3132}', '\u{3134}', '\u{3137}', '\u{3138}', '\u{3139}', '\u{3141}', '\u{3142}',
    '\u{3143}', '\u{3145}', '\u{3146}', '\u{3147}', '\u{3148}', '\u{3149}', '\u{314A}', '\u{314B}',
    '\u{314C}', '\u{314D}', '\u{314E}',
];

/// 홀로 보여 줄 때 쓰는 중성 호환 자모
// 원본 chunjiin.c 의 차례를 눈으로 대조할 수 있게 그대로 둔다.
#[rustfmt::skip]
const COMPAT_JUNG: [char; 21] = [
    '\u{314F}', '\u{3150}', '\u{3151}', '\u{3152}', '\u{3153}', '\u{3154}', '\u{3155}', '\u{3156}',
    '\u{3157}', '\u{3158}', '\u{3159}', '\u{315A}', '\u{315B}', '\u{315C}', '\u{315D}', '\u{315E}',
    '\u{315F}', '\u{3160}', '\u{3161}', '\u{3162}', '\u{3163}',
];

/// 홀로 보여 줄 때 쓰는 종성 호환 자모. 0번은 받침 없음이다.
// 원본 chunjiin.c 의 차례를 눈으로 대조할 수 있게 그대로 둔다.
#[rustfmt::skip]
const COMPAT_JONG: [char; 28] = [
    '\0', '\u{3131}', '\u{3132}', '\u{3133}', '\u{3134}', '\u{3135}', '\u{3136}', '\u{3137}',
    '\u{3139}', '\u{313A}', '\u{313B}', '\u{313C}', '\u{313D}', '\u{313E}', '\u{313F}', '\u{3140}',
    '\u{3141}', '\u{3142}', '\u{3144}', '\u{3145}', '\u{3146}', '\u{3147}', '\u{3148}', '\u{314A}',
    '\u{314B}', '\u{314C}', '\u{314D}', '\u{314E}',
];

// 원본의 if/else 사슬을 표로 바꾼 것이다. 사슬 끝의 기본값(ㅎ/ㅣ/ㅎ)도 그대로 둔다.

// 원본 chunjiin.c 의 차례를 눈으로 대조할 수 있게 그대로 둔다.
#[rustfmt::skip]
const CHO_ORDER: [&str; 19] = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ",
    "ㅌ", "ㅍ", "ㅎ",
];

// 원본 chunjiin.c 의 차례를 눈으로 대조할 수 있게 그대로 둔다.
#[rustfmt::skip]
const JUNG_ORDER: [&str; 21] = [
    "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ",
    "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];

// 원본 chunjiin.c 의 차례를 눈으로 대조할 수 있게 그대로 둔다.
#[rustfmt::skip]
const JONG_ORDER: [&str; 28] = [
    "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ",
    "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

fn index_of(list: &[&str], v: &str, fallback: usize) -> usize {
    list.iter().position(|s| *s == v).unwrap_or(fallback)
}

/// 조합 상태를 화면에 찍을 코드포인트 하나로 만든다.
/// 아직 글자가 되지 못했으면 `None` 이다. 원본 `get_unicode()` 와 같다.
///
/// 주의: 초성이 비어 있으면 `cho` 가 18(=ㅎ)로 떨어진다. 그래서 초성 없이
/// 종성만 채우면 엉뚱한 글자가 나온다. 오토마타가 그 상태를 만들지 않는다.
pub fn get_unicode(h: &HangulState, real_jong: &str) -> Option<char> {
    if h.chosung.is_empty() && (h.jungsung.is_empty() || h.jungsung == "·" || h.jungsung == "‥")
    {
        return None;
    }

    let cho = index_of(&CHO_ORDER, h.chosung, 18); // 없으면 ㅎ

    if h.jungsung.is_empty() && h.jongsung.is_empty() {
        return Some(COMPAT_CHO[cho]);
    }
    if h.jungsung == "·" || h.jungsung == "‥" {
        return Some(COMPAT_CHO[cho]);
    }

    let jung = index_of(&JUNG_ORDER, h.jungsung, 20); // 없으면 ㅣ

    if h.chosung.is_empty() && h.jongsung.is_empty() {
        return Some(COMPAT_JUNG[jung]);
    }

    let jong = if real_jong.is_empty() {
        0
    } else {
        index_of(&JONG_ORDER, real_jong, 27) // 없으면 ㅎ
    };

    if h.chosung.is_empty() && h.jungsung.is_empty() {
        return Some(COMPAT_JONG[jong]);
    }

    char::from_u32((44032 + cho * 588 + jung * 28 + jong) as u32)
}

/// 겹받침 표. 원본 `check_double()` 과 같다.
// 원본 chunjiin.c 의 차례를 눈으로 대조할 수 있게 그대로 둔다.
#[rustfmt::skip]
const DOUBLE_JONG: [(&str, &str, &str); 11] = [
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

/// `jong` 뒤에 `jong2` 가 붙어 겹받침이 되는지 본다.
/// 되지 않으면 빈 문자열이다.
pub fn check_double(jong: &str, jong2: &str) -> &'static str {
    for (a, b, out) in DOUBLE_JONG {
        if a == jong && b == jong2 {
            return out;
        }
    }
    ""
}
