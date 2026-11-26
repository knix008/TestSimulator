// MyISOMaker — the Tauri program.
//
// The page (src/, React) talks to `window.isoMaker`, rebuilt on top of these
// commands by src/platform/tauri-bridge.ts:
//   ipc               a call for the Node host (host/host.ts): image sessions,
//                     xorriso, mounting — the old Electron IPC channels
//   pick              open / save / folder dialogs (the host remembers the folder)
//   open_path         Electron's shell.openPath
//   start_file_drag   tree rows dragged out of the window → OS file drag
//   set_locale        language of the native fallback messages
//   close_ack / close_decision   the unsaved-changes guard on closing
// Host events (job progress) reach the page as the `host-event` event.

mod host;
mod printing;

use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

const MAIN: &str = "main";
/// The window's minimum inner size in CSS pixels (tauri.conf.json minWidth / minHeight):
/// the one-row toolbar needs this width. Snap and SetWindowPos skip Tauri's own minimum,
/// so Resized puts it back.
const MIN_W: f64 = 1100.0;
const MIN_H: f64 = 700.0;

#[derive(Default)]
struct AppState {
    host: Mutex<Option<Arc<host::Host>>>,
    /// Set once closing is decided: the next close request goes through.
    allow_close: AtomicBool,
    /// The page is asking the user (or the native fallback is showing).
    close_pending: AtomicBool,
    /// The page answered the close request within the grace time.
    close_acked: AtomicBool,
    locale: Mutex<String>,
    /// What the print window shows ({ title, html, lang }), set by the window that asked.
    print_doc: Mutex<Value>,
    /// The minimum inner width the page measured (its one-line toolbar), CSS px; 0 = MIN_W.
    min_width: AtomicU64,
    /// Where the theme menu's top-right corner goes (physical screen px).
    theme_anchor: Mutex<Option<(f64, f64)>>,
}

const THEME_MENU: &str = "thememenu";

/// Puts the theme menu with its top-right corner at the anchor, inside the monitor.
fn place_theme_menu(app: &AppHandle, menu: &WebviewWindow) {
    let Some((right, top)) = *state(app).theme_anchor.lock().unwrap() else { return };
    let Ok(size) = menu.outer_size() else { return };
    let (w, h) = (size.width as f64, size.height as f64);
    let mut left = right - w;
    let mut y = top;
    let monitor = app
        .get_webview_window(MAIN)
        .and_then(|m| m.current_monitor().ok().flatten())
        .or_else(|| menu.current_monitor().ok().flatten());
    if let Some(m) = monitor {
        let (mx, my) = (m.position().x as f64, m.position().y as f64);
        let (mw, mh) = (m.size().width as f64, m.size().height as f64);
        left = left.min(mx + mw - w).max(mx);
        y = y.min(my + mh - h).max(my);
    }
    let _ = menu.set_position(tauri::PhysicalPosition::new(left.round() as i32, y.round() as i32));
}

fn min_width(app: &AppHandle) -> f64 {
    let w = state(app).min_width.load(Ordering::SeqCst) as f64;
    if w > 0.0 { w } else { MIN_W }
}

fn state(app: &AppHandle) -> tauri::State<'_, AppState> {
    app.state::<AppState>()
}

fn host_of(app: &AppHandle) -> Result<Arc<host::Host>, String> {
    state(app).host.lock().unwrap().clone().ok_or_else(|| "The ISO host is not running".to_string())
}

fn is_ko(app: &AppHandle) -> bool {
    state(app).locale.lock().unwrap().as_str() != "en"
}

/// Electron's webContents.send, to every window (Settings shows package progress too).
fn emit_page(app: &AppHandle, channel: &str, payload: Value) {
    let _ = app.emit("host-event", json!({ "ch": channel, "p": payload }));
}

// ── Node host ────────────────────────────────────────────────

/// \\?\C:\… → C:\… (Node cannot start a script given as a verbatim path).
fn plain_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
}

fn node_on_path() -> Option<PathBuf> {
    let path = std::ffi::OsString::from(host_path());
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    std::env::split_paths(&path).map(|d| d.join(name)).find(|c| c.is_file())
}

fn host_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    if cfg!(windows) {
        return current;
    }
    let mut parts: Vec<String> = current.split(':').filter(|p| !p.is_empty()).map(String::from).collect();
    for extra in ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin", "/usr/bin", "/usr/sbin", "/bin", "/sbin"] {
        if !parts.iter().any(|p| p == extra) {
            parts.push(extra.to_string());
        }
    }
    parts.join(":")
}

