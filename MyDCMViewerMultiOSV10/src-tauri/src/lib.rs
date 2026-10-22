// MyDCMViewer — Tauri host.
//
// The page (src/index.html, plain scripts) does all DICOM decoding, drawing and
// encoding. Everything it needs from the operating system goes through the
// commands below; src/js/desktop-bridge.js wraps them into `window.desktopAPI`,
// the object src/js/platform.js talks to. The host owns:
//   • the main window (shown once the page has drawn), single instance, window bounds
//   • files handed over by the shell (file associations, "Open with", drag & drop)
//   • native file / message dialogs, file I/O, the Recycle Bin, folder watching
//   • the popup windows every dialog opens in (owned by the main window)
//   • the menu overlay: drop-down and context menus drawn past the main window's edges (src/menu.html)
//   • clipboard pictures, printing straight to a printer, settings.json
//   • raw TCP sockets for DICOM networking (the protocol itself is src/js/dicomNet.js)
mod files;
mod net;
mod print;
mod window_icon;

use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{
  AppHandle, DragDropEvent, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
  WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

pub const MAIN: &str = "main";
pub const POPUP_PREFIX: &str = "popup-";
const MENU_OVERLAY: &str = "menu-overlay";
const APP_NAME: &str = "MyDCMViewer";
const MIN_WIDTH: f64 = 900.0;
const MIN_HEIGHT: f64 = 600.0;

struct Watch {
  _watcher: notify::RecommendedWatcher,
}

#[derive(Default)]
struct Popup {
  init: Option<Value>,
  positioned: bool,
}

/// The menu overlay window: the message for the menu that is open now (None = closed), and a serial so a
/// late "drawn" report of a menu that was already closed again does not show the window.
#[derive(Default)]
struct MenuState {
  open: Mutex<Option<Value>>,
  serial: AtomicU64,
}

struct AppState {
  config_dir: PathBuf,
  settings: Mutex<Value>,
  pending_open: Mutex<Vec<String>>,
  renderer_ready: AtomicBool,
  clipboard: Mutex<Option<arboard::Clipboard>>,
  popups: Mutex<HashMap<String, Popup>>,
  watchers: Mutex<HashMap<String, Watch>>,
  bounds: Mutex<Option<Value>>,
}

fn state(app: &AppHandle) -> tauri::State<'_, AppState> {
  app.state::<AppState>()
}

fn err(e: impl std::fmt::Display) -> String {
  e.to_string()
}

pub fn node_platform() -> &'static str {
  if cfg!(windows) {
    "win32"
  } else if cfg!(target_os = "macos") {
    "darwin"
  } else {
    "linux"
  }
}

pub fn node_arch() -> &'static str {
  match std::env::consts::ARCH {
    "x86_64" => "x64",
    "aarch64" => "arm64",
    "x86" => "ia32",
    other => other,
  }
}

// ── Settings ─────────────────────────────────────────────────
/// %APPDATA%\MyDCMViewer (Windows), ~/Library/Application Support/MyDCMViewer (macOS),
/// ~/.config/MyDCMViewer (Linux). MYDCMVIEWER_CONFIG_DIR points tests at a scratch folder.
fn config_dir() -> PathBuf {
  if let Some(over) = std::env::var_os("MYDCMVIEWER_CONFIG_DIR") {
    return PathBuf::from(over);
  }
  let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
  let base = if cfg!(windows) {
    std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Roaming"))
  } else if cfg!(target_os = "macos") {
    home.join("Library").join("Application Support")
  } else {
    std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".config"))
  };
  base.join(APP_NAME)
}

fn settings_file(dir: &Path) -> PathBuf {
  dir.join("settings.json")
}

pub fn load_settings(dir: &Path) -> Value {
  std::fs::read_to_string(settings_file(dir))
    .ok()
    .and_then(|t| serde_json::from_str::<Value>(&t).ok())
    .filter(|v| v.is_object())
    .unwrap_or_else(|| Value::Object(Map::new()))
}

/// Shallow merge of `patch` into `base` (both objects); `null` removes a key.
pub fn merge_settings(base: &mut Value, patch: &Value) {
  let (Some(b), Some(p)) = (base.as_object_mut(), patch.as_object()) else { return };
  for (k, v) in p {
    if v.is_null() {
      b.remove(k);
    } else {
      b.insert(k.clone(), v.clone());
    }
  }
}

fn save_settings(app: &AppHandle) {
  let st = state(app);
  let text = serde_json::to_string_pretty(&*st.settings.lock().unwrap()).unwrap_or_else(|_| "{}".into());
  if let Err(e) = files::write_atomic(&settings_file(&st.config_dir), text.as_bytes()) {
    eprintln!("[settings] {e}");
  }
}

fn setting_str(app: &AppHandle, key: &str) -> Option<String> {
  state(app).settings.lock().unwrap().get(key).and_then(|v| v.as_str()).map(str::to_string)
}

/// The theme's background, saved by the page, so a window never flashes another colour.
pub fn theme_rgb(hex: Option<&str>) -> (u8, u8, u8) {
  let h = hex.unwrap_or("#111318").trim().trim_start_matches('#');
  if h.len() != 6 {
    return (0x11, 0x13, 0x18);
  }
  u32::from_str_radix(h, 16)
    .map(|n| (((n >> 16) & 0xff) as u8, ((n >> 8) & 0xff) as u8, (n & 0xff) as u8))
    .unwrap_or((0x11, 0x13, 0x18))
}

fn theme_kind(app: &AppHandle) -> tauri::Theme {
  if setting_str(app, "themeScheme").as_deref() == Some("light") {
    tauri::Theme::Light
  } else {
    tauri::Theme::Dark
  }
}

/// Every webview of this profile must start with identical browser arguments, or
/// the second one fails to be created. MYDCMVIEWER_DEBUG_PORT opens CDP for the GUI tests.
fn browser_args() -> Option<String> {
  let port = std::env::var("MYDCMVIEWER_DEBUG_PORT").ok().filter(|p| p.parse::<u16>().is_ok())?;
  Some(format!("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={port}"))
}

