// MyArchitecture desktop shell (Tauri 2).
//
// The page is the same set of ES modules the web build serves: index.html at
// the project root, style/, src/, assets/, sample/ and docs/ (there is no
// bundler step; scripts/build-web.mjs copies them to dist/web, which is what a
// release build embeds). Everything the page needs from the operating system
// goes through the commands below; src/ui/desktop-bridge.js wraps them into
// `window.myarch`, the object src/ui/platform.js talks to. The host owns:
//   • the main window: no native title bar on Windows and Linux (the page draws
//     icon, menus and the window buttons; `app-region: drag` moves it), the
//     traffic lights over the page on macOS; shown once the page has started
//   • single instance, and the files handed over by the shell
//   • the dialog windows: every dialog the page opens with window.open() becomes
//     a frameless window owned by the main window or by the dialog under it,
//     which stays disabled while it is open (see `dialog_window`)
//   • native open / save dialogs and file I/O, settings.json, the samples,
//     printing (system dialog, straight to a printer, Save as PDF), the user
//     manual window, interface zoom, minimum window size and the resize grip

mod files;
mod print;
mod window_icon;

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::window::Color;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAIN: &str = "main";
const MANUAL: &str = "manual";
const APP_NAME: &str = "MyArchitecture";
// Floors only: the page works out the real minimum from its title bar,
// toolbars and side panels (src/ui/app.js minWindowWidth) and sends it.
const MIN_WIDTH: f64 = 720.0;
const MIN_HEIGHT: f64 = 700.0;
const DARK_BACKGROUND: Color = Color(0x15, 0x18, 0x1e, 0xff);

struct AppState {
  config_dir: PathBuf,
  /// Files named on the command line or handed over before the page listens.
  pending_open: Mutex<Vec<String>>,
  page_ready: AtomicBool,
  /// Set once the page agreed to close (unsaved changes were handled).
  allow_close: AtomicBool,
  /// Interface size × 1000 (Settings ▸ Appearance); dialog windows follow it.
  zoom_milli: AtomicU32,
  /// depth → label of the dialog window open at that depth.
  dialogs: Mutex<BTreeMap<u32, String>>,
  /// The main window's minimum inner size (logical px) the page asked for:
  /// set_size does not honour the window's minimum, so resize_window clamps.
  min_size: Mutex<(f64, f64)>,
}

fn state<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, AppState> {
  app.state::<AppState>()
}

fn err(e: impl std::fmt::Display) -> String {
  e.to_string()
}

/// "MyArchitecture 10.0" for version 10.0.0, as the Electron build named its windows.
pub fn app_title(version: &str) -> String {
  format!("{APP_NAME} {}", version.strip_suffix(".0").unwrap_or(version))
}

