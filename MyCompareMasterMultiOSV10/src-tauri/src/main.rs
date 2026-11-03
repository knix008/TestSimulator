// My Compare Master — Tauri shell.
//
//   • starts the Node core (core.rs), which serves the UI and the API on a loopback
//     port; every window loads from it, exactly like the web build
//   • the main window: frameless (the menu row is the title bar), opens in the saved
//     theme colour at the saved position / size, which it saves on close
//   • menu and dialog popups as their own windows (popups.rs)
//   • one instance: a second start hands its arguments to the running window
//   • `git mergetool` reads the exit code: 0 only when the merge was saved
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod core;
mod popups;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::core::Core;
use crate::popups::Popups;

pub const MIN_WIDTH: f64 = 1080.0;
pub const MIN_HEIGHT: f64 = 620.0;
const TITLE: &str = "My Compare Master V1.0";
const SETTINGS_FOLDER: &str = "MyCompareMaster";
const THEME_SEEDS: &str = include_str!("../../core/themeSeeds.json");

/* ------------------------------------------------------------- settings */

/// Where settings.json lives (see core/settingsStore.ts); MCM_SETTINGS_DIR moves it.
fn settings_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MCM_SETTINGS_DIR") {
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

/// The window background for a theme id, from the table core/themes.ts uses, so a
/// window never opens in a colour the stylesheet is about to replace.
pub fn theme_background(id: &str) -> String {
    let seeds: Value = serde_json::from_str(THEME_SEEDS).unwrap_or(Value::Null);
    let find = |wanted: &str| {
        seeds.as_array().and_then(|list| {
            list.iter()
                .find(|seed| seed["id"].as_str() == Some(wanted))
                .and_then(|seed| seed["bg"].as_str().map(String::from))
        })
    };
    find(id).or_else(|| find("light")).unwrap_or_else(|| "#f1f3f7".into())
}

/* ---------------------------------------------------------------- state */

#[derive(Clone, Copy, Default)]
struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

struct Shell {
    /// The last normal (not maximized / minimized) bounds, in logical pixels.
    normal: Mutex<Option<Bounds>>,
    min_size: Mutex<(f64, f64)>,
    node_version: Mutex<String>,
    merge_tool_run: bool,
    merge_saved: AtomicBool,
}

fn track(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let (Ok(scale), Ok(pos), Ok(size)) = (window.scale_factor(), window.outer_position(), window.outer_size()) else { return };
    let pos = pos.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    if let Some(shell) = window.try_state::<Shell>() {
        *shell.normal.lock().unwrap_or_else(|e| e.into_inner()) =
            Some(Bounds { x: pos.x, y: pos.y, width: size.width, height: size.height });
    }
}

/// Writes `window` into settings.json, as the Electron build did; the core keeps
/// that key when it saves.
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
        let _ = std::fs::write(dir.join("settings.json"), format!("{text}\n"));
    }
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/* ------------------------------------------------------- main window */

