pub mod batch;
pub mod files;
pub mod fonts;
pub mod host;
pub mod i18n;
pub mod instance;
pub mod popout;
pub mod window_icon;
pub mod window_state;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Every webview in the process must share these (WebView2 refuses a second
/// environment with different arguments).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[derive(Default)]
struct Shared {
    /// Model files given on the command line, handed to the UI once.
    startup_files: Vec<PathBuf>,
    /// Other MySimulator copies that were running when this one started (instance.rs).
    other_instances: usize,
}

type AppState = Mutex<Shared>;

/// The running study's cancel flag (one study at a time per window).
#[derive(Default)]
struct StudyState {
    cancel: Mutex<Option<Arc<AtomicBool>>>,
}

fn lock<T>(state: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| tr!("작업 실행 실패: {error}", "The task failed: {error}"))?
}

/// "MySimulator v1.0.0" — shown in the title bar.
fn app_title(info: &tauri::PackageInfo) -> String {
    format!("MySimulator v{}", info.version)
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
    engine: &'static str,
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
        engine: "native",
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
struct IoProgress {
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
            let _ = app.emit("io-progress", IoProgress { op: op.clone(), done, total });
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

/// A binary data file (STL, WAV, XLSX, MAT, PNG …) as base64 for the File data node.
#[tauri::command]
async fn read_base64_file(path: PathBuf) -> Result<String, String> {
    use base64::Engine;
    blocking(move || {
        let bytes = std::fs::read(&path).map_err(|error| tr!("파일을 읽을 수 없습니다: {error}", "Cannot read the file: {error}"))?;
        if bytes.len() > 64 * 1024 * 1024 {
            return Err(tr!("파일이 너무 큽니다 (64 MB 까지)", "The file is too large (up to 64 MB)"));
        }
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

/// The user's guide or the tutorial in a window of its own (label "doc-guide"): docs/<name> from the app's pages,
/// so it shares the app's storage and follows its theme. Opened again it loads the page and comes to the front.
#[tauri::command]
async fn open_doc_window(app: AppHandle, name: String, title: String) -> Result<(), String> {
    let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '_' || *c == '-').collect();
    if !safe.ends_with(".html") {
        return Err(format!("not a document: {name}"));
    }
    static CREATING: Mutex<()> = Mutex::new(());
    let _guard = CREATING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(window) = app.get_webview_window("doc-guide") {
        let _ = window.eval(&format!("location.replace('/docs/{safe}')"));
        let _ = window.set_title(&title);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(&app, "doc-guide", WebviewUrl::App(format!("docs/{safe}").into()))
        .title(title)
        .decorations(true)
        .resizable(true)
        .inner_size(1040.0, 820.0)
        .min_inner_size(560.0, 400.0)
        .center()
        .additional_browser_args(BROWSER_ARGS)
        .build()
        .map_err(|error| error.to_string())?;
    window_icon::apply(&window);
    Ok(())
}

#[tauri::command]
async fn open_external(target: String) -> Result<(), String> {
    let lower = target.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || Path::new(&target).exists()) {
        return Err(tr!("열 수 없는 주소입니다: {target}", "This address cannot be opened: {target}"));
    }
    blocking(move || files::open_with_system(Path::new(&target))).await
}

// ───────────────────────── solver

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StudyProgress {
    phase: String,
    fraction: f64,
    message: String,
}

/// Runs a study natively and returns the result bytes (ARCHITECTURE.md "Result bytes") as an
/// ArrayBuffer. Progress goes to the calling window as `study-progress` events, at most every 80 ms.
#[tauri::command]
async fn run_study(window: WebviewWindow, state: tauri::State<'_, StudyState>, model: String, base_dir: Option<PathBuf>) -> Result<tauri::ipc::Response, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    *lock(&state.cancel) = Some(cancel.clone());
    let label = window.label().to_string();
    let app = window.app_handle().clone();
    let bytes = blocking(move || {
        let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
        let mut progress = |p: &sim_core::Progress| {
            if p.fraction >= 1.0 || last.elapsed().as_millis() >= 80 {
                last = std::time::Instant::now();
                let _ = app.emit_to(label.as_str(), "study-progress", StudyProgress { phase: p.phase.clone(), fraction: p.fraction, message: p.message.clone() });
            }
        };
        let cancelled = || cancel.load(Ordering::Relaxed);
        let host = host::DesktopHost { base: base_dir };
        Ok(sim_core::run(&model, &mut progress, &cancelled, &host))
    })
    .await?;
    *lock(&state.cancel) = None;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn cancel_study(state: tauri::State<'_, StudyState>) {
    if let Some(flag) = lock(&state.cancel).as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
fn validate_model(model: String) -> Vec<String> {
    sim_core::validate(&model)
}

/// The Python the Python nodes will use ("py -3", "python3" …), or null when there is none.
#[tauri::command]
async fn python_info() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| host::find_python().map(|p| p.join(" "))).await.ok().flatten()
}

/// Ends the app after the UI has handled unsaved changes.
#[tauri::command]
fn quit_app(app: AppHandle, state: tauri::State<'_, StudyState>) {
    cancel_study(state);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.destroy();
    }
    app.exit(0);
}

/// Shows the main window once the page has drawn (it is created hidden so it never flashes white).
#[tauri::command]
fn window_ready(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
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

/// Where crash.log goes (tests point this elsewhere).
fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("MYSIMULATOR_CONFIG_DIR") {
        return Some(PathBuf::from(dir));
    }
    app.path().app_data_dir().ok()
}

/// Serious errors (a panic anywhere in the backend) are written to crash.log and shown in the error dialog.
fn install_panic_hook(app: &AppHandle) {
    let handle = app.clone();
    let log_dir = data_dir(app);
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

pub fn run() {
    // `MySimulator --batch model.mysim …` runs a study without a window (batch.rs).
    if std::env::args().nth(1).is_some_and(|arg| arg == "--batch" || arg == "--help" || arg == "-h") {
        std::process::exit(batch::main(std::env::args().skip(1).collect()));
    }
    let instance = instance::register();
    let others = instance.as_ref().map_or(0, |instance| instance.others);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .manage(StudyState::default())
        .setup(move |app| {
            install_panic_hook(app.handle());
            {
                let state = app.state::<AppState>();
                let mut shared = lock(&state);
                shared.startup_files = files::model_files(std::env::args().skip(1));
                shared.other_instances = others;
            }
            let state_path = window_state::state_file(app.handle());
            let install_reset = state_path.as_deref().and_then(window_state::take_install_reset);
            let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app.handle(), path));
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(app_title(app.package_info()))
                .decorations(false)
                .shadow(true)
                .min_inner_size(1100.0, 700.0)
                .visible(false)
                .additional_browser_args(BROWSER_ARGS);
            // Dialogs and drop-down menus open as pop-out windows (popout.rs) so they can reach past this window.
            let popouts = app.handle().clone();
            let builder = builder.on_new_window(move |url, features| {
                if url.scheme() == "about" {
                    return popout::new_window(&popouts, &url, features, BROWSER_ARGS);
                }
                tauri::webview::NewWindowResponse::Deny
            });
            let builder = match install_reset {
                Some(token) => builder.initialization_script(format!("window.__MYSIMULATOR_INSTALL_RESET__ = {};", serde_json::to_string(&token).unwrap_or_default())),
                None => builder,
            };
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized && others == 0),
                None => builder.inner_size(1480.0, 900.0).center(),
            };
            let main = builder.build()?;
            window_icon::apply(&main);
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
            instance_info,
            read_text_file,
            write_text_file,
            write_base64_file,
            read_base64_file,
            paths_exist,
            list_fonts,
            open_document,
            open_doc_window,
            open_external,
            run_study,
            cancel_study,
            validate_model,
            python_info,
            window_ready,
            popout::place_popout,
            popout::hide_popout,
            popout::close_popout,
            popout::drag_popout,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running MySimulator");
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
