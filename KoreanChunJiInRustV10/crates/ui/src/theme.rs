//! theme.rs - 테마 4종과 egui 겉모습.
//!
//! 색은 KoreanChunJiInC++ 의 src/main.c `THEMES[]` 표를 그대로 옮긴 것이다.
//! 창 배경·카드·테두리·글자·흐린 글자와, 버튼 역할마다 다섯 가지 색
//! (기본 · 호버 · 눌림 · 테두리 · 글자) 을 갖는다.

use egui::{Color32, Stroke, Visuals};

/// 버튼의 역할이다. 역할마다 색이 다르다.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BtnRole {
    /// 자음 · 일반 키
    Cons,
    /// ㅣ · ㅡ
    Vowel,
    /// 문장부호
    Mod,
    /// 기능 버튼
    Fn,
    /// 모드 전환
    Primary,
    /// 툴바
    Tool,
}

/// 역할의 가짓수다.
pub const ROLE_COUNT: usize = 6;

impl BtnRole {
    fn index(self) -> usize {
        match self {
            BtnRole::Cons => 0,
            BtnRole::Vowel => 1,
            BtnRole::Mod => 2,
            BtnRole::Fn => 3,
            BtnRole::Primary => 4,
            BtnRole::Tool => 5,
        }
    }

    /// 모든 역할을 차례대로 돌려준다(시험이 전수로 훑을 때 쓴다).
    pub fn all() -> [BtnRole; ROLE_COUNT] {
        [
            BtnRole::Cons,
            BtnRole::Vowel,
            BtnRole::Mod,
            BtnRole::Fn,
            BtnRole::Primary,
            BtnRole::Tool,
        ]
    }
}

/// 엔진이 알려 준 키 역할을 화면 역할로 바꾼다.
pub fn ui_role(r: chunjiin_engine::KeyRole) -> BtnRole {
    match r {
        chunjiin_engine::KeyRole::Vowel => BtnRole::Vowel,
        chunjiin_engine::KeyRole::Mod => BtnRole::Mod,
        chunjiin_engine::KeyRole::Cons => BtnRole::Cons,
    }
}

/// 역할별 색의 자리.
pub const COLOR_BASE: usize = 0;
pub const COLOR_HOVER: usize = 1;
pub const COLOR_PRESS: usize = 2;
pub const COLOR_BORDER: usize = 3;
pub const COLOR_TEXT: usize = 4;

/// 버튼 상태다. 어느 색을 쓸지 고르는 데 쓴다.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BtnState {
    Base,
    Hover,
    Press,
}

/// 테마 하나의 색 묶음이다.
#[derive(Clone, Copy, Debug)]
pub struct Palette {
    pub name: &'static str,
    pub dark: bool,

    /// 창 배경
    pub wnd: Color32,
    /// 편집 영역 배경
    pub card: Color32,
    pub border: Color32,
    pub text: Color32,
    /// 흐린 글자 (상태줄)
    pub muted: Color32,

    pub role: [[Color32; 5]; ROLE_COUNT],
}

impl Palette {
    /// 역할과 상태에 맞는 배경색이다.
    pub fn fill(&self, role: BtnRole, state: BtnState) -> Color32 {
        let c = self.role[role.index()];
        match state {
            BtnState::Base => c[COLOR_BASE],
            BtnState::Hover => c[COLOR_HOVER],
            BtnState::Press => c[COLOR_PRESS],
        }
    }

    /// 역할의 테두리색이다.
    pub fn border_of(&self, role: BtnRole) -> Color32 {
        self.role[role.index()][COLOR_BORDER]
    }

    /// 역할의 글자색이다.
    pub fn text_of(&self, role: BtnRole) -> Color32 {
        self.role[role.index()][COLOR_TEXT]
    }

    /// 버튼 배경 위에 덮을 반투명한 색이다.
    ///
    /// 밝은 테마에서는 검정을, 어두운 테마에서는 흰색을 옅게 얹는다.
    /// 아래에 무슨 색이 있든 "조금 눌린 느낌" 이 고르게 난다.
    pub fn overlay(&self, alpha: u8) -> Color32 {
        if self.dark {
            Color32::from_rgba_unmultiplied(0xFF, 0xFF, 0xFF, alpha)
        } else {
            Color32::from_rgba_unmultiplied(0, 0, 0, alpha)
        }
    }
}

