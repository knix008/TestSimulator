// My FTP Server desktop program (Tauri 2).
//
// The servers, settings, profiles, certificates and the log are the Node host
// (host/host.js → core/), started here (host.rs) before the window opens; the
// page reaches its HTTP API on 127.0.0.1 with the port and token this program
// puts in `window.__MFS_HOST__`. This program answers what needs the
// operating system:
//   • the frameless main window: hidden until the page painted, position /
//     size / maximised state kept between runs (window-state.json), the
//     minimum size the page measures (set_min_size)
//   • the tray icon ("close hides to the tray while the server runs")
//   • one running copy (a second start shows the first one's window)
//   • folder / file dialogs, reveal, open, clipboard: plugins the page calls
//   • the user guide (doc/index.html) in its own frameless window
// Quitting closes the host's stdin; it stops the servers and exits.

mod host;
mod window_icon;

use host::{Host, Launch};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::window::Color;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

const APP_NAME: &str = "My FTP Server";
const MAIN: &str = "main";
const MANUAL: &str = "manual";
const THEME_MENU: &str = "theme-menu";
const DIALOG_PREFIX: &str = "dlg-";
const TRAY_ID: &str = "myftpserver";
const DEFAULT_W: f64 = 1360.0;
const DEFAULT_H: f64 = 800.0;
// The floor; the page raises it to what its single-line strips need.
const MIN_W: f64 = 1100.0;
const MIN_H: f64 = 720.0;

#[derive(Serialize, Deserialize, Clone, Copy, Default)]
struct WinState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

struct TrayState {
    /// Settings › "minimise to tray": the icon is shown.
    enabled: bool,
    /// enabled and a server is running: closing the window hides it.
    keep: bool,
    show: String,
    quit: String,
}

struct AppState {
    host: Mutex<Option<Host>>,
    win_file: PathBuf,
    win_state: Mutex<Option<WinState>>,
    /// Logical inner size the page asked for (set_min_size).
    min_size: Mutex<(f64, f64)>,
    tray: Mutex<TrayState>,
    quitting: AtomicBool,
    /// The theme dropdown's button (CSS px in the main window), while it is open.
    menu_anchor: Mutex<Option<MenuAnchor>>,
    /// The dropdown is on screen (a focus loss before that is not a close).
    menu_shown: AtomicBool,
    /// The page's `window.__MFS_HOST__` script: dialog windows get it too.
    boot_script: Mutex<String>,
}

fn state(app: &AppHandle) -> tauri::State<'_, AppState> {
    app.state::<AppState>()
}

/// process.platform names, which the page already knows.
fn platform() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}

