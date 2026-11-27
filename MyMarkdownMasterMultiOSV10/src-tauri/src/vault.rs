//! The open vault on the desktop: a folder of Markdown notes and attachments. Rust owns it — it scans the
//! folder, reads every note into the core engine (mdcore: index, links, search, rendering), watches the
//! folder for changes made by other programs, and does every file operation (create, write, rename/move with
//! link updates, delete to the system trash or the vault's .trash, copy, reveal), the file-recovery
//! snapshots and the exports. The page only shows things and asks.
use mdcore::engine::Engine;
use mdcore::index::is_note;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct Vault {
    pub root: Option<PathBuf>,
    pub engine: Engine,
    watcher: Option<RecommendedWatcher>,
}

pub type VaultState = Arc<Mutex<Vault>>;

fn lock(state: &VaultState) -> std::sync::MutexGuard<'_, Vault> { state.lock().unwrap_or_else(|p| p.into_inner()) }

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Entry { pub path: String, pub kind: &'static str, pub size: u64, pub mtime: f64, pub ctime: f64 }

fn millis(t: std::io::Result<SystemTime>) -> f64 { t.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as f64).unwrap_or(0.0) }

/// Names the vault never shows: dot folders/files (.git, .trash, .obsidian …).
fn hidden(rel: &str) -> bool { rel.split('/').any(|part| part.starts_with('.')) }

fn rel_of(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let s = rel.to_string_lossy().replace('\\', "/");
    if s.is_empty() { None } else { Some(s) }
}

/// A vault-relative path → an absolute path inside the vault (never outside it).
pub fn abs(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let clean = mdcore::index::normalize_path(rel);
    if clean.is_empty() { return Err("empty path".into()); }
    Ok(root.join(clean.replace('/', std::path::MAIN_SEPARATOR_STR)))
}

fn root_of(state: &VaultState) -> Result<PathBuf, String> { lock(state).root.clone().ok_or_else(|| crate::tr!("열린 보관함이 없습니다", "No vault is open")) }

pub fn scan(root: &Path) -> Vec<Entry> {
    let mut out = vec![];
    for entry in walkdir::WalkDir::new(root).follow_links(false).into_iter().filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.')).flatten() {
        let Some(rel) = rel_of(root, entry.path()) else { continue };
        let meta = entry.metadata().ok();
        let is_dir = entry.file_type().is_dir();
        out.push(Entry {
            path: rel,
            kind: if is_dir { "folder" } else { "file" },
            size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
            mtime: meta.as_ref().map(|m| millis(m.modified())).unwrap_or(0.0),
            ctime: meta.as_ref().map(|m| millis(m.created())).unwrap_or(0.0),
        });
    }
    out
}

fn read_text(path: &Path) -> String {
    match std::fs::read(path) {
        Ok(bytes) => { let s = String::from_utf8_lossy(&bytes).into_owned(); s.strip_prefix('\u{feff}').map(|x| x.to_string()).unwrap_or(s) }
        Err(_) => String::new(),
    }
}

fn load(engine: &mut Engine, root: &Path, entries: &[Entry]) {
    let files: Vec<Value> = entries.iter().map(|e| json!(e)).collect();
    let _ = engine.call("setFiles", &json!({ "files": files }));
    for e in entries { if e.kind == "file" && is_note(&e.path) { engine.index.set_text(&e.path, &read_text(&root.join(&e.path))); } }
}

/// Writes a file through a temporary file in the same folder, so a crash never leaves half a note.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    let tmp = path.with_extension(format!("{}.mymd-tmp", path.extension().and_then(|e| e.to_str()).unwrap_or("")));
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).or_else(|_| { let r = std::fs::write(path, bytes); let _ = std::fs::remove_file(&tmp); r }).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened { root: String, name: String, snapshot: Value }