fn project_root() -> PathBuf {
    plain_path(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."))
}

/// Installed: the bundled Node runtime and host (resources/sidecar);
/// a debug build runs dist-sidecar/ of the project with the Node on PATH.
fn host_launch(app: &tauri::App) -> Result<host::Launch, String> {
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let resource_dir = app.path().resource_dir().map(|d| plain_path(&d)).unwrap_or_default();
    let sidecar = resource_dir.join("sidecar");
    let installed = !cfg!(debug_assertions) && sidecar.join("host.mjs").is_file();
    let (bundled_node, script, resources) = if installed {
        (Some(sidecar.join(node_name)).filter(|p| p.is_file()), sidecar.join("host.mjs"), resource_dir.clone())
    } else {
        let root = project_root();
        (None, root.join("dist-sidecar").join("host.mjs"), root)
    };
    if !script.is_file() {
        return Err(format!("The ISO host is missing: {} (run `npm run build:host`)", script.display()));
    }
    let node = std::env::var_os("ISOMAKER_NODE")
        .map(PathBuf::from)
        .or(bundled_node)
        .or_else(node_on_path)
        .ok_or("Node.js was not found. Install Node.js, or use the installed MyISOMaker (it brings its own).")?;
    let mut env = vec![
        ("ISOMAKER_RESOURCE_DIR".to_string(), resources.to_string_lossy().to_string()),
        // macOS / Linux: started from the Finder, Dock or a desktop menu the program gets a
        // short PATH; Homebrew's and the system's tool folders are added for xorriso, brew …
        ("PATH".to_string(), host_path()),
        ("ISOMAKER_VERSION".to_string(), app.package_info().version.to_string()),
    ];
    // Tests keep their remembered folders apart from the user's.
    if let Some(dir) = std::env::var_os("ISOMAKER_CONFIG_DIR").filter(|v| !v.is_empty()) {
        env.push(("ISOMAKER_USER_DATA".to_string(), dir.to_string_lossy().to_string()));
    }
    Ok(host::Launch { node, script, env })
}

fn start_host(app: &tauri::App) {
    let handle = app.handle().clone();
    let launch = match host_launch(app) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[isomaker] {e}");
            let h = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1200));
                emit_page(&h, "host:error", json!(e));
            });
            return;
        }
    };
    let events = handle.clone();
    let on_event: host::OnEvent = Arc::new(move |ch, p| emit_page(&events, &ch, p));
    let exited = handle.clone();
    let on_exit = Box::new(move || {
        state(&exited).host.lock().unwrap().take();
        emit_page(&exited, "host:error", json!("The ISO host stopped unexpectedly. Restart MyISOMaker."));
    });
    match host::Host::start(launch, on_event, on_exit) {
        Ok(h) => *state(&handle).host.lock().unwrap() = Some(h),
        Err(e) => {
            eprintln!("[isomaker] {e}");
            let h = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1200));
                emit_page(&h, "host:error", json!(e));
            });
        }
    }
}

fn stop_host(app: &AppHandle) {
    let taken = state(app).host.lock().unwrap().take();
    if let Some(h) = taken {
        h.stop();
    }
}

// ── Commands ─────────────────────────────────────────────────

#[tauri::command]
async fn ipc(app: AppHandle, ch: String, args: Option<Value>) -> Result<Value, String> {
    let host = host_of(&app)?;
    host.request(&ch, args.unwrap_or_else(|| json!([]))).await
}

#[derive(Deserialize)]
struct Filter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickOptions {
    /// "file" | "files" | "dir" | "save"
    kind: String,
    title: Option<String>,
    filters: Option<Vec<Filter>>,
    hint_path: Option<String>,
    file_name: Option<String>,
}