// ── Folders ──────────────────────────────────────────────────
/// MFS_USER_DATA: a scratch profile for tests (own config, own webview data,
/// no single-instance lock).
fn test_dir() -> Option<PathBuf> {
    std::env::var_os("MFS_USER_DATA").filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

/// %APPDATA%\My FTP Server, ~/Library/Application Support/My FTP Server,
/// ~/.config/My FTP Server — the folder core/settings.js has always used, so
/// the settings of the Electron build carry over.
fn config_dir() -> PathBuf {
    if let Some(dir) = test_dir() {
        return dir;
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

/// `npm start` gets its own webview profile (sharing the installed app's fails
/// while that app is open), tests one under their scratch folder.
fn webview_data_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Some(dir) = test_dir() {
        return Some(dir.join("EBWebView"));
    }
    if cfg!(debug_assertions) {
        return app.path().app_local_data_dir().ok().map(|d| d.join("EBWebView-dev"));
    }
    None
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
/// debug builds the project's host/host.js with the Node on PATH.
fn host_launch(app: &tauri::App, config: &Path) -> Result<Launch, String> {
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let sidecar = app.path().resource_dir().map(|d| plain_path(&d).join("sidecar")).unwrap_or_default();
    let (bundled_node, script, build_info) = if cfg!(debug_assertions) || !sidecar.join("host.js").is_file() {
        let root = plain_path(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
        (None, root.join("host").join("host.js"), root.join("src").join("build-info.json"))
    } else {
        (Some(sidecar.join(node_name)).filter(|p| p.is_file()), sidecar.join("host.js"), sidecar.join("build-info.json"))
    };
    let node = std::env::var_os("MFS_NODE")
        .map(PathBuf::from)
        .or(bundled_node)
        .or_else(node_on_path)
        .ok_or("Node.js was not found. Install Node.js, or use the installed My FTP Server (it brings its own).")?;
    let env = vec![
        ("MFS_CONFIG_DIR".to_string(), config.to_string_lossy().to_string()),
        ("MFS_VERSION".to_string(), app.package_info().version.to_string()),
        ("MFS_BUILD_INFO".to_string(), build_info.to_string_lossy().to_string()),
    ];
    Ok(Launch { node, script, env })
}

// ── Window position / size ───────────────────────────────────
fn load_win_state(file: &Path) -> Option<WinState> {
    let s: WinState = serde_json::from_str(&fs::read_to_string(file).ok()?).ok()?;
    if s.width < 200 || s.height < 150 {
        None
    } else {
        Some(s)
    }
}

/// Copies the window's rectangle into memory (normal state only).
fn remember_win_state(app: &AppHandle, win: &WebviewWindow) {
    let st = state(app);
    let Ok(mut slot) = st.win_state.lock() else { return };
    let mut s = slot.unwrap_or_default();
    s.maximized = win.is_maximized().unwrap_or(false);
    if !s.maximized && !win.is_minimized().unwrap_or(false) && win.is_visible().unwrap_or(false) {
        if let (Ok(p), Ok(z)) = (win.outer_position(), win.inner_size()) {
            if z.width > 0 && z.height > 0 {
                s.x = p.x;
                s.y = p.y;
                s.width = z.width;
                s.height = z.height;
            }
        }
    }
    *slot = Some(s);
}

fn save_win_state(app: &AppHandle) {
    let st = state(app);
    let Some(s) = st.win_state.lock().ok().and_then(|slot| *slot) else { return };
    if s.width == 0 || s.height == 0 {
        return;
    }
    if let Some(parent) = st.win_file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&st.win_file, serde_json::to_string(&s).unwrap_or_default());
}

/// True when the saved rectangle still overlaps a monitor (screens change).
fn on_some_monitor(win: &WebviewWindow, s: &WinState) -> bool {
    let Ok(monitors) = win.available_monitors() else { return false };
    monitors.iter().any(|m| {
        let p = m.position();
        let z = m.size();
        let (x0, y0, x1, y1) = (p.x, p.y, p.x + z.width as i32, p.y + z.height as i32);
        s.x + 80 < x1 && s.x + s.width as i32 - 80 > x0 && s.y >= y0 - 20 && s.y + 40 < y1
    })
}

/// The theme's background of the last run (session.json themeBg) for the
/// first frame, so a light theme does not flash dark.
fn first_frame_color(config: &Path) -> Color {
    let hex = fs::read_to_string(config.join("session.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.get("themeBg").and_then(|b| b.as_str()).map(str::to_string))
        .unwrap_or_default();
    hex_color(&hex).unwrap_or(Color(0x12, 0x16, 0x1c, 255))
}

/// "#rrggbb" → Color.
fn hex_color(hex: &str) -> Option<Color> {
    let h = hex.trim().trim_start_matches('#');
    if h.len() != 6 || !h.is_ascii() {
        return None;
    }
    let p = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok();
    Some(Color(p(0)?, p(2)?, p(4)?, 255))
}

// ── Minimum size ─────────────────────────────────────────────
/// The invisible resize border of a frameless Windows window is part of the
/// outer size, and set_min_size binds the outer size: add it, or the user's
/// edge drags stop that much short of the page's minimum.
fn frame_extra(win: &WebviewWindow) -> (f64, f64) {
    let scale = win.scale_factor().unwrap_or(1.0);
    match (win.outer_size(), win.inner_size()) {
        (Ok(o), Ok(i)) => ((o.width.saturating_sub(i.width)) as f64 / scale, (o.height.saturating_sub(i.height)) as f64 / scale),
        _ => (0.0, 0.0),
    }
}

/// Snap, other programs and SetWindowPos do not honour the minimum: grow back.
fn enforce_min_size(app: &AppHandle, win: &WebviewWindow) {
    if win.is_maximized().unwrap_or(false) || win.is_minimized().unwrap_or(false) || win.is_fullscreen().unwrap_or(false) {
        return;
    }
    let (min_w, min_h) = *state(app).min_size.lock().unwrap();
    let scale = win.scale_factor().unwrap_or(1.0);
    let Ok(size) = win.inner_size() else { return };
    let (w, h) = (size.width as f64 / scale, size.height as f64 / scale);
    if w + 0.5 < min_w || h + 0.5 < min_h {
        let _ = win.set_size(LogicalSize::new(w.max(min_w), h.max(min_h)));
    }
}

#[tauri::command]
fn set_min_size(app: AppHandle, width: f64, height: f64) {
    let w = if width.is_finite() { width.max(MIN_W).min(4000.0) } else { MIN_W };
    let h = if height.is_finite() { height.max(MIN_H).min(3000.0) } else { MIN_H };
    *state(&app).min_size.lock().unwrap() = (w, h);
    if let Some(win) = app.get_webview_window(MAIN) {
        let (ex, ey) = frame_extra(&win);
        let _ = win.set_min_size(Some(LogicalSize::new(w + ex, h + ey)));
        enforce_min_size(&app, &win);
    }
}

// ── Showing / quitting ───────────────────────────────────────
fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn renderer_ready(app: AppHandle) {
    show_main(&app);
}

fn quit(app: &AppHandle) {
    state(app).quitting.store(true, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(MAIN) {
        remember_win_state(app, &win);
    }
    save_win_state(app);
    app.exit(0);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    quit(&app);
}

// ── User guide ───────────────────────────────────────────────
/// The user guide (doc/index.html) in its own frameless window, not owned by
/// the main one so it can sit anywhere. `appearance` = { language, bg, mode,
/// vars } (the main window's theme). A second request brings the open guide
/// forward and hands it the current appearance. Async: a window made inside a
/// synchronous command deadlocks on Windows.
#[tauri::command]
async fn manual_open(app: AppHandle, appearance: serde_json::Value) -> Result<bool, String> {
    if let Some(existing) = app.get_webview_window(MANUAL) {
        let _ = existing.emit_to(MANUAL, "doc:appearance", appearance);
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(true);
    }
    let script = format!("window.__MFS_DOC__ = {appearance};");
    let mut builder = WebviewWindowBuilder::new(&app, MANUAL, WebviewUrl::App("doc/index.html".into()))
        .title(format!("{APP_NAME} — User Guide"))
        .inner_size(1060.0, 780.0)
        .min_inner_size(820.0, 480.0)
        .resizable(true)
        .decorations(false)
        .shadow(true)
        .initialization_script(&script);
    if let Some(color) = appearance.get("bg").and_then(|v| v.as_str()).and_then(hex_color) {
        builder = builder.background_color(color);
    }
    if let Some(dir) = webview_data_dir(&app) {
        builder = builder.data_directory(dir);
    }
    if let Some(main) = app.get_webview_window(MAIN) {
        let scale = main.scale_factor().unwrap_or(1.0);
        if let Ok(p) = main.outer_position() {
            builder = builder.position(p.x as f64 / scale + 60.0, p.y as f64 / scale + 40.0);
        }
    }
    let win = builder.build().map_err(|e| e.to_string())?;
    window_icon::apply(&win);
    Ok(true)
}

// ── Theme dropdown ───────────────────────────────────────────
// The toolbar's theme list is taller than the window may be, so it is a
// window of its own (owned by the main one, no frame, sized to the menu):
// it can reach past the main window's edges. It loads the app page, which
// renders only the menu when `window.__MFS_MENU__` is set; a pick comes back
// to the main window as `theme-menu:pick`, and losing focus closes it.

#[derive(Deserialize, Default, Clone, Copy)]
#[serde(default)]
struct MenuAnchor {
    left: f64,
    right: f64,
    top: f64,
    bottom: f64,
}

#[derive(Deserialize)]
struct ThemeMenuArgs {
    anchor: MenuAnchor,
    /// { current, language, fontSize, customThemes, bg } for the menu page.
    data: serde_json::Value,
}

fn close_theme_menu(app: &AppHandle) {
    let st = state(app);
    st.menu_shown.store(false, Ordering::SeqCst);
    let was_open = st.menu_anchor.lock().unwrap().take().is_some();
    if let Some(w) = app.get_webview_window(THEME_MENU) {
        let _ = w.destroy();
    }
    if was_open {
        let _ = app.emit_to(MAIN, "theme-menu:closed", ());
    }
}

/// Where the menu goes, in physical pixels: right edge under the button's,
/// kept on the monitor's work area, above the button when there is no room below.
fn menu_place(anchor: MenuAnchor, origin: (f64, f64), scale: f64, size: (f64, f64), work: Option<(f64, f64, f64, f64)>) -> (f64, f64) {
    let (w, h) = size;
    let mut x = origin.0 + anchor.right * scale - w;
    let mut y = origin.1 + (anchor.bottom + 2.0) * scale;
    if let Some((wx, wy, ww, wh)) = work {
        x = x.min(wx + ww - w).max(wx);
        if y + h > wy + wh {
            let above = origin.1 + (anchor.top - 2.0) * scale - h;
            y = if above >= wy { above } else { (wy + wh - h).max(wy) };
        }
    }
    (x.round(), y.round())
}

#[tauri::command]
async fn theme_menu_open(app: AppHandle, args: ThemeMenuArgs) -> Result<bool, String> {
    close_theme_menu(&app);
    *state(&app).menu_anchor.lock().unwrap() = Some(args.anchor);
    let script = format!("window.__MFS_MENU__ = {};", args.data);
    let mut builder = WebviewWindowBuilder::new(&app, THEME_MENU, WebviewUrl::App("index.html".into()))
        .title("Theme")
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .shadow(true)
        .visible(false)
        .focused(false)
        .inner_size(420.0, 640.0)
        .initialization_script(&script);
    if let Some(color) = args.data.get("bg").and_then(|v| v.as_str()).and_then(hex_color) {
        builder = builder.background_color(color);
    }
    if let Some(dir) = webview_data_dir(&app) {
        builder = builder.data_directory(dir);
    }
    if let Some(main) = app.get_webview_window(MAIN) {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }
    let menu = builder.build().map_err(|e| e.to_string())?;
    let handle = app.clone();
    menu.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            if state(&handle).menu_shown.load(Ordering::SeqCst) {
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || close_theme_menu(&h));
            }
        }
    });
    Ok(true)
}

/// The menu page measured itself: size the window to it, place it, show it.
#[tauri::command]
fn theme_menu_size(app: AppHandle, width: f64, height: f64) {
    let (Some(menu), Some(main)) = (app.get_webview_window(THEME_MENU), app.get_webview_window(MAIN)) else { return };
    let Some(anchor) = *state(&app).menu_anchor.lock().unwrap() else { return };
    if !width.is_finite() || !height.is_finite() {
        return;
    }
    let scale = main.scale_factor().unwrap_or(1.0);
    let (w, h) = (width.ceil().max(120.0), height.ceil().max(40.0));
    let _ = menu.set_size(LogicalSize::new(w, h));
    let origin = main.inner_position().map(|p| (p.x as f64, p.y as f64)).unwrap_or((0.0, 0.0));
    let probe = (origin.0 + anchor.right * scale, origin.1 + anchor.bottom * scale);
    let work = app.monitor_from_point(probe.0, probe.1).ok().flatten().or_else(|| main.current_monitor().ok().flatten()).map(|m| {
        let wa = m.work_area();
        (wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64)
    });
    let (x, y) = menu_place(anchor, origin, scale, (w * scale, h * scale), work);
    // A frameless window may still have an invisible border: place the client area.
    let (dx, dy) = match (menu.outer_position(), menu.inner_position()) {
        (Ok(o), Ok(i)) => ((i.x - o.x) as f64, (i.y - o.y) as f64),
        _ => (0.0, 0.0),
    };
    let _ = menu.set_position(PhysicalPosition::new((x - dx) as i32, (y - dy) as i32));
    let _ = menu.show();
    let _ = menu.set_focus();
    state(&app).menu_shown.store(true, Ordering::SeqCst);
}

/// An item of the menu: "theme:<id>", "newCustomTheme" or "themeSettings".
#[tauri::command]
fn theme_menu_pick(app: AppHandle, id: String) {
    let _ = app.emit_to(MAIN, "theme-menu:pick", id);
    close_theme_menu(&app);
}

#[tauri::command]
fn theme_menu_close(app: AppHandle) {
    close_theme_menu(&app);
}

// ── Dialog windows ───────────────────────────────────────────
// Settings and About are windows of their own: owned by the main window (they
// stay above it and close with it) but not modal, movable anywhere, past the
// main window's edges too. The page is the app's index.html with
// `window.__MFS_DIALOG__ = { kind, payload }` (and the host script, so it
// reaches the server like the main page). It shows the window once painted
// (dialog_ready), may fit it to its content (dialog_size), sends live theme
// previews (dialog_preview) and its result (dialog_submit) to the main window;
// a window closed any other way reports `null`.

/// Inner size of a dialog window; `fit` = sized to its content when painted.
fn dialog_spec(kind: &str) -> (f64, f64, bool) {
    match kind {
        "settings" => (700.0, 640.0, false),
        _ => (520.0, 360.0, true),
    }
}

fn dialog_kind(label: &str) -> &str {
    label.strip_prefix(DIALOG_PREFIX).unwrap_or(label)
}

/// Logical top-left that centres `size` on the main window, inside its monitor's work area.
fn centre_on_main(app: &AppHandle, size: (f64, f64)) -> Option<(f64, f64)> {
    let main = app.get_webview_window(MAIN)?;
    let scale = main.scale_factor().ok()?;
    let pos = main.outer_position().ok()?.to_logical::<f64>(scale);
    let outer = main.outer_size().ok()?.to_logical::<f64>(scale);
    let (mut x, mut y) = (pos.x + (outer.width - size.0) / 2.0, pos.y + (outer.height - size.1) / 2.0);
    if let Ok(Some(m)) = main.current_monitor() {
        let ms = m.scale_factor();
        let wa = m.work_area();
        let (wx, wy, ww, wh) = (wa.position.x as f64 / ms, wa.position.y as f64 / ms, wa.size.width as f64 / ms, wa.size.height as f64 / ms);
        x = x.min(wx + ww - size.0).max(wx);
        y = y.min(wy + wh - size.1).max(wy);
    }
    Some((x.round(), y.round()))
}

#[tauri::command]
async fn dialog_open(app: AppHandle, kind: String, payload: serde_json::Value) -> Result<bool, String> {
    if !matches!(kind.as_str(), "settings" | "about") {
        return Err(format!("unknown dialog {kind}"));
    }
    close_theme_menu(&app);
    let label = format!("{DIALOG_PREFIX}{kind}");
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(true);
    }
    let (width, height, _) = dialog_spec(&kind);
    let boot = state(&app).boot_script.lock().unwrap().clone();
    let script = format!("{boot}\nwindow.__MFS_DIALOG__ = {};", serde_json::json!({ "kind": kind, "payload": payload }));
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(payload.get("title").and_then(|v| v.as_str()).unwrap_or(APP_NAME))
        .inner_size(width, height)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .shadow(true)
        .visible(false)
        .initialization_script(&script);
    if let Some(color) = payload.get("bg").and_then(|v| v.as_str()).and_then(hex_color) {
        builder = builder.background_color(color);
    }
    if let Some(dir) = webview_data_dir(&app) {
        builder = builder.data_directory(dir);
    }
    if let Some((x, y)) = centre_on_main(&app, (width, height)) {
        builder = builder.position(x, y);
    }
    if let Some(main) = app.get_webview_window(MAIN) {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }
    let win = builder.build().map_err(|e| e.to_string())?;
    window_icon::apply(&win);
    let handle = app.clone();
    let closing = kind.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            // After a submit the main window has its answer already; it takes the first one.
            let _ = handle.emit_to(MAIN, "dialog:result", serde_json::json!({ "kind": closing, "data": null }));
        }
    });
    // Shown when painted (dialog_ready); if the page never says so, show it anyway.
    let late = win.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(2000));
        if !late.is_visible().unwrap_or(true) {
            let _ = late.show();
            let _ = late.set_focus();
        }
    });
    Ok(true)
}

