//! chunjiin - 천지인 한글 입력기 (데스크톱).
//!
//! Windows / macOS / Linux 에서 같은 코드로 돈다.
//! 조합 엔진은 `chunjiin-engine` 에 있고 화면은 `chunjiin-ui` 에 있다.

// 윈도우에서 콘솔 창이 따라 뜨지 않게 한다. Go 판의 -H windowsgui 자리다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

fn main() -> eframe::Result<()> {
    chunjiin_ui::run()
}
