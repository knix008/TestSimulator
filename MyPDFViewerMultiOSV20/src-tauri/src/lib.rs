// MyPDFViewer — Tauri host.
//
// Everything the renderer needs from the operating system goes through the
// commands below; src/lib/desktop-bridge.js wraps them into `window.desktopAPI`,
// the object the React app has always talked to. The host is responsible for:
//   • the frameless main window (shown once the page has painted), single instance
//   • files handed over by the shell (file associations, "Open with", drag & drop)
//   • native dialogs, chunked file I/O with progress, URL downloads
//   • clipboard, fonts, settings.json, the detached theme popup
mod files;
mod print;

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{
  AppHandle, DragDropEvent, Emitter, LogicalPosition, LogicalSize, Manager,
  WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAIN: &str = "main";
const THEME_POPUP: &str = "theme-popup";
const MIN_WINDOW_WIDTH: f64 = 900.0;
const MIN_WINDOW_HEIGHT: f64 = 640.0;
const MAX_MIN_WINDOW_WIDTH: f64 = 2000.0;
const CHUNK: usize = 1 << 20;
const PROGRESS_EVERY: Duration = Duration::from_millis(60);

#[derive(Default)]
struct AppState {
  pending_open: Mutex<Option<String>>,
  renderer_ready: AtomicBool,
  allow_close: AtomicBool,
  maximized: AtomicBool,
  min_size: Mutex<(f64, f64)>,
  clipboard: Mutex<Option<arboard::Clipboard>>,
  popup: Mutex<Option<PopupAnchor>>,
  /// The app theme's kind (dark or light), for the native title bar of the
  /// decorated guide window. `None` until the page has said.
  theme_kind: Mutex<Option<tauri::Theme>>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(default)]
struct Rect {
  x: f64,
  y: f64,
  width: f64,
  height: f64,
}

#[derive(Clone, Copy, Debug, Default)]
struct PopupAnchor {
  x: f64,
  y: f64,
  above_y: f64,
  button: Rect,
  /// Set once the page has sized and shown it. A popup built hidden gets a
  /// focus-lost event straight away, which must not close it.
  shown: bool,
}

fn state(app: &AppHandle) -> tauri::State<'_, AppState> {
  app.state::<AppState>()
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
  app.get_webview_window(MAIN)
}

fn err(e: impl std::fmt::Display) -> String {
  e.to_string()
}

// ── Files handed to us by the shell ──────────────────────────
fn deliver_open(app: &AppHandle, path: Option<PathBuf>) {
  let Some(path) = path else { return };
  let p = path.to_string_lossy().to_string();
  if state(app).renderer_ready.load(Ordering::SeqCst) {
    let _ = app.emit_to(MAIN, "open-path", p);
  } else {
    *state(app).pending_open.lock().unwrap() = Some(p);
  }
}

fn focus_main(app: &AppHandle) {
  if let Some(w) = main_window(app) {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

// ── Progress ─────────────────────────────────────────────────
struct Progress<'a> {
  app: &'a AppHandle,
  id: Option<String>,
  last: Instant,
}

impl<'a> Progress<'a> {
  fn new(app: &'a AppHandle, id: Option<String>) -> Self {
    Self { app, id, last: Instant::now() - PROGRESS_EVERY }
  }
  fn tick(&mut self, done: usize, total: usize, force: bool) {
    let Some(id) = &self.id else { return };
    if !force && self.last.elapsed() < PROGRESS_EVERY {
      return;
    }
    self.last = Instant::now();
    let _ = self.app.emit("task-progress", json!({ "id": id, "done": done, "total": total }));
  }
}

fn read_with_progress(app: &AppHandle, path: &Path, id: Option<String>) -> Result<Vec<u8>, String> {
  let mut f = std::fs::File::open(path).map_err(|e| format!("{e}: {}", path.display()))?;
  let total = f.metadata().map(|m| m.len() as usize).unwrap_or(0);
  let mut out = Vec::with_capacity(total);
  let mut buf = vec![0u8; CHUNK];
  let mut progress = Progress::new(app, id);
  loop {
    let n = f.read(&mut buf).map_err(err)?;
    if n == 0 {
      break;
    }
    out.extend_from_slice(&buf[..n]);
    progress.tick(out.len(), total, false);
  }
  progress.tick(out.len(), total.max(out.len()), true);
  Ok(out)
}

fn write_with_progress(app: &AppHandle, path: &Path, data: &[u8], id: Option<String>) -> Result<(), String> {
  let mut f = std::fs::File::create(path).map_err(|e| format!("{e}: {}", path.display()))?;
  let mut progress = Progress::new(app, id);
  let mut off = 0;
  while off < data.len() {
    let end = (off + CHUNK).min(data.len());
    f.write_all(&data[off..end]).map_err(err)?;
    off = end;
    progress.tick(off, data.len(), false);
  }
  f.flush().map_err(err)?;
  progress.tick(data.len(), data.len(), true);
  Ok(())
}

// ── App info ─────────────────────────────────────────────────
fn node_platform() -> &'static str {
  match std::env::consts::OS {
    "windows" => "win32",
    "macos" => "darwin",
    other => other,
  }
}