/// 열여섯 자리 숫자 하나를 푼다.
const fn nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        b'A'..=b'F' => c - b'A' + 10,
        _ => 0,
    }
}

/// `"RRGGBB"` 를 색으로 바꾼다. 표를 눈으로 확인하기 쉬우라고 쓴다.
const fn hex(s: &str) -> Color32 {
    let b = s.as_bytes();
    Color32::from_rgb(
        nibble(b[0]) * 16 + nibble(b[1]),
        nibble(b[2]) * 16 + nibble(b[3]),
        nibble(b[4]) * 16 + nibble(b[5]),
    )
}

/// 여섯 역할의 색을 순서대로 받는다.
/// 각 역할은 `{ 기본, 호버, 눌림, 테두리, 글자 }` 다섯 개다.
const fn roles(rows: [[&str; 5]; ROLE_COUNT]) -> [[Color32; 5]; ROLE_COUNT] {
    let mut out = [[Color32::BLACK; 5]; ROLE_COUNT];
    let mut i = 0;
    while i < ROLE_COUNT {
        let mut j = 0;
        while j < 5 {
            out[i][j] = hex(rows[i][j]);
            j += 1;
        }
        i += 1;
    }
    out
}

/// 테마 4종이다. 설정에 저장되는 것은 이 차례의 번호다.
pub static PALETTES: [Palette; 4] = [
    Palette {
        name: "라이트",
        dark: false,
        wnd: hex("F6F7FA"),
        card: hex("FFFFFF"),
        border: hex("DFE3EA"),
        text: hex("1F2328"),
        muted: hex("6B7280"),
        role: roles([
            //  기본      호버      눌림      테두리    글자
            ["FFFFFF", "F2F5FF", "E3EAFD", "DFE3EA", "1F2328"], // 자음
            ["EDF2FF", "E3EBFF", "D6E1FD", "D3DEFB", "2749C9"], // 모음
            ["F1F3F7", "E9ECF2", "DFE3EB", "E0E4EB", "4A5162"], // 부호
            ["F1F3F7", "E9ECF2", "DFE3EB", "E0E4EB", "333842"], // 기능
            ["3F62E8", "3557DD", "2C4AC9", "3557DD", "FFFFFF"], // 모드
            ["F6F7FA", "E7ECF8", "D9E1F5", "F6F7FA", "3B4250"], // 툴바
        ]),
    },
    Palette {
        name: "다크",
        dark: true,
        wnd: hex("1E1F22"),
        card: hex("17181B"),
        border: hex("33363D"),
        text: hex("E6E8EB"),
        muted: hex("9AA1AC"),
        role: roles([
            ["24262B", "2C2F36", "363A43", "383B43", "E6E8EB"],
            ["21304F", "27395E", "2E446F", "33456B", "A9C4FF"],
            ["1D1F24", "24262B", "2B2E35", "303339", "B7BDC7"],
            ["1D1F24", "24262B", "2B2E35", "303339", "DDE1E7"],
            ["3F62E8", "4A6DF0", "3455CE", "4A6DF0", "FFFFFF"],
            ["1E1F22", "2A2D34", "343840", "1E1F22", "D5D9E0"],
        ]),
    },
    Palette {
        name: "세피아",
        dark: false,
        wnd: hex("F3EADA"),
        card: hex("FBF3E6"),
        border: hex("DCCDB4"),
        text: hex("4A3B28"),
        muted: hex("8A755A"),
        role: roles([
            ["FBF3E6", "F6EAD6", "EEDCC0", "DCCDB4", "4A3B28"],
            ["F3E3C6", "EEDAB6", "E6CEA2", "D9C09B", "8A5A22"],
            ["EFE4D0", "E9DAC2", "E0CDAF", "D7C6AA", "5A4A34"],
            ["EFE4D0", "E9DAC2", "E0CDAF", "D7C6AA", "4A3B28"],
            ["A9713C", "96632F", "855427", "96632F", "FFF8EC"],
            ["F3EADA", "EADCC4", "E0CEB0", "F3EADA", "5A4A34"],
        ]),
    },
    Palette {
        name: "고대비",
        dark: true,
        wnd: hex("000000"),
        card: hex("000000"),
        border: hex("FFFFFF"),
        text: hex("FFFFFF"),
        muted: hex("FFFF00"),
        role: roles([
            ["000000", "222222", "444444", "FFFFFF", "FFFFFF"],
            ["000000", "222222", "444444", "FFFF00", "FFFF00"],
            ["000000", "222222", "444444", "00FF00", "00FF00"],
            ["000000", "222222", "444444", "FFFFFF", "FFFFFF"],
            ["FFFF00", "FFEA00", "E6D200", "FFFF00", "000000"],
            ["000000", "333333", "555555", "000000", "FFFF00"],
        ]),
    },
];

