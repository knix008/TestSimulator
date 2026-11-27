//! Simulation jobs: the Rust solver core (crates/sim-core) runs here natively on a worker thread.
//! Progress goes to the page as `sim-progress` events ({ op, fraction, key }), at most every 60 ms;
//! `cancel_simulation` stops a job at its next progress check. The result is the binary container
//! of sim-core (out.rs), handed over as raw bytes (an ArrayBuffer on the page).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

fn jobs() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static JOBS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, serde::Serialize)]
struct Progress<'a> {
    op: &'a str,
    fraction: f64,
    key: &'a str,
}

/// Runs one job; `op` names it for progress and cancellation.
pub fn run(app: Option<&AppHandle>, job: &str, op: &str) -> Result<Vec<u8>, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    jobs().lock().unwrap_or_else(|p| p.into_inner()).insert(op.to_string(), cancel.clone());
    let mut last = Instant::now() - Duration::from_secs(1);
    let mut last_key = String::new();
    let result = sim_core::run_job_json(job, &mut |fraction, key| {
        if cancel.load(Ordering::Relaxed) { return false; }
        if let Some(app) = app {
            if last.elapsed() >= Duration::from_millis(60) || key != last_key || fraction >= 1.0 {
                last = Instant::now();
                last_key = key.to_string();
                let _ = app.emit("sim-progress", Progress { op, fraction, key });
            }
        }
        true
    });
    jobs().lock().unwrap_or_else(|p| p.into_inner()).remove(op);
    result
}

#[tauri::command]
pub async fn run_simulation(app: AppHandle, job: String, op: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || run(Some(&app), &job, &op))
        .await
        .map_err(|e| format!("job.failed:{e}"))??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn cancel_simulation(op: String) -> bool {
    match jobs().lock().unwrap_or_else(|p| p.into_inner()).get(&op) {
        Some(flag) => { flag.store(true, Ordering::Relaxed); true }
        None => false,
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverInfo {
    version: &'static str,
    threads: usize,
    native: bool,
}

#[tauri::command]
pub fn solver_info() -> SolverInfo {
    SolverInfo { version: sim_core::VERSION, threads: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1), native: true }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_a_mesh_job_natively() {
        let job = r#"{ "analysis": "mesh", "bodies": [{ "id": "b", "shape": { "type": "box", "size": [10, 10, 10] } }], "mesh": { "size": 2 } }"#;
        let bytes = run(None, job, "t1").unwrap();
        assert_eq!(&bytes[..4], b"SIM1");
    }

    #[test]
    fn reports_errors_as_keys() {
        let err = run(None, r#"{ "analysis": "nope", "bodies": [{ "id": "b", "shape": { "type": "box", "size": [1, 1, 1] } }] }"#, "t2").unwrap_err();
        assert!(err.starts_with("job.unknownAnalysis"), "{err}");
    }

    #[test]
    fn cancel_unknown_job_is_false() { assert!(!cancel_simulation("none".into())); }
}
