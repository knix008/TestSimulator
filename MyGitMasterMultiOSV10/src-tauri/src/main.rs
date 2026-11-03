// My Git Master — Tauri shell.
//
//   • starts the Node core (core.rs), which serves the UI, the API and the terminal
//     WebSocket on a loopback port; every window loads from it, exactly like the web build
//   • the main window: frameless (the menu row is the title bar), opens in the saved
//     theme colour at the saved position / size, which it saves on close
//   • Diff and Merge tool windows, one of each, reused when opened again
//   • menus and dialogs as their own windows (popups.rs), so they can extend past the
//     main window; the user's guide in a window of its own
//   • one instance: a second start brings the running window forward
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod core;
mod popups;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

use crate::core::Core;
use crate::popups::Popups;

const MAIN: &str = "main";
const TITLE: &str = "My Git Master";
const MIN_WIDTH: f64 = 680.0;
const MIN_HEIGHT: f64 = 640.0;
/// Same folder as core/settings.ts (SETTINGS_FOLDER).
const SETTINGS_FOLDER: &str = "MyGitMaster";
/// The `--bg` of every theme in core/themes.ts; test/cases.ts keeps the two in step.
const THEME_BACKGROUNDS: &str = include_str!("../../core/themeBackgrounds.json");
const DEFAULT_THEME: &str = "light-classic";

/* ------------------------------------------------------------- settings */

/// Where settings.json lives (see core/settings.ts); MGM_SETTINGS_DIR moves it.
fn settings_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MGM_SETTINGS_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    let home = || std::env::var("HOME").unwrap_or_else(|_| ".".into());
    if cfg!(windows) {
        return PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into())).join(SETTINGS_FOLDER);
    }
    if cfg!(target_os = "macos") {
        return PathBuf::from(home()).join("Library").join("Application Support").join(SETTINGS_FOLDER);
    }
    let base = std::env::var("XDG_CONFIG_HOME").unwrap_or_else(|_| format!("{}/.config", home()));
    PathBuf::from(base).join(SETTINGS_FOLDER)
}

fn read_settings() -> Value {
    std::fs::read_to_string(settings_dir().join("settings.json"))
        .ok()
        .and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or(Value::Null)
}

/// The window background for a theme id, so a window never opens in a colour the
/// stylesheet is about to replace.
fn theme_background(id: &str) -> String {
    let table: Value = serde_json::from_str(THEME_BACKGROUNDS).unwrap_or(Value::Null);
    table[id]
        .as_str()
        .or_else(|| table[DEFAULT_THEME].as_str())
        .unwrap_or("#f3f4f6")
        .to_string()
}

/// The saved theme's background — a user theme (`custom-…`, settings.customThemes)
/// included — so the windows open in the colour the page is about to paint.
fn saved_background() -> String {
    settings_background(&read_settings())
}

fn settings_background(settings: &Value) -> String {
    let id = settings["theme"].as_str().unwrap_or(DEFAULT_THEME);
    let custom = settings["customThemes"]
        .as_array()
        .and_then(|list| list.iter().find(|item| item["id"].as_str() == Some(id)))
        .and_then(|item| item["colors"]["bg"].as_str())
        .filter(|bg| colour(bg).is_some());
    match custom {
        Some(bg) => bg.to_string(),
        None => theme_background(id),
    }
}

/// `#rrggbb` → a window colour.
fn colour(hex: &str) -> Option<tauri::window::Color> {
    let hex = hex.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    Some(tauri::window::Color(byte(0)?, byte(2)?, byte(4)?, 255))
}

/* ---------------------------------------------------------------- state */

#[derive(Clone, Copy)]
struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

struct Shell {
    /// The main window's last normal (not maximized / minimized) bounds, logical pixels.
    normal: Mutex<Option<Bounds>>,
    /// The minimum the page measured for its toolbar (window_min_size), logical pixels.
    min_size: Mutex<(f64, f64)>,
}

