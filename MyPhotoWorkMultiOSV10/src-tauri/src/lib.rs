// My Photo Work - Tauri shell.
//
//   - the main window: frameless (the page draws the title bar), at the saved place
//     and size; hidden until the page says it has painted, so no white flash
//   - menu and dialog popups as their own windows (popups.rs)
//   - the user guide (doc/index.html) in a window of its own
//   - files (files.rs), neural model downloads (models.rs), printing (print.rs)
//   - closing asks the page first, which may have unsaved work
//   - one instance: a second start only raises the running window
mod files;
mod models;
mod popups;
mod print;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// The toolbar row holds every command on one line and never scrolls, so the window
/// may not be narrower than that row needs.
pub const MIN_WIDTH: f64 = 1280.0;
pub const MIN_HEIGHT: f64 = 700.0;
const DEFAULT_WIDTH: f64 = 1680.0;
const DEFAULT_HEIGHT: f64 = 940.0;
const TITLE: &str = "My Photo Work V1.0";
const GUIDE: &str = "guide";
/// The folder the Electron build used, so models already downloaded are still found.
const DATA_FOLDER: &str = "My Photo Work V1.0";
/// Where the Electron build run from source kept its data; models.rs looks there too.
pub const LEGACY_DEV_FOLDER: &str = "My Photo Work V1.0 Dev";

/* ---------------------------------------------------------------- state */

#[derive(Default)]
struct Shell {
    /// The last normal (not maximized / minimized) place, in logical pixels.
    normal: Mutex<Option<(f64, f64, f64, f64)>>,
    shown: AtomicBool,
    quitting: AtomicBool,
}

/// Models and the window position. MPW_DATA_DIR moves it (and marks an isolated test run).
pub fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("MPW_DATA_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    let var = |name: &str| std::env::var(name).unwrap_or_else(|_| ".".into());
    if cfg!(windows) {
        return PathBuf::from(var("APPDATA")).join(DATA_FOLDER);
    }
    if cfg!(target_os = "macos") {
        return PathBuf::from(var("HOME")).join("Library/Application Support").join(DATA_FOLDER);
    }
    let base = std::env::var("XDG_CONFIG_HOME").unwrap_or_else(|_| format!("{}/.config", var("HOME")));
    PathBuf::from(base).join(DATA_FOLDER)
}

/// What the page can ask about the shell synchronously (the About window).
pub fn host_script() -> &'static str {
    static SCRIPT: OnceLock<String> = OnceLock::new();
    SCRIPT.get_or_init(|| {
        let info = json!({
            "tauri": tauri::VERSION,
            "webview": tauri::webview_version().unwrap_or_default(),
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        });
        format!("window.__MPW_HOST__ = {info};")
    })
}

/* --------------------------------------------------------- window place */

fn window_file() -> PathBuf {
    data_dir().join("window.json")
}

fn track(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let (Ok(scale), Ok(pos), Ok(size)) = (window.scale_factor(), window.outer_position(), window.inner_size()) else { return };
    let pos = pos.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    if let Some(shell) = window.try_state::<Shell>() {
        *shell.normal.lock().unwrap_or_else(|e| e.into_inner()) = Some((pos.x, pos.y, size.width, size.height));
    }
}

fn remember_window(app: &AppHandle) {
    let Some(main) = app.get_webview_window("main") else { return };
    let saved = *app.state::<Shell>().normal.lock().unwrap_or_else(|e| e.into_inner());
    let Some((x, y, width, height)) = saved else { return };
    let text = json!({ "x": x.round(), "y": y.round(), "width": width.round(), "height": height.round(), "maximized": main.is_maximized().unwrap_or(false) });
    let _ = std::fs::create_dir_all(data_dir());
    let _ = std::fs::write(window_file(), text.to_string());
}

/// A saved position on a monitor that is gone would open the window off screen.
fn keep_on_screen(window: &WebviewWindow) {
    let (Ok(pos), Ok(size), Ok(monitors)) = (window.outer_position(), window.outer_size(), window.available_monitors()) else { return };
    let visible = monitors.iter().any(|m| {
        let (mx, my) = (m.position().x, m.position().y);
        let (mw, mh) = (m.size().width as i32, m.size().height as i32);
        pos.x + 80 < mx + mw && pos.x + size.width as i32 - 80 > mx && pos.y >= my - 8 && pos.y + 40 < my + mh
    });
    if !visible {
        let _ = window.center();
    }
}

