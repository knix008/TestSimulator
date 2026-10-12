pub mod i18n;
pub mod capture;
pub mod files;
pub mod instance;
mod permissions;
pub mod webm;
pub mod window_state;

use capture::{ImageKind, MonitorInfo, Rect, Source, WindowInfo};
use image::RgbaImage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

/// Every webview in the process must share these (WebView2 refuses a second
/// environment with different arguments). The extra switches keep the recording
/// pipeline's timers running while the main window is minimized or covered.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

/// Time for the window manager to finish hiding our window before the screen is read.
const HIDE_SETTLE: Duration = Duration::from_millis(260);

/// Time for the compositor to stop blanking our window once content protection is off.
const SELF_SETTLE: Duration = Duration::from_millis(150);

struct Frozen {
    label: String,
    info: MonitorInfo,
    image: RgbaImage,
}

struct Recording {
    file: File,
    path: PathBuf,
    format: String,
    bytes: u64,
}

#[derive(Default)]
struct Shared {
    /// The last grabbed image, waiting to be saved or copied.
    pending: Option<RgbaImage>,
    /// Desktop snapshot shown by the region-selection overlays.
    frozen: Vec<Frozen>,
    overlay_round: u32,
    recordings: HashMap<u32, Recording>,
    next_recording: u32,
    /// MyCapture is recording its own window, so it stays visible to capture.
    self_recording: bool,
}

type AppState = Mutex<Shared>;

fn lock(state: &AppState) -> std::sync::MutexGuard<'_, Shared> {
    state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| tr!("작업 실행 실패: {error}", "The task failed: {error}"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    platform: &'static str,
    version: String,
}

