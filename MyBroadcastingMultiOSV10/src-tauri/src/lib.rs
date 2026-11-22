pub mod broadcast;
pub mod files;
pub mod fonts;
pub mod i18n;
pub mod instance;
pub mod printing;
pub mod remote;
pub mod viewers;
pub mod permissions;
pub mod browser_source;
pub mod accounts;
pub mod vcam;
pub mod window_state;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Every webview in the process must share these (WebView2 refuses a second
/// environment with different arguments).
/// Rendering and recording go on while the window is in the background or covered (a broadcast must not stall),
/// and media plays without a click.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --autoplay-policy=no-user-gesture-required";

/// Popup windows. Each is an OS window of its own (label `popup-<kind>`), owned
/// by the main window: it can sit outside the main window and closes with it.
/// The same list as src/platform/popups.js POPUPS.
const POPUP_KINDS: &[&str] = &[
    "settings", "about", "confirm", "error", "progress", "recent", "menu", "welcome", "color", "prompt", "print", "form", "stats", "log",
];

#[derive(Default)]
struct Shared {
    /// Scene collection files given on the command line ("Open with"), handed to the UI once.
    startup_files: Vec<PathBuf>,
    /// The document the render window lays out (PDF export, printing): taken by that window once.
    render_job: Option<RenderJob>,
    /// Other MyBroadcasting copies that were running when this one started (instance.rs).
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

/// "MyBroadcasting v1.0.0" — shown in the title bar of every window.
fn app_title(info: &tauri::PackageInfo) -> String {
    format!("MyBroadcasting v{}", info.version)
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

/// The OS print dialog for the calling window (the print window, when there is no printer list).
#[tauri::command]
fn print_window(window: WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| tr!("인쇄를 시작할 수 없습니다: {error}", "Could not start printing: {error}"))
}

/// The printers of this computer (none: the print window uses the system dialog).
#[tauri::command]
fn list_printers() -> printing::PrinterList {
    printing::printers()
}

/// Prints the calling window's pages straight to a printer, with no dialog.
#[tauri::command]
async fn print_direct(window: WebviewWindow, job: printing::PrintJob) -> Result<(), String> {
    printing::print(&window, job).await
}

/// The same pages as a PDF file.
#[tauri::command]
async fn print_pages_to_pdf(window: WebviewWindow, job: printing::PrintJob, path: String) -> Result<(), String> {
    printing::print_to_pdf(&window, job, path).await
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
    /// No other copy was running at start: this one restores the previous session and keeps it.
    first: bool,
    others: usize,
}

#[tauri::command]
fn instance_info(state: tauri::State<'_, AppState>) -> InstanceInfo {
    let others = lock(&state).other_instances;
    InstanceInfo { first: others == 0, others }
}

// ───────────────────────── broadcasting (broadcast.rs)

/// Opens a recording file for writing at positions; returns its handle.
#[tauri::command]
async fn rec_open(path: PathBuf) -> Result<u32, String> {
    blocking(move || broadcast::open_file(&path)).await
}

/// Raw body = the bytes; headers x-id (handle) and x-pos (byte offset).
#[tauri::command]
async fn rec_write(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok());
    let id = header("x-id").ok_or("x-id missing")? as u32;
    let position = header("x-pos").unwrap_or(0);
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else { return Err("raw body expected".into()) };
    let data = data.clone();
    blocking(move || broadcast::write_at(id, position, &data)).await
}

#[tauri::command]
async fn rec_close(id: u32) -> Result<(), String> {
    blocking(move || broadcast::close_file(id)).await
}

#[tauri::command]
fn list_names(dir: PathBuf) -> Vec<String> {
    broadcast::list_names(&dir)
}

/// Where FFmpeg is (the setting, next to the app, PATH, usual folders) and its version; null: none.
#[tauri::command]
async fn ffmpeg_find(app: AppHandle, custom: Option<String>) -> Result<Option<broadcast::FfmpegInfo>, String> {
    let dir = app.path().resource_dir().ok();
    blocking(move || Ok(broadcast::find_ffmpeg(custom.as_deref(), dir.as_deref()))).await
}

/// Starts FFmpeg for a stream to `url` (or with explicit `args`); returns its handle.
#[tauri::command]
async fn stream_open(app: AppHandle, ffmpeg: String, url: Option<String>, audio_codec: Option<String>, args: Option<Vec<String>>) -> Result<u32, String> {
    let args = args.unwrap_or_else(|| broadcast::stream_args(url.as_deref().unwrap_or(""), audio_codec.as_deref().unwrap_or("aac")));
    blocking(move || broadcast::start_stream(Some(app), Path::new(&ffmpeg), &args)).await
}

/// Raw body = stream bytes; header x-id.
#[tauri::command]
fn stream_write(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let id = request.headers().get("x-id").and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u32>().ok()).ok_or("x-id missing")?;
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else { return Err("raw body expected".into()) };
    broadcast::write_stream(id, data.clone())
}

