use crate::capture;
use crate::dialogs;
use crate::state::AppState;
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const MIN_W: f64 = 960.0;
const MIN_H: f64 = 600.0;
const MAX_MIN_W: f64 = 2200.0;
const MAX_MIN_H: f64 = 1400.0;

fn user_data(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        if let Ok(dir) = std::env::var("CM_USER_DATA") {
            if !dir.is_empty() {
                return PathBuf::from(dir);
            }
        }
    }
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn settings_path(app: &AppHandle) -> PathBuf {
    user_data(app).join("settings.json")
}

fn window_state_path(app: &AppHandle) -> PathBuf {
    user_data(app).join("window-state.json")
}

fn stamp_path(app: &AppHandle) -> PathBuf {
    user_data(app).join("install-stamp.json")
}

fn emit_progress(window: &WebviewWindow, id: &str, done: u64, total: u64) {
    if id.is_empty() {
        return;
    }
    let _ = window.emit("task:progress", json!({ "id": id, "done": done, "total": total }));
}

fn read_with_progress(window: &WebviewWindow, id: &str, path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|e| format!("File not found: {} ({e})", path.display()))?;
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut reader = std::io::BufReader::new(file);
    let mut out = Vec::with_capacity(total.min(64 * 1024 * 1024) as usize);
    let mut buf = [0u8; 256 * 1024];
    let mut done = 0u64;
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        out.extend_from_slice(&buf[..n]);
        done += n as u64;
        emit_progress(window, id, done, total);
    }
    Ok(out)
}

fn write_with_progress(window: &WebviewWindow, id: &str, path: &Path, data: &[u8]) -> Result<bool, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let total = data.len() as u64;
    let mut done = 0u64;
    for chunk in data.chunks(256 * 1024) {
        file.write_all(chunk).map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        emit_progress(window, id, done, total);
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(true)
}

fn logical_size(window: &WebviewWindow) -> Result<(f64, f64), String> {
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?.max(0.01);
    Ok((size.width as f64 / scale, size.height as f64 / scale))
}

fn path_string(path: tauri_plugin_dialog::FilePath) -> String {
    match path {
        tauri_plugin_dialog::FilePath::Path(p) => p.to_string_lossy().to_string(),
        tauri_plugin_dialog::FilePath::Url(u) => u.to_string(),
    }
}