fn webview_data_dir() -> Option<PathBuf> {
  std::env::var_os("MYDCMVIEWER_CONFIG_DIR").map(|d| PathBuf::from(d).join("webview"))
}

fn is_app_url(url: &tauri::Url) -> bool {
  match url.scheme() {
    "tauri" | "asset" | "blob" | "data" | "about" => true,
    "http" | "https" => matches!(url.host_str(), Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")),
    _ => false,
  }
}

// ── Files handed over by the shell ───────────────────────────
fn deliver_open(app: &AppHandle, paths: Vec<String>) {
  if paths.is_empty() {
    return;
  }
  let st = state(app);
  if st.renderer_ready.load(Ordering::SeqCst) {
    for p in paths {
      let _ = app.emit_to(MAIN, "open-path", p);
    }
  } else {
    st.pending_open.lock().unwrap().extend(paths);
  }
}

fn focus_main(app: &AppHandle) {
  if let Some(w) = app.get_webview_window(MAIN) {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

// ── App / settings commands ──────────────────────────────────
#[tauri::command]
fn app_info(app: AppHandle) -> Value {
  let pkg = app.package_info();
  json!({
    "name": APP_NAME,
    "version": pkg.version.to_string(),
    "description": "DICOM and medical image viewer",
    "author": "SHKWON <knix008@naver.com>",
    "tauri": tauri::VERSION,
    "webview": tauri::webview_version().ok(),
    "platform": node_platform(),
    "arch": node_arch(),
    "packaged": !cfg!(debug_assertions),
    "userData": state(&app).config_dir.to_string_lossy(),
  })
}

#[tauri::command]
fn settings_get(app: AppHandle) -> Value {
  state(&app).settings.lock().unwrap().clone()
}

#[tauri::command]
fn settings_set(app: AppHandle, patch: Value) -> Value {
  let merged = {
    let st = state(&app);
    let mut s = st.settings.lock().unwrap();
    merge_settings(&mut s, &patch);
    s.clone()
  };
  save_settings(&app);
  if patch.get("themeScheme").is_some() {
    let kind = theme_kind(&app);
    for (_, w) in app.webview_windows() {
      let _ = w.set_theme(Some(kind));
    }
  }
  merged
}

/// Where the open dialogs start: the last folder, else Pictures, else home.
#[tauri::command]
fn default_dir(app: AppHandle) -> String {
  if let Some(d) = setting_str(&app, "lastDir").filter(|d| Path::new(d).is_dir()) {
    return d;
  }
  if let Ok(p) = app.path().picture_dir() {
    if p.is_dir() {
      return p.to_string_lossy().to_string();
    }
  }
  home_dir(app)
}

#[tauri::command]
fn home_dir(app: AppHandle) -> String {
  app.path().home_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| ".".into())
}

/// The DICOM samples shipped with the app (the start page's sample cards).
#[tauri::command]
fn samples_dir(app: AppHandle) -> Option<String> {
  let dir = if cfg!(debug_assertions) {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("samples")
  } else {
    app.path().resource_dir().ok()?.join("samples")
  };
  let dir = files::plain(&dir);
  dir.is_dir().then(|| dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn list_drives() -> Vec<String> {
  files::list_drives()
}

// ── File system ──────────────────────────────────────────────
#[tauri::command]
async fn fs_read_dir(path: String) -> Result<Vec<files::Entry>, String> {
  files::read_level(&path)
}

#[tauri::command]
async fn fs_stat(path: String) -> files::Stat {
  files::stat(&path)
}

#[tauri::command]
async fn fs_read_file(path: String) -> Result<Response, String> {
  std::fs::read(&path).map(Response::new).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
async fn fs_read_head(path: String, n: usize) -> Result<Response, String> {
  files::read_head(&path, n.min(64 << 20)).map(Response::new)
}

pub fn header(request: &Request<'_>, name: &str) -> Option<String> {
  let raw = request.headers().get(name)?.to_str().ok()?;
  Some(percent_decode(raw))
}

/// %XX escapes (encodeURIComponent on the page side) back to UTF-8.
pub fn percent_decode(s: &str) -> String {
  let b = s.as_bytes();
  let mut out = Vec::with_capacity(b.len());
  let mut i = 0;
  while i < b.len() {
    if b[i] == b'%' && i + 2 < b.len() {
      if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
        out.push(v);
        i += 3;
        continue;
      }
    }
    out.push(b[i]);
    i += 1;
  }
  String::from_utf8_lossy(&out).to_string()
}

fn raw_body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
  match request.body() {
    InvokeBody::Raw(bytes) => Ok(bytes.as_slice()),
    _ => Err("Expected binary data".into()),
  }
}

#[tauri::command]
async fn fs_write_file(request: Request<'_>) -> Result<String, String> {
  let path = header(&request, "x-path").filter(|p| !p.is_empty()).ok_or("No file name was given")?;
  files::write_atomic(Path::new(&path), raw_body(&request)?)?;
  Ok(path)
}

#[tauri::command]
async fn fs_mkdir(path: String) -> Result<String, String> {
  std::fs::create_dir_all(&path).map_err(|e| format!("{path}: {e}"))?;
  Ok(path)
}

#[tauri::command]
async fn fs_unique_dir(base: String) -> Result<String, String> {
  files::unique_dir(&base)
}

#[tauri::command]
async fn fs_trash(path: String) -> Result<bool, String> {
  trash::delete(&path).map_err(|e| format!("{path}: {e}"))?;
  Ok(true)
}

#[tauri::command]
async fn fs_copy_into(sources: Vec<String>, dest_dir: String, moving: bool) -> Vec<files::CopyResult> {
  files::copy_into(&sources, &dest_dir, moving)
}

#[tauri::command]
fn shell_show_item(app: AppHandle, path: String) -> Result<bool, String> {
  app.opener().reveal_item_in_dir(&path).map_err(err)?;
  Ok(true)
}

#[tauri::command]
fn shell_open_external(app: AppHandle, url: String) -> Result<bool, String> {
  if !files::is_external_url(&url) {
    return Err("Only web links can be opened".into());
  }
  app.opener().open_url(url, None::<&str>).map_err(err)?;
  Ok(true)
}

/// Re-read the open folder shortly after the last change inside it.
#[tauri::command]
fn watch_dir(app: AppHandle, dir: String) -> bool {
  use notify::{RecursiveMode, Watcher};
  let st = state(&app);
  let mut map = st.watchers.lock().unwrap();
  if map.contains_key(&dir) {
    return true;
  }
  let generation = Arc::new(AtomicU64::new(0));
  let (handle, name) = (app.clone(), dir.clone());
  let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
    let Ok(ev) = res else { return };
    if matches!(ev.kind, notify::EventKind::Access(_)) {
      return;
    }
    let mine = generation.fetch_add(1, Ordering::SeqCst) + 1;
    let (gen, handle, name) = (generation.clone(), handle.clone(), name.clone());
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_millis(300));
      if gen.load(Ordering::SeqCst) == mine {
        let _ = handle.emit_to(MAIN, "dir-changed", name);
      }
    });
  });
  let Ok(mut watcher) = watcher else { return false };
  if watcher.watch(Path::new(&dir), RecursiveMode::NonRecursive).is_err() {
    return false;
  }
  map.insert(dir, Watch { _watcher: watcher });
  true
}