#[tauri::command]
async fn stream_close(id: u32) -> Result<(), String> {
    blocking(move || { broadcast::stop_stream(id); Ok(()) }).await
}

/// Remuxes a recording (every stream copied); `metadata`: an FFmetadata file with chapters.
#[tauri::command]
async fn remux_file(ffmpeg: String, input: String, output: String, metadata: Option<String>) -> Result<(), String> {
    blocking(move || broadcast::remux(Path::new(&ffmpeg), &input, &output, metadata.as_deref())).await
}

#[tauri::command]
async fn system_stats(path: Option<PathBuf>) -> Result<broadcast::SystemStats, String> {
    blocking(move || Ok(broadcast::system_stats(path.as_deref()))).await
}

#[tauri::command]
fn foreground_title() -> String {
    broadcast::foreground_title()
}

/// The default recording folder (the user's Videos folder).
#[tauri::command]
fn videos_dir(app: AppHandle) -> Option<PathBuf> {
    app.path().video_dir().ok().or_else(|| app.path().home_dir().ok())
}

/// A projector: its own window showing the program, the preview, a scene, a source or the multiview,
/// windowed or full screen on a monitor (index into the list of monitors).
#[tauri::command]
async fn open_projector(app: AppHandle, label: String, query: String, title: String, monitor: Option<usize>, width: Option<f64>, height: Option<f64>) -> Result<(), String> {
    if !label.starts_with("projector-") {
        return Err("bad label".into());
    }
    if let Some(old) = app.get_webview_window(&label) {
        let _ = old.set_focus();
        return Ok(());
    }
    let url = format!("index.html?projector={query}");
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(title)
        .additional_browser_args(BROWSER_ARGS)
        .inner_size(width.unwrap_or(960.0), height.unwrap_or(540.0))
        .min_inner_size(160.0, 90.0)
        .resizable(true);
    if let Some(index) = monitor {
        let monitors = app.available_monitors().map_err(|e| e.to_string())?;
        if let Some(m) = monitors.get(index) {
            let scale = m.scale_factor();
            builder = builder.position(f64::from(m.position().x) / scale, f64::from(m.position().y) / scale).decorations(false).fullscreen(true);
        }
    } else {
        builder = builder.center();
    }
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

/// A media file the user chose (or a folder of them) may be read by the page through the asset protocol.
#[tauri::command]
fn allow_media(app: AppHandle, path: PathBuf) -> bool {
    let scope = app.asset_protocol_scope();
    if path.is_dir() { scope.allow_directory(&path, true).is_ok() } else { scope.allow_file(&path).is_ok() }
}

/// Remote control (WebSocket remote-control protocol 5): starts the server on `port` (0: any free one); returns the port.
#[tauri::command]
async fn remote_start(app: AppHandle, port: u16, all: Option<bool>) -> Result<u16, String> {
    blocking(move || remote::start(Some(app), port, all.unwrap_or(false))).await
}

#[tauri::command]
fn remote_send(id: u32, text: String) -> bool {
    remote::send(id, text)
}

#[tauri::command]
fn remote_stop() {
    remote::stop();
}

/// Direct viewing: the viewer page and the viewers' signalling links on `port` (0: any free one).
#[tauri::command]
async fn viewer_start(app: AppHandle, port: u16) -> Result<viewers::Started, String> {
    blocking(move || viewers::start(Some(app), port)).await
}

#[tauri::command]
fn viewer_send(id: u32, text: String) -> bool {
    viewers::send(id, text)
}

#[tauri::command]
fn viewer_stop() {
    viewers::stop();
}

/// Browser sources as real pages (Windows / WebView2): see browser_source.rs.
#[tauri::command]
fn browser_supported() -> bool {
    cfg!(windows)
}

#[tauri::command]
async fn browser_open(app: AppHandle, page: browser_source::Page) -> Result<(), String> {
    #[cfg(windows)]
    return browser_source::open(app, page).await;
    #[cfg(not(windows))]
    {
        let _ = (app, page);
        Err("unsupported".into())
    }
}

#[tauri::command]
fn browser_close(app: AppHandle, id: String) {
    #[cfg(windows)]
    browser_source::close(&app, &id);
    #[cfg(not(windows))]
    let _ = (app, id);
}

#[tauri::command]
fn browser_reload(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(windows)]
    return browser_source::reload(&app, &id);
    #[cfg(not(windows))]
    {
        let _ = (app, id);
        Err("unsupported".into())
    }
}