#[tauri::command]
pub async fn vault_open(app: AppHandle, state: tauri::State<'_, VaultState>, path: PathBuf) -> Result<Opened, String> {
    let root = std::fs::canonicalize(&path).map_err(|e| crate::tr!("보관함 폴더를 열 수 없습니다: {e}", "Cannot open the vault folder: {e}"))?;
    if !root.is_dir() { return Err(crate::tr!("폴더가 아닙니다", "Not a folder")); }
    let state = state.inner().clone();
    let root2 = root.clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        let entries = scan(&root2);
        let mut engine = Engine::new();
        load(&mut engine, &root2, &entries);
        let snapshot = engine.call("snapshot", &Value::Null).unwrap_or(Value::Null);
        let mut v = lock(&state);
        v.watcher = None;
        v.engine = engine;
        v.root = Some(root2);
        (snapshot, state.clone())
    }).await.map_err(|e| e.to_string())?;
    let (snapshot, state) = snapshot;
    let _ = app.asset_protocol_scope().allow_directory(&root, true);
    start_watcher(&app, &state, &root);
    Ok(Opened { name: root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), root: root.to_string_lossy().trim_start_matches(r"\\?\").to_string(), snapshot })
}

#[tauri::command]
pub fn vault_close(state: tauri::State<'_, VaultState>) {
    let mut v = lock(&state);
    v.watcher = None;
    v.root = None;
    v.engine = Engine::new();
}

/// Creates a new vault folder (with a welcome note) and returns its path.
#[tauri::command]
pub fn vault_create(parent: PathBuf, name: String, welcome: String) -> Result<String, String> {
    let dir = parent.join(name.trim());
    if dir.exists() && std::fs::read_dir(&dir).map(|mut d| d.next().is_some()).unwrap_or(false) { return Err(crate::tr!("같은 이름의 폴더가 이미 있고 비어 있지 않습니다", "A folder with that name already exists and is not empty")); }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if !welcome.is_empty() { write_atomic(&dir.join(crate::tr!("시작하기.md", "Welcome.md")), welcome.as_bytes())?; }
    Ok(dir.to_string_lossy().into_owned())
}

/// A folder for a sample vault inside the app's data folder (made fresh: an older copy is replaced).
#[tauri::command]
pub fn sample_vault_dir(app: AppHandle, name: String) -> Result<String, String> {
    let safe: String = name.chars().map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c }).collect();
    let dir = crate::data_dir(&app)?.join("samples").join(safe.trim());
    if dir.exists() { let _ = std::fs::remove_dir_all(&dir); }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

/// The vault notes made from a template go to when no vault is open: `<data>/notes/<name>`, kept between runs
/// (unlike the sample vaults, which are made fresh every time).
#[tauri::command]
pub fn notes_vault_dir(app: AppHandle, name: String) -> Result<String, String> {
    let safe: String = name.chars().map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c }).collect();
    let dir = crate::data_dir(&app)?.join("notes").join(safe.trim());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

