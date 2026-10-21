//! C-style ABI for the browser build (same shape as qrcore's).
//!
//! JS: `p = qri_alloc(n)`, copy RGBA in, `len = qri_encode(p, n, w, h, format, quality, bg)`,
//! `qri_free(p, n)`. `len >= 0`: the file is `len` bytes at `qri_output_ptr()`;
//! `len < 0`: an error message of `-len` bytes is there instead.

use std::cell::RefCell;

thread_local! {
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn qri_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr` and `len` must come from one `qri_alloc` call.
#[no_mangle]
pub unsafe extern "C" fn qri_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
}

/// `background` is 0xRRGGBB.
///
/// # Safety
/// `ptr` must point at `len` initialised bytes.
#[no_mangle]
pub unsafe extern "C" fn qri_encode(ptr: *const u8, len: usize, width: u32, height: u32, format: u32, quality: u32, background: u32) -> isize {
    let rgba = std::slice::from_raw_parts(ptr, len);
    let bg = [(background >> 16) as u8, (background >> 8) as u8, background as u8];
    let result = match crate::Format::from_id(format) {
        Some(f) => crate::encode(rgba, width, height, f, quality.min(100) as u8, bg),
        None => Err(format!("unknown format id {format}")),
    };
    OUTPUT.with(|out| {
        let mut out = out.borrow_mut();
        match result {
            Ok(bytes) => {
                *out = bytes;
                out.len() as isize
            }
            Err(message) => {
                *out = message.into_bytes();
                -(out.len() as isize)
            }
        }
    })
}

#[no_mangle]
pub extern "C" fn qri_output_ptr() -> *const u8 {
    OUTPUT.with(|out| out.borrow().as_ptr())
}
