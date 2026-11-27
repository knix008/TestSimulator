//! The solver core for the web build: the same Rust code as the desktop backend, compiled to
//! WebAssembly and run inside a Web Worker (src/sim/worker.js). Progress goes to
//! `globalThis.__simProgress(fraction, key)`, which returns false to cancel.
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = globalThis, js_name = __simProgress)]
    fn sim_progress(fraction: f64, key: &str) -> bool;
}

/// Runs one job (JSON) and returns the binary result container (see sim-core out.rs).
#[wasm_bindgen]
pub fn run_job(json: &str) -> Result<Vec<u8>, JsValue> {
    sim_core::run_job_json(json, &mut |f, k| sim_progress(f, k)).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn version() -> String { sim_core::VERSION.to_string() }