/// A file dialog. Like the Electron build it starts in the folder of the hint
/// path, else the folder used last, and remembers the folder chosen.
#[tauri::command]
async fn pick(app: AppHandle, window: WebviewWindow, options: PickOptions) -> Result<Value, String> {
    let host = host_of(&app)?;
    let start = host
        .request("paths:dialogDefault", json!([options.hint_path, options.file_name]))
        .await
        .ok()
        .and_then(|v| v.as_str().map(PathBuf::from));
    let ko = is_ko(&app);
    let kind = options.kind.clone();
    let mut dialog = app.dialog().file().set_parent(&window);
    let title = options.title.filter(|t| !t.is_empty()).unwrap_or_else(|| {
        match (kind.as_str(), ko) {
            ("files", true) => "파일 선택",
            ("files", false) => "Select files",
            ("dir", true) => "디렉터리 선택",
            ("dir", false) => "Select directory",
            ("save", true) => "이미지 저장",
            ("save", false) => "Save image",
            (_, true) => "이미지 열기",
            (_, false) => "Open image",
        }
        .to_string()
    });
    dialog = dialog.set_title(title);
    for f in options.filters.unwrap_or_default() {
        let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(f.name, &exts);
    }
    if let Some(start) = start {
        if kind == "save" {
            if let Some(dir) = start.parent().filter(|d| !d.as_os_str().is_empty()) {
                dialog = dialog.set_directory(dir);
            }
            if let Some(name) = start.file_name() {
                dialog = dialog.set_file_name(name.to_string_lossy());
            }
        } else {
            dialog = dialog.set_directory(start);
        }
    } else if kind == "save" {
        if let Some(name) = options.file_name.filter(|n| !n.is_empty()) {
            dialog = dialog.set_file_name(name);
        }
    }
    let picked: Vec<PathBuf> = tauri::async_runtime::spawn_blocking(move || {
        let paths = match kind.as_str() {
            "files" => dialog.blocking_pick_files().unwrap_or_default(),
            "dir" => dialog.blocking_pick_folder().into_iter().collect(),
            "save" => dialog.blocking_save_file().into_iter().collect(),
            _ => dialog.blocking_pick_file().into_iter().collect(),
        };
        paths.into_iter().filter_map(|p| p.into_path().ok()).collect()
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(first) = picked.first() {
        let _ = host.request("paths:remember", json!([first.to_string_lossy()])).await;
    }
    let list: Vec<String> = picked.iter().map(|p| p.to_string_lossy().to_string()).collect();
    Ok(if options.kind == "files" {
        json!(list)
    } else {
        list.into_iter().next().map(Value::String).unwrap_or(Value::Null)
    })
}

/// Electron's shell.openPath: "" when it worked, else the error text.
#[tauri::command]
async fn open_path(app: AppHandle, target: String) -> String {
    match app.opener().open_path(target, None::<&str>) {
        Ok(()) => String::new(),
        Err(e) => e.to_string(),
    }
}

#[tauri::command]
fn set_locale(app: AppHandle, locale: String) {
    if locale == "ko" || locale == "en" {
        *state(&app).locale.lock().unwrap() = locale;
    }
}

fn drag_icon_path() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join("isomaker-drag.png");
    if !path.is_file() {
        std::fs::write(&path, include_bytes!("../icons/32x32.png")).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// Electron's startDrag: the prepared temp copies of tree rows become an OS
/// file drag (copy only). Async, so the command is not on the main thread
/// while it waits for the drag there.
#[tauri::command]
async fn start_file_drag(window: WebviewWindow, paths: Vec<String>) -> Result<bool, String> {
    let files: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).filter(|p| p.exists()).collect();
    if files.is_empty() {
        return Ok(false);
    }
    let icon = drag_icon_path()?;
    let (tx, rx) = std::sync::mpsc::channel();
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                drag::start_drag(
                    &target,
                    drag::DragItem::Files(files),
                    drag::Image::File(icon),
                    |_, _| {},
                    drag::Options { skip_animatation_on_cancel_or_failure: false, mode: drag::DragMode::Copy },
                )
                .map_err(|e| e.to_string())
            }))
            .unwrap_or_else(|_| Err("drag failed".into()));
            let _ = tx.send(outcome);
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())??;
    Ok(true)
}

// ── Closing with unsaved changes ─────────────────────────────

fn close_now(window: &WebviewWindow) {
    let app = window.app_handle();
    state(app).allow_close.store(true, Ordering::SeqCst);
    state(app).close_pending.store(false, Ordering::SeqCst);
    let _ = window.close();
}

/// The page shows its own dialog (save & quit / don't save / cancel). If it
/// does not answer in time (crashed, not loaded), a native message asks.
fn request_close(window: WebviewWindow) {
    let app = window.app_handle().clone();
    if state(&app).close_pending.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let dirty = match host_of(&app) {
            Ok(h) => h
                .request("session:isDirty", json!([]))
                .await
                .ok()
                .and_then(|v| v.get("dirty").and_then(Value::as_bool))
                .unwrap_or(false),
            Err(_) => false,
        };
        if !dirty {
            close_now(&window);
            return;
        }
        state(&app).close_acked.store(false, Ordering::SeqCst);
        emit_page(&app, "app:close-request", Value::Null);
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        if state(&app).close_acked.load(Ordering::SeqCst) || !state(&app).close_pending.load(Ordering::SeqCst) {
            return;
        }
        let ko = is_ko(&app);
        let parent = window.clone();
        let quit = tauri::async_runtime::spawn_blocking(move || {
            app_dialog_quit(&parent, ko)
        })
        .await
        .unwrap_or(false);
        if quit {
            close_now(&window);
        } else {
            state(&app).close_pending.store(false, Ordering::SeqCst);
        }
    });
}

