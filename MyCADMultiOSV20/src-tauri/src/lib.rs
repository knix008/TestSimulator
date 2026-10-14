pub mod files;
pub mod fonts;
pub mod i18n;
pub mod window_state;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Every webview in the process must share these (WebView2 refuses a second
/// environment with different arguments).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

/// Popup windows. Each is an OS window of its own (label `popup-<kind>`), owned
/// by the main window: it can sit outside the main window and closes with it.
const POPUP_KINDS: [&str; 20] = ["settings", "about", "confirm", "error", "progress", "recent", "print", "menu", "theme", "part", "array", "stl", "solid", "coverage", "tutorial", "bim", "check", "cam", "fem", "spreadsheet"];

#[derive(Default)]
struct Shared {
    /// Drawing files given on the command line, handed to the UI once.
    startup_files: Vec<PathBuf>,
    /// The last run did not end normally (crash, kill, power loss): reported once at start-up.
    previous_run: Option<PreviousRun>,
}

/// How the previous run ended, when it did not end normally.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PreviousRun {
    /// Seconds since 1970 when it started.
    started: u64,
    /// The crash.log entries written during that run (empty: it ended without a word —
    /// killed, power lost, or a crash outside Rust).
    log: String,
    log_path: Option<PathBuf>,
}

/// While MyCAD runs, `running.lock` (start time) sits in the data folder; a normal
/// exit removes it. Found at start-up, it means the last run ended abnormally.
const RUN_MARKER: &str = "running.lock";

fn data_folder(app: &AppHandle) -> Option<PathBuf> {
    background_dir(app).ok().and_then(|dir| dir.parent().map(Path::to_path_buf))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Reads (and replaces) the run marker: Some(previous run) when the last run did not end normally.
fn check_previous_run(app: &AppHandle) -> Option<PreviousRun> {
    let dir = data_folder(app)?;
    let _ = std::fs::create_dir_all(&dir);
    let marker = dir.join(RUN_MARKER);
    let previous = std::fs::read_to_string(&marker).ok().map(|text| {
        let started = text.trim().parse::<u64>().unwrap_or(0);
        let log_path = dir.join("crash.log");
        // crash.log entries start with "[seconds]": keep those written during that run.
        let log = std::fs::read_to_string(&log_path)
            .unwrap_or_default()
            .split("\n\n[")
            .map(|entry| if entry.starts_with('[') { entry.to_string() } else { format!("[{entry}") })
            .filter(|entry| entry[1..].split(']').next().and_then(|n| n.parse::<u64>().ok()).is_some_and(|stamp| stamp >= started))
            .collect::<Vec<_>>()
            .join("\n\n");
        PreviousRun { started, log: log.trim().to_string(), log_path: log_path.exists().then_some(log_path) }
    });
    let _ = std::fs::write(&marker, now_secs().to_string());
    previous
}

/// A normal end: the marker goes.
fn clear_run_marker(app: &AppHandle) {
    if let Some(dir) = data_folder(app) {
        let _ = std::fs::remove_file(dir.join(RUN_MARKER));
    }
}

/// The previous run, if it ended abnormally (handed to the UI once).
#[tauri::command]
fn previous_run(state: tauri::State<'_, AppState>) -> Option<PreviousRun> {
    lock(&state).previous_run.take()
}

/// A message box straight from the OS, for a crash the window can no longer show
/// (the main thread is going down). Its text can be copied with Ctrl+C.
#[cfg(target_os = "windows")]
fn native_alert(title: &str, text: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: *mut std::ffi::c_void, text: *const u16, caption: *const u16, kind: u32) -> i32;
    }
    let wide = |value: &str| value.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (text, title) = (wide(text), wide(title));
    // MB_ICONERROR | MB_TOPMOST | MB_SETFOREGROUND
    unsafe {
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), 0x10 | 0x4_0000 | 0x1_0000);
    }
}

