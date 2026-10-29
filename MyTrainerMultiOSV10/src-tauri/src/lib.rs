pub mod files;
pub mod fonts;
pub mod i18n;
pub mod instance;
pub mod python;
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
const POPUP_KINDS: &[&str] = &["settings", "about", "welcome", "confirm", "error", "progress", "pyenv", "samples", "prompt", "shortcuts", "menu", "themes", "summary", "export", "report"];

#[derive(Default)]
struct Shared {
    /// Project files given on the command line, handed to the UI once.
    startup_files: Vec<PathBuf>,
    /// Other MyTrainer copies that were running when this one started (instance.rs).
    other_instances: usize,
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

/// "MyTrainer v1.0.0" — shown in the title bar of every window.
fn app_title(info: &tauri::PackageInfo) -> String {
    format!("MyTrainer v{}", info.version)
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstanceInfo {
    first: bool,
    others: usize,
}

#[tauri::command]
fn instance_info(state: tauri::State<'_, AppState>) -> InstanceInfo {
    let others = lock(&state).other_instances;
    InstanceInfo { first: others == 0, others }
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
        if done == total || last.elapsed().as_millis() >= 50 {
            last = std::time::Instant::now();
            let _ = app.emit("io-progress", Progress { op: op.clone(), done, total });
        }
    }
}

#[tauri::command]
async fn read_text_file(app: AppHandle, path: PathBuf, op: String) -> Result<String, String> {
    blocking(move || files::read_text(&path, reporter(&app, op))).await
}

#[tauri::command]
async fn write_text_file(app: AppHandle, path: PathBuf, content: String, op: String) -> Result<(), String> {
    blocking(move || files::write_with_progress(&path, content.as_bytes(), reporter(&app, op))).await
}

#[tauri::command]
async fn read_base64_file(app: AppHandle, path: PathBuf, op: String) -> Result<String, String> {
    use base64::Engine;
    blocking(move || {
        let bytes = files::read_with_progress(&path, reporter(&app, op))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
}

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
    paths.iter().map(|path| path.exists()).collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageEntry {
    label: String,
    path: PathBuf,
}

/// Pictures in the class folders below `dir` (folder name = class), at most `limit` per class.
#[tauri::command]
async fn list_image_folder(dir: PathBuf, limit: usize, extensions: Option<Vec<String>>) -> Result<Vec<ImageEntry>, String> {
    blocking(move || {
        // Pictures unless other extensions are asked for (a folder of recordings).
        let extensions: Vec<String> = extensions.unwrap_or_else(|| ["png", "jpg", "jpeg", "bmp", "gif", "webp"].iter().map(|e| e.to_string()).collect());
        let mut out = Vec::new();
        let mut classes: Vec<PathBuf> = std::fs::read_dir(&dir).map_err(|error| error.to_string())?.flatten().map(|entry| entry.path()).filter(|path| path.is_dir()).collect();
        classes.sort();
        for class in classes {
            let label = class.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_default();
            for path in files::list_files(&class, &extensions, limit.clamp(1, 20000)) {
                out.push(ImageEntry { label: label.clone(), path });
            }
        }
        Ok(out)
    })
    .await
}

/// Files with one of `extensions` below a folder (the Test tab's "Run on a folder"), at most `limit`.
#[tauri::command]
async fn list_folder_files(dir: PathBuf, extensions: Vec<String>, limit: usize) -> Result<Vec<PathBuf>, String> {
    blocking(move || Ok(files::list_files(&dir, &extensions, limit.clamp(1, 5000)))).await
}

/// Where data files live (tests point this elsewhere).
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("MYTRAINER_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    app.path()
        .app_data_dir()
        .map_err(|error| tr!("데이터 폴더를 찾을 수 없습니다: {error}", "The data folder was not found: {error}"))
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

/// A document installed with the program (user's guide): its path in the resource folder, or in the source tree (dev).
fn document_path(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let safe = name.replace("..", "");
    let candidates = [
        app.path().resource_dir().ok().map(|dir| dir.join("docs").join(&safe)),
        Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("docs").join(&safe)),
    ];
    candidates.into_iter().flatten().find(|path| path.is_file())
}

#[tauri::command]
async fn open_document(app: AppHandle, name: String) -> Result<PathBuf, String> {
    let path = document_path(&app, &name).ok_or_else(|| tr!("문서를 찾을 수 없습니다: {name}", "The document was not found: {name}"))?;
    let shown = path.clone();
    blocking(move || files::open_with_system(&path)).await?;
    Ok(shown)
}

#[tauri::command]
async fn open_external(target: String) -> Result<(), String> {
    let lower = target.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || Path::new(&target).exists()) {
        return Err(tr!("열 수 없는 주소입니다: {target}", "This address cannot be opened: {target}"));
    }
    blocking(move || files::open_with_system(Path::new(&target))).await
}

/// The user's guide in a window of its own (label "doc-guide"): an ordinary resizable window with the
/// system title bar showing docs/<name> from the app's pages; opened again it comes to the front.
#[tauri::command]
async fn open_doc_window(app: AppHandle, name: String, title: String, dark: Option<bool>) -> Result<(), String> {
    // The title bar follows the app's theme like the page does (the page reads its colours from localStorage).
    let theme = dark.map(|dark| if dark { tauri::Theme::Dark } else { tauri::Theme::Light });
    let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '_' || *c == '-').collect();
    if !safe.ends_with(".html") {
        return Err(format!("not a document: {name}"));
    }
    static CREATING: Mutex<()> = Mutex::new(());
    let _guard = CREATING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(window) = app.get_webview_window("doc-guide") {
        let _ = window.eval(&format!("location.replace('/docs/{safe}')"));
        let _ = window.set_title(&title);
        let _ = window.set_theme(theme);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "doc-guide", WebviewUrl::App(format!("docs/{safe}").into()))
        .title(title)
        .decorations(true)
        .resizable(true)
        .inner_size(1000.0, 820.0)
        .min_inner_size(560.0, 400.0)
        .center()
        .theme(theme)
        .additional_browser_args(BROWSER_ARGS)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

// ───────────────────────── Python / PyTorch

#[tauri::command]
async fn py_detect(app: AppHandle) -> Result<python::Detection, String> {
    let data = data_dir(&app)?;
    blocking(move || python::detect(&data)).await
}

#[tauri::command]
async fn py_install_torch(app: AppHandle, base: PathBuf, variant: String) -> Result<PathBuf, String> {
    let data = data_dir(&app)?;
    blocking(move || python::install_torch(&python::app_log(&app), &data, &base, &variant)).await
}

#[tauri::command]
async fn py_install_python(app: AppHandle) -> Result<(), String> {
    let data = data_dir(&app)?;
    blocking(move || python::install_python(&python::app_log(&app), &data)).await
}

/// Python and PyTorch in one go (the first start's automatic setup): nothing when PyTorch is already there.
#[tauri::command]
async fn py_setup(app: AppHandle) -> Result<PathBuf, String> {
    let data = data_dir(&app)?;
    blocking(move || python::setup(&python::app_log(&app), &data)).await
}

/// `MyTrainer --setup-python [--lang ko|en]` (run by the Windows installer): installs Python and
/// PyTorch when there are none, printing its progress (the installer shows it), without a window.
fn setup_python_cli() -> i32 {
    let args: Vec<String> = std::env::args().collect();
    let lang = args.iter().position(|arg| arg == "--lang").and_then(|i| args.get(i + 1)).map(String::as_str).unwrap_or("ko");
    i18n::set_english(lang != "ko");
    let Some(data) = python::default_data_dir("com.shkwon.mytrainer") else {
        cli_print("the data folder was not found");
        return 1;
    };
    let _ = std::fs::create_dir_all(&data);
    let log_file = Mutex::new(std::fs::File::create(data.join("setup-python.log")).ok());
    let log = |stage: &str, text: &str| {
        cli_print(&format!("[{stage}] {text}"));
        if let Some(file) = log_file.lock().unwrap_or_else(|p| p.into_inner()).as_mut() {
            use std::io::Write;
            let _ = writeln!(file, "[{stage}] {text}");
        }
    };
    match python::setup(&log, &data) {
        Ok(_) => 0,
        Err(error) => {
            log("error", &error);
            2
        }
    }
}

/// One line on stdout. On Windows in the system code page, which is what the installer's log reads.
fn cli_print(text: &str) {
    use std::io::Write;
    let mut out = std::io::stdout().lock();
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        extern "system" {
            fn WideCharToMultiByte(page: u32, flags: u32, wide: *const u16, wide_len: i32, out: *mut u8, out_len: i32, default: *const u8, used: *mut i32) -> i32;
        }
        let wide: Vec<u16> = text.encode_utf16().collect();
        if wide.is_empty() {
            let _ = out.write_all(b"\r\n");
            return;
        }
        // SAFETY: both buffers are valid for the lengths given; the first call only measures.
        let size = unsafe { WideCharToMultiByte(0, 0, wide.as_ptr(), wide.len() as i32, std::ptr::null_mut(), 0, std::ptr::null(), std::ptr::null_mut()) };
        let mut bytes = vec![0u8; size.max(0) as usize];
        let written = unsafe { WideCharToMultiByte(0, 0, wide.as_ptr(), wide.len() as i32, bytes.as_mut_ptr(), size, std::ptr::null(), std::ptr::null_mut()) };
        bytes.truncate(written.max(0) as usize);
        bytes.extend_from_slice(b"\r\n");
        let _ = out.write_all(&bytes);
    }
    #[cfg(not(windows))]
    let _ = writeln!(out, "{text}");
    let _ = out.flush();
}

#[tauri::command]
fn py_cancel_install() {
    *python::cancel_flag().lock().unwrap_or_else(|p| p.into_inner()) = true;
}

#[tauri::command]
async fn py_run(app: AppHandle, python: PathBuf, code: String, files: Vec<python::RunFile>) -> Result<String, String> {
    let data = data_dir(&app)?;
    blocking(move || {
        let state = app.state::<python::RunState>();
        python::start_run(&app, &state, &data, &python, &code, files)
    })
    .await
}

#[tauri::command]
fn py_send(state: tauri::State<'_, python::RunState>, run: String, line: String) -> Result<(), String> {
    python::send(&state, &run, &line)
}

#[tauri::command]
fn py_stop(state: tauri::State<'_, python::RunState>, run: String) {
    python::stop(&state, &run);
}

/// The run folder of a run (the user can open it to see the script and the data).
#[tauri::command]
fn py_run_dir(app: AppHandle, run: String) -> Result<PathBuf, String> {
    Ok(data_dir(&app)?.join("runs").join(run.replace(['/', '\\', '.'], "")))
}

// ───────────────────────── popup windows

/// Opens a popup window at (x, y) logical screen pixels, or brings it back.
/// It is shown by `popup_ready` / `place_popup` once drawn, so it never flashes
/// empty. Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
async fn open_popup(app: AppHandle, kind: String, x: f64, y: f64, width: f64, height: f64, show: Option<bool>) -> Result<(), String> {
    if !POPUP_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown popup {kind}"));
    }
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
    if kind == "menu" || kind == "themes" || kind == "progress" {
        builder = builder.always_on_top(true);
    }
    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|error| error.to_string())?;
    }
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}

