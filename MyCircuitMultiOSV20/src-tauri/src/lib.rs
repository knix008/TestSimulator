// MyCircuit desktop shell (Tauri 2).
//
// The page is the same set of ES modules the web build serves: index.html at
// the project root, style/, src/, assets/, sample/ and docs/ (there is no
// bundler step; scripts/build-web.mjs copies them to dist/web, which is what a
// release build embeds). Everything the page needs from the operating system
// goes through the commands below; src/ui/desktop-bridge.js wraps them into
// `window.mycircuit`, the object src/ui/platform.js talks to. The host owns:
//   • the main window: no native title bar on Windows and Linux (the page draws
//     icon, menus and the window buttons; `app-region: drag` moves it), the
//     traffic lights over the page on macOS; shown once the page has started
//   • single instance, and the .mycircuit files handed over by the shell
//   • the dialog windows: every dialog the page opens with window.open() becomes
//     a frameless window owned by the main window (see `dialog_window`)
//   • native open / save dialogs and file I/O, settings.json, printing and
//     Save as PDF, the user manual window, interface zoom, minimum window size

mod files;
mod pdf;
mod window_icon;

use serde::Deserialize;
use serde_json::{json, Value};
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
const APP_NAME: &str = "MyCircuit";
const MIN_WIDTH: f64 = 1024.0;
const MIN_HEIGHT: f64 = 700.0;
const DIALOG_MIN_WIDTH: f64 = 280.0;
const DIALOG_MIN_HEIGHT: f64 = 160.0;
const DARK_BACKGROUND: Color = Color(0x15, 0x18, 0x1e, 0xff);

struct AppState {
  config_dir: PathBuf,
  /// Files named on the command line or handed over before the page listens.
  pending_open: Mutex<Vec<String>>,
  page_ready: AtomicBool,
  /// Set once the page agreed to close (unsaved changes were handled).
  allow_close: AtomicBool,
}

fn state<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, AppState> {
  app.state::<AppState>()
}

fn err(e: impl std::fmt::Display) -> String {
  e.to_string()
}

/// "MyCircuit 1.0" for version 1.0.0, as the Electron build named its windows.
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
/// %APPDATA%\MyCircuit (Windows), ~/Library/Application Support/MyCircuit,
/// ~/.config/MyCircuit: the folder the Electron build used, so settings carry
/// over. MYCIRCUIT_CONFIG_DIR points the GUI tests at a scratch folder (and
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
  std::env::var_os("MYCIRCUIT_CONFIG_DIR").filter(|v| !v.is_empty()).map(PathBuf::from)
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
  std::env::var("MYCIRCUIT_INLINE_DIALOGS").is_ok_and(|v| v == "1") || std::env::args().any(|a| a == "--inline-dialogs")
}