#[cfg(not(target_os = "windows"))]
fn native_alert(title: &str, text: &str) {
    // macOS / Linux: on the terminal; the next start shows it in the error popup (crash.log).
    eprintln!("{title}\n{text}");
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

/// "MyCAD V1.0" — shown in the title bar of every window (major.minor of the package version).
fn app_title(info: &tauri::PackageInfo) -> String {
    format!("MyCAD V{}.{}", info.version.major, info.version.minor)
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    op: String,
    done: u64,
    total: u64,
}

/// Progress of a long file operation, for the main window's progress popup.
fn reporter(app: &AppHandle, op: String) -> impl FnMut(u64, u64) {
    let app = app.clone();
    let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
    move |done, total| {
        // At most ~20 events per second, plus the final one.
        if done == total || last.elapsed().as_millis() >= 50 {
            last = std::time::Instant::now();
            let progress = Progress { op: op.clone(), done, total };
            let _ = app.emit("io-progress", progress);
        }
    }
}

#[tauri::command]
async fn read_text_file(app: AppHandle, path: PathBuf, op: String) -> Result<String, String> {
    blocking(move || files::read_text(&path, reporter(&app, op))).await
}

/// Reads any file (3D models, FreeCAD documents…) as base64 text, with progress.
#[tauri::command]
async fn read_base64_file(app: AppHandle, path: PathBuf, op: String) -> Result<String, String> {
    use base64::Engine;
    blocking(move || files::read_with_progress(&path, reporter(&app, op)).map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes))).await
}

#[tauri::command]
async fn write_text_file(app: AppHandle, path: PathBuf, content: String, op: String) -> Result<(), String> {
    blocking(move || files::write_with_progress(&path, content.as_bytes(), reporter(&app, op))).await
}

/// Writes binary data (a PNG export) given as base64.
#[tauri::command]
async fn write_base64_file(app: AppHandle, path: PathBuf, data: String, op: String) -> Result<(), String> {
    use base64::Engine;
    blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data.as_bytes())
            .map_err(|error| tr!("데이터가 손상되었습니다: {error}", "The data is damaged: {error}"))?;
        files::write_with_progress(&path, &bytes, reporter(&app, op))
    })
    .await
}

#[tauri::command]
fn paths_exist(paths: Vec<PathBuf>) -> Vec<bool> {
    paths.iter().map(|path| path.is_file()).collect()
}

/// Where background images are kept (tests point this elsewhere).
fn background_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("MYCAD_DATA_DIR") {
        return Ok(PathBuf::from(dir).join("background"));
    }
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("background"))
        .map_err(|error| tr!("데이터 폴더를 찾을 수 없습니다: {error}", "The data folder was not found: {error}"))
}