/// Moves (`edge` = None) or resizes the window with the mouse, from a press in the page. On Windows this asks the
/// system move / size loop directly (WM_SYSCOMMAND SC_MOVE / SC_SIZE), which starts from where the cursor is.
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

/// Sizes the calling popup and places it at (x, y) logical screen pixels, entirely on the monitor's work area;
/// with no room below it opens above `flip_y`.
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
        let _ = window.set_focus();
    }
    Ok(Placement { x: px / scale, y: py / scale })
}

#[tauri::command]
fn hide_popup(app: AppHandle, kind: String) {
    if let Some(window) = app.get_webview_window(&format!("popup-{kind}")) {
        let _ = window.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit_to("main", "popup-hidden", kind);
    }
}

#[tauri::command]
fn close_popup(app: AppHandle, kind: String) {
    if let Some(window) = app.get_webview_window(&format!("popup-{kind}")) {
        let _ = window.destroy();
    }
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

/// Serious errors (a panic anywhere in the backend) are written to crash.log and shown in the error popup.
fn install_panic_hook(app: &AppHandle) {
    let handle = app.clone();
    let log_dir = data_dir(app).ok();
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
        let _ = handle.emit_to("main", "fatal-error", FatalError { message, location, thread, backtrace, log });
        default(info);
    }));
}

