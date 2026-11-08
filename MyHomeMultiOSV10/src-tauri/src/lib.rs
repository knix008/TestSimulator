pub mod files;
pub mod fonts;
pub mod i18n;
pub mod instance;
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
const POPUP_KINDS: &[&str] = &["settings", "about", "confirm", "error", "progress", "recent", "menu", "theme", "welcome", "prompt", "design", "template", "publish"];

#[derive(Default)]
struct Shared {
    /// Project files given on the command line, handed to the UI once.
    startup_files: Vec<PathBuf>,
    /// Other MyHomeMaker copies that were running when this one started (instance.rs).
    other_instances: usize,
    /// The smallest client size that shows the whole toolbar (logical pixels; the page measures it).
    min_size: (f64, f64),
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

/// "MyHomeMaker v1.0.0" — shown in the title bar of every window.
fn app_title(info: &tauri::PackageInfo) -> String {
    format!("MyHomeMaker v{}", info.version)
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
    /// No other copy was running at start: this one restores the previous session and keeps it.
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
    if let Some(dir) = std::env::var_os("MYHOMEMAKER_DATA_DIR") {
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
    let safe = safe_document_name(name);
    let candidates = [
        app.path().resource_dir().ok().map(|dir| dir.join("docs").join(&safe)),
        Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("public").join("docs").join(&safe)),
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
const DOC_KINDS: &[&str] = &["guide", "tutorial"];

/// The tutorial video installed with the program (docs/video/), or MYHOMEMAKER_TUTORIAL_VIDEO (tests).
const TUTORIAL_VIDEO: &str = "video/MyHomeMaker-Tutorial.mp4";

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
    /// Its chapter sidecar (MyHomeMaker-Tutorial.json beside it), as text.
    chapters: Option<String>,
}

/// The tutorial video for the player window: its path (now loadable through the asset protocol) and chapters.
#[tauri::command]
fn tutorial_video(app: AppHandle) -> VideoInfo {
    let path = match std::env::var_os("MYHOMEMAKER_TUTORIAL_VIDEO") {
        Some(path) => Some(PathBuf::from(path)).filter(|path| path.is_file()),
        None => document_path(&app, TUTORIAL_VIDEO),
    };
    let Some(path) = path else { return VideoInfo { path: None, chapters: None } };
    let _ = app.asset_protocol_scope().allow_file(&path);
    let chapters = std::fs::read_to_string(path.with_extension("json")).ok();
    VideoInfo { path: Some(path), chapters }
}

/// Opens a web address, a file or a folder with the system (published site, its folder).
#[tauri::command]
async fn open_external(target: String) -> Result<(), String> {
    let lower = target.to_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:") || Path::new(&target).exists()) {
        return Err(tr!("열 수 없는 주소입니다: {target}", "This address cannot be opened: {target}"));
    }
    blocking(move || files::open_with_system(Path::new(&target))).await
}

/// Writes a published site into `dir` (Publish › Folder); returns how many files were written.
#[tauri::command]
async fn write_site_files(app: AppHandle, dir: PathBuf, files: Vec<files::SiteFile>, op: String) -> Result<usize, String> {
    blocking(move || files::write_site(&dir, &files, reporter(&app, op))).await
}

/// The preview folder of this run (a fresh one each time the preview opens).
fn preview_dir() -> PathBuf {
    std::env::temp_dir().join(format!("myhomemaker-preview-{}", std::process::id()))
}

/// Preview in browser: the site written to a temporary folder, `page` opened with the system browser.
#[tauri::command]
async fn preview_site(files: Vec<files::SiteFile>, page: String) -> Result<PathBuf, String> {
    blocking(move || {
        let dir = preview_dir();
        let _ = std::fs::remove_dir_all(&dir);
        files::write_site(&dir, &files, |_, _| {})?;
        let target = dir.join(files::safe_relative(&page).unwrap_or_else(|| PathBuf::from("index.html")));
        files::open_with_system(&target)?;
        Ok(target)
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
    Ok(())
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

/// The page measured the toolbar: the window may not get narrower than this. Never more than the
/// monitor's work area (a minimum wider than the screen would leave the window unresizable).
#[tauri::command]
fn window_min_size(window: WebviewWindow, state: tauri::State<'_, AppState>, width: f64, height: f64) -> f64 {
    let area = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let scale = m.scale_factor();
            (f64::from(m.work_area().size.width) / scale, f64::from(m.work_area().size.height) / scale)
        })
        .unwrap_or((f64::MAX, f64::MAX));
    let (min_width, min_height) = minimum_for(width, height, area);
    lock(&state).min_size = (min_width, min_height);
    // The OS minimum binds the outer rect, which on a frameless window carries invisible resize
    // borders: without them an edge drag stopped short of the toolbar's width.
    let (extra_w, extra_h) = frame_extra(&window);
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(min_width + extra_w, min_height + extra_h)));
    if let (Ok(scale), Ok(size)) = (window.scale_factor(), window.inner_size()) {
        let size = size.to_logical::<f64>(scale);
        if size.width + 0.5 < min_width || size.height + 0.5 < min_height {
            let _ = window.set_size(tauri::LogicalSize::new(size.width.max(min_width), size.height.max(min_height)));
        }
    }
    min_width
}

