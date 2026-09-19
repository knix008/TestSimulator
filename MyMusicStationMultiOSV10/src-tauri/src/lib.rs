mod audio_convert;
mod audio_extract;
mod wallpaper;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{image::Image, AppHandle, Emitter, LogicalSize, Manager, RunEvent, Size, State, WindowEvent};

const WINDOW_WIDTH: f64 = 835.0;
const WINDOW_HEIGHT: f64 = 496.0;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShellSettings {
    use_system_tray: bool,
}

impl Default for ShellSettings {
    fn default() -> Self {
        Self {
            use_system_tray: true,
        }
    }
}

struct AppState {
    settings: Mutex<ShellSettings>,
    tray: TrayIcon,
}

struct PendingOpenFiles(Mutex<Vec<String>>);

const OPENABLE_EXTENSIONS: &[&str] = &[
    ".mp3", ".flac", ".wav", ".ogg", ".aac", ".m4a", ".webm", ".opus", ".wma", ".aiff", ".aif",
    ".mplist",
];

fn is_openable_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    OPENABLE_EXTENSIONS.iter().any(|ext| lower.ends_with(ext))
}

fn collect_open_paths(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter(|arg| is_openable_path(arg))
        .cloned()
        .collect()
}

fn queue_open_paths(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    if let Some(state) = app.try_state::<PendingOpenFiles>() {
        if let Ok(mut pending) = state.0.lock() {
            for path in &paths {
                if !pending.iter().any(|existing| existing.eq_ignore_ascii_case(path)) {
                    pending.push(path.clone());
                }
            }
        }
    }

    let _ = app.emit("open-files", paths);
}

fn apply_fixed_window_size(window: &tauri::WebviewWindow) {
    let size = Size::Logical(LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT));
    let _ = window.set_size(size);
    let _ = window.set_min_size(Some(size));
    let _ = window.set_max_size(Some(size));
}

const MAIN_WINDOW_LABEL: &str = "main";
const POPUP_LABEL_PREFIX: &str = "popup-";
const POPUP_CLOSED_EVENT: &str = "popup:closed";

#[derive(Clone, Serialize)]
struct PopupClosed {
    label: String,
}

/// Dialogs live in their own owned windows; they must never outlive the main window.
fn close_popup_windows(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(POPUP_LABEL_PREFIX) {
            let _ = window.close();
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // Do NOT force the fixed size here: the window may be in compact mode,
        // and re-showing from the tray must preserve its current size so the
        // small layout does not reappear inside a full-size window.
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_settings_from_tray(app: &AppHandle) {
    show_main_window(app);
    let _ = app.emit("open-settings", ());
}

fn settings_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("shell-settings.json"))
}

fn ui_settings_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("app-settings.json"))
}

fn load_shell_settings(app: &AppHandle) -> ShellSettings {
    let Some(path) = settings_file_path(app) else {
        return ShellSettings::default();
    };

    let Ok(raw) = fs::read_to_string(path) else {
        return ShellSettings::default();
    };

    serde_json::from_str(&raw).unwrap_or_default()
}

fn persist_shell_settings(app: &AppHandle, settings: &ShellSettings) {
    let Some(path) = settings_file_path(app) else {
        return;
    };

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(raw) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(path, raw);
    }
}

fn apply_tray_visibility(tray: &TrayIcon, enabled: bool) {
    let _ = tray.set_visible(enabled);
}

#[tauri::command]
fn get_shell_settings(state: State<'_, AppState>) -> ShellSettings {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn set_use_system_tray(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut settings = state
            .settings
            .lock()
            .map_err(|_| "settings lock poisoned".to_string())?;
        settings.use_system_tray = enabled;
        persist_shell_settings(&app, &settings);
    }

    apply_tray_visibility(&state.tray, enabled);

    if !enabled {
        show_main_window(&app);
    }

    Ok(())
}

