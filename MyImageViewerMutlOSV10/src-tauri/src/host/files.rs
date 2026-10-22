// Folders and files: listings, stats, reading / writing, rename / delete / copy / move,
// and change watching.

use super::{emit, error, iso_utc, ms_since_epoch, node_basename, node_dirname, node_extname, node_join, node_resolve, progress};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

fn name_order(a: &(String, bool), b: &(String, bool)) -> std::cmp::Ordering {
    // Folders first, then by name without regard to case (localeCompare, sensitivity: base)
    b.1.cmp(&a.1).then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase()))
}

pub fn read_directory(dir: &str, detailed: bool) -> Value {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => return error(e),
    };
    let mut rows: Vec<((String, bool), Value)> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let full = node_join(&[dir.to_string(), name.clone()]);
        // The dirent's own answer (a link to a folder is not a folder here, as in Node)
        let mut is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let row = if detailed {
            let (mut size, mut mtime, mut birth) = (0u64, 0f64, 0f64);
            if let Ok(st) = std::fs::metadata(&full) {
                size = st.len();
                mtime = st.modified().map(ms_since_epoch).unwrap_or(0.0);
                birth = st.created().map(ms_since_epoch).unwrap_or(0.0);
                is_dir = st.is_dir();
            }
            json!({ "name": name, "isDirectory": is_dir, "path": full, "size": size, "mtimeMs": mtime, "birthtimeMs": birth })
        } else {
            json!({ "name": name, "isDirectory": is_dir, "path": full })
        };
        rows.push(((name, is_dir), row));
    }
    rows.sort_by(|a, b| name_order(&a.0, &b.0));
    Value::Array(rows.into_iter().map(|(_, v)| v).collect())
}

pub fn list_drives() -> Value {
    let drive = |name: String, path: String| json!({ "name": name, "path": path, "isDirectory": true, "isDrive": true });
    let mut drives = Vec::new();
    if cfg!(windows) {
        for letter in b'A'..=b'Z' {
            let root = format!("{}:\\", letter as char);
            if std::fs::metadata(&root).is_ok() {
                drives.push(drive(format!("{}:", letter as char), root));
            }
        }
    } else if cfg!(target_os = "macos") {
        drives.push(drive("Macintosh HD".into(), "/".into()));
        if let Ok(vols) = std::fs::read_dir("/Volumes") {
            for v in vols.flatten() {
                let name = v.file_name().to_string_lossy().into_owned();
                let ok = v.file_type().map(|t| t.is_dir() || t.is_symlink()).unwrap_or(false);
                if ok && name != "Macintosh HD" {
                    drives.push(drive(name.clone(), format!("/Volumes/{name}")));
                }
            }
        }
    } else {
        drives.push(drive("/".into(), "/".into()));
        let user = std::env::var("USER").ok().map(|u| format!("/run/media/{u}"));
        for base in ["/media".to_string(), "/mnt".to_string()].into_iter().chain(user) {
            if let Ok(list) = std::fs::read_dir(&base) {
                for e in list.flatten() {
                    if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let name = e.file_name().to_string_lossy().into_owned();
                        drives.push(drive(name.clone(), format!("{base}/{name}")));
                    }
                }
            }
        }
    }
    Value::Array(drives)
}

/// The folder (or the folder of a file) and every folder above it, root first.
pub fn path_ancestors(target: &str) -> Value {
    if target.is_empty() {
        return json!([]);
    }
    let mut current = node_resolve(target);
    if std::fs::metadata(&current).map(|m| !m.is_dir()).unwrap_or(false) {
        current = node_dirname(&current);
    }
    let mut list = Vec::new();
    loop {
        list.insert(0, current.clone());
        let parent = node_dirname(&current);
        if parent.is_empty() || parent == current || list.contains(&parent) {
            break;
        }
        current = parent;
    }
    json!(list)
}

pub fn file_stats(path: &str) -> Value {
    match std::fs::metadata(path) {
        Ok(st) => {
            let iso = |t: std::io::Result<std::time::SystemTime>| t.map(iso_utc).unwrap_or_default();
            json!({
                "size": st.len(),
                "created": iso(st.created()),
                "modified": iso(st.modified()),
                "accessed": iso(st.accessed()),
                // Node's ctime (last status change) — Windows has no such thing; it reported mtime
                "changed": iso(st.modified()),
                "isDirectory": st.is_dir(),
            })
        }
        Err(e) => error(e),
    }
}