/// Windows applies a window's minimum only to sizing with the mouse; a size set any
/// other way (another program, a restore to a saved size, a DPI change) can still be
/// smaller and clip the toolbar. So every resize of the main window is checked too.
fn enforce_min_size(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) || !window.is_visible().unwrap_or(true) {
        return;
    }
    let Some(shell) = window.try_state::<Shell>() else { return };
    let (min_width, min_height) = *shell.min_size.lock().unwrap_or_else(|e| e.into_inner());
    let (Ok(scale), Ok(size)) = (window.scale_factor(), window.inner_size()) else { return };
    let size = size.to_logical::<f64>(scale);
    if size.width + 0.5 < min_width || size.height + 0.5 < min_height {
        let _ = window.set_size(tauri::LogicalSize::new(size.width.max(min_width), size.height.max(min_height)));
    }
}

fn track(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let (Ok(scale), Ok(pos), Ok(size)) = (window.scale_factor(), window.outer_position(), window.inner_size()) else { return };
    let pos = pos.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    if let Some(shell) = window.try_state::<Shell>() {
        *shell.normal.lock().unwrap_or_else(|e| e.into_inner()) =
            Some(Bounds { x: pos.x, y: pos.y, width: size.width, height: size.height });
    }
}

/// Writes `window` into settings.json; the core keeps keys it does not know when it saves.
fn remember_window(window: &tauri::Window) {
    track(window);
    let Some(shell) = window.try_state::<Shell>() else { return };
    let Some(b) = *shell.normal.lock().unwrap_or_else(|e| e.into_inner()) else { return };
    let mut settings = read_settings();
    if !settings.is_object() {
        settings = json!({});
    }
    settings["window"] = json!({
        "width": b.width.round(), "height": b.height.round(), "x": b.x.round(), "y": b.y.round(),
        "maximized": window.is_maximized().unwrap_or(false),
    });
    let dir = settings_dir();
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(text) = serde_json::to_string_pretty(&settings) {
        let _ = std::fs::write(dir.join("settings.json"), text);
    }
}

/* -------------------------------------------------------------- windows */

/// Windows open hidden and show once the page has applied its theme (window_ready),
/// or after a few seconds whatever happens.
fn reveal_later(window: &WebviewWindow) {
    let window = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(4));
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
    });
}

fn open_main_window(app: &AppHandle, url: &str) -> Result<WebviewWindow, String> {
    let settings = read_settings();
    let saved = &settings["window"];
    let num = |key: &str| saved[key].as_f64();
    let url = tauri::Url::parse(url).map_err(|e| e.to_string())?;
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::External(url))
        .title(TITLE)
        .inner_size(num("width").unwrap_or(1640.0).max(MIN_WIDTH), num("height").unwrap_or(900.0).max(MIN_HEIGHT))
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        // No OS title bar: the menu row carries the icon, the name and the window controls.
        .decorations(false)
        .shadow(true)
        .visible(false)
        .maximized(saved["maximized"].as_bool().unwrap_or(false));
    if let Some(colour) = colour(&saved_background()) {
        builder = builder.background_color(colour);
    }
    match (num("x"), num("y")) {
        (Some(x), Some(y)) => builder = builder.position(x, y),
        _ => builder = builder.center(),
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    keep_on_screen(&window);
    reveal_later(&window);
    Ok(window)
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

/// Tool windows only ever show the app itself (the core or, in development, Vite).
fn is_app_url(url: &tauri::Url) -> bool {
    url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"))
}

fn tool_label(kind: &str) -> &'static str {
    if kind == "merge" { "tool-merge" } else { "tool-diff" }
}

fn close_tool_windows(app: &AppHandle) {
    for label in ["tool-diff", "tool-merge"] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
}

fn show_startup_error(app: &AppHandle, message: &str) {
    eprintln!("My Git Master failed to start\n{message}");
    if std::env::var_os("MGM_SMOKE").is_none() {
        app.dialog()
            .message(message)
            .title(TITLE)
            .kind(tauri_plugin_dialog::MessageDialogKind::Error)
            .blocking_show();
    }
    app.exit(1);
}

fn quit(app: &AppHandle) {
    popups::close_all(app);
    close_tool_windows(app);
    app.state::<Core>().stop();
    app.exit(0);
}

/* ------------------------------------------------------------- commands */

#[tauri::command]
async fn window_minimize(window: WebviewWindow) -> bool {
    window.minimize().is_ok()
}