#[tauri::command]
fn browser_input(app: AppHandle, id: String, method: String, params: String) -> Result<(), String> {
    #[cfg(windows)]
    return browser_source::input(&app, &id, &method, &params);
    #[cfg(not(windows))]
    {
        let _ = (app, id, method, params);
        Err("unsupported".into())
    }
}

/// Account connection: an HTTPS call to a streaming service's sign-in / API host (accounts.rs).
#[tauri::command]
async fn account_request(method: String, url: String, headers: Vec<(String, String)>, form: Option<Vec<(String, String)>>, json: Option<String>) -> Result<accounts::Answer, String> {
    blocking(move || accounts::request(&method, &url, &headers, form, json)).await
}

/// Account connection: a one-shot 127.0.0.1 listener for the sign-in redirect (event "oauth-redirect").
#[tauri::command]
fn account_loopback(app: AppHandle, seconds: Option<u64>) -> Result<u16, String> {
    accounts::loopback(Some(app), seconds.unwrap_or(300))
}

/// Virtual camera device (vcam.rs): whether it is built, installed (registered) and running.
#[tauri::command]
fn vcam_status(app: AppHandle) -> vcam::Status {
    vcam::status(app.path().resource_dir().ok().as_deref())
}

/// Installs (or removes) the camera as administrator: Windows asks with its UAC prompt.
#[tauri::command]
async fn vcam_register(app: AppHandle, remove: bool) -> Result<vcam::Status, String> {
    let dir = app.path().resource_dir().ok();
    blocking(move || {
        let dll = vcam::dll_path(dir.as_deref()).ok_or("the camera DLL is missing (npm run build:vcam)")?;
        if remove {
            vcam::stop();
        }
        vcam::register(&vcam::plain(&dll), remove)?;
        Ok(vcam::status(dir.as_deref()))
    })
    .await
}

#[tauri::command]
async fn vcam_start(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    let dir = app.path().resource_dir().ok();
    blocking(move || {
        let dll = vcam::dll_path(dir.as_deref()).ok_or("the camera DLL is missing")?;
        vcam::start(&vcam::plain(&dll), width, height)
    })
    .await
}

/// One JPEG frame (raw IPC body). Returns whether some program is watching the camera.
#[tauri::command]
fn vcam_frame(request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => vcam::frame_jpeg(bytes),
        _ => Err("a frame is sent as raw bytes".into()),
    }
}

#[tauri::command]
fn vcam_stop() {
    vcam::stop();
}

/// Names of the monitors (projector menus).
#[tauri::command]
fn list_monitors(app: AppHandle) -> Vec<String> {
    app.available_monitors().map(|list| list.iter().enumerate().map(|(i, m)| format!("{}: {} {}×{}", i + 1, m.name().cloned().unwrap_or_default(), m.size().width, m.size().height)).collect()).unwrap_or_default()
}

/// What the render window lays out: the standalone HTML and what to do with it.
#[derive(Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderJob {
    /// "pdf": write `path` (Windows, WebView2) · "direct": print straight to `printer` (the print window's
    /// Print button, no dialog) · "print": show the pages and the system print dialog.
    mode: String,
    html: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    printer: String,
    #[serde(default)]
    copies: Option<i32>,
    #[serde(default)]
    width_mm: Option<f64>,
    #[serde(default)]
    height_mm: Option<f64>,
    #[serde(default)]
    page_ranges: String,
}