fn open_main_window(app: &AppHandle, url: &str) -> Result<WebviewWindow, String> {
    let settings = read_settings();
    let saved = &settings["window"];
    let num = |key: &str| saved[key].as_f64();
    let background = theme_background(settings["theme"].as_str().unwrap_or("light"));
    let url = tauri::Url::parse(url).map_err(|e| e.to_string())?;
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title(TITLE)
        .inner_size(num("width").unwrap_or(1360.0).max(MIN_WIDTH), num("height").unwrap_or(860.0).max(MIN_HEIGHT))
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        // No OS title bar: the menu row carries the icon, the name and the window
        // controls, which is one row of chrome instead of two.
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .maximized(saved["maximized"].as_bool().unwrap_or(false));
    if let Some(colour) = popups::colour(&background) {
        builder = builder.background_color(colour);
    }
    match (num("x"), num("y")) {
        (Some(x), Some(y)) => builder = builder.position(x, y),
        _ => builder = builder.center(),
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    keep_on_screen(&window);
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

fn show_startup_error(app: &AppHandle, message: &str) {
    eprintln!("My Compare Master failed to start\n{message}");
    if std::env::var_os("MCM_SMOKE").is_none() {
        app.dialog()
            .message(message)
            .title("My Compare Master")
            .kind(tauri_plugin_dialog::MessageDialogKind::Error)
            .blocking_show();
    }
    app.exit(1);
}

/* ------------------------------------------------------------- commands */

#[tauri::command]
async fn app_info(app: AppHandle) -> Value {
    let shell = app.state::<Shell>();
    let launcher = std::env::current_exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    json!({
        "platform": std::env::consts::OS.replace("windows", "win32").replace("macos", "darwin"),
        "versions": {
            "tauri": tauri::VERSION,
            "webview": tauri::webview_version().unwrap_or_default(),
            "node": shell.node_version.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        },
        "packaged": !cfg!(debug_assertions),
        "launcher": launcher,
        "iconPath": "",
    })
}

#[tauri::command]
async fn app_quit(app: AppHandle) -> bool {
    if let Some(main) = main_window(&app) {
        remember_window(&main.as_ref().window());
    }
    quit(&app);
    true
}

fn quit(app: &AppHandle) {
    popups::close_all(app);
    let shell = app.state::<Shell>();
    // `git mergetool` treats a non-zero exit as "still conflicted".
    let code = if shell.merge_tool_run && !shell.merge_saved.load(Ordering::SeqCst) { 1 } else { 0 };
    app.state::<Core>().stop();
    app.exit(code);
}

#[tauri::command]
async fn window_title(app: AppHandle, title: String) -> bool {
    if let Some(main) = main_window(&app) {
        let _ = main.set_title(if title.is_empty() { "My Compare Master" } else { &title });
    }
    true
}

/// The minimum width the renderer measured for its toolbar, clamped to the display:
/// a minimum wider than the screen would leave the window unresizable.
#[tauri::command]
async fn window_min_size(app: AppHandle, width: f64, height: f64) -> f64 {
    let Some(main) = main_window(&app) else { return MIN_WIDTH };
    let area = main
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let scale = m.scale_factor();
            (m.work_area().size.width as f64 / scale, m.work_area().size.height as f64 / scale)
        })
        .unwrap_or((f64::MAX, f64::MAX));
    let min_width = width.ceil().max(640.0).min(area.0);
    let min_height = height.ceil().max(480.0).min(area.1);
    *app.state::<Shell>().min_size.lock().unwrap_or_else(|e| e.into_inner()) = (min_width, min_height);
    // The page measured the client area; the OS minimum binds the outer rect, which on
    // a frameless window carries invisible resize borders. Without them the edge drag
    // stopped 16 px short of the toolbar's width.
    let (extra_w, extra_h) = frame_extra(&main);
    let _ = main.set_min_size(Some(LogicalSize::new(min_width + extra_w, min_height + extra_h)));
    if let (Ok(scale), Ok(size)) = (main.scale_factor(), main.inner_size()) {
        let size = size.to_logical::<f64>(scale);
        if size.width < min_width {
            let _ = main.set_size(LogicalSize::new(min_width, size.height));
        }
    }
    min_width
}

/// How much larger the outer rect is than the client area, in logical pixels.
fn frame_extra(window: &tauri::WebviewWindow) -> (f64, f64) {
    let (Ok(scale), Ok(outer), Ok(inner)) = (window.scale_factor(), window.outer_size(), window.inner_size()) else {
        return (0.0, 0.0);
    };
    let outer = outer.to_logical::<f64>(scale);
    let inner = inner.to_logical::<f64>(scale);
    ((outer.width - inner.width).max(0.0), (outer.height - inner.height).max(0.0))
}

