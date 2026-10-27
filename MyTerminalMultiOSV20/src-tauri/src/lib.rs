// MyTerminal desktop program (Tauri 2).
//
// The page is the Electron renderer unchanged (src/renderer): it talks to
// `window.myTerminal`, which src/renderer/js/tauri-bridge.js builds on the
// single `mt` command below, named by the old Electron IPC channel. This
// program answers what needs windows and the operating system:
//   • terminal windows (frameless, transparent; one per detached tab),
//     their size limits, placement memory and maximise state
//   • popups (settings / prompt / SSH / About / errors), the toolbar drop-down
//     window and the tab-detach preview, the tray icon, single instance
//   • folder / picture dialogs, clipboard, opening links and files
//   • pseudo terminals for the programs MyShell runs (pty.rs) and picture
//     work for the wallpaper library (images.rs)
// Everything else — settings.json, wallpapers, MyShell / SSH sessions — is
// the Node host (src/host), started by host.rs and reached by `host.request`.

mod host;
mod images;
mod pty;
mod window_icon;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use host::Host;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::window::Color;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const APP_NAME: &str = "MyTerminal";
/// Fallback until the renderer measures the real toolbar content width.
const TOOLBAR_MIN_WIDTH: f64 = 720.0;
const WINDOW_MIN_HEIGHT: f64 = 420.0;
const TOOLBAR_MIN_WIDTH_CAP: f64 = 1800.0;
const MAIN_PREFIX: &str = "main-";
const POPUP_PREFIX: &str = "popup-";
const DROPDOWN: &str = "dropdown";
const PREVIEW: &str = "detach-preview";
const INDEX_PAGE: &str = "src/renderer/index.html";
const POPUP_PAGE: &str = "src/renderer/popup.html";
const DROPDOWN_PAGE: &str = "src/renderer/dropdown.html";
const PREVIEW_PAGE: &str = "src/renderer/detach-preview.html";
const TRAY_ID: &str = "myterminal";
const BRIDGE: &str = include_str!("../../src/renderer/js/tauri-bridge.js");
/// Wallpaper picker filters (the same list the Node host accepts).
const BG_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "jfif", "webp", "gif", "bmp", "avif", "tif", "tiff", "svg", "ico"];

struct Popup {
    owner: String,
    kind: String,
    shown: bool,
}

#[derive(Default)]
struct Dropdown {
    owner: Option<String>,
    menu_id: String,
    x: f64,
    y: f64,
    open: bool,
    /// The menu page listens (it asked for its contents once).
    ready: bool,
    pending: Option<Value>,
    serial: u64,
}

#[derive(Default)]
struct Preview {
    hint: Option<String>,
}

pub struct AppState {
    config_dir: PathBuf,
    host: OnceLock<Arc<Host>>,
    next_main: AtomicU32,
    next_popup: AtomicU32,
    next_pty: AtomicU64,
    focus_seq: AtomicU64,
    focus: Mutex<HashMap<String, u64>>,
    min_size: Mutex<HashMap<String, (f64, f64)>>,
    maximized: Mutex<HashMap<String, bool>>,
    save_serial: Mutex<HashMap<String, u64>>,
    revealed: Mutex<HashMap<String, bool>>,
    popups: Mutex<HashMap<String, Popup>>,
    dropdown: Mutex<Dropdown>,
    preview: Mutex<Preview>,
    merge_target: Mutex<Option<String>>,
    ptys: Mutex<HashMap<String, Arc<pty::Pty>>>,
    quitting: AtomicBool,
}

fn state<R: Runtime>(app: &AppHandle<R>) -> tauri::State<'_, AppState> {
    app.state::<AppState>()
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn host(app: &AppHandle) -> Result<Arc<Host>, String> {
    state(app).host.get().cloned().ok_or_else(|| "The terminal host is not running".to_string())
}

/// process.platform names, which the page already knows.
pub fn node_platform() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

// ── Folders ──────────────────────────────────────────────────
/// %APPDATA%\MyTerminal, ~/Library/Application Support/MyTerminal,
/// ~/.config/MyTerminal: the folder the Electron build used (settings,
/// shell memory, wallpapers carry over). MYTERMINAL_CONFIG_DIR points tests
/// at a scratch folder (with its own webview profile, no single-instance lock).
fn config_dir() -> PathBuf {
    if let Some(over) = test_config_dir() {
        return over;
    }
    let home = home_dir();
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Roaming"))
    } else if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support")
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".config"))
    };
    base.join(APP_NAME)
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

fn test_config_dir() -> Option<PathBuf> {
    std::env::var_os("MYTERMINAL_CONFIG_DIR").filter(|v| !v.is_empty()).map(PathBuf::from)
}

/// Every webview of one profile must share its data folder; tests get their own.
fn webview_data_dir() -> Option<PathBuf> {
    test_config_dir().map(|d| d.join("webview"))
}

/// \\?\C:\… → C:\… (Node cannot start a script given as a verbatim path).
fn plain_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
}

fn node_on_path() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    std::env::split_paths(&path).map(|d| d.join(name)).find(|c| c.is_file())
}

/// Release builds run the bundled runtime and host (resources/sidecar);
/// debug builds the project's src/host with the Node on PATH.
fn host_launch(app: &tauri::App) -> Result<host::Launch, String> {
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let resource_dir = app.path().resource_dir().map(|d| plain_path(&d)).unwrap_or_default();
    let sidecar = resource_dir.join("sidecar");
    let (bundled_node, script) = if cfg!(debug_assertions) || !sidecar.join("host.js").is_file() {
        let root = plain_path(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
        (None, root.join("src").join("host").join("host.js"))
    } else {
        (Some(sidecar.join(node_name)).filter(|p| p.is_file()), sidecar.join("host.js"))
    };
    let node = std::env::var_os("MYTERMINAL_NODE")
        .map(PathBuf::from)
        .or(bundled_node)
        .or_else(node_on_path)
        .ok_or("Node.js was not found. Install Node.js, or use the installed MyTerminal (it brings its own).")?;
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(plain_path)).unwrap_or_default();
    let build_date = {
        let secs: u64 = env!("MYTERMINAL_BUILD_EPOCH").parse().unwrap_or(0);
        iso_date(secs)
    };
    let env = vec![
        ("MYTERMINAL_USER_DATA".into(), state_dir_string(app)),
        ("MYTERMINAL_RESOURCE_DIR".into(), resource_dir.to_string_lossy().to_string()),
        ("MYTERMINAL_APP_DIR".into(), exe_dir.to_string_lossy().to_string()),
        ("MYTERMINAL_VERSION".into(), app.package_info().version.to_string()),
        ("MYTERMINAL_TAURI".into(), tauri::VERSION.to_string()),
        ("MYTERMINAL_WEBVIEW".into(), tauri::webview_version().unwrap_or_default()),
        ("MYTERMINAL_BUILD_DATE".into(), build_date),
    ];
    Ok(host::Launch { node, script, env })
}

fn state_dir_string(app: &tauri::App) -> String {
    app.state::<AppState>().config_dir.to_string_lossy().to_string()
}

/// Seconds since 1970 → 2026-10-27T03:04:05.000Z (About › build date).
fn iso_date(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Civil from days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z", rem / 3600, (rem % 3600) / 60, rem % 60)
}

// ── Window helpers ───────────────────────────────────────────
fn is_main(label: &str) -> bool {
    label.starts_with(MAIN_PREFIX)
}

fn main_id(label: &str) -> Option<u32> {
    label.strip_prefix(MAIN_PREFIX).and_then(|n| n.parse().ok())
}

fn main_windows(app: &AppHandle) -> Vec<WebviewWindow> {
    let mut list: Vec<WebviewWindow> = app.webview_windows().into_values().filter(|w| is_main(w.label())).collect();
    list.sort_by_key(|w| main_id(w.label()).unwrap_or(0));
    list
}

/// Electron's webContents.send: one event per window, `mt:<label>`.
fn emit(app: &AppHandle, label: &str, channel: &str, payload: Value) {
    let _ = app.emit_to(label, &format!("mt:{label}"), json!({ "ch": channel, "p": payload }));
}

