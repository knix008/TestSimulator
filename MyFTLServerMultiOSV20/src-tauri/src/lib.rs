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
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

const APP_NAME: &str = "My FTP Server";
const MAIN: &str = "main";
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
    let h = hex.trim_start_matches('#');
    if h.len() == 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (u8::from_str_radix(&h[0..2], 16), u8::from_str_radix(&h[2..4], 16), u8::from_str_radix(&h[4..6], 16)) {
            return Color(r, g, b, 255);
        }
    }
    Color(0x12, 0x16, 0x1c, 255)
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
        WindowEvent::Moved(_) => remember_win_state(&handle, &w),
        WindowEvent::Resized(_) => {
            enforce_min_size(&handle, &w);
            remember_win_state(&handle, &w);
        }
        WindowEvent::CloseRequested { api, .. } => {
            remember_win_state(&handle, &w);
            save_win_state(&handle);
            let keep = state(&handle).tray.lock().map(|t| t.keep).unwrap_or(false);
            if keep && !state(&handle).quitting.load(Ordering::SeqCst) {
                // "Minimise to tray": the window hides, the servers keep running.
                api.prevent_close();
                let _ = w.hide();
                update_tray(&handle);
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
        .invoke_handler(tauri::generate_handler![renderer_ready, set_min_size, set_tray, quit_app])
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