#[tauri::command]
fn unwatch_dir(app: AppHandle, dir: String) -> bool {
  state(&app).watchers.lock().unwrap().remove(&dir);
  true
}

// ── Dialogs ──────────────────────────────────────────────────
#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct DialogOpts {
  default_path: Option<String>,
  multiple: bool,
  filters: Vec<Filter>,
  title: Option<String>,
}

#[derive(Deserialize, Default, Clone)]
#[serde(default)]
struct Filter {
  name: String,
  extensions: Vec<String>,
}

// ── Test hooks (GUI tests only; never set in normal use) ─────
// MYDCMVIEWER_TEST_SAVE_DIR    save dialogs answer <dir>/<suggested name> without showing
// MYDCMVIEWER_TEST_OPEN        open-file dialogs answer this path (several: separated by '|')
// MYDCMVIEWER_TEST_FOLDER      open-folder dialogs answer this folder
// MYDCMVIEWER_TEST_ANSWER      message boxes answer this button index
// MYDCMVIEWER_TEST_PRINT_DIR   printing writes the pages there as JPEG files instead of using a printer
fn test_env(name: &str) -> Option<String> {
  std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

pub fn test_save_path(dir: &str, suggested: &str) -> String {
  let name = Path::new(suggested).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "export.bin".into());
  files::free_name(Path::new(dir), &name).to_string_lossy().to_string()
}

const OPEN_EXTS: [&str; 24] = [
  "dcm", "dicm", "dicom", "dic", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "ico", "svg", "avif", "heic", "heif", "hif",
  "jp2", "j2k", "jpc", "jpx", "j2c", "zip",
];

