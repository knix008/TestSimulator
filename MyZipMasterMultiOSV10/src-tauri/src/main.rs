// MyZipMaster - Tauri shell. The engine (core/) does the archiving; this file only runs it on a
// worker thread, reports progress, and gives the page what a browser cannot have: real file paths,
// folders, its own windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod files;
mod jobs;
mod rar_tool;
mod shell_menu;
mod window_icon;
mod windows;

use serde_json::{json, Value};

const SETTINGS_FOLDER: &str = "com.shkwon.myzipmaster";

/// Where settings live; MYZIPMASTER_CONFIG_DIR moves it, so tests never touch the real ones.
pub(crate) fn data_dir() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("MYZIPMASTER_CONFIG_DIR") {
        if !dir.is_empty() {
            return dir.into();
        }
    }
    let home = || std::env::var("HOME").unwrap_or_else(|_| ".".into());
    if cfg!(windows) {
        return std::path::PathBuf::from(std::env::var("APPDATA").unwrap_or_else(|_| ".".into())).join(SETTINGS_FOLDER);
    }
    if cfg!(target_os = "macos") {
        return std::path::PathBuf::from(home()).join("Library/Application Support").join(SETTINGS_FOLDER);
    }
    let base = std::env::var("XDG_CONFIG_HOME").unwrap_or_else(|_| format!("{}/.config", home()));
    std::path::PathBuf::from(base).join(SETTINGS_FOLDER)
}

#[tauri::command]
fn load_settings() -> Value {
    let mut settings: Value = std::fs::read_to_string(data_dir().join("settings.json"))
        .ok()
        .and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_else(|| json!({}));
    // Until the user has chosen a language in the program, it speaks the one chosen in the installer.
    if let (Some(object), Some(language)) = (settings.as_object_mut(), installer_language()) {
        object.entry("zm-lang").or_insert_with(|| Value::from(language));
    }
    settings
}

/// The installer leaves its Windows language id beside the program.
fn installer_language() -> Option<&'static str> {
    let file = std::env::current_exe().ok()?.parent()?.join("install-language.txt");
    match std::fs::read_to_string(file).ok()?.trim() {
        "1042" => Some("ko"),
        "1033" => Some("en"),
        _ => None,
    }
}

#[tauri::command]
fn save_settings(settings: Value) -> Result<(), String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    // Written beside and renamed, so a crash mid-write never leaves half a file.
    let temp = dir.join("settings.json.tmp");
    std::fs::write(&temp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, dir.join("settings.json")).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> Value {
    let pkg = app.package_info();
    json!({
        "productName": pkg.name,
        "version": pkg.version.to_string(),
        "tauri": tauri::VERSION,
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "debug": cfg!(debug_assertions),
        "test": std::env::var("MYZIPMASTER_TEST").is_ok(),
        "threads": jobs::threads(),
        "sfx": jobs::sfx_stub(&app).is_some(),
    })
}

/// Archives named on the command line, once.
#[tauri::command]
fn take_launch_files(state: tauri::State<'_, LaunchFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

struct LaunchFiles(std::sync::Mutex<Vec<String>>);

/// What the file manager's menu asked for, once.
#[tauri::command]
fn take_shell_request(state: tauri::State<'_, ShellRequest>) -> Option<Value> {
    state.0.lock().unwrap().take()
}

struct ShellRequest(std::sync::Mutex<Option<Value>>);

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(code) = shell_menu::run_cli(&args, installer_language()) {
        std::process::exit(code);
    }
    let shell = shell_menu::gather_request(&args);
    let launch: Vec<String> = if shell.is_some() { Vec::new() } else { args.into_iter().filter(|a| !a.starts_with("--")).collect() };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(LaunchFiles(std::sync::Mutex::new(launch)))
        .manage(ShellRequest(std::sync::Mutex::new(shell)))
        .manage(jobs::Jobs::default())
        .manage(windows::MinSize::default())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            app_info,
            take_launch_files,
            take_shell_request,
            shell_menu::shell_menu_status,
            shell_menu::set_shell_menu,
            shell_menu::open_default_apps,
            rar_tool::find_rar_tool,
            jobs::start_job,
            jobs::cancel_job,
            jobs::read_entry,
            jobs::open_entry,
            files::list_dir,
            files::fs_roots,
            files::path_info,
            files::make_dir,
            files::trash_paths,
            files::reveal_path,
            windows::window_ready,
            windows::open_settings_window,
            windows::open_about_window,
            windows::open_guide_window,
            windows::show_theme_menu,
            windows::hide_theme_menu,
            windows::fit_theme_menu,
            windows::set_min_window_size,
            windows::start_window_drag,
        ])
        .setup(|app| {
            windows::create_main(app.handle())?;
            Ok(())
        })
        .on_window_event(windows::on_event)
        .build(tauri::generate_context!())
        .expect("the window system is available");

    app.run(|_handle, event| match event {
        // macOS hands over files this way rather than on the command line.
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Opened { urls } => {
            use tauri::{Emitter, Manager};
            let paths: Vec<String> = urls
                .into_iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if let Some(state) = _handle.try_state::<LaunchFiles>() {
                state.0.lock().unwrap().extend(paths.iter().cloned());
            }
            let _ = _handle.emit("open-files", paths);
        }
        tauri::RunEvent::Exit => jobs::clean_temp(),
        _ => {}
    });
}
