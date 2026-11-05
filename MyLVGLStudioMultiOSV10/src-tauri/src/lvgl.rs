// The LVGL manager: lists the releases on GitHub, downloads and installs a version into the
// data folder, and removes it again. Installed sources are what native builds compile.
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::toolchain::{PROGRESS_EVERY, QUIET_LIMIT};

const USER_AGENT: &str = "MyLVGLStudio";
const TAGS_URL: &str = "https://api.github.com/repos/lvgl/lvgl/tags?per_page=100";

const ATTEMPTS: u32 = 3;
/// The cancel button of the progress window. One version is installed at a time.
static STOPPED: AtomicBool = AtomicBool::new(false);

/// GitHub makes these archives as it sends them and does not say how big they will be, so the time
/// left goes by these: (archive, kept after unpacking) in MB, measured on the releases of each line.
fn sizes(version: &str) -> (u32, u32) {
    let mut parts = version.split('.').map(|part| part.parse::<u32>().unwrap_or(0));
    match (parts.next().unwrap_or(0), parts.next().unwrap_or(0)) {
        (major, _) if major < 9 => (26, 15),
        (9, 0) => (56, 13),
        (9, 1) => (59, 13),
        (9, 2) => (72, 16),
        (9, 3) => (90, 21),
        (9, 4) => (95, 22),
        (9, 5) => (104, 23),
        _ => (115, 25),
    }
}

/// What the progress window says it is installing.
#[tauri::command]
pub fn lvgl_item(version: String) -> Result<Value, String> {
    let dir = version_dir(&version)?;
    let (archive, kept) = sizes(&version);
    Ok(json!({
        "version": version,
        "dir": dir.display().to_string(),
        "installedMegabytes": kept,
        "items": [{ "id": "lvgl", "megabytes": archive, "parts": [{ "id": "lvgl", "version": version }] }],
    }))
}

#[tauri::command]
pub fn lvgl_cancel() {
    STOPPED.store(true, Ordering::SeqCst);
}

pub fn root() -> PathBuf {
    crate::data_dir().join("lvgl")
}

pub fn version_dir(version: &str) -> Result<PathBuf, String> {
    if !valid_version(version) {
        return Err(format!("bad version: {version}"));
    }
    Ok(root().join(version))
}

/// Only N.N.N: the value becomes a folder name and part of a URL.
fn valid_version(version: &str) -> bool {
    let parts: Vec<&str> = version.split('.').collect();
    parts.len() == 3 && parts.iter().all(|part| !part.is_empty() && part.len() <= 4 && part.chars().all(|c| c.is_ascii_digit()))
}

fn is_installed(dir: &Path) -> bool {
    dir.join("lvgl.h").is_file() && dir.join("src").is_dir()
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .map(|entry| match entry.metadata() {
            Ok(meta) if meta.is_dir() => dir_size(&entry.path()),
            Ok(meta) => meta.len(),
            Err(_) => 0,
        })
        .sum()
}

#[tauri::command(async)]
pub fn lvgl_installed() -> Vec<Value> {
    let Ok(entries) = fs::read_dir(root()) else { return vec![] };
    entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();
            (valid_version(&name) && is_installed(&path)).then(|| {
                json!({ "version": name, "path": path.to_string_lossy(), "size": dir_size(&path) })
            })
        })
        .collect()
}

/// The tags on GitHub; the page filters and sorts them.
#[tauri::command(async)]
pub fn lvgl_releases() -> Result<Vec<String>, String> {
    let response = ureq::get(TAGS_URL)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| e.to_string())?;
    let tags: Value = response.into_json().map_err(|e| e.to_string())?;
    Ok(tags
        .as_array()
        .map(|list| list.iter().filter_map(|tag| tag["name"].as_str().map(String::from)).collect())
        .unwrap_or_default())
}

/// True for the parts of the archive a build needs. 9.6 moved its public headers to include/.
fn wanted(relative: &Path) -> bool {
    let Some(first) = relative.components().next() else { return false };
    let first = first.as_os_str().to_string_lossy();
    matches!(first.as_ref(), "src" | "include" | "lvgl.h" | "lvgl_private.h" | "lv_version.h" | "LICENCE.txt" | "lv_conf_template.h")
}

fn emit_progress(app: &AppHandle, version: &str, phase: &str, received: u64, total: u64) {
    let _ = app.emit("lvgl-progress", json!({ "version": version, "phase": phase, "received": received, "total": total }));
}