#[tauri::command]
fn load_ui_settings(app: AppHandle) -> Option<serde_json::Value> {
    let path = ui_settings_file_path(&app)?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
fn save_ui_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let path = ui_settings_file_path(&app).ok_or_else(|| "app config directory unavailable".to_string())?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let raw = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())?;

    if let Some(use_system_tray) = settings.get("useSystemTray").and_then(|value| value.as_bool()) {
        let state = app.state::<AppState>();
        {
            let mut shell = state
                .settings
                .lock()
                .map_err(|_| "settings lock poisoned".to_string())?;
            shell.use_system_tray = use_system_tray;
            persist_shell_settings(&app, &shell);
        }
        apply_tray_visibility(&state.tray, use_system_tray);
    }

    Ok(())
}

#[tauri::command]
fn take_pending_open_files(state: State<'_, PendingOpenFiles>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut pending| std::mem::take(&mut *pending))
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_paths = collect_open_paths(&std::env::args().collect::<Vec<_>>());

    tauri::Builder::default()
        // Must be registered first so a second launch exits before other plugins run.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            show_main_window(app);
            queue_open_paths(app, collect_open_paths(&args));
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PendingOpenFiles(Mutex::new(startup_paths)))
        .invoke_handler(tauri::generate_handler![
            get_shell_settings,
            set_use_system_tray,
            load_ui_settings,
            save_ui_settings,
            take_pending_open_files,
            audio_convert::convert_audio,
            audio_extract::extract_audio_from_url,
            audio_extract::probe_url_media_info,
            audio_extract::fetch_url_prefix,
            wallpaper::load_wallpaper_image
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                apply_fixed_window_size(&window);

                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }

            let mut shell_settings = load_shell_settings(app.handle());
            if let Some(ui_settings) = load_ui_settings(app.handle().clone()) {
                if let Some(use_system_tray) = ui_settings.get("useSystemTray").and_then(|value| value.as_bool()) {
                    shell_settings.use_system_tray = use_system_tray;
                    persist_shell_settings(app.handle(), &shell_settings);
                }
            }

            let show = MenuItem::with_id(app, "show", "Show My Music Station V1.0.0", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;

            let tray_image = Image::from_bytes(include_bytes!("../tray-icons/32x32.png"))
                .ok()
                .or_else(|| app.default_window_icon().cloned())
                .expect("tray icon is required");

            // TrayIcon is reference-counted and removed when the last handle is dropped.
            // Keep it in managed state for the lifetime of the app.
            let tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .tooltip("My Music Station V1.0.0")
                .icon(tray_image)
                .icon_as_template(false)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "settings" => open_settings_from_tray(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        open_settings_from_tray(tray.app_handle());
                    }
                })
                .build(app)?;

            apply_tray_visibility(&tray, shell_settings.use_system_tray);

            app.manage(AppState {
                settings: Mutex::new(shell_settings),
                tray,
            });
            app.manage(menu);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building My Music Station")
        .run(|app, event| {
            let RunEvent::WindowEvent { label, event, .. } = event else {
                return;
            };

            // Popup windows (label `popup-*`) close normally; tell the main
            // window so it can drop the matching dialog state.
            if label != MAIN_WINDOW_LABEL {
                if let WindowEvent::Destroyed = event {
                    let _ = app.emit_to(MAIN_WINDOW_LABEL, POPUP_CLOSED_EVENT, PopupClosed { label });
                }
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                // Whatever happens to the main window, no popup outlives it.
                close_popup_windows(app);

                let use_tray = app
                    .try_state::<AppState>()
                    .and_then(|state| {
                        state
                            .settings
                            .lock()
                            .ok()
                            .map(|settings| settings.use_system_tray)
                    })
                    .unwrap_or(true);

                if use_tray {
                    // Close hides to the tray; quit only from the tray menu.
                    api.prevent_close();

                    if let Some(window) = app.get_webview_window(&label) {
                        let _ = window.hide();
                    }
                } else {
                    // No tray: allow the window to close and exit the app.
                    app.exit(0);
                }
            } else if let WindowEvent::Destroyed = event {
                close_popup_windows(app);
            }
        });
}