fn start_watcher(app: &AppHandle, state: &VaultState, root: &Path) {
    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();
    let Ok(mut watcher) = notify::recommended_watcher(tx) else { return };
    if watcher.watch(root, RecursiveMode::Recursive).is_err() { return; }
    lock(state).watcher = Some(watcher);
    let app = app.clone();
    let state = state.clone();
    let root = root.to_path_buf();
    std::thread::spawn(move || {
        loop {
            // Gather a burst of events (an editor saving, a sync tool copying a folder) and apply it once.
            let Ok(first) = rx.recv() else { return };
            let mut paths: HashSet<PathBuf> = HashSet::new();
            let mut add = |ev: notify::Result<notify::Event>| { if let Ok(ev) = ev { if !matches!(ev.kind, notify::EventKind::Access(_)) { paths.extend(ev.paths); } } };
            add(first);
            while let Ok(ev) = rx.recv_timeout(Duration::from_millis(250)) { add(ev); }
            let mut v = lock(&state);
            if v.root.as_deref() != Some(root.as_path()) { return; }
            let mut changed: Vec<String> = vec![];
            let mut structure = false;
            for p in paths {
                let Some(rel) = rel_of(&root, &p) else { continue };
                if hidden(&rel) || rel.ends_with(".mymd-tmp") { continue; }
                if p.is_file() {
                    let meta = std::fs::metadata(&p).ok();
                    let known = v.engine.index.files.contains_key(&rel);
                    v.engine.index.set_file(&rel, meta.as_ref().map(|m| m.len()).unwrap_or(0), meta.as_ref().map(|m| millis(m.modified())).unwrap_or(0.0), meta.as_ref().map(|m| millis(m.created())).unwrap_or(0.0));
                    if !known { structure = true; }
                    if is_note(&rel) { if v.engine.index.set_text(&rel, &read_text(&p)) || !known { changed.push(rel); } } else if !known { changed.push(rel); }
                } else if p.is_dir() {
                    if !v.engine.index.folders.contains(&rel) {
                        // A folder moved in: scan it.
                        for e in scan(&root).into_iter().filter(|e| e.path == rel || e.path.starts_with(&format!("{rel}/"))) {
                            if e.kind == "folder" { v.engine.index.add_folder(&e.path); } else { v.engine.index.set_file(&e.path, e.size, e.mtime, e.ctime); if is_note(&e.path) { let t = read_text(&root.join(&e.path)); v.engine.index.set_text(&e.path, &t); } }
                        }
                        structure = true;
                        changed.push(rel);
                    }
                } else if v.engine.index.files.contains_key(&rel) || v.engine.index.folders.contains(&rel) {
                    v.engine.index.remove(&rel);
                    structure = true;
                    changed.push(rel);
                }
            }
            if changed.is_empty() { continue; }
            let version = v.engine.index.version;
            drop(v);
            let _ = app.emit("vault-changed", json!({ "paths": changed, "structure": structure, "version": version }));
        }
    });
}

#[tauri::command]
pub fn core_call(state: tauri::State<'_, VaultState>, method: String, args: Value) -> Result<Value, String> {
    lock(&state).engine.call(&method, &args)
}

#[tauri::command]
pub async fn vault_read(state: tauri::State<'_, VaultState>, path: String) -> Result<String, String> {
    let file = abs(&root_of(&state)?, &path)?;
    tauri::async_runtime::spawn_blocking(move || std::fs::read(&file).map(|b| String::from_utf8_lossy(&b).trim_start_matches('\u{feff}').to_string()).map_err(|e| e.to_string())).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn vault_read_base64(state: tauri::State<'_, VaultState>, path: String) -> Result<String, String> {
    use base64::Engine as _;
    let file = abs(&root_of(&state)?, &path)?;
    tauri::async_runtime::spawn_blocking(move || std::fs::read(&file).map(|b| base64::engine::general_purpose::STANDARD.encode(b)).map_err(|e| e.to_string())).await.map_err(|e| e.to_string())?
}

/// Saves a note (or any text file); the index follows at once. Returns the index version.
#[tauri::command]
pub fn vault_write(state: tauri::State<'_, VaultState>, path: String, text: String) -> Result<u64, String> {
    let root = root_of(&state)?;
    let file = abs(&root, &path)?;
    write_atomic(&file, text.as_bytes())?;
    let mut v = lock(&state);
    let meta = std::fs::metadata(&file).ok();
    v.engine.index.set_file(&path, text.len() as u64, meta.as_ref().map(|m| millis(m.modified())).unwrap_or(0.0), meta.as_ref().map(|m| millis(m.created())).unwrap_or(0.0));
    if is_note(&path) { v.engine.index.set_text(&path, &text); }
    Ok(v.engine.index.version)
}

#[tauri::command]
pub fn vault_write_base64(state: tauri::State<'_, VaultState>, path: String, data: String) -> Result<u64, String> {
    use base64::Engine as _;
    let root = root_of(&state)?;
    let file = abs(&root, &path)?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.as_bytes()).map_err(|e| e.to_string())?;
    write_atomic(&file, &bytes)?;
    let mut v = lock(&state);
    v.engine.index.set_file(&path, bytes.len() as u64, millis(Ok(SystemTime::now())), millis(Ok(SystemTime::now())));
    Ok(v.engine.index.version)
}