const RENDER_LABEL: &str = "render";

/// Opens the render window for a job (src/render.js). PDF: a window that is shown (a hidden WebView2
/// barely renders, which makes paged.js crawl) but sits off every screen, without a taskbar button.
/// Print: an ordinary window in the middle of the screen with the laid-out pages and the print dialog.
/// The window answers the main window with the event `render-done` and is closed by close_render_window.
#[tauri::command]
async fn open_render_window(app: AppHandle, state: tauri::State<'_, AppState>, job: RenderJob, dark: Option<bool>) -> Result<(), String> {
    if let Some(old) = app.get_webview_window(RENDER_LABEL) {
        let _ = old.destroy();
    }
    let print = job.mode == "print";
    let title = if job.title.is_empty() { app_title(app.package_info()) } else { job.title.clone() };
    lock(&state).render_job = Some(job);
    let mut builder = WebviewWindowBuilder::new(&app, RENDER_LABEL, WebviewUrl::App("index.html?render=1".into()))
        .title(title)
        .additional_browser_args(BROWSER_ARGS);
    builder = if print {
        builder
            .decorations(true)
            .resizable(true)
            .inner_size(980.0, 860.0)
            .min_inner_size(480.0, 360.0)
            .center()
            .theme(dark.map(|dark| if dark { tauri::Theme::Dark } else { tauri::Theme::Light }))
            .visible(false)
    } else {
        builder
            .decorations(false)
            .skip_taskbar(true)
            .focused(false)
            .position(-30000.0, -30000.0)
            .inner_size(900.0, 1000.0)
            .visible(true)
    };
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}

/// The render window takes its job (once).
#[tauri::command]
fn take_render_job(state: tauri::State<'_, AppState>) -> Option<RenderJob> {
    lock(&state).render_job.take()
}

#[tauri::command]
fn close_render_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window(RENDER_LABEL) {
        let _ = window.destroy();
    }
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

#[tauri::command]
async fn write_text_file(app: AppHandle, path: PathBuf, content: String, op: String) -> Result<(), String> {
    blocking(move || files::write_with_progress(&path, content.as_bytes(), reporter(&app, op))).await
}

