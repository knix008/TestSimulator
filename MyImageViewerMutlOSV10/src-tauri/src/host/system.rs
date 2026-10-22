// Dialogs, the launch file, app info, help text, links, printers and the per-user
// "default image viewer" file associations (Windows).

use super::{config, emit, error, node_dirname, node_join};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, FilePath};

static LAUNCH_FILE: Mutex<Option<String>> = Mutex::new(None);

pub fn set_launch_file(path: Option<String>) {
    *LAUNCH_FILE.lock().unwrap() = path;
}

/// The file the app was started with (once).
pub fn take_launch_file() -> Option<String> {
    LAUNCH_FILE.lock().unwrap().take()
}

pub fn queue_open_file(path: &str) {
    if !path.is_empty() && Path::new(path).exists() {
        emit("open-file", json!(path));
    }
}

pub fn help_doc(lang: &str) -> String {
    if lang == "ko" {
        include_str!("../../../doc/도움말.md").to_string()
    } else {
        include_str!("../../../doc/help.md").to_string()
    }
}

pub fn app_info() -> Value {
    // version.json is written by scripts/stamp-version.js before every build
    let stamp: Value = serde_json::from_str(include_str!("../../../src/version.json")).unwrap_or(Value::Null);
    let version = super::app()
        .map(|a| a.package_info().version.to_string())
        .or_else(|| stamp.get("version").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| "0.0.0".into());
    let build = match stamp.get("buildNumber") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    };
    json!({ "version": version, "buildNumber": build, "name": "MyImageViewer", "isPackaged": !cfg!(debug_assertions) })
}

// ── Dialogs (native, owned by the main window) ──

fn dialog() -> Option<tauri_plugin_dialog::FileDialogBuilder<tauri::Wry>> {
    let app = super::app()?;
    let mut d = app.dialog().file();
    if let Some(main) = app.get_webview_window("main") {
        d = d.set_parent(&main);
    }
    Some(d)
}

fn picked(p: Option<FilePath>) -> Option<String> {
    p.and_then(|f| f.into_path().ok()).map(|p| p.to_string_lossy().into_owned())
}

const IMAGE_SAVE_FILTERS: &[(&str, &[&str])] = &[
    ("PNG Image", &["png"]),
    ("JPEG Image", &["jpg", "jpeg"]),
    ("WebP Image", &["webp"]),
    ("BMP Image", &["bmp"]),
];

/// Absolute defaultPath as given; a bare name goes into the last folder.
fn save_default(opts: &Value) -> String {
    let given = opts.get("defaultPath").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("image.png");
    if Path::new(given).is_absolute() {
        given.to_string()
    } else {
        node_join(&[config::dialog_default_path(), given.to_string()])
    }
}

fn save_dialog(opts: &Value) -> Option<String> {
    let target = save_default(opts);
    let mut d = dialog()?.set_directory(node_dirname(&target)).set_file_name(super::node_basename(&target));
    for (name, exts) in IMAGE_SAVE_FILTERS {
        d = d.add_filter(*name, exts);
    }
    picked(d.blocking_save_file())
}

pub fn save_file(opts: &Value) -> Value {
    let Some(path) = save_dialog(opts) else {
        return json!({ "canceled": true });
    };
    let Some(bytes) = opts.get("dataUrl").and_then(Value::as_str).and_then(super::data_url_bytes) else {
        return error("Invalid data");
    };
    match std::fs::write(&path, bytes) {
        Ok(()) => {
            config::save_last_open_dir(Some(&path));
            json!({ "success": true, "filePath": path })
        }
        Err(e) => error(e),
    }
}

pub fn show_save_dialog(opts: &Value) -> Value {
    match save_dialog(opts) {
        Some(path) => {
            config::save_last_open_dir(Some(&path));
            json!({ "filePath": path })
        }
        None => json!({ "canceled": true }),
    }
}

pub fn open_subtitle_dialog(video: &str) -> Value {
    let start = if !video.is_empty() && Path::new(video).exists() { node_dirname(video) } else { config::dialog_default_path() };
    let Some(d) = dialog() else {
        return json!({ "canceled": true });
    };
    let d = d
        .set_directory(start)
        .add_filter("Subtitles", &["srt", "smi"])
        .add_filter("SRT", &["srt"])
        .add_filter("SMI", &["smi"])
        .add_filter("All Files", &["*"]);
    match picked(d.blocking_pick_file()) {
        Some(path) => json!({ "canceled": false, "filePath": path }),
        None => json!({ "canceled": true }),
    }
}