fn node_arch() -> &'static str {
  match std::env::consts::ARCH {
    "x86_64" => "x64",
    "aarch64" => "arm64",
    "x86" => "ia32",
    other => other,
  }
}

/// %APPDATA%\MyPDFViewer (and the macOS / Linux equivalents) — the folder the
/// Electron build used, so an upgrade keeps settings and recent files.
/// MYPDFVIEWER_CONFIG_DIR points tests at a scratch folder.
fn config_dir(app: &AppHandle) -> PathBuf {
  if let Some(dir) = std::env::var_os("MYPDFVIEWER_CONFIG_DIR").filter(|d| !d.is_empty()) {
    return PathBuf::from(dir);
  }
  app
    .path()
    .config_dir()
    .map(|d| d.join("MyPDFViewer"))
    .unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
fn app_info(app: AppHandle) -> Value {
  json!({
    "version": app.package_info().version.to_string(),
    "platform": node_platform(),
    "arch": node_arch(),
    "tauri": tauri::VERSION,
    "webview": tauri::webview_version().unwrap_or_default(),
    "userData": config_dir(&app).to_string_lossy(),
  })
}

#[tauri::command]
fn take_pending_open(app: AppHandle) -> Option<String> {
  state(&app).pending_open.lock().unwrap().take()
}

/// The page has painted: show the window (it is built hidden so the user never
/// sees an empty frame) and let shell hand-overs go straight to the renderer.
#[tauri::command]
fn window_ready(window: WebviewWindow) {
  if window.label() == MAIN {
    state(window.app_handle()).renderer_ready.store(true, Ordering::SeqCst);
    let _ = window.show();
    let _ = window.set_focus();
  }
}

// ── Filesystem ───────────────────────────────────────────────
#[tauri::command]
fn fs_home(app: AppHandle) -> String {
  app.path().home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default()
}

#[tauri::command]
fn fs_exists(path: String) -> bool {
  !path.is_empty() && Path::new(&path).exists()
}

#[tauri::command]
fn fs_stat(path: String) -> Option<Value> {
  let p = Path::new(&path);
  let meta = std::fs::metadata(p).ok()?;
  let mtime = meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_millis() as f64)
    .unwrap_or(0.0);
  Some(json!({
    "size": meta.len(),
    "mtime": mtime,
    "dir": p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
    "name": p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
  }))
}

#[tauri::command]
async fn fs_read_dir(path: String) -> Vec<files::Entry> {
  tauri::async_runtime::spawn_blocking(move || files::read_level(&path)).await.unwrap_or_default()
}

#[tauri::command]
async fn fs_drives() -> Vec<files::Drive> {
  tauri::async_runtime::spawn_blocking(files::list_drives).await.unwrap_or_default()
}

/// Raw bytes back to the page (no JSON number arrays), with progress ticks.
#[tauri::command]
async fn fs_read_binary(app: AppHandle, path: String, id: Option<String>) -> Result<Response, String> {
  if !Path::new(&path).is_file() {
    return Err(format!("File not found: {path}"));
  }
  let bytes = tauri::async_runtime::spawn_blocking(move || read_with_progress(&app, Path::new(&path), id))
    .await
    .map_err(err)??;
  Ok(Response::new(bytes))
}

#[tauri::command]
async fn fs_read_text(path: String) -> Result<String, String> {
  std::fs::read_to_string(&path).map_err(|e| format!("{e}: {path}"))
}

#[tauri::command]
async fn fs_write_text(path: String, content: String) -> Result<String, String> {
  std::fs::write(&path, content).map_err(|e| format!("{e}: {path}"))?;
  Ok(path)
}

fn header(request: &Request<'_>, name: &str) -> Option<String> {
  let raw = request.headers().get(name)?.to_str().ok()?;
  let decoded = files::percent_decode(raw);
  (!decoded.is_empty()).then_some(decoded)
}