// ── Test hooks (GUI tests only; never set in normal use) ─────
// MYCIRCUIT_TEST_OPEN       open dialogs answer these paths ('|'-separated)
// MYCIRCUIT_TEST_SAVE_DIR   save dialogs answer <dir>/<suggested name> (never overwriting)
fn test_env(name: &str) -> Option<String> {
  std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

fn test_save_path(suggested: Option<&str>, fallback: &str) -> Option<PathBuf> {
  let dir = PathBuf::from(test_env("MYCIRCUIT_TEST_SAVE_DIR")?);
  let _ = std::fs::create_dir_all(&dir);
  let name = suggested.and_then(|s| Path::new(s).file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| fallback.into());
  Some(files::free_name(&dir, &name))
}

/// Pages and links that may load inside MyCircuit's own windows.
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
  format!("window.__MYCIRCUIT_BOOT__ = Object.freeze({info});")
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
  file_path: Option<String>,
  content: Option<String>,
  content_base64: Option<String>,
  page_size: Option<String>,
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

fn text_payload(path: &Path) -> Result<Value, String> {
  let content = files::read_text(path).map_err(|e| format!("{}: {e}", path.display()))?;
  Ok(json!({ "filePath": path.to_string_lossy(), "content": content, "encoding": "utf8" }))
}

/// → { canceled } | { canceled: false, filePath, content, encoding } | { canceled: false, files: [...] } (multi)
#[tauri::command]
async fn open_file(app: AppHandle, window: WebviewWindow, opts: FileOpts) -> Result<Value, String> {
  let chosen: Vec<PathBuf> = if let Some(v) = test_env("MYCIRCUIT_TEST_OPEN") {
    v.split('|').map(PathBuf::from).collect()
  } else {
    let d = file_dialog(&app, &window, &FileOpts { default_path: opts.default_path.clone(), ..Default::default() });
    let d = opts.filters.iter().filter(|f| !f.extensions.is_empty()).fold(d, |d, f| {
      let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
      d.add_filter(&f.name, &exts)
    });
    let d = match opts.title.as_deref() {
      Some(t) if !t.is_empty() => d.set_title(t),
      _ => d,
    };
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
    let list = chosen.iter().map(|p| text_payload(p)).collect::<Result<Vec<_>, _>>()?;
    return Ok(json!({ "canceled": false, "files": list }));
  }
  let mut one = text_payload(&chosen[0])?;
  one["canceled"] = json!(false);
  Ok(one)
}

#[tauri::command]
async fn read_path(file_path: String) -> Value {
  match text_payload(Path::new(&file_path)) {
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
  let target = match test_save_path(opts.default_path.as_deref(), "MyCircuit.bin") {
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

// ── Printing ─────────────────────────────────────────────────
/// The page lays out .print-area sheets itself; this opens the print dialog.
#[tauri::command]
fn print_page(window: WebviewWindow) -> Result<bool, String> {
  window.print().map_err(err)?;
  Ok(true)
}

#[tauri::command]
async fn print_to_pdf(app: AppHandle, window: WebviewWindow, opts: FileOpts) -> Result<Value, String> {
  let suggested = opts.default_path.clone().unwrap_or_else(|| format!("{APP_NAME}.pdf"));
  let target = match test_save_path(Some(&suggested), "MyCircuit.pdf") {
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
  match pdf::print_to_pdf(&window, &path, opts.page_size.as_deref().unwrap_or("A4"), opts.landscape).await {
    Ok(()) => Ok(json!({ "canceled": false, "filePath": path.to_string_lossy() })),
    Err(e) => Ok(json!({ "canceled": false, "ok": false, "error": e })),
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
  window.is_maximized().unwrap_or(false)
}

/// Moving by the title bar where the webview has no `app-region: drag`
/// (macOS and Linux); Windows handles the CSS region natively. A dialog window
/// asks through the main page and names itself.
#[tauri::command]
fn win_start_dragging(app: AppHandle, window: WebviewWindow, label: Option<String>) -> bool {
  let target = label.and_then(|l| app.get_webview_window(&l)).unwrap_or(window);
  target.start_dragging().is_ok()
}

/// Interface size (Settings ▸ Appearance), for the calling window or a dialog window.
#[tauri::command]
fn set_zoom(app: AppHandle, window: WebviewWindow, factor: f64, label: Option<String>) -> f64 {
  let z = if factor.is_finite() { factor.clamp(0.75, 1.5) } else { 1.0 };
  let target = label.and_then(|l| app.get_webview_window(&l)).unwrap_or(window);
  let _ = target.set_zoom(z);
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
/// screen the window is on can show.
#[tauri::command]
fn set_min_size(window: WebviewWindow, width: f64, height: f64) -> bool {
  let (_, _, aw, ah) = work_area(&window).unwrap_or((0.0, 0.0, 2400.0, 1600.0));
  let w = (aw - 16.0).min(width.round().clamp(MIN_WIDTH, 2400.0));
  let h = (ah - 16.0).min(height.round().clamp(MIN_HEIGHT, 1600.0));
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
/// and a fixed title) instead of a popup inside the editor. It follows the
/// program's theme (docs/doc-theme.js); `background` is that theme's page colour.
#[tauri::command]
async fn open_manual(app: AppHandle, lang: String, background: Option<String>) -> Result<bool, String> {
  let fill = background.as_deref().and_then(parse_hex_color).unwrap_or(Color(0xff, 0xff, 0xff, 0xff));
  let en = lang == "en";
  let page = if en { "docs/USERSGUIDE.en.html" } else { "docs/USERSGUIDE.ko.html" };
  let title = if en { "User manual — MyCircuit V1.0" } else { "사용자 매뉴얼 — MyCircuit V1.0" };
  if let Some(w) = app.get_webview_window(MANUAL) {
    let _ = w.eval(format!("location.replace({})", json!(format!("/{page}"))));
    let _ = w.set_title(title);
    let _ = w.set_background_color(Some(fill));
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
    .background_color(fill)
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
  if let Some(main) = app.get_webview_window(MAIN) {
    b = b.parent(&main).map_err(err)?;
  }
  let w = b.build().map_err(err)?;
  window_icon::apply(&w);
  Ok(true)
}

// ── Dialog windows ───────────────────────────────────────────
// The page opens each dialog with window.open("about:blank#dialog-…") and builds
// it in that document itself (same origin), so the window only has to exist,
// owned by the main window. It is created hidden; the page measures the
// dialog and calls fit_dialog, which sizes, centres and shows it.
static NEXT_DIALOG: AtomicU32 = AtomicU32::new(1);

pub fn dialog_label(fragment: Option<&str>) -> String {
  fragment
    .filter(|f| f.starts_with("dialog-") && f.len() < 64 && f.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
    .map(str::to_string)
    .unwrap_or_else(|| format!("dialog-{}", NEXT_DIALOG.fetch_add(1, Ordering::Relaxed)))
}

fn dialog_window(app: &AppHandle, url: &Url, features: NewWindowFeatures) -> NewWindowResponse<tauri::Wry> {
  let label = dialog_label(url.fragment());
  if app.get_webview_window(&label).is_some() {
    return NewWindowResponse::Deny;
  }
  let nav = app.clone();
  let mut b = WebviewWindowBuilder::new(app, label, WebviewUrl::External("about:blank".parse().expect("about:blank")))
    .window_features(features)
    .title(app_title(&app.package_info().version.to_string()))
    .decorations(false)
    .resizable(true)
    .maximizable(false)
    .minimizable(false)
    .skip_taskbar(true)
    .visible(false)
    .min_inner_size(DIALOG_MIN_WIDTH, DIALOG_MIN_HEIGHT)
    .background_color(DARK_BACKGROUND)
    .disable_drag_drop_handler()
    .on_navigation(move |url| {
      if is_app_url(url) {
        return true;
      }
      open_outside(&nav, url.as_str());
      false
    });
  if let Some(main) = app.get_webview_window(MAIN) {
    b = match b.parent(&main) {
      Ok(next) => next,
      Err(_) => return NewWindowResponse::Deny,
    };
  }
  match b.build() {
    Ok(window) => {
      window_icon::apply(&window);
      NewWindowResponse::Create { window }
    }
    Err(_) => NewWindowResponse::Deny,
  }
}

/// Size a dialog window (CSS px × zoom = logical px), centre it over the main
/// window inside the work area, and show it.
#[tauri::command]
fn fit_dialog(app: AppHandle, label: String, width: f64, height: f64) -> bool {
  if !label.starts_with("dialog-") {
    return false;
  }
  let Some(dialog) = app.get_webview_window(&label) else {
    return false;
  };
  let main = app.get_webview_window(MAIN);
  let anchor = main.as_ref().unwrap_or(&dialog);
  let (ax, ay, aw, ah) = work_area(anchor).unwrap_or((0.0, 0.0, 1920.0, 1080.0));
  let w = width.round().max(DIALOG_MIN_WIDTH).min(aw);
  let h = height.round().max(DIALOG_MIN_HEIGHT).min(ah);
  let scale = anchor.scale_factor().unwrap_or(1.0);
  let (mx, my, mw, mh) = match (anchor.inner_position(), anchor.inner_size()) {
    (Ok(p), Ok(s)) => {
      let p = p.to_logical::<f64>(scale);
      let s = s.to_logical::<f64>(scale);
      (p.x, p.y, s.width, s.height)
    }
    _ => (ax, ay, aw, ah),
  };
  let (x, y) = centre_in(mx, my, mw, mh, w, h, (ax, ay, aw, ah));
  let _ = dialog.set_size(LogicalSize::new(w, h));
  place_client(&dialog, x, y);
  let _ = dialog.show();
  let _ = dialog.set_focus();
  true
}

/// Top-left of a w × h box centred over (mx, my, mw, mh), at least 24 px below
/// its top, kept inside the work area.
pub fn centre_in(mx: f64, my: f64, mw: f64, mh: f64, w: f64, h: f64, area: (f64, f64, f64, f64)) -> (f64, f64) {
  let (ax, ay, aw, ah) = area;
  let x = (mx + (mw - w) / 2.0).round();
  let y = (my + ((mh - h) / 2.0).max(24.0)).round();
  (x.clamp(ax, (ax + aw - w).max(ax)), y.clamp(ay, (ay + ah - h).max(ay)))
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

#[tauri::command]
fn close_dialog(app: AppHandle, label: String) -> bool {
  if !label.starts_with("dialog-") {
    return false;
  }
  app.get_webview_window(&label).is_some_and(|w| w.destroy().is_ok())
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
    // Files dropped on the window reach the page as HTML drop events (open a
    // project), and parts are dragged from the library the same way.
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
  if window.label() != MAIN {
    return;
  }
  let app = window.app_handle();
  match event {
    // The page decides about unsaved changes and answers with confirm_close.
    WindowEvent::CloseRequested { api, .. } => {
      if !state(app).allow_close.load(Ordering::SeqCst) && state(app).page_ready.load(Ordering::SeqCst) {
        api.prevent_close();
        let _ = app.emit_to(MAIN, "request-close", ());
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
  // One MyCircuit per user. A second launch hands its files to the running one.
  // A run with its own settings folder (the GUI tests) is left alone.
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
      print_page,
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
      set_title_bar,
      open_external,
      open_manual,
      fit_dialog,
      close_dialog,
    ])
    .build(tauri::generate_context!())
    .expect("error while building MyCircuit");

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
    assert_eq!(app_title("1.0.0"), "MyCircuit 1.0");
    assert_eq!(app_title("1.2.3"), "MyCircuit 1.2.3");
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
    assert!(is_app_url(&"http://localhost:5196/docs/USERSGUIDE.ko.html".parse().unwrap()));
    assert!(is_app_url(&"about:blank#dialog-1".parse().unwrap()));
    assert!(!is_app_url(&"https://github.com/".parse().unwrap()));
  }

  #[test]
  fn dialog_labels_are_safe() {
    assert_eq!(dialog_label(Some("dialog-abc-12")), "dialog-abc-12");
    assert!(dialog_label(Some("../evil")).starts_with("dialog-"));
    assert_ne!(dialog_label(Some("../evil")), "../evil");
    assert!(dialog_label(None).starts_with("dialog-"));
  }

  #[test]
  fn dialogs_centre_over_the_main_window_inside_the_screen() {
    let area = (0.0, 0.0, 1920.0, 1040.0);
    assert_eq!(centre_in(100.0, 100.0, 1440.0, 900.0, 720.0, 560.0, area), (460.0, 270.0));
    // Taller than the space below the main window's top: kept on screen.
    assert_eq!(centre_in(1500.0, 900.0, 1440.0, 900.0, 720.0, 560.0, area), (1200.0, 480.0));
    // A short main window still leaves 24 px above the dialog.
    assert_eq!(centre_in(0.0, 0.0, 800.0, 300.0, 400.0, 600.0, area), (200.0, 24.0));
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
