//! icons.rs - 툴바와 기능 버튼에 그리는 그림.
//!
//! Go 판은 Fyne 이 들고 있는 SVG 아이콘을 썼고, 웹 판은 인라인 SVG 를 썼다.
//! egui 에는 아이콘 꾸러미가 없으므로 같은 모양을 선으로 직접 그린다.
//! 이모지를 쓰면 시스템마다 색과 크기가 달라지고, 글꼴 문자(↵ U+21B5,
//! ⌫ U+232B)는 내장한 Noto Sans KR 에 들어 있지 않아 빈칸이 된다.
//!
//! 좌표는 모두 24x24 자리를 기준으로 적는다. 웹 판 `index.html` 의
//! `viewBox="0 0 24 24"` 와 같은 자리이므로 두 판의 그림이 같다.

use egui::{Color32, Painter, Pos2, Rect, Shape, Stroke, Vec2};

// 아래 좌표표는 24x24 자리에 그린 모양이다. 줄을 바꾸면 형태를 눈으로
// 좇을 수 없으므로 자동 정렬을 끈다.

/// 그림 하나의 정의다. 모두 선으로만 그린다.
pub struct IconDef {
    /// 이어 그리는 선들
    pub lines: &'static [&'static [(f32, f32)]],
    /// 테두리만 그리는 원 `(cx, cy, r)`
    pub circles: &'static [(f32, f32, f32)],
    /// 속을 채운 점 `(cx, cy, r)`
    pub dots: &'static [(f32, f32, f32)],
    /// 테두리만 그리는 타원 `(cx, cy, rx, ry)`
    pub ellipses: &'static [(f32, f32, f32, f32)],
    /// 호 `(cx, cy, r, 시작각, 끝각)` - 각은 도(°), 0°가 오른쪽이다
    pub arcs: &'static [(f32, f32, f32, f32, f32)],
}

const NONE_C: &[(f32, f32, f32)] = &[];
const NONE_E: &[(f32, f32, f32, f32)] = &[];
const NONE_A: &[(f32, f32, f32, f32, f32)] = &[];

const fn icon(lines: &'static [&'static [(f32, f32)]]) -> IconDef {
    IconDef {
        lines,
        circles: NONE_C,
        dots: NONE_C,
        ellipses: NONE_E,
        arcs: NONE_A,
    }
}

/// 툴바에 놓는 그림들이다. `Strings::tips` 와 차례가 같아야 한다.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Icon {
    New,
    Open,
    Save,
    Copy,
    Paste,
    Clear,
    Mode,
    Theme,
    Language,
    Settings,
    About,
    Help,
    /// 줄바꿈 (↵)
    Enter,
    /// 지우기 (⌫)
    Backspace,
}

impl Icon {
    pub fn def(self) -> &'static IconDef {
        match self {
            Icon::New => &NEW,
            Icon::Open => &OPEN,
            Icon::Save => &SAVE,
            Icon::Copy => &COPY,
            Icon::Paste => &PASTE,
            Icon::Clear => &CLEAR,
            Icon::Mode => &MODE,
            Icon::Theme => &THEME,
            Icon::Language => &LANGUAGE,
            Icon::Settings => &SETTINGS,
            Icon::About => &ABOUT,
            Icon::Help => &HELP,
            Icon::Enter => &ENTER,
            Icon::Backspace => &BACKSPACE,
        }
    }
}

/// 툴바 단추의 차례다. Go 판 `buildToolbar` 와 같다.
pub const TOOL_ICONS: [Icon; crate::TOOL_COUNT] = [
    Icon::New,
    Icon::Open,
    Icon::Save,
    Icon::Copy,
    Icon::Paste,
    Icon::Clear,
    Icon::Mode,
    Icon::Theme,
    Icon::Language,
    Icon::Settings,
    Icon::About,
];

#[rustfmt::skip]
static NEW: IconDef = icon(&[
    &[(6.0, 2.0), (13.0, 2.0), (18.0, 7.0), (18.0, 22.0), (6.0, 22.0), (6.0, 2.0)],
    &[(13.0, 2.0), (13.0, 7.0), (18.0, 7.0)],
]);