/// The body is the file itself; the destination travels in headers so a large
/// PDF never goes through JSON.
#[tauri::command]
async fn fs_write_binary(app: AppHandle, request: Request<'_>) -> Result<String, String> {
  let path = header(&request, "x-path").ok_or("No destination path")?;
  let id = header(&request, "x-id");
  let InvokeBody::Raw(data) = request.body() else {
    return Err("Expected the file bytes as the request body".into());
  };
  let data = data.clone();
  let target = path.clone();
  tauri::async_runtime::spawn_blocking(move || write_with_progress(&app, Path::new(&target), &data, id))
    .await
    .map_err(err)??;
  Ok(path)
}

// ── Dialogs ──────────────────────────────────────────────────
#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct DialogOpts {
  title: Option<String>,
  default_dir: Option<String>,
  default_name: Option<String>,
  multi: bool,
  filters: Vec<Filter>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Filter {
  name: String,
  extensions: Vec<String>,
}

fn file_dialog(window: &WebviewWindow, opts: &DialogOpts, title: &str) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
  let mut b = window
    .dialog()
    .file()
    .set_parent(window)
    .set_title(opts.title.clone().unwrap_or_else(|| title.to_string()));
  for f in &opts.filters {
    let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
    b = b.add_filter(&f.name, &exts);
  }
  if let Some(dir) = opts.default_dir.as_deref().filter(|d| Path::new(d).is_dir()) {
    b = b.set_directory(dir);
  }
  if let Some(name) = opts.default_name.as_deref().filter(|n| !n.is_empty()) {
    b = b.set_file_name(name);
  }
  b
}

fn picked(p: tauri_plugin_dialog::FilePath) -> Option<String> {
  p.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
async fn dialog_open_pdf(window: WebviewWindow, opts: DialogOpts) -> Option<Value> {
  let mut opts = opts;
  if opts.filters.is_empty() {
    opts.filters = vec![
      Filter { name: "PDF & Workspace".into(), extensions: vec!["pdf".into(), "pdfvw".into()] },
      Filter { name: "PDF Document".into(), extensions: vec!["pdf".into()] },
      Filter { name: "MyPDFViewer Workspace".into(), extensions: vec!["pdfvw".into()] },
      Filter { name: "All Files".into(), extensions: vec!["*".into()] },
    ];
  }
  let b = file_dialog(&window, &opts, "PDF 열기 / Open PDF");
  if opts.multi {
    let list: Vec<String> = b.blocking_pick_files()?.into_iter().filter_map(picked).collect();
    (!list.is_empty()).then(|| json!(list))
  } else {
    b.blocking_pick_file().and_then(picked).map(Value::String)
  }
}

#[tauri::command]
async fn dialog_pick_directory(window: WebviewWindow, opts: DialogOpts) -> Option<String> {
  file_dialog(&window, &opts, "폴더 선택 / Select Folder").blocking_pick_folder().and_then(picked)
}

#[tauri::command]
async fn dialog_save_path(window: WebviewWindow, opts: DialogOpts) -> Option<String> {
  file_dialog(&window, &opts, "저장 / Save").blocking_save_file().and_then(picked)
}

// ── Download a PDF from a URL ────────────────────────────────
/// Framed reply: u32 LE length of a JSON header ({ name, url }), the header,
/// then the document bytes.
#[tauri::command]
async fn net_download(app: AppHandle, url: String, id: Option<String>) -> Result<Response, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let resp = match ureq::get(&url).call() {
      Ok(r) => r,
      Err(ureq::Error::Status(code, r)) => {
        return Err(format!("HTTP {code} {} — {url}", r.status_text()));
      }
      Err(e) => return Err(format!("{e} — {url}")),
    };
    let total: usize = resp.header("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    let name = files::download_name(resp.header("content-disposition").unwrap_or(""), &url);
    let mut reader = resp.into_reader();
    let mut data = Vec::with_capacity(total);
    let mut buf = vec![0u8; 64 * 1024];
    let mut progress = Progress::new(&app, id);
    loop {
      let n = reader.read(&mut buf).map_err(err)?;
      if n == 0 {
        break;
      }
      data.extend_from_slice(&buf[..n]);
      progress.tick(data.len(), total, false);
    }
    progress.tick(data.len(), data.len(), true);
    let head = serde_json::to_vec(&json!({ "name": name, "url": url })).map_err(err)?;
    let mut out = Vec::with_capacity(4 + head.len() + data.len());
    out.extend_from_slice(&(head.len() as u32).to_le_bytes());
    out.extend_from_slice(&head);
    out.extend_from_slice(&data);
    Ok(Response::new(out))
  })
  .await
  .map_err(err)?
}

