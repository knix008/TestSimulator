//! 사용법 창 본문이 실제로 차지하는 자리를 화면 없이 재 본다(진단용).
//!
//!   cargo run -p chunjiin-ui --example measure

use chunjiin_ui::app::{help_body, help_width};

fn main() {
    let ctx = egui::Context::default();
    chunjiin_ui::font::install(&ctx);
    // 글꼴은 다음 판부터 듣는다. 빈 판을 한 번 돌려 등록을 끝낸다.
    let mut out = ctx.run_ui(egui::RawInput::default(), |_| {});
    out.textures_delta.clear();

    for (name, text) in [
        ("ko", chunjiin_ui::help::HELP_KO),
        ("en", chunjiin_ui::help::HELP_EN),
    ] {
        let (l, r) = chunjiin_ui::help::two_columns(text);
        let w = help_width(&ctx, &l, &r);

        let mut used = egui::Vec2::ZERO;
        let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
            let frame = egui::Frame::central_panel(ui.style());
            egui::CentralPanel::default().frame(frame).show(ui, |ui| {
                let at = egui::Rect::from_min_size(ui.min_rect().min, egui::vec2(w, 4000.0));
                let inner = ui.scope_builder(
                    egui::UiBuilder::new()
                        .max_rect(at)
                        .layout(egui::Layout::top_down(egui::Align::Min)),
                    |ui| {
                        help_body(ui, &l, &r, "닫기");
                        // 상자가 실제로 차지한 자리를 스스로 알려 준다.
                        ui.min_rect().size()
                    },
                );
                used = inner.inner;
            });
        });
        out.textures_delta.clear();

        println!(
            "{name}  본문 폭 {w:.0}  잰 자리 {:.0}x{:.0}   ({}줄 / {}줄)",
            used.x,
            used.y,
            l.lines().count(),
            r.lines().count()
        );
    }
}