fn picked(p: tauri_plugin_dialog::FilePath) -> Option<String> {
  p.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
async fn dialog_open_file(app: AppHandle, window: WebviewWindow, opts: DialogOpts) -> Vec<String> {
  if let Some(v) = test_env("MYDCMVIEWER_TEST_OPEN") {
    return v.split('|').map(str::to_string).collect();
  }
  let start = opts.default_path.clone().unwrap_or_else(|| default_dir(app.clone()));
  let ko = setting_str(&app, "lang").as_deref() != Some("en");
  let mut d = app
    .dialog()
    .file()
    .set_parent(&window)
    .set_directory(&start)
    .add_filter(if ko { "지원하는 모든 파일" } else { "All supported" }, &OPEN_EXTS)
    .add_filter("DICOM", &OPEN_EXTS[..4])
    .add_filter(if ko { "그림" } else { "Images" }, &OPEN_EXTS[4..23])
    .add_filter("ZIP", &OPEN_EXTS[23..])
    .add_filter(if ko { "모든 파일" } else { "All files" }, &["*"]);
  if let Some(t) = &opts.title {
    d = d.set_title(t);
  }
  if opts.multiple {
    d.blocking_pick_files().unwrap_or_default().into_iter().filter_map(picked).collect()
  } else {
    d.blocking_pick_file().and_then(picked).into_iter().collect()
  }
}

#[tauri::command]
async fn dialog_open_folder(app: AppHandle, window: WebviewWindow, opts: DialogOpts) -> Option<String> {
  if let Some(v) = test_env("MYDCMVIEWER_TEST_FOLDER") {
    return Some(v);
  }
  let start = opts.default_path.clone().unwrap_or_else(|| default_dir(app.clone()));
  app.dialog().file().set_parent(&window).set_directory(&start).blocking_pick_folder().and_then(picked)
}

#[tauri::command]
async fn dialog_save(app: AppHandle, window: WebviewWindow, opts: DialogOpts) -> Option<String> {
  if let Some(dir) = test_env("MYDCMVIEWER_TEST_SAVE_DIR") {
    let _ = std::fs::create_dir_all(&dir);
    return Some(test_save_path(&dir, opts.default_path.as_deref().unwrap_or("export.bin")));
  }
  let mut d = app.dialog().file().set_parent(&window);
  if let Some(p) = opts.default_path.as_deref().filter(|p| !p.is_empty()) {
    let path = Path::new(p);
    if path.is_absolute() {
      if let Some(dir) = path.parent() {
        d = d.set_directory(dir);
      }
      if let Some(name) = path.file_name() {
        d = d.set_file_name(name.to_string_lossy());
      }
    } else {
      d = d.set_directory(default_dir(app.clone())).set_file_name(p);
    }
  }
  for f in opts.filters.iter().filter(|f| !f.extensions.is_empty()) {
    let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
    d = d.add_filter(&f.name, &exts);
  }
  let out = d.blocking_save_file().and_then(picked)?;
  if let Some(dir) = Path::new(&out).parent() {
    let st = state(&app);
    let mut s = st.settings.lock().unwrap();
    merge_settings(&mut s, &json!({ "lastSaveDir": dir.to_string_lossy() }));
  }
  Some(out)
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct MessageOpts {
  r#type: Option<String>,
  title: Option<String>,
  message: String,
  detail: Option<String>,
  buttons: Vec<String>,
}

/// Returns the index of the button pressed (the last one when the box is closed).
#[tauri::command]
async fn dialog_message(app: AppHandle, window: WebviewWindow, opts: MessageOpts) -> i32 {
  if let Some(v) = test_env("MYDCMVIEWER_TEST_ANSWER") {
    return v.parse().unwrap_or(0);
  }
  let text = match &opts.detail {
    Some(d) if !d.is_empty() => format!("{}\n\n{d}", opts.message),
    _ => opts.message.clone(),
  };
  let kind = match opts.r#type.as_deref() {
    Some("error") => MessageDialogKind::Error,
    Some("warning") | Some("question") => MessageDialogKind::Warning,
    _ => MessageDialogKind::Info,
  };
  let d = app.dialog().message(text).title(opts.title.unwrap_or_else(|| APP_NAME.into())).kind(kind).parent(&window);
  match opts.buttons.len() {
    0 | 1 => {
      let label = opts.buttons.first().cloned().unwrap_or_else(|| "OK".into());
      d.buttons(MessageDialogButtons::OkCustom(label)).blocking_show();
      0
    }
    _ => {
      let ok = d.buttons(MessageDialogButtons::OkCancelCustom(opts.buttons[0].clone(), opts.buttons[1].clone())).blocking_show();
      if ok { 0 } else { (opts.buttons.len() - 1) as i32 }
    }
  }
}

// ── Window ───────────────────────────────────────────────────
#[tauri::command]
fn window_ready(app: AppHandle, window: WebviewWindow) -> Vec<String> {
  if window.label() != MAIN {
    return Vec::new();
  }
  let st = state(&app);
  st.renderer_ready.store(true, Ordering::SeqCst);
  if !window.is_visible().unwrap_or(true) {
    let _ = window.show();
    let _ = window.set_focus();
  }
  let pending = std::mem::take(&mut *st.pending_open.lock().unwrap());
  let handle = app.clone();
  tauri::async_runtime::spawn(async move {
    let _ = menu_overlay(&handle);
  });
  pending
}

// ── Menu overlay: a page cannot draw outside its window, so open menus are drawn by a transparent window that
// covers the monitor's work area and never takes the focus (src/menu.html, src/js/menu-overlay.js). ──
fn menu_overlay(app: &AppHandle) -> Result<WebviewWindow, String> {
  if let Some(w) = app.get_webview_window(MENU_OVERLAY) {
    return Ok(w);
  }
  let mut builder = WebviewWindowBuilder::new(app, MENU_OVERLAY, WebviewUrl::App("menu.html".into()))
    .title(APP_NAME)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .skip_taskbar(true)
    .focusable(false)
    .focused(false)
    .visible(false)
    .inner_size(16.0, 16.0)
    .on_navigation(|url| is_app_url(url));
  if let Some(main) = app.get_webview_window(MAIN) {
    builder = builder.parent(&main).map_err(err)?;
  }
  if let Some(args) = browser_args() {
    builder = builder.additional_browser_args(&args);
  }
  if let Some(dir) = webview_data_dir() {
    builder = builder.data_directory(dir);
  }
  builder.build().map_err(err)
}

/// Show a menu: `payload` is the panel's markup and its place in the main window (CSS px of the main window).
#[tauri::command]
async fn menu_open(app: AppHandle, payload: Value) -> Result<u64, String> {
  let main = app.get_webview_window(MAIN).ok_or("No main window")?;
  let overlay = menu_overlay(&app)?;
  let scale = main.scale_factor().unwrap_or(1.0);
  let inner = main.inner_position().map_err(err)?;
  let (pos, size) = match main.current_monitor() {
    Ok(Some(m)) => (m.work_area().position, m.work_area().size),
    _ => (main.outer_position().map_err(err)?, main.outer_size().map_err(err)?),
  };
  let _ = overlay.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
  let _ = overlay.set_size(tauri::PhysicalSize::new(size.width, size.height));
  let st = app.state::<MenuState>();
  let serial = st.serial.fetch_add(1, Ordering::SeqCst) + 1;
  let msg = json!({
    "serial": serial,
    "payload": payload,
    "offset": { "x": f64::from(inner.x - pos.x) / scale, "y": f64::from(inner.y - pos.y) / scale },
  });
  *st.open.lock().unwrap() = Some(msg.clone());
  let _ = app.emit_to(MENU_OVERLAY, "menu-open", msg);
  Ok(serial)
}

/// The overlay has drawn menu `serial`: show it, unless that menu was closed meanwhile.
#[tauri::command]
fn menu_shown(app: AppHandle, serial: u64) -> bool {
  let st = app.state::<MenuState>();
  let current = st.open.lock().unwrap().as_ref().and_then(|m| m.get("serial")).and_then(|v| v.as_u64());
  if current != Some(serial) {
    return false;
  }
  if let Some(w) = app.get_webview_window(MENU_OVERLAY) {
    show_native(&w, true);
  }
  true
}

/// Show() activates the window, which takes the focus from the main window (its blur closes context menus,
/// and keys would go to the overlay). The overlay is shown the way native menus are: without activation.
/// Hidden the same way: tao does not see a window shown behind its back, so its hide() would do nothing and
/// leave an invisible window over the whole screen that swallows every click.
fn show_native(w: &WebviewWindow, visible: bool) {
  #[cfg(windows)]
  {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    #[link(name = "user32")]
    extern "system" {
      fn ShowWindow(hwnd: isize, cmd: i32) -> i32;
    }
    const SW_HIDE: i32 = 0;
    const SW_SHOWNOACTIVATE: i32 = 4;
    if let Ok(handle) = w.window_handle() {
      if let RawWindowHandle::Win32(raw) = handle.as_raw() {
        unsafe { ShowWindow(raw.hwnd.get() as isize, if visible { SW_SHOWNOACTIVATE } else { SW_HIDE }) };
        return;
      }
    }
  }
  let _ = if visible { w.show() } else { w.hide() };
}

#[tauri::command]
fn menu_close(app: AppHandle) -> bool {
  let st = app.state::<MenuState>();
  st.serial.fetch_add(1, Ordering::SeqCst);
  let was = st.open.lock().unwrap().take().is_some();
  if let Some(w) = app.get_webview_window(MENU_OVERLAY) {
    show_native(&w, false);
    let _ = app.emit_to(MENU_OVERLAY, "menu-close", Value::Null);
  }
  was
}

/// The overlay page has loaded: the menu opened while it was loading, if any.
#[tauri::command]
fn menu_overlay_ready(app: AppHandle) -> Option<Value> {
  app.state::<MenuState>().open.lock().unwrap().clone()
}

/// What the user did in the overlay (pick / title / dismiss) goes to the main page, which owns the menus.
#[tauri::command]
fn menu_event(app: AppHandle, data: Value) -> bool {
  app.emit_to(MAIN, "menu-event", data).is_ok()
}

/// Whether the overlay window is on screen (Win32 state: tao does not track the native show/hide). The GUI
/// tests use it: an overlay left visible after its menu closed covers the screen and swallows every click.
#[tauri::command]
fn menu_visible(app: AppHandle) -> bool {
  let Some(w) = app.get_webview_window(MENU_OVERLAY) else {
    return false;
  };
  #[cfg(windows)]
  {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    #[link(name = "user32")]
    extern "system" {
      fn IsWindowVisible(hwnd: isize) -> i32;
    }
    if let Ok(handle) = w.window_handle() {
      if let RawWindowHandle::Win32(raw) = handle.as_raw() {
        return unsafe { IsWindowVisible(raw.hwnd.get() as isize) } != 0;
      }
    }
  }
  w.is_visible().unwrap_or(false)
}

fn menu_is_open(app: &AppHandle) -> bool {
  app.try_state::<MenuState>().map(|st| st.open.lock().unwrap().is_some()).unwrap_or(false)
}

#[tauri::command]
fn win_toggle_fullscreen(window: WebviewWindow) -> bool {
  let next = !window.is_fullscreen().unwrap_or(false);
  let _ = window.set_fullscreen(next);
  next
}

/// The resize grip in the bottom-right corner: a native resize drag from that corner.
#[tauri::command]
fn win_start_resize(window: tauri::Window) -> bool {
  window.start_resize_dragging(tauri_runtime::ResizeDirection::SouthEast).is_ok()
}

#[tauri::command]
fn win_set_min_size(window: WebviewWindow, width: f64, height: f64) -> bool {
  let w = width.clamp(MIN_WIDTH, 2400.0);
  let h = height.clamp(MIN_HEIGHT, 1600.0);
  let _ = window.set_min_size(Some(LogicalSize::new(w, h)));
  let scale = window.scale_factor().unwrap_or(1.0);
  if let Ok(size) = window.inner_size() {
    let cur = size.to_logical::<f64>(scale);
    if !window.is_maximized().unwrap_or(false) && (cur.width < w || cur.height < h) {
      let _ = window.set_size(LogicalSize::new(cur.width.max(w), cur.height.max(h)));
    }
  }
  true
}

#[tauri::command]
fn win_toggle_devtools(window: WebviewWindow) {
  if window.is_devtools_open() {
    window.close_devtools();
  } else {
    window.open_devtools();
  }
}

#[tauri::command]
fn win_set_title(window: WebviewWindow, title: String) {
  let _ = window.set_title(&title);
}

#[tauri::command]
fn win_close(window: WebviewWindow) {
  let _ = window.close();
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

/// RGBA pixels straight from the canvas (x-width / x-height headers).
#[tauri::command]
async fn clipboard_write_image(app: AppHandle, request: Request<'_>) -> Result<bool, String> {
  let width: usize = header(&request, "x-width").and_then(|v| v.parse().ok()).ok_or("No width")?;
  let height: usize = header(&request, "x-height").and_then(|v| v.parse().ok()).ok_or("No height")?;
  let bytes = raw_body(&request)?;
  if width == 0 || height == 0 || bytes.len() != width * height * 4 {
    return Err("The picture data does not match its size".into());
  }
  let img = arboard::ImageData { width, height, bytes: std::borrow::Cow::Borrowed(bytes) };
  with_clipboard(&app, |c| c.set_image(img))?;
  Ok(true)
}

// ── Printing ─────────────────────────────────────────────────
#[tauri::command]
async fn print_list_printers() -> print::Printers {
  print::list_printers()
}

/// Pages as JPEGs (u32 count, u32 lengths, data). An empty x-printer means the default printer.
#[tauri::command]
async fn print_pages(request: Request<'_>) -> Result<usize, String> {
  let pages = print::split_pages(raw_body(&request)?)?;
  if let Some(dir) = test_env("MYDCMVIEWER_TEST_PRINT_DIR") {
    std::fs::create_dir_all(&dir).map_err(err)?;
    for (i, p) in pages.iter().enumerate() {
      std::fs::write(Path::new(&dir).join(format!("page{:03}.jpg", i + 1)), p).map_err(err)?;
    }
    return Ok(pages.len());
  }
  let mut printer = header(&request, "x-printer").unwrap_or_default();
  if printer.trim().is_empty() {
    printer = print::list_printers().default.ok_or("No default printer is set on this computer.")?;
  }
  let job = print::Job {
    printer,
    copies: print::clamp_copies(header(&request, "x-copies").and_then(|v| v.parse().ok()).unwrap_or(1)),
    landscape: header(&request, "x-landscape").as_deref() == Some("1"),
    title: header(&request, "x-title").unwrap_or_default(),
  };
  print::print_pages(&job, &pages)
}

// ── Popup windows ────────────────────────────────────────────
// Every dialog (settings, about, batch, MPR, print, progress…) opens in a window of
// its own, owned by the main window so it stays in front of it and closes with it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PopupOpen {
  kind: String,
  #[serde(default)]
  payload: Value,
  theme: Option<String>,
  lang: Option<String>,
  width: Option<f64>,
  height: Option<f64>,
}

pub fn popup_label(kind: &str) -> String {
  let safe: String = kind.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
  format!("{POPUP_PREFIX}{safe}")
}

fn kind_of(label: &str) -> Option<&str> {
  label.strip_prefix(POPUP_PREFIX)
}

fn resizable_popup(kind: &str) -> bool {
  matches!(kind, "mpr" | "document" | "tageditor" | "waveform" | "dicomdir" | "volume" | "pacs" | "help")
}

#[tauri::command]
async fn popup_open(app: AppHandle, opts: PopupOpen) -> Result<bool, String> {
  let label = popup_label(&opts.kind);
  let init = json!({ "payload": opts.payload, "theme": opts.theme, "lang": opts.lang });
  if let Some(win) = app.get_webview_window(&label) {
    let _ = win.emit("popup-init", init);
    let _ = win.unminimize();
    let _ = win.set_focus();
    return Ok(true);
  }
  {
    // A second open while the first is still being built: hand the new content to that window.
    let st = state(&app);
    let mut popups = st.popups.lock().unwrap();
    if let Some(p) = popups.get_mut(&label) {
      p.init = Some(init);
      return Ok(true);
    }
    popups.insert(label.clone(), Popup { init: Some(init), positioned: false });
  }
  let (r, g, b) = theme_rgb(setting_str(&app, "themeBg").as_deref());
  let resizable = resizable_popup(&opts.kind);
  let url = WebviewUrl::App(format!("popup.html?kind={}", opts.kind).into());
  let mut builder = WebviewWindowBuilder::new(&app, &label, url)
    .title(APP_NAME)
    .inner_size(opts.width.unwrap_or(520.0), opts.height.unwrap_or(400.0))
    .resizable(resizable)
    .maximizable(resizable)
    .minimizable(false)
    .visible(false)
    .focused(true)
    .theme(Some(theme_kind(&app)))
    .background_color(tauri::window::Color(r, g, b, 255));
  if let Some(main) = app.get_webview_window(MAIN) {
    builder = builder.parent(&main).map_err(err)?;
  }
  if let Some(args) = browser_args() {
    builder = builder.additional_browser_args(&args);
  }
  if let Some(dir) = webview_data_dir() {
    builder = builder.data_directory(dir);
  }
  let handle = app.clone();
  let win = builder
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
    .map_err(|e| {
      state(&app).popups.lock().unwrap().remove(&label);
      err(e)
    })?;
  window_icon::apply(&win);
  // Normally shown by popup_resize once the content is measured.
  let fallback = win.clone();
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_millis(2500));
    if !fallback.is_visible().unwrap_or(true) {
      let _ = fallback.show();
    }
  });
  Ok(true)
}

