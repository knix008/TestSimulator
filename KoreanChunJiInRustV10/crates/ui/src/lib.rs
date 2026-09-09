//! 천지인 한글 입력기의 데스크톱 화면.
//!
//! Windows · macOS · Linux 에서 같은 코드로 돈다. 조합 규칙은 하나도 여기에
//! 없다. 전부 [`chunjiin_engine`] 이 맡고, 이 꾸러미는 그것을 비추기만 한다.
//!
//! ```text
//! app.rs       창 조립 - 메뉴 · 툴바 · 키패드 · 딸린 창
//! theme.rs     테마 4종
//! lang.rs      한국어 · 영어 글자표
//! help.rs      사용법 본문
//! widgets.rs   직접 그리는 키패드 · 툴바 버튼
//! icons.rs     선으로 그리는 그림
//! layout.rs    키패드 배치 · 커서 자리 옮기기 (순수 계산)
//! settings.rs  설정 저장 (JSON)
//! font.rs      내장 글꼴 등록
//! ```

#![forbid(unsafe_code)]

pub mod app;
pub mod clipboard;
pub mod font;
pub mod help;
pub mod icons;
pub mod lang;
pub mod layout;
pub mod settings;
pub mod theme;
pub mod widgets;

/// 툴바 버튼 수다. [`lang::Strings::tips`] 의 길이와 같아야 한다.
pub const TOOL_COUNT: usize = 11;

pub use app::{run, App, VERSION};