/// Ends the app after the UI has handled unsaved changes.
#[tauri::command]
fn quit_app(app: AppHandle) {
    python::stop_all(&app.state::<python::RunState>());
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.destroy();
    }
    app.exit(0);
}

pub fn run() {
    if std::env::args().any(|arg| arg == "--setup-python") {
        std::process::exit(setup_python_cli());
    }
    let instance = if std::env::var_os("MYTRAINER_MULTI").is_none() { instance::register() } else { None };
    let others = instance.as_ref().map_or(0, |instance| instance.others);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .manage(python::RunState::default())
        .setup(move |app| {
            install_panic_hook(app.handle());
            {
                let state = app.state::<AppState>();
                let mut shared = lock(&state);
                shared.startup_files = files::project_files(std::env::args().skip(1));
                shared.other_instances = others;
            }
            let state_path = window_state::state_file(app.handle());
            let install_reset = state_path.as_deref().and_then(window_state::take_install_reset);
            let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app.handle(), path));
            // No system title bar: the menu bar row carries the icon, name and version and the window buttons.
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(app_title(app.package_info()))
                .decorations(false)
                .shadow(true)
                .min_inner_size(1100.0, 680.0)
                .visible(false)
                .additional_browser_args(BROWSER_ARGS);
            let builder = match install_reset {
                Some(token) => builder.initialization_script(format!("window.__MYTRAINER_INSTALL_RESET__ = {};", serde_json::to_string(&token).unwrap_or_default())),
                None => builder,
            };
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized && others == 0),
                None => builder.inner_size(1500.0, 920.0).center(),
            };
            let main = builder.build()?;
            // The page shows the window once drawn; if it never runs, the window is shown anyway.
            let unshown = main.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(15));
                if !unshown.is_visible().unwrap_or(true) {
                    let _ = unshown.show();
                }
            });
            if others > 0 {
                offset_window(&main, others);
            }
            if let Some(path) = state_path {
                window_state::track(&main, path);
            }
            // Closing the main window ends the app: popups and running Python scripts go with it.
            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    python::stop_all(&handle.state::<python::RunState>());
                    handle.exit(0);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            set_language,
            startup_files,
            instance_info,
            read_text_file,
            read_base64_file,
            write_text_file,
            write_base64_file,
            paths_exist,
            list_image_folder,
            list_folder_files,
            list_fonts,
            open_document,
            open_doc_window,
            open_external,
            py_detect,
            py_install_torch,
            py_install_python,
            py_setup,
            py_cancel_install,
            py_run,
            py_send,
            py_stop,
            py_run_dir,
            open_popup,
            popup_ready,
            window_drag,
            place_popup,
            hide_popup,
            close_popup,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyTrainer");
    drop(instance);
}

/// Cascades a later copy's window by 32 px for every other copy that runs, kept inside the work area.
fn offset_window(window: &WebviewWindow, copies: usize) {
    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else { return };
    let monitor = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let area = monitor.work_area();
    let step = (32.0 * monitor.scale_factor()).round() as i32;
    let (x, y) = instance::cascade(
        (position.x, position.y),
        (size.width, size.height),
        (area.position.x, area.position.y, area.size.width, area.size.height),
        step,
        copies,
    );
    let _ = window.set_position(PhysicalPosition::new(x, y));
}
