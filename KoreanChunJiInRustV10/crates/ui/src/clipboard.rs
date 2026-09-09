//! clipboard.rs - 클립보드 읽기.
//!
//! 클립보드에 **쓰는** 것은 egui 가 `Context::copy_text` 로 해 준다.
//! **읽는** 것은 붙여넣기 이벤트로만 들어오므로, 툴바의 붙여넣기 단추처럼
//! 우리가 먼저 물어야 하는 자리에서는 운영체제에 직접 물어야 한다.

/// 클립보드의 글을 읽는다. 읽지 못하면 `None` 이다.
pub fn read() -> Option<String> {
    arboard::Clipboard::new().ok()?.get_text().ok()
}