fn boot_script(label: &str) -> String {
    let boot = json!({ "platform": node_platform(), "label": label });
    format!("window.__MYTERMINAL_BOOT__ = Object.freeze({boot});\n{BRIDGE}")
}

pub fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "blob" | "data" | "about" => true,
        "http" | "https" => matches!(url.host_str(), Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")),
        _ => false,
    }
}

fn is_web_link(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn builder<'a>(app: &'a AppHandle, label: &str, page: &str) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let nav_app = app.clone();
    let mut b = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title(APP_NAME)
        .initialization_script(boot_script(label))
        .on_navigation(move |url| {
            if is_app_url(url) {
                return true;
            }
            // A link the page did not route through openExternal: the browser opens it.
            if is_web_link(url.as_str()) {
                let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        });
    if let Some(dir) = webview_data_dir() {
        b = b.data_directory(dir);
    }
    b
}

fn logical_inner_rect(w: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let scale = w.scale_factor().ok()?;
    let pos = w.inner_position().ok()?;
    let size = w.inner_size().ok()?;
    Some((f64::from(pos.x) / scale, f64::from(pos.y) / scale, f64::from(size.width) / scale, f64::from(size.height) / scale))
}

fn logical_outer_rect(w: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let scale = w.scale_factor().ok()?;
    let pos = w.outer_position().ok()?;
    let size = w.outer_size().ok()?;
    Some((f64::from(pos.x) / scale, f64::from(pos.y) / scale, f64::from(size.width) / scale, f64::from(size.height) / scale))
}

fn rect_json(r: (f64, f64, f64, f64)) -> Value {
    json!({ "x": r.0.round(), "y": r.1.round(), "width": r.2.round(), "height": r.3.round() })
}

/// A monitor's work area in its own logical pixels.
fn work_area(m: &tauri::Monitor) -> (f64, f64, f64, f64) {
    let s = m.scale_factor();
    let a = m.work_area();
    (f64::from(a.position.x) / s, f64::from(a.position.y) / s, f64::from(a.size.width) / s, f64::from(a.size.height) / s)
}

fn window_work_area(w: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    w.current_monitor().ok().flatten().or_else(|| w.primary_monitor().ok().flatten()).map(|m| work_area(&m))
}

/// The work area around a logical point (`scale` converts it for the lookup).
fn work_area_at(app: &AppHandle, x: f64, y: f64, scale: f64) -> Option<(f64, f64, f64, f64)> {
    app.monitor_from_point(x * scale, y * scale)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .map(|m| work_area(&m))
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64).filter(|n| n.is_finite())
}

fn text(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn parse_color(hex: &str) -> Option<Color> {
    let h = hex.trim().trim_start_matches('#');
    let byte = |i: usize| u8::from_str_radix(h.get(i..i + 2)?, 16).ok();
    match h.len() {
        6 => Some(Color(byte(0)?, byte(2)?, byte(4)?, 255)),
        8 => Some(Color(byte(0)?, byte(2)?, byte(4)?, byte(6)?)),
        3 => {
            let c = |i: usize| u8::from_str_radix(&h[i..i + 1].repeat(2), 16).ok();
            Some(Color(c(0)?, c(1)?, c(2)?, 255))
        }
        _ => None,
    }
}

fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

// ── Terminal windows ─────────────────────────────────────────
#[derive(Default)]
struct MainOpts {
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
    adopt: Option<String>,
    no_focus: bool,
}

/// Saved placement brought back on screen (Electron ensureBoundsOnScreen).
fn ensure_bounds_on_screen(app: &AppHandle, x: Option<f64>, y: Option<f64>, width: f64, height: f64) -> (Option<f64>, Option<f64>, f64, f64) {
    let width = TOOLBAR_MIN_WIDTH.max(width.round().min(TOOLBAR_MIN_WIDTH_CAP));
    let height = WINDOW_MIN_HEIGHT.max(height.round().min(10000.0));
    let monitors = app.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        return (x, y, width, height);
    }
    if let (Some(px), Some(py)) = (x, y) {
        let on_screen = monitors.iter().map(work_area).any(|a| {
            px + width > a.0 + 40.0 && px < a.0 + a.2 - 40.0 && py + height > a.1 + 40.0 && py < a.1 + a.3 - 40.0
        });
        if on_screen {
            return (x, y, width, height);
        }
    }
    let primary = app.primary_monitor().ok().flatten().map(|m| work_area(&m)).unwrap_or_else(|| work_area(&monitors[0]));
    let w = width.min(primary.2);
    let h = height.min(primary.3);
    (Some((primary.0 + (primary.2 - w) / 2.0).round()), Some((primary.1 + (primary.3 - h) / 2.0).round()), w, h)
}

fn create_main_window(app: &AppHandle, settings: &Value, opts: MainOpts) -> Result<WebviewWindow, String> {
    let saved = settings.get("windowBounds").filter(|b| b.is_object());
    let restored_max = settings.get("windowMaximized").and_then(Value::as_bool).unwrap_or(false);
    let (rx, ry, rh) = match saved {
        Some(b) => {
            let (x, y, _w, h) = ensure_bounds_on_screen(app, num(b, "x"), num(b, "y"), num(b, "width").unwrap_or(1100.0), num(b, "height").unwrap_or(720.0));
            (x, y, Some(h))
        }
        None => (None, None, None),
    };
    let explicit_size = opts.width.is_some() || opts.height.is_some();
    let explicit_pos = opts.x.is_some() || opts.y.is_some();
    // Width starts at the toolbar minimum; the renderer refines it (setMinSize resizeToMin),
    // so a previously runaway size cannot reopen ultra-wide.
    let width = TOOLBAR_MIN_WIDTH.max(opts.width.unwrap_or(TOOLBAR_MIN_WIDTH).round());
    let height = WINDOW_MIN_HEIGHT.max(opts.height.or(rh).unwrap_or(720.0).round());
    let (x, y) = if explicit_pos { (opts.x, opts.y) } else { (rx, ry) };
    let should_maximize = !explicit_size && opts.adopt.is_none() && restored_max;

    let st = state(app);
    let n = st.next_main.fetch_add(1, Ordering::SeqCst) + 1;
    let label = format!("{MAIN_PREFIX}{n}");
    let page = match &opts.adopt {
        Some(id) => format!("{INDEX_PAGE}?adopt={}", percent_encode(id)),
        None => INDEX_PAGE.to_string(),
    };
    let focus = !opts.no_focus;
    let reveal_app = app.clone();
    let mut b = builder(app, &label, &page)
        .inner_size(width, height)
        .min_inner_size(TOOLBAR_MIN_WIDTH, WINDOW_MIN_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .resizable(true)
        .visible(false)
        .on_page_load(move |w, payload| {
            if payload.event() == PageLoadEvent::Finished {
                reveal_main(&reveal_app, &w, should_maximize, focus);
            }
        });
    if let (Some(x), Some(y)) = (x, y) {
        b = b.position(x, y);
    }
    let win = b.build().map_err(err)?;
    window_icon::apply(&win);
    st.min_size.lock().unwrap().insert(label.clone(), (TOOLBAR_MIN_WIDTH, WINDOW_MIN_HEIGHT));
    st.maximized.lock().unwrap().insert(label.clone(), false);
    let ev_app = app.clone();
    let ev_label = label.clone();
    win.on_window_event(move |event| main_window_event(&ev_app, &ev_label, event));
    // Never stay hidden, even if the page fails to report.
    let fallback_app = app.clone();
    let fallback_label = label.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(3000));
        if let Some(w) = fallback_app.get_webview_window(&fallback_label) {
            reveal_main(&fallback_app, &w, should_maximize, focus);
        }
    });
    Ok(win)
}

fn reveal_main(app: &AppHandle, w: &WebviewWindow, maximize: bool, focus: bool) {
    {
        let st = state(app);
        let mut revealed = st.revealed.lock().unwrap();
        if revealed.insert(w.label().to_string(), true).is_some() {
            return;
        }
    }
    if maximize {
        let _ = w.maximize();
    }
    let _ = w.show();
    if focus {
        let _ = w.set_focus();
    }
}

