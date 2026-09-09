//! font.rs - 글꼴 등록.
//!
//! egui 의 기본 글꼴에는 한글이 없어서 **Noto Sans KR 을 실행 파일에
//! 넣는다.** 완성형 11172자를 모두 담고 있어야 `갂 갃` 같은 글자도 그려진다.
//!
//! 가변 글꼴 `NotoSansKR[wght].ttf` 를 그대로 넣으면 안 된다. 그 글꼴은
//! `wght` 축의 **기본값이 100(Thin)** 이라서 글자가 아주 가늘게, 흐릿하게
//! 나온다. 그래서 400 과 700 으로 미리 뽑아 둔 두 벌을 넣는다.
//!
//! ```sh
//! python -m fontTools.varLib.instancer -o NotoSansKR-Regular.ttf NotoSansKR[wght].ttf wght=400
//! python -m fontTools.varLib.instancer -o NotoSansKR-Bold.ttf    NotoSansKR[wght].ttf wght=700
//! ```
//!
//! 버튼과 상태줄은 [`crate::widgets::bold_font`] 로 굵은 갈래를 못박는다.

use std::sync::Arc;

use egui::{FontData, FontDefinitions, FontFamily};

use crate::widgets::BOLD;

/// 본문 글꼴이다 (Noto Sans KR 400, SIL OFL 1.1).
pub const NOTO_REGULAR: &[u8] = include_bytes!("../../../assets/fonts/NotoSansKR-Regular.ttf");

/// 버튼 라벨과 강조에 쓰는 굵은 글꼴이다 (Noto Sans KR 700).
pub const NOTO_BOLD: &[u8] = include_bytes!("../../../assets/fonts/NotoSansKR-Bold.ttf");

/// 창과 작업 표시줄에 쓰는 아이콘이다. KoreanChunJiInC++ 의 것을 그대로 쓴다.
pub const ICON_PNG: &[u8] = include_bytes!("../../../assets/chunjiin.png");

const REGULAR_KEY: &str = "chunjiin-regular";

/// 내장 글꼴을 egui 에 등록한다.
///
/// 한글 글꼴을 먼저 놓고 egui 기본 글꼴을 뒤에 남겨 둔다. 그래야 한글에
/// 없는 기호(←, →, ·, ‥)가 기본 글꼴에서 채워진다.
pub fn install(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();

    fonts.font_data.insert(
        REGULAR_KEY.to_owned(),
        Arc::new(FontData::from_static(NOTO_REGULAR)),
    );
    fonts
        .font_data
        .insert(BOLD.to_owned(), Arc::new(FontData::from_static(NOTO_BOLD)));

    // 본문: 한글 -> egui 기본
    fonts
        .families
        .entry(FontFamily::Proportional)
        .or_default()
        .insert(0, REGULAR_KEY.to_owned());
    fonts
        .families
        .entry(FontFamily::Monospace)
        .or_default()
        .insert(0, REGULAR_KEY.to_owned());

    // 굵게: 굵은 한글 -> 본문 한글 -> egui 기본
    let mut bold = vec![BOLD.to_owned(), REGULAR_KEY.to_owned()];
    bold.extend(
        fonts
            .families
            .get(&FontFamily::Proportional)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|n| n != REGULAR_KEY),
    );
    fonts.families.insert(FontFamily::Name(BOLD.into()), bold);

    ctx.set_fonts(fonts);
}

/// 창 아이콘을 읽어 eframe 이 쓰는 꼴로 만든다.
///
/// PNG 를 푸는 데 그림 꾸러미를 따로 들이지 않는다. `eframe` 이 이미
/// 들고 있는 `image` 를 쓴다.
pub fn window_icon() -> Option<egui::IconData> {
    let img = image::load_from_memory(ICON_PNG).ok()?.into_rgba8();
    let (width, height) = img.dimensions();
    Some(egui::IconData {
        rgba: img.into_raw(),
        width,
        height,
    })
}