/// 설정 창과 메뉴에 쓰는 테마 이름 목록이다.
pub fn theme_names() -> Vec<&'static str> {
    PALETTES.iter().map(|p| p.name).collect()
}

// ---------------------------------------------------------------------
// egui 겉모습
// ---------------------------------------------------------------------

/// 팔레트를 egui 의 [`Visuals`] 로 옮긴다.
///
/// 키패드와 툴바 버튼은 직접 그리므로(widgets.rs) 여기서 정하는 색은 메뉴 ·
/// 대화 상자 · 스크롤바 · 입력칸처럼 egui 가 그리는 부분에만 쓰인다.
/// 팔레트만으로 모든 색을 내고, egui 기본값을 그대로 두는 자리는 없다.
pub fn visuals_for(p: &Palette) -> Visuals {
    let mut v = if p.dark {
        Visuals::dark()
    } else {
        Visuals::light()
    };

    let fn_base = p.fill(BtnRole::Fn, BtnState::Base);
    let fn_hover = p.fill(BtnRole::Fn, BtnState::Hover);
    let fn_press = p.fill(BtnRole::Fn, BtnState::Press);
    let accent = p.fill(BtnRole::Primary, BtnState::Base);

    v.override_text_color = Some(p.text);
    v.panel_fill = p.wnd;
    v.window_fill = p.card;
    v.extreme_bg_color = p.card;
    v.faint_bg_color = fn_base;
    v.code_bg_color = p.card;
    v.hyperlink_color = accent;
    v.selection.bg_fill = accent.gamma_multiply(0.45);
    v.selection.stroke = Stroke::new(1.0, p.text);

    v.window_stroke = Stroke::new(1.0, p.border);
    v.widgets.noninteractive.bg_fill = p.wnd;
    v.widgets.noninteractive.weak_bg_fill = p.wnd;
    v.widgets.noninteractive.bg_stroke = Stroke::new(1.0, p.border);
    v.widgets.noninteractive.fg_stroke = Stroke::new(1.0, p.muted);

    v.widgets.inactive.bg_fill = fn_base;
    v.widgets.inactive.weak_bg_fill = fn_base;
    v.widgets.inactive.bg_stroke = Stroke::new(1.0, p.border);
    v.widgets.inactive.fg_stroke = Stroke::new(1.0, p.text);

    v.widgets.hovered.bg_fill = fn_hover;
    v.widgets.hovered.weak_bg_fill = fn_hover;
    v.widgets.hovered.bg_stroke = Stroke::new(1.0, accent);
    v.widgets.hovered.fg_stroke = Stroke::new(1.0, p.text);

    v.widgets.active.bg_fill = fn_press;
    v.widgets.active.weak_bg_fill = fn_press;
    v.widgets.active.bg_stroke = Stroke::new(1.0, accent);
    v.widgets.active.fg_stroke = Stroke::new(1.0, p.text);

    v.widgets.open.bg_fill = fn_hover;
    v.widgets.open.weak_bg_fill = fn_hover;
    v.widgets.open.bg_stroke = Stroke::new(1.0, p.border);
    v.widgets.open.fg_stroke = Stroke::new(1.0, p.text);

    v
}