/// Reads a binary file as base64 (pictures).
#[tauri::command]
async fn read_base64_file(app: AppHandle, path: PathBuf, op: String) -> Result<String, String> {
    use base64::Engine;
    blocking(move || {
        let bytes = files::read_with_progress(&path, reporter(&app, op))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
}

/// Writes binary data given as base64 (exported pictures, PDF, ZIP).
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

/// Where data files live (tests point this elsewhere).
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("MYBROADCASTING_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    app.path()
        .app_data_dir()
        .map_err(|error| tr!("데이터 폴더를 찾을 수 없습니다: {error}", "The data folder was not found: {error}"))
}

fn background_dir(app: &AppHandle) -> Result<PathBuf, String> {
    data_dir(app).map(|dir| dir.join("background"))
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

/// A document installed with the program (user's guide, tutorial): its path in
/// the resource folder, or in the source tree when running from it (dev).
fn document_path(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let safe = name.replace("..", "");
    let candidates = [
        app.path().resource_dir().ok().map(|dir| dir.join("doc").join(&safe)),
        Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("public").join("doc").join(&safe)),
    ];
    candidates.into_iter().flatten().find(|path| path.is_file())
}

/// Opens an installed document with the system's viewer (browser for HTML).
#[tauri::command]
async fn open_document(app: AppHandle, name: String) -> Result<PathBuf, String> {
    let path = document_path(&app, &name).ok_or_else(|| tr!("문서를 찾을 수 없습니다: {name}", "The document was not found: {name}"))?;
    let shown = path.clone();
    blocking(move || files::open_with_system(&path)).await?;
    Ok(shown)
}

/// Document windows (label `doc-<kind>`): the user's guide, the tutorial document and the tutorial video
/// (src/viewer.js). Each is an ordinary resizable window with the system title bar, not owned by the main
/// window (it can go behind it and has its own taskbar button); the app ends with the main window anyway.
const DOC_KINDS: &[&str] = &["guide", "tutorial", "video"];

/// The tutorial video installed with the program (docs/video/), or MYBROADCASTING_TUTORIAL_VIDEO (tests).
const TUTORIAL_VIDEO: &str = "video/MyBroadcasting-Tutorial.mp4";

/// Opens the document window of `kind`, or brings it back when it is already open. The page shows
/// it once drawn (popup_ready); its place and size are remembered (window-state.doc-<kind>.json).
#[tauri::command]
async fn open_doc_window(app: AppHandle, kind: String, title: String, width: f64, height: f64, dark: Option<bool>) -> Result<(), String> {
    if !DOC_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown document {kind}"));
    }
    static CREATING: Mutex<()> = Mutex::new(());
    let _guard = CREATING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let label = format!("doc-{kind}");
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let state_path = window_state::state_file(&app).map(|path| path.with_file_name(format!("window-state.{label}.json")));
    let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(&app, path));
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(title)
        .decorations(true)
        .resizable(true)
        .maximizable(true)
        .minimizable(true)
        .min_inner_size(640.0, 420.0)
        .theme(dark.map(|dark| if dark { tauri::Theme::Dark } else { tauri::Theme::Light }))
        .visible(false)
        .additional_browser_args(BROWSER_ARGS);
    let builder = match placement {
        Some((state, scale)) => builder
            .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
            .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
            .maximized(state.maximized),
        None => builder.inner_size(width.clamp(640.0, 4000.0), height.clamp(420.0, 3000.0)).center(),
    };
    let window = builder.build().map_err(|error| error.to_string())?;
    if let Some(path) = state_path {
        window_state::track(&window, path);
    }
    // Shown by the page once drawn; if the page never says so (a load error), shown anyway.
    let late = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        if !late.is_visible().unwrap_or(true) {
            let _ = late.show();
        }
    });
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoInfo {
    /// The video file (null: not installed / not made yet).
    path: Option<PathBuf>,
    /// Its chapter sidecar (MyBroadcasting-Tutorial.json beside it), as text.
    chapters: Option<String>,
}

/// The tutorial video for the player window: its path (now loadable through the asset protocol) and chapters.
#[tauri::command]
fn tutorial_video(app: AppHandle) -> VideoInfo {
    let path = match std::env::var_os("MYBROADCASTING_TUTORIAL_VIDEO") {
        Some(path) => Some(PathBuf::from(path)).filter(|path| path.is_file()),
        None => document_path(&app, TUTORIAL_VIDEO),
    };
    let Some(path) = path else { return VideoInfo { path: None, chapters: None } };
    let _ = app.asset_protocol_scope().allow_file(&path);
    let chapters = std::fs::read_to_string(path.with_extension("json")).ok();
    VideoInfo { path: Some(path), chapters }
}

/// Opens a web address or a file with the system (shape hyperlinks).
#[tauri::command]
async fn open_external(target: String) -> Result<(), String> {
    let lower = target.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:") || Path::new(&target).exists()) {
        return Err(tr!("열 수 없는 주소입니다: {target}", "This address cannot be opened: {target}"));
    }
    blocking(move || files::open_with_system(Path::new(&target))).await
}

/// Opens a popup window at (x, y) logical screen pixels, or brings it back.
/// It is shown by `popup_ready` / `place_popup` once drawn, so it never flashes
/// empty. Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
///
/// `delay` (ms, progress): shown from here after that long unless hidden or closed before — the page
/// does not show it itself then.
async fn open_popup(app: AppHandle, kind: String, x: f64, y: f64, width: f64, height: f64, show: Option<bool>, delay: Option<u64>) -> Result<(), String> {
    let delay = delay.unwrap_or(0);
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
        if show.unwrap_or(true) && kind != "menu" && delay > 0 {
            show_later(&app, &kind, delay);
        } else if show.unwrap_or(true) && kind != "menu" {
            bump_show_seq(&kind);
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
    if kind == "menu" || kind == "progress" {
        builder = builder.always_on_top(true);
    }
    // A menu holds its open submenus as panels side by side (popup.js): the window is transparent
    // and each panel draws its own shadow. macOS needs Tauri's private API for that and keeps an
    // opaque window.
    #[cfg(not(target_os = "macos"))]
    if kind == "menu" {
        builder = builder.transparent(true).shadow(false);
    }
    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|error| error.to_string())?;
    }
    builder.build().map_err(|error| error.to_string())?;
    if show.unwrap_or(true) && delay > 0 {
        show_later(&app, &kind, delay);
    }
    Ok(())
}

