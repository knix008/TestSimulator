mod core;
mod files;
mod i18n;
pub mod printing;
mod window_state;

use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

static QUITTING: AtomicBool = AtomicBool::new(false);
static QUIT_ITEM: Mutex<Option<MenuItem<tauri::Wry>>> = Mutex::new(None);

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
    tauri: &'static str,
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
        tauri: tauri::VERSION,
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

/// The language chosen in the installer, read once (the installer's marker is removed when read), as
/// "ko" or "en" with a token so each window applies it only once.
static INSTALL_LANGUAGE: std::sync::OnceLock<Option<(String, String)>> = std::sync::OnceLock::new();

fn install_language(app: &tauri::AppHandle) -> Option<(String, String)> {
    INSTALL_LANGUAGE
        .get_or_init(|| {
            let path = window_state::state_file(app)?;
            let language = window_state::take_install_language(&path)?;
            // The program's own words (tray menu, dialogs) follow it straight away.
            i18n::set_english(language == "en");
            let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|time| time.as_millis()).unwrap_or(0);
            Some((language.to_string(), format!("{language}-{stamp}")))
        })
        .clone()
}

/// The script that tells a window the installer's language (none when there is no new one).
fn install_language_script(app: &tauri::AppHandle) -> Option<String> {
    install_language(app).map(|(language, token)| format!("window.__MYWORKFORCE_INSTALL_LANGUAGE__ = '{language}'; window.__MYWORKFORCE_INSTALL_LANGUAGE_TOKEN__ = '{token}';"))
}

#[tauri::command]
fn set_language(language: String) {
    i18n::set_english(language == "en");
    if let Ok(guard) = QUIT_ITEM.lock() {
        if let Some(item) = guard.as_ref() {
            let _ = item.set_text(if i18n::english() { "Quit" } else { "종료" });
        }
    }
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

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| tr!("작업 실행 실패: {error}", "The task failed: {error}"))?
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(Ok(value)) = text.get(i + 1..i + 3).map(|hex| u8::from_str_radix(hex, 16)) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Writes the raw request body (an exported Word, Excel or PDF file, or a picture) to the file named in the
/// URI-encoded `path` header. Raw bytes over the IPC: no base64.
#[tauri::command]
async fn write_binary_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(tr!("데이터 형식이 잘못되었습니다", "The data has the wrong form"));
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
        .ok_or_else(|| tr!("파일 경로가 없습니다", "No file path"))?;
    let bytes = bytes.clone();
    blocking(move || files::write_text(std::path::Path::new(&path), &bytes)).await
}

/// Encodes RGBA pixels (the raw request body; `width`, `height` and `quality` headers) as an AVIF file.
/// The web view cannot write AVIF itself (Chromium has no AV1 encoder), so ravif does it here.
#[tauri::command]
async fn encode_avif(request: tauri::ipc::Request<'_>) -> Result<tauri::ipc::Response, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(tr!("데이터 형식이 잘못되었습니다", "The data has the wrong form"));
    };
    let number = |name: &str| request.headers().get(name).and_then(|value| value.to_str().ok()).and_then(|value| value.parse::<usize>().ok());
    let (width, height) = (number("width").unwrap_or(0), number("height").unwrap_or(0));
    let quality = number("quality").unwrap_or(80).clamp(1, 100) as f32;
    if width == 0 || height == 0 || bytes.len() != width * height * 4 {
        return Err(tr!("그림 크기가 맞지 않습니다", "The picture size does not match its pixels"));
    }
    let pixels: Vec<ravif::RGBA8> = bytes.chunks_exact(4).map(|p| ravif::RGBA8::new(p[0], p[1], p[2], p[3])).collect();
    let encoded = blocking(move || {
        ravif::Encoder::new()
            .with_quality(quality)
            .with_alpha_quality(quality)
            .with_speed(6)
            .encode_rgba(ravif::Img::new(&pixels[..], width, height))
            .map(|image| image.avif_file)
            .map_err(|error| tr!("AVIF로 저장할 수 없습니다: {error}", "Could not write AVIF: {error}"))
    })
    .await?;
    Ok(tauri::ipc::Response::new(encoded))
}

