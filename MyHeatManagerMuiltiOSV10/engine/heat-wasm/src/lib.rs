//! Plain C-ABI wrapper around `heat_core` for wasm32-unknown-unknown.
//!
//! Exports (all sizes in bytes, pointers into the module's linear memory):
//! * `hm_alloc(len) -> ptr` / `hm_free(ptr, len)`: input buffers.
//! * `hm_run(ptr, len) -> out`: runs the model JSON at ptr..ptr+len. `out`
//!   points to a buffer whose first 4 bytes are the little-endian u32 length
//!   of the result bytes that follow. Release it with `hm_result_free(out)`.
//! * `hm_validate(ptr, len) -> out`: same framing; payload is a JSON array of
//!   problem strings.
//!
//! Imports (module "env"):
//! * `hm_progress(phase_ptr, phase_len, fraction: f64, msg_ptr, msg_len)`
//! * `hm_cancelled() -> i32` (non-zero = cancel)

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn hm_progress(phase_ptr: *const u8, phase_len: usize, fraction: f64, msg_ptr: *const u8, msg_len: usize);
    fn hm_cancelled() -> i32;
}

// Native builds (cargo check / tests on the host) get inert stand-ins.
#[cfg(not(target_arch = "wasm32"))]
unsafe fn hm_progress(_: *const u8, _: usize, _: f64, _: *const u8, _: usize) {}
#[cfg(not(target_arch = "wasm32"))]
unsafe fn hm_cancelled() -> i32 {
    0
}

#[no_mangle]
pub extern "C" fn hm_alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `hm_alloc(len)` with the same `len`.
#[no_mangle]
pub unsafe extern "C" fn hm_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
    }
}

/// Length-prefixed output buffer (u32 LE length + payload), leaked to the host.
fn framed(payload: &[u8]) -> *mut u8 {
    let mut out = Vec::with_capacity(payload.len() + 4);
    out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    out.extend_from_slice(payload);
    let mut b = out.into_boxed_slice();
    let p = b.as_mut_ptr();
    std::mem::forget(b);
    p
}

/// # Safety
/// `ptr` must be a buffer returned by `hm_run` or `hm_validate`.
#[no_mangle]
pub unsafe extern "C" fn hm_result_free(ptr: *mut u8) {
    if ptr.is_null() {
        return;
    }
    let len = u32::from_le_bytes([*ptr, *ptr.add(1), *ptr.add(2), *ptr.add(3)]) as usize;
    let slice = std::ptr::slice_from_raw_parts_mut(ptr, len + 4);
    drop(Box::from_raw(slice));
}

unsafe fn input<'a>(ptr: *const u8, len: usize) -> &'a str {
    if ptr.is_null() || len == 0 {
        return "";
    }
    let bytes = std::slice::from_raw_parts(ptr, len);
    std::str::from_utf8(bytes).unwrap_or("")
}

/// # Safety
/// `ptr..ptr+len` must be readable UTF-8 model JSON.
#[no_mangle]
pub unsafe extern "C" fn hm_run(ptr: *const u8, len: usize) -> *mut u8 {
    let json = input(ptr, len);
    let mut progress = |p: &heat_core::Progress| {
        hm_progress(p.phase.as_ptr(), p.phase.len(), p.fraction, p.message.as_ptr(), p.message.len());
    };
    let cancel = || hm_cancelled() != 0;
    let bytes = heat_core::run(json, &mut progress, &cancel);
    framed(&bytes)
}

/// # Safety
/// `ptr..ptr+len` must be readable UTF-8 model JSON.
#[no_mangle]
pub unsafe extern "C" fn hm_validate(ptr: *const u8, len: usize) -> *mut u8 {
    let json = input(ptr, len);
    let problems = heat_core::validate(json);
    let s = serde_json_array(&problems);
    framed(s.as_bytes())
}

/// Minimal JSON string-array encoder (keeps this crate dependency-free).
fn serde_json_array(items: &[String]) -> String {
    let mut s = String::from("[");
    for (i, it) in items.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push('"');
        for ch in it.chars() {
            match ch {
                '"' => s.push_str("\\\""),
                '\\' => s.push_str("\\\\"),
                '\n' => s.push_str("\\n"),
                '\r' => s.push_str("\\r"),
                '\t' => s.push_str("\\t"),
                c if (c as u32) < 0x20 => s.push_str(&format!("\\u{:04x}", c as u32)),
                c => s.push(c),
            }
        }
        s.push('"');
    }
    s.push(']');
    s
}
