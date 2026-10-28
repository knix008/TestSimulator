// The desktop host: everything the page asks for that a webview cannot do by itself
// (files, folders, thumbnails, conversions, metadata, dialogs, file associations).
//
// It used to be a Node process (host/service.js) the page talked to over HTTP; it now
// runs in this process. The page keeps calling the same channel names through one
// command, `ipc(channel, args)` (src/js/tauriAPI.js), so app.js did not have to change,
// and what the host pushes to the page (progress, folder changes …) goes out as the
// `host-event` event { channel, payload }. Each channel answers what the Node handler
// answered, errors included ({ error: "…" } rather than a rejected call).

mod config;
mod favorites;
mod files;
mod imaging;
mod media;
mod rembg;
mod system;
mod thumbs;

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Called once from setup(): `launch_file` is the image the app was started with.
pub fn init(app: &AppHandle, launch_file: Option<String>) {
    let _ = APP.set(app.clone());
    config::load();
    system::set_launch_file(launch_file);
}

/// The app is quitting: write what is still waiting to be saved.
pub fn shutdown() {
    thumbs::flush_all();
}

pub(crate) fn app() -> Option<&'static AppHandle> {
    APP.get()
}

/// Push `payload` to the page's listeners of `channel` (onOpenProgress, onDirectoryChanged …).
pub(crate) fn emit(channel: &str, payload: Value) {
    if let Some(app) = app() {
        let _ = app.emit_to("main", "host-event", json!({ "channel": channel, "payload": payload }));
    }
}

pub(crate) fn progress(percent: u32, message: &str) {
    emit("open-progress", json!({ "percent": percent, "message": message }));
}

/// The page's channels, by the names the Node host used.
#[tauri::command]
pub async fn ipc(channel: String, args: Vec<Value>) -> Value {
    // Everything below is plain blocking code (files, decoders, child processes): it runs on
    // the blocking pool so neither the async runtime nor the main thread ever waits on it.
    tauri::async_runtime::spawn_blocking(move || dispatch(&channel, &args))
        .await
        .unwrap_or_else(|e| error(e))
}

/// The bytes of a file, as an ArrayBuffer on the page (no base64 round trip); with `max`,
/// only its first `max` bytes.
#[tauri::command]
pub async fn read_file_bytes(path: String, max: Option<u64>) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
        match max {
            None => std::fs::read(&path),
            Some(n) => {
                use std::io::Read;
                let mut buf = Vec::new();
                std::fs::File::open(&path)?.take(n).read_to_end(&mut buf)?;
                Ok(buf)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map(tauri::ipc::Response::new)
    .map_err(|e| e.to_string())
}

fn dispatch(channel: &str, args: &[Value]) -> Value {
    let a0 = args.first().unwrap_or(&Value::Null);
    let a1 = args.get(1).unwrap_or(&Value::Null);
    let s0 = a0.as_str().unwrap_or("");
    match channel {
        // ── folders and files ──
        "read-directory" => files::read_directory(s0, false),
        "read-directory-detailed" => files::read_directory(s0, true),
        "list-drives" => files::list_drives(),
        "path-ancestors" => files::path_ancestors(s0),
        "get-file-stats" => files::file_stats(s0),
        "get-file-url" => file_url(Path::new(s0)).map(Value::String).unwrap_or_else(|| error("invalid path")),
        "read-file-base64" => files::read_file_base64(s0),
        "read-file-bytes" => files::read_file_bytes_json(s0),
        "write-file" => files::write_file(a0),
        "rename-path" => files::rename_path(a0),
        "delete-file" => files::delete_path(s0),
        "transfer-into-dir" => files::transfer_into_dir(a0),
        "watch-directory" => files::watch(s0, false),
        "unwatch-directory" | "unwatch-file" => files::unwatch(s0),
        "watch-file" => files::watch(s0, true),
        "get-home-dir" => json!(home_dir().to_string_lossy()),
        "get-path-sep" => json!(std::path::MAIN_SEPARATOR.to_string()),
        "path-join" => {
            let parts: Vec<String> = flatten_strings(args);
            json!(node_join(&parts))
        }
        "path-dirname" => json!(node_dirname(s0)),
        "path-basename" => json!(node_basename(s0)),
        "read-help-doc" => json!(system::help_doc(s0)),
        // ── thumbnails ──
        "thumb-cache-load" => thumbs::cache_load(s0),
        "thumb-cache-put" => thumbs::cache_put(s0, a1, args.get(2).unwrap_or(&Value::Null)),
        "thumb-make" => thumbs::make_json(s0),
        "thumb-cache-build" => thumbs::build(a0, a1),
        "thumb-cache-stats" => thumbs::stats(),
        "thumb-cache-clear" => thumbs::clear(),
        // ── pictures, media ──
        "convert-to-png" => imaging::convert_to_png(s0),
        "read-image-meta" => imaging::image_basic_meta(s0),
        "read-media-meta" => media::read_media_meta(s0),
        "media-transcode" => media::transcode(s0, a1.as_str() == Some("audio")),
        "rembg-remove" => rembg::remove(a0),
        // Decoded in the page (DicomDecoder); this was only the Node fallback
        "decode-dicom" => error("DICOM is decoded in the page"),
        // ── Explorer › Favorites (favorites.db) ──
        "favorites-list" => favorites::list(),
        "favorites-add" => favorites::add(s0, a1.as_str().unwrap_or("")),
        "favorites-remove" => favorites::remove(s0),
        "favorites-clear" => favorites::clear(),
        "favorites-remap" => favorites::remap(s0, a1.as_str().unwrap_or("")),
        // ── dialogs, settings, system ──
        "open-subtitle-dialog" => system::open_subtitle_dialog(s0),
        "save-file" => system::save_file(a0),
        "show-save-dialog" => system::show_save_dialog(a0),
        "pick-directory" => system::pick_directory(a0),
        "open-file-dialog" => { emit("menu-action", json!("open-file")); Value::Null }
        "open-folder-dialog" => { emit("menu-action", json!("open-folder")); Value::Null }
        "set-last-open-dir" => {
            config::save_last_open_dir(a0.as_str());
            json!(config::last_open_dir())
        }
        "get-last-open-dir" => json!(config::last_open_dir().unwrap_or_else(config::dialog_default_path)),
        "get-saved-last-open-dir" => json!(config::last_open_dir().filter(|d| Path::new(d).exists())),
        "window-remember" => config::window_remember(a0),
        "window-recall" => config::window_recall(),
        "get-launch-file" => json!(system::take_launch_file()),
        "queue-open-file" => {
            system::queue_open_file(s0);
            json!(true)
        }
        "get-app-info" => system::app_info(),
        "get-file-assoc-status" => system::file_assoc_status(),
        "set-default-image-viewer" => system::set_default_image_viewer(),
        "open-default-apps-settings" => system::open_default_apps_settings(),
        "open-external" => system::open_external(s0),
        "show-item-in-folder" => system::show_item_in_folder(s0),
        "get-printers" => system::printers(),
        // The page keeps these itself now (unsaved flag, menu language, window calls)
        _ => Value::Null,
    }
}

// ── helpers shared by the modules ──

pub(crate) fn error(e: impl std::fmt::Display) -> Value {
    json!({ "error": e.to_string() })
}

/// Where settings and caches live: the same folder the Node host (and the Electron builds) used.
pub(crate) fn user_data_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home_dir().join(".config"));
    base.join("image-viewer-multios")
}