/// Per popup kind: a number that changes whenever the popup is shown, hidden or closed — a delayed
/// show started before that belongs to a job that has ended and is dropped.
static SHOW_SEQ: Mutex<Option<std::collections::HashMap<String, u64>>> = Mutex::new(None);

fn bump_show_seq(kind: &str) -> u64 {
    let mut guard = SHOW_SEQ.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let map = guard.get_or_insert_with(Default::default);
    let next = map.get(kind).copied().unwrap_or(0) + 1;
    map.insert(kind.to_string(), next);
    next
}

fn show_seq(kind: &str) -> u64 {
    let guard = SHOW_SEQ.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.as_ref().and_then(|map| map.get(kind).copied()).unwrap_or(0)
}

/// Shows the popup `kind` after `delay` ms unless it is shown, hidden or closed before. The timer
/// runs here, not in the page: a long computation holds the main window's page, and a timer there
/// would only fire once it is over.
fn show_later(app: &AppHandle, kind: &str, delay: u64) {
    let seq = bump_show_seq(kind);
    let app = app.clone();
    let kind = kind.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(delay));
        if show_seq(&kind) != seq {
            return;
        }
        if let Some(window) = app.get_webview_window(&format!("popup-{kind}")) {
            let _ = window.show();
            let _ = window.unminimize();
        }
    });
}

/// Moves (`edge` = None) or resizes the window with the mouse, from a press in the page (the menu bar's
/// empty area, the resize grip). On Windows this asks the system move / size loop directly
/// (WM_SYSCOMMAND SC_MOVE / SC_SIZE): the loop then starts from where the cursor is. (tao's
/// start_dragging posts WM_NCLBUTTONDOWN with a wrong cursor position, so the window jumped
/// when the drag began and a resize from the grip often did not start.)
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
        // SC_MOVE | HTCAPTION and SC_SIZE | WMSZ_*: the "mouse" variants of the commands.
        let command = match edge.as_deref() {
            None => 0xF012,
            Some("West") => 0xF001,
            Some("East") => 0xF002,
            Some("North") => 0xF003,
            Some("NorthWest") => 0xF004,
            Some("NorthEast") => 0xF005,
            Some("South") => 0xF006,
            Some("SouthWest") => 0xF007,
            Some(_) => 0xF008, // SouthEast
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
        // Not re-exported by tauri: the runtime crate (macOS / Linux only, see Cargo.toml).
        use tauri_runtime::ResizeDirection;
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
        window.as_ref().window().start_resize_dragging(direction).map_err(|error| error.to_string())
    }
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
        let _ = window.set_focus();
    }
    Ok(Placement { x: px / scale, y: py / scale })
}

/// Hides a popup but keeps it for the next time (menus open instantly that way).
#[tauri::command]
fn hide_popup(app: AppHandle, kind: String) {
    bump_show_seq(&kind);
    if let Some(window) = app.get_webview_window(&format!("popup-{kind}")) {
        let _ = window.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit_to("main", "popup-hidden", kind);
    }
}

#[tauri::command]
fn close_popup(app: AppHandle, kind: String) {
    bump_show_seq(&kind);
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

/// Serious errors (a panic anywhere in the backend) are written to crash.log
/// and shown to the user in the error popup with every detail, ready to copy.
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

/// Test hook for the serious-error popup (only with MYBROADCASTING_TEST_COMMANDS set).
#[tauri::command]
async fn raise_test_panic() -> Result<(), String> {
    if std::env::var_os("MYBROADCASTING_TEST_COMMANDS").is_none() {
        return Err("not available".into());
    }
    tauri::async_runtime::spawn(async { panic!("test panic: serious error raised on purpose") });
    Ok(())
}

/// Ends the app after the UI has handled unsaved changes.
#[tauri::command]
fn quit_app(app: AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.destroy();
    }
    app.exit(0);
}

