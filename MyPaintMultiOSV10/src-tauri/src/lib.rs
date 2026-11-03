//! MyPaint's desktop host. The page talks to it only through `window.desktop` (and the menu
//! and popup windows through `window.popupHost`), both defined by src/host/tauri-bridge.js
//! on top of the commands below — the same contract electron/preload.js had.
mod download;
mod fonts;
mod launch;
mod popups;
mod window_state;

use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use launch::Launch;
use popups::{MAIN, MENU, POPUP};
use window_state::Store;

pub const TITLE: &str = "MyPaint 10.0";
/// src/metrics.js MIN_WIDTH / MIN_HEIGHT.
pub const MIN_WIDTH: f64 = 1180.0;
pub const MIN_HEIGHT: f64 = 720.0;
const START_WIDTH: f64 = 1360.0;
const START_HEIGHT: f64 = 860.0;
const START_BACKGROUND: &str = "#f3f4f6";

struct AppState {
    store: Arc<Store>,
    /// forceClose was called: the next close really closes.
    force: AtomicBool,
    /// The page listens for request-close; until then the close button just closes.
    close_hooked: AtomicBool,
    launches: Mutex<Vec<Launch>>,
    download_stop: Arc<AtomicBool>,
    clipboard: Mutex<Option<arboard::Clipboard>>,
    /// Minimum logical size per window label, enforced on every resize.
    min_sizes: Mutex<std::collections::HashMap<String, (f64, f64)>>,
    /// Windows that are shown once their page has loaded (built hidden: no white flash).
    show_on_load: Mutex<std::collections::HashMap<String, bool>>,
}

fn app_state(app: &AppHandle) -> &AppState {
    app.state::<AppState>().inner()
}

fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/* ------------------------------------------------------------ navigation */

/// Only the app's own pages may load in its windows; a dropped file or a stray link never
/// replaces the window (the Electron build blocked will-navigate for the same reason).
pub fn allowed_navigation(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => return true,
        "http" | "https" => {}
        _ => return false,
    }
    let host = url.host_str().unwrap_or("");
    if host == "tauri.localhost" {
        return true;
    }
    match DEV_ORIGIN.get() {
        Some(Some(origin)) => url.origin().ascii_serialization() == *origin,
        _ => false,
    }
}

static DEV_ORIGIN: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();

/* ------------------------------------------------------------- launching */

fn push_launch(app: &AppHandle, item: Option<Launch>) {
    let Some(item) = item else { return };
    app_state(app).launches.lock().unwrap().push(item);
    let _ = app.emit_to(MAIN, "launch", ());
}

#[tauri::command]
fn take_launches(app: AppHandle) -> Vec<Launch> {
    std::mem::take(&mut *app_state(&app).launches.lock().unwrap())
}

fn focus_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/* --------------------------------------------------------------- windows */

#[tauri::command]
fn window_command(app: AppHandle, window: WebviewWindow, name: String) -> bool {
    match name.as_str() {
        "minimize" => {
            let _ = window.minimize();
        }
        "maximize" => {
            if window.is_maximized().unwrap_or(false) {
                let _ = window.unmaximize();
            } else {
                let _ = window.maximize();
            }
        }
        "close" => {
            if window.label() == MAIN || popups::is_child(window.label()) {
                // the main window asks the page first; a child is hidden, not destroyed
                let _ = window.close();
            } else {
                let _ = window.destroy();
            }
            let _ = app;
            return false;
        }
        _ => {}
    }
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
fn window_drag(window: WebviewWindow) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn resize_window(app: AppHandle, window: WebviewWindow, width: f64, height: f64) {
    if window.is_maximized().unwrap_or(false) {
        return;
    }
    let (min_w, min_h) = min_size(&app, window.label());
    let Ok(scale) = window.scale_factor() else { return };
    let Ok(current) = window.inner_size() else { return };
    let current = current.to_logical::<f64>(scale);
    let width = if width.is_finite() && width > 0.0 { width.round() } else { current.width };
    let height = if height.is_finite() && height > 0.0 { height.round() } else { current.height };
    let _ = window.set_size(LogicalSize::new(width.max(min_w), height.max(min_h)));
}

fn min_size(app: &AppHandle, label: &str) -> (f64, f64) {
    app_state(app).min_sizes.lock().unwrap().get(label).copied().unwrap_or((0.0, 0.0))
}

/// set_min_size holds the user's own edge drags, but Windows Snap and other programs'
/// SetWindowPos can still make a window smaller; put it back whenever that happens.
fn enforce_min_size(window: &tauri::Window, size: &tauri::PhysicalSize<u32>) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) || size.width == 0 || size.height == 0 {
        return;
    }
    let (min_w, min_h) = min_size(window.app_handle(), window.label());
    if min_w <= 0.0 && min_h <= 0.0 {
        return;
    }
    let current = size.to_logical::<f64>(window.scale_factor().unwrap_or(1.0));
    if current.width + 0.5 < min_w || current.height + 0.5 < min_h {
        let _ = window.set_size(LogicalSize::new(current.width.max(min_w), current.height.max(min_h)));
    }
}