fn main_window_event(app: &AppHandle, label: &str, event: &WindowEvent) {
    match event {
        WindowEvent::Focused(true) => {
            let st = state(app);
            let seq = st.focus_seq.fetch_add(1, Ordering::SeqCst) + 1;
            st.focus.lock().unwrap().insert(label.to_string(), seq);
        }
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            if let Some(w) = app.get_webview_window(label) {
                let now = w.is_maximized().unwrap_or(false);
                let changed = {
                    let st = state(app);
                    let mut map = st.maximized.lock().unwrap();
                    let before = map.insert(label.to_string(), now).unwrap_or(false);
                    before != now
                };
                if changed {
                    emit(app, label, "window:maximized", json!(now));
                }
            }
            schedule_save_window_state(app, label);
        }
        WindowEvent::CloseRequested { .. } => {
            if let Some(w) = app.get_webview_window(label) {
                save_window_state(app, &w);
            }
            // The window's dialogs (settings / SSH / About) go with it.
            close_popups_for_owner(app, label);
            close_dropdown_for_owner(app, label);
        }
        WindowEvent::Destroyed => {
            let st = state(app);
            st.min_size.lock().unwrap().remove(label);
            st.maximized.lock().unwrap().remove(label);
            st.focus.lock().unwrap().remove(label);
            st.save_serial.lock().unwrap().remove(label);
            st.revealed.lock().unwrap().remove(label);
            if st.merge_target.lock().unwrap().as_deref() == Some(label) {
                *st.merge_target.lock().unwrap() = None;
            }
            close_popups_for_owner(app, label);
            close_dropdown_for_owner(app, label);
            if let Ok(h) = host(app) {
                h.send(&json!({ "t": "win-closed", "win": label }));
            }
            // Last terminal window gone → quit now (helper windows — the hidden
            // menu and tab-detach preview — would otherwise keep the process).
            let remaining = main_windows(app).into_iter().filter(|w| w.label() != label).count();
            if remaining == 0 && !st.quitting.load(Ordering::SeqCst) && !cfg!(target_os = "macos") {
                quit_app(app);
            }
        }
        _ => {}
    }
}

fn save_window_state(app: &AppHandle, w: &WebviewWindow) {
    if w.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = w.is_maximized().unwrap_or(false);
    // Maximised: keep the normal placement saved before.
    let patch = if maximized {
        json!({ "windowMaximized": true })
    } else {
        let Some((x, y, _, _)) = logical_outer_rect(w) else { return };
        let Some((_, _, width, height)) = logical_inner_rect(w) else { return };
        json!({
            "windowBounds": { "x": x.round(), "y": y.round(), "width": width.round(), "height": height.round() },
            "windowMaximized": false,
        })
    };
    if let Ok(h) = host(app) {
        tauri::async_runtime::spawn(async move {
            let _ = h.request(None, "settings:update", patch).await;
        });
    }
}

fn schedule_save_window_state(app: &AppHandle, label: &str) {
    let serial = {
        let st = state(app);
        let mut map = st.save_serial.lock().unwrap();
        let next = map.get(label).copied().unwrap_or(0) + 1;
        map.insert(label.to_string(), next);
        next
    };
    let app = app.clone();
    let label = label.to_string();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(250)).await;
        let current = state(&app).save_serial.lock().unwrap().get(&label).copied();
        if current == Some(serial) {
            if let Some(w) = app.get_webview_window(&label) {
                save_window_state(&app, &w);
            }
        }
    });
}

async fn open_main_window(app: &AppHandle, opts: MainOpts) -> Result<WebviewWindow, String> {
    let settings = host(app)?.request(None, "settings:get", Value::Null).await.unwrap_or_else(|_| json!({}));
    create_main_window(app, &settings, opts)
}

/// Tear everything down and quit (tray, popups, preview, shells).
fn quit_app(app: &AppHandle) {
    let st = state(app);
    if st.quitting.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.remove_tray_by_id(TRAY_ID);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for (label, w) in app.webview_windows() {
            if !is_main(&label) {
                let _ = w.destroy();
            }
        }
        if let Ok(h) = host(&app) {
            let _ = tokio::time::timeout(Duration::from_secs(4), h.request(None, "host:quit", Value::Null)).await;
        }
        for w in main_windows(&app) {
            let _ = w.destroy();
        }
        if let Ok(h) = host(&app) {
            h.stop();
        }
        app.exit(0);
    });
}

fn focused_or_first_main(app: &AppHandle) -> Option<WebviewWindow> {
    let list = main_windows(app);
    list.iter().find(|w| w.is_focused().unwrap_or(false)).cloned().or_else(|| list.into_iter().next())
}

fn bring_forward(w: &WebviewWindow) {
    if w.is_minimized().unwrap_or(false) {
        let _ = w.unminimize();
    }
    let _ = w.show();
    let _ = w.set_focus();
}

// ── Tray ─────────────────────────────────────────────────────
fn show_window(app: &AppHandle, open_settings: bool) {
    if let Some(w) = focused_or_first_main(app) {
        bring_forward(&w);
        if open_settings {
            emit(app, w.label(), "tray:openSettings", Value::Null);
        }
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(w) = open_main_window(&app, MainOpts::default()).await {
            if open_settings {
                // The new page listens once it has booted.
                tokio::time::sleep(Duration::from_millis(1500)).await;
                emit(&app, w.label(), "tray:openSettings", Value::Null);
            }
        }
    });
}

fn apply_tray(app: &AppHandle, enabled: bool, lang: &str) {
    if !enabled {
        let _ = app.remove_tray_by_id(TRAY_ID);
        for w in main_windows(app) {
            if !w.is_visible().unwrap_or(true) {
                let _ = w.show();
            }
        }
        return;
    }
    let (show, settings, quit) = if lang == "ko" { ("열기", "설정", "종료") } else { ("Show", "Settings", "Quit") };
    let menu = (|| -> tauri::Result<Menu<tauri::Wry>> {
        let show = MenuItem::with_id(app, "show", show, true, None::<&str>)?;
        let settings = MenuItem::with_id(app, "settings", settings, true, None::<&str>)?;
        let sep = PredefinedMenuItem::separator(app)?;
        let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
        Menu::with_items(app, &[&show, &settings, &sep, &quit])
    })();
    let Ok(menu) = menu else { return };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_tooltip(Some(APP_NAME));
        return;
    }
    let mut b = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_window(app, false),
            "settings" => show_window(app, true),
            "quit" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }
            | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => show_window(tray.app_handle(), true),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    let _ = b.build(app);
}

// ── Popups (settings / prompt / SSH / About / error) ─────────
fn popup_open(app: &AppHandle, owner: &WebviewWindow, a: &Value) -> Result<Value, String> {
    let st = state(app);
    let n = st.next_popup.fetch_add(1, Ordering::SeqCst) + 1;
    let id = format!("{POPUP_PREFIX}{n}");
    let kind = Some(text(a, "kind")).filter(|k| !k.is_empty()).unwrap_or_else(|| "generic".into());
    let width = num(a, "width").filter(|v| *v > 0.0).unwrap_or(520.0).max(360.0);
    let height = num(a, "height").filter(|v| *v > 0.0).unwrap_or(560.0).max(240.0);
    let min_w = num(a, "minWidth").filter(|v| *v > 0.0).unwrap_or(360.0);
    let min_h = num(a, "minHeight").filter(|v| *v > 0.0).unwrap_or(220.0);
    let bg = parse_color(&text(a, "backgroundColor")).unwrap_or(Color(0x25, 0x25, 0x26, 0xff));
    let resizable = a.get("resizable").and_then(Value::as_bool) != Some(false);
    let (x, y) = match logical_outer_rect(owner) {
        Some((bx, by, bw, bh)) => ((bx + (bw - width) / 2.0).round(), (by + 40f64.max((bh - height) / 2.0)).round()),
        None => match window_work_area(owner) {
            Some(d) => ((d.0 + (d.2 - width) / 2.0).round(), (d.1 + (d.3 - height) / 2.0).round()),
            None => (100.0, 100.0),
        },
    };
    let page = format!("{POPUP_PAGE}?id={}&kind={}", percent_encode(&id), percent_encode(&kind));
    st.popups.lock().unwrap().insert(id.clone(), Popup { owner: owner.label().to_string(), kind: kind.clone(), shown: false });
    let win = builder(app, &id, &page)
        .inner_size(width, height)
        .min_inner_size(min_w, min_h)
        .position(x, y)
        .decorations(false)
        .transparent(false)
        .background_color(bg)
        .resizable(resizable)
        .maximizable(false)
        .minimizable(true)
        .visible(false)
        .build();
    let win = match win {
        Ok(w) => w,
        Err(e) => {
            st.popups.lock().unwrap().remove(&id);
            return Err(err(e));
        }
    };
    window_icon::apply(&win);
    let ev_app = app.clone();
    let ev_id = id.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let entry = state(&ev_app).popups.lock().unwrap().remove(&ev_id);
            if let Some(p) = entry {
                emit(&ev_app, &p.owner, "popup:event", json!({ "id": ev_id, "kind": p.kind, "type": "closed" }));
            }
        }
    });
    // The page shows itself once mounted and sized (popup:show); this is the safety net.
    let fallback_app = app.clone();
    let fallback_id = id.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(2500));
        show_popup(&fallback_app, &fallback_id);
    });
    Ok(json!({ "id": id, "kind": kind }))
}