fn clear_dir(dir: &Path, keep: Option<&Path>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if Some(entry.path().as_path()) != keep {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

/// Copies an image (any size) into the app's data folder so the background
/// survives the original being moved, and returns the copy's path.
#[tauri::command]
async fn import_background(app: AppHandle, path: PathBuf, op: String) -> Result<PathBuf, String> {
    let dir = background_dir(&app)?;
    let _ = app.asset_protocol_scope().allow_directory(&dir, true);
    let handle = app.clone();
    blocking(move || {
        let extension = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "img".into());
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        let target = dir.join(format!("background-{stamp}.{extension}"));
        files::copy_with_progress(&path, &target, reporter(&handle, op))?;
        clear_dir(&dir, Some(&target));
        Ok(target)
    })
    .await
}

#[tauri::command]
fn remove_background(app: AppHandle) -> Result<(), String> {
    clear_dir(&background_dir(&app)?, None);
    Ok(())
}

/// Lets the page load a background image kept in the data folder.
#[tauri::command]
fn allow_background(app: AppHandle, path: PathBuf) -> bool {
    path.is_file() && app.asset_protocol_scope().allow_file(&path).is_ok()
}

static FONTS: OnceLock<Vec<String>> = OnceLock::new();

#[tauri::command]
async fn list_fonts() -> Result<Vec<String>, String> {
    if let Some(fonts) = FONTS.get() {
        return Ok(fonts.clone());
    }
    let fonts = blocking(|| Ok(fonts::system_families())).await?;
    Ok(FONTS.get_or_init(|| fonts).clone())
}

/// Clipboard text through the OS (the webview API refuses while another window
/// such as a context menu has focus).
#[tauri::command]
async fn clipboard_write(text: String) -> Result<(), String> {
    blocking(move || {
        arboard::Clipboard::new()
            .and_then(|mut clipboard| clipboard.set_text(text))
            .map_err(|error| tr!("클립보드 복사 실패: {error}", "Copying to the clipboard failed: {error}"))
    })
    .await
}

#[tauri::command]
async fn clipboard_read() -> Result<String, String> {
    blocking(|| {
        let mut clipboard = arboard::Clipboard::new().map_err(|error| tr!("클립보드를 열 수 없습니다: {error}", "Could not open the clipboard: {error}"))?;
        Ok(clipboard.get_text().unwrap_or_default())
    })
    .await
}

/// Opens a popup window at (x, y) logical screen pixels, or brings it back.
/// It is shown by `popup_ready` / `place_popup` once drawn, so it never flashes
/// empty. Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
async fn open_popup(app: AppHandle, kind: String, x: f64, y: f64, width: f64, height: f64, show: Option<bool>) -> Result<(), String> {
    if !POPUP_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown popup {kind}"));
    }
    // One request at a time: two requests for a popup that is still being created
    // would otherwise both try to create it.
    static CREATING: Mutex<()> = Mutex::new(());
    let _guard = CREATING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let label = format!("popup-{kind}");
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        let _ = app.emit_to(label.as_str(), "popup-refresh", kind.clone());
        if show.unwrap_or(true) && kind != "menu" {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(app_title(app.package_info()))
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .shadow(true)
        .visible(false)
        .focused(show.unwrap_or(true))
        .position(x, y)
        .inner_size(width, height)
        .additional_browser_args(BROWSER_ARGS);
    if kind == "menu" || kind == "progress" || kind == "theme" {
        builder = builder.always_on_top(true);
    }
    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|error| error.to_string())?;
    }
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}