fn app_dialog_quit(window: &WebviewWindow, ko: bool) -> bool {
    let (title, message, yes, no) = if ko {
        ("저장하지 않은 변경", "내용이 변경되었습니다. 저장하지 않고 종료할까요?", "저장 안 함", "취소")
    } else {
        ("Unsaved changes", "Contents have been modified. Quit without saving?", "Don't save", "Cancel")
    };
    window
        .app_handle()
        .dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(yes.into(), no.into()))
        .parent(window)
        .blocking_show()
}

/// The page measured how wide its toolbar is: that is the window's minimum width.
#[tauri::command]
fn set_min_width(app: AppHandle, window: WebviewWindow, width: f64) {
    let width = width.clamp(800.0, 3000.0).ceil();
    state(&app).min_width.store(width as u64, Ordering::SeqCst);
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(width, MIN_H)));
    if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
        let w = size.width as f64 / scale;
        if w + 0.5 < width && !window.is_maximized().unwrap_or(false) {
            let _ = window.set_size(tauri::LogicalSize::new(width, size.height as f64 / scale));
        }
    }
}

/// The shared print window (print.html): one window for everything that prints. It is a
/// window of its own, so it can be moved outside the main window. Async: building a window
/// from a command that runs on the main thread would hang.
#[tauri::command]
async fn open_print_window(app: AppHandle, title: String, html: String, lang: String) -> Result<(), String> {
    *state(&app).print_doc.lock().unwrap() = json!({ "title": title, "html": html, "lang": lang });
    if let Some(w) = app.get_webview_window(printing::PRINT_LABEL) {
        let _ = app.emit_to(printing::PRINT_LABEL, "print-content", Value::Null);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, printing::PRINT_LABEL, WebviewUrl::App("print.html".into()))
        .title(title)
        .inner_size(1180.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .decorations(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// The theme menu is a window of its own, so it can reach past the main window's edge (never
/// past the screen's). `x` is where its right edge goes and `y` its top, in the main window's
/// page coordinates (CSS px). Async: windows are built off the main thread.
#[tauri::command]
async fn show_theme_menu(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let main = app.get_webview_window(MAIN).ok_or("no main window")?;
    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let origin = main.inner_position().map_err(|e| e.to_string())?;
    *state(&app).theme_anchor.lock().unwrap() = Some((origin.x as f64 + x * scale, origin.y as f64 + y * scale));
    let menu = match app.get_webview_window(THEME_MENU) {
        Some(existing) => existing,
        None => WebviewWindowBuilder::new(&app, THEME_MENU, WebviewUrl::App("thememenu.html".into()))
            .title("MyISOMaker")
            .inner_size(480.0, 700.0)
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible(false)
            .parent(&main)
            .map_err(|e| e.to_string())?
            .build()
            .map_err(|e| e.to_string())?,
    };
    place_theme_menu(&app, &menu);
    let _ = app.emit_to(THEME_MENU, "theme-menu-shown", Value::Null);
    menu.show().map_err(|e| e.to_string())?;
    menu.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_theme_menu(app: AppHandle) -> Result<(), String> {
    if let Some(menu) = app.get_webview_window(THEME_MENU) {
        menu.hide().map_err(|e| e.to_string())?;
    }
    app.emit_to(MAIN, "theme-menu-closed", Value::Null).map_err(|e| e.to_string())
}

/// The menu page measured itself; never smaller than a real menu, whatever a page mid-load reports.
#[tauri::command]
fn fit_theme_menu(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    if width < 200.0 || height < 100.0 {
        return Ok(());
    }
    if let Some(menu) = app.get_webview_window(THEME_MENU) {
        menu.set_size(tauri::LogicalSize::new(width.ceil(), height.ceil())).map_err(|e| e.to_string())?;
        place_theme_menu(&app, &menu);
    }
    Ok(())
}

/// "Edit custom theme…" in the menu window: the main window opens Settings › Theme.
#[tauri::command]
fn theme_menu_customize(app: AppHandle) -> Result<(), String> {
    hide_theme_menu(app.clone())?;
    app.emit_to(MAIN, "theme-menu-customize", Value::Null).map_err(|e| e.to_string())
}

/// Help, Settings and About are windows of their own (tool.html#<kind>[:<tab>]).
/// Async: windows are built off the main thread.
#[tauri::command]
async fn open_tool_window(app: AppHandle, kind: String, route: Option<String>) -> Result<(), String> {
    let (w, h, min_w, min_h, resizable) = match kind.as_str() {
        "help" => (1100.0, 820.0, 760.0, 520.0, true),
        // A fixed size every tab fits into: Settings never needs a scrollbar.
        "settings" => (1040.0, 720.0, 1040.0, 720.0, false),
        // Sized to its content by the page (fit_tool_window).
        "about" => (560.0, 460.0, 560.0, 300.0, false),
        _ => return Err(format!("unknown window: {kind}")),
    };
    let route = route.unwrap_or_else(|| kind.clone());
    if let Some(existing) = app.get_webview_window(&kind) {
        let _ = app.emit_to(kind.as_str(), "tool-route", json!(route));
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, kind.as_str(), WebviewUrl::App(format!("tool.html#{route}").into()))
        .title("MyISOMaker")
        .inner_size(w, h)
        .min_inner_size(min_w, min_h)
        .resizable(resizable)
        .decorations(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// A tool window measured its content (Settings: the tallest tab): that is its height.
#[tauri::command]
fn fit_tool_window(window: WebviewWindow, height: f64) -> Result<(), String> {
    let height = height.clamp(300.0, 1400.0).ceil();
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let width = window.inner_size().map_err(|e| e.to_string())?.width as f64 / scale;
    // Never taller than the screen it is on.
    let height = match window.current_monitor() {
        Ok(Some(m)) => height.min(m.size().height as f64 / scale - 40.0),
        _ => height,
    };
    window.set_min_size(Some(tauri::LogicalSize::new(width, height))).map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    Ok(())
}

/// About window: what the program runs on.
#[tauri::command]
fn app_info(app: AppHandle) -> Value {
    json!({
        "version": app.package_info().version.to_string(),
        "tauri": tauri::VERSION,
        "webview": tauri::webview_version().unwrap_or_default(),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "debug": cfg!(debug_assertions),
    })
}

#[tauri::command]
fn print_content(app: AppHandle) -> Value {
    state(&app).print_doc.lock().unwrap().clone()
}

#[tauri::command]
fn close_ack(app: AppHandle) {
    state(&app).close_acked.store(true, Ordering::SeqCst);
}

/// "save-done" / "discard" quit (the page saved already if asked); "cancel" stays.
#[tauri::command]
fn close_decision(app: AppHandle, decision: String) {
    if decision == "cancel" {
        state(&app).close_pending.store(false, Ordering::SeqCst);
        return;
    }
    if let Some(w) = app.get_webview_window(MAIN) {
        close_now(&w);
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { locale: Mutex::new("ko".into()), ..Default::default() })
        .setup(|app| {
            start_host(app);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let app = window.app_handle();
                    if state(app).allow_close.load(Ordering::SeqCst) {
                        return;
                    }
                    api.prevent_close();
                    if let Some(w) = app.get_webview_window(MAIN) {
                        request_close(w);
                    }
                }
                WindowEvent::Resized(size) => {
                    let Ok(scale) = window.scale_factor() else { return };
                    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) || size.width == 0 {
                        return;
                    }
                    let w = size.width as f64 / scale;
                    let h = size.height as f64 / scale;
                    let min_w = min_width(window.app_handle());
                    if w + 0.5 < min_w || h + 0.5 < MIN_H {
                        let _ = window.set_size(tauri::LogicalSize::new(w.max(min_w), h.max(MIN_H)));
                    }
                }
                WindowEvent::Destroyed => {
                    stop_host(window.app_handle());
                    window.app_handle().exit(0);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            ipc,
            pick,
            open_path,
            set_locale,
            start_file_drag,
            close_ack,
            close_decision,
            set_min_width,
            open_print_window,
            print_content,
            open_tool_window,
            fit_tool_window,
            app_info,
            show_theme_menu,
            hide_theme_menu,
            fit_theme_menu,
            theme_menu_customize,
            printing::list_printers,
            printing::print_direct,
            printing::print_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyISOMaker");
}