/// The popup page has loaded: hand it what to show.
#[tauri::command]
fn popup_ready(app: AppHandle, window: WebviewWindow) -> Value {
  let st = state(&app);
  let mut map = st.popups.lock().unwrap();
  map.get_mut(window.label()).and_then(|p| p.init.take()).unwrap_or(Value::Null)
}

/// Size the popup to its content; the first time also centre it over the main window and show it.
#[tauri::command]
fn popup_resize(app: AppHandle, window: WebviewWindow, width: f64, height: f64) {
  let w = width.round().max(200.0);
  let h = height.round().max(120.0);
  let _ = window.set_size(LogicalSize::new(w, h));
  let first = {
    let st = state(&app);
    let mut map = st.popups.lock().unwrap();
    let p = map.entry(window.label().to_string()).or_default();
    let first = !p.positioned;
    p.positioned = true;
    first
  };
  if first {
    if let Some(main) = app.get_webview_window(MAIN) {
      let scale = main.scale_factor().unwrap_or(1.0);
      if let (Ok(pos), Ok(size), Ok(own)) = (main.outer_position(), main.outer_size(), window.outer_size()) {
        let pos = pos.to_logical::<f64>(scale);
        let size = size.to_logical::<f64>(scale);
        let own = own.to_logical::<f64>(window.scale_factor().unwrap_or(scale));
        let x = pos.x + (size.width - own.width) / 2.0;
        let y = (pos.y + (size.height - own.height) / 2.0).max(pos.y);
        let _ = window.set_position(LogicalPosition::new(x.round(), y.round()));
      }
    } else {
      let _ = window.center();
    }
  }
  if !window.is_visible().unwrap_or(false) {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

/// popup → main window
#[tauri::command]
fn popup_emit(app: AppHandle, msg: Value) {
  let _ = app.emit_to(MAIN, "popup-event", msg);
}

#[derive(Deserialize)]
struct PopupSend {
  kind: Option<String>,
  event: String,
  #[serde(default)]
  data: Value,
}

/// main window → one popup (kind) or all of them
#[tauri::command]
fn popup_send(app: AppHandle, msg: PopupSend) {
  let payload = json!({ "event": msg.event, "data": msg.data });
  match msg.kind {
    Some(kind) => {
      if let Some(w) = app.get_webview_window(&popup_label(&kind)) {
        let _ = w.emit("popup-send", payload);
      }
    }
    None => {
      for (label, w) in app.webview_windows() {
        if label.starts_with(POPUP_PREFIX) {
          let _ = w.emit("popup-send", payload.clone());
        }
      }
    }
  }
}

#[tauri::command]
fn popup_close(app: AppHandle, kind: String) {
  if let Some(w) = app.get_webview_window(&popup_label(&kind)) {
    let _ = w.close();
  }
}

// ── Main window ──────────────────────────────────────────────
fn build_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
  let bounds = state(app).settings.lock().unwrap().get("windowBounds").cloned().unwrap_or(Value::Null);
  let num = |k: &str| bounds.get(k).and_then(|v| v.as_f64());
  let width = num("width").unwrap_or(1400.0).max(MIN_WIDTH);
  let height = num("height").unwrap_or(900.0).max(MIN_HEIGHT);
  let (r, g, b) = theme_rgb(setting_str(app, "themeBg").as_deref());
  let handle = app.clone();
  let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
    .title(APP_NAME)
    .inner_size(width, height)
    .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
    .visible(false)
    .theme(Some(theme_kind(app)))
    .background_color(tauri::window::Color(r, g, b, 255))
    .on_navigation(move |url| {
      if is_app_url(url) {
        return true;
      }
      if files::is_external_url(url.as_str()) {
        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
      }
      false
    });
  builder = match (num("x"), num("y")) {
    (Some(x), Some(y)) if on_some_monitor(app, x, y) => builder.position(x, y),
    _ => builder.center(),
  };
  if let Some(args) = browser_args() {
    builder = builder.additional_browser_args(&args);
  }
  if let Some(dir) = webview_data_dir() {
    builder = builder.data_directory(dir);
  }
  let w = builder.build()?;
  window_icon::apply(&w);
  if bounds.get("maximized").and_then(|v| v.as_bool()).unwrap_or(false) {
    let _ = w.maximize();
  }
  // Shown by window_ready; this only covers a page that failed to load.
  let fallback = w.clone();
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_secs(5));
    if !fallback.is_visible().unwrap_or(true) {
      let _ = fallback.show();
    }
  });
  Ok(w)
}