/// Called by a popup page once it has drawn itself.
#[tauri::command]
fn popup_ready(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Placement {
    x: f64,
    y: f64,
}

/// Sizes the calling popup to its content and places it at (x, y) — logical
/// screen pixels — so that it is entirely on the monitor's work area, whatever
/// the size of the main window. When there is no room below, it opens above
/// `flip_y` (the top of the button that opened it).
#[tauri::command]
fn place_popup(window: WebviewWindow, x: f64, y: f64, width: f64, height: f64, flip_y: Option<f64>, show: Option<bool>) -> Result<Placement, String> {
    let monitors = window.available_monitors().map_err(|error| error.to_string())?;
    let monitor = monitors
        .iter()
        .find(|m| {
            let scale = m.scale_factor();
            let (p, s) = (m.position(), m.size());
            let (px, py) = (x * scale, y * scale);
            px >= f64::from(p.x) && px < f64::from(p.x) + f64::from(s.width) && py >= f64::from(p.y) && py < f64::from(p.y) + f64::from(s.height)
        })
        .or(monitors.first());
    let (mut px, mut py, pw, ph, scale) = match monitor {
        Some(m) => {
            let scale = m.scale_factor();
            (x * scale, y * scale, width * scale, height * scale, scale)
        }
        None => (x, y, width, height, 1.0),
    };
    if let Some(m) = monitor {
        let area = m.work_area();
        let (left, top) = (f64::from(area.position.x), f64::from(area.position.y));
        let (right, bottom) = (left + f64::from(area.size.width), top + f64::from(area.size.height));
        if px + pw > right {
            px = (right - pw).max(left);
        }
        px = px.max(left);
        if py + ph > bottom {
            py = match flip_y {
                Some(flip) if flip * scale - ph >= top => flip * scale - ph,
                _ => (bottom - ph).max(top),
            };
        }
        py = py.max(top);
    }
    window.set_size(PhysicalSize::new(pw.round() as u32, ph.round() as u32)).map_err(|error| error.to_string())?;
    window.set_position(PhysicalPosition::new(px.round() as i32, py.round() as i32)).map_err(|error| error.to_string())?;
    if show.unwrap_or(true) {
        let _ = window.show();
        // A borderless window created hidden can come out taller on its first show
        // (Windows adds the frame it does not have): the size once more, now that it is shown.
        let _ = window.set_size(PhysicalSize::new(pw.round() as u32, ph.round() as u32));
        let _ = window.set_focus();
    }
    Ok(Placement { x: px / scale, y: py / scale })
}

/// The label of the MyCAD window that has the keyboard focus, if any (a menu
/// asks before closing on blur: focus moving to the main window is not a click elsewhere).
#[tauri::command]
fn focused_window(app: AppHandle) -> Option<String> {
    app.webview_windows().into_iter().find(|(_, window)| window.is_focused().unwrap_or(false)).map(|(label, _)| label)
}

/// Hides a popup but keeps it for the next time (menus open instantly that way).
#[tauri::command]
fn hide_popup(app: AppHandle, kind: String) {
    let main = app.get_webview_window("main");
    if let Some(window) = app.get_webview_window(&format!("popup-{kind}")) {
        // Give the focus back first: hiding the active window makes Windows
        // activate its owner later, and that late activation could take the
        // focus from the next menu (which closes on blur) a moment after it opened.
        if window.is_focused().unwrap_or(false) {
            if let Some(main) = &main {
                let _ = main.set_focus();
            }
        }
        let _ = window.hide();
    }
    if let Some(main) = main {
        let _ = main.emit_to("main", "popup-hidden", kind);
    }
}

#[tauri::command]
fn close_popup(app: AppHandle, kind: String) {
    if let Some(window) = app.get_webview_window(&format!("popup-{kind}")) {
        let _ = window.destroy();
    }
}

/// The OS print dialog for the calling window (the print preview popup).
#[tauri::command]
fn print_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| tr!("인쇄를 시작할 수 없습니다: {error}", "Could not start printing: {error}"))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FatalError {
    message: String,
    location: String,
    thread: String,
    backtrace: String,
    log: Option<PathBuf>,
}

/// Serious errors (a panic anywhere in the backend) are written to crash.log
/// and shown to the user in the error popup with every detail, ready to copy.
/// A panic on the main thread ends the program: it is shown in an OS message
/// box first, and the next start reports it again (running.lock + crash.log).
fn install_panic_hook(app: &AppHandle) {
    let handle = app.clone();
    let log_dir = data_folder(app);
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        let location = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_default();
        let thread = std::thread::current().name().unwrap_or("unnamed").to_string();
        let backtrace = std::backtrace::Backtrace::force_capture().to_string();
        let log = log_dir.as_ref().map(|dir| dir.join("crash.log"));
        if let Some(path) = &log {
            let _ = std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")));
            let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let entry = format!("[{stamp}] thread '{thread}' panicked at {location}\n{message}\n{backtrace}\n\n");
            let _ = std::fs::OpenOptions::new().create(true).append(true).open(path).and_then(|mut file| std::io::Write::write_all(&mut file, entry.as_bytes()));
        }
        if thread == "main" {
            let head = backtrace.lines().take(40).collect::<Vec<_>>().join("\n");
            let where_log = log.as_ref().map(|path| path.display().to_string()).unwrap_or_default();
            native_alert(
                &tr!("MyCAD — 심각한 오류로 종료합니다", "MyCAD — closing after a serious error"),
                &tr!(
                    "{message}\n\n위치: {location}\n스레드: {thread}\n기록: {where_log}\n\n(Ctrl+C 로 이 내용을 복사할 수 있습니다)\n\n{head}",
                    "{message}\n\nWhere: {location}\nThread: {thread}\nLog: {where_log}\n\n(Ctrl+C copies this text)\n\n{head}"
                ),
            );
        }
        let _ = handle.emit_to("main", "fatal-error", FatalError { message, location, thread, backtrace, log });
        default(info);
    }));
}

