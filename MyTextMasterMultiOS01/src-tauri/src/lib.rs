pub mod explorer;
pub mod files;
pub mod window_state;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
#[allow(unused_imports)]
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Default)]
struct Shared {
    /// Documents given on the command line ("Open with", a double-clicked .md), handed to the page once.
    startup_files: Vec<PathBuf>,
}

type AppState = Mutex<Shared>;

fn lock(state: &AppState) -> std::sync::MutexGuard<'_, Shared> {
    state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| error.to_string())?
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
    tauri: &'static str,
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        commit: env!("BUILD_COMMIT"),
        rustc: env!("BUILD_RUSTC"),
        build_time: env!("BUILD_UNIX_TIME").parse().unwrap_or(0),
        target: env!("BUILD_TARGET"),
        profile: env!("BUILD_PROFILE"),
        tauri: tauri::VERSION,
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

/// Files among command-line arguments (options start with '-').
pub fn document_args<I: IntoIterator<Item = String>>(args: I) -> Vec<PathBuf> {
    args.into_iter().filter(|arg| !arg.starts_with('-')).map(PathBuf::from).filter(|path| path.is_file()).collect()
}

#[tauri::command]
fn startup_files(state: tauri::State<'_, AppState>) -> Vec<PathBuf> {
    std::mem::take(&mut lock(&state).startup_files)
}

#[tauri::command]
async fn read_text_file(path: PathBuf) -> Result<files::TextFile, String> {
    blocking(move || files::read_text(&path)).await
}

#[tauri::command]
async fn write_text_file(path: PathBuf, content: String, encoding: Option<String>) -> Result<files::Stat, String> {
    blocking(move || files::write_text(&path, &content, encoding.as_deref().unwrap_or("utf-8"))).await
}

/// The file's modification time and size, or null when it is gone (the page checks for outside changes).
#[tauri::command]
fn file_stat(path: PathBuf) -> Option<files::Stat> {
    files::stat(&path).ok()
}

#[tauri::command]
fn paths_exist(paths: Vec<PathBuf>) -> Vec<bool> {
    paths.iter().map(|path| path.exists()).collect()
}

/// The preview shows pictures that sit next to the document: its folder joins the asset scope.
#[tauri::command]
fn allow_directory(app: AppHandle, dir: PathBuf) -> Result<(), String> {
    if !dir.is_dir() {
        return Err(format!("not a folder: {}", dir.display()));
    }
    app.asset_protocol_scope().allow_directory(&dir, true).map_err(|error| error.to_string())
}

/// Opens a web address with the system browser, or a file with its program.
#[tauri::command]
async fn open_external(target: String) -> Result<(), String> {
    let lower = target.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:") || Path::new(&target).exists()) {
        return Err(format!("열 수 없는 주소입니다 / This address cannot be opened: {target}"));
    }
    blocking(move || {
        #[cfg(windows)]
        let result = std::process::Command::new("explorer.exe").arg(&target).spawn();
        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open").arg(&target).spawn();
        #[cfg(all(unix, not(target_os = "macos")))]
        let result = std::process::Command::new("xdg-open").arg(&target).spawn();
        result.map(|_| ()).map_err(|error| error.to_string())
    })
    .await
}

/// Clipboard text through the OS (the webview's own API may ask for permission or refuse).
#[tauri::command]
async fn clipboard_write(text: String) -> Result<(), String> {
    blocking(move || arboard::Clipboard::new().and_then(|mut clipboard| clipboard.set_text(text)).map_err(|error| error.to_string())).await
}

#[tauri::command]
async fn clipboard_read() -> Result<String, String> {
    blocking(|| {
        let mut clipboard = arboard::Clipboard::new().map_err(|error| error.to_string())?;
        Ok(clipboard.get_text().unwrap_or_default())
    })
    .await
}

#[tauri::command]
fn explorer_places() -> Vec<explorer::Place> {
    explorer::places()
}

#[tauri::command]
async fn list_dir(dir: PathBuf, hidden: Option<bool>) -> Result<Vec<explorer::Entry>, String> {
    blocking(move || explorer::list_dir(&dir, hidden.unwrap_or(false))).await
}

#[derive(Serialize)]
struct SearchResult {
    hits: Vec<explorer::Hit>,
    files: usize,
    truncated: bool,
}

#[tauri::command]
async fn search_files(dir: PathBuf, query: String, case_sensitive: bool, whole_word: bool, extensions: Vec<String>) -> Result<SearchResult, String> {
    blocking(move || {
        let (hits, files) = explorer::search(&dir, &query, case_sensitive, whole_word, &extensions)?;
        let truncated = hits.len() >= explorer::MAX_HITS;
        Ok(SearchResult { hits, files, truncated })
    })
    .await
}

#[tauri::command]
async fn copy_image(source: PathBuf, doc_dir: PathBuf) -> Result<String, String> {
    blocking(move || explorer::copy_image(&source, &doc_dir)).await
}

#[tauri::command]
async fn write_image(data: String, name: String, doc_dir: PathBuf) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    blocking(move || explorer::write_image(&bytes, &name, &doc_dir)).await
}