fn show_popup(app: &AppHandle, id: &str) -> bool {
    let first = {
        let st = state(app);
        let mut popups = st.popups.lock().unwrap();
        let Some(p) = popups.get_mut(id) else { return false };
        !std::mem::replace(&mut p.shown, true)
    };
    if first {
        if let Some(w) = app.get_webview_window(id) {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
    true
}

fn popup_fit(app: &AppHandle, a: &Value) -> Value {
    let id = text(a, "id");
    if !state(app).popups.lock().unwrap().contains_key(&id) {
        return Value::Null;
    }
    let Some(w) = app.get_webview_window(&id) else { return Value::Null };
    let Some((_, _, cw, ch)) = logical_inner_rect(&w) else { return Value::Null };
    let area = window_work_area(&w).unwrap_or((0.0, 0.0, 1920.0, 1080.0));
    let mut width = num(a, "width").filter(|v| *v > 0.0).unwrap_or(cw).ceil().max(360.0);
    let mut height = num(a, "height").filter(|v| *v > 0.0).unwrap_or(ch).ceil().max(220.0);
    // Clamp to the work area so the popup stays usable without inner scroll.
    width = width.min(360f64.max(area.2 - 16.0));
    height = height.min(220f64.max(area.3 - 16.0));
    let _ = w.set_size(LogicalSize::new(width, height));
    if let Some((bx, by, bw, bh)) = logical_outer_rect(&w) {
        let mut x = bx;
        let mut y = by;
        if x + bw > area.0 + area.2 {
            x = area.0 + area.2 - bw;
        }
        if y + bh > area.1 + area.3 {
            y = area.1 + area.3 - bh;
        }
        x = x.max(area.0);
        y = y.max(area.1);
        let _ = w.set_position(LogicalPosition::new(x.round(), y.round()));
    }
    json!({ "width": width, "height": height, "prev": { "cw": cw.round(), "ch": ch.round() } })
}

fn popup_send(app: &AppHandle, sender: &str, a: &Value) -> bool {
    let id = text(a, "id");
    let message = a.get("message").cloned().filter(|m| m.is_object()).unwrap_or_else(|| json!({}));
    let (owner, kind) = {
        let st = state(app);
        let popups = st.popups.lock().unwrap();
        let Some(p) = popups.get(&id) else { return false };
        (p.owner.clone(), p.kind.clone())
    };
    if sender == owner {
        emit(app, &id, "popup:message", message);
        return true;
    }
    if sender == id {
        let mut payload = json!({ "id": id, "kind": kind });
        if let (Some(obj), Some(extra)) = (payload.as_object_mut(), message.as_object()) {
            for (k, v) in extra {
                obj.insert(k.clone(), v.clone());
            }
        }
        emit(app, &owner, "popup:event", payload);
        return true;
    }
    false
}

/// Close every popup owned by a window (its settings / SSH / About dialogs).
fn close_popups_for_owner(app: &AppHandle, owner: &str) {
    let ids: Vec<String> = {
        let st = state(app);
        let mut popups = st.popups.lock().unwrap();
        let ids: Vec<String> = popups.iter().filter(|(_, p)| p.owner == owner).map(|(id, _)| id.clone()).collect();
        for id in &ids {
            popups.remove(id);
        }
        ids
    };
    for id in ids {
        if let Some(w) = app.get_webview_window(&id) {
            let _ = w.destroy();
        }
    }
}

// ── Toolbar drop-down (a window, so it can reach past the main window) ──
fn ensure_dropdown(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(DROPDOWN) {
        return Ok(w);
    }
    let w = builder(app, DROPDOWN, DROPDOWN_PAGE)
        .inner_size(280.0, 80.0)
        .decorations(false)
        .transparent(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(true)
        .focused(false)
        .visible(false)
        .build()
        .map_err(err)?;
    let ev_app = app.clone();
    w.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => {
            let serial = {
                let st = state(&ev_app);
                let dd = st.dropdown.lock().unwrap();
                if !dd.open {
                    return;
                }
                dd.serial
            };
            let app = ev_app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(80));
                let same = {
                    let st = state(&app);
                    let dd = st.dropdown.lock().unwrap();
                    dd.open && dd.serial == serial
                };
                if same {
                    close_dropdown(&app);
                }
            });
        }
        WindowEvent::Destroyed => {
            let st = state(&ev_app);
            let mut dd = st.dropdown.lock().unwrap();
            dd.ready = false;
            dd.pending = None;
            if dd.open {
                dd.open = false;
                if let Some(owner) = dd.owner.clone() {
                    emit(&ev_app, &owner, "dropdown:event", json!({ "menuId": dd.menu_id, "type": "closed" }));
                }
            }
        }
        _ => {}
    });
    Ok(w)
}

fn close_dropdown(app: &AppHandle) {
    let notify = {
        let st = state(app);
        let mut dd = st.dropdown.lock().unwrap();
        if !dd.open {
            return;
        }
        dd.open = false;
        dd.serial += 1;
        dd.pending = None;
        dd.owner.clone().map(|o| (o, dd.menu_id.clone()))
    };
    if let Some(w) = app.get_webview_window(DROPDOWN) {
        let _ = w.hide();
    }
    if let Some((owner, menu_id)) = notify {
        emit(app, &owner, "dropdown:event", json!({ "menuId": menu_id, "type": "closed" }));
    }
}

fn close_dropdown_for_owner(app: &AppHandle, owner: &str) {
    let mine = {
        let st = state(app);
        let dd = st.dropdown.lock().unwrap();
        dd.open && dd.owner.as_deref() == Some(owner)
    };
    if mine {
        close_dropdown(app);
    }
}

fn dropdown_open(app: &AppHandle, owner: &WebviewWindow, a: &Value) -> Result<Value, String> {
    close_dropdown(app);
    let w = ensure_dropdown(app)?;
    let (ix, iy, _, _) = logical_inner_rect(owner).ok_or("No window")?;
    let anchor = a.get("anchor").cloned().unwrap_or_else(|| json!({}));
    let x = (ix + num(&anchor, "left").unwrap_or(0.0)).round();
    let y = (iy + num(&anchor, "bottom").unwrap_or(0.0) + 6.0).round();
    let colors = a.get("colors").cloned().filter(|c| c.is_object()).unwrap_or_else(|| json!({}));
    if let Some(bg) = parse_color(&text(&colors, "toolbarBg")) {
        let _ = w.set_background_color(Some(bg));
    }
    let menu_id = text(a, "menuId");
    let payload = json!({ "html": text(a, "html"), "colors": colors, "menuId": menu_id });
    let ready = {
        let st = state(app);
        let mut dd = st.dropdown.lock().unwrap();
        dd.owner = Some(owner.label().to_string());
        dd.menu_id = menu_id;
        dd.x = x;
        dd.y = y;
        dd.open = true;
        dd.serial += 1;
        if !dd.ready {
            dd.pending = Some(payload.clone());
        }
        dd.ready
    };
    if ready {
        emit(app, DROPDOWN, "dropdown:init", payload);
    }
    Ok(json!(true))
}