pub(crate) fn home_dir() -> PathBuf {
    app()
        .and_then(|a| a.path().home_dir().ok())
        .or_else(|| std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// The folder of programs and scripts the installer brings along (ffmpeg, the rembg worker):
/// runtime/ in the resources of a release build; None in a debug build (the source tree).
pub(crate) fn runtime_dir() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        return None;
    }
    let dir = plain_path(app()?.path().resource_dir().ok()?).join("runtime");
    dir.is_dir().then_some(dir)
}

pub(crate) fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

/// resource_dir() is a \\?\ path on Windows; Python, ffmpeg and the page want the plain one.
pub(crate) fn plain_path(p: PathBuf) -> PathBuf {
    match p.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC\\") => PathBuf::from(rest),
        _ => p,
    }
}

/// A child process that never opens a console window of its own (ffmpeg, Python, reg …).
pub(crate) fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// file:///… for a local path (the page turns it into an asset URL).
pub(crate) fn file_url(path: &Path) -> Option<String> {
    tauri::Url::from_file_path(path).ok().map(|u| u.to_string())
}

pub(crate) fn ms_since_epoch(t: SystemTime) -> f64 {
    match t.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_secs_f64() * 1000.0,
        Err(e) => -(e.duration().as_secs_f64() * 1000.0),
    }
}

/// Date.prototype.toISOString(): 2026-10-22T08:15:30.123Z
pub(crate) fn iso_utc(t: SystemTime) -> String {
    let ms = ms_since_epoch(t).floor() as i64;
    let (secs, milli) = (ms.div_euclid(1000), ms.rem_euclid(1000));
    let (days, sod) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // days → civil date (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{milli:03}Z", sod / 3600, sod % 3600 / 60, sod % 60)
}

/// Uint8Array arguments arrive as { __bytes: base64 } (tauriAPI.js encodeArg).
pub(crate) fn arg_bytes(v: &Value) -> Option<Vec<u8>> {
    use base64::Engine;
    let b64 = v.get("__bytes")?.as_str()?;
    base64::engine::general_purpose::STANDARD.decode(b64).ok()
}

pub(crate) fn data_url_bytes(data_url: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let (_, b64) = data_url.split_once(',')?;
    base64::engine::general_purpose::STANDARD.decode(b64.trim()).ok()
}