/// A new note or file; fails when the name is taken (the page picks "Untitled 2" …).
#[tauri::command]
pub fn vault_new_file(state: tauri::State<'_, VaultState>, path: String, text: String) -> Result<u64, String> {
    let root = root_of(&state)?;
    let file = abs(&root, &path)?;
    if file.exists() { return Err(crate::tr!("같은 이름이 이미 있습니다: {path}", "That name is already taken: {path}")); }
    drop(root);
    vault_write(state, path, text)
}

#[tauri::command]
pub fn vault_mkdir(state: tauri::State<'_, VaultState>, path: String) -> Result<u64, String> {
    let file = abs(&root_of(&state)?, &path)?;
    std::fs::create_dir_all(&file).map_err(|e| e.to_string())?;
    let mut v = lock(&state);
    v.engine.index.add_folder(&path);
    Ok(v.engine.index.version)
}

/// Renames or moves a file or folder; with `update_links` every link to it is rewritten on disk.
/// Returns the notes whose text changed: [{ path, text }].
#[tauri::command]
pub fn vault_rename(state: tauri::State<'_, VaultState>, from: String, to: String, update_links: bool) -> Result<Value, String> {
    let root = root_of(&state)?;
    let (a, b) = (abs(&root, &from)?, abs(&root, &to)?);
    if b.exists() && !a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy()) { return Err(crate::tr!("같은 이름이 이미 있습니다: {to}", "That name is already taken: {to}")); }
    if let Some(dir) = b.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    std::fs::rename(&a, &b).map_err(|e| e.to_string())?;
    let mut v = lock(&state);
    let edits = if update_links { mdcore::rename::plan_rename(&mut v.engine.index, &from, &to) } else { v.engine.index.rename(&from, &to); vec![] };
    let mut failed = vec![];
    for e in &edits { if let Ok(p) = abs(&root, &e.path) { if write_atomic(&p, e.text.as_bytes()).is_err() { failed.push(e.path.clone()); } } }
    Ok(json!({ "edits": edits, "failed": failed, "version": v.engine.index.version }))
}

/// Deletes: "system" (the OS trash), "vault" (the vault's .trash folder) or "permanent".
#[tauri::command]
pub fn vault_delete(state: tauri::State<'_, VaultState>, path: String, mode: String) -> Result<u64, String> {
    let root = root_of(&state)?;
    let file = abs(&root, &path)?;
    match mode.as_str() {
        "vault" => {
            let name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let trash = root.join(".trash");
            std::fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
            let mut target = trash.join(&name);
            let mut n = 1;
            while target.exists() { n += 1; target = trash.join(format!("{} {n}{}", Path::new(&name).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(), Path::new(&name).extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default())); }
            std::fs::rename(&file, &target).map_err(|e| e.to_string())?;
        }
        "permanent" => { if file.is_dir() { std::fs::remove_dir_all(&file) } else { std::fs::remove_file(&file) }.map_err(|e| e.to_string())?; }
        _ => trash::delete(&file).map_err(|e| crate::tr!("휴지통으로 옮기지 못했습니다: {e}", "Could not move it to the trash: {e}"))?,
    }
    let mut v = lock(&state);
    v.engine.index.remove(&path);
    Ok(v.engine.index.version)
}

#[tauri::command]
pub fn vault_copy(state: tauri::State<'_, VaultState>, from: String, to: String) -> Result<u64, String> {
    let root = root_of(&state)?;
    let (a, b) = (abs(&root, &from)?, abs(&root, &to)?);
    if b.exists() { return Err(crate::tr!("같은 이름이 이미 있습니다: {to}", "That name is already taken: {to}")); }
    std::fs::copy(&a, &b).map_err(|e| e.to_string())?;
    let mut v = lock(&state);
    let size = std::fs::metadata(&b).map(|m| m.len()).unwrap_or(0);
    v.engine.index.set_file(&to, size, millis(Ok(SystemTime::now())), millis(Ok(SystemTime::now())));
    if is_note(&to) { v.engine.index.set_text(&to, &read_text(&b)); }
    Ok(v.engine.index.version)
}