fn dropdown_fit(app: &AppHandle, a: &Value) -> Value {
    let (x, y) = {
        let st = state(app);
        let dd = st.dropdown.lock().unwrap();
        if !dd.open {
            return Value::Null;
        }
        (dd.x, dd.y)
    };
    let Some(w) = app.get_webview_window(DROPDOWN) else { return Value::Null };
    let width = num(a, "width").unwrap_or(160.0).ceil().max(160.0);
    let height = num(a, "height").unwrap_or(40.0).ceil().max(40.0);
    let scale = w.scale_factor().unwrap_or(1.0);
    let (mut nx, mut ny) = (x, y);
    if let Some(d) = work_area_at(app, x, y, scale) {
        if nx + width > d.0 + d.2 {
            nx = d.0 + d.2 - width;
        }
        if ny + height > d.1 + d.3 {
            ny = y - 6.0 - height;
        }
        ny = ny.max(d.1);
        nx = nx.max(d.0);
    }
    let _ = w.set_size(LogicalSize::new(width, height));
    let _ = w.set_position(LogicalPosition::new(nx.round(), ny.round()));
    let _ = w.show();
    let _ = w.set_focus();
    json!({ "x": nx.round(), "y": ny.round(), "width": width, "height": height })
}

fn dropdown_pick(app: &AppHandle, a: &Value) -> bool {
    let target = {
        let st = state(app);
        let dd = st.dropdown.lock().unwrap();
        if !dd.open {
            return false;
        }
        dd.owner.clone().map(|o| (o, dd.menu_id.clone()))
    };
    if let Some((owner, menu_id)) = target {
        let dataset = a.get("dataset").cloned().unwrap_or_else(|| json!({}));
        emit(app, &owner, "dropdown:event", json!({ "menuId": menu_id, "type": "pick", "dataset": dataset }));
    }
    close_dropdown(app);
    true
}

// ── Tab-detach preview (transparent, click-through, never focused) ──
fn ensure_preview(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(PREVIEW) {
        return Ok(w);
    }
    let w = builder(app, PREVIEW, PREVIEW_PAGE)
        .inner_size(640.0, 420.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .always_on_top(true)
        .visible(false)
        .build()
        .map_err(err)?;
    let _ = w.set_ignore_cursor_events(true);
    Ok(w)
}

fn preview_show(app: &AppHandle, a: &Value) -> Result<Value, String> {
    let w = ensure_preview(app)?;
    let width = num(a, "width").unwrap_or(640.0).round().max(360.0);
    let height = num(a, "height").unwrap_or(420.0).round().max(240.0);
    let x = num(a, "x").unwrap_or(0.0).round();
    let y = num(a, "y").unwrap_or(0.0).round();
    let hint = text(a, "hint");
    let changed = {
        let st = state(app);
        let mut p = st.preview.lock().unwrap();
        let changed = p.hint.as_deref() != Some(hint.as_str());
        p.hint = Some(hint.clone());
        changed
    };
    if changed {
        if let Ok(mut url) = w.url() {
            let query = format!("hint={}", percent_encode(&hint));
            url.set_query(if hint.is_empty() { None } else { Some(&query) });
            let _ = w.navigate(url);
        }
    }
    let _ = w.set_size(LogicalSize::new(width, height));
    let _ = w.set_position(LogicalPosition::new(x, y));
    window_icon::show_native(&w, true);
    Ok(json!(true))
}

// ── Tab drag between windows ─────────────────────────────────
/// The other MyTerminal window under a screen point (most recently focused first).
fn find_window_at_point(app: &AppHandle, px: f64, py: f64, exclude: &str) -> Option<WebviewWindow> {
    let st = state(app);
    let focus = st.focus.lock().unwrap().clone();
    let mut hits: Vec<WebviewWindow> = main_windows(app)
        .into_iter()
        .filter(|w| w.label() != exclude && w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
        .filter(|w| {
            let (Ok(pos), Ok(size)) = (w.inner_position(), w.inner_size()) else { return false };
            px >= f64::from(pos.x) && px < f64::from(pos.x) + f64::from(size.width) && py >= f64::from(pos.y) && py < f64::from(pos.y) + f64::from(size.height)
        })
        .collect();
    hits.sort_by_key(|w| std::cmp::Reverse(focus.get(w.label()).copied().unwrap_or(0)));
    hits.iter().find(|w| w.is_focused().unwrap_or(false)).cloned().or_else(|| hits.into_iter().next())
}

fn clear_merge_preview_except(app: &AppHandle, keep: Option<&str>) {
    for w in main_windows(app) {
        if Some(w.label()) != keep {
            emit(app, w.label(), "session:mergePreviewClear", Value::Null);
        }
    }
}

fn send_merge_preview(app: &AppHandle, source: &str, a: &Value) {
    let target = num(a, "targetWindowId")
        .filter(|n| *n > 0.0)
        .map(|n| format!("{MAIN_PREFIX}{}", n as u32))
        .filter(|l| l != source && app.get_webview_window(l).is_some());
    let st = state(app);
    let Some(target) = target else {
        clear_merge_preview_except(app, None);
        *st.merge_target.lock().unwrap() = None;
        return;
    };
    let changed = st.merge_target.lock().unwrap().as_deref() != Some(target.as_str());
    if changed {
        clear_merge_preview_except(app, Some(&target));
        *st.merge_target.lock().unwrap() = Some(target.clone());
    }
    emit(
        app,
        &target,
        "session:mergePreview",
        json!({
            "sessionId": a.get("sessionId").map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())).unwrap_or_default(),
            "title": text(a, "title"),
            "mode": Some(text(a, "mode")).filter(|m| !m.is_empty()).unwrap_or_else(|| "local".into()),
            "screenX": a.get("screenX").cloned().unwrap_or(Value::Null),
            "screenY": a.get("screenY").cloned().unwrap_or(Value::Null),
        }),
    );
}

fn session_id_of(a: &Value) -> String {
    match a.get("sessionId") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

async fn session_detach(app: &AppHandle, source: &WebviewWindow, a: &Value) -> Result<Value, String> {
    let session_id = session_id_of(a);
    if session_id.is_empty() {
        return Ok(json!({ "ok": false, "error": "Invalid detach request" }));
    }
    let h = host(app)?;
    let stashed = h.request(Some(source.label()), "session:stashAdopt", a.clone()).await?;
    if stashed.get("ok").and_then(Value::as_bool) != Some(true) {
        return Ok(json!({ "ok": false, "error": "Session not found" }));
    }
    let scale = source.scale_factor().unwrap_or(1.0);
    let cursor = app.cursor_position().ok().map(|p| (p.x / scale, p.y / scale)).unwrap_or((100.0, 100.0));
    let width = num(a, "width").filter(|v| *v > 0.0).unwrap_or(1000.0);
    let height = num(a, "height").filter(|v| *v > 0.0).unwrap_or(680.0);
    let mut x = (cursor.0 - 80.0).round();
    let mut y = (cursor.1 - 20.0).round();
    if let Some(d) = work_area_at(app, cursor.0, cursor.1, scale) {
        x = x.max(d.0).min(d.0 + d.2 - 200.0);
        y = y.max(d.1).min(d.1 + d.3 - 120.0);
    }
    let settings = h.request(None, "settings:get", Value::Null).await.unwrap_or_else(|_| json!({}));
    let child = create_main_window(
        app,
        &settings,
        MainOpts { x: Some(x), y: Some(y), width: Some(width), height: Some(height), adopt: Some(session_id.clone()), no_focus: false },
    )?;
    h.request(None, "session:reattach", json!({ "sessionId": session_id, "win": child.label() })).await?;
    emit(app, source.label(), "session:detached", json!({ "sessionId": session_id, "closeIfEmpty": true }));
    Ok(json!({ "ok": true, "sessionId": session_id }))
}

/// Move a session into an existing window as a new tab (merge).
async fn session_attach(app: &AppHandle, source: &WebviewWindow, a: &Value) -> Result<Value, String> {
    let session_id = session_id_of(a);
    if session_id.is_empty() {
        return Ok(json!({ "ok": false, "error": "Invalid attach request" }));
    }
    let target_id = num(a, "targetWindowId").unwrap_or(0.0) as u32;
    let Some(target) = app.get_webview_window(&format!("{MAIN_PREFIX}{target_id}")) else {
        return Ok(json!({ "ok": false, "error": "Target window not found" }));
    };
    if target.label() == source.label() {
        return Ok(json!({ "ok": false, "error": "Same window" }));
    }
    let h = host(app)?;
    let stashed = h.request(Some(source.label()), "session:stashAdopt", a.clone()).await?;
    if stashed.get("ok").and_then(Value::as_bool) != Some(true) {
        return Ok(json!({ "ok": false, "error": "Session not found" }));
    }
    let meta = stashed.get("meta").cloned().unwrap_or_else(|| json!({}));
    h.request(None, "session:reattach", json!({ "sessionId": session_id, "win": target.label() })).await?;
    clear_merge_preview_except(app, None);
    *state(app).merge_target.lock().unwrap() = None;

    let _ = target.set_focus();
    let mut adopt = json!({
        "sessionId": session_id,
        "insertIndex": a.get("insertIndex").cloned().unwrap_or(Value::Null),
        "screenX": a.get("screenX").cloned().unwrap_or(Value::Null),
        "screenY": a.get("screenY").cloned().unwrap_or(Value::Null),
    });
    if let (Some(obj), Some(m)) = (adopt.as_object_mut(), meta.as_object()) {
        for (k, v) in m {
            obj.insert(k.clone(), v.clone());
        }
    }
    emit(app, target.label(), "session:adopt", adopt);

    let left = h.request(None, "session:count", json!({ "win": source.label() })).await.ok().and_then(|v| v.as_u64()).unwrap_or(1);
    if left == 0 {
        let src = source.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            let _ = src.destroy();
        });
    } else {
        emit(app, source.label(), "session:detached", json!({ "sessionId": session_id, "closeIfEmpty": true }));
    }
    Ok(json!({ "ok": true, "sessionId": session_id, "targetWindowId": target_id }))
}