/// process.platform / process.arch names, which the page already knows.
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
/// %APPDATA%\MyArchitecture (Windows), ~/Library/Application Support/MyArchitecture,
/// ~/.config/MyArchitecture: the folder the Electron build used, so settings
/// carry over. MYARCH_CONFIG_DIR points the GUI tests at a scratch folder (and
/// gives them their own webview profile and no single-instance lock).
fn config_dir() -> PathBuf {
  if let Some(over) = test_config_dir() {
    return over;
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

fn test_config_dir() -> Option<PathBuf> {
  std::env::var_os("MYARCH_CONFIG_DIR").filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn settings_file(dir: &Path) -> PathBuf {
  dir.join("settings.json")
}

pub fn read_settings(dir: &Path) -> Option<Value> {
  std::fs::read_to_string(settings_file(dir)).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).filter(|v| v.is_object())
}

/// Every webview of one profile must share its data folder; tests get their own.
fn webview_data_dir() -> Option<PathBuf> {
  test_config_dir().map(|d| d.join("webview"))
}

/// The smoke test keeps every dialog inside the main page, where CDP sees it.
fn inline_dialogs() -> bool {
  std::env::var("MYARCH_INLINE_DIALOGS").is_ok_and(|v| v == "1") || std::env::args().any(|a| a == "--inline-dialogs")
}

// ── Test hooks (GUI tests only; never set in normal use) ─────
// MYARCH_FAKE_DIALOGS  a folder: save dialogs write there under the suggested
//                      name, open dialogs answer MYARCH_OPEN_FILE (or cancel),
//                      and printing writes a PDF (and the job) there instead
//                      of reaching a printer — no window ever blocks a run.
fn test_env(name: &str) -> Option<String> {
  std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

fn fake_dialogs() -> Option<PathBuf> {
  test_env("MYARCH_FAKE_DIALOGS").map(PathBuf::from)
}

fn fake_save_path(suggested: Option<&str>, fallback: &str) -> Option<PathBuf> {
  let dir = fake_dialogs()?;
  let _ = std::fs::create_dir_all(&dir);
  let name = suggested.and_then(|s| Path::new(s).file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| fallback.into());
  Some(dir.join(name))
}

/// Pages and links that may load inside MyArchitecture's own windows.
pub fn is_app_url(url: &Url) -> bool {
  match url.scheme() {
    "tauri" | "asset" | "blob" | "data" | "about" => true,
    "http" | "https" => matches!(url.host_str(), Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")),
    _ => false,
  }
}

pub fn is_safe_external(url: &str) -> bool {
  let lower = url.trim().to_ascii_lowercase();
  lower.starts_with("https:") || lower.starts_with("http:") || lower.starts_with("mailto:")
}

fn open_outside<R: Runtime>(app: &AppHandle<R>, url: &str) {
  if is_safe_external(url) {
    let _ = app.opener().open_url(url, None::<&str>);
  }
}

// ── Files handed over by the shell ───────────────────────────
fn deliver_open<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
  if paths.is_empty() {
    return;
  }
  let st = state(app);
  if st.page_ready.load(Ordering::SeqCst) {
    for p in paths {
      let _ = app.emit_to(MAIN, "open-path", p);
    }
  } else {
    st.pending_open.lock().unwrap().extend(paths);
  }
}

fn focus_main<R: Runtime>(app: &AppHandle<R>) {
  if let Some(w) = app.get_webview_window(MAIN) {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

/// Values the page needs synchronously, before its modules run.
fn boot_script<R: Runtime>(app: &AppHandle<R>) -> String {
  let info = json!({
    "version": app.package_info().version.to_string(),
    "platform": node_platform(),
    "arch": node_arch(),
    "tauri": tauri::VERSION,
    "webview": tauri::webview_version().unwrap_or_default(),
    "inlineDialogs": inline_dialogs(),
  });
  format!("window.__MYARCH_BOOT__ = Object.freeze({info});")
}

// ── Settings / version ───────────────────────────────────────
#[tauri::command]
fn get_version(app: AppHandle) -> String {
  app.package_info().version.to_string()
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Option<Value> {
  read_settings(&state(&app).config_dir)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Value) -> Result<bool, String> {
  let value = if settings.is_object() { settings } else { json!({}) };
  let text = serde_json::to_string_pretty(&value).map_err(err)?;
  files::write_atomic(&settings_file(&state(&app).config_dir), text.as_bytes()).map_err(err)?;
  Ok(true)
}

// ── Files ────────────────────────────────────────────────────
#[derive(Deserialize, Default, Clone)]
#[serde(default)]
struct Filter {
  name: String,
  extensions: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct FileOpts {
  title: Option<String>,
  default_path: Option<String>,
  filters: Vec<Filter>,
  multi: bool,
  binary: bool,
  file_path: Option<String>,
  content: Option<String>,
  content_base64: Option<String>,
  page_size: Option<print::PageSize>,
  landscape: bool,
}

fn file_dialog(app: &AppHandle, window: &WebviewWindow, opts: &FileOpts) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
  let mut d = app.dialog().file().set_parent(window);
  if let Some(t) = opts.title.as_deref().filter(|t| !t.is_empty()) {
    d = d.set_title(t);
  }
  if let Some(p) = opts.default_path.as_deref().filter(|p| !p.is_empty()) {
    let path = Path::new(p);
    if path.is_absolute() {
      if let Some(dir) = path.parent() {
        d = d.set_directory(dir);
      }
    }
    if let Some(name) = path.file_name() {
      d = d.set_file_name(name.to_string_lossy());
    }
  }
  for f in opts.filters.iter().filter(|f| !f.extensions.is_empty()) {
    let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
    d = d.add_filter(&f.name, &exts);
  }
  d
}

fn picked(p: tauri_plugin_dialog::FilePath) -> Option<PathBuf> {
  p.into_path().ok()
}

/// → { canceled } | { canceled: false, filePath, content, encoding } | { canceled: false, files: [...] } (multi)
#[tauri::command]
async fn open_file(app: AppHandle, window: WebviewWindow, opts: FileOpts) -> Result<Value, String> {
  let chosen: Vec<PathBuf> = if fake_dialogs().is_some() {
    test_env("MYARCH_OPEN_FILE").map(PathBuf::from).filter(|p| p.is_file()).into_iter().collect()
  } else {
    // An open dialog never suggests a file name, only the folder.
    let ask = FileOpts { title: opts.title.clone(), default_path: opts.default_path.clone(), filters: opts.filters.clone(), ..Default::default() };
    let mut d = file_dialog(&app, &window, &ask);
    if let Some(p) = ask.default_path.as_deref().filter(|p| Path::new(p).is_dir()) {
      d = d.set_directory(p);
    }
    if opts.multi {
      d.blocking_pick_files().unwrap_or_default().into_iter().filter_map(picked).collect()
    } else {
      d.blocking_pick_file().and_then(picked).into_iter().collect()
    }
  };
  if chosen.is_empty() {
    return Ok(json!({ "canceled": true }));
  }
  if opts.multi {
    let list = chosen.iter().map(|p| files::read_payload(p, opts.binary)).collect::<Result<Vec<_>, _>>()?;
    return Ok(json!({ "canceled": false, "files": list }));
  }
  let mut one = files::read_payload(&chosen[0], opts.binary)?;
  one["canceled"] = json!(false);
  Ok(one)
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ReadOpts {
  binary: bool,
}

#[tauri::command]
async fn read_path(file_path: String, opts: Option<ReadOpts>) -> Value {
  match files::read_payload(Path::new(&file_path), opts.unwrap_or_default().binary) {
    Ok(mut v) => {
      v["ok"] = json!(true);
      v
    }
    Err(e) => json!({ "ok": false, "error": e }),
  }
}

/// Save dialog, then write text or base64 bytes. → { canceled } | { canceled: false, filePath }
#[tauri::command]
async fn save_file(app: AppHandle, window: WebviewWindow, opts: FileOpts) -> Result<Value, String> {
  let target = match fake_save_path(opts.default_path.as_deref(), "export.bin") {
    Some(p) => Some(p),
    None => file_dialog(&app, &window, &opts).blocking_save_file().and_then(picked),
  };
  let Some(path) = target else {
    return Ok(json!({ "canceled": true }));
  };
  let bytes = files::payload(opts.content.as_deref(), opts.content_base64.as_deref())?;
  std::fs::write(&path, bytes).map_err(|e| format!("{}: {e}", path.display()))?;
  Ok(json!({ "canceled": false, "filePath": path.to_string_lossy() }))
}

/// Ctrl+S on a document that already has a path: write it back, no dialog.
#[tauri::command]
async fn write_file(opts: FileOpts) -> Value {
  let path = opts.file_path.clone().unwrap_or_default();
  if path.is_empty() {
    return json!({ "ok": false, "error": "no path" });
  }
  let result = files::payload(opts.content.as_deref(), opts.content_base64.as_deref()).and_then(|bytes| std::fs::write(&path, bytes).map_err(err));
  match result {
    Ok(()) => json!({ "ok": true, "filePath": path }),
    Err(e) => json!({ "ok": false, "error": e }),
  }
}

// ── Samples ──────────────────────────────────────────────────
/// The sample projects: bundled resources when installed, sample/ next to the
/// project in development (`tauri dev` runs from src-tauri).
fn samples_dir(app: &AppHandle) -> PathBuf {
  let mut candidates = Vec::new();
  if let Ok(res) = app.path().resource_dir() {
    candidates.push(res.join("sample"));
  }
  candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("sample"));
  candidates.iter().find(|d| d.join("index.json").is_file()).cloned().unwrap_or_else(|| candidates[0].clone())
}

#[tauri::command]
async fn list_samples(app: AppHandle) -> Value {
  match std::fs::read_to_string(samples_dir(&app).join("index.json")) {
    Ok(text) => files::sample_list(&text),
    Err(_) => json!([]),
  }
}

#[tauri::command]
async fn read_sample(app: AppHandle, file: String) -> Result<String, String> {
  if !files::is_sample_name(&file) {
    return Err(format!("invalid sample name: {file}"));
  }
  files::read_text(&samples_dir(&app).join(&file)).map_err(err)
}

// ── Printing ─────────────────────────────────────────────────
/// The page lays out .print-area sheets itself; this opens the print dialog.
#[tauri::command]
async fn print_page(window: WebviewWindow) -> Result<bool, String> {
  #[cfg(windows)]
  if let Some(path) = fake_save_path(Some("print.pdf"), "print.pdf") {
    let (w, h) = print::paper_inches("A4");
    print::print_to_pdf(&window, &path, w, h).await?;
    return Ok(true);
  }
  window.print().map_err(err)?;
  Ok(true)
}

#[tauri::command]
fn list_printers() -> Vec<print::Printer> {
  print::list_printers()
}

/// Print button of the print window: the sheets laid out in .print-area go
/// straight to the chosen printer. Under MYARCH_FAKE_DIALOGS nothing reaches
/// a printer: a PDF of the job and the options it would have used are written.
#[cfg(windows)]
#[tauri::command]
async fn print_sheets(window: WebviewWindow, opts: Value) -> Value {
  let job: print::SheetJob = serde_json::from_value(opts.clone()).unwrap_or_default();
  if let Some(pdf) = fake_save_path(Some("print.pdf"), "print.pdf") {
    let (w, h) = print::page_inches(job.page_size.as_ref(), job.landscape, true);
    if let Err(e) = print::print_to_pdf(&window, &pdf, w, h).await {
      return json!({ "ok": false, "error": e });
    }
    // The options the printer would have got, in the shape the Electron build wrote.
    let mut record = opts;
    record["copies"] = json!(print::copies(&job));
    record["silent"] = json!(true);
    record["margins"] = json!({ "marginType": "none" });
    record["printBackground"] = json!(true);
    record["color"] = json!(job.color != Some(false));
    let text = serde_json::to_string_pretty(&record).unwrap_or_default();
    let _ = std::fs::write(pdf.with_file_name("print-job.json"), text);
    return json!({ "ok": true, "fake": true });
  }
  match print::print_sheets(&window, &job).await {
    Ok(()) => json!({ "ok": true }),
    Err(e) => json!({ "ok": false, "error": e }),
  }
}

#[cfg(not(windows))]
#[tauri::command]
async fn print_sheets(window: WebviewWindow, opts: Value) -> Value {
  let _ = opts;
  match window.print() {
    Ok(()) => json!({ "ok": true }),
    Err(e) => json!({ "ok": false, "error": e.to_string() }),
  }
}

#[tauri::command]
async fn print_to_pdf(app: AppHandle, window: WebviewWindow, opts: FileOpts) -> Result<Value, String> {
  let suggested = opts.default_path.clone().unwrap_or_else(|| format!("{APP_NAME}.pdf"));
  let target = match fake_save_path(Some(&suggested), "MyArchitecture.pdf") {
    Some(p) => Some(p),
    None => {
      let ask = FileOpts {
        title: Some(opts.title.clone().unwrap_or_else(|| "PDF".into())),
        default_path: Some(suggested),
        filters: vec![Filter { name: "PDF".into(), extensions: vec!["pdf".into()] }],
        ..Default::default()
      };
      file_dialog(&app, &window, &ask).blocking_save_file().and_then(picked)
    }
  };
  let Some(path) = target else {
    return Ok(json!({ "canceled": true }));
  };
  #[cfg(windows)]
  {
    let (w, h) = print::page_inches(opts.page_size.as_ref(), opts.landscape, false);
    match print::print_to_pdf(&window, &path, w, h).await {
      Ok(()) => Ok(json!({ "canceled": false, "filePath": path.to_string_lossy() })),
      Err(e) => Ok(json!({ "canceled": false, "ok": false, "error": e })),
    }
  }
  #[cfg(not(windows))]
  {
    let _ = (path, opts.landscape);
    Ok(json!({ "canceled": false, "ok": false, "error": "Save as PDF is only available on Windows" }))
  }
}

// ── Windows ──────────────────────────────────────────────────
/// The page has started: show the main window and hand over the files that
/// arrived before it listened.
#[tauri::command]
fn window_ready(app: AppHandle, window: WebviewWindow) -> Vec<String> {
  if window.label() != MAIN {
    return Vec::new();
  }
  let st = state(&app);
  st.page_ready.store(true, Ordering::SeqCst);
  if !window.is_visible().unwrap_or(true) {
    let _ = window.show();
    let _ = window.set_focus();
  }
  let pending = std::mem::take(&mut *st.pending_open.lock().unwrap());
  pending
}

/// The page handled unsaved changes; `allow` closes the program.
#[tauri::command]
fn confirm_close(app: AppHandle, allow: bool) {
  if !allow {
    return;
  }
  state(&app).allow_close.store(true, Ordering::SeqCst);
  if let Some(w) = app.get_webview_window(MAIN) {
    let _ = w.close();
  }
}

/// File ▸ Exit: the same path as the window's close button.
#[tauri::command]
fn request_close(window: WebviewWindow) {
  let _ = window.close();
}

#[tauri::command]
fn win_minimize(window: WebviewWindow) -> bool {
  window.minimize().is_ok()
}

/// Maximise or restore; answers the new state.
#[tauri::command]
fn win_toggle_maximize(window: WebviewWindow) -> bool {
  if window.is_maximized().unwrap_or(false) {
    let _ = window.unmaximize();
    false
  } else {
    let _ = window.maximize();
    true
  }
}

#[tauri::command]
fn win_is_maximized(window: WebviewWindow) -> bool {
  window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false)
}

/// Moving by the title bar where the webview has no `app-region: drag`
/// (macOS and Linux); Windows handles the CSS region natively. A dialog window
/// asks through the main page and names itself.
#[tauri::command]
fn win_start_dragging(app: AppHandle, window: WebviewWindow, label: Option<String>) -> bool {
  let target = label.and_then(|l| app.get_webview_window(&l)).unwrap_or(window);
  target.start_dragging().is_ok()
}

/// Interface size (Settings ▸ Appearance). Dialog windows opened later follow it.
#[tauri::command]
fn set_zoom(app: AppHandle, window: WebviewWindow, factor: f64) -> f64 {
  let z = if factor.is_finite() { factor.clamp(0.75, 1.5) } else { 1.0 };
  let _ = window.set_zoom(z);
  if window.label() == MAIN {
    state(&app).zoom_milli.store((z * 1000.0).round() as u32, Ordering::SeqCst);
  }
  z
}

/// Logical work area (x, y, width, height) of the monitor the window is on.
fn work_area(window: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
  let m = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten())?;
  let s = m.scale_factor();
  let a = m.work_area();
  Some((f64::from(a.position.x) / s, f64::from(a.position.y) / s, f64::from(a.size.width) / s, f64::from(a.size.height) / s))
}

/// The page measures its menu bar and toolbar and asks for a minimum that keeps
/// every button reachable; never below the built-in floor, never more than the
/// screen the window is on can show. A window that grew is kept on the screen.
#[tauri::command]
fn set_min_size(app: AppHandle, window: WebviewWindow, width: f64, height: f64) -> bool {
  let (ax, ay, aw, ah) = work_area(&window).unwrap_or((0.0, 0.0, 2400.0, 1600.0));
  let w = (aw - 16.0).min(width.round().clamp(MIN_WIDTH, 2400.0));
  let h = (ah - 16.0).min(height.round().clamp(MIN_HEIGHT, 1600.0));
  let (fw, fh) = frame_extra(&window);
  let _ = window.set_min_size(Some(LogicalSize::new(w + fw, h + fh)));
  if window.label() == MAIN {
    *state(&app).min_size.lock().unwrap() = (w, h);
  }
  let scale = window.scale_factor().unwrap_or(1.0);
  if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
    return true;
  }
  if let (Ok(size), Ok(pos)) = (window.inner_size(), window.inner_position()) {
    let cur = size.to_logical::<f64>(scale);
    if cur.width < w || cur.height < h {
      let (nw, nh) = (cur.width.max(w), cur.height.max(h));
      let _ = window.set_size(LogicalSize::new(nw, nh));
      let p = pos.to_logical::<f64>(scale);
      let x = p.x.min(ax + aw - nw).max(ax);
      let y = p.y.min(ay + ah - nh).max(ay);
      if x != p.x || y != p.y {
        place_client(&window, x, y);
      }
    }
  }
  true
}

/// Resize grip in the status bar: the page reads the size when a drag starts.
#[tauri::command]
fn window_size(window: WebviewWindow) -> Option<Value> {
  let scale = window.scale_factor().unwrap_or(1.0);
  let size = window.inner_size().ok()?.to_logical::<f64>(scale);
  let pos = window.inner_position().ok()?.to_logical::<f64>(scale);
  let (ax, ay, aw, ah) = work_area(&window).unwrap_or((0.0, 0.0, 1920.0, 1080.0));
  Some(json!({
    "width": size.width.round(), "height": size.height.round(), "x": pos.x.round(), "y": pos.y.round(),
    "area": { "x": ax, "y": ay, "width": aw, "height": ah },
    "maximized": window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false),
  }))
}

/// …and sets the new size while it moves (the window's minimum size still applies).
#[tauri::command]
fn resize_window(app: AppHandle, window: WebviewWindow, width: f64, height: f64) {
  if !width.is_finite() || !height.is_finite() || window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
    return;
  }
  let (min_w, min_h) = *state(&app).min_size.lock().unwrap();
  let _ = window.set_size(LogicalSize::new(width.round().max(min_w), height.round().max(min_h)));
}

pub fn parse_hex_color(text: &str) -> Option<Color> {
  let h = text.trim().strip_prefix('#')?;
  let n = u32::from_str_radix(h, 16).ok()?;
  match h.len() {
    6 => Some(Color((n >> 16) as u8, (n >> 8) as u8, n as u8, 0xff)),
    3 => {
      let d = |v: u32| ((v & 0xf) * 17) as u8;
      Some(Color(d(n >> 8), d(n >> 4), d(n), 0xff))
    }
    _ => None,
  }
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct TitleBarColors {
  color: Option<String>,
  symbol_color: Option<String>,
}

/// Theme colours: the page draws its own title bar, so only the window
/// background follows the theme (what shows while the window resizes).
#[tauri::command]
fn set_title_bar(window: WebviewWindow, colors: TitleBarColors) -> bool {
  let _ = colors.symbol_color;
  match colors.color.as_deref().and_then(parse_hex_color) {
    Some(c) => window.set_background_color(Some(c)).is_ok(),
    None => false,
  }
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> bool {
  if !is_safe_external(&url) {
    return false;
  }
  app.opener().open_url(url, None::<&str>).is_ok()
}

/// The user manual opens in its own window (a document, with the program icon
/// and a fixed title) instead of a popup inside the editor.
#[tauri::command]
async fn open_manual(app: AppHandle, lang: String) -> Result<bool, String> {
  let en = lang == "en";
  let page = if en { "docs/USERSGUIDE.en.html" } else { "docs/USERSGUIDE.ko.html" };
  let title = if en { "User manual — MyArchitecture 10.0" } else { "사용자 매뉴얼 — MyArchitecture 10.0" };
  if let Some(w) = app.get_webview_window(MANUAL) {
    let _ = w.eval(format!("location.replace({})", json!(format!("/{page}"))));
    let _ = w.set_title(title);
    let _ = w.unminimize();
    let _ = w.set_focus();
    return Ok(true);
  }
  let nav = app.clone();
  let pop = app.clone();
  let mut b = WebviewWindowBuilder::new(&app, MANUAL, WebviewUrl::App(page.into()))
    .title(title)
    .inner_size(1180.0, 860.0)
    .min_inner_size(720.0, 520.0)
    .background_color(Color(0xff, 0xff, 0xff, 0xff))
    .on_navigation(move |url| {
      if is_app_url(url) {
        return true;
      }
      open_outside(&nav, url.as_str());
      false
    })
    .on_new_window(move |url, _| {
      open_outside(&pop, url.as_str());
      NewWindowResponse::Deny
    });
  if let Some(dir) = webview_data_dir() {
    b = b.data_directory(dir);
  }
  let w = b.build().map_err(err)?;
  window_icon::apply(&w);
  Ok(true)
}

// ── Dialog windows ───────────────────────────────────────────
// The page opens each dialog with window.open("about:blank#dialog-<depth>-<id>",
// …, "width=…,height=…,left=…,top=…") and moves the dialog into that document
// itself (same origin, same renderer), so the window only has to exist: owned
// by the main window or by the dialog one level down, which is disabled while
// it is open, as Electron's modal child windows were.
static NEXT_DIALOG: AtomicU32 = AtomicU32::new(1);

/// (label, depth) for the window the page asked for; anything unexpected gets
/// a fresh label at depth 1.
pub fn dialog_label(fragment: Option<&str>) -> (String, u32) {
  let named = fragment.filter(|f| f.starts_with("dialog-") && f.len() < 64 && f.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
  if let Some(f) = named {
    let depth = f["dialog-".len()..].split('-').next().and_then(|d| d.parse::<u32>().ok()).filter(|d| (1..100).contains(d));
    if let Some(depth) = depth {
      return (f.to_string(), depth);
    }
  }
  (format!("dialog-1-x{}", NEXT_DIALOG.fetch_add(1, Ordering::Relaxed)), 1)
}

fn dialog_window(app: &AppHandle, url: &Url, features: NewWindowFeatures) -> NewWindowResponse<tauri::Wry> {
  let (label, depth) = dialog_label(url.fragment());
  if app.get_webview_window(&label).is_some() {
    return NewWindowResponse::Deny;
  }
  let st = state(app);
  let owner_label = (depth > 1).then(|| st.dialogs.lock().unwrap().get(&(depth - 1)).cloned()).flatten();
  let Some(owner) = owner_label.and_then(|l| app.get_webview_window(&l)).or_else(|| app.get_webview_window(MAIN)) else {
    return NewWindowResponse::Deny;
  };
  let nav = app.clone();
  let b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External("about:blank".parse().expect("about:blank")))
    .window_features(features)
    .title(app_title(&app.package_info().version.to_string()))
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .skip_taskbar(true)
    .background_color(DARK_BACKGROUND)
    .disable_drag_drop_handler()
    .on_navigation(move |url| {
      if is_app_url(url) {
        return true;
      }
      open_outside(&nav, url.as_str());
      false
    });
  let b = match b.parent(&owner) {
    Ok(next) => next,
    Err(_) => return NewWindowResponse::Deny,
  };
  match b.build() {
    Ok(window) => {
      window_icon::apply(&window);
      // A dialog follows the interface size of the main window.
      let z = f64::from(st.zoom_milli.load(Ordering::SeqCst)) / 1000.0;
      if (z - 1.0).abs() > 0.001 {
        let _ = window.set_zoom(z);
      }
      st.dialogs.lock().unwrap().insert(depth, label);
      let _ = owner.set_enabled(false);
      NewWindowResponse::Create { window }
    }
    Err(_) => NewWindowResponse::Deny,
  }
}

/// The page closes its dialog windows by label (window.close() from the
/// opener does not reach a window the host created).
#[tauri::command]
fn close_dialog(app: AppHandle, label: String) -> bool {
  if !label.starts_with("dialog-") {
    return false;
  }
  app.get_webview_window(&label).is_some_and(|w| w.destroy().is_ok())
}

/// Moves a dialog window so that its client area starts at x, y (screen CSS
/// px): what window.moveTo() did in Electron; WebView2 ignores it.
#[tauri::command]
fn move_dialog(app: AppHandle, label: String, x: f64, y: f64) -> bool {
  if !label.starts_with("dialog-") || !x.is_finite() || !y.is_finite() {
    return false;
  }
  app.get_webview_window(&label).is_some_and(|w| place_client(&w, x, y))
}

/// A dialog window is gone: its owner takes input again.
fn dialog_closed(app: &AppHandle, label: &str) {
  let st = state(app);
  let mut dialogs = st.dialogs.lock().unwrap();
  let Some(depth) = dialogs.iter().find(|(_, l)| l.as_str() == label).map(|(d, _)| *d) else {
    return;
  };
  dialogs.remove(&depth);
  let owner = (depth > 1).then(|| dialogs.get(&(depth - 1)).cloned()).flatten().unwrap_or_else(|| MAIN.to_string());
  drop(dialogs);
  if let Some(w) = app.get_webview_window(&owner) {
    let _ = w.set_enabled(true);
    let _ = w.set_focus();
  }
}

/// How much wider and taller the outer rectangle is than the client area. On
/// Windows a frameless window keeps an invisible resize border (8 px a side),
/// and the minimum size given to set_min_size binds the OUTER rectangle there:
/// without this the user's edge drag stopped 16 px short of the client minimum,
/// the Resized clamp below pushed it back, and the window shook between the two.
fn frame_extra(window: &WebviewWindow) -> (f64, f64) {
  if cfg!(not(target_os = "windows")) {
    return (0.0, 0.0);
  }
  let scale = window.scale_factor().unwrap_or(1.0);
  match (window.outer_size(), window.inner_size()) {
    (Ok(o), Ok(i)) => (
      f64::from(o.width.saturating_sub(i.width)) / scale,
      f64::from(o.height.saturating_sub(i.height)) / scale,
    ),
    _ => (0.0, 0.0),
  }
}

/// Put the window so that its client area starts at x, y. A frameless window's
/// outer rectangle has an invisible resize border, and set_position places that.
fn place_client(window: &WebviewWindow, x: f64, y: f64) -> bool {
  let scale = window.scale_factor().unwrap_or(1.0);
  let (dx, dy) = match (window.inner_position(), window.outer_position()) {
    (Ok(i), Ok(o)) => (f64::from(i.x - o.x) / scale, f64::from(i.y - o.y) / scale),
    _ => (0.0, 0.0),
  };
  window.set_position(LogicalPosition::new((x - dx).round(), (y - dy).round())).is_ok()
}

// ── Main window ──────────────────────────────────────────────
fn build_main_window(app: &AppHandle) -> tauri::Result<()> {
  let title = app_title(&app.package_info().version.to_string());
  let nav = app.clone();
  let popups = app.clone();
  let mut b = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::default())
    .title(&title)
    .inner_size(1440.0, 900.0)
    .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
    .center()
    .visible(false)
    .background_color(DARK_BACKGROUND)
    // Files dropped on the window reach the page as HTML drop events (open or
    // import them), and furniture and views are dragged inside the page the same way.
    .disable_drag_drop_handler()
    .initialization_script(boot_script(app))
    // The page names the document in its title; the taskbar shows it too.
    .on_document_title_changed(|window, title| {
      let _ = window.set_title(&title);
    })
    // A link never replaces the program: it leaves for the browser.
    .on_navigation(move |url| {
      if is_app_url(url) {
        return true;
      }
      open_outside(&nav, url.as_str());
      false
    })
    .on_new_window(move |url, features| {
      if url.scheme() == "about" {
        return dialog_window(&popups, &url, features);
      }
      open_outside(&popups, url.as_str());
      NewWindowResponse::Deny
    });
  #[cfg(target_os = "macos")]
  {
    b = b
      .title_bar_style(tauri::TitleBarStyle::Overlay)
      .hidden_title(true)
      .traffic_light_position(tauri::LogicalPosition::new(14.0, 12.0));
  }
  #[cfg(not(target_os = "macos"))]
  {
    b = b.decorations(false);
  }
  if let Some(dir) = webview_data_dir() {
    b = b.data_directory(dir);
  }
  let window = b.build()?;
  // Start at 1440×900, but never larger than the screen's work area.
  if let Some((_, _, aw, ah)) = work_area(&window) {
    if aw < 1440.0 || ah < 900.0 {
      let _ = window.set_size(LogicalSize::new(aw.min(1440.0), ah.min(900.0)));
      let _ = window.center();
    }
  }
  window_icon::apply(&window);
  // A page that never reports (a script error) must not leave an invisible program.
  let late = window.clone();
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_secs(4));
    if !late.is_visible().unwrap_or(true) {
      let _ = late.show();
    }
  });
  Ok(())
}