pub fn run() {
    // Any number of copies may run; each opens its own window. Only the first one restores the
    // previous session, and later ones open their window offset (instance.rs).
    // MYBROADCASTING_MULTI=1 (the E2E harness, npm start) skips the counting: every copy acts as the first.
    let instance = if std::env::var_os("MYBROADCASTING_MULTI").is_none() { instance::register() } else { None };
    let others = instance.as_ref().map_or(0, |instance| instance.others);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::default())
        .setup(move |app| {
            install_panic_hook(app.handle());
            {
                let state = app.state::<AppState>();
                let mut shared = lock(&state);
                shared.startup_files = files::collection_files(std::env::args().skip(1));
                shared.other_instances = others;
            }
            if let Ok(dir) = background_dir(app.handle()) {
                let _ = app.asset_protocol_scope().allow_directory(&dir, true);
            }
            let state_path = window_state::state_file(app.handle());
            // First start after the installer: forget the window place, and have the page reset its preferences.
            let install_reset = state_path.as_deref().and_then(window_state::take_install_reset);
            // ...and open in the language chosen in the installer.
            let install_language = state_path.as_deref().and_then(window_state::take_install_language);
            let placement = state_path.as_deref().and_then(|path| window_state::saved_placement(app.handle(), path));
            // No system title bar: the menu bar row carries the icon, name and version (left) and the
            // minimize / maximize / close buttons (right), and is the drag area (src/app.js renderMenubar).
            // The title is still set for the taskbar and Alt+Tab.
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(app_title(app.package_info()))
                .decorations(false)
                .shadow(true)
                .min_inner_size(900.0, 600.0)
                .visible(false)
                .additional_browser_args(BROWSER_ARGS);
            let builder = match install_reset {
                Some(token) => builder.initialization_script(format!("window.__MYBROADCASTING_INSTALL_RESET__ = {};", serde_json::to_string(&token).unwrap_or_default())),
                None => builder,
            };
            let builder = match install_language {
                Some(language) => builder.initialization_script(format!("window.__MYBROADCASTING_INSTALL_LANGUAGE__ = '{language}';")),
                None => builder,
            };
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    // A later copy opens beside the first, not maximized over it.
                    .maximized(state.maximized && others == 0),
                None => builder.inner_size(1440.0, 900.0).center(),
            };
            let main = builder.build()?;
            // The microphone and camera sources: no WebView2 prompt at every start for the app's own page.
            permissions::allow_media(&main);
            // The page shows the window once it has drawn itself (src/app.js start). If it never runs
            // (a program built without its page, a broken WebView2), the window is shown anyway:
            // otherwise every start leaves one more invisible process behind.
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
            // Closing the main window ends the app: the popups and the document windows go with it.
            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    handle.exit(0);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            print_window,
            list_printers,
            print_direct,
            print_pages_to_pdf,
            app_info,
            set_language,
            startup_files,
            instance_info,
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
            open_document,
            open_doc_window,
            tutorial_video,
            open_external,
            open_popup,
            popup_ready,
            window_drag,
            place_popup,
            hide_popup,
            close_popup,
            quit_app,
            raise_test_panic,
            rec_open,
            rec_write,
            rec_close,
            list_names,
            ffmpeg_find,
            stream_open,
            stream_write,
            stream_close,
            remux_file,
            system_stats,
            foreground_title,
            videos_dir,
            open_projector,
            list_monitors,
            allow_media,
            remote_start,
            remote_send,
            remote_stop,
            viewer_start,
            viewer_send,
            viewer_stop,
            browser_supported,
            browser_open,
            browser_close,
            browser_reload,
            browser_input,
            account_request,
            account_loopback,
            vcam_status,
            vcam_register,
            vcam_start,
            vcam_frame,
            vcam_stop,
            open_render_window,
            take_render_job,
            close_render_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while running MyBroadcasting")
        .run(|_app, _event| {});
    drop(instance);
}

/// Cascades a later copy's window by 32 px for every other copy that runs, kept inside the work area
/// of its monitor (the window is still hidden; the page shows it).
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