#[tauri::command]
async fn window_toggle_maximize(window: WebviewWindow) -> bool {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
async fn window_is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

/// The renderer's close button; for the main window this ends the app (see on_window_event).
#[tauri::command]
async fn window_close(window: WebviewWindow) -> bool {
    window.close().is_ok()
}

/// The page has applied its theme: show the window, which opened hidden.
#[tauri::command]
async fn window_ready(window: WebviewWindow) -> bool {
    if !window.is_visible().unwrap_or(true) {
        let _ = window.show();
        let _ = window.set_focus();
    }
    true
}

/// The theme's background, so a window never shows another colour at its edges or while
/// it loads. From the main window it also goes to every popup.
#[tauri::command]
async fn window_background(app: AppHandle, window: WebviewWindow, color: String) -> bool {
    if let Some(colour) = colour(&color) {
        let _ = window.set_background_color(Some(colour));
    }
    if window.label() == MAIN {
        popups::apply_background(&app, &color);
    }
    true
}

/// New settings go to every window but the one that made the change — which is what
/// stops two windows echoing an update back and forth.
#[tauri::command]
async fn settings_broadcast(app: AppHandle, window: WebviewWindow, settings: Value) -> bool {
    for (label, _) in app.webview_windows() {
        if label != window.label() {
            let _ = app.emit_to(label.as_str(), "settings:changed", settings.clone());
        }
    }
    true
}

/// The minimum size the renderer measured (the toolbar's natural width, so no button is
/// ever cut off), clamped to the display: a minimum wider than the screen would leave
/// the window unresizable. A window narrower than the new minimum is widened at once.
#[tauri::command]
async fn window_min_size(window: WebviewWindow, width: f64, height: f64) -> f64 {
    let area = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let scale = m.scale_factor();
            (m.work_area().size.width as f64 / scale, m.work_area().size.height as f64 / scale)
        })
        .unwrap_or((f64::MAX, f64::MAX));
    let (min_width, min_height) = clamp_min_size(width, height, area);
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(min_width, min_height)));
    if window.label() == MAIN {
        if let Some(shell) = window.try_state::<Shell>() {
            *shell.min_size.lock().unwrap_or_else(|e| e.into_inner()) = (min_width, min_height);
        }
    }
    // A minimized or maximized window keeps its state: resizing it here would restore
    // it, which is what broke minimize / maximize. The new minimum applies on restore.
    let resting = window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) || !window.is_visible().unwrap_or(true);
    if !resting {
        if let (Ok(scale), Ok(size)) = (window.scale_factor(), window.inner_size()) {
            let size = size.to_logical::<f64>(scale);
            if size.width < min_width || size.height < min_height {
                let _ = window.set_size(tauri::LogicalSize::new(size.width.max(min_width), size.height.max(min_height)));
            }
        }
    }
    min_width
}

/// A requested minimum, never below the app's floor and never above the work area.
fn clamp_min_size(width: f64, height: f64, area: (f64, f64)) -> (f64, f64) {
    let width = if width.is_finite() { width.ceil() } else { MIN_WIDTH };
    let height = if height.is_finite() { height.ceil() } else { MIN_HEIGHT };
    (width.max(MIN_WIDTH).min(area.0), height.max(MIN_HEIGHT).min(area.1))
}

#[tauri::command]
async fn window_start_drag(window: WebviewWindow) {
    let _ = window.start_dragging();
}

/// The status bar's corner grip: an OS resize from the bottom-right corner.
#[tauri::command]
async fn window_start_resize(window: WebviewWindow) {
    let _ = window.as_ref().window().start_resize_dragging(tauri_runtime::ResizeDirection::SouthEast);
}