fn open_main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let saved: Value = std::fs::read_to_string(window_file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    let num = |key: &str| saved[key].as_f64();
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title(TITLE)
        .initialization_script(host_script())
        // The page takes files dropped on it itself (handleDrop in App.tsx); Tauri's own
        // handler would swallow the HTML drag events.
        .disable_drag_drop_handler()
        .inner_size(num("width").unwrap_or(DEFAULT_WIDTH).max(MIN_WIDTH), num("height").unwrap_or(DEFAULT_HEIGHT).max(MIN_HEIGHT))
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .visible(false)
        .background_color(tauri::window::Color(0x11, 0x16, 0x1d, 255));
    match (num("x"), num("y")) {
        (Some(x), Some(y)) => builder = builder.position(x, y),
        _ => builder = builder.center(),
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    keep_on_screen(&window);
    if saved["maximized"].as_bool().unwrap_or(false) {
        let _ = window.maximize();
    }
    // The OS minimum binds the outer rectangle, which on a frameless window carries
    // invisible resize borders; without them the toolbar's width would be cut short.
    if let (Ok(scale), Ok(outer), Ok(inner)) = (window.scale_factor(), window.outer_size(), window.inner_size()) {
        let extra_w = outer.width.saturating_sub(inner.width) as f64 / scale;
        let extra_h = outer.height.saturating_sub(inner.height) as f64 / scale;
        let _ = window.set_min_size(Some(LogicalSize::new(MIN_WIDTH + extra_w, MIN_HEIGHT + extra_h)));
    }
    Ok(window)
}

fn show_main(app: &AppHandle) {
    if app.state::<Shell>().shown.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    // Popups run in webviews of their own, and starting one is what would make the
    // first click on a menu or a dialog feel slow. They start here instead, with the
    // editor on screen, so the wait falls where nobody is waiting.
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1200));
        popups::warm(&handle);
    });
}

fn quit(app: &AppHandle) {
    remember_window(app);
    app.state::<Shell>().quitting.store(true, Ordering::SeqCst);
    popups::close_all(app);
    print::close_host(app);
    if let Some(guide) = app.get_webview_window(GUIDE) {
        let _ = guide.destroy();
    }
    app.exit(0);
}

/* ------------------------------------------------------------- commands */

/// The page has painted: the window can appear.
#[tauri::command]
async fn window_ready(app: AppHandle) {
    show_main(&app);
}

/// The page has dealt with any unsaved work, or there was none.
#[tauri::command]
async fn window_force_close(app: AppHandle) {
    quit(&app);
}

/// The user guide in its own top-level window: not owned by the main window, so it can
/// sit beside or behind it. A second request raises the open one.
#[tauri::command]
async fn open_guide(app: AppHandle, language: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(GUIDE) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let language = if language == "en" { "en" } else { "ko" };
    WebviewWindowBuilder::new(&app, GUIDE, WebviewUrl::App(format!("doc/index.html?lang={language}").into()))
        .title(TITLE)
        .initialization_script(host_script())
        .inner_size(1180.0, 840.0)
        .min_inner_size(820.0, 480.0)
        .decorations(false)
        .shadow(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    let app = window.app_handle();
    let label = window.label();
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            if label == "main" {
                if !app.state::<Shell>().quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = app.emit_to("main", "window:close-request", ());
                }
            } else if popups::on_close_requested(app, label) {
                api.prevent_close();
            }
        }
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) if label == "main" => track(window),
        tauri::WindowEvent::Focused(focused) if label == popups::MENU => popups::menu_focus_changed(app, *focused),
        tauri::WindowEvent::Destroyed => {
            if label == "main" {
                quit(app);
            } else {
                popups::on_destroyed(app, label);
            }
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // A test run with its own data folder must not hand over to an installed copy.
    if std::env::var_os("MPW_DATA_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.unminimize();
                let _ = main.show();
                let _ = main.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(Shell::default())
        .manage(popups::Popups::default())
        .manage(models::Downloads::default())
        .setup(|app| {
            let handle = app.handle().clone();
            open_main_window(&handle).map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            // Should the page never report in, an empty window beats no window at all.
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(8));
                show_main(&handle);
            });
            Ok(())
        })
        .on_window_event(on_window_event)
        .invoke_handler(tauri::generate_handler![
            window_ready,
            window_force_close,
            open_guide,
            files::files_open,
            files::files_read,
            files::files_save,
            files::files_write,
            models::models_list,
            models::models_read,
            models::models_remove,
            models::models_download,
            models::models_cancel,
            print::print_info,
            print::print_pdf,
            print::print_html,
            popups::menu_open,
            popups::menu_close,
            popups::menu_payload,
            popups::menu_size,
            popups::menu_choose,
            popups::dialog_open,
            popups::dialog_payload,
            popups::dialog_result,
            popups::dialog_close,
            popups::dialog_close_all,
            popups::dialog_size,
            popups::dialog_error,
        ])
        .run(tauri::generate_context!())
        .expect("My Photo Work failed to start");
}