/// A saved position is used only while some monitor still shows the window's top-left area.
fn on_some_monitor(app: &AppHandle, x: f64, y: f64) -> bool {
  let Ok(monitors) = app.available_monitors() else { return true };
  monitors.iter().any(|m| {
    let s = m.scale_factor();
    let p = m.position().to_logical::<f64>(s);
    let z = m.size().to_logical::<f64>(s);
    x + 80.0 >= p.x && x + 80.0 <= p.x + z.width && y + 20.0 >= p.y && y + 20.0 <= p.y + z.height
  })
}

fn remember_bounds(window: &tauri::Window) {
  let app = window.app_handle();
  let maximized = window.is_maximized().unwrap_or(false);
  if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
    return;
  }
  let st = state(app);
  let mut slot = st.bounds.lock().unwrap();
  if maximized {
    if let Some(b) = slot.as_mut() {
      b["maximized"] = json!(true);
    }
    return;
  }
  let scale = window.scale_factor().unwrap_or(1.0);
  if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
    let pos = pos.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    *slot = Some(json!({ "x": pos.x.round(), "y": pos.y.round(), "width": size.width.round(), "height": size.height.round(), "maximized": false }));
  }
}

fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
  let app = window.app_handle();
  let label = window.label();
  if label == MAIN {
    match event {
      WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
        remember_bounds(window);
        if menu_is_open(app) {
          let _ = app.emit_to(MAIN, "menu-event", json!({ "type": "dismiss" }));
        }
      }
      WindowEvent::Focused(false) if menu_is_open(app) => {
        // the overlay never takes the focus, so losing it means another program (or a dialog) was activated
        let handle = app.clone();
        std::thread::spawn(move || {
          std::thread::sleep(Duration::from_millis(120));
          let focused = |l: &str| handle.get_webview_window(l).and_then(|w| w.is_focused().ok()).unwrap_or(false);
          if !focused(MAIN) && !focused(MENU_OVERLAY) {
            let _ = handle.emit_to(MAIN, "menu-event", json!({ "type": "dismiss" }));
          }
        });
      }
      WindowEvent::CloseRequested { .. } => {
        let bounds = state(app).bounds.lock().unwrap().clone();
        if let Some(b) = bounds {
          let st = state(app);
          merge_settings(&mut st.settings.lock().unwrap(), &json!({ "windowBounds": b }));
        }
        save_settings(app);
      }
      WindowEvent::Destroyed => {
        for (name, w) in app.webview_windows() {
          if name != MAIN {
            let _ = w.destroy();
          }
        }
        app.exit(0);
      }
      WindowEvent::DragDrop(drop) => {
        let scale = window.scale_factor().unwrap_or(1.0);
        let payload = match drop {
          DragDropEvent::Enter { paths, position } => {
            let p = position.to_logical::<f64>(scale);
            json!({ "type": "enter", "paths": paths, "x": p.x, "y": p.y })
          }
          DragDropEvent::Over { position } => {
            let p = position.to_logical::<f64>(scale);
            json!({ "type": "over", "paths": [], "x": p.x, "y": p.y })
          }
          DragDropEvent::Drop { paths, position } => {
            let p = position.to_logical::<f64>(scale);
            json!({ "type": "drop", "paths": paths, "x": p.x, "y": p.y })
          }
          DragDropEvent::Leave => json!({ "type": "leave", "paths": [] }),
          _ => return,
        };
        let _ = app.emit_to(MAIN, "file-drop", payload);
      }
      _ => {}
    }
  } else if let Some(kind) = kind_of(label) {
    if let WindowEvent::Destroyed = event {
      state(app).popups.lock().unwrap().remove(label);
      let _ = app.emit_to(MAIN, "popup-event", json!({ "kind": kind, "event": "closed" }));
    }
  }
}