pub fn pick_directory(opts: &Value) -> Value {
    let start = opts
        .get("defaultPath")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(config::last_open_dir)
        .unwrap_or_else(config::dialog_default_path);
    let Some(mut d) = dialog() else {
        return json!({ "canceled": true });
    };
    d = d.set_directory(start);
    if let Some(title) = opts.get("title").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        d = d.set_title(title);
    }
    match picked(d.blocking_pick_folder()) {
        Some(path) => {
            config::save_last_open_dir(Some(&path));
            json!({ "path": path })
        }
        None => json!({ "canceled": true }),
    }
}

// ── Links, folders, printers ──

/// A mail / web link from the page (About ▸ contact) — handed to the OS, nothing else allowed.
pub fn open_external(target: &str) -> Value {
    let lower = target.to_lowercase();
    if !(lower.starts_with("mailto:") || lower.starts_with("http://") || lower.starts_with("https://")) {
        return error("not allowed");
    }
    open_url(target)
}

fn open_url(target: &str) -> Value {
    use tauri_plugin_opener::OpenerExt;
    let Some(app) = super::app() else {
        return error("no app");
    };
    match app.opener().open_url(target, None::<&str>) {
        Ok(()) => json!({ "success": true }),
        Err(e) => error(e),
    }
}

pub fn show_item_in_folder(path: &str) -> Value {
    use tauri_plugin_opener::OpenerExt;
    if let Some(app) = super::app() {
        let _ = app.opener().reveal_item_in_dir(path);
    }
    Value::Null
}

