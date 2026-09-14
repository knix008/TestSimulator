//! lang.rs - 화면에 나오는 글자들. 한국어와 영어 두 벌이다.
//!
//! 표를 구조체로 두었으므로 항목을 하나 빠뜨리면 컴파일이 되지 않는다.
//! 새 언어를 넣으려면 [`strings_for`] 에 한 갈래를 더 적으면 된다.

use crate::help::{HELP_EN, HELP_KO};
use crate::TOOL_COUNT;

/// 화면에 쓰는 언어다.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Lang {
    #[default]
    Ko,
    En,
}

impl Lang {
    /// 설정 파일에 저장되는 코드다.
    pub fn code(self) -> &'static str {
        match self {
            Lang::Ko => "ko",
            Lang::En => "en",
        }
    }

    /// 코드를 언어로 바꾼다. 모르는 코드는 한국어다.
    pub fn from_code(code: &str) -> Lang {
        match code {
            "en" => Lang::En,
            _ => Lang::Ko,
        }
    }

    /// 설정 창과 메뉴에 나오는 이름이다.
    pub fn name(self) -> &'static str {
        match self {
            Lang::Ko => "한국어",
            Lang::En => "English",
        }
    }

    /// 다음 언어다. 툴바의 지구본 단추가 쓴다.
    pub fn next(self) -> Lang {
        match self {
            Lang::Ko => Lang::En,
            Lang::En => Lang::Ko,
        }
    }
}

/// 고를 수 있는 언어다.
pub const LANGS: [Lang; 2] = [Lang::Ko, Lang::En];

/// 기능 버튼 수다.
pub const FN_COUNT: usize = 6;

/// 화면에 쓰는 모든 글자다.
pub struct Strings {
    pub app_title: &'static str,
    pub help_title: &'static str,
    pub about_title: &'static str,

    pub menu_file: &'static str,
    pub menu_edit: &'static str,
    pub menu_input: &'static str,
    pub menu_config: &'static str,
    pub menu_help: &'static str,

    pub new: &'static str,
    pub open: &'static str,
    pub save: &'static str,
    pub quit: &'static str,
    pub copy: &'static str,
    pub paste: &'static str,
    pub clear_all: &'static str,
    pub next_mode: &'static str,
    pub theme: &'static str,
    pub next_theme: &'static str,
    pub language: &'static str,
    pub show_toolbar: &'static str,
    pub show_status: &'static str,
    pub compact_mode: &'static str,
    pub settings_dots: &'static str,
    pub usage: &'static str,
    pub about_item: &'static str,

    // 설정 창
    pub set_title: &'static str,
    pub set_ok: &'static str,
    pub set_cancel: &'static str,
    pub set_default: &'static str,
    pub set_theme: &'static str,
    pub set_font_size: &'static str,
    pub set_tap_time: &'static str,
    pub set_start_mode: &'static str,
    pub set_language: &'static str,
    pub unit_px: &'static str,
    pub unit_sec: &'static str,
    pub mark_default: &'static str,

    // 상태줄
    pub status_composing: &'static str,
    pub status_chars: &'static str,
    pub status_none: &'static str,