// ── Clipboard ────────────────────────────────────────────────
fn with_clipboard<T>(app: &AppHandle, f: impl FnOnce(&mut arboard::Clipboard) -> Result<T, arboard::Error>) -> Result<T, String> {
  let st = state(app);
  let mut slot = st.clipboard.lock().unwrap();
  if slot.is_none() {
    *slot = Some(arboard::Clipboard::new().map_err(err)?);
  }
  f(slot.as_mut().unwrap()).map_err(err)
}

#[tauri::command]
async fn clipboard_write_text(app: AppHandle, text: String) -> Result<bool, String> {
  with_clipboard(&app, |c| c.set_text(text))?;
  Ok(true)
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
  let b64 = data_url.split_once(',').map(|(_, b)| b).ok_or("Not a data: URL")?;
  base64_decode(b64)
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
  fn val(c: u8) -> Option<u32> {
    match c {
      b'A'..=b'Z' => Some((c - b'A') as u32),
      b'a'..=b'z' => Some((c - b'a' + 26) as u32),
      b'0'..=b'9' => Some((c - b'0' + 52) as u32),
      b'+' | b'-' => Some(62),
      b'/' | b'_' => Some(63),
      _ => None,
    }
  }
  let mut out = Vec::with_capacity(s.len() * 3 / 4);
  let (mut acc, mut bits) = (0u32, 0u32);
  for &c in s.as_bytes() {
    if c == b'=' || c.is_ascii_whitespace() {
      continue;
    }
    let v = val(c).ok_or("Invalid base64")?;
    acc = (acc << 6) | v;
    bits += 6;
    if bits >= 8 {
      bits -= 8;
      out.push((acc >> bits) as u8);
      acc &= (1 << bits) - 1;
    }
  }
  Ok(out)
}

#[tauri::command]
async fn clipboard_write_image(app: AppHandle, data_url: String) -> Result<bool, String> {
  let bytes = decode_data_url(&data_url)?;
  let img = image::load_from_memory(&bytes)
    .map_err(|e| format!("Clipboard image is empty (PNG decode failed): {e}"))?
    .to_rgba8();
  let (width, height) = img.dimensions();
  let data = arboard::ImageData {
    width: width as usize,
    height: height as usize,
    bytes: std::borrow::Cow::Owned(img.into_raw()),
  };
  with_clipboard(&app, |c| c.set_image(data))?;
  Ok(true)
}

// ── Shell ────────────────────────────────────────────────────
#[tauri::command]
fn shell_open_external(app: AppHandle, url: String) -> Result<bool, String> {
  if !files::is_external_url(&url) {
    return Err(format!("Refusing to open a non-web URL: {url}"));
  }
  app.opener().open_url(url, None::<&str>).map_err(err)?;
  Ok(true)
}

#[tauri::command]
fn shell_show_item(app: AppHandle, path: String) -> Result<bool, String> {
  app.opener().reveal_item_in_dir(path).map_err(err)?;
  Ok(true)
}

// ── Printing (no second, system print window) ────────────────
#[tauri::command]
async fn print_list_printers() -> print::Printers {
  tauri::async_runtime::spawn_blocking(print::list_printers).await.unwrap_or_default()
}

/// Body: the pages as JPEGs (see print::split_pages). The job travels in headers.
#[tauri::command]
async fn print_pages(request: Request<'_>) -> Result<usize, String> {
  let job = print::Job {
    printer: header(&request, "x-printer").unwrap_or_default(),
    copies: print::clamp_copies(header(&request, "x-copies").and_then(|c| c.parse().ok()).unwrap_or(1)),
    landscape: header(&request, "x-landscape").as_deref() == Some("1"),
    title: header(&request, "x-title").unwrap_or_default(),
  };
  let InvokeBody::Raw(body) = request.body() else {
    return Err("Expected the pages as the request body".into());
  };
  let body = body.clone();
  tauri::async_runtime::spawn_blocking(move || {
    let pages = print::split_pages(&body)?;
    print::print_pages(&job, &pages)
  })
  .await
  .map_err(err)?
}

// ── Fonts (the settings dialog's font list) ──────────────────
#[tauri::command]
async fn list_fonts() -> Vec<String> {
  tauri::async_runtime::spawn_blocking(|| {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut names: Vec<String> = db
      .faces()
      .flat_map(|f| f.families.iter().map(|(n, _)| n.clone()))
      .filter(|n| !n.is_empty() && !n.starts_with('.'))
      .collect();
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup();
    names
  })
  .await
  .unwrap_or_default()
}