#[tauri::command]
fn dialog_ready(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

/// Fits a content-sized dialog (About) once, centred on the main window again.
#[tauri::command]
fn dialog_size(app: AppHandle, window: WebviewWindow, width: f64, height: f64) {
    if !dialog_spec(dialog_kind(window.label())).2 || !width.is_finite() || !height.is_finite() || width < 80.0 || height < 80.0 {
        return;
    }
    let size = (width.ceil(), height.ceil());
    let _ = window.set_size(LogicalSize::new(size.0, size.1));
    if let Some((x, y)) = centre_on_main(&app, size) {
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
    }
}

/// Live preview from the settings window (theme, custom themes): the main window follows.
#[tauri::command]
fn dialog_preview(app: AppHandle, data: serde_json::Value) {
    let _ = app.emit_to(MAIN, "dialog:preview", data);
}

/// The dialog's answer (null = cancelled) goes to the main window; the dialog closes.
#[tauri::command]
fn dialog_submit(app: AppHandle, window: WebviewWindow, data: serde_json::Value) {
    let _ = app.emit_to(MAIN, "dialog:result", serde_json::json!({ "kind": dialog_kind(window.label()), "data": data }));
    // Back to the main window first: Windows may otherwise activate another program.
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.set_focus();
    }
    let _ = window.destroy();
}