pub fn printers() -> Value {
    if !cfg!(windows) {
        return json!([]);
    }
    let out = super::hidden_command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress"])
        .output();
    let Ok(out) = out else {
        return json!([]);
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let parsed: Value = serde_json::from_str(text.trim()).unwrap_or(Value::Null);
    let list = match parsed {
        Value::Array(a) => a,
        Value::Object(_) => vec![parsed],
        _ => Vec::new(),
    };
    Value::Array(
        list.iter()
            .filter_map(|p| {
                let name = p.get("Name")?.as_str()?;
                Some(json!({ "name": name, "displayName": name, "description": "", "isDefault": p.get("Default").and_then(Value::as_bool).unwrap_or(false) }))
            })
            .collect(),
    )
}

// ── Default image viewer (per-user file associations, Windows) ──

const IMAGE_ASSOC: &[(&str, &str, &str)] = &[
    ("jpg", "ImageViewer.jpeg", "JPEG Image"),
    ("jpeg", "ImageViewer.jpeg", "JPEG Image"),
    ("png", "ImageViewer.png", "PNG Image"),
    ("gif", "ImageViewer.gif", "GIF Image"),
    ("bmp", "ImageViewer.bmp", "BMP Image"),
    ("webp", "ImageViewer.webp", "WebP Image"),
    ("avif", "ImageViewer.avif", "AVIF Image"),
    ("svg", "ImageViewer.svg", "SVG Image"),
    ("ico", "ImageViewer.ico", "Windows Icon"),
    ("tif", "ImageViewer.tiff", "TIFF Image"),
    ("tiff", "ImageViewer.tiff", "TIFF Image"),
    ("heic", "ImageViewer.heic", "HEIC Image"),
    ("heif", "ImageViewer.heic", "HEIC Image"),
    ("hif", "ImageViewer.heic", "HEIC Image"),
    ("dcm", "ImageViewer.dcm", "DICOM Image"),
    ("dicom", "ImageViewer.dcm", "DICOM Image"),
];

fn is_our_prog_id(p: &str) -> bool {
    p.to_lowercase().starts_with("imageviewer.")
}

#[cfg(windows)]
fn exe_path() -> PathBuf {
    std::env::current_exe().map(super::plain_path).unwrap_or_default()
}

#[cfg(windows)]
mod reg {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};
    use winreg::RegKey;

    pub fn query_prog_id(ext: &str) -> String {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let read = |root: &RegKey, path: &str, name: &str| -> Option<String> {
            root.open_subkey(path).ok()?.get_value::<String, _>(name).ok().filter(|s| !s.trim().is_empty())
        };
        read(&hkcu, &format!(r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.{ext}\UserChoice"), "ProgId")
            .or_else(|| read(&hkcu, &format!(r"Software\Classes\.{ext}"), ""))
            .or_else(|| read(&RegKey::predef(HKEY_CLASSES_ROOT), &format!(".{ext}"), ""))
            .unwrap_or_default()
    }

    pub fn set(path: &str, name: &str, value: &str) -> std::io::Result<()> {
        let (key, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(path)?;
        key.set_value(name, &value.to_string())
    }
}

pub fn file_assoc_status() -> Value {
    #[cfg(windows)]
    {
        let items: Vec<Value> = IMAGE_ASSOC
            .iter()
            .map(|(ext, _, _)| {
                let prog = reg::query_prog_id(ext);
                json!({ "ext": ext, "progId": prog, "isDefault": is_our_prog_id(&prog) })
            })
            .collect();
        let count = items.iter().filter(|i| i["isDefault"] == json!(true)).count();
        json!({ "platform": "win32", "supported": true, "total": items.len(), "defaultCount": count, "items": items })
    }
    #[cfg(not(windows))]
    {
        let platform = if cfg!(target_os = "macos") { "darwin" } else { "linux" };
        let items: Vec<Value> = IMAGE_ASSOC.iter().map(|(ext, _, _)| json!({ "ext": ext, "isDefault": false })).collect();
        json!({ "platform": platform, "supported": false, "items": items })
    }
}

pub fn set_default_image_viewer() -> Value {
    #[cfg(windows)]
    {
        let exe = exe_path();
        // The program's own icon (resource 0) for the file types
        let icon = format!("{},0", exe.to_string_lossy());
        let cmd = format!("\"{}\" \"%1\"", exe.to_string_lossy());
        let cap = r"Software\com.shkwon.imageviewer\Capabilities";
        let _ = reg::set(cap, "ApplicationName", "MyImageViewer");
        let _ = reg::set(cap, "ApplicationDescription", "MyImageViewer");
        let _ = reg::set(cap, "ApplicationIcon", &icon);
        let _ = reg::set(r"Software\RegisteredApplications", "MyImageViewer", cap);
        let mut written = std::collections::HashSet::new();
        for (ext, prog, desc) in IMAGE_ASSOC {
            let prog_key = format!(r"Software\Classes\{prog}");
            if written.insert(*prog) {
                let _ = reg::set(&prog_key, "", desc);
                let _ = reg::set(&format!(r"{prog_key}\DefaultIcon"), "", &icon);
                let _ = reg::set(&format!(r"{prog_key}\shell\open\command"), "", &cmd);
            }
            let _ = reg::set(&format!(r"Software\Classes\.{ext}"), "", prog);
            let _ = reg::set(&format!(r"Software\Classes\.{ext}\OpenWithProgids"), prog, "");
            let _ = reg::set(&format!(r"{cap}\FileAssociations"), &format!(".{ext}"), prog);
        }
        // Refresh Explorer's icons for the new types
        let _ = super::hidden_command("ie4uinit.exe").arg("-show").spawn();
        json!({ "ok": true, "status": file_assoc_status() })
    }
    #[cfg(not(windows))]
    {
        let platform = if cfg!(target_os = "macos") { "darwin" } else { "linux" };
        json!({ "ok": false, "unsupported": true, "platform": platform })
    }
}

pub fn open_default_apps_settings() -> Value {
    if cfg!(windows) {
        let r = open_url("ms-settings:defaultapps");
        return if r.get("error").is_some() { json!({ "ok": false, "error": r["error"] }) } else { json!({ "ok": true }) };
    }
    if cfg!(target_os = "macos") {
        let r = open_url("x-apple.systempreferences:com.apple.settings.Storage");
        return if r.get("error").is_some() { json!({ "ok": false, "error": r["error"] }) } else { json!({ "ok": true }) };
    }
    json!({ "ok": false, "unsupported": true, "platform": "linux" })
}