// ── Dialogs ──────────────────────────────────────────────────
fn expand_home(p: &str) -> PathBuf {
    if p == "~" {
        return home_dir();
    }
    if let Some(rest) = p.strip_prefix("~/").or_else(|| p.strip_prefix("~\\")) {
        return home_dir().join(rest);
    }
    PathBuf::from(p)
}

async fn pick_directory(app: &AppHandle, win: &WebviewWindow, a: &Value) -> Result<Value, String> {
    let settings = host(app)?.request(None, "settings:get", Value::Null).await.unwrap_or_else(|_| json!({}));
    let given = text(a, "defaultPath");
    let remembered = if !given.trim().is_empty() { given.trim().to_string() } else { text(&settings, "startDirectory").trim().to_string() };
    let mut start = None;
    if !remembered.is_empty() {
        let p = expand_home(&remembered);
        if p.is_dir() {
            start = Some(p);
        } else if p.exists() {
            start = p.parent().map(Path::to_path_buf);
        }
    }
    let start = start.unwrap_or_else(home_dir);
    let title = Some(text(a, "title")).filter(|t| !t.is_empty()).unwrap_or_else(|| "Select start directory".into());
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().set_title(title).set_directory(start).set_parent(win).pick_folder(move |p| {
        let _ = tx.send(p);
    });
    match rx.await.ok().flatten().and_then(|p| p.into_path().ok()) {
        Some(p) => Ok(json!({ "ok": true, "path": p.to_string_lossy() })),
        None => Ok(json!({ "ok": false, "canceled": true })),
    }
}