// ── DICOM networking: raw sockets (net.rs); events go to every window, each page ignores ids it does not own ──
#[tauri::command]
async fn net_connect(net: tauri::State<'_, net::Net>, host: String, port: u16, timeout_ms: Option<u64>) -> Result<u32, String> {
  let net = net.inner().clone();
  tauri::async_runtime::spawn_blocking(move || net.connect(&host, port, timeout_ms.unwrap_or(10_000))).await.map_err(err)?
}

#[tauri::command]
async fn net_send(net: tauri::State<'_, net::Net>, request: Request<'_>) -> Result<(), String> {
  let id: u32 = header(&request, "x-id").and_then(|s| s.parse().ok()).ok_or("Missing socket id")?;
  let bytes = raw_body(&request)?.to_vec();
  let net = net.inner().clone();
  tauri::async_runtime::spawn_blocking(move || net.send(id, &bytes)).await.map_err(err)?
}

#[tauri::command]
fn net_close(net: tauri::State<'_, net::Net>, id: u32) -> bool {
  net.close(id)
}

#[tauri::command]
fn net_listen(net: tauri::State<'_, net::Net>, port: u16) -> Result<Value, String> {
  let id = net.listen(port)?;
  Ok(json!({ "id": id, "port": net.local_port(id).unwrap_or(port) }))
}