/// Test hook for the serious-error popup (only with MYCAD_TEST_COMMANDS set).
#[tauri::command]
async fn raise_test_panic() -> Result<(), String> {
    if std::env::var_os("MYCAD_TEST_COMMANDS").is_none() {
        return Err("not available".into());
    }
    tauri::async_runtime::spawn(async { panic!("test panic: serious error raised on purpose") });
    Ok(())
}

/// Opens a page of the user documentation (doc/<name>, e.g. Tutorial.html) in
/// the default browser: from the installed resources, or from the project
/// folder when running a development build.
#[tauri::command]
fn open_document(app: AppHandle, name: String) -> Result<(), String> {
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(tr!("문서 이름이 올바르지 않습니다: {name}", "Not a document name: {name}"));
    }
    let mut candidates = Vec::new();
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("doc").join(&name));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("doc").join(&name));
    let path = candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| tr!("문서를 찾을 수 없습니다: doc/{name}", "The document was not found: doc/{name}"))?;
    open_with_system(&path)
}

fn open_with_system(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd").args(["/C", "start", ""]).arg(path).creation_flags(0x0800_0000).spawn()
    };
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(path).spawn();
    result
        .map(|_| ())
        .map_err(|error| tr!("문서를 열 수 없습니다 ({}): {error}", "Could not open the document ({}): {error}", path.display()))
}

/// Ends the app after the UI has handled unsaved changes.
#[tauri::command]
fn quit_app(app: AppHandle) {
    clear_run_marker(&app);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.destroy();
    }
    app.exit(0);
}

fn focus_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

pub fn run() {
    let mut builder = tauri::Builder::default();
    // One MyCAD: a second launch (double-clicked drawing) hands its files to the
    // running one. Tests run copies side by side (MYCAD_MULTI=1).
    if std::env::var_os("MYCAD_MULTI").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = files::document_files(argv);
            if !files.is_empty() {
                let _ = app.emit_to("main", "open-files", files);
            }
            focus_main(app);
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            install_panic_hook(app.handle());
            let previous = check_previous_run(app.handle());
            lock(&app.state::<AppState>()).previous_run = previous;
            lock(&app.state::<AppState>()).startup_files = files::document_files(std::env::args().skip(1));
            if let Ok(dir) = background_dir(app.handle()) {
                let _ = app.asset_protocol_scope().allow_directory(&dir, true);
            }
            let state_path = window_state::state_file(app.handle());
            let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app.handle(), path));
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(app_title(app.package_info()))
                .min_inner_size(960.0, 600.0)
                .visible(false)
                .additional_browser_args(BROWSER_ARGS);
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized),
                None => builder.inner_size(1440.0, 880.0).center(),
            };
            let main = builder.build()?;
            if let Some(path) = state_path {
                window_state::track(&main, path);
            }
            // Closing the main window ends the app: the popups go with it.
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
            read_base64_file,
            write_text_file,
            write_base64_file,
            paths_exist,
            import_background,
            remove_background,
            allow_background,
            list_fonts,
            clipboard_write,
            clipboard_read,
            open_popup,
            popup_ready,
            place_popup,
            hide_popup,
            focused_window,
            close_popup,
            print_window,
            quit_app,
            open_document,
            previous_run,
            raise_test_panic
        ])
        .build(tauri::generate_context!())
        .expect("error while starting MyCAD")
        .run(|app, event| {
            // Every normal way out (window closed, quit, OS log-off) removes the run marker.
            if let tauri::RunEvent::Exit = event {
                clear_run_marker(app);
            }
        });
}