pub(crate) fn b64(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub(crate) fn sha1_hex(s: &str) -> String {
    use sha1::{Digest, Sha1};
    hex(&Sha1::digest(s.as_bytes()))
}

fn flatten_strings(args: &[Value]) -> Vec<String> {
    let mut out = Vec::new();
    for a in args {
        match a {
            Value::Array(list) => out.extend(flatten_strings(list)),
            Value::String(s) => out.push(s.clone()),
            _ => {}
        }
    }
    out
}

// ── Node's path module, for the places where the page compares paths it got back ──

fn is_sep(c: char) -> bool {
    c == '/' || (cfg!(windows) && c == '\\')
}

/// path.normalize: one separator kind, no "." / ".." segments, no doubled separators.
pub(crate) fn node_normalize(p: &str) -> String {
    let sep = std::path::MAIN_SEPARATOR;
    let (prefix, rest) = split_root(p);
    let absolute = rest.starts_with(is_sep);
    let mut parts: Vec<&str> = Vec::new();
    for seg in rest.split(is_sep) {
        match seg {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|l| *l != "..") {
                    parts.pop();
                } else if !absolute {
                    parts.push("..");
                }
            }
            s => parts.push(s),
        }
    }
    let mut out = prefix.replace('/', &sep.to_string());
    if absolute {
        out.push(sep);
    }
    out.push_str(&parts.join(&sep.to_string()));
    if out.is_empty() {
        out.push('.');
    }
    out
}

/// The part of a path above its first folder on Windows: "C:" of "C:\x", "\\server\share"
/// of a network path; "" elsewhere.
fn split_root(p: &str) -> (&str, &str) {
    if cfg!(windows) {
        let b = p.as_bytes();
        if b.len() >= 2 && b[1] == b':' && b[0].is_ascii_alphabetic() {
            return p.split_at(2);
        }
        if b.len() > 2 && is_sep(b[0] as char) && is_sep(b[1] as char) && !is_sep(b[2] as char) {
            // \\server\share: both names belong to the root
            let mut seps = p[2..].match_indices(is_sep).map(|(i, _)| i + 2);
            let end = seps.nth(1).unwrap_or(p.len());
            return p.split_at(end);
        }
    }
    ("", p)
}

pub(crate) fn node_join(parts: &[String]) -> String {
    let joined = parts.iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(&std::path::MAIN_SEPARATOR.to_string());
    node_normalize(&joined)
}

/// path.resolve(p): absolute and normalised.
pub(crate) fn node_resolve(p: &str) -> String {
    let path = Path::new(p);
    if path.is_absolute() || (cfg!(windows) && p.starts_with(is_sep)) {
        return node_normalize(p);
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    node_normalize(&cwd.join(p).to_string_lossy())
}

pub(crate) fn node_dirname(p: &str) -> String {
    let (prefix, rest) = split_root(p);
    let bare = || if prefix.is_empty() { ".".to_string() } else { prefix.to_string() };
    let trimmed = rest.trim_end_matches(is_sep);
    if trimmed.is_empty() {
        // "C:\" / "/" is its own parent; "" and "C:" have none
        return if rest.is_empty() { bare() } else { format!("{prefix}{}", &rest[..1]) };
    }
    match trimmed.rfind(is_sep) {
        None => bare(),
        Some(i) => {
            let head = trimmed[..i].trim_end_matches(is_sep);
            if head.is_empty() { format!("{prefix}{}", &trimmed[..1]) } else { format!("{prefix}{head}") }
        }
    }
}

pub(crate) fn node_basename(p: &str) -> String {
    let (_, rest) = split_root(p);
    rest.trim_end_matches(is_sep).rsplit(is_sep).next().unwrap_or("").to_string()
}

pub(crate) fn node_extname(name: &str) -> String {
    let base = node_basename(name);
    match base.rfind('.') {
        Some(i) if i > 0 => base[i..].to_string(),
        _ => String::new(),
    }
}

/// Lower-case on Windows (paths there compare without case), as the Node host did.
pub(crate) fn path_key(p: &str) -> String {
    let r = node_resolve(p);
    if cfg!(windows) { r.to_lowercase() } else { r }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_dates_match_javascript() {
        let t = UNIX_EPOCH + std::time::Duration::from_millis(1_792_656_930_123);
        assert_eq!(iso_utc(t), "2026-10-22T08:15:30.123Z");
        assert_eq!(iso_utc(UNIX_EPOCH), "1970-01-01T00:00:00.000Z");
    }

    #[cfg(windows)]
    #[test]
    fn node_path_functions() {
        assert_eq!(node_dirname(r"C:\a\b.jpg"), r"C:\a");
        assert_eq!(node_dirname(r"C:\a"), r"C:\");
        assert_eq!(node_dirname(r"C:\"), r"C:\");
        assert_eq!(node_basename(r"C:\a\b.jpg"), "b.jpg");
        assert_eq!(node_basename(r"C:\a\dir\"), "dir");
        assert_eq!(node_join(&[r"C:\a".into(), "..".into(), "b".into(), "c.png".into()]), r"C:\b\c.png");
        assert_eq!(node_normalize("C:/x//y/./z"), r"C:\x\y\z");
        assert_eq!(node_extname("a.tar.GZ"), ".GZ");
        assert_eq!(node_extname(".hidden"), "");
    }
}
