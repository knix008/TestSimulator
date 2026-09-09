//! widgets.rs - 직접 그리는 키패드 버튼과 툴바 버튼.
//!
//! C++ 판은 `BS_OWNERDRAW` 로 RoundRect 를 그리고 `WM_MOUSEMOVE` /
//! `WM_MOUSELEAVE` 로 호버 상태를 들고 있었다. 같은 일을 egui 의
//! 붓(`Painter`)으로 한다.
//!
//! egui 기본 단추를 쓰지 않는 까닭은 Go 판과 같다. 역할(자음 / 모음 /
//! 문장부호 / 기능 / 모드 / 툴바)마다 색이 달라야 하는데, 겉모습을 정하는
//! `Visuals` 는 위젯 하나하나에 다른 색을 주지 못한다.

use egui::{
    Align2, Color32, CornerRadius, FontId, Id, Rect, Response, Sense, Stroke, StrokeKind, Ui,
};

use crate::icons::{paint_icon, Icon};
use crate::theme::{BtnRole, BtnState, Palette};

/// 버튼 얼굴이다. 글자 아니면 그림이다.
#[derive(Clone, Copy)]
pub enum Face<'a> {
    Text(&'a str),
    Icon(Icon),
}

/// 굵은 글꼴 갈래의 이름이다. `font.rs` 가 이 이름으로 등록한다.
pub const BOLD: &str = "chunjiin-bold";

/// 굵은 글꼴로 그릴 [`FontId`] 를 만든다.
pub fn bold_font(size: f32) -> FontId {
    FontId::new(size, egui::FontFamily::Name(BOLD.into()))
}

/// 지금 상태(기본 / 호버 / 눌림)를 고른다.
fn state_of(r: &Response) -> BtnState {
    if r.is_pointer_button_down_on() {
        BtnState::Press
    } else if r.hovered() {
        BtnState::Hover
    } else {
        BtnState::Base
    }
}

/// 키패드 버튼 하나를 그린다. 눌리면 참이다.
///
/// 자리는 부르는 쪽이 정한다. 배치 계산은 `layout.rs` 에 모아 두었고
/// 화면 없이 시험할 수 있다.
pub fn key_button(
    ui: &mut Ui,
    rect: Rect,
    id: Id,
    pal: &Palette,
    role: BtnRole,
    face: Face<'_>,
    text_size: f32,
) -> Response {
    let response = ui.interact(rect, id, Sense::click());
    let painter = ui.painter();

    let radius = CornerRadius::same(12);
    painter.rect_filled(rect, radius, pal.fill(role, state_of(&response)));
    painter.rect_stroke(
        rect,
        radius,
        Stroke::new(1.0, pal.border_of(role)),
        StrokeKind::Inside,
    );

    match face {
        Face::Text(label) => {
            painter.text(
                rect.center(),
                Align2::CENTER_CENTER,
                label,
                bold_font(text_size),
                pal.text_of(role),
            );
        }
        Face::Icon(ic) => {
            let side = rect.height().min(rect.width()) * 0.42;
            paint_icon(
                painter,
                Rect::from_center_size(rect.center(), egui::vec2(side, side)),
                ic,
                pal.text_of(role),
            );
        }
    }

    response
}

/// 툴바 아이콘 버튼 하나를 그린다. 눌리면 참이다.
///
/// 설명(툴팁)은 egui 가 띄운다. Go 판은 툴팁을 직접 그렸는데, Fyne 의
/// `PopUp` 이 캔버스 전체의 마우스 이벤트를 가로채 버튼이 깜빡거렸기
/// 때문이다. egui 의 툴팁은 마우스를 가로채지 않으므로 그 장치가 필요 없다.
pub fn icon_button(
    ui: &mut Ui,
    rect: Rect,
    id: Id,
    pal: &Palette,
    ic: Icon,
    tip: &str,
) -> Response {
    let response = ui.interact(rect, id, Sense::click());
    let painter = ui.painter();

    painter.rect_filled(
        rect,
        CornerRadius::same(6),
        pal.fill(BtnRole::Tool, state_of(&response)),
    );
    paint_icon(
        painter,
        rect.shrink(rect.width() * 0.22),
        ic,
        pal.text_of(BtnRole::Tool),
    );

    if tip.is_empty() {
        response
    } else {
        response.on_hover_text(tip)
    }
}

/// 상태줄 한 줄을 그린다.
pub fn status_line(ui: &mut Ui, rect: Rect, text: &str, color: Color32) {
    ui.painter().text(
        egui::pos2(rect.left() + 6.0, rect.center().y),
        Align2::LEFT_CENTER,
        text,
        bold_font(13.0),
        color,
    );
}