#[derive(Deserialize)]
pub struct FileFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenReq {
    default_dir: Option<String>,
    filters: Option<Vec<FileFilter>>,
    title: Option<String>,
    multi: Option<bool>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DirReq {
    default_dir: Option<String>,
    title: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveReq {
    default_name: Option<String>,
    default_dir: Option<String>,
    filters: Option<Vec<FileFilter>>,
    title: Option<String>,
}

fn apply_filters(mut dialog: tauri_plugin_dialog::FileDialogBuilder<tauri::Wry>, filters: Option<&Vec<FileFilter>>) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    if let Some(filters) = filters {
        for filter in filters {
            let exts: Vec<String> = filter.extensions.iter().map(|e| e.trim_start_matches('.').to_string()).filter(|e| !e.is_empty() && e != "*").collect();
            if exts.is_empty() {
                continue;
            }
            let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(&filter.name, &refs);
        }
    }
    dialog
}

#[tauri::command]
pub fn get_info(app: AppHandle) -> Value {
    let mut info = json!({
        "isTauri": true,
        "isElectron": false,
        "tauri": "2",
        "electron": "",
        "chrome": "",
        "node": "",
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "osRelease": std::env::consts::OS,
        "userData": user_data(&app).to_string_lossy(),
        "home": app.path().home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        "pictures": app.path().picture_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        "videos": app.path().video_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        "packaged": !cfg!(debug_assertions),
    });
    if let Ok(extra) = serde_json::from_str::<Value>(include_str!("../../src/build-info.json")) {
        if let (Some(obj), Some(more)) = (info.as_object_mut(), extra.as_object()) {
            for (k, v) in more {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    info
}

#[tauri::command]
pub fn take_pending_open(state: tauri::State<AppState>) -> Option<String> {
    state.pending_open.lock().ok().and_then(|mut p| p.take())
}

#[tauri::command]
pub fn take_install_check(state: tauri::State<AppState>) -> bool {
    state.pending_install.swap(false, std::sync::atomic::Ordering::SeqCst)
}

#[tauri::command]
pub fn resolve_install_check(app: AppHandle, wipe: bool) -> Result<bool, String> {
    if wipe {
        let dir = user_data(&app);
        let _ = fs::remove_file(dir.join("settings.json"));
        let _ = fs::remove_file(dir.join("window-state.json"));
    }
    write_stamp(&app);
    Ok(true)
}

#[tauri::command]
pub fn quit(app: AppHandle, state: tauri::State<AppState>) {
    state.quitting.store(true, std::sync::atomic::Ordering::SeqCst);
    save_window_state(&app);
    let labels: Vec<String> = app.webview_windows().keys().cloned().collect();
    for label in labels {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.destroy();
        }
    }
    app.exit(0);
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Option<Value> {
    fs::read_to_string(settings_path(&app)).ok().and_then(|t| serde_json::from_str(&t).ok())
}

#[tauri::command]
pub fn save_settings(app: AppHandle, data: Value) -> Result<bool, String> {
    let path = settings_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn fs_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn fs_ensure_dir(path: String) -> Result<bool, String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn fs_stat(path: String) -> Option<Value> {
    let p = Path::new(&path);
    let meta = fs::metadata(p).ok()?;
    let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    Some(json!({
        "size": meta.len(),
        "mtime": mtime,
        "dir": p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        "name": p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        "isDir": meta.is_dir(),
    }))
}

#[tauri::command]
pub fn fs_read_binary(window: WebviewWindow, file_path: String, id: Option<String>) -> Result<Value, String> {
    let path = PathBuf::from(&file_path);
    let data = read_with_progress(&window, id.as_deref().unwrap_or(""), &path)?;
    let size = data.len() as u64;
    Ok(json!({
        "data": data,
        "name": path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        "dir": path.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
        "path": file_path,
        "size": size,
    }))
}

#[tauri::command]
pub fn fs_read_text(window: WebviewWindow, file_path: String, id: Option<String>) -> Result<String, String> {
    let bytes = read_with_progress(&window, id.as_deref().unwrap_or(""), Path::new(&file_path))?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_write_binary(window: WebviewWindow, file_path: String, data: Vec<u8>, id: Option<String>) -> Result<bool, String> {
    write_with_progress(&window, id.as_deref().unwrap_or(""), Path::new(&file_path), &data)
}

/// Writes already-encoded bytes. The payload is the base64 from a data URL, so
/// automatic save does not depend on a raw-body request or custom headers.
#[tauri::command]
pub fn fs_write_base64(path: String, data: String) -> Result<u64, String> {
    let payload = data.split_once(',').map(|(_, rest)| rest).unwrap_or(data.as_str());
    let bytes = base64::engine::general_purpose::STANDARD.decode(payload.trim()).map_err(|e| e.to_string())?;
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(bytes.len() as u64)
}

#[tauri::command]
pub fn fs_write_text(window: WebviewWindow, file_path: String, content: String, id: Option<String>) -> Result<bool, String> {
    write_with_progress(&window, id.as_deref().unwrap_or(""), Path::new(&file_path), content.as_bytes())
}

#[tauri::command]
pub fn fs_copy_file(window: WebviewWindow, from: String, to: String, id: Option<String>) -> Result<bool, String> {
    let data = read_with_progress(&window, id.as_deref().unwrap_or(""), Path::new(&from))?;
    write_with_progress(&window, id.as_deref().unwrap_or(""), Path::new(&to), &data)
}

#[tauri::command]
pub fn fs_temp_path(ext: Option<String>) -> String {
    let n = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let ext = ext.unwrap_or_default();
    std::env::temp_dir().join(format!("capturemaster-{n}{ext}")).to_string_lossy().to_string()
}

#[tauri::command]
pub fn fs_remove(path: String) -> bool {
    let p = Path::new(&path);
    if path.len() < 4 {
        return false;
    }
    if p.is_dir() {
        fs::remove_dir_all(p).is_ok()
    } else {
        fs::remove_file(p).is_ok()
    }
}

#[tauri::command]
pub fn pick_open_file(app: AppHandle, req: Option<OpenReq>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let req = req.unwrap_or_default();
    let mut dialog = app.dialog().file();
    if let Some(title) = &req.title {
        dialog = dialog.set_title(title);
    }
    if let Some(dir) = &req.default_dir {
        if !dir.is_empty() {
            dialog = dialog.set_directory(Path::new(dir));
        }
    }
    dialog = apply_filters(dialog, req.filters.as_ref());
    if req.multi.unwrap_or(false) {
        let picked = dialog.blocking_pick_files();
        Ok(match picked {
            Some(files) if !files.is_empty() => json!(files.into_iter().map(path_string).collect::<Vec<_>>()),
            _ => Value::Null,
        })
    } else {
        Ok(match dialog.blocking_pick_file() {
            Some(file) => json!(path_string(file)),
            None => Value::Null,
        })
    }
}

#[tauri::command]
pub fn pick_directory(app: AppHandle, req: Option<DirReq>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let req = req.unwrap_or_default();
    let mut dialog = app.dialog().file();
    if let Some(title) = &req.title {
        dialog = dialog.set_title(title);
    }
    if let Some(dir) = &req.default_dir {
        if !dir.is_empty() {
            dialog = dialog.set_directory(Path::new(dir));
        }
    }
    Ok(dialog.blocking_pick_folder().map(path_string))
}

#[tauri::command]
pub fn pick_save_path(app: AppHandle, req: Option<SaveReq>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let req = req.unwrap_or_default();
    let mut dialog = app.dialog().file();
    if let Some(title) = &req.title {
        dialog = dialog.set_title(title);
    }
    if let Some(dir) = &req.default_dir {
        if !dir.is_empty() {
            dialog = dialog.set_directory(Path::new(dir));
        }
    }
    if let Some(name) = &req.default_name {
        dialog = dialog.set_file_name(name);
    }
    dialog = apply_filters(dialog, req.filters.as_ref());
    Ok(dialog.blocking_save_file().map(path_string))
}

#[tauri::command]
pub fn net_download(window: WebviewWindow, url: String, id: Option<String>) -> Result<Value, String> {
    let response = ureq::get(&url).call().map_err(|e| format!("{e} — {url}"))?;
    let content_type = response.header("content-type").unwrap_or("").to_string();
    let mut data = Vec::new();
    response.into_reader().read_to_end(&mut data).map_err(|e| e.to_string())?;
    let size = data.len() as u64;
    emit_progress(&window, id.as_deref().unwrap_or(""), size, size);
    let name = url.split('/').next_back().unwrap_or("download").split('?').next().unwrap_or("download").to_string();
    Ok(json!({ "data": data, "name": name, "size": size, "url": url, "contentType": content_type }))
}

#[tauri::command]
pub fn clipboard_write_text(text: String) -> Result<bool, String> {
    let mut clip = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clip.set_text(text).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn clipboard_read_text() -> Result<String, String> {
    let mut clip = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clip.get_text().map_err(|e| e.to_string())
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let b64 = data_url.split_once(',').map(|(_, b)| b).unwrap_or(data_url);
    base64::engine::general_purpose::STANDARD.decode(b64.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clipboard_write_image(data_url: String) -> Result<bool, String> {
    let bytes = decode_data_url(&data_url)?;
    let mut img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.to_rgba8();
    // Programs that paste the alpha-less bitmap format show the colour of fully
    // transparent pixels; white reads as "empty" there, while PNG keeps the alpha.
    for px in img.as_mut().chunks_exact_mut(4) {
        if px[3] == 0 {
            px[..3].fill(255);
        }
    }
    let width = img.width() as usize;
    let height = img.height() as usize;
    let mut clip = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clip.set_image(arboard::ImageData {
        width,
        height,
        bytes: std::borrow::Cow::Owned(img.into_raw()),
    }).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn clipboard_read_image() -> Result<Option<Value>, String> {
    let mut clip = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let img = match clip.get_image() {
        Ok(img) => img,
        Err(_) => return Ok(None),
    };
    let mut buf = std::io::Cursor::new(Vec::new());
    let encoder = image::codecs::png::PngEncoder::new(&mut buf);
    use image::ImageEncoder;
    encoder.write_image(&img.bytes, img.width as u32, img.height as u32, image::ExtendedColorType::Rgba8).map_err(|e| e.to_string())?;
    let data_url = format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(buf.into_inner()));
    Ok(Some(json!({ "dataUrl": data_url, "width": img.width, "height": img.height })))
}

#[tauri::command]
pub async fn print_list_printers() -> Value {
    crate::printing::list_printers()
}

/// Prints (or writes as PDF) the page of the webview that calls this.
#[tauri::command]
pub async fn print_page(webview: tauri::Webview, options: crate::printing::PrintOptions) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || crate::printing::print(&webview, options))
        .await
        .map_err(|e| e.to_string())??;
    Ok(true)
}

#[tauri::command]
pub fn shell_open_external(app: AppHandle, url: String) -> Result<bool, String> {
    use tauri_plugin_opener::OpenerExt;
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return Err("Refused to open this address.".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn shell_show_item(app: AppHandle, path: String) -> Result<bool, String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn shell_open_path(app: AppHandle, path: String) -> Result<bool, String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())?;
    Ok(true)
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceOpts {
    types: Option<Vec<String>>,
    thumb_width: Option<u32>,
    include_self: Option<bool>,
}

// Captures are async so the encoding work runs off the main thread and does not
// stall the window event loop.
#[tauri::command]
pub async fn capture_list_sources(opts: Option<SourceOpts>) -> Result<Vec<Value>, String> {
    let opts = opts.unwrap_or_default();
    let types = opts.types.unwrap_or_else(|| vec!["screen".into(), "window".into()]);
    capture::list_sources(&types, opts.thumb_width.unwrap_or(360), opts.include_self.unwrap_or(true))
}

fn remember_shot(state: &AppState, png: Vec<u8>) -> String {
    let mut slot = state.shots.lock().unwrap_or_else(|e| e.into_inner());
    slot.seq = slot.seq.wrapping_add(1);
    let id = format!("s{}", slot.seq);
    slot.shot = Some(crate::state::LastShot { id: id.clone(), png });
    id
}

fn finish_grab(state: &AppState, mut grabbed: capture::Grabbed) -> Value {
    let id = remember_shot(state, grabbed.png);
    grabbed.value["shotId"] = json!(id);
    grabbed.value
}

#[tauri::command]
pub async fn capture_grab_screen(state: tauri::State<'_, AppState>, source_id: Option<String>, save_path: Option<String>) -> Result<Value, String> {
    let grabbed = capture::grab_screen(source_id.as_deref(), save_path.as_deref())?;
    Ok(finish_grab(&state, grabbed))
}

#[tauri::command]
pub async fn capture_grab_window(state: tauri::State<'_, AppState>, source_id: String, save_path: Option<String>) -> Result<Value, String> {
    let grabbed = capture::grab_window(&source_id, save_path.as_deref())?;
    Ok(finish_grab(&state, grabbed))
}

/// Saves the cached still. A rectangle crops it first (region capture).
#[tauri::command]
pub fn capture_save_shot(state: tauri::State<AppState>, shot_id: String, path: String, x: Option<f64>, y: Option<f64>, w: Option<f64>, h: Option<f64>) -> Result<u64, String> {
    let png = {
        let slot = state.shots.lock().map_err(|e| e.to_string())?;
        let shot = slot.shot.as_ref().filter(|s| s.id == shot_id).ok_or_else(|| "The capture is no longer available.".to_string())?;
        shot.png.clone()
    };
    let crop = match (x, y, w, h) {
        (Some(x), Some(y), Some(w), Some(h)) if w >= 1.0 && h >= 1.0 => Some((x.round().max(0.0) as u32, y.round().max(0.0) as u32, w.round().max(1.0) as u32, h.round().max(1.0) as u32)),
        _ => None,
    };
    capture::save_png(&png, &path, crop)
}

#[tauri::command]
pub fn capture_drop_shot(state: tauri::State<AppState>, shot_id: String) -> bool {
    let mut slot = state.shots.lock().unwrap_or_else(|e| e.into_inner());
    if slot.shot.as_ref().is_some_and(|s| s.id == shot_id) {
        slot.shot = None;
        return true;
    }
    false
}

#[tauri::command]
pub fn capture_displays() -> Result<Vec<Value>, String> {
    capture::list_displays()
}

#[tauri::command]
pub fn capture_cursor_display() -> Result<String, String> {
    capture::cursor_display()
}

#[tauri::command]
pub fn capture_hide_app(app: AppHandle, state: tauri::State<AppState>) -> bool {
    let mut hidden = Vec::new();
    for (label, win) in app.webview_windows() {
        if win.is_visible().unwrap_or(false) {
            hidden.push(label);
            disable_transitions(&win);
            let _ = win.hide();
        }
    }
    if let Ok(mut slot) = state.hidden.lock() {
        *slot = hidden;
    }
    wait_for_compositor();
    true
}

/// Without this DWM fades hidden windows out, and they would show up in the shot.
#[cfg(windows)]
fn disable_transitions(win: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    if let Ok(hwnd) = win.hwnd() {
        let on: i32 = 1;
        unsafe {
            let _ = DwmSetWindowAttribute(HWND(hwnd.0 as _), DWMWA_TRANSITIONS_FORCEDISABLED, &on as *const i32 as *const _, std::mem::size_of::<i32>() as u32);
        }
    }
}

#[cfg(not(windows))]
fn disable_transitions(_win: &WebviewWindow) {}

/// Returns once the desktop has been recomposed without the hidden windows.
#[cfg(windows)]
fn wait_for_compositor() {
    for _ in 0..2 {
        unsafe {
            let _ = windows::Win32::Graphics::Dwm::DwmFlush();
        }
    }
}

#[cfg(not(windows))]
fn wait_for_compositor() {}

#[tauri::command]
pub fn capture_show_app(app: AppHandle, state: tauri::State<AppState>) -> bool {
    let labels = state.hidden.lock().ok().map(|mut h| std::mem::take(&mut *h)).unwrap_or_default();
    for label in labels {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.show();
        }
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    true
}

#[tauri::command]
pub fn capture_minimize_app(app: AppHandle) -> bool {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
    true
}

#[tauri::command]
pub fn capture_restore_app(app: AppHandle) -> bool {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    true
}

#[tauri::command]
pub fn rec_open(state: tauri::State<AppState>, file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = File::create(&path).map_err(|e| e.to_string())?;
    let id = format!("rec-{}", SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    state.recordings.lock().map_err(|e| e.to_string())?.insert(id.clone(), file);
    Ok(id)
}

#[tauri::command]
pub fn rec_append(state: tauri::State<AppState>, id: String, data: Vec<u8>) -> Result<bool, String> {
    let mut map = state.recordings.lock().map_err(|e| e.to_string())?;
    let file = map.get_mut(&id).ok_or_else(|| "Recording is not open.".to_string())?;
    file.write_all(&data).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn rec_close(state: tauri::State<AppState>, id: String) -> Result<bool, String> {
    if let Some(mut file) = state.recordings.lock().map_err(|e| e.to_string())?.remove(&id) {
        file.flush().map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub fn rec_discard(state: tauri::State<AppState>, id: String, path: Option<String>) -> Result<bool, String> {
    let _ = state.recordings.lock().map_err(|e| e.to_string())?.remove(&id);
    if let Some(path) = path {
        let _ = fs::remove_file(path);
    }
    Ok(true)
}

#[tauri::command]
pub fn rec_window_start(source_id: String, fps: u32) -> Result<String, String> {
    crate::window_rec::start(&source_id, fps)
}

#[tauri::command]
pub async fn rec_window_frame(token: String, timeout_ms: u64) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || crate::window_rec::next_frame(&token, timeout_ms))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn rec_window_stop(token: String) -> bool {
    crate::window_rec::stop(&token);
    true
}

/// Image bytes come as the raw request body; the target goes in headers
/// (`x-path` URI-encoded, `x-format`, `x-quality`).
#[tauri::command]
pub async fn image_export(request: tauri::ipc::Request<'_>) -> Result<u64, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected image bytes.".into());
    };
    let header = |key: &str| {
        request.headers().get(key).and_then(|v| v.to_str().ok()).map(|v| urlencoding::decode(v).map(|s| s.into_owned()).unwrap_or_default()).unwrap_or_default()
    };
    let (path, format) = (header("x-path"), header("x-format"));
    let quality = header("x-quality").parse::<u8>().unwrap_or(90);
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || crate::media::export_image(&bytes, &path, &format, quality))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn image_read_png(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || crate::media::read_as_png(&path)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn rec_gif_start(source_id: String, path: String, fps: u32, max_width: u32) -> Result<String, String> {
    crate::gif_rec::start(&source_id, &path, fps, max_width)
}

#[tauri::command]
pub fn rec_gif_pause(token: String, paused: bool) -> bool {
    crate::gif_rec::set_paused(&token, paused)
}

#[tauri::command]
pub fn rec_gif_gone(token: String) -> bool {
    crate::gif_rec::is_gone(&token)
}

#[tauri::command]
pub async fn rec_gif_stop(token: String, path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || crate::gif_rec::stop(&token, &path)).await.map_err(|e| e.to_string())?
}

/// Installed font families. Used instead of `queryLocalFonts()`, which makes
/// WebView2 show a permission prompt in every dialog window.
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    system_fonts()
}

#[cfg(windows)]
fn system_fonts() -> Vec<String> {
    use std::collections::BTreeSet;
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::Graphics::Gdi::{EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW};

    unsafe extern "system" fn collect(lf: *const LOGFONTW, _tm: *const TEXTMETRICW, _kind: u32, lp: LPARAM) -> i32 {
        let set = &mut *(lp.0 as *mut BTreeSet<String>);
        let face = &(*lf).lfFaceName;
        let len = face.iter().position(|&c| c == 0).unwrap_or(face.len());
        let name = String::from_utf16_lossy(&face[..len]);
        // '@' marks the vertical-writing twin of a CJK font.
        if !name.is_empty() && !name.starts_with('@') {
            set.insert(name);
        }
        1
    }

    let mut set: BTreeSet<String> = BTreeSet::new();
    unsafe {
        let hdc = GetDC(None);
        let mut lf = LOGFONTW::default();
        lf.lfCharSet = DEFAULT_CHARSET;
        EnumFontFamiliesExW(hdc, &lf, Some(collect), LPARAM(&mut set as *mut _ as isize), 0);
        ReleaseDC(None, hdc);
    }
    set.into_iter().collect()
}

#[cfg(not(windows))]
fn system_fonts() -> Vec<String> {
    Vec::new()
}

// Async on purpose: building a webview inside a synchronous (main-thread)
// command deadlocks WebView2 on Windows.
#[tauri::command]
pub async fn dialog_open_window(app: AppHandle, name: String, payload: Value) -> Result<bool, String> {
    dialogs::open_dialog(&app, name, payload)
}

#[tauri::command]
pub fn dialog_get_payload(window: WebviewWindow, state: tauri::State<AppState>) -> Option<Value> {
    let label = window.label().to_string();
    let map = state.dialogs.lock().ok()?;
    map.values().find(|slot| slot.label == label).map(|slot| json!({ "name": slot.name, "payload": slot.payload }))
}

#[tauri::command]
pub fn dialog_update(app: AppHandle, state: tauri::State<AppState>, name: String, payload: Value) -> bool {
    let label = {
        let mut map = match state.dialogs.lock() {
            Ok(m) => m,
            Err(_) => return false,
        };
        let Some(slot) = map.get_mut(&name) else { return false };
        slot.payload = payload.clone();
        slot.label.clone()
    };
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.emit("dialog:payload", payload);
        true
    } else {
        false
    }
}

#[tauri::command]
pub fn dialog_submit(app: AppHandle, state: tauri::State<AppState>, name: String, data: Value, keep_open: Option<bool>) -> bool {
    let keep = keep_open.unwrap_or(false);
    let label = {
        let mut map = match state.dialogs.lock() {
            Ok(m) => m,
            Err(_) => return false,
        };
        let Some(slot) = map.get_mut(&name) else { return false };
        if !keep {
            slot.submitted = true;
        }
        slot.label.clone()
    };
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("dialog:result", json!({ "name": name, "data": data }));
    }
    if !keep {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.close();
        }
    }
    true
}

#[tauri::command]
pub fn dialog_close_window(app: AppHandle, state: tauri::State<AppState>, name: String) -> bool {
    let label = state.dialogs.lock().ok().and_then(|map| map.get(&name).map(|s| s.label.clone()));
    if let Some(label) = label {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.close();
        }
    }
    true
}

#[tauri::command]
pub fn dialog_close_self(window: WebviewWindow) -> bool {
    let _ = window.close();
    true
}

#[tauri::command]
pub fn dialog_ready(window: WebviewWindow) -> bool {
    let _ = window.show();
    let _ = window.set_focus();
    true
}

#[tauri::command]
pub fn dialog_is_open(app: AppHandle, name: String) -> bool {
    let state = app.state::<AppState>();
    state.dialogs.lock().ok().and_then(|map| map.get(&name).map(|s| s.label.clone()))
        .and_then(|label| app.get_webview_window(&label))
        .is_some()
}

#[tauri::command]
pub fn dialog_broadcast_appearance(app: AppHandle, appearance: Value) -> bool {
    for (label, win) in app.webview_windows() {
        if label != "main" {
            let _ = win.emit("dialog:appearance", appearance.clone());
        }
    }
    true
}

#[tauri::command]
/// Sets the dialog's content size (CSS pixels) and re-centres it over the
/// main window (or over its old centre when there is no main window).
pub fn dialog_set_size(app: AppHandle, window: WebviewWindow, width: f64, height: f64) -> bool {
    let scale = window.scale_factor().unwrap_or(1.0);
    let new_w = (width.max(200.0) * scale).round();
    let new_h = (height.max(120.0) * scale).round();
    if let Ok(size) = window.inner_size() {
        if (size.width as f64 - new_w).abs() < 1.0 && (size.height as f64 - new_h).abs() < 1.0 {
            return true;
        }
    }
    let anchor = app
        .get_webview_window("main")
        .filter(|m| m.label() != window.label())
        .and_then(|m| Some((m.outer_position().ok()?, m.outer_size().ok()?)))
        .or_else(|| Some((window.outer_position().ok()?, window.outer_size().ok()?)));
    let _ = window.set_size(tauri::PhysicalSize::new(new_w as u32, new_h as u32));
    if let Some((pos, size)) = anchor {
        let cx = pos.x as f64 + size.width as f64 / 2.0;
        let cy = pos.y as f64 + size.height as f64 / 2.0;
        let _ = window.set_position(tauri::PhysicalPosition::new((cx - new_w / 2.0).round() as i32, (cy - new_h / 2.0).round() as i32));
    }
    true
}

#[tauri::command]
pub fn win_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn win_toggle_maximize(window: WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
pub fn win_close(window: WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
pub fn win_show(window: WebviewWindow) {
    let _ = window.show();
}

#[tauri::command]
pub fn win_is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
pub fn win_set_title(window: WebviewWindow, title: String) -> bool {
    let _ = window.set_title(if title.is_empty() { "CaptureMaster" } else { &title });
    true
}

fn starting_up(state: &AppState) -> bool {
    state.born.elapsed().as_secs() < 4
}

#[tauri::command]
pub fn win_set_min_width(window: WebviewWindow, state: tauri::State<AppState>, width: f64) -> bool {
    let want = width.round();
    if !want.is_finite() || want <= 0.0 {
        return false;
    }
    let min_w = want.clamp(MIN_W, MAX_MIN_W);
    let min_h = state.min_size.lock().ok().map(|s| s.1).unwrap_or(MIN_H);
    if let Ok(mut slot) = state.min_size.lock() {
        slot.0 = min_w;
    }
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(min_w, min_h)));
    if !window.is_maximized().unwrap_or(false) {
        if let Ok((cw, ch)) = logical_size(&window) {
            let restored = state.size_restored.load(Ordering::SeqCst);
            if cw < min_w || (starting_up(&state) && !restored) {
                let _ = window.set_size(tauri::LogicalSize::new(min_w, ch.max(min_h)));
            }
        }
    }
    let _ = window.emit("win:maximized", window.is_maximized().unwrap_or(false));
    true
}

#[tauri::command]
pub fn win_set_min_height(window: WebviewWindow, state: tauri::State<AppState>, height: f64) -> bool {
    let want = height.round();
    if !want.is_finite() || want <= 0.0 {
        return false;
    }
    let min_h = want.clamp(MIN_H, MAX_MIN_H);
    let min_w = state.min_size.lock().ok().map(|s| s.0).unwrap_or(MIN_W);
    if let Ok(mut slot) = state.min_size.lock() {
        slot.1 = min_h;
    }
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(min_w, min_h)));
    if !window.is_maximized().unwrap_or(false) {
        if let Ok((cw, ch)) = logical_size(&window) {
            let restored = state.size_restored.load(Ordering::SeqCst);
            if ch < min_h || (starting_up(&state) && !restored) {
                let _ = window.set_size(tauri::LogicalSize::new(cw.max(min_w), min_h));
            }
        }
    }
    true
}

#[tauri::command]
pub fn win_get_size(window: WebviewWindow, state: tauri::State<AppState>) -> Option<Value> {
    let (width, height) = logical_size(&window).ok()?;
    let (min_width, min_height) = state.min_size.lock().ok().map(|s| *s).unwrap_or((MIN_W, MIN_H));
    let restored = state.size_restored.load(Ordering::SeqCst);
    Some(json!({ "width": width.round(), "height": height.round(), "minWidth": min_width, "minHeight": min_height, "restored": restored }))
}

#[tauri::command]
pub fn win_set_size(window: WebviewWindow, state: tauri::State<AppState>, width: Option<f64>, height: Option<f64>) -> bool {
    if window.is_maximized().unwrap_or(false) {
        return false;
    }
    let (min_w, min_h) = state.min_size.lock().ok().map(|s| *s).unwrap_or((MIN_W, MIN_H));
    let nw = width.unwrap_or(min_w).round().max(min_w);
    let nh = height.unwrap_or(min_h).round().max(min_h);
    window.set_size(tauri::LogicalSize::new(nw, nh)).is_ok()
}

pub fn save_window_state(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    let path = window_state_path(app);
    let mut data = fs::read_to_string(&path).ok().and_then(|text| serde_json::from_str::<Value>(&text).ok()).unwrap_or_else(|| json!({}));
    if !data.is_object() {
        data = json!({});
    }
    let maximized = win.is_maximized().unwrap_or(false);
    // A maximized window reports the screen size; keep the size it had before that.
    if !maximized {
        let scale = win.scale_factor().unwrap_or(1.0).max(0.01);
        if let (Ok(pos), Ok(size)) = (win.outer_position(), win.inner_size()) {
            data["x"] = json!(pos.x as f64 / scale);
            data["y"] = json!(pos.y as f64 / scale);
            data["width"] = json!(size.width as f64 / scale);
            data["height"] = json!(size.height as f64 / scale);
        }
    }
    data["maximized"] = json!(maximized);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, data.to_string());
}

pub fn restore_window_state(app: &AppHandle) {
    let path = window_state_path(app);
    let Ok(text) = fs::read_to_string(path) else { return };
    let Ok(data) = serde_json::from_str::<Value>(&text) else { return };
    let Some(win) = app.get_webview_window("main") else { return };
    let mut restored = false;
    if let (Some(width), Some(height)) = (data.get("width").and_then(|v| v.as_f64()), data.get("height").and_then(|v| v.as_f64())) {
        if (200.0..10000.0).contains(&width) && (200.0..10000.0).contains(&height) {
            let _ = win.set_size(tauri::LogicalSize::new(width.max(MIN_W), height.max(MIN_H)));
            restored = true;
        }
    }
    if let (Some(x), Some(y)) = (data.get("x").and_then(|v| v.as_f64()), data.get("y").and_then(|v| v.as_f64())) {
        if (-4000.0..20000.0).contains(&x) && (-4000.0..20000.0).contains(&y) {
            let _ = win.set_position(tauri::LogicalPosition::new(x, y));
        }
    }
    if data.get("maximized").and_then(|v| v.as_bool()).unwrap_or(false) {
        let _ = win.maximize();
        restored = true;
    }
    app.state::<AppState>().size_restored.store(restored, Ordering::SeqCst);
}

fn current_stamp() -> Value {
    let exe = std::env::current_exe().ok().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let mtime = std::env::current_exe().ok().and_then(|p| fs::metadata(p).ok()).and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    json!({ "exe": exe, "mtime": mtime, "version": env!("CARGO_PKG_VERSION") })
}

fn write_stamp(app: &AppHandle) {
    let path = stamp_path(app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, current_stamp().to_string());
}

pub fn check_reinstall(app: &AppHandle, state: &AppState) {
    let stamp = current_stamp();
    let settings_exist = settings_path(app).exists();
    let previous = fs::read_to_string(stamp_path(app)).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok());
    let changed = match &previous {
        None => true,
        Some(prev) => prev.get("exe") != stamp.get("exe") || prev.get("mtime") != stamp.get("mtime") || prev.get("version") != stamp.get("version"),
    };
    if !cfg!(windows) && !cfg!(debug_assertions) && settings_exist && changed {
        state.pending_install.store(true, std::sync::atomic::Ordering::SeqCst);
    } else {
        write_stamp(app);
    }
}

pub fn pending_file_from_args() -> Option<String> {
    const EXTS: &[&str] = &[".cmcap", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".webm", ".mp4", ".mkv"];
    for arg in std::env::args().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        let lower = arg.to_lowercase();
        if !EXTS.iter().any(|ext| lower.ends_with(ext)) {
            continue;
        }
        let path = PathBuf::from(&arg);
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }
    None
}
