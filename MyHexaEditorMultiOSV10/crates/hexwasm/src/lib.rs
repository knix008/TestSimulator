//! hexcore for the browser. The page loads the .wasm and talks through these exports (no wasm-bindgen):
//!   hx_alloc(len) → ptr                 reserve `len` bytes (a request, or file bytes to open)
//!   hx_free(ptr, len)                   give a buffer back
//!   hx_call(ptr, len) → ptr             run {"method": ..., "args": {...}} (UTF-8 JSON); result JSON {"ok": v} | {"error": "…"}
//!   hx_result_len(ptr) → len            the length of a buffer this module returned
//!   hx_open(ptr, len, name_ptr, name_len) → id   a new document over the bytes at ptr (taken over: do not free them)
//!   hx_bytes(id, offset, length) → ptr  raw bytes of a document (0 on error; length via hx_result_len) — saving
//! Imports: env.hx_progress(done, total) → 1 to go on, 0 to cancel (long calls report through it).
//! src/core/core.js is the other side.
use hexcore::{Document, Engine};
use std::cell::RefCell;
use std::collections::HashMap;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    /// Progress of a long call (done, total); returns 0 to cancel. The page (a worker) posts it to the window.
    fn hx_progress(done: f64, total: f64) -> i32;
}

#[cfg(target_arch = "wasm32")]
fn report(done: u64, total: u64) -> bool {
    unsafe { hx_progress(done as f64, total as f64) != 0 }
}
#[cfg(not(target_arch = "wasm32"))]
fn report(_done: u64, _total: u64) -> bool {
    true
}

thread_local! {
    static ENGINE: RefCell<Engine> = RefCell::new(Engine::new());
    static LENS: RefCell<HashMap<usize, usize>> = RefCell::new(HashMap::new());
}

/// Hands a buffer to the page: its capacity is exactly its length (a boxed slice), at least 1.
fn give(mut bytes: Vec<u8>) -> *mut u8 {
    if bytes.is_empty() {
        bytes.push(0);
        bytes.clear();
    }
    let len = bytes.len();
    let boxed = if len == 0 { vec![0u8].into_boxed_slice() } else { bytes.into_boxed_slice() };
    let ptr = Box::into_raw(boxed) as *mut u8;
    LENS.with(|l| l.borrow_mut().insert(ptr as usize, len));
    ptr
}

#[no_mangle]
pub extern "C" fn hx_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr` must come from `hx_alloc(len)` or be a result of this module with that length.
#[no_mangle]
pub unsafe extern "C" fn hx_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() {
        return;
    }
    match LENS.with(|l| l.borrow_mut().remove(&(ptr as usize))) {
        // A result: a boxed slice of `n` bytes (1 when empty).
        Some(n) => drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, n.max(1)))),
        // A request buffer from hx_alloc.
        None => drop(Vec::from_raw_parts(ptr, 0, len.max(1))),
    }
}

#[no_mangle]
pub extern "C" fn hx_result_len(ptr: *const u8) -> usize {
    LENS.with(|l| l.borrow().get(&(ptr as usize)).copied().unwrap_or(0))
}

/// # Safety
/// `ptr..ptr+len` must be a request written into a buffer from `hx_alloc`.
#[no_mangle]
pub unsafe extern "C" fn hx_call(ptr: *const u8, len: usize) -> *mut u8 {
    let input = std::slice::from_raw_parts(ptr, len);
    let reply = match serde_json::from_slice::<serde_json::Value>(input) {
        Ok(req) => {
            let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("").to_string();
            let args = req.get("args").cloned().unwrap_or(serde_json::Value::Null);
            match ENGINE.with(|e| e.borrow_mut().call_with(&method, &args, &mut report)) {
                Ok(v) => serde_json::json!({ "ok": v }),
                Err(e) => serde_json::json!({ "error": e }),
            }
        }
        Err(e) => serde_json::json!({ "error": format!("bad request: {e}") }),
    };
    give(serde_json::to_vec(&reply).unwrap_or_else(|_| b"{\"error\":\"encode\"}".to_vec()))
}

/// # Safety
/// `ptr` must come from `hx_alloc(len)` (the bytes are taken over), `name_ptr` from `hx_alloc(name_len)`.
#[no_mangle]
pub unsafe extern "C" fn hx_open(ptr: *mut u8, len: usize, name_ptr: *const u8, name_len: usize) -> u32 {
    let mut bytes = Vec::from_raw_parts(ptr, len.max(1), len.max(1));
    bytes.truncate(len);
    let name = String::from_utf8_lossy(std::slice::from_raw_parts(name_ptr, name_len)).into_owned();
    ENGINE.with(|e| e.borrow_mut().add(Document::from_bytes(bytes, name)))
}

#[no_mangle]
pub extern "C" fn hx_bytes(id: u32, offset: f64, length: f64) -> *mut u8 {
    let result = ENGINE.with(|e| e.borrow().doc(id).and_then(|d| d.read_vec(offset as u64, length as u64)));
    match result {
        Ok(bytes) => give(bytes),
        Err(_) => std::ptr::null_mut(),
    }
}