/// The absolute path of a vault file (for "Copy full path", "Open in default app").
#[tauri::command]
pub fn vault_abs_path(state: tauri::State<'_, VaultState>, path: String) -> Result<String, String> {
    Ok(abs(&root_of(&state)?, &path)?.to_string_lossy().into_owned())
}

/// Shows the file in the system file manager.
#[tauri::command]
pub fn vault_reveal(state: tauri::State<'_, VaultState>, path: String) -> Result<(), String> {
    let file = if path.is_empty() { root_of(&state)? } else { abs(&root_of(&state)?, &path)? };
    #[cfg(target_os = "windows")]
    { std::process::Command::new("explorer").arg(format!("/select,{}", file.display())).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg("-R").arg(&file).spawn().map_err(|e| e.to_string())?; }
    #[cfg(all(unix, not(target_os = "macos")))]
    { std::process::Command::new("xdg-open").arg(file.parent().unwrap_or(&file)).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}

// ───────────────────────── file recovery (snapshots of notes, kept outside the vault)

fn recovery_dir(app: &AppHandle, root: &Path, path: &str) -> Result<PathBuf, String> {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in root.to_string_lossy().as_bytes() { h ^= *b as u64; h = h.wrapping_mul(0x100000001b3); }
    let safe: String = path.chars().map(|c| if c.is_alphanumeric() || "-_. ".contains(c) { c } else { '~' }).collect();
    Ok(crate::data_dir(app)?.join("recovery").join(format!("{h:016x}")).join(safe))
}

/// Keeps a copy of a note's text (at most one per `interval_min` minutes unless `force`, `keep` copies).
#[tauri::command]
pub fn vault_snapshot(app: AppHandle, state: tauri::State<'_, VaultState>, path: String, text: String, interval_min: u64, keep: usize, force: bool) -> Result<bool, String> {
    let dir = recovery_dir(&app, &root_of(&state)?, &path)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut list: Vec<(u128, PathBuf)> = std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten().filter_map(|e| e.file_name().to_string_lossy().strip_suffix(".md").and_then(|n| n.parse::<u128>().ok()).map(|t| (t, e.path()))).collect();
    list.sort();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    if let Some((t, last)) = list.last() {
        if std::fs::read_to_string(last).map(|s| s == text).unwrap_or(false) { return Ok(false); }
        if !force && now.saturating_sub(*t) < (interval_min as u128) * 60_000 { return Ok(false); }
    }
    std::fs::write(dir.join(format!("{now}.md")), text.as_bytes()).map_err(|e| e.to_string())?;
    list.push((now, PathBuf::new()));
    while list.len() > keep.max(1) { let (_, p) = list.remove(0); let _ = std::fs::remove_file(p); }
    Ok(true)
}

#[tauri::command]
pub fn vault_snapshots(app: AppHandle, state: tauri::State<'_, VaultState>, path: String) -> Result<Vec<Value>, String> {
    let dir = recovery_dir(&app, &root_of(&state)?, &path)?;
    let Ok(read) = std::fs::read_dir(&dir) else { return Ok(vec![]) };
    let mut list: Vec<Value> = read.flatten().filter_map(|e| { let t = e.file_name().to_string_lossy().strip_suffix(".md")?.parse::<u64>().ok()?; Some(json!({ "time": t, "size": e.metadata().map(|m| m.len()).unwrap_or(0) })) }).collect();
    list.sort_by(|a, b| b["time"].as_u64().cmp(&a["time"].as_u64()));
    Ok(list)
}

#[tauri::command]
pub fn vault_snapshot_read(app: AppHandle, state: tauri::State<'_, VaultState>, path: String, time: u64) -> Result<String, String> {
    std::fs::read_to_string(recovery_dir(&app, &root_of(&state)?, &path)?.join(format!("{time}.md"))).map_err(|e| e.to_string())
}

// ───────────────────────── export

/// Exports a note: the engine flattens it (embeds, links, callouts), mdcore::export writes the format,
/// pictures are read from the vault. `out` is the absolute file chosen in the save dialog.
#[tauri::command]
pub async fn vault_export(state: tauri::State<'_, VaultState>, format: String, path: String, text: Option<String>, html: String, css: String, title: String, author: String, language: String, options: Value, out: PathBuf) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = root_of(&state)?;
        let fmt = mdcore::export::ExportFormat::from_id(&format).ok_or_else(|| format!("unknown format {format}"))?;
        let markdown = {
            let mut v = lock(&state);
            let mut args = json!({ "path": path, "keepLinks": true });
            if let Some(t) = &text { args["text"] = json!(t); }
            v.engine.call("flatten", &args)?.as_str().unwrap_or_default().to_string()
        };
        let source_dir = Path::new(&path).parent().map(|p| p.to_path_buf()).unwrap_or_default();
        let resource = move |src: &str| -> Option<mdcore::export::Resource> {
            if src.contains("://") || src.starts_with("data:") { return None; }
            let decoded = mdcore::note::percent_decode(src);
            let candidates = [root.join(&decoded), root.join(&source_dir).join(&decoded)];
            let file = candidates.into_iter().find(|p| p.is_file())?;
            let bytes = std::fs::read(&file).ok()?;
            let ext = file.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            let mime = match ext.as_str() { "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp", "svg" => "image/svg+xml", "bmp" => "image/bmp", "avif" => "image/avif", _ => "application/octet-stream" };
            Some(mdcore::export::Resource { bytes, mime: mime.to_string() })
        };
        let opts: mdcore::export::ExportOptions = serde_json::from_value(options).unwrap_or_default();
        let date = chrono::Local::now().format("%Y-%m-%d").to_string();
        let input = mdcore::export::ExportInput { title, author, language, date, markdown, html_body: html, css, resource: &resource, options: opts };
        let bytes = mdcore::export::export(fmt, &input)?;
        write_atomic(&out, &bytes)
    }).await.map_err(|e| e.to_string())?
}