#[tauri::command]
fn net_stop_listen(net: tauri::State<'_, net::Net>, id: u32) -> bool {
  net.stop_listen(id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let dir = config_dir();
  let _ = std::fs::create_dir_all(&dir);
  let settings = load_settings(&dir);
  let mut builder = tauri::Builder::default();
  // One window per user — except a run with its own settings folder (the GUI tests), which must not
  // hand itself over to a copy the user has open.
  if std::env::var_os("MYDCMVIEWER_CONFIG_DIR").is_none() {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
      focus_main(app);
      deliver_open(app, files::openable_from_args(argv, Path::new(&cwd)));
    }));
  }
  let app = builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(AppState {
      config_dir: dir,
      settings: Mutex::new(settings),
      pending_open: Mutex::new(Vec::new()),
      renderer_ready: AtomicBool::new(false),
      clipboard: Mutex::new(None),
      popups: Mutex::new(HashMap::new()),
      watchers: Mutex::new(HashMap::new()),
      bounds: Mutex::new(None),
    })
    .manage(MenuState::default())
    .setup(|app| {
      let cwd = std::env::current_dir().unwrap_or_default();
      let first = files::openable_from_args(std::env::args(), &cwd);
      state(app.handle()).pending_open.lock().unwrap().extend(first);
      let (h1, h2, h3) = (app.handle().clone(), app.handle().clone(), app.handle().clone());
      app.manage(net::Net::new(
        move |id, data| {
          let _ = h1.emit("net-data", json!({ "id": id, "data": net::base64_encode(&data) }));
        },
        move |id| {
          let _ = h2.emit("net-closed", json!({ "id": id }));
        },
        move |listener, id, peer| {
          let _ = h3.emit("net-accept", json!({ "listener": listener, "id": id, "peer": peer }));
        },
      ));
      build_main_window(app.handle())?;
      Ok(())
    })
    .on_window_event(on_window_event)
    .invoke_handler(tauri::generate_handler![
      menu_open,
      menu_shown,
      menu_close,
      menu_overlay_ready,
      menu_event,
      menu_visible,
      app_info,
      settings_get,
      settings_set,
      default_dir,
      home_dir,
      samples_dir,
      list_drives,
      fs_read_dir,
      fs_stat,
      fs_read_file,
      fs_read_head,
      fs_write_file,
      fs_mkdir,
      fs_unique_dir,
      fs_trash,
      fs_copy_into,
      shell_show_item,
      shell_open_external,
      watch_dir,
      unwatch_dir,
      dialog_open_file,
      dialog_open_folder,
      dialog_save,
      dialog_message,
      window_ready,
      win_toggle_fullscreen,
      win_set_min_size,
      win_start_resize,
      win_toggle_devtools,
      win_set_title,
      win_close,
      clipboard_write_text,
      clipboard_write_image,
      print_list_printers,
      print_pages,
      popup_open,
      popup_ready,
      popup_resize,
      popup_emit,
      popup_send,
      popup_close,
      net_connect,
      net_send,
      net_close,
      net_listen,
      net_stop_listen,
    ])
    .build(tauri::generate_context!())
    .expect("error while building MyDCMViewer");

  app.run(|_app, _event| {
    if let tauri::RunEvent::Exit = &_event {
      if let Some(net) = _app.try_state::<net::Net>() {
        net.close_all();
      }
    }
    // macOS hands associated files over through this event.
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = &_event {
      let paths: Vec<String> = urls.iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().to_string()).collect();
      deliver_open(_app, paths);
    }
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn settings_merge_replaces_and_removes_keys() {
    let mut base = json!({ "theme": "midnight", "lang": "ko", "lastDir": "C:\\x" });
    merge_settings(&mut base, &json!({ "theme": "nord", "lastDir": null, "grid": true }));
    assert_eq!(base, json!({ "theme": "nord", "lang": "ko", "grid": true }));
  }

  #[test]
  fn settings_load_survives_a_broken_file() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(load_settings(dir.path()), json!({}));
    std::fs::write(settings_file(dir.path()), "{ not json").unwrap();
    assert_eq!(load_settings(dir.path()), json!({}));
    std::fs::write(settings_file(dir.path()), r#"{"theme":"nord"}"#).unwrap();
    assert_eq!(load_settings(dir.path())["theme"], "nord");
  }

  #[test]
  fn theme_colour_parses_hex() {
    assert_eq!(theme_rgb(Some("#f3f4f6")), (0xf3, 0xf4, 0xf6));
    assert_eq!(theme_rgb(Some("bad")), (0x11, 0x13, 0x18));
    assert_eq!(theme_rgb(None), (0x11, 0x13, 0x18));
  }

  #[test]
  fn popup_labels_are_safe() {
    assert_eq!(popup_label("settings"), "popup-settings");
    assert_eq!(popup_label("../x y"), "popup-xy");
    assert_eq!(kind_of("popup-mpr"), Some("mpr"));
    assert_eq!(kind_of("main"), None);
    assert!(resizable_popup("mpr") && !resizable_popup("about"));
  }

  #[test]
  fn percent_decoding_handles_utf8() {
    assert_eq!(percent_decode("C%3A%5C%EC%98%81%EC%83%81%5Ca.dcm"), "C:\\영상\\a.dcm");
    assert_eq!(percent_decode("plain"), "plain");
    assert_eq!(percent_decode("100%"), "100%");
  }

  #[test]
  fn test_save_paths_never_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let d = dir.path().to_string_lossy().to_string();
    let first = test_save_path(&d, "C:\\x\\CT.png");
    assert!(first.ends_with("CT.png"));
    std::fs::write(&first, b"x").unwrap();
    assert!(test_save_path(&d, "CT.png").ends_with("CT (2).png"));
  }

  #[test]
  fn platform_names_match_node() {
    assert!(["win32", "darwin", "linux"].contains(&node_platform()));
    assert!(!node_arch().is_empty());
  }
}
