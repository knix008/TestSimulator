mod files;
mod i18n;
mod window_state;

use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct AppState {
    startup_files: Vec<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: String,
    version: String,
    commit: &'static str,
    rustc: &'static str,
    build_time: u64,
    target: &'static str,
    profile: &'static str,
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    AppInfo {
        name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        commit: env!("BUILD_COMMIT"),
        rustc: env!("BUILD_RUSTC"),
        build_time: env!("BUILD_UNIX_TIME").parse().unwrap_or(0),
        target: env!("BUILD_TARGET"),
        profile: env!("BUILD_PROFILE"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

#[tauri::command]
fn set_language(language: String) {
    i18n::set_english(language == "en");
}

#[tauri::command]
fn startup_files(state: tauri::State<'_, Mutex<AppState>>) -> Vec<PathBuf> {
    std::mem::take(&mut state.lock().expect("startup files").startup_files)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    files::read_text(std::path::Path::new(&path))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    files::write_text(std::path::Path::new(&path), content.as_bytes())
}

#[tauri::command]
fn workspace_file(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("workspace.mwf").to_string_lossy().into_owned())
}

pub fn run() {
    // One copy should edit a workspace. A second process can overwrite the same autosave file.
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppState { startup_files: Vec::new() }))
        .setup(|app| {
            {
                let state = app.state::<Mutex<AppState>>();
                state.lock().expect("startup files").startup_files = files::startup_paths(std::env::args().skip(1));
            }
            let state_path = window_state::state_file(app.handle());
            let install_reset = state_path.as_deref().and_then(window_state::take_install_reset);
            let install_language = state_path.as_deref().and_then(window_state::take_install_language);
            let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app.handle(), path));
            let title = format!("MyWorkForce v{}", app.package_info().version);
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(title)
                .decorations(false)
                .shadow(true)
                .min_inner_size(1100.0, 640.0)
                .visible(false);
            let builder = match install_reset {
                Some(token) => builder.initialization_script(format!(
                    "window.__MYWORKFORCE_INSTALL_RESET__ = {};",
                    serde_json::to_string(&token).unwrap_or_default()
                )),
                None => builder,
            };
            let builder = match install_language {
                Some(language) => builder.initialization_script(format!("window.__MYWORKFORCE_INSTALL_LANGUAGE__ = '{language}';")),
                None => builder,
            };
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized),
                None => builder.inner_size(1440.0, 900.0).center(),
            };
            let main = builder.build()?;
            let unshown = main.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(12));
                if !unshown.is_visible().unwrap_or(true) {
                    let _ = unshown.show();
                }
            });
            if let Some(path) = state_path {
                window_state::track(&main, path);
            }
            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    handle.exit(0);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info, set_language, startup_files, read_text_file, write_text_file, workspace_file])
        .run(tauri::generate_context!())
        .expect("error while running MyWorkForce");
}