fn download(app: &AppHandle, version: &str, target: &Path) -> Result<(), String> {
    let url = format!("https://github.com/lvgl/lvgl/archive/refs/tags/v{version}.zip");
    emit_progress(app, version, "download", 0, 0);
    let agent = ureq::AgentBuilder::new().timeout_connect(QUIET_LIMIT).timeout_read(QUIET_LIMIT).build();
    let response = agent.get(&url).set("User-Agent", USER_AGENT).call().map_err(|e| e.to_string())?;
    let total: u64 = response.header("Content-Length").and_then(|value| value.parse().ok()).unwrap_or(0);
    let mut reader = response.into_reader();
    let mut file = fs::File::create(target).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; 256 * 1024];
    let mut received = 0u64;
    let mut told = Instant::now();
    loop {
        if STOPPED.load(Ordering::SeqCst) {
            return Err("stopped".into());
        }
        let count = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        file.write_all(&buffer[..count]).map_err(|e| e.to_string())?;
        received += count as u64;
        if told.elapsed() >= PROGRESS_EVERY {
            told = Instant::now();
            emit_progress(app, version, "download", received, total);
        }
    }
    emit_progress(app, version, "download", received, total);
    Ok(())
}

fn extract(app: &AppHandle, version: &str, archive: &Path, target: &Path) -> Result<(), String> {
    emit_progress(app, version, "extract", 0, 1);
    let file = fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let total = zip.len() as u64;
    let mut told = Instant::now();
    for index in 0..zip.len() {
        if STOPPED.load(Ordering::SeqCst) {
            return Err("stopped".into());
        }
        // By the clock: most entries of the archive are passed over.
        if told.elapsed() >= PROGRESS_EVERY {
            told = Instant::now();
            emit_progress(app, version, "extract", index as u64, total);
        }
        let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
        // enclosed_name refuses paths that would leave the target folder.
        let Some(path) = entry.enclosed_name() else { continue };
        // Every entry sits below one "lvgl-<version>/" folder.
        let Ok(relative) = path.strip_prefix(path.components().next().map(|c| c.as_os_str()).unwrap_or_default()) else { continue };
        if !wanted(relative) {
            continue;
        }
        let output = target.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = fs::File::create(&output).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Downloads and installs a version. It appears under its own name only when complete, so a
/// failed or interrupted install never looks like an installed version.
#[tauri::command(async)]
pub fn lvgl_install(app: AppHandle, version: String, again: Option<bool>) -> Result<(), String> {
    let final_dir = version_dir(&version)?;
    let again = again.unwrap_or(false);
    if is_installed(&final_dir) && !again {
        return Ok(());
    }
    let base = root();
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let archive = base.join(format!(".download-{version}.zip"));
    let partial = base.join(format!(".partial-{version}"));
    let _ = fs::remove_dir_all(&partial);
    STOPPED.store(false, Ordering::SeqCst);
    let result = (|| {
        let mut outcome = Err(String::new());
        for attempt in 1..=ATTEMPTS {
            outcome = download(&app, &version, &archive);
            if outcome.is_ok() || STOPPED.load(Ordering::SeqCst) {
                break;
            }
            if let Err(message) = &outcome {
                crate::native::emit_line(&app, "build", &format!("Download failed ({attempt}/{ATTEMPTS}): {message}"));
            }
        }
        outcome?;
        extract(&app, &version, &archive, &partial)?;
        if !is_installed(&partial) {
            return Err("the archive does not contain LVGL".to_string());
        }
        // Downloading again: what is there stays usable until the new one is complete.
        crate::toolchain::swap_in(&partial, &final_dir)?;
        if again {
            // Compiled from the sources that were replaced, which may be why they are being replaced.
            let _ = fs::remove_dir_all(crate::data_dir().join("native").join(&version));
        }
        Ok(())
    })();
    let _ = fs::remove_file(&archive);
    let _ = fs::remove_dir_all(&partial);
    if result.is_ok() {
        emit_progress(&app, &version, "done", 1, 1);
    }
    result
}

/// The configuration template of an installed version, the file its settings window is made from.
#[tauri::command(async)]
pub fn lvgl_conf_template(version: String) -> Result<Option<Value>, String> {
    let file = version_dir(&version)?.join("lv_conf_template.h");
    if !file.is_file() {
        return Ok(None);
    }
    let text = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    Ok(Some(json!({ "path": file.to_string_lossy(), "text": text })))
}

#[tauri::command(async)]
pub fn lvgl_remove(version: String) -> Result<(), String> {
    let dir = version_dir(&version)?;
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    // Its native build was compiled from those sources.
    let _ = fs::remove_dir_all(crate::data_dir().join("native").join(&version));
    Ok(())
}