/// Builds an app window hidden, in the theme's background, where it was last time.
fn page_window(app: &AppHandle, label: &str, url: WebviewUrl, title: &str, size: (f64, f64), min: (f64, f64)) -> tauri::Result<WebviewWindow> {
    let store = Arc::clone(&app_state(app).store);
    let background = store.background().unwrap_or_else(|| START_BACKGROUND.to_string());
    let mut builder = WebviewWindowBuilder::new(app, label, url)
        .title(title)
        .inner_size(size.0.max(min.0), size.1.max(min.1))
        .min_inner_size(min.0, min.1)
        .decorations(false)
        .resizable(true)
        .visible(false)
        .center()
        .disable_drag_drop_handler()
        .on_navigation(allowed_navigation)
        .on_page_load(|window, payload| {
            if !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                return;
            }
            let app = window.app_handle();
            let first = app_state(app).show_on_load.lock().unwrap().remove(window.label());
            if let Some(maximized) = first {
                if maximized {
                    let _ = window.maximize();
                }
                let _ = window.show();
                let _ = window.set_focus();
                if window.label() == MAIN {
                    // the menu and popup windows, ready before their first use
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || popups::warm(&handle));
                }
            }
        });
    if let Some(colour) = window_state::colour(&background) {
        builder = builder.background_color(colour);
    }
    let window = builder.build()?;
    app_state(app).min_sizes.lock().unwrap().insert(label.to_string(), min);
    let mut maximized = false;
    if let Some(saved) = store.placement(app, label) {
        maximized = saved.maximized;
        window_state::restore(&window, &window_state::WindowState { maximized: false, ..saved });
    }
    app_state(app).show_on_load.lock().unwrap().insert(label.to_string(), maximized);
    window_state::track(&store, &window);
    Ok(window)
}

fn build_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    page_window(app, MAIN, WebviewUrl::App("index.html".into()), TITLE, (START_WIDTH, START_HEIGHT), (MIN_WIDTH, MIN_HEIGHT))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenWindow {
    label: String,
    url: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    width: f64,
    #[serde(default)]
    height: f64,
    #[serde(default)]
    min_width: f64,
    #[serde(default)]
    min_height: f64,
}

/// A label the page may use for a window of its own: letters, digits, - and _, never one
/// of the host's own windows.
pub fn page_label(label: &str) -> Option<String> {
    let clean: String = label.trim().chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(48).collect();
    if clean.is_empty() || clean == MAIN || clean == MENU || clean == POPUP {
        return None;
    }
    Some(format!("page-{clean}"))
}

