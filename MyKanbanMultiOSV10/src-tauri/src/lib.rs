// The desktop program: the window, native file dialogs and .kprj file handling. Everything else
// is the same Express server and page as the web version, run by a Node process (host.rs).

mod host;
mod window_icon;

use base64::Engine;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{
    AppHandle, LogicalSize, Manager, RunEvent, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

const PRODUCT: &str = "MyKanban";
const BRIDGE: &str = include_str!("bridge.js");
// Measured: the header needs 701 px (admin, 140 px user name), the English board toolbar 678 px.
// npm run smoke checks that nothing is cut at this width, in both languages.
const MIN_WIDTH: f64 = 720.0;
const MIN_HEIGHT: f64 = 400.0;
// An unreachable script in the page's <head> must not keep the window hidden.
const SHOW_ANYWAY_AFTER: Duration = Duration::from_secs(5);

struct AppState {
    data_dir: PathBuf,
    pending_kprj: Mutex<Option<String>>,
    host: Mutex<Option<Child>>,
}

fn failure(message: impl ToString) -> Value {
    json!({ "ok": false, "error": message.to_string() })
}

fn cancelled() -> Value {
    json!({ "ok": false, "cancelled": true })
}

fn write_file(path: &Path, bytes: &[u8]) -> Value {
    match std::fs::write(path, bytes) {
        Ok(()) => json!({ "ok": true, "filePath": path.to_string_lossy() }),
        Err(err) => failure(err),
    }
}

/// A board title can hold characters no file name may have.
fn safe_file_name(name: &str) -> String {
    name.chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c })
        .collect()
}

fn with_extension(name: &str, ext: &str) -> String {
    let name = safe_file_name(name);
    if name.to_lowercase().ends_with(&format!(".{ext}")) {
        name
    } else {
        format!("{name}.{ext}")
    }
}

fn report_extension(default_name: &str, mime: &str) -> String {
    match mime {
        "text/markdown" | "text/markdown;charset=utf-8" => "md".into(),
        "application/pdf" => "pdf".into(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => "docx".into(),
        _ => Path::new(default_name)
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_else(|| "bin".into()),
    }
}

fn find_kprj_arg(args: impl Iterator<Item = String>) -> Option<String> {
    args.skip(1).find(|arg| arg.to_lowercase().ends_with(".kprj"))
}

fn is_plain_file_name(name: &str) -> bool {
    !name.is_empty()
        && Path::new(name).file_name().map(|n| n.to_string_lossy() == name).unwrap_or(false)
}

fn ui_config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("kanban-ui.json")
}

fn read_ui_config(data_dir: &Path) -> Value {
    std::fs::read_to_string(ui_config_path(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}))
}

fn remember_open_dir(data_dir: &Path, dir: &Path) {
    let mut config = read_ui_config(data_dir);
    config["lastOpenDir"] = json!(dir.to_string_lossy());
    let _ = std::fs::write(ui_config_path(data_dir), config.to_string());
}

#[tauri::command]
fn take_open_file(state: State<'_, AppState>) -> Option<String> {
    state.pending_kprj.lock().ok()?.take()
}

#[tauri::command]
async fn save_kprj(window: WebviewWindow, default_name: String, json_content: String) -> Value {
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("프로젝트 내보내기")
        .set_file_name(with_extension(&default_name, "kprj"))
        .add_filter("MyKanban 프로젝트", &["kprj"])
        .blocking_save_file();
    match picked.and_then(|p| p.into_path().ok()) {
        Some(path) => write_file(&path, json_content.as_bytes()),
        None => cancelled(),
    }
}

#[tauri::command]
async fn save_report(window: WebviewWindow, default_name: String, base64_content: String, mime: String) -> Value {
    let bytes = match base64::engine::general_purpose::STANDARD.decode(base64_content) {
        Ok(bytes) => bytes,
        Err(err) => return failure(err),
    };
    let ext = report_extension(&default_name, &mime);
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Save Report")
        .set_file_name(with_extension(&default_name, &ext))
        .add_filter("Report", &[ext.as_str()])
        .blocking_save_file();
    match picked.and_then(|p| p.into_path().ok()) {
        Some(path) => write_file(&path, &bytes),
        None => cancelled(),
    }
}