/// How much larger the outer rect is than the client area, in logical pixels.
fn frame_extra(window: &WebviewWindow) -> (f64, f64) {
    let (Ok(scale), Ok(outer), Ok(inner)) = (window.scale_factor(), window.outer_size(), window.inner_size()) else {
        return (0.0, 0.0);
    };
    let outer = outer.to_logical::<f64>(scale);
    let inner = inner.to_logical::<f64>(scale);
    ((outer.width - inner.width).max(0.0), (outer.height - inner.height).max(0.0))
}

/// Puts the window back to its minimum when something other than an edge drag made it smaller
/// (Windows Snap, SetWindowPos from other programs): the toolbar's last buttons were cut off.
fn keep_minimum(window: &WebviewWindow) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let (min_width, min_height) = lock(&window.state::<AppState>()).min_size;
    if min_width <= 0.0 {
        return;
    }
    let (Ok(scale), Ok(size)) = (window.scale_factor(), window.inner_size()) else { return };
    let size = size.to_logical::<f64>(scale);
    if let Some((w, h)) = grown_to_minimum((size.width, size.height), (min_width, min_height)) {
        let _ = window.set_size(tauri::LogicalSize::new(w, h));
    }
}

/// The window minimum from the page's measure: at least 800 × 480, at most the work area.
fn minimum_for(width: f64, height: f64, area: (f64, f64)) -> (f64, f64) {
    (width.ceil().max(800.0).min(area.0), height.ceil().max(480.0).min(area.1))
}

/// The size a window must grow to when it is below its minimum (None: it is large enough).
fn grown_to_minimum(size: (f64, f64), min: (f64, f64)) -> Option<(f64, f64)> {
    (size.0 + 0.5 < min.0 || size.1 + 0.5 < min.1).then(|| (size.0.max(min.0), size.1.max(min.1)))
}