#[tauri::command]
fn open_window(app: AppHandle, window: WebviewWindow, options: OpenWindow) -> Result<bool, String> {
    let label = page_label(&options.label).ok_or("That window name cannot be used.")?;
    let base = window.url().map_err(err)?;
    let target = base.join(options.url.trim()).map_err(|_| "That page address is not valid.".to_string())?;
    if target.origin() != base.origin() {
        return Err("Only MyPaint's own pages open in a MyPaint window.".into());
    }
    let title = if options.title.trim().is_empty() { TITLE.to_string() } else { options.title.trim().to_string() };
    if let Some(existing) = app.get_webview_window(&label) {
        if existing.url().map(|u| u != target).unwrap_or(true) {
            let _ = existing.navigate(target);
        }
        let _ = existing.set_title(&title);
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(true);
    }
    let min = (options.min_width.max(200.0), options.min_height.max(150.0));
    let size = (
        if options.width > 0.0 { options.width } else { 900.0 },
        if options.height > 0.0 { options.height } else { 700.0 },
    );
    page_window(&app, &label, WebviewUrl::External(target), &title, size, min).map_err(err)?;
    Ok(true)
}

#[tauri::command]
fn force_close(app: AppHandle, code: Option<i32>) {
    app_state(&app).force.store(true, Ordering::SeqCst);
    app_state(&app).store.flush();
    popups::close_all(&app);
    app.exit(code.unwrap_or(0));
}

#[tauri::command]
fn close_hooked(app: AppHandle) {
    app_state(&app).close_hooked.store(true, Ordering::SeqCst);
}

/* ----------------------------------------------------- menus and popups */

#[tauri::command]
fn open_menu(app: AppHandle, window: WebviewWindow, payload: Value) -> bool {
    popups::open_menu(&app, &window, &payload)
}

#[tauri::command]
fn open_popup(app: AppHandle, window: WebviewWindow, payload: Value) -> bool {
    popups::open_popup(&app, &window, &payload)
}

#[tauri::command]
fn close_popup(app: AppHandle) {
    popups::hide_then(&app, POPUP, true);
}

#[tauri::command]
fn refresh_popup(app: AppHandle, html: String) {
    popups::refresh_popup(&app, html);
}

#[tauri::command]
fn apply_theme(app: AppHandle, css: String) {
    if let Some(colour) = window_state::background_of(&css) {
        app_state(&app).store.set_background(&colour);
        if let Some(colour) = window_state::colour(&colour) {
            for (label, window) in app.webview_windows() {
                if !popups::is_child(&label) {
                    let _ = window.set_background_color(Some(colour));
                }
            }
        }
    }
    popups::apply_theme(&app, css);
}

#[tauri::command]
fn popup_action(app: AppHandle, window: WebviewWindow, payload: Value) {
    popups::action(&app, &window, payload);
}

#[tauri::command]
fn child_pull(app: AppHandle, window: WebviewWindow) -> Value {
    popups::pull(&app, window.label())
}

#[tauri::command]
fn child_rendered(app: AppHandle, window: WebviewWindow, seq: u64) {
    popups::rendered(&app, &window, seq);
}

/* ------------------------------------------------------------- dialogs */

#[derive(Deserialize, Clone)]
struct Filter {
    name: String,
    extensions: Vec<String>,
}

fn default_save_filters() -> Vec<Filter> {
    vec![
        Filter { name: "MyPaint".into(), extensions: vec!["mypaint".into()] },
        Filter { name: "PNG".into(), extensions: vec!["png".into()] },
    ]
}

fn usable(filters: Option<Vec<Filter>>) -> Vec<Filter> {
    filters
        .unwrap_or_default()
        .into_iter()
        .map(|f| Filter {
            name: f.name,
            extensions: f.extensions.into_iter().map(|e| e.trim().trim_start_matches('.').to_string()).filter(|e| !e.is_empty()).collect(),
        })
        .filter(|f| !f.extensions.is_empty())
        .collect()
}

fn existing_dir(dir: &str) -> Option<PathBuf> {
    let path = PathBuf::from(dir.trim());
    if dir.trim().is_empty() {
        return None;
    }
    if path.is_dir() {
        return Some(path);
    }
    path.parent().filter(|p| p.is_dir()).map(Path::to_path_buf)
}

