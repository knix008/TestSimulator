// MyMeeting - Tauri shell. Deliberately small: one frameless main window, settings, the autosaved
// draft, file read/write, the installed fonts and the system print dialog. Everything else is
// the page's.
//   * popout.rs: dialogs as windows of their own
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod popout;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub(crate) const MAIN: &str = "main";
/// A page that can answer is listening. Before that, closing just closes.
static CLOSE_GUARD: AtomicBool = AtomicBool::new(false);
static CLOSE_ALLOWED: AtomicBool = AtomicBool::new(false);
/// A file macOS asked to open (it does not use the command line for that).
static OPENED_FILE: Mutex<Option<String>> = Mutex::new(None);
const SETTINGS_FOLDER: &str = "com.shkwon.mymeeting";
const MIN_WIDTH: f64 = 980.0;
const MIN_HEIGHT: f64 = 600.0;
const DEFAULT_WIDTH: f64 = 1440.0;
const DEFAULT_HEIGHT: f64 = 900.0;

/// Where settings live; MYMEETING_SETTINGS_DIR moves it (tests).
fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MYMEETING_SETTINGS_DIR") {
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

fn read_json(name: &str) -> Value {
    std::fs::read_to_string(data_dir().join(name))
        .ok()
        .and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_json(name: &str, value: &Value) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    // Written beside and renamed, so a crash mid-write never leaves half a file.
    let temp = dir.join(format!("{name}.tmp"));
    std::fs::write(&temp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, dir.join(name)).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_settings() -> Value {
    let mut settings = read_json("settings.json");
    if let (Some(object), Some(language)) = (settings.as_object_mut(), installer_language()) {
        object.entry("language").or_insert_with(|| Value::from(language));
    }
    settings
}

/// The language chosen in the installer, which leaves its Windows language id next to the program.
fn installer_language() -> Option<&'static str> {
    let file = std::env::current_exe().ok()?.parent()?.join("install-language.txt");
    match std::fs::read_to_string(file).ok()?.trim() {
        "1042" => Some("ko"),
        "1033" => Some("en"),
        _ => None,
    }
}

/// Merges `patch` into settings.json, so the page never overwrites the saved window bounds.
#[tauri::command]
fn save_settings(patch: Value) -> Result<(), String> {
    let mut settings = read_json("settings.json");
    if !settings.is_object() {
        settings = json!({});
    }
    if let (Some(target), Some(source)) = (settings.as_object_mut(), patch.as_object()) {
        for (key, value) in source {
            target.insert(key.clone(), value.clone());
        }
    }
    write_json("settings.json", &settings)
}

/// The meeting being written, kept apart from the settings: it can hold large pictures.
#[tauri::command(async)]
fn load_draft() -> Value {
    read_json("draft.json")
}

#[tauri::command(async)]
fn save_draft(draft: Value) -> Result<(), String> {
    write_json("draft.json", &draft)
}

fn minutes_argument(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|arg| !arg.starts_with('-') && arg.to_lowercase().ends_with(".mtg")).cloned()
}

#[tauri::command]
fn startup_file() -> Option<String> {
    minutes_argument(&std::env::args().collect::<Vec<_>>()).or_else(|| OPENED_FILE.lock().ok()?.take())
}

#[tauri::command(async)]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn write_text(path: String, text: String) -> Result<(), String> {
    std::fs::write(path, text).map_err(|e| e.to_string())
}

/// A picture in a format the WebView cannot draw (base64), as a PNG data URL.
#[tauri::command(async)]
fn convert_image(data: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD.decode(data.trim()).map_err(|e| e.to_string())?;
    let picture = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let mut png = std::io::Cursor::new(Vec::new());
    picture.write_to(&mut png, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(png.into_inner())))
}

/// The installed font families, sorted, each once.
#[tauri::command(async)]
fn system_fonts() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    let mut families: Vec<String> = database.faces().filter_map(|face| face.families.first().map(|(name, _)| name.clone())).collect();
    families.sort_by_key(|name| name.to_lowercase());
    families.dedup();
    families
}

#[tauri::command]
fn app_info(app: AppHandle) -> Value {
    json!({
        "version": app.package_info().version.to_string(),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "tauri": tauri::VERSION,
        "webview": tauri::webview_version().unwrap_or_default(),
    })
}

fn allowed_external(url: &str) -> bool {
    url.starts_with("mailto:") || url.starts_with("https://")
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !allowed_external(&url) {
        return Err(format!("not an address: {url}"));
    }
    let mut command = if cfg!(windows) {
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", &url]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = std::process::Command::new("open");
        c.arg(&url);
        c
    } else {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&url);
        c
    };
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    system_print(&window)
}

/// WebView2's default is its own preview inside the window; this is the system's dialog.
#[cfg(windows)]
fn system_print(window: &tauri::WebviewWindow) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM};
    use windows::core::Interface;
    window
        .with_webview(|webview| unsafe {
            if let Ok(core) = webview.controller().CoreWebView2() {
                if let Ok(printer) = core.cast::<ICoreWebView2_16>() {
                    let _ = printer.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM);
                }
            }
        })
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn system_print(window: &tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_guard_ready() {
    CLOSE_GUARD.store(true, Ordering::SeqCst);
}

/// The page has dealt with unsaved work: the window may really close now.
#[tauri::command]
fn main_close(app: AppHandle) {
    CLOSE_ALLOWED.store(true, Ordering::SeqCst);
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.close();
    }
}

