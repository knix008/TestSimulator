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
use std::sync::Mutex;

use base64::Engine as _;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const MAIN: &str = "main";
const RUN: &str = "run";
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

/// A binary file as base64: an image being imported, or one of a project's images.
#[tauri::command(async)]
fn read_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
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
        // A virus scanner can hold a file that was just written for a moment.
        let mut result = std::fs::write(&path, text);
        for _ in 0..4 {
            if result.is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
            result = std::fs::write(&path, text);
        }
        result.map_err(|e| e.to_string())?;
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
fn write_project(dir: String, files: BTreeMap<String, String>, binaries: BTreeMap<String, String>, generated_dirs: Vec<String>) -> Result<(), String> {
    let root = PathBuf::from(dir);
    write_tree(&root, &files)?;
    for (name, data) in &binaries {
        let path = root.join(safe_relative(name)?);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    }
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

/// The page has applied its theme: its window can appear without a flash of the wrong colour.
#[tauri::command]
fn window_ready(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

/// The sample projects shipped with the app, and the folder they are in.
#[tauri::command(async)]
fn samples_list(app: AppHandle) -> Result<Value, String> {
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    // Windows gives a "\\\\?\\" path here, which is fine for Rust but not for joining by hand.
    let text = resources.to_string_lossy().to_string();
    let dir = PathBuf::from(text.strip_prefix("\\\\?\\").unwrap_or(&text)).join("samples");
    let list = std::fs::read_to_string(dir.join("index.json")).map_err(|e| e.to_string())?;
    let items: Value = serde_json::from_str(list.trim_start_matches('\u{feff}')).map_err(|e| e.to_string())?;
    Ok(json!({ "dir": dir.to_string_lossy(), "items": items }))
}

/// The smallest size the page measured for its menu row and toolbar, logical pixels.
struct MinSize(Mutex<(f64, f64)>);

/// Windows applies a window's minimum only to sizing with the mouse. A size set any other way
/// (another program, a saved size, a DPI change) can still be smaller and clip the toolbar.
fn enforce_min_size(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let Some(state) = window.try_state::<MinSize>() else { return };
    let (width, height) = *state.0.lock().unwrap_or_else(|e| e.into_inner());
    let (Ok(scale), Ok(size)) = (window.scale_factor(), window.inner_size()) else { return };
    let size = size.to_logical::<f64>(scale);
    if size.width + 0.5 < width || size.height + 0.5 < height {
        let _ = window.set_size(tauri::LogicalSize::new(size.width.max(width), size.height.max(height)));
    }
}

#[tauri::command]
fn window_min_size(window: tauri::Window, state: tauri::State<MinSize>, width: f64, height: f64) {
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = (width, height);
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(width, height)));
    enforce_min_size(&window);
}

/// What the run window runs: a copy of the project when Run was pressed.
#[derive(Default)]
struct RunState(Mutex<Value>);

#[tauri::command(async)]
fn run_open(app: AppHandle, state: tauri::State<RunState>, payload: Value, width: f64, height: f64) -> Result<(), String> {
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = payload;
    if let Some(window) = app.get_webview_window(RUN) {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = window.set_focus();
        let _ = window.emit("run-reload", ());
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(&app, RUN, WebviewUrl::App("index.html?run=1".into()))
        .title("My LVGL Studio")
        .inner_size(width, height)
        .min_inner_size(320.0, 120.0)
        .decorations(false)
        .shadow(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    show_later(window);
    Ok(())
}

#[tauri::command]
fn run_payload(state: tauri::State<RunState>) -> Value {
    state.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
fn run_close(app: AppHandle) {
    if let Some(window) = app.get_webview_window(RUN) {
        let _ = window.close();
    }
}

/// Whatever happens in the page, a window does not stay invisible.
fn show_later(window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
        }
    });
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
    show_later(builder.build().map_err(|e| e.to_string())?);
    Ok(())
}

fn main() {
    let mut builder = tauri::Builder::default();
    // A run with its own data folder (the GUI tests) is a separate instance, not a second start.
    if std::env::var_os("MLS_SETTINGS_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if let Some(file) = project_argument(&args) {
                let _ = app.emit("open-file", file);
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(native::NativeState::default())
        .manage(RunState::default())
        .manage(MinSize(Mutex::new((MIN_WIDTH, MIN_HEIGHT))))
        .setup(|app| {
            open_main_window(app.handle()).map_err(|e| e.into())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { .. } if window.label() == MAIN => {
                remember_window(window);
                native::stop_all(window.app_handle());
                if let Some(run) = window.app_handle().get_webview_window(RUN) {
                    let _ = run.destroy();
                }
            }
            tauri::WindowEvent::Resized(_) if window.label() == MAIN => enforce_min_size(window),
            tauri::WindowEvent::Destroyed if window.label() == RUN => {
                let _ = window.app_handle().emit("run-closed", ());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            startup_file,
            read_base64,
            read_text,
            dir_state,
            write_project,
            window_ready,
            window_min_size,
            run_open,
            run_payload,
            run_close,
            lvgl::lvgl_installed,
            lvgl::lvgl_releases,
            lvgl::lvgl_install,
            lvgl::lvgl_remove,
            native::native_check,
            native::native_run,
            native::native_stop,
            native::native_clean,
            samples_list,
            native::tools_plan,
            native::tools_install,
        ])
        .run(tauri::generate_context!())
        .expect("the application failed to start");
}