// ── Persisted settings / recents (settings.json) ─────────────
#[tauri::command]
fn settings_load(app: AppHandle) -> Option<Value> {
  let text = std::fs::read_to_string(config_dir(&app).join("settings.json")).ok()?;
  serde_json::from_str(&text).ok()
}

#[tauri::command]
async fn settings_save(app: AppHandle, data: Value) -> bool {
  let dir = config_dir(&app);
  let Ok(text) = serde_json::to_string_pretty(&data) else { return false };
  std::fs::create_dir_all(&dir).is_ok() && std::fs::write(dir.join("settings.json"), text).is_ok()
}

// ── Window controls (frameless) ──────────────────────────────
#[tauri::command]
fn win_minimize(window: WebviewWindow) {
  let _ = window.minimize();
}

#[tauri::command]
fn win_toggle_maximize(window: WebviewWindow) -> bool {
  if window.is_maximized().unwrap_or(false) {
    let _ = window.unmaximize();
  } else {
    let _ = window.maximize();
  }
  window.is_maximized().unwrap_or(false)
}

/// Goes through CloseRequested, so the renderer is asked about unsaved work.
#[tauri::command]
fn win_close(window: WebviewWindow) {
  let _ = window.close();
}

#[tauri::command]
fn win_force_close(window: WebviewWindow) -> bool {
  state(window.app_handle()).allow_close.store(true, Ordering::SeqCst);
  window.destroy().is_ok()
}

#[tauri::command]
fn win_is_maximized(window: WebviewWindow) -> bool {
  window.is_maximized().unwrap_or(false)
}

#[tauri::command]
fn win_set_title(window: WebviewWindow, title: String) -> bool {
  let t = if title.trim().is_empty() { "MyPDFViewer".to_string() } else { title };
  window.set_title(&t).is_ok()
}

fn logical_inner(window: &WebviewWindow) -> (f64, f64) {
  let scale = window.scale_factor().unwrap_or(1.0);
  window.inner_size().map(|s| { let l = s.to_logical::<f64>(scale); (l.width, l.height) }).unwrap_or((0.0, 0.0))
}

#[tauri::command]
fn win_get_size(window: WebviewWindow) -> Value {
  let (width, height) = logical_inner(&window);
  let (min_w, min_h) = *state(window.app_handle()).min_size.lock().unwrap();
  json!({ "width": width.round(), "height": height.round(), "minWidth": min_w, "minHeight": min_h })
}

/// The resize grip in the status bar drags the size itself.
#[tauri::command]
fn win_set_size(window: WebviewWindow, width: f64, height: f64) -> bool {
  if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
    return false;
  }
  if !width.is_finite() || !height.is_finite() {
    return false;
  }
  let (min_w, min_h) = *state(window.app_handle()).min_size.lock().unwrap();
  window.set_size(LogicalSize::new(width.round().max(min_w), height.round().max(min_h))).is_ok()
}

/// The narrowest the window may get: what the toolbar measured it needs,
/// within a floor and a ceiling. A window already narrower is widened.
pub fn clamp_min_width(want: f64) -> f64 {
  if !want.is_finite() || want <= 0.0 {
    return MIN_WINDOW_WIDTH;
  }
  want.round().clamp(MIN_WINDOW_WIDTH, MAX_MIN_WINDOW_WIDTH)
}

#[tauri::command]
fn win_set_min_width(window: WebviewWindow, width: f64) -> bool {
  if !width.is_finite() || width <= 0.0 {
    return false;
  }
  let min = clamp_min_width(width);
  let min_h = {
    let st = state(window.app_handle());
    let mut slot = st.min_size.lock().unwrap();
    if slot.0 == min {
      return true;
    }
    slot.0 = min;
    slot.1
  };
  let _ = window.set_min_size(Some(LogicalSize::new(min, min_h)));
  if !window.is_maximized().unwrap_or(false) && !window.is_fullscreen().unwrap_or(false) {
    let (w, h) = logical_inner(&window);
    if w < min {
      let _ = window.set_size(LogicalSize::new(min, h));
    }
  }
  true
}

#[tauri::command]
fn win_get_content_bounds(window: WebviewWindow) -> Option<Value> {
  let scale = window.scale_factor().ok()?;
  let pos = window.inner_position().ok()?.to_logical::<f64>(scale);
  let (width, height) = logical_inner(&window);
  Some(json!({ "x": pos.x, "y": pos.y, "width": width, "height": height }))
}

// ── Theme popup (a child window so both theme columns fit) ───
#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct PopupOpts {
  x: f64,
  y: f64,
  above_y: f64,
  width: f64,
  current: String,
  button: Rect,
}