#[rustfmt::skip]
static OPEN: IconDef = icon(&[&[(3.0, 6.0), (10.0, 6.0), (12.0, 8.0), (21.0, 8.0), (21.0, 20.0), (3.0, 20.0), (3.0, 6.0)]]);

#[rustfmt::skip]
static SAVE: IconDef = icon(&[
    &[(4.0, 3.0), (17.0, 3.0), (20.0, 6.0), (20.0, 21.0), (4.0, 21.0), (4.0, 3.0)],
    &[(8.0, 3.0), (8.0, 9.0), (16.0, 9.0), (16.0, 3.0)],
    &[(8.0, 13.0), (16.0, 13.0), (16.0, 21.0), (8.0, 21.0), (8.0, 13.0)],
]);

#[rustfmt::skip]
static COPY: IconDef = icon(&[
    &[(9.0, 9.0), (21.0, 9.0), (21.0, 21.0), (9.0, 21.0), (9.0, 9.0)],
    &[(15.0, 5.5), (15.0, 3.0), (3.0, 3.0), (3.0, 15.0), (5.5, 15.0)],
]);

#[rustfmt::skip]
static PASTE: IconDef = icon(&[
    &[(9.0, 3.0), (15.0, 3.0), (15.0, 6.0), (9.0, 6.0), (9.0, 3.0)],
    &[(15.0, 5.0), (18.0, 5.0), (18.0, 21.0), (6.0, 21.0), (6.0, 5.0), (9.0, 5.0)],
    &[(9.0, 12.0), (15.0, 12.0)],
    &[(9.0, 16.0), (15.0, 16.0)],
]);

#[rustfmt::skip]
static CLEAR: IconDef = icon(&[
    &[(4.0, 7.0), (20.0, 7.0)],
    &[(10.0, 11.0), (10.0, 17.0)],
    &[(14.0, 11.0), (14.0, 17.0)],
    &[(6.0, 7.0), (7.0, 20.0), (17.0, 20.0), (18.0, 7.0)],
    &[(9.0, 7.0), (9.0, 4.0), (15.0, 4.0), (15.0, 7.0)],
]);

/// 입력 모드 전환 - 한 바퀴 도는 화살표
#[rustfmt::skip]
static MODE: IconDef = IconDef {
    lines: &[&[(20.0, 4.0), (20.0, 11.0), (13.0, 11.0)]],
    circles: NONE_C,
    dots: NONE_C,
    ellipses: NONE_E,
    arcs: &[(12.0, 12.0, 8.0, -35.0, 290.0)],
};

/// 테마 전환 - 팔레트
#[rustfmt::skip]
static THEME: IconDef = IconDef {
    lines: &[&[(12.0, 3.0), (17.0, 4.4), (20.4, 8.4), (21.0, 13.0), (18.6, 16.0), (15.0, 16.0), (13.6, 17.4), (14.4, 19.6), (14.0, 21.0), (10.0, 20.6), (5.6, 18.0), (3.2, 13.6), (3.6, 8.6), (7.0, 4.6), (12.0, 3.0)]],
    circles: NONE_C,
    dots: &[(7.5, 11.0, 1.2), (11.0, 7.0, 1.2), (15.5, 8.5, 1.2)],
    ellipses: NONE_E,
    arcs: NONE_A,
};

/// 언어 전환 - 지구본
///
/// 테두리 원 · 적도 · 세로 경도선 · 휘어 보이는 경도선(타원)이다.
/// 굵게 채운 도형으로 그리면 작은 크기에서 원반처럼 뭉개진다.
#[rustfmt::skip]
static LANGUAGE: IconDef = IconDef {
    lines: &[&[(3.0, 12.0), (21.0, 12.0)], &[(12.0, 3.0), (12.0, 21.0)]],
    circles: &[(12.0, 12.0, 9.0)],
    dots: NONE_C,
    ellipses: &[(12.0, 12.0, 4.6, 9.0)],
    arcs: NONE_A,
};

