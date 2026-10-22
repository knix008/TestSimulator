//! A tiny C-style ABI for the browser build, so no wasm-bindgen is needed.
//!
//! JS: `p = qr_alloc(n)`, copy the UTF-8 text in, `len = qr_encode(p, n, …)`, `qr_free(p, n)`,
//! then read `len` bytes of JSON from `qr_output_ptr()`. The output stays valid until the next call.

use std::cell::RefCell;

thread_local! {
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn qr_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr` and `len` must come from one `qr_alloc` call.
#[no_mangle]
pub unsafe extern "C" fn qr_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
}

/// # Safety
/// `ptr` must point at `len` initialised bytes.
#[no_mangle]
pub unsafe extern "C" fn qr_encode(ptr: *const u8, len: usize, ecc: u32, min_version: u32, max_version: u32, mask: i32, flags: u32) -> usize {
    let bytes = if len == 0 { &[][..] } else { std::slice::from_raw_parts(ptr, len) };
    let text = String::from_utf8_lossy(bytes);
    let json = crate::encode_json(&text, ecc, min_version, max_version, mask, flags);
    OUTPUT.with(|out| {
        let mut out = out.borrow_mut();
        *out = json.into_bytes();
        out.len()
    })
}

#[no_mangle]
pub extern "C" fn qr_output_ptr() -> *const u8 {
    OUTPUT.with(|out| out.borrow().as_ptr())
}