fn picked(path: tauri_plugin_dialog::FilePath) -> Option<String> {
    path.into_path().ok().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
async fn pick_files(app: AppHandle, window: WebviewWindow, dir: Option<String>, filters: Option<Vec<Filter>>) -> Vec<String> {
    let mut filters = usable(filters);
    if filters.is_empty() {
        filters.push(Filter { name: "All files".into(), extensions: vec!["*".into()] });
    }
    let mut dialog = app.dialog().file().set_parent(&window);
    for filter in &filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }
    if let Some(dir) = dir.as_deref().and_then(existing_dir) {
        dialog = dialog.set_directory(dir);
    }
    dialog.blocking_pick_files().unwrap_or_default().into_iter().filter_map(picked).collect()
}

/// The path to save to, with the chosen type's extension when the name has none.
fn with_extension(path: PathBuf, filters: &[Filter]) -> PathBuf {
    if path.extension().is_some() {
        return path;
    }
    match filters.first().and_then(|f| f.extensions.first()).filter(|e| e.as_str() != "*") {
        Some(ext) => path.with_extension(ext),
        None => path,
    }
}

#[tauri::command]
async fn pick_save(app: AppHandle, window: WebviewWindow, path: Option<String>, filters: Option<Vec<Filter>>) -> String {
    let mut filters = usable(filters);
    if filters.is_empty() {
        filters = default_save_filters();
    }
    let mut dialog = app.dialog().file().set_parent(&window);
    for filter in &filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }
    let suggested = path.unwrap_or_default();
    if !suggested.trim().is_empty() {
        let as_path = PathBuf::from(suggested.trim());
        if let Some(dir) = as_path.parent().filter(|p| p.is_dir()) {
            dialog = dialog.set_directory(dir);
        }
        if let Some(name) = as_path.file_name().and_then(|n| n.to_str()) {
            dialog = dialog.set_file_name(name);
        }
    }
    dialog
        .blocking_save_file()
        .and_then(|p| p.into_path().ok())
        .map(|p| with_extension(p, &filters).to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
async fn pick_directory(app: AppHandle, window: WebviewWindow, dir: Option<String>) -> String {
    let mut dialog = app.dialog().file().set_parent(&window);
    if let Some(dir) = dir.as_deref().and_then(existing_dir) {
        dialog = dialog.set_directory(dir);
    }
    dialog.blocking_pick_folder().and_then(picked).unwrap_or_default()
}

/* ---------------------------------------------------------------- files */

#[tauri::command]
async fn read_file(file: String) -> Result<String, String> {
    let bytes = std::fs::read(&file).map_err(err)?;
    Ok(String::from_utf8_lossy(&bytes).trim_start_matches('\u{feff}').to_string())
}

#[tauri::command]
async fn read_binary(file: String) -> Result<String, String> {
    let bytes = std::fs::read(&file).map_err(err)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
async fn write_file(file: String, text: String) -> Result<bool, String> {
    std::fs::write(&file, text.as_bytes()).map_err(err)?;
    Ok(true)
}

#[tauri::command]
async fn write_binary(file: String, base64: String) -> Result<bool, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(base64.trim()).map_err(err)?;
    std::fs::write(&file, bytes).map_err(err)?;
    Ok(true)
}

/* ------------------------------------------------------------ clipboard */

fn with_clipboard<T>(app: &AppHandle, f: impl FnOnce(&mut arboard::Clipboard) -> Result<T, arboard::Error>) -> Result<T, String> {
    let mut slot = app_state(app).clipboard.lock().unwrap();
    if slot.is_none() {
        *slot = Some(arboard::Clipboard::new().map_err(err)?);
    }
    f(slot.as_mut().unwrap()).map_err(err)
}

pub fn decode_data_url(data_url: &str) -> Option<Vec<u8>> {
    let (head, body) = data_url.split_once(',')?;
    if !head.starts_with("data:") || !head.ends_with(";base64") {
        return None;
    }
    base64::engine::general_purpose::STANDARD.decode(body.trim()).ok()
}

/// A picture onto the system clipboard, so what was copied here can be pasted into any other
/// program. Only the image is written: MyPaint keeps its own shapes in its own clipboard.
#[tauri::command]
async fn clipboard_write_image(app: AppHandle, data_url: String) -> bool {
    let Some(bytes) = decode_data_url(&data_url) else { return false };
    let Ok(image) = image::load_from_memory(&bytes) else { return false };
    let image = image.to_rgba8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return false;
    }
    let data = arboard::ImageData { width: width as usize, height: height as usize, bytes: std::borrow::Cow::Owned(image.into_raw()) };
    with_clipboard(&app, |c| c.set_image(data)).is_ok()
}