    /// 모드 이름
    pub mode_names: [&'static str; 5],

    /// 테마 이름
    pub theme_names: [&'static str; 4],

    /// 기능 버튼과 그 설명.
    ///
    /// `fn_labels` 가 빈 칸이면 그 자리는 글자 대신 아이콘을 그린다
    /// (줄바꿈 · 지우기. `icons.rs` 와 `app.rs` 의 `FN_ICONS` 를 보라).
    pub fn_labels: [&'static str; FN_COUNT],
    pub fn_hints: [&'static str; FN_COUNT],

    /// 툴바 설명
    pub tips: [&'static str; TOOL_COUNT],

    // 대화 상자
    pub err_open: &'static str,
    pub err_save: &'static str,
    pub close: &'static str,

    // 프로그램 정보
    pub about_body: &'static str,
    pub about_author: &'static str,
    pub about_engine: &'static str,
    pub about_build: &'static str,
    pub about_platform: &'static str,
    pub about_font: &'static str,
    pub about_theme: &'static str,
    pub about_settings: &'static str,

    pub help: &'static str,
}

/// 지금 언어의 글자 묶음을 돌려준다.
pub fn strings_for(l: Lang) -> &'static Strings {
    match l {
        Lang::Ko => &KO,
        Lang::En => &EN,
    }
}

/// 운영체제의 언어 설정을 보고 처음 쓸 언어를 고른다.
/// 한국어로 보이면 한국어, 그 밖에는 영어다.
pub fn detect_lang() -> Lang {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] {
        let Ok(v) = std::env::var(key) else { continue };
        let v = v.to_lowercase();
        if v.is_empty() {
            continue;
        }
        return if v.starts_with("ko") {
            Lang::Ko
        } else {
            Lang::En
        };
    }
    // Windows 에는 위 환경 변수가 없다. 그때는 한국어로 시작한다.
    Lang::Ko
}

static KO: Strings = Strings {
    app_title: "천지인 한글 입력기",
    help_title: "천지인 한글 입력기 - 사용법",
    about_title: "프로그램 정보",

    menu_file: "파일",
    menu_edit: "편집",
    menu_input: "입력",
    menu_config: "설정",
    menu_help: "도움말",

    new: "새로 만들기",
    open: "열기...",
    save: "저장...",
    quit: "끝내기",
    copy: "복사",
    paste: "붙여넣기",
    clear_all: "전체 지우기",
    next_mode: "다음 모드",
    theme: "테마",
    next_theme: "다음 테마",
    language: "언어",
    show_toolbar: "툴바 보이기",
    show_status: "상태줄 보이기",
    compact_mode: "컴팩트 모드",
    settings_dots: "설정...",
    usage: "사용법",
    about_item: "정보",

    set_title: "설정",
    set_ok: "확인",
    set_cancel: "취소",
    set_default: "기본값",
    set_theme: "테마",
    set_font_size: "글꼴 크기",
    set_tap_time: "연타 유지 시간",
    set_start_mode: "시작 입력 모드",
    set_language: "언어",
    unit_px: "px",
    unit_sec: "초",
    mark_default: "(기본)",

    status_composing: "조합",
    status_chars: "자",
    status_none: "–",

    mode_names: ["한글", "영문 abc", "영문 ABC", "숫자 123", "기호 !@#"],
    theme_names: ["라이트", "다크", "세피아", "고대비"],

    fn_labels: ["모드", "←", "스페이스", "→", "", ""],
    fn_hints: [
        "입력 모드 전환 (F2)",
        "커서 왼쪽 (←)",
        "띄어쓰기 (Space)",
        "커서 오른쪽 (→) · 연타 순환 끊기",
        "줄바꿈 (Enter)",
        "지우기 (Backspace)",
    ],

    tips: [
        "새로 만들기 (Ctrl+N)",
        "열기 (Ctrl+O)",
        "저장 (Ctrl+S)",
        "복사 (Ctrl+C)",
        "붙여넣기 (Ctrl+V)",
        "전체 지우기",
        "입력 모드 전환 (F2)",
        "테마 전환 (F3)",
        "언어 전환 (한국어 / English)",
        "프로그램 정보",
        "설정... (F4)",
    ],

    err_open: "파일을 열 수 없습니다",
    err_save: "파일을 저장할 수 없습니다",
    close: "닫기",

    about_body: "12키 천지인 자판으로 한글을 조합합니다.",
    about_author: "만든이",
    about_engine: "조합 엔진",
    about_build: "빌드",
    about_platform: "플랫폼",
    about_font: "글꼴",
    about_theme: "현재 테마",
    about_settings: "설정 저장 위치",

    help: HELP_KO,
};

static EN: Strings = Strings {
    app_title: "Chunjiin Hangul Keyboard",
    help_title: "Chunjiin Hangul Keyboard - Guide",
    about_title: "About",

    menu_file: "File",
    menu_edit: "Edit",
    menu_input: "Input",
    menu_config: "Settings",
    menu_help: "Help",

    new: "New",
    open: "Open...",
    save: "Save...",
    quit: "Quit",
    copy: "Copy",
    paste: "Paste",
    clear_all: "Clear all",
    next_mode: "Next mode",
    theme: "Theme",
    next_theme: "Next theme",
    language: "Language",
    show_toolbar: "Show toolbar",
    show_status: "Show status bar",
    compact_mode: "Compact mode",
    settings_dots: "Preferences...",
    usage: "Guide",
    about_item: "About",

    set_title: "Settings",
    set_ok: "OK",
    set_cancel: "Cancel",
    set_default: "Defaults",
    set_theme: "Theme",
    set_font_size: "Font size",
    set_tap_time: "Multi-tap window",
    set_start_mode: "Start mode",
    set_language: "Language",
    unit_px: "px",
    unit_sec: "s",
    mark_default: "(default)",

    status_composing: "Composing",
    status_chars: "chars",
    status_none: "–",

    mode_names: [
        "Hangul",
        "Latin abc",
        "Latin ABC",
        "Digits 123",
        "Symbols !@#",
    ],
    theme_names: ["Light", "Dark", "Sepia", "High contrast"],

    fn_labels: ["Mode", "←", "Space", "→", "", ""],
    fn_hints: [
        "Switch input mode (F2)",
        "Cursor left (←)",
        "Space",
        "Cursor right (→) · end multi-tap",
        "New line (Enter)",
        "Delete (Backspace)",
    ],

    tips: [
        "New (Ctrl+N)",
        "Open (Ctrl+O)",
        "Save (Ctrl+S)",
        "Copy (Ctrl+C)",
        "Paste (Ctrl+V)",
        "Clear all",
        "Switch input mode (F2)",
        "Switch theme (F3)",
        "Switch language (한국어 / English)",
        "About",
        "Preferences... (F4)",
    ],

    err_open: "Could not open the file",
    err_save: "Could not save the file",
    close: "Close",

    about_body: "Types Hangul with the 12-key Chunjiin layout.",
    about_author: "Author",
    about_engine: "Engine",
    about_build: "Build",
    about_platform: "Platform",
    about_font: "Font",
    about_theme: "Theme",
    about_settings: "Settings file",

    help: HELP_EN,
};