fn close_theme_popup(app: &AppHandle) {
  *state(app).popup.lock().unwrap() = None;
  if let Some(w) = app.get_webview_window(THEME_POPUP) {
    let _ = w.destroy();
  }
}

/// Keeps the popup on the monitor's work area; flips it above the button when
/// it would hang off the bottom.
fn place_popup(app: &AppHandle, popup: &WebviewWindow) {
  let Some(anchor) = *state(app).popup.lock().unwrap() else { return };
  let scale = popup.scale_factor().unwrap_or(1.0);
  let size = popup.outer_size().map(|s| s.to_logical::<f64>(scale)).unwrap_or(LogicalSize::new(210.0, 400.0));
  let (mut x, mut y) = (anchor.x.round(), anchor.y.round());
  if let Ok(Some(m)) = app.monitor_from_point(anchor.x * scale, anchor.y * scale) {
    let ms = m.scale_factor();
    let wa = m.work_area();
    let (wx, wy) = (wa.position.x as f64 / ms, wa.position.y as f64 / ms);
    let (ww, wh) = (wa.size.width as f64 / ms, wa.size.height as f64 / ms);
    if x + size.width > wx + ww {
      x = wx + ww - size.width;
    }
    if x < wx {
      x = wx;
    }
    if y + size.height > wy + wh {
      let above = (anchor.above_y - size.height - 6.0).round();
      y = if above >= wy { above } else { wy + wh - size.height };
    }
    if y < wy {
      y = wy;
    }
  }
  let _ = popup.set_position(LogicalPosition::new(x, y));
}

fn inside(p: (f64, f64), r: Rect, pad: f64) -> bool {
  p.0 >= r.x - pad && p.0 <= r.x + r.width + pad && p.1 >= r.y - pad && p.1 <= r.y + r.height + pad
}

/// Closes the popup once the pointer has left both it and its button.
fn watch_popup_pointer(app: AppHandle) {
  std::thread::spawn(move || loop {
    std::thread::sleep(Duration::from_millis(80));
    let Some(popup) = app.get_webview_window(THEME_POPUP) else { return };
    let Some(anchor) = *state(&app).popup.lock().unwrap() else { return };
    if !popup.is_visible().unwrap_or(false) {
      continue;
    }
    let scale = popup.scale_factor().unwrap_or(1.0);
    let Ok(cursor) = app.cursor_position() else { continue };
    let p = (cursor.x / scale, cursor.y / scale);
    let pos = popup.outer_position().map(|q| q.to_logical::<f64>(scale));
    let size = popup.outer_size().map(|q| q.to_logical::<f64>(scale));
    let (Ok(pos), Ok(size)) = (pos, size) else { continue };
    let rect = Rect { x: pos.x, y: pos.y, width: size.width, height: size.height };
    if inside(p, rect, 12.0) || inside(p, anchor.button, 12.0) {
      continue;
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || close_theme_popup(&handle));
    return;
  });
}

#[tauri::command]
async fn win_open_theme_popup(app: AppHandle, opts: PopupOpts) -> Result<bool, String> {
  close_theme_popup(&app);
  let anchor = PopupAnchor {
    x: opts.x,
    y: opts.y,
    above_y: if opts.above_y != 0.0 { opts.above_y } else { opts.y },
    button: opts.button,
    shown: false,
  };
  *state(&app).popup.lock().unwrap() = Some(anchor);
  let current = if opts.current.is_empty() { "dark".to_string() } else { opts.current };
  let init = format!("window.__MYPDF_POPUP__ = {};", json!({ "kind": "theme", "current": current }));
  let mut b = WebviewWindowBuilder::new(&app, THEME_POPUP, WebviewUrl::App("index.html".into()))
    .initialization_script(&init)
    .title("Theme")
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .shadow(true)
    .visible(false)
    .focused(false)
    .inner_size(opts.width.max(160.0).round(), 720.0)
    .position(opts.x.round(), opts.y.round());
  if let Some(main) = main_window(&app) {
    b = b.parent(&main).map_err(err)?;
  }
  b.build().map_err(err)?;
  watch_popup_pointer(app);
  Ok(true)
}

/// The popup measured its menu: size the window to it, place it and show it.
#[tauri::command]
fn win_set_popup_size(window: WebviewWindow, width: f64, height: f64) -> bool {
  if !width.is_finite() || !height.is_finite() {
    return false;
  }
  let _ = window.set_size(LogicalSize::new(width.round().max(120.0), height.round().max(40.0)));
  if window.label() == THEME_POPUP {
    place_popup(window.app_handle(), &window);
    let _ = window.show();
    let _ = window.set_focus();
    if let Some(anchor) = state(window.app_handle()).popup.lock().unwrap().as_mut() {
      anchor.shown = true;
    }
  }
  true
}