pub fn png_data_url(width: u32, height: u32, rgba: Vec<u8>) -> Option<String> {
    let image = image::RgbaImage::from_raw(width, height, rgba)?;
    let mut out = std::io::Cursor::new(Vec::new());
    image.write_to(&mut out, image::ImageFormat::Png).ok()?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(out.into_inner())))
}

/// The picture on the system clipboard as a PNG data URL, or "" when there is none.
#[tauri::command]
async fn clipboard_read_image(app: AppHandle) -> String {
    let Ok(image) = with_clipboard(&app, |c| c.get_image()) else { return String::new() };
    png_data_url(image.width as u32, image.height as u32, image.bytes.into_owned()).unwrap_or_default()
}

/* ------------------------------------------------------------- download */

#[tauri::command]
async fn download_url(app: AppHandle, window: WebviewWindow, url: String) -> Result<download::Downloaded, String> {
    let target = download::parse(&url)?;
    let stop = Arc::clone(&app_state(&app).download_stop);
    stop.store(false, Ordering::SeqCst);
    let label = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        download::fetch(&target, &stop, |received, total| {
            let _ = app.emit_to(label.as_str(), "download-progress", json!({ "received": received, "total": total }));
        })
    })
    .await
    .map_err(err)?
}

#[tauri::command]
fn cancel_download(app: AppHandle) -> bool {
    app_state(&app).download_stop.store(true, Ordering::SeqCst);
    true
}

/* --------------------------------------------------------------- system */

#[tauri::command]
async fn list_fonts() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(fonts::system_families).await.unwrap_or_default()
}

