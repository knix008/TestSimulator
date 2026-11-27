//! The core on the desktop: one hexcore Engine behind a lock, its documents reading files, disks and process memory
//! (sources.rs). `core_call` runs any engine method; long read-only work (search, hashes, templates …) runs on a
//! snapshot of the document off the lock, reporting `io-progress` and stopping on `core_cancel`. Saving writes a
//! temporary file and swaps it in (or patches the file in place when no byte moved); process memory is written back.
use crate::tr;
use crate::sources::{DiskSource, FileSource, ProcessSource};
use hexcore::{Bytes, Document, Engine, Source};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct CoreState {
    engine: Mutex<Engine>,
}

impl CoreState {
    fn lock(&self) -> MutexGuard<'_, Engine> {
        self.engine.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

static CANCELLED: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn is_cancelled(op: &str) -> bool {
    CANCELLED.lock().unwrap_or_else(|p| p.into_inner()).as_ref().is_some_and(|set| set.contains(op))
}

fn forget_op(op: &str) {
    if let Some(set) = CANCELLED.lock().unwrap_or_else(|p| p.into_inner()).as_mut() {
        set.remove(op);
    }
}

#[derive(Clone, serde::Serialize)]
struct Progress {
    op: String,
    done: u64,
    total: u64,
}

/// A progress callback for hexcore: events at most every 50 ms, false once the user cancelled.
fn progress(app: &AppHandle, op: &str) -> impl FnMut(u64, u64) -> bool {
    let app = app.clone();
    let op = op.to_string();
    let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
    move |done, total| {
        if !op.is_empty() && (done >= total || last.elapsed().as_millis() >= 50) {
            last = std::time::Instant::now();
            let _ = app.emit("io-progress", Progress { op: op.clone(), done, total });
        }
        op.is_empty() || !is_cancelled(&op)
    }
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| tr!("작업 실행 실패: {error}", "The task failed: {error}"))?
}

fn id_of(args: &Value) -> Result<u32, String> {
    args.get("id").and_then(|v| v.as_u64()).map(|v| v as u32).ok_or_else(|| "missing id".to_string())
}

#[tauri::command]
pub async fn core_call(app: AppHandle, state: tauri::State<'_, Arc<CoreState>>, method: String, args: Value, op: Option<String>) -> Result<Value, String> {
    let state = state.inner().clone();
    let op = op.unwrap_or_default();
    let result = blocking(move || {
        let mut report = progress(&app, &op);
        if hexcore::engine::is_readonly(&method) {
            let snapshot = state.lock().snapshot(id_of(&args)?)?;
            return hexcore::engine::run_readonly(&snapshot, &method, &args, &mut report);
        }
        if method == "compare" {
            let (a, b) = {
                let engine = state.lock();
                let a = args.get("a").and_then(|v| v.as_u64()).ok_or("missing a")? as u32;
                let b = args.get("b").and_then(|v| v.as_u64()).ok_or("missing b")? as u32;
                (engine.snapshot(a)?, engine.snapshot(b)?)
            };
            return hexcore::compare::compare(&a, &b, &args, &mut report);
        }
        state.lock().call_with(&method, &args, &mut report)
    })
    .await;
    result
}

#[tauri::command]
pub fn core_cancel(op: String) {
    CANCELLED.lock().unwrap_or_else(|p| p.into_inner()).get_or_insert_with(Default::default).insert(op);
}

// ───────────────────────── opening

#[tauri::command]
pub async fn hex_open(state: tauri::State<'_, Arc<CoreState>>, path: PathBuf, readonly: Option<bool>) -> Result<Value, String> {
    let state = state.inner().clone();
    blocking(move || {
        let source = FileSource::open(&path)?;
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.display().to_string());
        let mut engine = state.lock();
        let id = engine.open_source(Arc::new(source), &name, readonly.unwrap_or(false));
        engine.info(id)
    })
    .await
}

#[tauri::command]
pub async fn hex_open_disk(state: tauri::State<'_, Arc<CoreState>>, path: String) -> Result<Value, String> {
    let state = state.inner().clone();
    blocking(move || {
        let source = DiskSource::open(&path)?;
        let mut engine = state.lock();
        // Disks open read-only; once unlocked (setReadonly) a save writes the changed sectors back (DiskSource::write_back).
        let id = engine.open_source(Arc::new(source), &path, true);
        engine.info(id)
    })
    .await
}

#[tauri::command]
pub async fn hex_open_process(state: tauri::State<'_, Arc<CoreState>>, pid: u32) -> Result<Value, String> {
    let state = state.inner().clone();
    blocking(move || {
        let source = ProcessSource::open(pid)?;
        let mut engine = state.lock();
        let id = engine.open_source(Arc::new(source), &format!("pid {pid}"), false);
        engine.info(id)
    })
    .await
}