#[tauri::command]
async fn open_kprj_dialog(window: WebviewWindow, state: State<'_, AppState>, start_dir: Option<String>) -> Result<Value, ()> {
    let start = start_dir
        .map(PathBuf::from)
        .or_else(|| read_ui_config(&state.data_dir)["lastOpenDir"].as_str().map(PathBuf::from))
        .filter(|dir| dir.is_dir())
        .or_else(|| window.path().document_dir().ok());
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("프로젝트 열기")
        .add_filter("MyKanban 프로젝트", &["kprj"]);
    if let Some(dir) = start {
        dialog = dialog.set_directory(dir);
    }
    let Some(path) = dialog.blocking_pick_file().and_then(|p| p.into_path().ok()) else {
        return Ok(cancelled());
    };
    if let Some(dir) = path.parent() {
        remember_open_dir(&state.data_dir, dir);
    }
    Ok(match std::fs::read_to_string(&path) {
        Ok(content) => json!({ "ok": true, "content": content, "filePath": path.to_string_lossy() }),
        Err(err) => failure(err),
    })
}

#[tauri::command]
async fn open_sqlite_dialog(window: WebviewWindow, state: State<'_, AppState>) -> Result<Value, ()> {
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("SQLite DB 파일 선택")
        .set_directory(&state.data_dir)
        .add_filter("SQLite Database", &["db", "sqlite", "sqlite3"])
        .blocking_pick_file();
    Ok(match picked.and_then(|p| p.into_path().ok()) {
        Some(path) => json!({ "ok": true, "filePath": path.to_string_lossy() }),
        None => cancelled(),
    })
}

#[tauri::command]
fn open_attachment(app: AppHandle, state: State<'_, AppState>, filename: String) -> Value {
    // The name comes from the page; only files directly inside uploads/ may be opened.
    if !is_plain_file_name(&filename) {
        return failure("잘못된 파일 이름입니다.");
    }
    let path = state.data_dir.join("uploads").join(&filename);
    if !path.is_file() {
        return failure("파일을 찾을 수 없습니다.");
    }
    match app.opener().open_path(path.to_string_lossy(), None::<&str>) {
        Ok(()) => json!({ "ok": true }),
        Err(err) => failure(err),
    }
}

/// Hands the pressed mouse button to the system's own window sizing, as if the frame's corner
/// had been pressed: minimum size, Snap and every monitor work as usual.
#[tauri::command]
fn start_resize(window: tauri::Window) -> Result<(), String> {
    window.start_resize_dragging(tauri_runtime::ResizeDirection::SouthEast).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = match std::env::var_os("MYKANBAN_CONFIG_DIR") {
        Some(dir) => PathBuf::from(dir),
        // The same folder the Electron version used, so existing data stays in place.
        None => app.path().config_dir().map_err(|e| e.to_string())?.join(PRODUCT),
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(dir)
}

fn show_main_window(window: &WebviewWindow) {
    if !window.is_visible().unwrap_or(true) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_main_window(app: &AppHandle, port: u16) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{port}").parse().map_err(|e| format!("{e}"))?;
    let opener = app.clone();
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title(PRODUCT)
        .inner_size(1400.0, 900.0)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .background_color(tauri::webview::Color(0xF1, 0xF5, 0xF9, 0xFF))
        .visible(false)
        // Cards are moved with HTML5 drag and drop, which Tauri's own file-drop handling blocks.
        .disable_drag_drop_handler()
        .initialization_script(BRIDGE)
        .on_new_window(move |url, _features| {
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                let _ = opener.opener().open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                show_main_window(&window);
            }
        })
        .build()
        .map_err(|e| e.to_string())?;
    window_icon::apply(&window);

    std::thread::spawn(move || {
        std::thread::sleep(SHOW_ANYWAY_AFTER);
        show_main_window(&window);
    });
    Ok(())
}