fn on_window_event(window: &Window, event: &WindowEvent) {
  let app = window.app_handle();
  if window.label().starts_with("dialog-") {
    if let WindowEvent::Destroyed = event {
      dialog_closed(app, window.label());
    }
    return;
  }
  if window.label() != MAIN {
    return;
  }
  match event {
    // The page decides about unsaved changes and answers with confirm_close.
    WindowEvent::CloseRequested { api, .. } => {
      if !state(app).allow_close.load(Ordering::SeqCst) && state(app).page_ready.load(Ordering::SeqCst) {
        api.prevent_close();
        let _ = app.emit_to(MAIN, "request-close", ());
      }
    }
    // The status bar's resize grip hides while the window is maximized or full screen.
    // The window's minimum size only binds the user's own edge drags: Snap,
    // SetWindowPos and other programs can make it smaller, and the toolbar
    // would then run to two rows and lose buttons. Such a size is undone here.
    WindowEvent::Resized(size) => {
      let maximized = window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false);
      let _ = app.emit_to(MAIN, "window-state", json!({ "maximized": maximized }));
      if !maximized && !window.is_minimized().unwrap_or(false) && size.width > 0 && size.height > 0 {
        let (min_w, min_h) = *state(app).min_size.lock().unwrap();
        let cur = size.to_logical::<f64>(window.scale_factor().unwrap_or(1.0));
        if cur.width + 0.5 < min_w || cur.height + 0.5 < min_h {
          let _ = window.set_size(LogicalSize::new(cur.width.max(min_w), cur.height.max(min_h)));
        }
      }
    }
    // Dialogs close with their owner; the manual follows the program.
    WindowEvent::Destroyed => app.exit(0),
    _ => {}
  }
}