/// 설정 - 톱니바퀴
#[rustfmt::skip]
static SETTINGS: IconDef = IconDef {
    lines: &[&[(12.0, 2.5), (13.6, 5.1), (16.6, 4.5), (17.1, 7.5), (19.8, 8.9), (18.2, 11.5), (19.8, 14.1), (17.1, 15.5), (16.6, 18.5), (13.6, 17.9), (12.0, 21.5), (10.4, 18.9), (7.4, 19.5), (6.9, 16.5), (4.2, 15.1), (5.8, 12.0), (4.2, 9.4), (6.9, 8.0), (7.4, 5.0), (10.4, 5.6), (12.0, 2.5)]],
    circles: &[(12.0, 12.0, 3.2)],
    dots: NONE_C,
    ellipses: NONE_E,
    arcs: NONE_A,
};

/// 프로그램 정보 - i
#[rustfmt::skip]
static ABOUT: IconDef = IconDef {
    lines: &[&[(12.0, 11.0), (12.0, 17.0)]],
    circles: &[(12.0, 12.0, 9.0)],
    dots: &[(12.0, 7.6, 1.0)],
    ellipses: NONE_E,
    arcs: NONE_A,
};

/// 사용법 - ?
#[rustfmt::skip]
static HELP: IconDef = IconDef {
    lines: &[&[(9.3, 9.6), (10.4, 7.6), (12.7, 7.4), (14.2, 9.0), (13.6, 11.2), (12.0, 12.6), (12.0, 14.1)]],
    circles: &[(12.0, 12.0, 9.0)],
    dots: &[(12.0, 17.4, 1.0)],
    ellipses: NONE_E,
    arcs: NONE_A,
};

/// 줄바꿈 (↵). 오른쪽 위에서 내려와 왼쪽으로 꺾이고 화살촉이 붙는다.
#[rustfmt::skip]
static ENTER: IconDef = icon(&[
    &[(19.4, 5.0), (19.4, 13.6), (7.4, 13.6)],
    &[(10.4, 10.1), (6.5, 13.6), (10.4, 17.1)],
]);

/// 지우기 (⌫). 왼쪽이 뾰족한 상자와 가운데 X.
#[rustfmt::skip]
static BACKSPACE: IconDef = icon(&[
    &[(9.0, 5.0), (19.3, 5.0), (21.0, 6.7), (21.0, 17.3), (19.3, 19.0), (9.0, 19.0), (3.0, 12.0), (9.0, 5.0)],
    &[(12.4, 9.4), (17.4, 14.6)],
    &[(17.4, 9.4), (12.4, 14.6)],
]);

/// 그림을 `rect` 안에 꽉 차게 그린다.
///
/// 24x24 자리를 정사각형으로 맞춰 넣으므로 칸이 길쭉해도 찌그러지지 않는다.
pub fn paint_icon(painter: &Painter, rect: Rect, ic: Icon, color: Color32) {
    let def = ic.def();
    let size = rect.width().min(rect.height());
    let scale = size / 24.0;
    let origin = rect.center() - Vec2::splat(size / 2.0);
    let at = |p: (f32, f32)| -> Pos2 { origin + Vec2::new(p.0 * scale, p.1 * scale) };

    // 선 굵기는 그림 크기를 따라간다. 작게 그려도 형태가 남는다.
    let stroke = Stroke::new((scale * 1.7).max(1.0), color);

    for line in def.lines {
        painter.add(Shape::line(line.iter().map(|p| at(*p)).collect(), stroke));
    }
    for (cx, cy, r) in def.circles {
        painter.circle_stroke(at((*cx, *cy)), r * scale, stroke);
    }
    for (cx, cy, r) in def.dots {
        painter.circle_filled(at((*cx, *cy)), (r * scale).max(1.0), color);
    }
    for (cx, cy, rx, ry) in def.ellipses {
        painter.add(Shape::closed_line(
            sample(48, |t| {
                let a = t * std::f32::consts::TAU;
                at((cx + rx * a.cos(), cy + ry * a.sin()))
            }),
            stroke,
        ));
    }
    for (cx, cy, r, from, to) in def.arcs {
        let (from, to) = (from.to_radians(), to.to_radians());
        painter.add(Shape::line(
            sample(40, |t| {
                let a = from + (to - from) * t;
                at((cx + r * a.cos(), cy + r * a.sin()))
            }),
            stroke,
        ));
    }
}

/// 곡선을 `n` 도막으로 나눠 점을 뽑는다.
fn sample(n: usize, f: impl Fn(f32) -> Pos2) -> Vec<Pos2> {
    (0..=n).map(|i| f(i as f32 / n as f32)).collect()
}