/// Puts the window back to its minimum when something other than an edge drag made
/// it smaller: Windows Snap and SetWindowPos from other programs pass the minimum
/// by, and the toolbar's last buttons were then cut off.
fn keep_minimum(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let Some(shell) = window.try_state::<Shell>() else { return };
    let (min_width, min_height) = *shell.min_size.lock().unwrap_or_else(|e| e.into_inner());
    let (Ok(scale), Ok(size)) = (window.scale_factor(), window.inner_size()) else { return };
    let size = size.to_logical::<f64>(scale);
    if size.width + 0.5 < min_width || size.height + 0.5 < min_height {
        let _ = window.set_size(LogicalSize::new(size.width.max(min_width), size.height.max(min_height)));
    }
}

#[tauri::command]
async fn window_background(app: AppHandle, color: String) -> bool {
    if let (Some(main), Some(colour)) = (main_window(&app), popups::colour(&color)) {
        let _ = main.set_background_color(Some(colour));
    }
    popups::apply_background(&app, &color);
    true
}

#[tauri::command]
async fn window_minimize(app: AppHandle) -> bool {
    main_window(&app).map(|w| w.minimize().is_ok()).unwrap_or(false)
}

/// The corner grip. The window's own minimum is the floor.
#[tauri::command]
async fn window_resize_to(app: AppHandle, width: f64, height: f64) -> bool {
    let Some(main) = main_window(&app) else { return false };
    if main.is_maximized().unwrap_or(false) {
        return false;
    }
    let (min_width, min_height) = *app.state::<Shell>().min_size.lock().unwrap_or_else(|e| e.into_inner());
    main.set_size(LogicalSize::new(width.round().max(min_width), height.round().max(min_height))).is_ok()
}

#[tauri::command]
async fn window_toggle_maximize(app: AppHandle) -> bool {
    let Some(main) = main_window(&app) else { return false };
    if main.is_maximized().unwrap_or(false) {
        let _ = main.unmaximize();
    } else {
        let _ = main.maximize();
    }
    main.is_maximized().unwrap_or(false)
}

#[tauri::command]
async fn window_is_maximized(app: AppHandle) -> bool {
    main_window(&app).and_then(|w| w.is_maximized().ok()).unwrap_or(false)
}

#[tauri::command]
async fn window_native_theme(app: AppHandle, kind: String) -> String {
    let theme = match kind.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        _ => None,
    };
    for window in app.webview_windows().values() {
        let _ = window.set_theme(theme);
    }
    if theme.is_some() { kind } else { "system".into() }
}

/// Keeps the webview's own zoom at 1 so the app's zoom setting is the only one.
#[tauri::command]
async fn window_reset_zoom(window: WebviewWindow) {
    let _ = window.set_zoom(1.0);
}

#[tauri::command]
async fn window_start_drag(window: WebviewWindow) {
    let _ = window.start_dragging();
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PickOptions {
    title: Option<String>,
    default_path: Option<String>,
    #[serde(default)]
    multiple: bool,
    #[serde(default)]
    filters: Vec<Filter>,
}

#[derive(Deserialize)]
struct Filter {
    name: String,
    extensions: Vec<String>,
}

fn file_dialog(app: &AppHandle, window: &WebviewWindow, options: &PickOptions) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    let mut dialog = app.dialog().file().set_parent(window);
    if let Some(title) = options.title.as_deref().filter(|t| !t.is_empty()) {
        dialog = dialog.set_title(title);
    }
    if let Some(path) = options.default_path.as_deref().filter(|p| !p.is_empty()) {
        let path = PathBuf::from(path);
        if path.is_dir() {
            dialog = dialog.set_directory(&path);
        } else {
            if let Some(parent) = path.parent().filter(|p| p.is_dir()) {
                dialog = dialog.set_directory(parent);
            }
            if let Some(name) = path.file_name() {
                dialog = dialog.set_file_name(name.to_string_lossy());
            }
        }
    }
    for filter in &options.filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }
    dialog
}

