//! chunjiin-wasm - 웹 판이 쓰는 조합 엔진.
//!
//! 데스크톱 판과 똑같은 [`chunjiin_engine`] 을 브라우저에서 쓸 수 있게 감싼
//! 것이다. 화면은 `web/` 아래의 HTML 과 CSS 가 그리고, 조합은 전부 여기로
//! 넘어온다. 그래서 웹과 데스크톱의 조합 결과가 어긋날 수 없다.
//!
//! # 자바스크립트에서 쓰는 법
//!
//! ```js
//! import init, * as engine from './chunjiin_wasm.js';
//! await init();
//! const snap = JSON.parse(engine.key(3));   // 키패드 3번을 누른다
//! ```
//!
//! **모든 함수가 처리를 마친 뒤의 상태를 JSON 으로 돌려준다.** 그래서 부른
//! 쪽은 따로 상태를 다시 물을 필요가 없다.
//!
//! 상태를 JSON 글로 넘기는 까닭은 사이에 낀 것을 줄이려는 것이다. 상태
//! 객체는 열몇 칸짜리라 글로 만들었다 푸는 값이 싸고, 자바스크립트 쪽에서는
//! `JSON.parse` 하나로 끝난다.

#![forbid(unsafe_code)]

use std::cell::RefCell;

use chunjiin_engine::{State, KEY_COUNT, MODE_COUNT, MODE_NAMES};
use wasm_bindgen::prelude::*;

thread_local! {
    /// 브라우저 탭 하나에 입력기 하나다.
    static STATE: RefCell<State> = RefCell::new(State::new());
}

/// 화면을 그리는 데 필요한 것을 모두 담은 상태다.
#[derive(serde::Serialize)]
struct Snapshot {
    text: String,
    cursor: usize,
    length: usize,
    mode: usize,
    #[serde(rename = "modeName")]
    mode_name: &'static str,
    #[serde(rename = "modeNames")]
    mode_names: [&'static str; MODE_COUNT],
    composition: String,
    composing: bool,
    labels: Vec<&'static str>,
    roles: Vec<&'static str>,
}

/// 동작 하나를 하고, 마친 뒤의 상태를 JSON 으로 돌려준다.
fn act(f: impl FnOnce(&mut State)) -> String {
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        f(&mut s);
        snapshot(&s)
    })
}

fn snapshot(s: &State) -> String {
    let snap = Snapshot {
        text: s.text(),
        cursor: s.cursor_pos,
        length: s.len(),
        mode: s.now_mode.index(),
        mode_name: s.mode_name(),
        mode_names: MODE_NAMES,
        composition: s.composition_text(),
        composing: s.hangul.flag_writing,
        labels: (0..KEY_COUNT).map(|i| s.key_label(i)).collect(),
        roles: (0..KEY_COUNT).map(|i| s.key_role_of(i).name()).collect(),
    };
    // 상태를 글로 만드는 데 실패할 자리가 없다. 그래도 화면이 멎지 않도록
    // 빈 객체를 돌려준다.
    serde_json::to_string(&snap).unwrap_or_else(|_| "{}".to_string())
}

/// 키패드 키(0~11) 하나를 누른다.
#[wasm_bindgen]
pub fn key(i: i32) -> String {
    act(|s| s.key(i))
}

/// 띄어쓰기.
#[wasm_bindgen]
pub fn space() -> String {
    act(|s| s.space())
}

/// 한 단계 지우기.
#[wasm_bindgen]
pub fn backspace() -> String {
    act(|s| s.backspace())
}

/// 커서 뒤 한 글자 지우기.
#[wasm_bindgen]
pub fn del() -> String {
    act(|s| s.delete())
}

/// 줄바꿈.
#[wasm_bindgen]
pub fn enter() -> String {
    act(|s| s.insert_char('\n'))
}

/// 조합 확정.
#[wasm_bindgen]
pub fn commit() -> String {
    act(|s| s.commit())
}

/// 모드를 유지한 채 전체 지우기.
#[wasm_bindgen]
pub fn clear() -> String {
    act(|s| s.clear())
}

/// 처음 상태로 되돌리기.
#[wasm_bindgen]
pub fn reset() -> String {
    act(|s| s.reset())
}

/// 커서를 `delta` 만큼 옮긴다.
#[wasm_bindgen(js_name = moveCursor)]
pub fn move_cursor(delta: i32) -> String {
    act(|s| s.move_cursor(delta))
}

/// 커서를 절대 위치로 옮긴다.
#[wasm_bindgen(js_name = setCursor)]
pub fn set_cursor(pos: usize) -> String {
    act(|s| s.set_cursor(pos))
}

/// 여러 글자를 넣는다(붙여넣기).
#[wasm_bindgen(js_name = insertText)]
pub fn insert_text(text: &str) -> String {
    act(|s| s.insert_str(text))
}

/// 버퍼를 통째로 갈아 끼운다(파일 열기).
#[wasm_bindgen(js_name = setText)]
pub fn set_text(text: &str) -> String {
    act(|s| s.set_text(text))
}

/// 입력 모드를 고른다(0~4).
#[wasm_bindgen(js_name = setMode)]
pub fn set_mode(mode: usize) -> String {
    act(|s| s.set_mode_index(mode))
}

/// 다음 입력 모드로 넘어간다.
#[wasm_bindgen(js_name = cycleMode)]
pub fn cycle_mode() -> String {
    act(|s| s.cycle_mode())
}

/// 연타 순환을 끊는다.
#[wasm_bindgen(js_name = breakMultitap)]
pub fn break_multitap() -> String {
    act(|s| s.break_multitap())
}

/// 아무것도 하지 않고 지금 상태만 돌려준다.
#[wasm_bindgen]
pub fn state() -> String {
    act(|_| {})
}