/// Any file as bytes (base64) for the hex editor (at most 64 MB).
#[tauri::command]
async fn read_bytes(path: PathBuf) -> Result<String, String> {
    use base64::Engine;
    blocking(move || {
        let info = files::stat(&path)?;
        if info.size > files::MAX_SIZE {
            return Err(format!("파일이 너무 큽니다 / The file is too large ({} MB)", info.size / 1024 / 1024));
        }
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
}

#[tauri::command]
async fn write_bytes(path: PathBuf, data: String) -> Result<files::Stat, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    blocking(move || files::write_raw(&path, &bytes)).await
}

#[tauri::command]
async fn file_details(path: PathBuf) -> Result<explorer::Details, String> {
    blocking(move || explorer::details(&path)).await
}

#[tauri::command]
async fn file_hashes(path: PathBuf) -> Result<explorer::Hashes, String> {
    blocking(move || explorer::hashes(&path)).await
}

#[tauri::command]
fn set_always_on_top(window: WebviewWindow, on: bool) -> Result<(), String> {
    window.set_always_on_top(on).map_err(|e| e.to_string())
}

/// Moves (edge = None) or resizes the window from a press on the title row or the resize grip.
/// On Windows this asks the system move / size loop directly (WM_SYSCOMMAND SC_MOVE / SC_SIZE),
/// which starts from where the cursor is.
#[tauri::command]
fn window_drag(window: WebviewWindow, edge: Option<String>) -> Result<(), String> {
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        extern "system" {
            fn ReleaseCapture() -> i32;
            fn PostMessageW(hwnd: *mut std::ffi::c_void, msg: u32, wparam: usize, lparam: isize) -> i32;
        }
        const WM_SYSCOMMAND: u32 = 0x0112;
        let command = match edge.as_deref() {
            None => 0xF012,
            Some("West") => 0xF001,
            Some("East") => 0xF002,
            Some("North") => 0xF003,
            Some("NorthWest") => 0xF004,
            Some("NorthEast") => 0xF005,
            Some("South") => 0xF006,
            Some("SouthWest") => 0xF007,
            Some(_) => 0xF008,
        };
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        unsafe {
            ReleaseCapture();
            PostMessageW(hwnd.0 as _, WM_SYSCOMMAND, command, 0);
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        use tauri::window::ResizeDirection;
        let direction = match edge.as_deref() {
            None => return window.start_dragging().map_err(|error| error.to_string()),
            Some("West") => ResizeDirection::West,
            Some("East") => ResizeDirection::East,
            Some("North") => ResizeDirection::North,
            Some("NorthWest") => ResizeDirection::NorthWest,
            Some("NorthEast") => ResizeDirection::NorthEast,
            Some("South") => ResizeDirection::South,
            Some("SouthWest") => ResizeDirection::SouthWest,
            Some(_) => ResizeDirection::SouthEast,
        };
        window.start_resize_dragging(direction).map_err(|error| error.to_string())
    }
}

/// The smallest window that still shows the whole toolbar (the page measures it).
/// Without a system frame the limit applies to the outer size, so the invisible border is added.
#[tauri::command]
fn set_min_size(window: WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let border = match (window.outer_size(), window.inner_size()) {
        (Ok(outer), Ok(inner)) => (f64::from(outer.width.saturating_sub(inner.width)) / scale, f64::from(outer.height.saturating_sub(inner.height)) / scale),
        _ => (0.0, 0.0),
    };
    window
        .set_min_size(Some(tauri::LogicalSize::new(width + border.0, height + border.1)))
        .map_err(|error| error.to_string())?;
    // Already smaller (the toolbar grew with a language change): grow the window.
    if let Ok(inner) = window.inner_size() {
        let logical = inner.to_logical::<f64>(scale);
        if logical.width + 0.5 < width && !window.is_maximized().unwrap_or(false) {
            let _ = window.set_size(tauri::LogicalSize::new(width, logical.height.max(height)));
        }
    }
    Ok(())
}

/// Called by the page once it has drawn itself: the window appears without a white flash.
#[tauri::command]
fn window_ready(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

pub fn run() {
    let startup = document_args(std::env::args().skip(1));
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Shared { startup_files: startup }))
        .setup(|app| {
            let state_path = window_state::state_file(app.handle());
            let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app.handle(), path));
            // No system title bar: the menu bar row carries the icon, name, version and the open
            // document (left) and the minimize / maximize / close buttons (right), and moves the window.
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(format!("MyTextMaster v{}", app.package_info().version))
                .decorations(false)
                .shadow(true)
                .min_inner_size(900.0, 560.0)
                .visible(false);
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized),
                None => builder.inner_size(1360.0, 860.0).center(),
            };
            let main = builder.build()?;
            // The page shows the window once drawn; if it never runs, show it anyway.
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            startup_files,
            read_text_file,
            write_text_file,
            file_stat,
            paths_exist,
            allow_directory,
            open_external,
            clipboard_write,
            clipboard_read,
            window_drag,
            set_min_size,
            window_ready,
            quit_app,
            explorer_places,
            list_dir,
            search_files,
            copy_image,
            write_image,
            read_bytes,
            write_bytes,
            set_always_on_top,
            file_details,
            file_hashes
        ])
        .build(tauri::generate_context!())
        .expect("error while building MyTextMaster");
    app.run(|handle, event| {
        // macOS hands double-clicked documents to the running app as an event, not as arguments.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            let paths: Vec<PathBuf> = urls.iter().filter_map(|url| url.to_file_path().ok()).collect();
            if let Some(state) = handle.try_state::<AppState>() {
                lock(&state).startup_files.extend(paths.clone());
            }
            let _ = handle.emit("open-files", paths);
        }
        let _ = (handle, &event);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn options_and_missing_files_are_not_documents() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.md");
        std::fs::write(&file, "# a").unwrap();
        let args = vec!["--flag".to_string(), file.display().to_string(), dir.path().join("none.md").display().to_string()];
        assert_eq!(document_args(args), vec![file]);
    }
}