fn path_text(path: tauri_plugin_dialog::FilePath) -> Option<String> {
    path.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
async fn pick_file(app: AppHandle, window: WebviewWindow, options: PickOptions) -> Value {
    let dialog = file_dialog(&app, &window, &options);
    if options.multiple {
        let picked = dialog.blocking_pick_files();
        return picked
            .map(|list| json!(list.into_iter().filter_map(path_text).collect::<Vec<_>>()))
            .unwrap_or(Value::Null);
    }
    dialog.blocking_pick_file().and_then(path_text).map(Value::String).unwrap_or(Value::Null)
}

#[tauri::command]
async fn pick_directory(app: AppHandle, window: WebviewWindow, options: PickOptions) -> Option<String> {
    file_dialog(&app, &window, &options).blocking_pick_folder().and_then(path_text)
}

#[tauri::command]
async fn pick_save(app: AppHandle, window: WebviewWindow, options: PickOptions) -> Option<String> {
    file_dialog(&app, &window, &options).blocking_save_file().and_then(path_text)
}

#[tauri::command]
async fn clipboard_write(app: AppHandle, value: String) -> bool {
    app.clipboard().write_text(value).is_ok()
}

#[tauri::command]
async fn clipboard_read(app: AppHandle) -> String {
    app.clipboard().read_text().unwrap_or_default()
}

#[tauri::command]
async fn shell_open(app: AppHandle, target: String) -> bool {
    let lower = target.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        app.opener().open_url(target, None::<&str>).is_ok()
    } else if !target.is_empty() {
        app.opener().open_path(target, None::<&str>).is_ok()
    } else {
        false
    }
}

#[tauri::command]
async fn shell_reveal(app: AppHandle, target: String) -> bool {
    !target.is_empty() && app.opener().reveal_item_in_dir(target).is_ok()
}

/// The renderer reports a successful merge save, which decides the exit code.
#[tauri::command]
async fn merge_saved(app: AppHandle) -> bool {
    app.state::<Shell>().merge_saved.store(true, Ordering::SeqCst);
    true
}

/// Printing goes through the renderer's own print view; this opens the OS dialog.
#[tauri::command]
async fn print_window(window: WebviewWindow) -> Value {
    match window.print() {
        Ok(()) => json!({ "ok": true, "reason": "" }),
        Err(error) => json!({ "ok": false, "reason": error.to_string() }),
    }
}

/// New settings (theme, language, font) go to every window but the one that made the
/// change — which is what stops two windows echoing an update back and forth.
#[tauri::command]
async fn settings_broadcast(app: AppHandle, window: WebviewWindow, settings: Value) -> bool {
    for (label, _) in app.webview_windows() {
        if label != window.label() {
            let _ = app.emit_to(label.as_str(), "settings:changed", settings.clone());
        }
    }
    true
}

/* ------------------------------------------------------------ lifecycle */

