//! Plain C-ABI wrapper around `sim_core` for wasm32-unknown-unknown.
//!
//! Exports (all sizes in bytes, pointers into the module's linear memory):
//! * `sm_alloc(len) -> ptr` / `sm_free(ptr, len)`: input buffers.
//! * `sm_run(ptr, len) -> out`: runs the pipeline JSON at ptr..ptr+len. `out`
//!   points to a buffer whose first 4 bytes are the little-endian u32 length
//!   of the result bytes that follow. Release it with `sm_result_free(out)`.
//! * `sm_validate(ptr, len) -> out`: same framing; payload is a JSON array of
//!   problem strings.
//!
//! Imports (module "env"):
//! * `sm_progress(phase_ptr, phase_len, fraction: f64, msg_ptr, msg_len)`
//! * `sm_cancelled() -> i32` (non-zero = cancel)

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn sm_progress(phase_ptr: *const u8, phase_len: usize, fraction: f64, msg_ptr: *const u8, msg_len: usize);
    fn sm_cancelled() -> i32;
}

// Native builds (cargo check / tests on the host) get inert stand-ins.
#[cfg(not(target_arch = "wasm32"))]
unsafe fn sm_progress(_: *const u8, _: usize, _: f64, _: *const u8, _: usize) {}
#[cfg(not(target_arch = "wasm32"))]
unsafe fn sm_cancelled() -> i32 {
    0
}

#[no_mangle]
pub extern "C" fn sm_alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `sm_alloc(len)` with the same `len`.
#[no_mangle]
pub unsafe extern "C" fn sm_free(ptr: *mut u8, len: usize) {
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
/// `ptr` must be a buffer returned by `sm_run` or `sm_validate`.
#[no_mangle]
pub unsafe extern "C" fn sm_result_free(ptr: *mut u8) {
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
pub unsafe extern "C" fn sm_run(ptr: *const u8, len: usize) -> *mut u8 {
    let json = input(ptr, len);
    let mut progress = |p: &sim_core::Progress| {
        sm_progress(p.phase.as_ptr(), p.phase.len(), p.fraction, p.message.as_ptr(), p.message.len());
    };
    let cancel = || sm_cancelled() != 0;
    let bytes = sim_core::run(json, &mut progress, &cancel, &sim_core::NoHost);
    framed(&bytes)
}

/// # Safety
/// `ptr..ptr+len` must be readable UTF-8 model JSON.
#[no_mangle]
pub unsafe extern "C" fn sm_validate(ptr: *const u8, len: usize) -> *mut u8 {
    let json = input(ptr, len);
    let problems = sim_core::validate(json);
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
