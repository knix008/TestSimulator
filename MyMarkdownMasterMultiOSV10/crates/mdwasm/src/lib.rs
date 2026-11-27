//! mdcore for the browser. The page loads the .wasm and talks through four exports (no wasm-bindgen):
//!   md_alloc(len) → ptr        reserve `len` bytes for the request (UTF-8)
//!   md_call(ptr, len) → ptr    run the request {"method": ..., "args": {...}} and return a result buffer
//!   md_result_len(ptr) → len   its length
//!   md_free(ptr, len)          give a buffer back
//! The result is JSON: {"ok": value} or {"error": "message"}. src/vault/core-web.js is the other side.
use mdcore::engine::Engine;
use std::cell::RefCell;

thread_local! { static ENGINE: RefCell<Engine> = RefCell::new(Engine::new()); static LENS: RefCell<std::collections::HashMap<usize, usize>> = RefCell::new(Default::default()); }

#[no_mangle]
pub extern "C" fn md_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn md_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() { return; }
    drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
    LENS.with(|l| l.borrow_mut().remove(&(ptr as usize)));
}

#[no_mangle]
pub extern "C" fn md_result_len(ptr: *const u8) -> usize { LENS.with(|l| l.borrow().get(&(ptr as usize)).copied().unwrap_or(0)) }

#[no_mangle]
pub unsafe extern "C" fn md_call(ptr: *const u8, len: usize) -> *mut u8 {
    let input = std::slice::from_raw_parts(ptr, len);
    let reply = match serde_json::from_slice::<serde_json::Value>(input) {
        Ok(req) => {
            let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("").to_string();
            let args = req.get("args").cloned().unwrap_or(serde_json::Value::Null);
            match ENGINE.with(|e| e.borrow_mut().call(&method, &args)) { Ok(v) => serde_json::json!({ "ok": v }), Err(e) => serde_json::json!({ "error": e }) }
        }
        Err(e) => serde_json::json!({ "error": format!("bad request: {e}") }),
    };
    let mut bytes = serde_json::to_vec(&reply).unwrap_or_else(|_| b"{\"error\":\"encode\"}".to_vec());
    bytes.shrink_to_fit();
    let out_len = bytes.len();
    let out = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    LENS.with(|l| l.borrow_mut().insert(out as usize, out_len));
    out
}