/// `--merge` or four positional paths: git mergetool is waiting for the exit code.
fn is_merge_tool_run(args: &[String]) -> bool {
    args.iter().any(|a| a == "--merge") || args.iter().filter(|a| !a.starts_with('-')).count() >= 4
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let isolated = std::env::var_os("MCM_SETTINGS_DIR").is_some();
    // A private profile (tests) gets its own webview data too, and does not share the
    // single-instance lock with an installed copy.
    if isolated && std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", settings_dir().join("webview"));
    }

    let context = tauri::generate_context!();
    let resources = tauri::utils::platform::resource_dir(context.package_info(), &tauri::Env::default()).ok();

    // `git difftool` waits for this process before it moves on to the next file and
    // deletes its temporary $LOCAL, and the core tells a git run (read-only) from its
    // environment. So a git run keeps its own window rather than handing its two paths
    // to a running copy and exiting at once.
    let git_diff_run = std::env::var_os("GIT_DIFF_PATH_TOTAL").is_some();

    let mut builder = tauri::Builder::default();
    if !isolated && !git_diff_run {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let Some(main) = main_window(app) else { return };
            let _ = main.unminimize();
            let _ = main.show();
            let _ = main.set_focus();
            let forwarded: Vec<String> = argv.into_iter().skip(1).collect();
            let _ = app.emit_to("main", "app:open-request", forwarded);
        }));
    }

    let launch_args = args.clone();
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Core::new())
        .manage(Popups::default())
        .manage(Shell {
            normal: Mutex::new(None),
            min_size: Mutex::new((MIN_WIDTH, MIN_HEIGHT)),
            node_version: Mutex::new(String::new()),
            merge_tool_run: is_merge_tool_run(&args),
            merge_saved: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            app_quit,
            window_title,
            window_min_size,
            window_background,
            window_minimize,
            window_resize_to,
            window_toggle_maximize,
            window_is_maximized,
            window_native_theme,
            window_reset_zoom,
            window_start_drag,
            pick_file,
            pick_directory,
            pick_save,
            clipboard_write,
            clipboard_read,
            shell_open,
            shell_reveal,
            merge_saved,
            print_window,
            settings_broadcast,
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
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let launcher = std::env::current_exe().unwrap_or_default();
            // The core starts off the main thread; the window opens once it listens.
            std::thread::spawn(move || {
                let core_port = std::env::var("MCM_CORE_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(0);
                let started = handle.state::<Core>().start(resources, core_port, &launcher, &launch_args);
                let started = match started {
                    Ok(started) => started,
                    Err(error) => return show_startup_error(&handle, &error),
                };
                *handle.state::<Shell>().node_version.lock().unwrap_or_else(|e| e.into_inner()) = started.node_version.clone();
                // `npm start` points the window at the Vite dev server (live reload),
                // which proxies /api to this core.
                let url = match std::env::var("MCM_UI") {
                    Ok(ui) if !ui.is_empty() && cfg!(debug_assertions) => ui,
                    _ if started.serves_ui => format!("http://127.0.0.1:{}", started.port),
                    _ => return show_startup_error(&handle, "The user interface was not built (dist/ is missing). Run npm run build:ui."),
                };
                let settings = read_settings();
                handle.state::<Popups>().set_base(&url);
                handle.state::<Popups>().set_background(&theme_background(settings["theme"].as_str().unwrap_or("light")));
                if let Err(error) = open_main_window(&handle, &url) {
                    return show_startup_error(&handle, &error);
                }
                std::thread::sleep(std::time::Duration::from_millis(1200));
                popups::warm(&handle);
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            let label = window.label();
            match event {
                tauri::WindowEvent::Moved(_) if label == "main" => track(window),
                tauri::WindowEvent::Resized(_) if label == "main" => {
                    keep_minimum(window);
                    track(window);
                    let maximized = window.is_maximized().unwrap_or(false);
                    let _ = app.emit_to("main", "window:state", json!({ "maximized": maximized }));
                }
                tauri::WindowEvent::Focused(focused) if label == popups::MENU => popups::menu_focus_changed(app, *focused),
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if label == "main" {
                        remember_window(window);
                        api.prevent_close();
                        quit(app);
                    } else if popups::on_close_requested(app, label) {
                        api.prevent_close();
                    }
                }
                tauri::WindowEvent::Destroyed => popups::on_destroyed(app, label),
                _ => {}
            }
        })
        .build(context)
        .expect("error while building My Compare Master")
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
    fn theme_backgrounds_come_from_the_seed_table() {
        assert!(theme_background("light").starts_with('#'));
        assert_eq!(theme_background("no-such-theme"), theme_background("light"));
    }

    #[test]
    fn merge_tool_runs_are_recognised() {
        let strings = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(is_merge_tool_run(&strings(&["B", "L", "R", "M"])));
        assert!(is_merge_tool_run(&strings(&["--merge", "B", "L", "R", "M"])));
        assert!(!is_merge_tool_run(&strings(&["a.txt", "b.txt"])));
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