fn quit_all(app: &tauri::AppHandle) {
    if QUITTING.swap(true, Ordering::SeqCst) {
        return;
    }
    // app.exit closes every window itself. Destroying them one by one from inside a window's close event could
    // stall on Windows, leaving the program running after its close button.
    core::stop();
    app.exit(0);
}

/// The main window's close ends the program. The chat window's close ends it only when the chat window is the
/// program's only window (started from its own shortcut); with the main window open it closes just itself.
fn bind_close(window: &tauri::WebviewWindow) {
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if QUITTING.load(Ordering::SeqCst) {
                return;
            }
            if label == "talk" && app.get_webview_window("main").is_some() {
                return;
            }
            api.prevent_close();
            quit_all(&app);
        }
    });
}

fn open_talk_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("talk") {
        let _ = window.unminimize();
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let title = tr!("MyWorkForce 대화방 v{}", "MyWorkForce Chatting v{}", app.package_info().version);
    let builder = WebviewWindowBuilder::new(app, "talk", WebviewUrl::App("chat.html".into()))
        .title(title)
        // A messenger-sized window (the user asked for a narrow one).
        .inner_size(420.0, 700.0)
        .min_inner_size(320.0, 420.0)
        .center();
    let builder = match install_language_script(app) {
        Some(script) => builder.initialization_script(script),
        None => builder,
    };
    let window = builder
        .build()
        .map_err(|error| error.to_string())?;
    bind_close(&window);
    Ok(())
}

fn open_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let state_path = window_state::state_file(app);
    let install_reset = state_path.as_deref().and_then(window_state::take_install_reset);
    let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app, path));
    let title = format!("MyWorkForce v{}", app.package_info().version);
    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title(title)
        .decorations(false)
        .shadow(true)
        .min_inner_size(1100.0, 640.0)
        // Files dropped on a page (or a .mwf on the window) go to the page itself, not to Tauri.
        .disable_drag_drop_handler()
        .visible(false);
    let builder = match install_reset {
        Some(token) => builder.initialization_script(format!(
            "window.__MYWORKFORCE_INSTALL_RESET__ = {};",
            serde_json::to_string(&token).unwrap_or_default()
        )),
        None => builder,
    };
    let builder = match install_language_script(app) {
        Some(script) => builder.initialization_script(script),
        None => builder,
    };
    let builder = match placement {
        Some((state, scale)) => builder
            .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
            .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
            .maximized(state.maximized),
        None => builder.inner_size(1440.0, 900.0).center(),
    };
    let main = builder.build().map_err(|error| error.to_string())?;
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
    bind_close(&main);
    Ok(())
}