#[tauri::command]
pub async fn hex_reload(state: tauri::State<'_, Arc<CoreState>>, id: u32) -> Result<Value, String> {
    let state = state.inner().clone();
    blocking(move || {
        let mut engine = state.lock();
        let doc = engine.doc_mut(id)?;
        let source: Arc<dyn Source> = match doc.source.kind() {
            "file" => {
                let path = file_path(doc).ok_or("no path")?;
                Arc::new(FileSource::open(&path)?)
            }
            _ => return Err(tr!("파일만 다시 읽을 수 있습니다", "Only files can be reloaded")),
        };
        doc.rebase(source);
        engine.info(id)
    })
    .await
}

/// The path of a file document's source.
fn file_path(doc: &Document) -> Option<PathBuf> {
    doc.source.path().map(PathBuf::from)
}

fn file_source(path: &Path) -> Result<Arc<dyn Source>, String> {
    Ok(Arc::new(FileSource::open(path)?))
}

// ───────────────────────── saving

fn temp_beside(path: &Path) -> PathBuf {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
    path.with_file_name(format!(".{name}.myhexa-{}.tmp", std::process::id()))
}

fn write_doc(doc: &Document, path: &Path, report: &mut dyn FnMut(u64, u64) -> bool) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| tr!("쓸 수 없습니다: {e}", "Could not write: {e}"))?;
    let mut out = std::io::BufWriter::with_capacity(1 << 20, file);
    doc.write_to(&mut out, report)?;
    out.flush().map_err(|e| e.to_string())?;
    out.get_ref().sync_all().map_err(|e| e.to_string())?;
    Ok(())
}

/// Saves a document: to `path` (save as / a new document), or back where it came from (`path` null: a process).
#[tauri::command]
pub async fn hex_save(app: AppHandle, state: tauri::State<'_, Arc<CoreState>>, id: u32, path: Option<PathBuf>, op: String) -> Result<Value, String> {
    let state = state.inner().clone();
    let result = blocking(move || {
        let mut report = progress(&app, &op);
        let snapshot = state.lock().snapshot(id)?;
        // Back where it came from (no path): a disk or process memory gets the changed bytes written in place.
        match snapshot.source.kind() {
            "disk" | "process" if path.is_none() => {
                let patches = snapshot.patches().ok_or_else(|| tr!("디스크·프로세스 메모리는 크기를 바꿀 수 없습니다", "Disks and process memory cannot change size"))?;
                // Each changed run goes back through the source (it owns the process handle).
                for (offset, bytes) in &patches {
                    snapshot.source.write_back(*offset, bytes)?;
                }
                let mut engine = state.lock();
                let doc = engine.doc_mut(id)?;
                let source = doc.source.clone();
                doc.rebase(source);
                return engine.info(id);
            }
            _ => {}
        }
        let target = path.ok_or_else(|| "no path".to_string())?;
        let current = file_path(&snapshot);
        let same = current.as_ref().is_some_and(|p| same_file(p, &target));
        // Nothing moved and the file is the same one: patch it in place (fast for huge files).
        if same {
            if let Some(patches) = snapshot.patches() {
                let mut file = std::fs::OpenOptions::new().write(true).open(&target).map_err(|e| tr!("쓸 수 없습니다: {e}", "Could not write: {e}"))?;
                let total: u64 = patches.iter().map(|(_, b)| b.len() as u64).sum();
                let mut done = 0;
                for (offset, bytes) in &patches {
                    use std::io::Seek;
                    file.seek(std::io::SeekFrom::Start(*offset)).map_err(|e| e.to_string())?;
                    file.write_all(bytes).map_err(|e| e.to_string())?;
                    done += bytes.len() as u64;
                    report(done, total);
                }
                file.sync_all().map_err(|e| e.to_string())?;
                drop(file);
                let source = file_source(&target)?;
                let mut engine = state.lock();
                engine.doc_mut(id)?.rebase(source);
                return engine.info(id);
            }
        }
        let temp = temp_beside(&target);
        if let Err(error) = write_doc(&snapshot, &temp, &mut report) {
            let _ = std::fs::remove_file(&temp);
            return Err(error);
        }
        drop(snapshot);
        let mut engine = state.lock();
        let doc = engine.doc_mut(id)?;
        // Let go of the old file before replacing it (Windows keeps open files).
        let old = doc.source.clone();
        doc.rebase(Arc::new(hexcore::MemSource(Vec::new())));
        drop(old);
        let mut renamed = std::fs::rename(&temp, &target);
        for _ in 0..10 {
            if renamed.is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
            renamed = std::fs::rename(&temp, &target);
        }
        if let Err(error) = renamed {
            // Put the document back on what is on disk; the new bytes stay in the temporary file.
            if let Some(path) = current {
                if let Ok(source) = file_source(&path) {
                    doc.rebase(source);
                }
            }
            return Err(tr!("저장한 파일로 바꿀 수 없습니다({error}). 내용은 {} 에 있습니다.", "Could not replace the file ({error}). The data is in {}.", temp.display()));
        }
        let source = file_source(&target)?;
        doc.rebase(source);
        doc.name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        engine.info(id)
    })
    .await;
    result
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    }
}