fn path_text(path: tauri_plugin_dialog::FilePath) -> Option<String> {
    path.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

/// A folder: a repository to open, a clone target or an export folder (`create`).
#[tauri::command]
async fn pick_directory(app: AppHandle, window: WebviewWindow, create: bool) -> Option<String> {
    let dialog = app.dialog().file().set_parent(&window).set_can_create_directories(create);
    dialog.blocking_pick_folder().and_then(path_text)
}

/// An external diff / merge program. The dialog opens where programs live: the folder
/// of the tool already chosen (`current`), else the system's program folder.
#[tauri::command]
async fn pick_program(app: AppHandle, window: WebviewWindow, current: Option<String>) -> Option<String> {
    let mut dialog = app.dialog().file().set_parent(&window);
    if let Some(dir) = program_folder(current.as_deref()) {
        dialog = dialog.set_directory(dir);
    }
    if cfg!(windows) {
        dialog = dialog.add_filter("Programs", &["exe", "cmd", "bat"]);
    }
    dialog.blocking_pick_file().and_then(path_text)
}

/// The folder to start a program search in (see pick_program).
fn program_folder(current: Option<&str>) -> Option<PathBuf> {
    let chosen = current
        .map(|text| text.trim().trim_matches('"'))
        .filter(|text| !text.is_empty())
        .map(PathBuf::from)
        .and_then(|path| if path.is_dir() { Some(path) } else { path.parent().map(PathBuf::from) })
        .filter(|dir| dir.is_dir());
    if chosen.is_some() {
        return chosen;
    }
    let system = if cfg!(windows) {
        std::env::var("ProgramFiles").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(r"C:\Program Files"))
    } else if cfg!(target_os = "macos") {
        PathBuf::from("/Applications")
    } else {
        PathBuf::from("/usr/bin")
    };
    system.is_dir().then_some(system)
}

