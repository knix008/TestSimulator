//! Long operations run on their own threads and report through events, so the window never waits.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use zipmaster_core::{ops, Ctx, OsFs, Progress};

#[derive(Default)]
pub struct Jobs {
    next: AtomicU64,
    cancels: Mutex<HashMap<u64, Arc<AtomicBool>>>,
}

pub fn threads() -> u32 {
    std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(1)
}

struct EventProgress {
    app: AppHandle,
    id: u64,
    cancel: Arc<AtomicBool>,
    last: Mutex<Instant>,
}

impl Progress for EventProgress {
    fn update(&self, done: u64, total: u64, name: &str) {
        // Ten updates a second is plenty for a person, and cheap on the page.
        let mut last = self.last.lock().unwrap();
        if last.elapsed() < Duration::from_millis(100) && done < total {
            return;
        }
        *last = Instant::now();
        drop(last);
        let _ = self.app.emit("job-progress", json!({ "id": self.id, "done": done, "total": total, "name": name }));
    }
    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }
}

/// The program put in front of a self-extracting ZIP.
pub fn sfx_stub(app: &AppHandle) -> Option<PathBuf> {
    let name = if cfg!(windows) { "zipmaster-sfx.exe" } else { "zipmaster-sfx" };
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("resources").join("sfx").join(name);
        if bundled.exists() {
            return Some(bundled);
        }
    }
    // A build run from the source tree.
    let beside = std::env::current_exe().ok()?.parent()?.join(name);
    beside.exists().then_some(beside)
}

/// Runs an operation and reports it. The result comes as a `job-done` event with this id.
#[tauri::command]
pub fn start_job(app: AppHandle, state: State<'_, Jobs>, op: String, options: Value) -> Result<u64, String> {
    let id = state.next.fetch_add(1, Ordering::Relaxed) + 1;
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancels.lock().unwrap().insert(id, cancel.clone());

    let mut options = options;
    // The page asks for "self-extracting"; only this side knows where the program is.
    if options.get("sfx").and_then(Value::as_bool) == Some(true) {
        let stub = sfx_stub(&app).ok_or("self-extractor program is missing")?;
        options["sfxStub"] = json!(stub.to_string_lossy());
    }
    // The user's own WinRAR, when they chose it for this archive.
    let rar_tool = if op == "create" && options.get("useRarTool").and_then(Value::as_bool) == Some(true) {
        Some(crate::rar_tool::find().ok_or("WinRAR's rar program was not found")?)
    } else {
        None
    };
    let handle = app.clone();
    std::thread::Builder::new()
        .name(format!("job-{id}"))
        .spawn(move || {
            let progress = Arc::new(EventProgress { app: handle.clone(), id, cancel, last: Mutex::new(Instant::now()) });
            let mut ctx = Ctx::new(Arc::new(OsFs), progress.clone());
            ctx.threads = threads();
            let reply = match &rar_tool {
                Some(tool) => crate::rar_tool::create(tool, &options, id, &*progress).to_string(),
                None => zipmaster_core::dispatch_envelope(&ctx, &op, &options.to_string()),
            };
            if let Some(jobs) = handle.try_state::<Jobs>() {
                jobs.cancels.lock().unwrap().remove(&id);
            }
            let body: Value = serde_json::from_str(&reply).unwrap_or_else(|_| json!({ "ok": false, "code": "invalid", "detail": reply }));
            let _ = handle.emit("job-done", json!({ "id": id, "reply": body }));
        })
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn cancel_job(state: State<'_, Jobs>, id: u64) {
    if let Some(flag) = state.cancels.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

fn plain_ctx() -> Ctx {
    let mut ctx = Ctx::new(Arc::new(OsFs), Arc::new(zipmaster_core::NoProgress));
    ctx.threads = threads();
    ctx
}

/// An entry's bytes, for the preview. Binary, not JSON: a number array would use ten times the
/// memory on the way to the page.
#[tauri::command]
pub async fn read_entry(options: Value) -> Result<tauri::ipc::Response, String> {
    let parsed: ops::ReadEntryOptions = serde_json::from_value(options).map_err(|e| e.to_string())?;
    let bytes = tauri::async_runtime::spawn_blocking(move || ops::read_entry(&plain_ctx(), &parsed))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| json!({ "code": e.code(), "detail": e.detail() }).to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

pub fn temp_root() -> PathBuf {
    std::env::temp_dir().join(format!("MyZipMaster-{}", std::process::id()))
}

/// Removes what "open with" extracted. Files still open elsewhere just stay until the system
/// clears its temporary folder.
pub fn clean_temp() {
    let _ = std::fs::remove_dir_all(temp_root());
}

/// Extracts one entry to a private folder and opens it with whatever the system uses for it.
#[tauri::command]
pub async fn open_entry(app: AppHandle, options: Value) -> Result<String, String> {
    let path: String = options.get("path").and_then(Value::as_str).unwrap_or_default().to_string();
    let entry: String = options.get("entry").and_then(Value::as_str).unwrap_or_default().to_string();
    let password = options.get("password").and_then(Value::as_str).map(String::from);
    let encoding = options.get("encoding").and_then(Value::as_str).map(String::from);
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let dest = temp_root().join(stamp.to_string());
    let dest_text = dest.to_string_lossy().into_owned();

    let report = tauri::async_runtime::spawn_blocking(move || {
        ops::extract(
            &plain_ctx(),
            &ops::ExtractOptions {
                path,
                dest: dest_text,
                password,
                encoding,
                selection: vec![entry],
                flatten: true,
                ..ops::ExtractOptions::default()
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| json!({ "code": e.code(), "detail": e.detail() }).to_string())?;

    let target = report.written.first().ok_or_else(|| json!({ "code": "invalid", "detail": "nothing extracted" }).to_string())?.clone();
    if std::env::var("MYZIPMASTER_TEST").is_err() {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_path(target.clone(), None::<&str>).map_err(|e| json!({ "code": "io", "detail": e.to_string() }).to_string())?;
    }
    Ok(target)
}
