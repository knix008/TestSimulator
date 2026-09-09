//! 천지인(千地人) 한글 조합 엔진.
//!
//! KoreanChunJiInC++ 의 `src/chunjiin.c`(원본, 수정 금지) 와 `src/input.c`
//! (오토마타) 를 순수 Rust 로 옮긴 것이다. 외부 의존이 없고 운영체제를
//! 가리지 않으므로 데스크톱 GUI(egui)와 웹(WASM)이 같은 코드를 쓴다.
//!
//! ```text
//! chunjiin.rs   원본 chunjiin.c  - 유니코드 조합, 겹받침
//! input.rs      원본 input.c     - 오토마타, 편집 API
//! labels.rs     라벨 · 모드 이름 · 상태줄
//! ```
//!
//! # 보기
//!
//! ```
//! use chunjiin_engine::State;
//!
//! let mut s = State::new();
//! for k in [3, 0, 1] {      // ㄱ  ㅣ  ·
//!     s.key(k);
//! }
//! s.commit();
//! assert_eq!(s.text(), "가");
//! ```

#![forbid(unsafe_code)]

mod chunjiin;
mod input;
mod labels;

pub use chunjiin::{
    check_double, get_unicode, HangulState, InputMode, JamoSlot, State, KEY_COUNT, MAX_TEXT_LEN,
    MODE_COUNT,
};
pub use labels::{KeyRole, MODE_NAMES};