/// A document name without ways out of the docs folder.
fn safe_document_name(name: &str) -> String {
    name.replace("..", "")
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

/// Test hook for the serious-error popup (only with MYHOMEMAKER_TEST_COMMANDS set).
#[tauri::command]
async fn raise_test_panic() -> Result<(), String> {
    if std::env::var_os("MYHOMEMAKER_TEST_COMMANDS").is_none() {
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
    // MYHOMEMAKER_MULTI=1 (the E2E harness, npm start) skips the counting: every copy acts as the first.
    let instance = if std::env::var_os("MYHOMEMAKER_MULTI").is_none() { instance::register() } else { None };
    let others = instance.as_ref().map_or(0, |instance| instance.others);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(move |app| {
            install_panic_hook(app.handle());
            {
                let state = app.state::<AppState>();
                let mut shared = lock(&state);
                shared.startup_files = files::site_files(std::env::args().skip(1));
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
                .min_inner_size(1100.0, 640.0)
                .visible(false)
                .additional_browser_args(BROWSER_ARGS);
            let builder = match install_reset {
                Some(token) => builder.initialization_script(format!("window.__MYHOMEMAKER_INSTALL_RESET__ = {};", serde_json::to_string(&token).unwrap_or_default())),
                None => builder,
            };
            let builder = match install_language {
                Some(language) => builder.initialization_script(format!("window.__MYHOMEMAKER_INSTALL_LANGUAGE__ = '{language}';")),
                None => builder,
            };
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    // A later copy opens beside the first, not maximized over it.
                    .maximized(state.maximized && others == 0),
                None => builder.inner_size(1480.0, 900.0).center(),
            };
            let main = builder.build()?;
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
            let sized = main.clone();
            main.on_window_event(move |event| match event {
                tauri::WindowEvent::Destroyed => handle.exit(0),
                tauri::WindowEvent::Resized(_) => keep_minimum(&sized),
                _ => {}
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
            write_site_files,
            preview_site,
            open_popup,
            popup_ready,
            window_drag,
            window_min_size,
            place_popup,
            hide_popup,
            close_popup,
            quit_app,
            raise_test_panic
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyHomeMaker");
    let _ = std::fs::remove_dir_all(preview_dir());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_popup_of_the_page_is_known_to_the_backend() {
        let source = std::fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/platform/popups.js")).unwrap();
        let start = source.find("export const POPUPS = {").unwrap();
        let body = &source[start..source[start..].find("};").unwrap() + start];
        let kinds: Vec<&str> = body.lines().filter_map(|line| line.trim().split(':').next()).filter(|k| !k.is_empty() && !k.contains(' ')).collect();
        assert!(kinds.len() >= 10, "{kinds:?}");
        for kind in &kinds {
            assert!(POPUP_KINDS.contains(kind), "popup {kind} is missing in POPUP_KINDS");
        }
        assert_eq!(kinds.len(), POPUP_KINDS.len());
    }

    #[test]
    fn the_window_minimum_stays_between_the_floor_and_the_screen() {
        assert_eq!(minimum_for(1234.2, 300.0, (1920.0, 1040.0)), (1235.0, 480.0));
        assert_eq!(minimum_for(500.0, 900.0, (1920.0, 1040.0)), (800.0, 900.0));
        assert_eq!(minimum_for(2500.0, 2000.0, (1366.0, 728.0)), (1366.0, 728.0));
    }

    #[test]
    fn a_window_below_its_minimum_grows_back() {
        assert_eq!(grown_to_minimum((700.0, 500.0), (1240.0, 640.0)), Some((1240.0, 640.0)));
        assert_eq!(grown_to_minimum((1500.0, 500.0), (1240.0, 640.0)), Some((1500.0, 640.0)));
        assert_eq!(grown_to_minimum((1240.2, 640.0), (1240.0, 640.0)), None);
    }

    #[test]
    fn document_names_cannot_leave_the_docs_folder() {
        assert_eq!(safe_document_name("../../secret.txt"), "//secret.txt");
        assert_eq!(safe_document_name("UsersGuide.en.html"), "UsersGuide.en.html");
        assert!(DOC_KINDS.contains(&"guide") && DOC_KINDS.contains(&"tutorial"));
    }

    #[test]
    fn the_preview_folder_belongs_to_this_run() {
        let dir = preview_dir();
        assert!(dir.starts_with(std::env::temp_dir()));
        assert!(dir.to_string_lossy().ends_with(&std::process::id().to_string()));
    }

    #[test]
    fn backend_messages_follow_the_language() {
        i18n::set_english(true);
        assert_eq!(tr!("열기 {}", "Open {}", 1), "Open 1");
        i18n::set_english(false);
        assert_eq!(tr!("열기 {}", "Open {}", 1), "열기 1");
    }

    #[test]
    fn the_title_names_the_program_and_its_version() {
        let source = std::fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json")).unwrap();
        assert!(source.contains("\"productName\": \"MyHomeMaker\""));
        assert!(source.contains("\"myhome\"") && source.contains("\"mhomt\""));
    }
}