/// Theme or language changed in the main window: the open guide follows.
#[tauri::command]
fn broadcast_appearance(app: AppHandle, appearance: serde_json::Value) {
    if app.get_webview_window(MANUAL).is_some() {
        let _ = app.emit_to(MANUAL, "doc:appearance", appearance);
    }
}

// ── Tray ─────────────────────────────────────────────────────
fn tray_menu(app: &AppHandle, show: &str, quit: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let show_item = MenuItem::with_id(app, "show", show, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(app, &[&show_item, &sep, &quit_item])
}

fn update_tray(app: &AppHandle) {
    let st = state(app);
    let (enabled, show, quit_label) = {
        let t = st.tray.lock().unwrap();
        (t.enabled, t.show.clone(), t.quit.clone())
    };
    if !enabled {
        let _ = app.remove_tray_by_id(TRAY_ID);
        return;
    }
    let Ok(menu) = tray_menu(app, &show, &quit_label) else { return };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
        return;
    }
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let _ = builder.build(app);
}

#[derive(Deserialize)]
struct TrayArgs {
    enabled: bool,
    keep: bool,
    show: Option<String>,
    quit: Option<String>,
}

/// The page tells the shell the tray setting and whether a server runs
/// (closing then hides the window), with the menu labels in its language.
#[tauri::command]
fn set_tray(app: AppHandle, args: TrayArgs) {
    {
        let st = state(&app);
        let mut t = st.tray.lock().unwrap();
        t.enabled = args.enabled;
        t.keep = args.enabled && args.keep;
        if let Some(s) = args.show.filter(|s| !s.is_empty()) {
            t.show = s;
        }
        if let Some(s) = args.quit.filter(|s| !s.is_empty()) {
            t.quit = s;
        }
    }
    update_tray(&app);
}

