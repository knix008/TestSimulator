//! MyICOMaker desktop backend (Tauri 2).
//!
//! Windows:
//!  - `main`        the editor with its start screen (frameless: the page draws the title bar);
//!  - `doc-guide`   the user's guide (system title bar), one window, brought back when asked again;
//!  - `popup-print` the print preview (frameless, owned by the main window).
//! The page does the drawing and the icon encoding; the backend reads and writes files,
//! opens windows, remembers where they were and prints.
pub mod files;
pub mod i18n;
pub mod printing;
pub mod window_state;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Every webview in the process must share these (WebView2 refuses a second environment with other arguments).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[derive(Default)]
struct Shared {
    /// Design files given on the command line, handed to the page once.
    startup_files: Vec<PathBuf>,
}

type AppState = Mutex<Shared>;

fn lock(state: &AppState) -> std::sync::MutexGuard<'_, Shared> {
    state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| tr!("작업 실행 실패: {error}", "The task failed: {error}"))?
}

fn app_title(info: &tauri::PackageInfo) -> String {
    format!("MyICOMaker v{}", info.version)
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

#[tauri::command]
fn set_language(language: String) {
    i18n::set_english(language == "en");
}

#[tauri::command]
fn startup_files(state: tauri::State<'_, AppState>) -> Vec<PathBuf> {
    std::mem::take(&mut lock(&state).startup_files)
}

#[tauri::command]
async fn read_text_file(path: PathBuf) -> Result<String, String> {
    blocking(move || files::read_text(&path)).await
}

#[tauri::command]
async fn write_text_file(path: PathBuf, content: String) -> Result<(), String> {
    blocking(move || files::write_atomic(&path, content.as_bytes())).await
}

/// Reads a binary file as base64 (pictures to import).
#[tauri::command]
async fn read_base64_file(path: PathBuf) -> Result<String, String> {
    use base64::Engine;
    blocking(move || Ok(base64::engine::general_purpose::STANDARD.encode(files::read(&path)?))).await
}

/// Writes binary data given as base64 (icons, pictures, ZIP).
#[tauri::command]
async fn write_base64_file(path: PathBuf, data: String) -> Result<(), String> {
    blocking(move || files::write_atomic(&path, &files::decode_base64(&data)?)).await
}

#[derive(Deserialize)]
struct NamedFile {
    name: String,
    data: String,
}

/// Writes several files (base64) into one folder: per-size icons, a PNG set. Returns the paths written.
#[tauri::command]
async fn write_files_to_dir(dir: PathBuf, items: Vec<NamedFile>) -> Result<Vec<PathBuf>, String> {
    blocking(move || {
        let mut written = Vec::new();
        for item in items {
            let name = files::safe_file_name(&item.name).ok_or_else(|| tr!("잘못된 파일 이름: {}", "Bad file name: {}", item.name))?;
            let path = dir.join(name);
            files::write_atomic(&path, &files::decode_base64(&item.data)?)?;
            written.push(path);
        }
        Ok(written)
    })
    .await
}

#[tauri::command]
fn paths_exist(paths: Vec<PathBuf>) -> Vec<bool> {
    paths.iter().map(|path| path.is_file()).collect()
}

#[tauri::command]
async fn open_external(target: String) -> Result<(), String> {
    let lower = target.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:") || Path::new(&target).exists()) {
        return Err(tr!("열 수 없는 주소입니다: {target}", "This address cannot be opened: {target}"));
    }
    blocking(move || files::open_with_system(&target)).await
}

/// Shows the folder holding a file (after an export).
#[tauri::command]
async fn reveal_path(path: PathBuf) -> Result<(), String> {
    blocking(move || files::reveal(&path)).await
}

/// The main window shows itself once the page has drawn (no white flash).
#[tauri::command]
fn main_ready(app: AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// A page window (guide, print) shows itself once drawn.
#[tauri::command]
fn window_ready(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

fn placed_builder<'a>(app: &'a AppHandle, label: &str, url: &str, title: String, size: (f64, f64), min: (f64, f64)) -> (WebviewWindowBuilder<'a, tauri::Wry, AppHandle>, Option<PathBuf>) {
    let state_path = window_state::state_file(app).map(|path| path.with_file_name(format!("window-state.{label}.json")));
    let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app, path));
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .min_inner_size(min.0, min.1)
        .visible(false)
        .additional_browser_args(BROWSER_ARGS);
    let builder = match placement {
        Some((state, scale)) => builder
            .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
            .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
            .maximized(state.maximized),
        None => builder.inner_size(size.0, size.1).center(),
    };
    (builder, state_path)
}

fn bring_back(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Shows the page anyway if it never says it is ready (a broken page must not leave an invisible window).
fn show_later(window: &WebviewWindow, seconds: u64) {
    let late = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(seconds));
        if !late.is_visible().unwrap_or(true) {
            let _ = late.show();
        }
    });
}

/// The user's guide in a window of its own (system title bar).
#[tauri::command]
async fn open_guide_window(app: AppHandle, title: String, lang: String, chapter: Option<String>) -> Result<(), String> {
    static CREATING: Mutex<()> = Mutex::new(());
    let _guard = CREATING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(window) = app.get_webview_window("doc-guide") {
        let _ = window.emit_to("doc-guide", "guide-open", (lang, chapter));
        bring_back(&window);
        return Ok(());
    }
    let lang = if lang == "en" { "en" } else { "ko" };
    let chapter = chapter.unwrap_or_default().chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect::<String>();
    let url = format!("index.html?viewer=guide&lang={lang}&chapter={chapter}");
    let (builder, state_path) = placed_builder(&app, "doc-guide", &url, title, (1040.0, 760.0), (640.0, 420.0));
    let window = builder.decorations(true).resizable(true).build().map_err(|error| error.to_string())?;
    if let Some(path) = state_path {
        window_state::track(&window, path);
    }
    show_later(&window, 5);
    Ok(())
}