fn install_tray(app: &tauri::AppHandle) -> Result<(), String> {
    if app.tray_by_id("myworkforce").is_some() {
        return Ok(());
    }
    let show_main = MenuItem::with_id(app, "show-main", "MyWorkForce", true, None::<&str>).map_err(|error| error.to_string())?;
    let show_talk = MenuItem::with_id(app, "show-talk", if i18n::english() { "MyWorkForce Chatting" } else { "MyWorkForce 대화방" }, true, None::<&str>).map_err(|error| error.to_string())?;
    let quit = MenuItem::with_id(app, "quit", if i18n::english() { "Quit" } else { "종료" }, true, None::<&str>).map_err(|error| error.to_string())?;
    if let Ok(mut guard) = QUIT_ITEM.lock() {
        *guard = Some(quit.clone());
    }
    let menu = Menu::with_items(app, &[&show_main, &show_talk, &quit]).map_err(|error| error.to_string())?;
    let mut builder = TrayIconBuilder::with_id("myworkforce")
        .tooltip("MyWorkForce")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-main" => { let _ = open_main_window(app); }
            "show-talk" => { let _ = open_talk_window(app); }
            "quit" => quit_all(app),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_browser(url: String) -> Result<(), String> {
    let allowed = (url.starts_with("https://") || url.starts_with("http://"))
        && url.chars().all(|ch| !ch.is_whitespace() && !ch.is_control() && ch != '"' && ch != '\'');
    if !allowed {
        return Err("blocked".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Document windows (label `doc-<kind>`): the user's guide, the tutorial document and the WQL guide.
/// Each is an ordinary window with the system title bar and its own taskbar button, not owned by the main
/// window; its place and size are remembered (window-state.doc-<kind>.json).
const DOC_KINDS: &[&str] = &["guide", "tutorial", "wql"];

/// Async: on Windows a window created from a synchronous command can deadlock WebView2 (a blank window).
#[tauri::command]
async fn open_doc_window(app: tauri::AppHandle, kind: String, lang: String, title: String) -> Result<(), String> {
    if !DOC_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown document {kind}"));
    }
    let label = format!("doc-{kind}");
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let lang = if lang == "en" { "en" } else { "ko" };
    let state_path = window_state::state_file(&app).map(|path| path.with_file_name(format!("window-state.{label}.json")));
    let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(&app, path));
    let url = WebviewUrl::App(format!("index.html?viewer={kind}&lang={lang}").into());
    let builder = WebviewWindowBuilder::new(&app, &label, url)
        .title(title)
        .resizable(true)
        .min_inner_size(640.0, 420.0);
    let builder = match placement {
        Some((state, scale)) => builder
            .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
            .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
            .maximized(state.maximized),
        None => builder.inner_size(1180.0, 820.0).center(),
    };
    let window = builder.build().map_err(|error| error.to_string())?;
    if let Some(path) = state_path {
        window_state::track(&window, path);
    }
    Ok(())
}

/// Tool windows (label `tool-<kind>`): printing, settings and the program information. Each is an ordinary
/// window of its own (system title bar, taskbar button), not a dialog inside the main window; its place and
/// size are remembered (window-state.tool-<kind>.json). The page is index.html?tool=<kind>.
const TOOL_KINDS: &[(&str, f64, f64, f64, f64, bool)] = &[
    // kind, width, height, min width, min height, resizable
    ("print", 1240.0, 860.0, 980.0, 640.0, true),
    ("settings", 1120.0, 820.0, 760.0, 540.0, true),
    ("about", 600.0, 640.0, 600.0, 640.0, false),
];

/// Async for the same reason as open_doc_window.
#[tauri::command]
async fn open_tool_window(app: tauri::AppHandle, kind: String, lang: String, title: String) -> Result<(), String> {
    let Some(&(_, width, height, min_width, min_height, resizable)) = TOOL_KINDS.iter().find(|item| item.0 == kind) else {
        return Err(format!("unknown window {kind}"));
    };
    let label = format!("tool-{kind}");
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    let lang = if lang == "en" { "en" } else { "ko" };
    let state_path = window_state::state_file(&app).map(|path| path.with_file_name(format!("window-state.{label}.json")));
    let placement = if resizable { state_path.as_deref().and_then(|path| window_state::saved_placement(&app, path)) } else { None };
    let url = WebviewUrl::App(format!("index.html?tool={kind}&lang={lang}").into());
    let mut builder = WebviewWindowBuilder::new(&app, &label, url)
        .title(title)
        .resizable(resizable)
        .min_inner_size(min_width, min_height);
    if let Some(script) = install_language_script(&app) {
        builder = builder.initialization_script(&script);
    }
    let builder = match placement {
        Some((state, scale)) => builder
            .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
            .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
            .maximized(state.maximized),
        None => builder.inner_size(width, height).center(),
    };
    let window = builder.build().map_err(|error| error.to_string())?;
    if let (Some(path), true) = (state_path, resizable) {
        window_state::track(&window, path);
    }
    Ok(())
}

/// The system print dialog for the calling window (when the printers cannot be listed).
#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| tr!("인쇄를 시작할 수 없습니다: {error}", "Could not start printing: {error}"))
}

/// The printers of this computer (none on other systems: the print window uses the system dialog).
#[tauri::command]
fn list_printers() -> printing::PrinterList {
    printing::printers()
}

/// Prints the calling window's pages straight to the chosen printer, with no dialog.
#[tauri::command]
async fn print_direct(window: tauri::WebviewWindow, job: printing::PrintJob) -> Result<(), String> {
    printing::print(&window, job).await
}

/// The same pages saved as a PDF file.
#[tauri::command]
async fn print_pages_to_pdf(window: tauri::WebviewWindow, job: printing::PrintJob, path: String) -> Result<(), String> {
    printing::print_to_pdf(&window, job, path).await
}

#[tauri::command]
async fn open_talk(app: tauri::AppHandle) -> Result<(), String> {
    open_talk_window(&app)
}

#[tauri::command]
async fn open_main(app: tauri::AppHandle) -> Result<(), String> {
    open_main_window(&app)
}

#[tauri::command]
fn set_talk_autostart(enabled: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let mut builder = auto_launch::AutoLaunchBuilder::new();
    builder.set_app_name("MyWorkForce Talk");
    builder.set_app_path(&exe.display().to_string());
    builder.set_args(&["--talk"]);
    #[cfg(target_os = "windows")]
    builder.set_windows_enable_mode(auto_launch::WindowsEnableMode::CurrentUser);
    #[cfg(target_os = "macos")]
    builder.set_macos_launch_mode(auto_launch::MacosLaunchMode::LaunchAgent);
    let launch = builder.build().map_err(|error| error.to_string())?;
    if enabled {
        launch.enable().map_err(|error| error.to_string())?;
    } else if launch.is_enabled().unwrap_or(false) {
        launch.disable().map_err(|error| error.to_string())?;
    }
    Ok(())
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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|arg| arg == "--talk") {
                let _ = open_talk_window(app);
            } else {
                let _ = open_main_window(app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(Mutex::new(AppState { startup_files: Vec::new() }))
        .setup(|app| {
            {
                let state = app.state::<Mutex<AppState>>();
                state.lock().expect("startup files").startup_files = files::startup_paths(std::env::args().skip(1));
            }
            // The installer's language first: the windows and the tray menu all start in it.
            let _ = install_language(app.handle());
            let talk_only = std::env::args().any(|arg| arg == "--talk");
            if talk_only {
                open_talk_window(app.handle())?;
            } else {
                open_main_window(app.handle())?;
            }
            install_tray(app.handle())?;
            // The data service the windows sign in to (port 1481). Its database lives in the app data folder.
            let resources = app.path().resource_dir().ok();
            // MYWORKFORCE_CONFIG_DIR (tests) keeps a test run away from the real data, as it does for the window state.
            let data_root = std::env::var_os("MYWORKFORCE_CONFIG_DIR").map(std::path::PathBuf::from).map(Ok).unwrap_or_else(|| app.path().app_data_dir());
            match data_root {
                Ok(dir) => {
                    if let Err(error) = core::start(resources, &dir.join("data")) {
                        eprintln!("[data service] {error}");
                    }
                }
                Err(error) => eprintln!("[data service] {error}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info, set_language, startup_files, read_text_file, write_text_file, write_binary_file, encode_avif, workspace_file, open_talk, open_main, open_doc_window, open_tool_window, print_window, list_printers, print_direct, print_pages_to_pdf, open_browser, set_talk_autostart])
        .build(tauri::generate_context!())
        .expect("error while building MyWorkForce")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                core::stop();
            }
        });
}