pub fn is_external(url: &str) -> bool {
    Url::parse(url.trim()).map(|u| matches!(u.scheme(), "http" | "https" | "mailto")).unwrap_or(false)
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<bool, String> {
    if !is_external(&url) {
        return Err(format!("Only web addresses can be opened: {url}"));
    }
    app.opener().open_url(url.trim(), None::<&str>).map_err(err)?;
    Ok(true)
}

/* ------------------------------------------------------------------ run */

fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    let app = window.app_handle();
    let label = window.label();
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if label == MAIN {
                let state = app_state(app);
                if !state.force.load(Ordering::SeqCst) && state.close_hooked.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = app.emit_to(MAIN, "request-close", ());
                }
            } else if popups::close_requested(app, label) {
                api.prevent_close();
            }
        }
        WindowEvent::Destroyed if label == MAIN => {
            app_state(app).store.flush();
            popups::close_all(app);
            app.exit(0);
        }
        WindowEvent::Focused(focused) => popups::focus_changed(app, label, *focused),
        WindowEvent::Resized(size) => enforce_min_size(window, size),
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // A test run with its own settings folder is its own instance: handing its files to the
    // user's running MyPaint would open them there instead.
    if std::env::var_os("MYPAINT_CONFIG_DIR").filter(|d| !d.is_empty()).is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            focus_main(app);
            push_launch(app, launch::from_args(argv, Path::new(&cwd)));
        }));
    }
    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(popups::Popups::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let dev = handle.config().build.dev_url.as_ref().filter(|_| cfg!(debug_assertions)).map(|u| u.origin().ascii_serialization());
            let _ = DEV_ORIGIN.set(dev);
            app.manage(AppState {
                store: Arc::new(Store::open(&handle)),
                force: AtomicBool::new(false),
                close_hooked: AtomicBool::new(false),
                launches: Mutex::new(Vec::new()),
                download_stop: Arc::new(AtomicBool::new(false)),
                clipboard: Mutex::new(None),
                min_sizes: Mutex::new(Default::default()),
                show_on_load: Mutex::new(Default::default()),
            });
            let cwd = std::env::current_dir().unwrap_or_default();
            if let Some(item) = launch::from_args(std::env::args(), &cwd) {
                app_state(&handle).launches.lock().unwrap().push(item);
            }
            build_main_window(&handle)?;
            Ok(())
        })
        .on_window_event(on_window_event)
        .invoke_handler(tauri::generate_handler![
            take_launches,
            window_command,
            window_drag,
            resize_window,
            open_window,
            force_close,
            close_hooked,
            open_menu,
            open_popup,
            close_popup,
            refresh_popup,
            apply_theme,
            popup_action,
            child_pull,
            child_rendered,
            pick_files,
            pick_save,
            pick_directory,
            read_file,
            read_binary,
            write_file,
            write_binary,
            clipboard_write_image,
            clipboard_read_image,
            download_url,
            cancel_download,
            list_fonts,
            open_external,
        ])
        .build(tauri::generate_context!())
        .expect("error while building MyPaint");

    app.run(|_app, _event| {
        // macOS hands associated files over through this event.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &_event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let text = path.to_string_lossy().to_string();
                    let mode = launch::mode_of(&text);
                    if !mode.is_empty() {
                        push_launch(_app, Some(Launch { mode: mode.to_string(), file: text }));
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_windows_get_their_own_labels() {
        assert_eq!(page_label("guide").as_deref(), Some("page-guide"));
        assert_eq!(page_label(" user guide! ").as_deref(), Some("page-userguide"));
        assert_eq!(page_label("main"), None);
        assert_eq!(page_label("menu"), None);
        assert_eq!(page_label("popup"), None);
        assert_eq!(page_label("../"), None);
    }

    #[test]
    fn a_saved_name_gets_the_extension_of_the_first_type() {
        let filters = default_save_filters();
        assert_eq!(with_extension(PathBuf::from("pic"), &filters), PathBuf::from("pic.mypaint"));
        assert_eq!(with_extension(PathBuf::from("pic.png"), &filters), PathBuf::from("pic.png"));
        assert_eq!(filters[0].extensions[0], "mypaint");
        assert_eq!(filters[1].extensions[0], "png");
    }

    #[test]
    fn filters_drop_empty_and_dotted_extensions() {
        let cleaned = usable(Some(vec![
            Filter { name: "A".into(), extensions: vec![".png".into(), "".into()] },
            Filter { name: "B".into(), extensions: vec![] },
        ]));
        assert_eq!(cleaned.len(), 1);
        assert_eq!(cleaned[0].extensions, vec!["png".to_string()]);
    }

    #[test]
    fn clipboard_pictures_round_trip_as_png_data_urls() {
        let url = png_data_url(2, 1, vec![255, 0, 0, 255, 0, 0, 255, 128]).unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
        let bytes = decode_data_url(&url).unwrap();
        let image = image::load_from_memory(&bytes).unwrap().to_rgba8();
        assert_eq!(image.dimensions(), (2, 1));
        assert_eq!(image.get_pixel(1, 0).0, [0, 0, 255, 128]);
        assert!(decode_data_url("nope").is_none());
        assert!(png_data_url(3, 3, vec![0; 4]).is_none());
    }

    #[test]
    fn only_web_addresses_open_outside() {
        assert!(is_external("https://example.com"));
        assert!(is_external("mailto:knix008@naver.com"));
        assert!(!is_external("file:///C:/Windows/notepad.exe"));
        assert!(!is_external("C:\\Windows"));
    }

    #[test]
    fn only_the_app_pages_load_in_its_windows() {
        assert!(allowed_navigation(&Url::parse("http://tauri.localhost/index.html").unwrap()));
        assert!(allowed_navigation(&Url::parse("tauri://localhost/popup.html").unwrap()));
        assert!(allowed_navigation(&Url::parse("about:blank").unwrap()));
        assert!(!allowed_navigation(&Url::parse("https://example.com/").unwrap()));
        assert!(!allowed_navigation(&Url::parse("file:///C:/a.png").unwrap()));
    }
}