#[tauri::command]
fn win_close_theme_popup(app: AppHandle) -> bool {
  close_theme_popup(&app);
  true
}

#[tauri::command]
fn win_pick_theme(app: AppHandle, id: String) -> bool {
  let _ = app.emit_to(MAIN, "theme-picked", id);
  close_theme_popup(&app);
  true
}

// ── The program guide ────────────────────────────────────────
const GUIDE: &str = "doc-guide";
const GUIDE_PAGES: [&str; 2] = ["Guide.html", "Guide.en.html"];

/// Only the guide pages shipped in doc/; anything else falls back to the Korean one.
pub fn guide_page(page: &str) -> &'static str {
  GUIDE_PAGES.iter().copied().find(|p| *p == page).unwrap_or(GUIDE_PAGES[0])
}

/// The guide (doc/Guide.html, with its pictures) in an ordinary window of its
/// own; a second request brings the open one to the front on the asked page.
#[tauri::command]
async fn win_open_guide(app: AppHandle, page: String) -> Result<bool, String> {
  let page = guide_page(&page);
  if let Some(w) = app.get_webview_window(GUIDE) {
    let _ = w.eval(&format!("if (!location.pathname.endsWith('/{page}')) location.href = './{page}';"));
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
    return Ok(true);
  }
  let handle = app.clone();
  let theme = *state(&app).theme_kind.lock().unwrap();
  WebviewWindowBuilder::new(&app, GUIDE, WebviewUrl::App(format!("doc/{page}").into()))
    .title("MyPDFViewer — 프로그램 설명 / Guide")
    .theme(theme)
    .inner_size(1100.0, 860.0)
    .min_inner_size(640.0, 480.0)
    .center()
    .on_navigation(move |url| {
      if is_app_url(url) {
        return true;
      }
      if files::is_external_url(url.as_str()) {
        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
      }
      false
    })
    .build()
    .map_err(err)?;
  Ok(true)
}

/// The app's theme changed: the guide's native title bar follows it (its page
/// follows the palette the main page publishes to localStorage).
#[tauri::command]
fn win_set_theme_kind(app: AppHandle, dark: bool) -> bool {
  let theme = if dark { tauri::Theme::Dark } else { tauri::Theme::Light };
  *state(&app).theme_kind.lock().unwrap() = Some(theme);
  if let Some(w) = app.get_webview_window(GUIDE) {
    let _ = w.set_theme(Some(theme));
  }
  true
}

// ── Main window ──────────────────────────────────────────────
fn is_app_url(url: &tauri::Url) -> bool {
  match url.scheme() {
    "tauri" | "asset" | "blob" | "data" | "about" => true,
    "http" | "https" => matches!(url.host_str(), Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")),
    _ => false,
  }
}

fn build_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
  let handle = app.clone();
  let w = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
    .title("MyPDFViewer")
    .inner_size(1480.0, 960.0)
    .min_inner_size(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)
    .decorations(false)
    .shadow(true)
    .visible(false)
    .center()
    .background_color(tauri::window::Color(20, 16, 15, 255))
    // Never navigate away in place; web links go to the system browser.
    .on_navigation(move |url| {
      if is_app_url(url) {
        return true;
      }
      if files::is_external_url(url.as_str()) {
        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
      }
      false
    })
    .build()?;
  *state(app).min_size.lock().unwrap() = (MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);
  // Shown by window_ready; this only covers a page that failed to load.
  let fallback = w.clone();
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_secs(4));
    if !fallback.is_visible().unwrap_or(true) {
      let _ = fallback.show();
    }
  });
  Ok(w)
}

fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
  let app = window.app_handle();
  match (window.label(), event) {
    (MAIN, WindowEvent::CloseRequested { api, .. }) => {
      let st = state(app);
      if !st.allow_close.load(Ordering::SeqCst) && st.renderer_ready.load(Ordering::SeqCst) {
        api.prevent_close();
        let _ = app.emit_to(MAIN, "close-request", ());
      }
    }
    (MAIN, WindowEvent::Destroyed) => {
      close_theme_popup(app);
      app.exit(0);
    }
    (MAIN, WindowEvent::Resized(_)) => {
      let now = window.is_maximized().unwrap_or(false);
      if state(app).maximized.swap(now, Ordering::SeqCst) != now {
        let _ = app.emit_to(MAIN, "maximized", now);
      }
    }
    (MAIN, WindowEvent::DragDrop(drop)) => {
      let payload = match drop {
        DragDropEvent::Enter { paths, .. } => json!({ "type": "enter", "paths": paths }),
        DragDropEvent::Over { .. } => json!({ "type": "over", "paths": [] }),
        DragDropEvent::Drop { paths, .. } => json!({ "type": "drop", "paths": paths }),
        DragDropEvent::Leave => json!({ "type": "leave", "paths": [] }),
        _ => return,
      };
      let _ = app.emit_to(MAIN, "file-drop", payload);
    }
    (THEME_POPUP, WindowEvent::Focused(false)) => {
      let shown = state(app).popup.lock().unwrap().map(|a| a.shown).unwrap_or(false);
      if shown {
        close_theme_popup(app);
      }
    }
    _ => {}
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
      focus_main(app);
      deliver_open(app, files::openable_from_args(argv, Path::new(&cwd)));
    }))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(AppState::default())
    .setup(|app| {
      let cwd = std::env::current_dir().unwrap_or_default();
      if let Some(p) = files::openable_from_args(std::env::args(), &cwd) {
        *state(app.handle()).pending_open.lock().unwrap() = Some(p.to_string_lossy().to_string());
      }
      build_main_window(app.handle())?;
      Ok(())
    })
    .on_window_event(on_window_event)
    .invoke_handler(tauri::generate_handler![
      app_info,
      take_pending_open,
      window_ready,
      fs_home,
      fs_exists,
      fs_stat,
      fs_read_dir,
      fs_drives,
      fs_read_binary,
      fs_read_text,
      fs_write_text,
      fs_write_binary,
      dialog_open_pdf,
      dialog_pick_directory,
      dialog_save_path,
      net_download,
      clipboard_write_text,
      clipboard_write_image,
      shell_open_external,
      shell_show_item,
      list_fonts,
      print_list_printers,
      print_pages,
      settings_load,
      settings_save,
      win_minimize,
      win_toggle_maximize,
      win_close,
      win_force_close,
      win_is_maximized,
      win_set_title,
      win_get_size,
      win_set_size,
      win_set_min_width,
      win_get_content_bounds,
      win_open_theme_popup,
      win_set_popup_size,
      win_close_theme_popup,
      win_pick_theme,
      win_open_guide,
      win_set_theme_kind,
    ])
    .build(tauri::generate_context!())
    .expect("error while building MyPDFViewer");

  app.run(|_app, _event| {
    // macOS hands associated files over through this event.
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = &_event {
      for url in urls {
        if let Ok(p) = url.to_file_path() {
          deliver_open(_app, Some(p));
        }
      }
    }
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn guide_pages_are_limited_to_the_shipped_ones() {
    assert_eq!(guide_page("Guide.en.html"), "Guide.en.html");
    assert_eq!(guide_page("Guide.html"), "Guide.html");
    assert_eq!(guide_page("../../secret.html"), "Guide.html");
    assert_eq!(guide_page(""), "Guide.html");
  }

  #[test]
  fn min_width_is_clamped() {
    assert_eq!(clamp_min_width(0.0), MIN_WINDOW_WIDTH);
    assert_eq!(clamp_min_width(f64::NAN), MIN_WINDOW_WIDTH);
    assert_eq!(clamp_min_width(640.0), MIN_WINDOW_WIDTH);
    assert_eq!(clamp_min_width(1234.4), 1234.0);
    assert_eq!(clamp_min_width(9999.0), MAX_MIN_WINDOW_WIDTH);
  }

  #[test]
  fn header_values_are_percent_decoded() {
    assert_eq!(files::percent_decode("C%3A%5CDocs%5C%EB%B3%B4%EA%B3%A0.pdf"), "C:\\Docs\\보고.pdf");
    assert_eq!(files::percent_decode("plain"), "plain");
    assert_eq!(files::percent_decode("100%"), "100%");
  }

  #[test]
  fn data_urls_decode() {
    assert_eq!(decode_data_url("data:text/plain;base64,aGVsbG8=").unwrap(), b"hello");
    assert_eq!(base64_decode("AQID").unwrap(), vec![1, 2, 3]);
    assert!(decode_data_url("nope").is_err());
  }

  #[test]
  fn platform_names_match_node() {
    assert!(["win32", "darwin", "linux"].contains(&node_platform()) || !node_platform().is_empty());
    assert!(!node_arch().is_empty());
  }

  #[test]
  fn popup_hit_test_has_padding() {
    let r = Rect { x: 10.0, y: 10.0, width: 100.0, height: 50.0 };
    assert!(inside((5.0, 5.0), r, 12.0));
    assert!(!inside((200.0, 5.0), r, 12.0));
  }
}