async fn pick_background(app: &AppHandle, win: &WebviewWindow) -> Result<Value, String> {
    let h = host(app)?;
    let settings = h.request(None, "settings:get", Value::Null).await.unwrap_or_else(|_| json!({}));
    let remembered = text(&settings, "backgroundImageDir");
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Select background image")
        .set_parent(win)
        .add_filter("Images", BG_EXTENSIONS)
        .add_filter("JPEG", &["jpg", "jpeg", "jfif"])
        .add_filter("PNG / WebP / AVIF / GIF", &["png", "webp", "avif", "gif"])
        .add_filter("TIFF", &["tif", "tiff"])
        .add_filter("Other", &["bmp", "svg", "ico"]);
    if !remembered.is_empty() && Path::new(&remembered).is_dir() {
        dialog = dialog.set_directory(&remembered);
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    dialog.pick_file(move |p| {
        let _ = tx.send(p);
    });
    let Some(path) = rx.await.ok().flatten().and_then(|p| p.into_path().ok()) else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    h.request(Some(win.label()), "background:import", json!({ "path": path.to_string_lossy() })).await
}

/// An error for a window's error dialog; a popup's goes to its owner.
fn report_error_to(app: &AppHandle, sender: Option<&str>, info: Value) -> bool {
    let owner = sender.and_then(|s| {
        if is_main(s) {
            Some(s.to_string())
        } else {
            state(app).popups.lock().unwrap().get(s).map(|p| p.owner.clone())
        }
    });
    let target = owner.filter(|l| app.get_webview_window(l).is_some()).or_else(|| focused_or_first_main(app).map(|w| w.label().to_string()));
    match target {
        Some(label) => {
            emit(app, &label, "app:error", info);
            true
        }
        None => {
            eprintln!("[error] {info}");
            false
        }
    }
}

// ── The one command ──────────────────────────────────────────
#[tauri::command]
async fn mt(app: AppHandle, window: WebviewWindow, ch: String, a: Value) -> Result<Value, String> {
    let label = window.label().to_string();
    match ch.as_str() {
        "window:minimize" => {
            window.minimize().map_err(err)?;
            Ok(Value::Null)
        }
        "window:maximize" => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize().map_err(err)?;
                Ok(json!(false))
            } else {
                window.maximize().map_err(err)?;
                Ok(json!(true))
            }
        }
        "window:isMaximized" => Ok(json!(window.is_maximized().unwrap_or(false))),
        // macOS / Linux title-bar drags (Windows moves by the CSS app-region itself).
        "window:startDragging" => {
            window.start_dragging().map_err(err)?;
            Ok(Value::Null)
        }
        "window:close" => {
            close_popups_for_owner(&app, &label);
            close_dropdown_for_owner(&app, &label);
            window.close().map_err(err)?;
            Ok(Value::Null)
        }
        // Force-quit when the last terminal is closed (e.g. via `exit`). If other
        // windows remain open, only the requesting window is closed.
        "app:quit" => {
            let others = main_windows(&app).into_iter().filter(|w| w.label() != label).count();
            if others > 0 {
                save_window_state(&app, &window);
                window.destroy().map_err(err)?;
            } else {
                save_window_state(&app, &window);
                quit_app(&app);
            }
            Ok(Value::Null)
        }
        "window:getBounds" => Ok(logical_inner_rect(&window).map(rect_json).unwrap_or(Value::Null)),
        "window:setMinSize" => {
            let raw_w = num(&a, "width").map(f64::ceil).filter(|v| *v > 0.0).unwrap_or(TOOLBAR_MIN_WIDTH);
            // Trust renderer measurement; only clamp to a modest floor/cap.
            let min_w = TOOLBAR_MIN_WIDTH_CAP.min(TOOLBAR_MIN_WIDTH.max(raw_w));
            let min_h = WINDOW_MIN_HEIGHT.max(num(&a, "height").map(f64::ceil).unwrap_or(WINDOW_MIN_HEIGHT));
            window.set_min_size(Some(LogicalSize::new(min_w, min_h))).map_err(err)?;
            state(&app).min_size.lock().unwrap().insert(label.clone(), (min_w, min_h));
            if let Some((_, _, cw, ch)) = logical_inner_rect(&window) {
                if a.get("resizeToMin").and_then(Value::as_bool) == Some(true) {
                    // Start (or snap) at the toolbar-fit minimum width; keep height.
                    let _ = window.set_size(LogicalSize::new(min_w, ch.round().max(min_h)));
                } else if cw.round() < min_w || ch.round() < min_h {
                    let _ = window.set_size(LogicalSize::new(cw.round().max(min_w), ch.round().max(min_h)));
                }
            }
            Ok(json!({ "minWidth": min_w, "minHeight": min_h }))
        }
        // Terminal profiles: grow / shrink the window so the terminal shows cols × rows.
        "window:resizeBy" => {
            if window.is_maximized().unwrap_or(false) {
                let _ = window.unmaximize();
            }
            let Some((_, _, w, h)) = logical_inner_rect(&window) else { return Ok(Value::Null) };
            let (min_w, min_h) = state(&app).min_size.lock().unwrap().get(&label).copied().unwrap_or((TOOLBAR_MIN_WIDTH, WINDOW_MIN_HEIGHT));
            let area = window_work_area(&window).unwrap_or((0.0, 0.0, 100000.0, 100000.0));
            let width = min_w.max(area.2.min((w + num(&a, "dw").unwrap_or(0.0)).round())).round();
            let height = min_h.max(area.3.min((h + num(&a, "dh").unwrap_or(0.0)).round())).round();
            let _ = window.set_size(LogicalSize::new(width, height));
            // Keep the window on screen after growing.
            if let Some((bx, by, bw, bh)) = logical_outer_rect(&window) {
                let x = area.0.max(bx.min(area.0 + area.2 - bw));
                let y = area.1.max(by.min(area.1 + area.3 - bh));
                if (x - bx).abs() >= 1.0 || (y - by).abs() >= 1.0 {
                    let _ = window.set_position(LogicalPosition::new(x.round(), y.round()));
                }
            }
            Ok(json!({ "width": width, "height": height }))
        }
        "window:findAtPoint" => {
            let scale = window.scale_factor().unwrap_or(1.0);
            let cursor = app.cursor_position().ok();
            let mut hit = cursor.and_then(|c| find_window_at_point(&app, c.x, c.y, &label));
            if hit.is_none() {
                if let (Some(x), Some(y)) = (num(&a, "x"), num(&a, "y")) {
                    hit = find_window_at_point(&app, x * scale, y * scale, &label);
                }
            }
            Ok(match hit {
                Some(w) => json!({ "id": main_id(w.label()).unwrap_or(0), "bounds": logical_inner_rect(&w).map(rect_json).unwrap_or(Value::Null) }),
                None => Value::Null,
            })
        }
        "window:destroyEmpty" => {
            window.destroy().map_err(err)?;
            Ok(json!(true))
        }
        "session:mergePreview" => {
            send_merge_preview(&app, &label, &a);
            Ok(Value::Null)
        }
        "session:mergePreviewClear" => {
            clear_merge_preview_except(&app, None);
            *state(&app).merge_target.lock().unwrap() = None;
            Ok(Value::Null)
        }
        "session:detach" => session_detach(&app, &window, &a).await,
        "session:attach" => session_attach(&app, &window, &a).await,

        "app:reportError" => {
            let info = json!({
                "message": Some(text(&a, "message")).filter(|m| !m.is_empty()).unwrap_or_else(|| "Error".into()),
                "details": Some(text(&a, "details")).filter(|d| !d.is_empty()).unwrap_or_else(|| text(&a, "message")),
                "context": Some(text(&a, "context")).filter(|c| !c.is_empty()).unwrap_or_else(|| "popup".into()),
            });
            Ok(json!(report_error_to(&app, Some(&label), info)))
        }
        "shell:openExternal" => {
            let url = a.as_str().unwrap_or("").to_string();
            if is_web_link(&url) {
                app.opener().open_url(url, None::<&str>).map_err(err)?;
                Ok(json!(true))
            } else {
                Ok(json!(false))
            }
        }
        "clipboard:writeText" => {
            app.clipboard().write_text(a.as_str().unwrap_or("").to_string()).map_err(err)?;
            Ok(json!({ "ok": true }))
        }
        "clipboard:readText" => Ok(json!({ "ok": true, "text": app.clipboard().read_text().unwrap_or_default() })),
        "dialog:pickDirectory" => pick_directory(&app, &window, &a).await,
        "background:pick" => pick_background(&app, &window).await,

        "popup:open" => popup_open(&app, &window, &a),
        "popup:close" => {
            let id = a.as_str().unwrap_or("").to_string();
            match app.get_webview_window(&id).filter(|_| id.starts_with(POPUP_PREFIX)) {
                Some(w) => {
                    let _ = w.close();
                    Ok(json!(true))
                }
                None => Ok(json!(false)),
            }
        }
        // A toolbar button pressed while its dialog is already open: bring it to the front.
        "popup:focus" => {
            let id = a.as_str().unwrap_or("").to_string();
            if !state(&app).popups.lock().unwrap().contains_key(&id) {
                return Ok(json!(false));
            }
            show_popup(&app, &id);
            match app.get_webview_window(&id) {
                Some(w) => {
                    bring_forward(&w);
                    Ok(json!(true))
                }
                None => Ok(json!(false)),
            }
        }
        "popup:show" => Ok(json!(show_popup(&app, a.as_str().unwrap_or("")))),
        "popup:fit" => Ok(popup_fit(&app, &a)),
        // Fixed-size popups (settings) lock the frame once their content is measured.
        "popup:setResizable" => {
            let id = text(&a, "id");
            match app.get_webview_window(&id).filter(|_| state(&app).popups.lock().unwrap().contains_key(&id)) {
                Some(w) => {
                    let _ = w.set_resizable(a.get("resizable").and_then(Value::as_bool) != Some(false));
                    Ok(json!(true))
                }
                None => Ok(json!(false)),
            }
        }
        "popup:send" => Ok(json!(popup_send(&app, &label, &a))),
        "popup:getId" => Ok(if state(&app).popups.lock().unwrap().contains_key(&label) { json!(label) } else { Value::Null }),

        "dropdown:open" => dropdown_open(&app, &window, &a),
        "dropdown:ready" if label == DROPDOWN => {
            let st = state(&app);
            let mut dd = st.dropdown.lock().unwrap();
            dd.ready = true;
            Ok(if dd.open { dd.pending.take().unwrap_or(Value::Null) } else { Value::Null })
        }
        "dropdown:fit" if label == DROPDOWN => Ok(dropdown_fit(&app, &a)),
        "dropdown:pick" if label == DROPDOWN => Ok(json!(dropdown_pick(&app, &a))),
        "dropdown:fit" | "dropdown:pick" | "dropdown:ready" => Ok(Value::Null),
        "dropdown:close" => {
            close_dropdown(&app);
            Ok(json!(true))
        }

        "detachPreview:show" => preview_show(&app, &a),
        "detachPreview:move" => {
            if let Some(w) = app.get_webview_window(PREVIEW) {
                if let (Some(x), Some(y)) = (num(&a, "x"), num(&a, "y")) {
                    let _ = w.set_position(LogicalPosition::new(x.round(), y.round()));
                }
            }
            Ok(json!(true))
        }
        "detachPreview:hide" => {
            if let Some(w) = app.get_webview_window(PREVIEW) {
                window_icon::show_native(&w, false);
            }
            Ok(json!(true))
        }

        _ => host(&app)?.request(Some(&label), &ch, a).await,
    }
}

// ── The host's calls ─────────────────────────────────────────
fn on_host_message(app: &AppHandle, msg: Value) {
    match msg.get("t").and_then(Value::as_str) {
        Some("emit") => {
            let win = text(&msg, "win");
            if !win.is_empty() && app.get_webview_window(&win).is_some() {
                emit(app, &win, &text(&msg, "ch"), msg.get("p").cloned().unwrap_or(Value::Null));
            }
        }
        Some("call") => {
            let id = msg.get("id").and_then(Value::as_u64).unwrap_or(0);
            let method = text(&msg, "m");
            let a = msg.get("a").cloned().unwrap_or(Value::Null);
            match method.as_str() {
                // Order matters for keystrokes: handled on the reader thread.
                "pty.write" | "pty.resize" | "pty.kill" | "pty.spawn" => {
                    let result = host_pty_call(app, &method, &a);
                    if let Ok(h) = host(app) {
                        h.reply(id, result);
                    }
                }
                _ => {
                    let app = app.clone();
                    std::thread::spawn(move || {
                        let result = host_call(&app, &method, &a);
                        if let Ok(h) = host(&app) {
                            h.reply(id, result);
                        }
                    });
                }
            }
        }
        _ => {}
    }
}