/// The page has applied its theme: the window appears without a flash of the wrong colour.
#[tauri::command]
fn window_ready(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

/// Whatever happens in the page, the window does not stay invisible.
fn show_later(window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
    });
}

fn remember_window(window: &tauri::Window) {
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    let mut settings = read_json("settings.json");
    if !settings.is_object() {
        settings = json!({});
    }
    let mut entry = json!({ "maximized": maximized });
    if !maximized {
        if let (Ok(scale), Ok(pos), Ok(size)) = (window.scale_factor(), window.outer_position(), window.inner_size()) {
            let pos = pos.to_logical::<f64>(scale);
            let size = size.to_logical::<f64>(scale);
            entry = json!({ "maximized": false, "x": pos.x.round(), "y": pos.y.round(), "width": size.width.round(), "height": size.height.round() });
        }
    } else if let Some(old) = settings["window"].as_object() {
        for key in ["x", "y", "width", "height"] {
            if let Some(value) = old.get(key) {
                entry[key] = value.clone();
            }
        }
    }
    settings["window"] = entry;
    let _ = write_json("settings.json", &settings);
}

fn open_main_window(app: &AppHandle) -> Result<(), String> {
    let settings = read_json("settings.json");
    let saved = &settings["window"];
    let num = |key: &str| saved[key].as_f64();
    let (fit_w, fit_h) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let factor = monitor.scale_factor();
            let area = monitor.work_area().size;
            (f64::from(area.width) / factor - 40.0, f64::from(area.height) / factor - 40.0)
        })
        .unwrap_or((DEFAULT_WIDTH, DEFAULT_HEIGHT));
    let dialogs = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        // Every dialog opens as a window of its own.
        .on_new_window(move |url, features| {
            if url.scheme() == "about" {
                if let Some(main) = dialogs.get_webview_window(MAIN) {
                    return popout::new_window(&dialogs, &main, &url, features);
                }
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .title("MyMeeting")
        .inner_size(num("width").unwrap_or(DEFAULT_WIDTH.min(fit_w)).max(MIN_WIDTH), num("height").unwrap_or(DEFAULT_HEIGHT.min(fit_h)).max(MIN_HEIGHT))
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .decorations(false)
        .shadow(true)
        .visible(false)
        // Pictures dropped on the editor and .mtg files dropped on the window arrive as page events.
        .disable_drag_drop_handler()
        .maximized(saved["maximized"].as_bool().unwrap_or(false));
    if let (Some(x), Some(y)) = (num("x"), num("y")) {
        builder = builder.position(x, y);
    }
    show_later(builder.build().map_err(|e| e.to_string())?);
    Ok(())
}

fn main() {
    let mut builder = tauri::Builder::default();
    if std::env::var_os("MYMEETING_SETTINGS_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(file) = minutes_argument(&args) {
                let _ = app.emit("open-file", file);
            }
        }));
    }
    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| open_main_window(app.handle()).map_err(|e| e.into()))
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } if window.label() == MAIN => {
                // The page decides first: it may have unsaved work to ask about.
                if CLOSE_GUARD.load(Ordering::SeqCst) && !CLOSE_ALLOWED.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.app_handle().emit_to(MAIN, "close-requested", ());
                    return;
                }
                remember_window(window);
                popout::close_all(window.app_handle());
            }
            tauri::WindowEvent::Destroyed if popout::is_dialog(window.label()) => {
                popout::closed(window.app_handle(), window.label());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            load_draft,
            save_draft,
            startup_file,
            read_text,
            write_text,
            convert_image,
            system_fonts,
            app_info,
            open_external,
            print_window,
            window_ready,
            close_guard_ready,
            main_close,
            popout::popout_show,
            popout::popout_drag,
            popout::popout_minimize,
            popout::popout_focus,
            popout::popout_close,
            popout::popout_reset,
            popout::popout_inline,
        ])
        .build(tauri::generate_context!())
        .expect("the application failed to start");
    app.run(|_app, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &_event {
            if let Some(file) = urls.iter().find_map(|url| url.to_file_path().ok()) {
                let file = file.to_string_lossy().to_string();
                if let Ok(mut pending) = OPENED_FILE.lock() {
                    *pending = Some(file.clone());
                }
                let _ = _app.emit("open-file", file);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_minutes_among_the_arguments() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(minutes_argument(&args(&["mymeeting", "--flag", "C:\\a\\Weekly.MTG"])).as_deref(), Some("C:\\a\\Weekly.MTG"));
        assert_eq!(minutes_argument(&args(&["x.mtg"])), None);
        assert_eq!(minutes_argument(&args(&["mymeeting", "notes.txt"])), None);
    }

    #[test]
    fn opens_only_mail_and_web_addresses() {
        assert!(allowed_external("mailto:a@b.c") && allowed_external("https://x.y"));
        assert!(!allowed_external("file:///c:/windows/system32/calc.exe"));
    }
}