/// Frameless windows owned by the main window, each drawing its own title bar: the print preview
/// ("print") and the settings ("settings"). Asking again brings the window back and refreshes it.
const POPUPS: &[(&str, f64, f64, f64, f64)] = &[("print", 1120.0, 800.0, 900.0, 600.0), ("settings", 760.0, 640.0, 620.0, 480.0)];

#[tauri::command]
async fn open_popup(app: AppHandle, kind: String, title: String) -> Result<(), String> {
    let Some(&(_, width, height, min_width, min_height)) = POPUPS.iter().find(|(name, ..)| *name == kind) else {
        return Err(format!("unknown window {kind}"));
    };
    static CREATING: Mutex<()> = Mutex::new(());
    let _guard = CREATING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let label = format!("popup-{kind}");
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.emit_to(label.as_str(), "popup-refresh", ());
        bring_back(&window);
        return Ok(());
    }
    let url = format!("index.html?popup={kind}");
    let (mut builder, state_path) = placed_builder(&app, &label, &url, title, (width, height), (min_width, min_height));
    builder = builder.decorations(false).shadow(true).resizable(true);
    // The print window is a window of its own (own taskbar button, moves anywhere, stays when
    // the main window is minimized); the settings window belongs to the main window.
    if kind != "print" {
        if let Some(main) = app.get_webview_window("main") {
            builder = builder.parent(&main).map_err(|error| error.to_string())?;
        }
    }
    let window = builder.build().map_err(|error| error.to_string())?;
    if let Some(path) = state_path {
        window_state::track(&window, path);
    }
    show_later(&window, 5);
    Ok(())
}

/// The system print dialog for the window's page (the print preview window prints itself).
#[tauri::command]
fn print_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| tr!("인쇄를 시작할 수 없습니다: {error}", "Could not start printing: {error}"))
}

/// Moves (no edge) or resizes (edge = "East", "SouthEast", …) a frameless window from a pointer press.
/// Windows: the system's own move/size loop (WM_SYSCOMMAND), which also snaps to screen edges.
/// Elsewhere moving goes through Tauri; resizing answers "unsupported" and the page uses
/// the window API's startResizeDragging instead.
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
        match edge {
            None => window.start_dragging().map_err(|error| error.to_string()),
            Some(_) => Err("unsupported".into()),
        }
    }
}

#[tauri::command]
fn list_printers() -> printing::PrinterList {
    printing::printers()
}

/// Prints the window's page on the chosen printer, without the system dialog (Windows).
#[tauri::command]
async fn print_direct(window: WebviewWindow, job: printing::PrintJob) -> Result<(), String> {
    printing::print(&window, job).await
}

/// The same page as a PDF file (Save as PDF, and the tests).
#[tauri::command]
async fn print_pages_to_pdf(window: WebviewWindow, job: printing::PrintJob, path: String) -> Result<(), String> {
    printing::print_to_pdf(&window, job, path).await
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.destroy();
    }
    app.exit(0);
}

pub fn run() {
    let mut builder = tauri::Builder::default();
    // One copy at a time (MYICOMAKER_MULTI=1 — npm start, the tests — skips it): a second start
    // brings the first window back and hands it the files it was given.
    if std::env::var_os("MYICOMAKER_MULTI").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                bring_back(&main);
                let opened = files::design_files(args.into_iter().skip(1));
                if !opened.is_empty() {
                    let _ = app.emit_to("main", "open-files", opened);
                }
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            {
                let state = app.state::<AppState>();
                lock(&state).startup_files = files::design_files(std::env::args().skip(1));
            }
            let state_path = window_state::state_file(app.handle());
            // First start after the installer: forget the window place, have the page reset its preferences,
            // and open in the language chosen in the installer.
            let install_reset = state_path.as_deref().and_then(window_state::take_install_reset);
            let install_language = state_path.as_deref().and_then(window_state::take_install_language);
            let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app.handle(), path));
            let mut script = String::new();
            if let Some(token) = install_reset {
                script.push_str(&format!("window.__MYICOMAKER_INSTALL_RESET__ = {};", serde_json::to_string(&token).unwrap_or_default()));
            }
            if let Some(language) = install_language {
                script.push_str(&format!("window.__MYICOMAKER_INSTALL_LANGUAGE__ = '{language}';"));
            }
            // No system title bar: the page's title bar carries the icon, name, version and the
            // minimize / maximize / close buttons, and is the drag area.
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(app_title(app.package_info()))
                .decorations(false)
                .shadow(true)
                .min_inner_size(1180.0, 700.0)
                .visible(false)
                .initialization_script(&script)
                .additional_browser_args(BROWSER_ARGS);
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized),
                None => builder.inner_size(1440.0, 900.0).center(),
            };
            let main = builder.build()?;
            show_later(&main, 15);
            if let Some(path) = state_path {
                window_state::track(&main, path);
            }
            // Closing the main window ends the app: the guide and the print preview go with it.
            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    handle.exit(0);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            set_language,
            startup_files,
            read_text_file,
            write_text_file,
            read_base64_file,
            write_base64_file,
            write_files_to_dir,
            paths_exist,
            open_external,
            reveal_path,
            main_ready,
            window_ready,
            open_guide_window,
            open_popup,
            print_window,
            list_printers,
            print_direct,
            print_pages_to_pdf,
            window_drag,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyICOMaker");
}