pub fn run() {
  let dir = config_dir();
  let _ = std::fs::create_dir_all(&dir);
  let mut builder = tauri::Builder::default();
  // One MyArchitecture per user. A second launch hands its files to the running
  // one. A run with its own settings folder (the GUI tests) is left alone.
  if test_config_dir().is_none() {
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
      pending_open: Mutex::new(Vec::new()),
      page_ready: AtomicBool::new(false),
      allow_close: AtomicBool::new(false),
      zoom_milli: AtomicU32::new(1000),
      dialogs: Mutex::new(BTreeMap::new()),
      min_size: Mutex::new((MIN_WIDTH, MIN_HEIGHT)),
    })
    .setup(|app| {
      let cwd = std::env::current_dir().unwrap_or_default();
      let first = files::openable_from_args(std::env::args(), &cwd);
      state(app.handle()).pending_open.lock().unwrap().extend(first);
      build_main_window(app.handle())?;
      Ok(())
    })
    .on_window_event(on_window_event)
    .invoke_handler(tauri::generate_handler![
      get_version,
      load_settings,
      save_settings,
      open_file,
      read_path,
      save_file,
      write_file,
      list_samples,
      read_sample,
      print_page,
      list_printers,
      print_sheets,
      print_to_pdf,
      window_ready,
      confirm_close,
      request_close,
      win_minimize,
      win_toggle_maximize,
      win_is_maximized,
      win_start_dragging,
      set_zoom,
      set_min_size,
      window_size,
      resize_window,
      set_title_bar,
      open_external,
      open_manual,
      close_dialog,
      move_dialog,
    ])
    .build(tauri::generate_context!())
    .expect("error while building MyArchitecture");

  app.run(|_app, _event| {
    // macOS hands documents over through this event instead of argv.
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = &_event {
      let paths: Vec<String> = urls.iter().filter_map(|u| u.to_file_path().ok()).filter(|p| files::is_supported(p)).map(|p| p.to_string_lossy().to_string()).collect();
      deliver_open(_app, paths);
    }
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn titles_drop_the_patch_zero() {
    assert_eq!(app_title("10.0.0"), "MyArchitecture 10.0");
    assert_eq!(app_title("10.2.3"), "MyArchitecture 10.2.3");
  }

  #[test]
  fn settings_read_survives_a_broken_file() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(read_settings(dir.path()), None);
    std::fs::write(settings_file(dir.path()), "{ not json").unwrap();
    assert_eq!(read_settings(dir.path()), None);
    std::fs::write(settings_file(dir.path()), "[1,2]").unwrap();
    assert_eq!(read_settings(dir.path()), None);
    std::fs::write(settings_file(dir.path()), r#"{"theme":"nord"}"#).unwrap();
    assert_eq!(read_settings(dir.path()).unwrap()["theme"], "nord");
  }

  #[test]
  fn only_web_and_mail_links_leave_for_the_browser() {
    assert!(is_safe_external("https://example.com"));
    assert!(is_safe_external("mailto:knix008@naver.com"));
    assert!(!is_safe_external("file:///C:/Windows/system32/calc.exe"));
    assert!(!is_safe_external("javascript:alert(1)"));
  }

  #[test]
  fn app_urls_stay_inside() {
    assert!(is_app_url(&"http://tauri.localhost/index.html".parse().unwrap()));
    assert!(is_app_url(&"http://localhost:5236/docs/USERSGUIDE.ko.html".parse().unwrap()));
    assert!(is_app_url(&"about:blank#dialog-1-abc".parse().unwrap()));
    assert!(!is_app_url(&"https://github.com/".parse().unwrap()));
  }

  #[test]
  fn dialog_labels_carry_their_depth() {
    assert_eq!(dialog_label(Some("dialog-2-abc12")), ("dialog-2-abc12".to_string(), 2));
    let (l, d) = dialog_label(Some("../evil"));
    assert!(l.starts_with("dialog-1-") && d == 1);
    let (l, d) = dialog_label(Some("dialog-x-1"));
    assert!(l.starts_with("dialog-1-x") && d == 1);
    assert_eq!(dialog_label(None).1, 1);
  }

  #[test]
  fn hex_colours_parse() {
    let c = parse_hex_color("#1c2028").unwrap();
    assert_eq!((c.0, c.1, c.2), (0x1c, 0x20, 0x28));
    let c = parse_hex_color("#fff").unwrap();
    assert_eq!((c.0, c.1, c.2), (255, 255, 255));
    assert!(parse_hex_color("rgb(1,2,3)").is_none());
  }

  #[test]
  fn platform_names_match_node() {
    assert!(["win32", "darwin", "linux"].contains(&node_platform()));
    assert!(!node_arch().is_empty());
  }
}
