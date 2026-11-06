//! The engine for the browser. Files live in a `MemFs`; options and results are JSON, as they are
//! on the desktop. `src/lib/engine.worker.js` is the other half of this.

use std::cell::RefCell;
use std::sync::{Arc, OnceLock};

use wasm_bindgen::prelude::*;
use zipmaster_core::{ops, tools, Ctx, Fs, MemFs, Progress, Vfs};

/// A panic in Rust would otherwise be only "unreachable executed".
#[wasm_bindgen(start)]
pub fn start() {
    std::panic::set_hook(Box::new(|info| {
        web_sys_log(&info.to_string());
    }));
    tools::set_clock(|| js_sys::Date::now());
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn web_sys_log(text: &str);
}

thread_local! {
    static PROGRESS: RefCell<Option<js_sys::Function>> = const { RefCell::new(None) };
}

struct HostProgress;

impl Progress for HostProgress {
    fn update(&self, done: u64, total: u64, name: &str) {
        PROGRESS.with(|p| {
            if let Some(f) = p.borrow().as_ref() {
                let _ = f.call3(
                    &JsValue::NULL,
                    &JsValue::from_f64(done as f64),
                    &JsValue::from_f64(total as f64),
                    &JsValue::from_str(name),
                );
            }
        });
    }
}

fn fs() -> &'static MemFs {
    struct Shared(MemFs);
    // Single-threaded here; the wrapper only satisfies the static's bounds.
    unsafe impl Sync for Shared {}
    unsafe impl Send for Shared {}
    static FS: OnceLock<Shared> = OnceLock::new();
    &FS.get_or_init(|| Shared(MemFs::new())).0
}

fn ctx() -> Ctx {
    let shared: Fs = Arc::new(fs().clone());
    Ctx::new(shared, Arc::new(HostProgress))
}

/// Stores a file. `mtime` is Unix seconds, negative for unknown.
#[wasm_bindgen]
pub fn put(path: &str, data: Vec<u8>, mtime: f64) {
    fs().put(path, data, (mtime >= 0.0).then_some(mtime as i64));
}

/// Hands over a file's bytes and forgets it.
#[wasm_bindgen]
pub fn take(path: &str) -> Option<Vec<u8>> {
    fs().take(path)
}

/// A copy of a file's bytes.
#[wasm_bindgen]
pub fn read(path: &str) -> Option<Vec<u8>> {
    fs().read(path)
}

#[wasm_bindgen]
pub fn remove(path: &str) {
    let _ = fs().remove_file(path);
}

#[wasm_bindgen]
pub fn mkdir(path: &str) {
    let _ = fs().mkdirs(path);
}

/// Every file under a folder, as JSON `[[path, size, mtime], ...]`.
#[wasm_bindgen]
pub fn walk(path: &str) -> String {
    serde_json::to_string(&fs().walk(path)).unwrap_or_else(|_| "[]".into())
}

#[wasm_bindgen]
pub fn clear() {
    fs().clear();
}

/// Runs an operation: `{ok, result}` or `{ok, code, detail}`.
#[wasm_bindgen]
pub fn call(op: &str, options: &str, progress: Option<js_sys::Function>) -> String {
    PROGRESS.with(|p| *p.borrow_mut() = progress);
    let out = zipmaster_core::dispatch_envelope(&ctx(), op, options);
    PROGRESS.with(|p| *p.borrow_mut() = None);
    out
}

/// One entry's bytes, or throws the JSON error envelope.
#[wasm_bindgen]
pub fn read_entry(options: &str) -> Result<Vec<u8>, JsValue> {
    let parsed: zipmaster_core::Result<ops::ReadEntryOptions> = zipmaster_core::parse_options(options);
    parsed
        .and_then(|o| ops::read_entry(&ctx(), &o))
        .map_err(|e| JsValue::from_str(&format!("{{\"ok\":false,\"code\":\"{}\",\"detail\":{}}}", e.code(), serde_json::Value::from(e.detail()))))
}