fn host_call(app: &AppHandle, method: &str, a: &Value) -> Result<Value, String> {
    match method {
        "tray.apply" => {
            let enabled = a.get("enabled").and_then(Value::as_bool).unwrap_or(false);
            let lang = text(a, "lang");
            let handle = app.clone();
            app.run_on_main_thread(move || apply_tray(&handle, enabled, &lang)).map_err(err)?;
            Ok(json!(true))
        }
        "reportError" => Ok(json!(report_error_to(app, None, a.clone()))),
        // MyShell `open` / `start`.
        "openPath" => {
            let path = text(a, "path");
            app.opener().open_path(path, None::<&str>).map_err(err)?;
            Ok(json!(true))
        }
        "image.dataUrl" => {
            let max = a.get("max").and_then(Value::as_u64).unwrap_or(2560) as u32;
            images::data_url(Path::new(&text(a, "path")), &text(a, "mime"), max).map(Value::String)
        }
        "image.encodePng" => {
            let w = a.get("width").and_then(Value::as_u64).unwrap_or(0) as u32;
            let h = a.get("height").and_then(Value::as_u64).unwrap_or(0) as u32;
            images::encode_png(w, h, &text(a, "rgba")).map(Value::String)
        }
        other => Err(format!("unknown call: {other}")),
    }
}

fn host_pty_call(app: &AppHandle, method: &str, a: &Value) -> Result<Value, String> {
    let st = state(app);
    let id = text(a, "id");
    match method {
        "pty.spawn" => {
            let env: BTreeMap<String, String> = a
                .get("env")
                .and_then(Value::as_object)
                .map(|o| o.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect())
                .unwrap_or_default();
            let spec = pty::Spec {
                file: text(a, "file"),
                args: a.get("args").and_then(Value::as_array).map(|l| l.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default(),
                command_line: text(a, "commandLine"),
                cwd: text(a, "cwd"),
                env,
                cols: a.get("cols").and_then(Value::as_u64).unwrap_or(80).clamp(1, 1000) as u16,
                rows: a.get("rows").and_then(Value::as_u64).unwrap_or(24).clamp(1, 1000) as u16,
            };
            let pty_id = format!("p{}", st.next_pty.fetch_add(1, Ordering::SeqCst) + 1);
            let data_app = app.clone();
            let data_id = pty_id.clone();
            let exit_app = app.clone();
            let exit_id = pty_id.clone();
            let p = pty::spawn(
                spec,
                Box::new(move |bytes| {
                    if let Ok(h) = host(&data_app) {
                        h.send(&json!({ "t": "pty", "id": data_id, "ev": "data", "d": B64.encode(bytes) }));
                    }
                }),
                Box::new(move |code| {
                    state(&exit_app).ptys.lock().unwrap().remove(&exit_id);
                    if let Ok(h) = host(&exit_app) {
                        h.send(&json!({ "t": "pty", "id": exit_id, "ev": "exit", "code": code }));
                    }
                }),
            )?;
            let pid = p.pid();
            st.ptys.lock().unwrap().insert(pty_id.clone(), p);
            Ok(json!({ "id": pty_id, "pid": pid }))
        }
        "pty.write" => {
            let p = st.ptys.lock().unwrap().get(&id).cloned();
            if let Some(p) = p {
                p.write(text(a, "data").as_bytes());
            }
            Ok(Value::Null)
        }
        "pty.resize" => {
            let p = st.ptys.lock().unwrap().get(&id).cloned();
            if let Some(p) = p {
                let cols = a.get("cols").and_then(Value::as_u64).unwrap_or(80).clamp(1, 1000) as u16;
                let rows = a.get("rows").and_then(Value::as_u64).unwrap_or(24).clamp(1, 1000) as u16;
                p.resize(cols, rows);
            }
            Ok(Value::Null)
        }
        "pty.kill" => {
            let p = st.ptys.lock().unwrap().get(&id).cloned();
            if let Some(p) = p {
                p.kill();
            }
            Ok(Value::Null)
        }
        _ => Err("unknown pty call".into()),
    }
}

fn fatal(app: &AppHandle, message: String) {
    eprintln!("[fatal] {message}");
    app.dialog()
        .message(message)
        .title(APP_NAME)
        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
        .blocking_show();
    app.exit(1);
}

// ── Start ────────────────────────────────────────────────────
pub fn run() {
    let mut builder = tauri::Builder::default();
    // A second launch would race this one on settings.json: surface the window that is already open.
    if test_config_dir().is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = main_windows(app).into_iter().next() {
                bring_forward(&w);
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            config_dir: config_dir(),
            host: OnceLock::new(),
            next_main: AtomicU32::new(0),
            next_popup: AtomicU32::new(0),
            next_pty: AtomicU64::new(0),
            focus_seq: AtomicU64::new(0),
            focus: Mutex::new(HashMap::new()),
            min_size: Mutex::new(HashMap::new()),
            maximized: Mutex::new(HashMap::new()),
            save_serial: Mutex::new(HashMap::new()),
            revealed: Mutex::new(HashMap::new()),
            popups: Mutex::new(HashMap::new()),
            dropdown: Mutex::new(Dropdown::default()),
            preview: Mutex::new(Preview::default()),
            merge_target: Mutex::new(None),
            ptys: Mutex::new(HashMap::new()),
            quitting: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![mt])
        .setup(|app| {
            let handle = app.handle().clone();
            let _ = std::fs::create_dir_all(&state(&handle).config_dir);
            let launch = match host_launch(app) {
                Ok(l) => l,
                Err(e) => {
                    let h = handle.clone();
                    std::thread::spawn(move || fatal(&h, e));
                    return Ok(());
                }
            };
            let msg_app = handle.clone();
            let exit_app = handle.clone();
            let started = Host::start(
                launch,
                Arc::new(move |msg| on_host_message(&msg_app, msg)),
                Box::new(move || {
                    // Node died under us: every open terminal is gone with it.
                    for w in main_windows(&exit_app) {
                        emit(
                            &exit_app,
                            w.label(),
                            "app:error",
                            json!({ "message": "The terminal host stopped unexpectedly.", "details": "The Node.js process that runs MyShell and SSH sessions exited. Restart MyTerminal.", "context": "main" }),
                        );
                    }
                }),
            );
            let (h, ready) = match started {
                Ok(v) => v,
                Err(e) => {
                    let h = handle.clone();
                    std::thread::spawn(move || fatal(&h, e));
                    return Ok(());
                }
            };
            let _ = state(&handle).host.set(h);
            tauri::async_runtime::spawn(async move {
                if tokio::time::timeout(Duration::from_secs(20), ready).await.ok().and_then(Result::ok).is_none() {
                    fatal(&handle, "The terminal host (Node.js) did not start.".into());
                    return;
                }
                if let Err(e) = open_main_window(&handle, MainOpts::default()).await {
                    fatal(&handle, format!("Could not open the window: {e}"));
                    return;
                }
                // The menu and the detach preview are built ahead of time: a new
                // webview takes most of a second to start.
                tokio::time::sleep(Duration::from_millis(1500)).await;
                let _ = ensure_dropdown(&handle);
                let _ = ensure_preview(&handle);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MyTerminal")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => {
                if let Ok(h) = host(app) {
                    h.stop();
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { has_visible_windows: false, .. } => {
                if main_windows(app).is_empty() {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = open_main_window(&app, MainOpts::default()).await;
                    });
                }
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colours_and_urls() {
        assert_eq!(parse_color("#252526").map(|c| (c.0, c.1, c.2, c.3)), Some((0x25, 0x25, 0x26, 0xff)));
        assert_eq!(parse_color("#fff").map(|c| (c.0, c.1, c.2)), Some((255, 255, 255)));
        assert!(parse_color("nope").is_none());
        assert_eq!(percent_encode("popup-1"), "popup-1");
        assert_eq!(percent_encode("a b/한"), "a%20b%2F%ED%95%9C");
    }

    #[test]
    fn build_dates_are_iso() {
        assert_eq!(iso_date(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_date(1_798_156_800), "2026-12-25T00:00:00.000Z");
    }

    #[test]
    fn window_labels() {
        assert_eq!(main_id("main-12"), Some(12));
        assert_eq!(main_id("popup-1"), None);
        assert!(is_main("main-1") && !is_main(DROPDOWN));
        assert_eq!(plain_path(Path::new(r"\\?\C:\x\y")), PathBuf::from(r"C:\x\y"));
    }
}