/// Writes [offset, offset + length) of a document to a file (a selection, a carved file).
#[tauri::command]
pub async fn hex_save_range(app: AppHandle, state: tauri::State<'_, Arc<CoreState>>, id: u32, offset: u64, length: u64, path: PathBuf, op: String) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || {
        let mut report = progress(&app, &op);
        let doc = state.lock().snapshot(id)?;
        let file = std::fs::File::create(&path).map_err(|e| tr!("쓸 수 없습니다: {e}", "Could not write: {e}"))?;
        let mut out = std::io::BufWriter::with_capacity(1 << 20, file);
        let mut io_error = None;
        hexcore::util::for_each_chunk(&doc, offset, length, 1 << 20, &mut report, |_, chunk| match out.write_all(chunk) {
            Ok(()) => true,
            Err(e) => {
                io_error = Some(e.to_string());
                false
            }
        })?;
        if let Some(e) = io_error {
            return Err(e);
        }
        out.flush().map_err(|e| e.to_string())
    })
    .await
}

// ───────────────────────── file tools

#[tauri::command]
pub async fn hex_split(app: AppHandle, state: tauri::State<'_, Arc<CoreState>>, id: u32, size: u64, dir: PathBuf, name: String, op: String) -> Result<Vec<PathBuf>, String> {
    let state = state.inner().clone();
    blocking(move || {
        let doc = state.lock().snapshot(id)?;
        let mut report = progress(&app, &op);
        let total = doc.len();
        let mut written = Vec::new();
        let mut offset = 0;
        let mut part = 1;
        while offset < total {
            let n = size.min(total - offset);
            let path = dir.join(format!("{name}.{part:03}"));
            let bytes = doc.read_vec(offset, n)?;
            std::fs::write(&path, &bytes).map_err(|e| tr!("쓸 수 없습니다: {e}", "Could not write: {e}"))?;
            written.push(path);
            offset += n;
            part += 1;
            if !report(offset, total) {
                return Err(hexcore::util::CANCELLED.into());
            }
        }
        Ok(written)
    })
    .await
}

#[tauri::command]
pub async fn hex_concat(app: AppHandle, paths: Vec<PathBuf>, out: PathBuf, op: String) -> Result<u64, String> {
    blocking(move || {
        let mut report = progress(&app, &op);
        let total: u64 = paths.iter().filter_map(|p| std::fs::metadata(p).ok()).map(|m| m.len()).sum();
        let file = std::fs::File::create(&out).map_err(|e| tr!("쓸 수 없습니다: {e}", "Could not write: {e}"))?;
        let mut writer = std::io::BufWriter::with_capacity(1 << 20, file);
        let mut done = 0;
        for path in &paths {
            let mut input = std::fs::File::open(path).map_err(|e| tr!("열 수 없습니다 {}: {e}", "Could not open {}: {e}", path.display()))?;
            done += std::io::copy(&mut input, &mut writer).map_err(|e| e.to_string())?;
            if !report(done, total) {
                return Err(hexcore::util::CANCELLED.into());
            }
        }
        writer.flush().map_err(|e| e.to_string())?;
        Ok(done)
    })
    .await
}

/// Overwrites a file `passes` times (zeros, random, or DoD: 00 / FF / random), syncs each pass, renames it and deletes it.
#[tauri::command]
pub async fn hex_wipe(app: AppHandle, path: PathBuf, passes: u32, method: String, op: String) -> Result<(), String> {
    blocking(move || {
        let mut report = progress(&app, &op);
        let len = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        let mut seed = 0x9E37_79B9_7F4A_7C15u64 ^ std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1);
        let passes = passes.clamp(1, 35) as u64;
        let mut buf = vec![0u8; 1 << 20];
        for pass in 0..passes {
            let fill = match method.as_str() {
                "zero" => Some(0u8),
                "dod" if pass % 3 == 0 => Some(0u8),
                "dod" if pass % 3 == 1 => Some(0xFF),
                _ => None,
            };
            let mut file = std::fs::OpenOptions::new().write(true).open(&path).map_err(|e| tr!("쓸 수 없습니다: {e}", "Could not write: {e}"))?;
            let mut done = 0u64;
            while done < len {
                let n = ((len - done) as usize).min(buf.len());
                match fill {
                    Some(v) => buf[..n].fill(v),
                    None => {
                        for b in &mut buf[..n] {
                            seed ^= seed << 13;
                            seed ^= seed >> 7;
                            seed ^= seed << 17;
                            *b = (seed >> 24) as u8;
                        }
                    }
                }
                file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                done += n as u64;
                if !report(pass * len + done, passes * len) {
                    return Err(hexcore::util::CANCELLED.into());
                }
            }
            file.sync_all().map_err(|e| e.to_string())?;
        }
        let renamed = path.with_file_name(format!("{:016x}.del", seed));
        let target = if std::fs::rename(&path, &renamed).is_ok() { renamed } else { path };
        std::fs::remove_file(&target).map_err(|e| tr!("지울 수 없습니다: {e}", "Could not delete: {e}"))
    })
    .await
}

