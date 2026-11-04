// My LVGL Studio - Tauri shell.
//
//   * the main window: frameless (the menu row is the title bar), opens in the saved theme
//     colour at the saved position and size, which it saves on close
//   * settings and project files
//   * lvgl.rs: the LVGL manager (release list, download, install, remove)
//   * native.rs: builds generated code against an installed LVGL and runs it
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lvgl;
mod native;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const MAIN: &str = "main";
const SETTINGS_FOLDER: &str = "MyLVGLStudio";
const MIN_WIDTH: f64 = 1000.0;
const MIN_HEIGHT: f64 = 640.0;

/// Where settings, installed LVGL versions and native builds live; MLS_SETTINGS_DIR moves it.
pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("MLS_SETTINGS_DIR") {
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

fn read_settings_value() -> Value {
    std::fs::read_to_string(data_dir().join("settings.json"))
        .ok()
        .and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_settings_value(settings: &Value) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("settings.json"), text).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_settings() -> Value {
    read_settings_value()
}

/// Merges `patch` into settings.json, so the page never overwrites the saved window bounds.
#[tauri::command]
fn save_settings(patch: Value) -> Result<(), String> {
    let mut settings = read_settings_value();
    if let (Some(target), Some(source)) = (settings.as_object_mut(), patch.as_object()) {
        for (key, value) in source {
            target.insert(key.clone(), value.clone());
        }
    }
    write_settings_value(&settings)
}

/// The project file among command line arguments (a double-click in the file manager).
fn project_argument(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|arg| arg.to_lowercase().ends_with(".mylvgl")).cloned()
}

#[tauri::command]
fn startup_file() -> Option<String> {
    project_argument(&std::env::args().collect::<Vec<_>>())
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// A generated path, checked: relative, with "/" separators, and staying inside its folder.
pub fn safe_relative(name: &str) -> Result<PathBuf, String> {
    let bad = name.is_empty()
        || name.contains('\\')
        || name.contains(':')
        || name.starts_with('/')
        || name.split('/').any(|part| part.is_empty() || part == "." || part == "..");
    if bad {
        return Err(format!("bad file name: {name}"));
    }
    Ok(name.split('/').collect())
}

/// Writes `files` under `root`, making folders as needed.
pub fn write_tree(root: &Path, files: &BTreeMap<String, String>) -> Result<(), String> {
    for (name, text) in files {
        let path = root.join(safe_relative(name)?);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        // An unchanged file keeps its time stamp, so it does not cause a rebuild.
        if std::fs::read_to_string(&path).map(|old| old == *text).unwrap_or(false) {
            continue;
        }
        std::fs::write(&path, text).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// A new project's folder must be missing or empty: "missing", "empty" or "other".
#[tauri::command]
fn dir_state(dir: String) -> String {
    match std::fs::read_dir(&dir) {
        Err(_) if !Path::new(&dir).exists() => "missing",
        Err(_) => "other",
        Ok(mut entries) => if entries.next().is_none() { "empty" } else { "other" },
    }
    .to_string()
}

/// Saves a project folder. In `generated_dirs`, which hold only generated code, C files that
/// are no longer part of the project (a removed screen) are deleted.
#[tauri::command]
fn write_project(dir: String, files: BTreeMap<String, String>, generated_dirs: Vec<String>) -> Result<(), String> {
    let root = PathBuf::from(dir);
    write_tree(&root, &files)?;
    for generated in generated_dirs {
        let folder = root.join(safe_relative(&generated)?);
        let Ok(entries) = std::fs::read_dir(&folder) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if entry.path().is_file() && name.ends_with(".c") && !files.contains_key(&format!("{generated}/{name}")) {
                std::fs::remove_file(entry.path()).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

/// The page has applied its theme: the window can appear without a flash of the wrong colour.
#[tauri::command]
fn window_ready(app: AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn remember_window(window: &tauri::Window) {
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    let mut settings = read_settings_value();
    if !settings.is_object() {
        settings = json!({});
    }
    let mut entry = settings["window"].clone();
    if !entry.is_object() {
        entry = json!({});
    }
    entry["maximized"] = json!(maximized);
    if !maximized {
        if let (Ok(scale), Ok(pos), Ok(size)) = (window.scale_factor(), window.outer_position(), window.inner_size()) {
            let pos = pos.to_logical::<f64>(scale);
            let size = size.to_logical::<f64>(scale);
            entry["x"] = json!(pos.x.round());
            entry["y"] = json!(pos.y.round());
            entry["width"] = json!(size.width.round());
            entry["height"] = json!(size.height.round());
        }
    }
    settings["window"] = entry;
    let _ = write_settings_value(&settings);
}

fn open_main_window(app: &AppHandle) -> Result<(), String> {
    let settings = read_settings_value();
    let saved = &settings["window"];
    let num = |key: &str| saved[key].as_f64();
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("My LVGL Studio")
        .inner_size(num("width").unwrap_or(1440.0).max(MIN_WIDTH), num("height").unwrap_or(860.0).max(MIN_HEIGHT))
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .decorations(false)
        .shadow(true)
        .visible(false)
        .maximized(saved["maximized"].as_bool().unwrap_or(false));
    if let (Some(x), Some(y)) = (num("x"), num("y")) {
        builder = builder.position(x, y);
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    // Whatever happens in the page, the window does not stay invisible.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
    });
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(file) = project_argument(&args) {
                let _ = app.emit("open-file", file);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(native::NativeState::default())
        .setup(|app| {
            open_main_window(app.handle()).map_err(|e| e.into())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                remember_window(window);
                native::stop_all(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            startup_file,
            read_text,
            dir_state,
            write_project,
            window_ready,
            lvgl::lvgl_installed,
            lvgl::lvgl_releases,
            lvgl::lvgl_install,
            lvgl::lvgl_remove,
            native::native_check,
            native::native_run,
            native::native_stop,
        ])
        .run(tauri::generate_context!())
        .expect("the application failed to start");
}