/// Opens the Diff or Merge tool window, or points the open one at a new file.
#[tauri::command]
async fn tool_open(app: AppHandle, url: String, kind: String) -> Result<(), String> {
    let url = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !is_app_url(&url) {
        return Err("not an app address".into());
    }
    let label = tool_label(&kind);
    if let Some(window) = app.get_webview_window(label) {
        window.navigate(url).map_err(|e| e.to_string())?;
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let title = if kind == "merge" { "Diff & Merge" } else { "Diff" };
    let mut builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
        .title(title)
        .inner_size(1100.0, 760.0)
        .min_inner_size(680.0, 480.0)
        .decorations(false)
        .shadow(true)
        .visible(false)
        .center();
    if let Some(colour) = colour(&saved_background()) {
        builder = builder.background_color(colour);
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    reveal_later(&window);
    Ok(())
}

/* ------------------------------------------------------------ lifecycle */

fn main() {
    let isolated = std::env::var_os("MGM_SETTINGS_DIR").is_some();
    // A private profile (tests) gets its own webview data too, and does not share the
    // single-instance lock with an installed copy.
    if isolated && std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", settings_dir().join("webview"));
    }

    let context = tauri::generate_context!();
    let resources = tauri::utils::platform::resource_dir(context.package_info(), &tauri::Env::default()).ok();

    let mut builder = tauri::Builder::default();
    if !isolated {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let Some(main) = app.get_webview_window(MAIN) else { return };
            let _ = main.unminimize();
            let _ = main.show();
            let _ = main.set_focus();
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(Core::new())
        .manage(Shell { normal: Mutex::new(None), min_size: Mutex::new((MIN_WIDTH, MIN_HEIGHT)) })
        .manage(Popups::default())
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_toggle_maximize,
            window_is_maximized,
            window_close,
            window_ready,
            window_start_drag,
            window_start_resize,
            window_background,
            settings_broadcast,
            window_min_size,
            pick_directory,
            pick_program,
            tool_open,
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
            popups::dialog_update,
            popups::guide_open,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            // The core starts off the main thread; the window opens once it listens.
            std::thread::spawn(move || {
                let core_port = std::env::var("MGM_CORE_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(0);
                let started = match handle.state::<Core>().start(resources, core_port) {
                    Ok(started) => started,
                    Err(error) => return show_startup_error(&handle, &error),
                };
                // `npm start` points the window at the Vite dev server (live reload),
                // which proxies /api to this core.
                let url = match std::env::var("MGM_UI") {
                    Ok(ui) if !ui.is_empty() && cfg!(debug_assertions) => ui,
                    _ if started.serves_ui => format!("http://127.0.0.1:{}", started.port),
                    _ => return show_startup_error(&handle, "The user interface was not built (dist/ is missing). Run npm run build:ui."),
                };
                handle.state::<Popups>().set_base(&url);
                handle.state::<Popups>().set_background(&saved_background());
                if let Err(error) = open_main_window(&handle, &url) {
                    return show_startup_error(&handle, &error);
                }
                // Loaded, hidden popup windows, so the first menu or dialog opens at once.
                std::thread::sleep(Duration::from_millis(1200));
                popups::warm(&handle);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            let is_main = window.label() == MAIN;
            match event {
                tauri::WindowEvent::Moved(_) if is_main => track(window),
                tauri::WindowEvent::Resized(_) => {
                    if is_main {
                        enforce_min_size(window);
                        track(window);
                    }
                    let maximized = window.is_maximized().unwrap_or(false);
                    let _ = app.emit_to(window.label(), "window:state", json!({ "maximized": maximized }));
                }
                tauri::WindowEvent::Focused(focused) if window.label() == popups::MENU => {
                    popups::menu_focus_changed(app, *focused)
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if is_main {
                        remember_window(window);
                        api.prevent_close();
                        quit(app);
                    } else if popups::on_close_requested(app, window.label()) {
                        api.prevent_close();
                    }
                }
                tauri::WindowEvent::Destroyed => popups::on_destroyed(app, window.label()),
                _ => {}
            }
        })
        .build(context)
        .expect("error while building My Git Master")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<Core>().stop();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_backgrounds_come_from_the_table() {
        assert_eq!(theme_background("dark-ink"), "#121212");
        assert_eq!(theme_background("no-such-theme"), theme_background(DEFAULT_THEME));
    }

    #[test]
    fn minimum_sizes_are_clamped() {
        assert_eq!(clamp_min_size(1200.4, 100.0, (1920.0, 1040.0)), (1201.0, MIN_HEIGHT));
        assert_eq!(clamp_min_size(5000.0, 5000.0, (1920.0, 1040.0)), (1920.0, 1040.0));
        assert_eq!(clamp_min_size(f64::NAN, 0.0, (1920.0, 1040.0)), (MIN_WIDTH, MIN_HEIGHT));
    }

    #[test]
    fn user_themes_open_in_their_own_background() {
        let settings = json!({
            "theme": "custom-1",
            "customThemes": [{ "id": "custom-1", "name": "Mine", "mode": "dark", "colors": { "bg": "#102030" } }],
        });
        assert_eq!(settings_background(&settings), "#102030");
        assert_eq!(settings_background(&json!({ "theme": "dark-ink" })), "#121212");
        let broken = json!({ "theme": "custom-2", "customThemes": [{ "id": "custom-2", "colors": { "bg": "navy" } }] });
        assert_eq!(settings_background(&broken), theme_background(DEFAULT_THEME));
    }

    #[test]
    fn program_picker_starts_in_a_program_folder() {
        let exe = std::env::current_exe().unwrap();
        let folder = exe.parent().unwrap().to_path_buf();
        assert_eq!(program_folder(Some(&exe.to_string_lossy())), Some(folder.clone()));
        assert_eq!(program_folder(Some(&format!("\"{}\"", exe.to_string_lossy()))), Some(folder));
        // No tool yet (or the built-in one): the system program folder.
        let system = program_folder(None);
        assert_eq!(program_folder(Some("")), system);
        assert_eq!(program_folder(Some("mygit:builtin")), system);
    }

    #[test]
    fn colours_parse() {
        assert_eq!(colour("#0a0B0c").map(|c| (c.0, c.1, c.2)), Some((10, 11, 12)));
        assert!(colour("red").is_none());
    }

    #[test]
    fn tool_windows_only_load_the_app() {
        let ok = tauri::Url::parse("http://127.0.0.1:4730/#tool?kind=diff").unwrap();
        let bad = tauri::Url::parse("https://example.com/").unwrap();
        assert!(is_app_url(&ok));
        assert!(!is_app_url(&bad));
        assert_eq!(tool_label("merge"), "tool-merge");
        assert_eq!(tool_label("diff"), "tool-diff");
    }

    #[test]
    fn capabilities_grant_every_command() {
        let caps: Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let granted: Vec<&str> = caps["permissions"].as_array().unwrap().iter().filter_map(Value::as_str).collect();
        let build = include_str!("../build.rs");
        let listed: Vec<&str> = build
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with('"') && line.ends_with("\","))
            .map(|line| line.trim_matches(|c| c == '"' || c == ','))
            .collect();
        assert!(listed.len() > 20);
        for command in listed {
            let permission = format!("allow-{}", command.replace('_', "-"));
            assert!(granted.contains(&permission.as_str()), "{permission} is not granted");
        }
    }
}