#[tauri::command]
pub fn hex_file_sizes(paths: Vec<PathBuf>) -> Vec<Option<u64>> {
    paths.iter().map(|p| std::fs::metadata(p).ok().map(|m| m.len())).collect()
}

#[tauri::command]
pub fn hex_is_file(paths: Vec<PathBuf>) -> Vec<bool> {
    paths.iter().map(|p| p.is_file()).collect()
}

// ───────────────────────── disks and processes

#[tauri::command]
pub async fn hex_list_disks() -> Result<Vec<crate::devices::Disk>, String> {
    blocking(|| Ok(crate::devices::list_disks())).await
}

#[tauri::command]
pub async fn hex_list_processes() -> Result<Vec<crate::devices::Proc>, String> {
    blocking(crate::devices::list_processes).await
}

/// The regions of an open process document (the memory map).
#[tauri::command]
pub fn hex_process_regions(state: tauri::State<'_, Arc<CoreState>>, id: u32) -> Result<Value, String> {
    let engine = state.lock();
    let doc = engine.doc(id)?;
    if doc.source.kind() != "process" {
        return Ok(json!([]));
    }
    // The regions are read again (the map changes while the process runs).
    let pid: u32 = doc.name.trim_start_matches("pid ").parse().map_err(|_| "no pid".to_string())?;
    let handle = crate::devices::open_process(pid)?;
    Ok(serde_json::to_value(crate::devices::process_regions(&handle)?).unwrap_or_default())
}

pub fn finish_op(op: &str) {
    forget_op(op);
}

// ───────────────────────── find in files

#[derive(serde::Serialize)]
pub struct FileMatch {
    path: String,
    offset: u64,
    length: u64,
}

/// Searches files (and folders, `recursive`) for a pattern without opening them as documents.
/// Returns at most `limit` matches; files that cannot be read are skipped.
#[tauri::command]
pub async fn hex_find_in_files(app: AppHandle, paths: Vec<PathBuf>, recursive: bool, pattern: Value, limit: Option<usize>, op: String) -> Result<Value, String> {
    blocking(move || {
        let matcher = hexcore::search::compile(&pattern)?;
        let limit = limit.unwrap_or(10_000).max(1);
        let mut files = Vec::new();
        fn walk(dir: &Path, recursive: bool, out: &mut Vec<PathBuf>, depth: usize) {
            let Ok(entries) = std::fs::read_dir(dir) else { return };
            for entry in entries.flatten() {
                let p = entry.path();
                match entry.file_type() {
                    Ok(t) if t.is_file() => out.push(p),
                    Ok(t) if t.is_dir() && recursive && depth < 64 => walk(&p, recursive, out, depth + 1),
                    _ => {}
                }
                if out.len() > 200_000 {
                    return;
                }
            }
        }
        for p in &paths {
            if p.is_dir() { walk(p, recursive, &mut files, 0) } else if p.is_file() { files.push(p.clone()) }
        }
        let total: u64 = files.iter().filter_map(|p| std::fs::metadata(p).ok()).map(|m| m.len()).sum::<u64>().max(1);
        let mut done = 0u64;
        let mut report = progress(&app, &op);
        let mut found = Vec::new();
        let mut searched = 0usize;
        for path in &files {
            let Ok(source) = FileSource::open(path) else { continue };
            let len = source.len();
            let doc = Document::new(Arc::new(source), "");
            let base = done;
            let mut sub = |d: u64, _t: u64| report(base + d, total);
            let (list, _) = hexcore::search::matches(&doc, &matcher, 0, len, limit - found.len(), &mut sub)?;
            for (offset, length) in list {
                found.push(FileMatch { path: path.display().to_string(), offset, length });
            }
            done += len;
            searched += 1;
            if found.len() >= limit {
                break;
            }
        }
        Ok(json!({ "matches": found, "files": files.len(), "searched": searched, "truncated": found.len() >= limit }))
    })
    .await
}