// ── Links ────────────────────────────────────────────────────
fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "blob" | "data" | "about" => true,
        "http" | "https" => matches!(url.host_str(), Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")),
        _ => false,
    }
}

// ── Start ────────────────────────────────────────────────────
fn boot(app: &mut tauri::App) -> Result<(), String> {
    let config = config_dir();
    let _ = fs::create_dir_all(&config);
    let win_file = config.join("window-state.json");
    let saved = load_win_state(&win_file);
    app.manage(AppState {
        host: Mutex::new(None),
        win_file,
        win_state: Mutex::new(saved),
        min_size: Mutex::new((MIN_W, MIN_H)),
        tray: Mutex::new(TrayState { enabled: false, keep: false, show: "My FTP Server".into(), quit: "Quit".into() }),
        quitting: AtomicBool::new(false),
        menu_anchor: Mutex::new(None),
        menu_shown: AtomicBool::new(false),
        boot_script: Mutex::new(String::new()),
    });

    // The servers live in the Node host; the page cannot work without it, so
    // a failure is shown in the window instead of the UI.
    let host = host_launch(app, &config).and_then(|launch| Host::start(launch, Duration::from_secs(20)));
    let boot = match &host {
        Ok(h) => json!({ "port": h.port, "token": h.token, "platform": platform(), "firstRun": saved.is_none() }),
        Err(e) => json!({ "error": e, "platform": platform() }),
    };
    if let Err(e) = &host {
        eprintln!("[host] {e}");
    }
    if let Ok(h) = host {
        *state(app.handle()).host.lock().unwrap() = Some(h);
    }
    let script = format!("window.__MFS_HOST__ = Object.freeze({boot});");
    *state(app.handle()).boot_script.lock().unwrap() = script.clone();

    let nav_app = app.handle().clone();
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title(APP_NAME)
        .inner_size(DEFAULT_W, DEFAULT_H)
        .min_inner_size(MIN_W, MIN_H)
        .decorations(false)
        .resizable(true)
        .visible(false)
        .center()
        .background_color(first_frame_color(&config))
        .disable_drag_drop_handler()
        .initialization_script(&script)
        .on_navigation(move |url| {
            if is_app_url(url) {
                return true;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                let _ = nav_app.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        });
    if let Some(dir) = webview_data_dir(app.handle()) {
        builder = builder.data_directory(dir);
    }
    let win = builder.build().map_err(|e| e.to_string())?;
    window_icon::apply(&win);
    if let Some(s) = saved {
        if on_some_monitor(&win, &s) {
            let _ = win.set_size(PhysicalSize::new(s.width, s.height));
            let _ = win.set_position(PhysicalPosition::new(s.x, s.y));
        }
        if s.maximized {
            let _ = win.maximize();
        }
    }

    let handle = app.handle().clone();
    let w = win.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::Moved(_) => {
            close_theme_menu(&handle);
            remember_win_state(&handle, &w);
        }
        WindowEvent::Resized(_) => {
            close_theme_menu(&handle);
            enforce_min_size(&handle, &w);
            remember_win_state(&handle, &w);
        }
        WindowEvent::CloseRequested { api, .. } => {
            close_theme_menu(&handle);
            remember_win_state(&handle, &w);
            save_win_state(&handle);
            let keep = state(&handle).tray.lock().map(|t| t.keep).unwrap_or(false);
            if keep && !state(&handle).quitting.load(Ordering::SeqCst) {
                // "Minimise to tray": the window hides, the servers keep running.
                api.prevent_close();
                let _ = w.hide();
                update_tray(&handle);
            } else {
                // The guide and the dialogs go with the main window, or the program would keep running.
                for (label, other) in handle.webview_windows() {
                    if label == MANUAL || label.starts_with(DIALOG_PREFIX) {
                        let _ = other.destroy();
                    }
                }
            }
        }
        _ => {}
    });

    // Shown by renderer_ready after the first paint; this is the safety net.
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(8));
        if let Some(w) = handle.get_webview_window(MAIN) {
            if !w.is_visible().unwrap_or(true) && !state(&handle).tray.lock().map(|t| t.keep).unwrap_or(false) {
                let _ = w.show();
            }
        }
    });
    Ok(())
}