fn mime_of(path: &str) -> &'static str {
    match node_extname(path).to_lowercase().trim_start_matches('.') {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "tiff" | "tif" => "image/tiff",
        "heic" => "image/heic",
        "heif" | "hif" => "image/heif",
        "dcm" | "dicom" => "application/dicom",
        "srt" | "smi" => "text/plain",
        _ => "application/octet-stream",
    }
}

pub fn read_file_base64(path: &str) -> Value {
    progress(12, "reading");
    match std::fs::read(path) {
        Ok(data) => {
            progress(72, "decoding");
            let url = format!("data:{};base64,{}", mime_of(path), super::b64(&data));
            progress(90, "displaying");
            json!(url)
        }
        Err(e) => error(e),
    }
}

/// The JSON channel (page code that does not use the read_file_bytes command)
pub fn read_file_bytes_json(path: &str) -> Value {
    match std::fs::read(path) {
        Ok(data) => json!({ "__bytes": super::b64(&data) }),
        Err(e) => error(e),
    }
}

pub fn write_file(opts: &Value) -> Value {
    let path = opts.get("filePath").and_then(Value::as_str).unwrap_or("");
    let Some(bytes) = opts.get("dataUrl").and_then(Value::as_str).and_then(super::data_url_bytes) else {
        return error("Invalid data");
    };
    match std::fs::write(path, bytes) {
        Ok(()) => json!({ "success": true, "filePath": path }),
        Err(e) => error(e),
    }
}

pub fn rename_path(opts: &Value) -> Value {
    let src = opts.get("src").and_then(Value::as_str).unwrap_or("");
    let Some(new_name) = opts.get("newName").filter(|v| !v.is_null()) else {
        return error("Missing path or name");
    };
    if src.is_empty() {
        return error("Missing path or name");
    }
    let name = new_name.as_str().map(str::to_string).unwrap_or_else(|| new_name.to_string());
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return error("Invalid name");
    }
    let dest = node_join(&[node_dirname(src), name.to_string()]);
    if node_resolve(src) == node_resolve(&dest) {
        return json!({ "success": true, "path": src });
    }
    // A case-only rename ("a.jpg" → "A.jpg") is the same file on Windows, not a clash
    let same_file = cfg!(windows) && node_resolve(src).to_lowercase() == node_resolve(&dest).to_lowercase();
    if !same_file && std::fs::symlink_metadata(&dest).is_ok() {
        return error("exists");
    }
    match std::fs::rename(src, &dest) {
        Ok(()) => json!({ "success": true, "path": dest }),
        Err(e) => error(e),
    }
}

pub fn delete_path(path: &str) -> Value {
    let result = match std::fs::metadata(path) {
        Ok(st) if st.is_dir() => std::fs::remove_dir_all(path),
        Ok(_) => std::fs::remove_file(path),
        Err(e) => Err(e),
    };
    match result {
        Ok(()) => json!({ "success": true }),
        Err(e) => error(e),
    }
}

/// destDir/name, or "name (1).ext", "name (2).ext" … when that is taken.
fn unique_dest(dest_dir: &str, base: &str) -> String {
    let first = node_join(&[dest_dir.to_string(), base.to_string()]);
    if std::fs::symlink_metadata(&first).is_err() {
        return first;
    }
    let ext = node_extname(base);
    let stem = &base[..base.len() - ext.len()];
    (1..)
        .map(|i| node_join(&[dest_dir.to_string(), format!("{stem} ({i}){ext}")]))
        .find(|p| std::fs::symlink_metadata(p).is_err())
        .unwrap_or(first)
}

fn is_inside(parent: &str, child: &str) -> bool {
    let (p, c) = (super::path_key(parent), super::path_key(child));
    let sep = std::path::MAIN_SEPARATOR;
    c == p || c.starts_with(&format!("{}{sep}", p.trim_end_matches(sep)))
}