fn start(app: &AppHandle) -> Result<(), String> {
    let data_dir = data_dir(app)?;
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let (child, port) = host::start(&resource_dir, &data_dir)?;
    app.manage(AppState {
        data_dir,
        pending_kprj: Mutex::new(find_kprj_arg(std::env::args())),
        host: Mutex::new(Some(child)),
    });
    open_main_window(app, port)
}

/// Windows and macOS can take the window below its minimum by other routes than dragging its
/// edge (Snap, other programs), which would cut the toolbar.
fn keep_minimum_size(window: &tauri::Window, event: &WindowEvent) {
    let WindowEvent::Resized(size) = event else { return };
    if size.width == 0 || size.height == 0 {
        return;
    }
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let Ok(scale) = window.scale_factor() else { return };
    let current = size.to_logical::<f64>(scale);
    if current.width + 0.5 < MIN_WIDTH || current.height + 0.5 < MIN_HEIGHT {
        let _ = window.set_size(LogicalSize::new(current.width.max(MIN_WIDTH), current.height.max(MIN_HEIGHT)));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            take_open_file,
            save_kprj,
            save_report,
            open_kprj_dialog,
            open_sqlite_dialog,
            open_attachment,
            start_resize,
            is_maximized,
        ])
        .on_window_event(keep_minimum_size)
        .setup(|app| {
            let handle = app.handle().clone();
            // Off the main thread: it waits for the server and then builds a window.
            std::thread::spawn(move || {
                if let Err(message) = start(&handle) {
                    handle
                        .dialog()
                        .message(format!("시작 중 오류가 발생했습니다.\n\n{message}"))
                        .title(PRODUCT)
                        .kind(MessageDialogKind::Error)
                        .blocking_show();
                    handle.exit(1);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the application");

    app.run(|app, event| match event {
        RunEvent::Exit => {
            if let Some(state) = app.try_state::<AppState>() {
                if let Some(mut child) = state.host.lock().ok().and_then(|mut host| host.take()) {
                    let _ = child.kill();
                }
            }
        }
        // macOS hands a double-clicked file to the running program.
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            use tauri::Emitter;
            let file = urls
                .iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().to_string())
                .find(|path| path.to_lowercase().ends_with(".kprj"));
            if let (Some(file), Some(state)) = (file, app.try_state::<AppState>()) {
                if app.get_webview_window("main").is_some() {
                    let _ = app.emit("open-kprj", file);
                } else if let Ok(mut pending) = state.pending_kprj.lock() {
                    *pending = Some(file);
                }
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_lose_forbidden_characters_and_get_their_extension() {
        assert_eq!(with_extension("a/b:c", "kprj"), "a_b_c.kprj");
        assert_eq!(with_extension("plan.KPRJ", "kprj"), "plan.KPRJ");
    }

    #[test]
    fn report_extension_follows_the_mime_type() {
        assert_eq!(report_extension("r", "text/markdown;charset=utf-8"), "md");
        assert_eq!(report_extension("r", "application/pdf"), "pdf");
        assert_eq!(report_extension("r.txt", "x/y"), "txt");
        assert_eq!(report_extension("r", "x/y"), "bin");
    }

    #[test]
    fn only_a_kprj_argument_counts_and_the_program_path_never_does() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>().into_iter();
        assert_eq!(find_kprj_arg(args(&["app.kprj"])), None);
        assert_eq!(find_kprj_arg(args(&["app", "--x", "C:/a/B.KPRJ"])), Some("C:/a/B.KPRJ".into()));
    }

    #[test]
    fn attachments_cannot_leave_the_uploads_folder() {
        assert!(is_plain_file_name("0a1b-c.pdf"));
        assert!(!is_plain_file_name("../kanban.db"));
        assert!(!is_plain_file_name("sub/x"));
        assert!(!is_plain_file_name(".."));
        assert!(!is_plain_file_name(""));
        #[cfg(windows)]
        assert!(!is_plain_file_name("..\\kanban.db"));
    }
}