pub fn run() {
    let mut builder = tauri::Builder::default();
    // One running copy: a second start brings the first one's window back
    // (from the tray, too). Tests and `npm start` run beside the installed app.
    if test_dir().is_none() && !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![renderer_ready, set_min_size, set_tray, quit_app, manual_open, broadcast_appearance, theme_menu_open, theme_menu_size, theme_menu_pick, theme_menu_close, dialog_open, dialog_ready, dialog_size, dialog_preview, dialog_submit])
        .setup(|app| {
            boot(app).map_err(|e| {
                eprintln!("{e}");
                Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>
            })
        })
        .build(tauri::generate_context!())
        .expect("error while building My FTP Server")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                save_win_state(app);
                if let Some(host) = state(app).host.lock().unwrap().take() {
                    host.stop();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUTTON: MenuAnchor = MenuAnchor { left: 1000.0, right: 1020.0, top: 6.0, bottom: 32.0 };

    #[test]
    fn menu_hangs_under_the_button_right_aligned() {
        let (x, y) = menu_place(BUTTON, (100.0, 50.0), 1.0, (400.0, 600.0), Some((0.0, 0.0, 1920.0, 1040.0)));
        assert_eq!((x, y), (100.0 + 1020.0 - 400.0, 50.0 + 34.0));
    }

    #[test]
    fn menu_may_pass_the_main_window_but_stays_on_the_work_area() {
        // Taller than the room below the button: above it if that fits, else pinned to the bottom.
        let (_, y) = menu_place(BUTTON, (0.0, 900.0), 1.0, (400.0, 600.0), Some((0.0, 0.0, 1920.0, 1040.0)));
        assert_eq!(y, 900.0 + 4.0 - 600.0);
        let (_, y) = menu_place(BUTTON, (0.0, 300.0), 1.0, (400.0, 900.0), Some((0.0, 0.0, 1920.0, 1040.0)));
        assert_eq!(y, 1040.0 - 900.0);
        let (x, _) = menu_place(MenuAnchor { left: 0.0, right: 30.0, top: 6.0, bottom: 32.0 }, (0.0, 0.0), 1.0, (400.0, 300.0), Some((0.0, 0.0, 1920.0, 1040.0)));
        assert_eq!(x, 0.0);
    }

    #[test]
    fn menu_place_scales_css_pixels() {
        let (x, y) = menu_place(BUTTON, (0.0, 0.0), 1.5, (600.0, 900.0), None);
        assert_eq!((x, y), (1020.0 * 1.5 - 600.0, 34.0 * 1.5));
    }

    #[test]
    fn hex_colours() {
        assert!(hex_color("#12161c").is_some());
        assert!(hex_color("12161c").is_some());
        assert!(hex_color("#fff").is_none());
        assert!(hex_color("#zzzzzz").is_none());
    }
}
