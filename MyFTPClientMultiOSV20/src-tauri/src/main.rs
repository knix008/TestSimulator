// My FTP Client — Tauri shell.
//
//   • starts the Node core (core.rs) and tells the page where it is (host_config)
//   • the main window: frameless (the toolbar is the title bar), opens in the
//     saved theme colour at the saved position / size, which it saves on close
//   • dialog windows and the user guide window (dialogs.rs)
//   • one instance: a second start focuses the running window
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod nodecore;
mod dialogs;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::Manager;

use crate::nodecore::{CoreState, HostConfig};

pub const MIN_WINDOW_WIDTH: f64 = 1200.0;
pub const MIN_WINDOW_HEIGHT: f64 = 720.0;
const PRODUCT: &str = "My FTP Client";

#[tauri::command]
async fn host_config(state: tauri::State<'_, Arc<CoreState>>) -> Result<HostConfig, String> {
    let core = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || core.wait_config()).await.map_err(|e| e.to_string())
}

/// Where session.json, profiles.json and history.json live: the same folder the
/// Electron build used (%APPDATA%\My FTP Client, ~/Library/Application Support/…,
/// ~/.config/…), so an update keeps them. MFC_CONFIG_DIR moves it (tests).
fn config_dir() -> PathBuf {
    if let Ok(p) = std::env::var("MFC_CONFIG_DIR") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    let home = || std::env::var("HOME").unwrap_or_else(|_| ".".into());
    if cfg!(windows) {
        return PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into())).join(PRODUCT);
    }
    if cfg!(target_os = "macos") {
        return PathBuf::from(home()).join("Library").join("Application Support").join(PRODUCT);
    }
    let base = std::env::var("XDG_CONFIG_HOME").unwrap_or_else(|_| format!("{}/.config", home()));
    PathBuf::from(base).join(PRODUCT)
}

fn saved_session() -> Value {
    std::fs::read_to_string(config_dir().join("session.json"))
        .ok()
        .and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or(Value::Null)
}

/// The last normal (not maximized / minimized) bounds, in logical pixels.
#[derive(Clone, Copy, Default)]
struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

struct Placement {
    normal: Mutex<Option<Bounds>>,
}

fn track(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let (Ok(scale), Ok(pos), Ok(size)) = (window.scale_factor(), window.outer_position(), window.inner_size()) else { return };
    let pos = pos.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    if let Some(state) = window.try_state::<Placement>() {
        *state.normal.lock().unwrap_or_else(|e| e.into_inner()) =
            Some(Bounds { x: pos.x, y: pos.y, width: size.width, height: size.height });
    }
}

/// Saves the main window's bounds through the core (it owns session.json).
fn save_bounds(window: &tauri::Window) {
    track(window);
    let Some(core) = window.try_state::<Arc<CoreState>>() else { return };
    let Some(config) = core.config_now() else { return };
    let Some(b) = window.try_state::<Placement>().and_then(|p| *p.normal.lock().unwrap_or_else(|e| e.into_inner())) else { return };
    let maximized = window.is_maximized().unwrap_or(false);
    let patch = json!({ "patch": { "windowBounds": {
        "x": b.x.round(), "y": b.y.round(), "width": b.width.round(), "height": b.height.round(), "maximized": maximized
    } } });
    let _ = nodecore::post(&config, "session.save", &patch.to_string());
}

/// The saved theme colour and bounds go into the window config before it is
/// built: the window never flashes white and never jumps.
fn apply_saved(window: &mut tauri::utils::config::WindowConfig, session: &Value) {
    if let Some(color) = session.get("themeBg").and_then(Value::as_str).and_then(hex_colour) {
        window.background_color = Some(color);
    }
    let Some(b) = session.get("windowBounds") else { return };
    let num = |k: &str| b.get(k).and_then(Value::as_f64);
    if let (Some(w), Some(h)) = (num("width"), num("height")) {
        window.width = w.max(MIN_WINDOW_WIDTH);
        window.height = h.max(MIN_WINDOW_HEIGHT);
    }
    if let (Some(x), Some(y)) = (num("x"), num("y")) {
        window.x = Some(x);
        window.y = Some(y);
        window.center = false;
    }
    window.maximized = b.get("maximized").and_then(Value::as_bool).unwrap_or(false);
}

fn hex_colour(hex: &str) -> Option<tauri::window::Color> {
    let hex = hex.trim().strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    Some(tauri::window::Color(byte(0)?, byte(2)?, byte(4)?, 255))
}

/// A saved position on a monitor that is gone would open the window off screen.
fn keep_on_screen(window: &tauri::WebviewWindow) {
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

fn main() {
    let config = config_dir();
    let _ = std::fs::create_dir_all(&config);
    let isolated = std::env::var_os("MFC_CONFIG_DIR").is_some();
    // A private profile (tests) gets its own webview data as well, and does not
    // share the single-instance lock with an installed copy.
    if isolated && std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", config.join("webview"));
    }

    let mut context = tauri::generate_context!();
    let session = saved_session();
    if let Some(window) = context.config_mut().app.windows.get_mut(0) {
        apply_saved(window, &session);
    }

    // The core starts first thing, on its own thread, so it is up by the time the page asks.
    let core = Arc::new(CoreState::new());
    let resources = tauri::utils::platform::resource_dir(context.package_info(), &tauri::Env::default()).ok();
    let starter = core.clone();
    let core_config = config.clone();
    std::thread::spawn(move || starter.start(resources, &core_config));

    let mut builder = tauri::Builder::default();
    if !isolated {
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(core)
        .manage(dialogs::Dialogs::default())
        .manage(Placement { normal: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            host_config,
            dialogs::dialog_open,
            dialogs::dialog_payload,
            dialogs::dialog_submit,
            dialogs::dialog_close,
            dialogs::dialog_close_self,
            dialogs::dialog_ready,
            dialogs::dialog_set_size,
            dialogs::broadcast_appearance,
            dialogs::manual_open,
        ])
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                keep_on_screen(&main);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            let main = window.label() == "main";
            match event {
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) if main => track(window),
                tauri::WindowEvent::CloseRequested { .. } if main => {
                    save_bounds(window);
                    dialogs::close_all(window.app_handle());
                }
                tauri::WindowEvent::Destroyed if window.label().starts_with("dlg-") => {
                    dialogs::on_destroyed(window.app_handle(), window.label());
                }
                _ => {}
            }
        })
        .build(context)
        .expect("error while building My FTP Client")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Arc<CoreState>>() {
                    state.stop();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_bounds_respect_the_minimum_size() {
        let mut window = tauri::utils::config::WindowConfig::default();
        apply_saved(&mut window, &json!({ "themeBg": "#202020", "windowBounds": { "x": 10, "y": 20, "width": 800, "height": 1000, "maximized": true } }));
        assert_eq!(window.width, MIN_WINDOW_WIDTH);
        assert_eq!(window.height, 1000.0);
        assert_eq!((window.x, window.y), (Some(10.0), Some(20.0)));
        assert!(window.maximized);
        assert!(window.background_color.is_some());
    }

    #[test]
    fn minimum_size_matches_tauri_conf() {
        let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main = &conf["app"]["windows"][0];
        assert_eq!(main["minWidth"].as_f64(), Some(MIN_WINDOW_WIDTH));
        assert_eq!(main["minHeight"].as_f64(), Some(MIN_WINDOW_HEIGHT));
        assert_eq!(main["decorations"].as_bool(), Some(false));
    }
}