/// The note flattened to portable Markdown ("Copy as Markdown", the web build's exports).
#[tauri::command]
pub fn vault_flatten(state: tauri::State<'_, VaultState>, path: String, text: Option<String>, keep_links: bool) -> Result<String, String> {
    let mut args = json!({ "path": path, "keepLinks": keep_links });
    if let Some(t) = text { args["text"] = json!(t); }
    Ok(lock(&state).engine.call("flatten", &args)?.as_str().unwrap_or_default().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scans_and_loads() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("a/.hidden")).unwrap();
        std::fs::write(dir.path().join("a/Note.md"), "[[Other]] #tag").unwrap();
        std::fs::write(dir.path().join("Other.md"), "\u{feff}# Other").unwrap();
        std::fs::write(dir.path().join("a/.hidden/x.md"), "no").unwrap();
        let entries = scan(dir.path());
        assert!(entries.iter().any(|e| e.path == "a/Note.md"));
        assert!(entries.iter().any(|e| e.path == "a" && e.kind == "folder"));
        assert!(!entries.iter().any(|e| e.path.contains(".hidden")));
        let mut engine = Engine::new();
        load(&mut engine, dir.path(), &entries);
        assert_eq!(engine.index.texts["Other.md"], "# Other");
        let back = engine.call("backlinks", &json!({ "path": "Other.md" })).unwrap();
        assert_eq!(back[0]["from"], "a/Note.md");
        assert!(abs(dir.path(), "../../etc/passwd").unwrap().starts_with(dir.path()));
    }
}