#[tauri::command]
fn platform_info(app: AppHandle) -> PlatformInfo {
    PlatformInfo { platform: std::env::consts::OS, version: app.package_info().version.to_string() }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Directories {
    pictures: Option<PathBuf>,
    videos: Option<PathBuf>,
}

/// The UI language; backend messages follow it.
#[tauri::command]
fn set_language(language: String) {
    i18n::set_english(language == "en");
}

#[tauri::command]
fn default_directories(app: AppHandle) -> Directories {
    let paths = app.path();
    let fallback = paths.download_dir().or_else(|_| paths.home_dir()).ok();
    Directories {
        pictures: paths.picture_dir().ok().or_else(|| fallback.clone()),
        videos: paths.video_dir().ok().or(fallback),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sources {
    monitors: Vec<MonitorInfo>,
    windows: Vec<WindowInfo>,
}

#[tauri::command]
async fn list_sources() -> Result<Sources, String> {
    blocking(|| {
        Ok(Sources {
            monitors: capture::list_monitors()?,
            windows: capture::list_windows(Some(std::process::id())).unwrap_or_default(),
        })
    })
    .await
}

#[tauri::command]
async fn source_thumbnail(source: Source, max_edge: Option<u32>) -> Result<String, String> {
    blocking(move || capture::thumbnail_data_url(&capture::grab(&source)?, max_edge.unwrap_or(640))).await
}

fn set_main_visible(app: &AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if visible {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        } else {
            let _ = window.hide();
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Grabbed {
    width: u32,
    height: u32,
    thumbnail: String,
}

fn store_pending(state: &AppState, image: RgbaImage) -> Result<Grabbed, String> {
    let grabbed = Grabbed {
        width: image.width(),
        height: image.height(),
        // Shown in the (resizable) preview area, so large enough to stay sharp.
        thumbnail: capture::thumbnail_data_url(&image, 1920)?,
    };
    lock(state).pending = Some(image);
    Ok(grabbed)
}

/// The main window is content-protected (left out of every capture). Capturing
/// MyCapture itself lifts that for as long as the capture or recording lasts.
fn set_capturable(app: &AppHandle, capturable: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_content_protected(!capturable);
    }
}

/// Reads `source`; `Source::App` is the main window's own content as it is now.
fn grab_source(app: &AppHandle, source: Source) -> Result<RgbaImage, String> {
    if source != Source::App {
        return capture::grab(&source);
    }
    let window = app.get_webview_window("main").ok_or_else(|| tr!("MyCapture 창을 찾을 수 없습니다.", "The MyCapture window was not found."))?;
    if window.is_minimized().unwrap_or(false) {
        return Err(tr!("MyCapture 창이 최소화되어 있습니다.", "The MyCapture window is minimized."));
    }
    // Windows: ask the window for its pixels. The outer rectangle of a frameless window
    // includes an invisible 8 px resize border, and the rounded corners show the desktop.
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        if let Ok(image) = capture::grab_own_window(hwnd.0 as usize as u32) {
            return Ok(image);
        }
    }
    // Elsewhere (or if that fails): the screen area of the content, without the frame.
    let fail = |error: tauri::Error| tr!("창 위치 조회 실패: {error}", "Could not read the window position: {error}");
    let position = window.inner_position().map_err(fail)?;
    let size = window.inner_size().map_err(fail)?;
    capture::grab_desktop_rect(position.x, position.y, size.width, size.height)
}

/// Grabs `source` into the pending slot. Saving is a separate step so the
/// screen is read at the moment of the click, not after a save dialog.
///
/// MyCapture must never appear in its own captures, so the main window is
/// always hidden while the screen is read and shown again afterwards.
#[tauri::command]
async fn grab(app: AppHandle, state: State<'_, AppState>, source: Source) -> Result<Grabbed, String> {
    if source == Source::App {
        // Capturing MyCapture itself: it stays where it is and is briefly unprotected.
        let recording = lock(state.inner()).self_recording;
        if !recording {
            set_capturable(&app, true);
            tokio_sleep(SELF_SETTLE).await;
        }
        let handle = app.clone();
        let result = blocking(move || grab_source(&handle, source)).await;
        if !recording {
            set_capturable(&app, false);
        }
        return store_pending(state.inner(), result?);
    }
    set_main_visible(&app, false);
    tokio_sleep(HIDE_SETTLE).await;
    let result = blocking(move || capture::grab(&source)).await;
    set_main_visible(&app, true);
    store_pending(state.inner(), result?)
}

async fn tokio_sleep(duration: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(duration)).await;
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Output {
    /// A path the user picked in a save dialog; overwriting was already confirmed there.
    Exact { path: PathBuf },
    /// Auto-save: a fresh name inside `directory`.
    Folder { directory: PathBuf, stem: String },
}

fn resolve_output(output: Output, extension: &str) -> Result<PathBuf, String> {
    match output {
        Output::Exact { path } => Ok(files::with_extension(&path, extension)),
        Output::Folder { directory, stem } => {
            std::fs::create_dir_all(&directory)
                .map_err(|error| tr!("저장 폴더를 만들 수 없습니다: {error}", "Could not create the save folder: {error}"))?;
            Ok(files::unique_path(&directory, &stem, extension))
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    path: PathBuf,
    bytes: u64,
}

#[tauri::command]
async fn save_pending(
    state: State<'_, AppState>,
    output: Output,
    format: String,
    jpeg_quality: Option<u8>,
) -> Result<Saved, String> {
    let kind = ImageKind::parse(&format)?;
    let image = lock(&state).pending.clone().ok_or_else(|| tr!("저장할 캡처가 없습니다. 먼저 캡처하세요.", "There is no capture to save. Capture first."))?;
    let path = resolve_output(output, kind.extension())?;
    blocking(move || {
        let bytes = capture::save(&image, &path, kind, jpeg_quality.unwrap_or(92))?;
        Ok(Saved { path, bytes })
    })
    .await
}

/// Puts text on the clipboard. Done here because the webview's clipboard API
/// refuses while focus is in another window (a context menu that just closed).
#[tauri::command]
async fn copy_text(text: String) -> Result<(), String> {
    blocking(move || {
        arboard::Clipboard::new()
            .and_then(|mut clipboard| clipboard.set_text(text))
            .map_err(|error| tr!("클립보드 복사 실패: {error}", "Copying to the clipboard failed: {error}"))
    })
    .await
}

/// Puts a saved image file on the clipboard (context menu of the capture history).
#[tauri::command]
async fn copy_image_file(path: PathBuf) -> Result<(), String> {
    blocking(move || {
        let image = image::open(&path)
            .map_err(|error| tr!("이미지를 열 수 없습니다: {error}", "Could not open the image: {error}"))?
            .into_rgba8();
        let mut clipboard = arboard::Clipboard::new().map_err(|error| tr!("클립보드를 열 수 없습니다: {error}", "Could not open the clipboard: {error}"))?;
        clipboard
            .set_image(arboard::ImageData {
                width: image.width() as usize,
                height: image.height() as usize,
                bytes: image.into_raw().into(),
            })
            .map_err(|error| tr!("클립보드 복사 실패: {error}", "Copying to the clipboard failed: {error}"))
    })
    .await
}

#[tauri::command]
async fn copy_pending(state: State<'_, AppState>) -> Result<(), String> {
    let image = lock(&state).pending.clone().ok_or_else(|| tr!("복사할 캡처가 없습니다.", "There is no capture to copy."))?;
    blocking(move || {
        let mut clipboard = arboard::Clipboard::new().map_err(|error| tr!("클립보드를 열 수 없습니다: {error}", "Could not open the clipboard: {error}"))?;
        clipboard
            .set_image(arboard::ImageData {
                width: image.width() as usize,
                height: image.height() as usize,
                bytes: image.into_raw().into(),
            })
            .map_err(|error| tr!("클립보드 복사 실패: {error}", "Copying to the clipboard failed: {error}"))
    })
    .await
}

fn close_overlays(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with("overlay-") {
            let _ = window.destroy();
        }
    }
}

/// Freezes every monitor and opens a borderless overlay on each for drag selection.
#[tauri::command]
async fn begin_region_select(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    close_overlays(&app);
    set_main_visible(&app, false);
    tokio_sleep(HIDE_SETTLE).await;
    let shots = match blocking(capture::grab_each_monitor).await {
        Ok(shots) => shots,
        Err(error) => {
            set_main_visible(&app, true);
            return Err(error);
        }
    };

    let targets: Vec<(String, MonitorInfo)> = {
        let mut shared = lock(&state);
        shared.overlay_round += 1;
        shared.frozen = shots
            .into_iter()
            .enumerate()
            .map(|(index, (info, image))| Frozen {
                label: format!("overlay-{}-{index}", shared.overlay_round),
                info,
                image,
            })
            .collect();
        shared.frozen.iter().map(|frozen| (frozen.label.clone(), frozen.info.clone())).collect()
    };

    for (label, info) in targets {
        if let Err(error) = open_overlay(&app, &label, &info) {
            close_overlays(&app);
            lock(&state).frozen.clear();
            set_main_visible(&app, true);
            return Err(tr!("영역 선택 창을 열 수 없습니다: {error}", "Could not open the region selector: {error}"));
        }
    }
    Ok(())
}

fn open_overlay(app: &AppHandle, label: &str, info: &MonitorInfo) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(tr!("영역 선택", "Select region"))
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .visible(false)
        .focused(true)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .additional_browser_args(BROWSER_ARGS)
        .build()?;
    // Position first: arriving on a monitor with another DPI may rescale the window.
    window.set_position(PhysicalPosition::new(info.x, info.y))?;
    window.set_size(PhysicalSize::new(info.width, info.height))?;
    Ok(())
}

/// The frozen desktop image behind the calling overlay (see `capture::raw_frame`).
#[tauri::command]
async fn overlay_frame(window: WebviewWindow, state: State<'_, AppState>) -> Result<Response, String> {
    let shared = lock(&state);
    let frozen = shared
        .frozen
        .iter()
        .find(|frozen| frozen.label == window.label())
        .ok_or_else(|| tr!("영역 선택이 이미 끝났습니다.", "Region selection has already ended."))?;
    Ok(Response::new(capture::raw_frame(&frozen.image)))
}

#[tauri::command]
fn overlay_ready(window: WebviewWindow, state: State<'_, AppState>) -> Result<(), String> {
    let shared = lock(&state);
    let frozen = shared.frozen.iter().find(|frozen| frozen.label == window.label());
    if let Some(frozen) = frozen {
        // Re-apply the geometry: the first placement can be scaled by a DPI change.
        let _ = window.set_position(PhysicalPosition::new(frozen.info.x, frozen.info.y));
        let _ = window.set_size(PhysicalSize::new(frozen.info.width, frozen.info.height));
    }
    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegionSelected {
    monitor_id: u32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    thumbnail: String,
}

#[derive(Deserialize)]
struct Selection {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

/// Ends region selection. With a selection, the frozen pixels become the pending
/// capture (exactly what the user saw) and the main window gets `region-selected`.
#[tauri::command]
async fn finish_region_select(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    selection: Option<Selection>,
) -> Result<(), String> {
    let frozen = std::mem::take(&mut lock(&state).frozen);
    close_overlays(&app);
    set_main_visible(&app, true);

    let Some(selection) = selection else {
        let _ = app.emit_to("main", "region-cancelled", ());
        return Ok(());
    };
    let frozen = frozen
        .into_iter()
        .find(|frozen| frozen.label == window.label())
        .ok_or_else(|| tr!("영역 선택 화면 정보를 찾을 수 없습니다.", "The region selector screen was not found."))?;
    let rect = Rect { x: selection.x, y: selection.y, width: selection.width, height: selection.height };
    let monitor_id = frozen.info.id;
    let image = blocking(move || capture::crop(&frozen.image, rect)).await?;
    let grabbed = store_pending(state.inner(), image)?;
    let _ = app.emit_to(
        "main",
        "region-selected",
        RegionSelected {
            monitor_id,
            x: rect.x,
            y: rect.y,
            width: grabbed.width,
            height: grabbed.height,
            thumbnail: grabbed.thumbnail,
        },
    );
    Ok(())
}

#[tauri::command]
fn monitor_info(id: u32) -> Result<MonitorInfo, String> {
    capture::monitor_by_id(id)
}

/// One raw frame for the in-app recording engine.
#[tauri::command]
async fn grab_frame(app: AppHandle, source: Source) -> Result<Response, String> {
    blocking(move || Ok(Response::new(capture::raw_frame(&grab_source(&app, source)?)))).await
}

/// Recording MyCapture itself: keeps the main window visible to capture until switched off.
#[tauri::command]
async fn set_self_recording(app: AppHandle, state: State<'_, AppState>, on: bool) -> Result<(), String> {
    lock(state.inner()).self_recording = on;
    set_capturable(&app, on);
    if on {
        tokio_sleep(SELF_SETTLE).await;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedRecording {
    id: u32,
    path: PathBuf,
}

#[tauri::command]
fn recording_open(state: State<'_, AppState>, output: Output, format: String) -> Result<OpenedRecording, String> {
    let format = match format.as_str() {
        "mp4" | "webm" => format,
        _ => return Err(tr!("지원하지 않는 녹화 형식입니다. MP4 또는 WebM을 선택하세요.", "Unsupported recording format. Choose MP4 or WebM.")),
    };
    let path = resolve_output(output, &format)?;
    let file = File::create(&path).map_err(|error| tr!("녹화 파일을 만들 수 없습니다: {error}", "Could not create the recording file: {error}"))?;
    let mut shared = lock(&state);
    shared.next_recording += 1;
    let id = shared.next_recording;
    shared.recordings.insert(id, Recording { file, path: path.clone(), format, bytes: 0 });
    Ok(OpenedRecording { id, path })
}

fn recording_id(request: &Request<'_>) -> Result<u32, String> {
    request
        .headers()
        .get("x-recording-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| tr!("녹화 ID가 없습니다.", "The recording ID is missing."))
}

/// Appends one MediaRecorder chunk (raw request body).
#[tauri::command]
async fn recording_write(request: Request<'_>, state: State<'_, AppState>) -> Result<(), String> {
    let id = recording_id(&request)?;
    let InvokeBody::Raw(chunk) = request.body() else {
        return Err(tr!("녹화 데이터 형식이 올바르지 않습니다.", "The recording data is malformed."));
    };
    let mut shared = lock(&state);
    let recording = shared.recordings.get_mut(&id).ok_or_else(|| tr!("녹화가 이미 끝났습니다.", "The recording has already ended."))?;
    recording
        .file
        .write_all(chunk)
        .map_err(|error| tr!("녹화 파일 쓰기 실패: {error}", "Writing the recording file failed: {error}"))?;
    recording.bytes += chunk.len() as u64;
    Ok(())
}

fn finalize_recording(recording: Recording, duration_ms: f64) -> Result<Saved, String> {
    let Recording { mut file, path, format, bytes } = recording;
    file.flush().and_then(|_| file.sync_all()).map_err(|error| tr!("녹화 파일 마무리 실패: {error}", "Finishing the recording file failed: {error}"))?;
    drop(file);
    if bytes == 0 {
        let _ = std::fs::remove_file(&path);
        return Err(tr!("녹화된 데이터가 없습니다. 화면 공유가 바로 끝났는지 확인하세요.", "Nothing was recorded. Check whether screen sharing ended right away."));
    }
    if format == "webm" {
        fix_webm_duration(&path, duration_ms)?;
    }
    let bytes = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(bytes);
    Ok(Saved { path, bytes })
}

fn fix_webm_duration(path: &Path, duration_ms: f64) -> Result<(), String> {
    let original = std::fs::read(path).map_err(|error| tr!("녹화 파일 읽기 실패: {error}", "Reading the recording file failed: {error}"))?;
    let fixed = webm::with_duration(&original, duration_ms)?;
    let temporary = files::with_extension(path, "tmp");
    std::fs::write(&temporary, fixed)
        .and_then(|_| std::fs::rename(&temporary, path))
        .map_err(|error| {
            let _ = std::fs::remove_file(&temporary);
            tr!("WebM 길이 정보 기록 실패: {error}", "Writing the WebM duration failed: {error}")
        })
}

#[tauri::command]
async fn recording_finish(state: State<'_, AppState>, id: u32, duration_ms: f64) -> Result<Saved, String> {
    let recording = lock(&state).recordings.remove(&id).ok_or_else(|| tr!("녹화가 이미 끝났습니다.", "The recording has already ended."))?;
    blocking(move || finalize_recording(recording, duration_ms)).await
}

#[tauri::command]
fn recording_abort(state: State<'_, AppState>, id: u32) {
    if let Some(recording) = lock(&state).recordings.remove(&id) {
        drop(recording.file);
        let _ = std::fs::remove_file(&recording.path);
    }
}

#[tauri::command]
fn reveal_path(path: PathBuf) -> Result<(), String> {
    files::reveal(&path)
}

/// Lets the viewer load one saved capture through the asset protocol. The scope
/// starts empty; only files the user opens from the capture history are allowed.
#[tauri::command]
fn allow_preview(app: AppHandle, path: PathBuf) -> Result<bool, String> {
    if !path.is_file() {
        return Ok(false);
    }
    app.asset_protocol_scope().allow_file(&path).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn paths_exist(paths: Vec<PathBuf>) -> Vec<bool> {
    paths.iter().map(|path| path.is_file()).collect()
}

#[tauri::command]
fn open_path(path: PathBuf) -> Result<(), String> {
    files::open(&path)
}

#[tauri::command]
fn show_main(app: AppHandle) {
    set_main_visible(&app, true);
}

/// "MyCapture v1.0" — the name with the major.minor version.
fn app_title(info: &tauri::PackageInfo) -> String {
    format!("MyCapture v{}.{}", info.version.major, info.version.minor)
}

const POPUP_KINDS: [&str; 5] = ["settings", "about", "confirm", "theme-menu", "menu"];

/// Opens a popup (settings, about, confirmation, theme dropdown) as its own OS
/// window at screen position (x, y) in logical pixels, or brings it back. It is
/// owned by the main window — it stays above it and closes with it — and, like
/// the main window, is excluded from captures. Shown by `popup_ready` once drawn.
/// Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
async fn open_popup(app: AppHandle, kind: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    if !POPUP_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown popup {kind}"));
    }
    let label = format!("popup-{kind}");
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(app_title(app.package_info()))
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(true)
        .visible(false)
        .focused(true)
        .content_protected(true)
        .position(x, y)
        .inner_size(width, height)
        .additional_browser_args(BROWSER_ARGS);
    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|error| error.to_string())?;
    }
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}

/// Called by a popup page once it has drawn itself, so it never flashes empty.
#[tauri::command]
fn popup_ready(window: WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn close_popup(app: AppHandle, kind: String) {
    if let Some(window) = app.get_webview_window(&format!("popup-{kind}")) {
        let _ = window.destroy();
    }
}

const RECORDING_PANEL: &str = "recbar";

/// Small always-on-top recording controls shown while a whole screen is
/// recorded (the main window is minimized then). Excluded from capture like
/// the main window, and placed at the top centre of the recorded monitor.
/// Async: creating a window from a synchronous command deadlocks on Windows.
#[tauri::command]
async fn show_recording_panel(app: AppHandle, monitor_id: Option<u32>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(RECORDING_PANEL) {
        let _ = window.show();
        return Ok(());
    }
    let monitor = monitor_id
        .and_then(|id| capture::monitor_by_id(id).ok())
        .or_else(|| capture::list_monitors().ok().and_then(|monitors| monitors.into_iter().next()))
        .ok_or_else(|| tr!("녹화 제어판을 놓을 화면이 없습니다.", "There is no screen for the recording controls."))?;
    let scale = f64::from(monitor.scale_factor.max(0.5));
    let (width, height) = (300.0, 52.0);
    let window = WebviewWindowBuilder::new(&app, RECORDING_PANEL, WebviewUrl::App("index.html".into()))
        .title(tr!("녹화 제어", "Recording controls"))
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(true)
        .visible(false)
        .focused(false)
        .content_protected(true)
        .inner_size(width, height)
        .additional_browser_args(BROWSER_ARGS)
        .build()
        .map_err(|error| tr!("녹화 제어판을 열 수 없습니다: {error}", "Could not open the recording controls: {error}"))?;
    let x = monitor.x + ((f64::from(monitor.width) - width * scale) / 2.0) as i32;
    let y = monitor.y + (16.0 * scale) as i32;
    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.show();
    Ok(())
}

#[tauri::command]
fn hide_recording_panel(app: AppHandle) {
    if let Some(window) = app.get_webview_window(RECORDING_PANEL) {
        let _ = window.destroy();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Keeps the single-instance lock (instance.rs) for as long as the app runs.
struct InstanceLock(#[allow(dead_code)] std::fs::File);

/// Another MyCapture is running: say so in a native message box, then quit
/// without opening a window. The UI language is not known yet, so both are shown.
fn refuse_second_instance(app: &AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    let handle = app.clone();
    std::thread::spawn(move || {
        handle
            .dialog()
            .message("MyCapture가 이미 실행 중입니다.
실행 중인 MyCapture 창을 사용하세요.

MyCapture is already running.
Please use the MyCapture window that is already open.")
            .title("MyCapture")
            .kind(MessageDialogKind::Warning)
            .blocking_show();
        handle.exit(0);
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            // One MyCapture at a time (the lock lives next to the window-state file).
            let state_path = window_state::state_file(app.handle());
            if let Some(dir) = state_path.as_deref().and_then(Path::parent) {
                match instance::acquire(dir) {
                    Some(instance::Instance::AlreadyRunning) => {
                        refuse_second_instance(app.handle());
                        return Ok(());
                    }
                    Some(instance::Instance::First(lock)) => {
                        app.manage(InstanceLock(lock));
                    }
                    None => {}
                }
            }
            // Last session's place and size, if that spot is still on a connected monitor.
            let placement = state_path.as_deref().and_then(window_state::saved_placement);
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(app_title(app.package_info()))
                .min_inner_size(860.0, 600.0);
            let builder = match placement {
                Some((state, scale)) => builder
                    .position(f64::from(state.x) / scale, f64::from(state.y) / scale)
                    .inner_size(f64::from(state.width) / scale, f64::from(state.height) / scale)
                    .maximized(state.maximized),
                None => builder.inner_size(1120.0, 760.0).center(),
            };
            let main = builder
                // No OS title bar: the app's own top bar is the drag area and carries
                // the minimize / maximize / close buttons (src/app.js renderBar).
                .decorations(false)
                // Excluded from every screen capture and recording (Windows 10 2004+:
                // WDA_EXCLUDEFROMCAPTURE, macOS: NSWindowSharingNone), so previews and
                // recordings never show MyCapture even while it stays on screen.
                .content_protected(true)
                .additional_browser_args(BROWSER_ARGS)
                .build()?;
            permissions::allow_microphone(&main);
            if let Some(path) = state_path {
                window_state::track(&main, path);
            }
            // Closing the main window ends the app: popups, overlays and the
            // recording controls go with it instead of keeping the process alive.
            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    handle.exit(0);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            platform_info,
            set_language,
            default_directories,
            list_sources,
            source_thumbnail,
            grab,
            save_pending,
            copy_pending,
            copy_image_file,
            copy_text,
            begin_region_select,
            overlay_frame,
            overlay_ready,
            finish_region_select,
            monitor_info,
            grab_frame,
            set_self_recording,
            recording_open,
            recording_write,
            recording_finish,
            recording_abort,
            reveal_path,
            paths_exist,
            allow_preview,
            open_path,
            show_main,
            show_recording_panel,
            open_popup,
            popup_ready,
            close_popup,
            hide_recording_panel
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyCapture");
}