fn copy_dir_all(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Copy or move files / folders into destDir. opts: { sources: [], destDir, mode: 'copy' | 'move' }
pub fn transfer_into_dir(opts: &Value) -> Value {
    let sources: Vec<String> = opts
        .get("sources")
        .and_then(Value::as_array)
        .map(|l| l.iter().filter_map(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string).collect())
        .unwrap_or_default();
    let dest_dir = opts.get("destDir").and_then(Value::as_str).unwrap_or("");
    let mode = if opts.get("mode").and_then(Value::as_str) == Some("move") { "move" } else { "copy" };
    if dest_dir.is_empty() || sources.is_empty() {
        return error("Missing source or destination");
    }
    match std::fs::metadata(dest_dir) {
        Ok(m) if m.is_dir() => {}
        Ok(_) => return error("Destination is not a directory"),
        Err(e) => return error(e),
    }
    let dest_resolved = node_resolve(dest_dir);
    let mut results = Vec::new();
    let mut errors = Vec::new();
    for src in &sources {
        let src_resolved = node_resolve(src);
        if is_inside(&src_resolved, &dest_resolved) {
            errors.push(json!({ "src": src, "error": "Cannot drop a folder into itself" }));
            continue;
        }
        let outcome = (|| -> std::io::Result<Value> {
            let st = std::fs::metadata(&src_resolved)?;
            // Moving within the same folder changes nothing
            if mode == "move" && node_dirname(&src_resolved).to_lowercase() == dest_resolved.to_lowercase() {
                return Ok(json!({ "src": src_resolved, "dest": src_resolved, "skipped": true }));
            }
            let dest = unique_dest(dest_dir, &node_basename(&src_resolved));
            if src_resolved.to_lowercase() == node_resolve(&dest).to_lowercase() {
                return Ok(json!({ "src": src_resolved, "dest": src_resolved, "skipped": true }));
            }
            if mode == "move" {
                if std::fs::rename(&src_resolved, &dest).is_err() {
                    // Another drive: copy, then remove the original
                    if st.is_dir() {
                        copy_dir_all(Path::new(&src_resolved), Path::new(&dest))?;
                        std::fs::remove_dir_all(&src_resolved)?;
                    } else {
                        std::fs::copy(&src_resolved, &dest)?;
                        std::fs::remove_file(&src_resolved)?;
                    }
                }
            } else if st.is_dir() {
                copy_dir_all(Path::new(&src_resolved), Path::new(&dest))?;
            } else {
                std::fs::copy(&src_resolved, &dest)?;
            }
            Ok(json!({ "src": src_resolved, "dest": dest, "mode": mode }))
        })();
        match outcome {
            Ok(v) => results.push(v),
            Err(e) => errors.push(json!({ "src": src, "error": e.to_string() })),
        }
    }
    let mut out = json!({ "success": errors.is_empty(), "mode": mode, "destDir": dest_dir, "results": results });
    if !errors.is_empty() {
        out["errors"] = json!(errors);
    }
    out
}

// ── Change watching: one watcher per folder / file, quiet for a moment before it tells ──

static WATCHERS: Mutex<Option<HashMap<String, notify::RecommendedWatcher>>> = Mutex::new(None);

pub fn watch(path: &str, is_file: bool) -> Value {
    use notify::Watcher;
    let mut guard = WATCHERS.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    if map.contains_key(path) {
        return Value::Null;
    }
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let Ok(mut watcher) = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            let _ = tx.send(());
        }
    }) else {
        return Value::Null;
    };
    // Network drives, permissions … — not watched, as before
    if watcher.watch(Path::new(path), notify::RecursiveMode::NonRecursive).is_err() {
        return Value::Null;
    }
    let (channel, quiet) = if is_file { ("file-changed", 400) } else { ("directory-changed", 300) };
    let target = path.to_string();
    std::thread::spawn(move || {
        // Ends when the watcher (and with it the sender) is dropped by unwatch
        use std::sync::mpsc::RecvTimeoutError;
        while rx.recv().is_ok() {
            loop {
                match rx.recv_timeout(Duration::from_millis(quiet)) {
                    Ok(()) => continue,
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            emit(channel, json!(target));
        }
    });
    map.insert(path.to_string(), watcher);
    Value::Null
}

pub fn unwatch(path: &str) -> Value {
    if let Some(map) = WATCHERS.lock().unwrap().as_mut() {
        map.remove(path);
    }
    Value::Null
}
