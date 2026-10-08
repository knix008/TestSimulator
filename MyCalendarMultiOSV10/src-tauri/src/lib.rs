use std::fs;
use std::path::PathBuf;

use tauri::image::Image;
use tauri::menu::{IconMenuItem, Menu, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

struct TrayState {
    show: IconMenuItem<tauri::Wry>,
    events: IconMenuItem<tauri::Wry>,
    settings: IconMenuItem<tauri::Wry>,
    language: IconMenuItem<tauri::Wry>,
    about: IconMenuItem<tauri::Wry>,
    quit: IconMenuItem<tauri::Wry>,
    current_language: Mutex<String>,
}

// Windows draws menu bitmaps at 16x16, so it gets pixel-aligned art; other platforms scale the 32px art.
macro_rules! tray_icon_bytes {
    ($name:literal) => {{
        #[cfg(target_os = "windows")]
        let bytes: &[u8] = include_bytes!(concat!("../icons/tray/", $name, "-16.png"));
        #[cfg(not(target_os = "windows"))]
        let bytes: &[u8] = include_bytes!(concat!("../icons/tray/", $name, "-32.png"));
        bytes
    }};
}

fn tray_menu_item(
    app: &tauri::App,
    id: &str,
    label: &str,
    icon: &[u8],
) -> tauri::Result<IconMenuItem<tauri::Wry>> {
    IconMenuItem::with_id(app, id, label, true, Some(Image::from_bytes(icon)?), None::<&str>)
}

fn normalize_language(raw: &str) -> Option<&'static str> {
    let value = raw.trim().trim_start_matches('\u{feff}').to_lowercase();
    if value.starts_with("ko") || value.contains("korean") || value.contains("한글") {
        Some("ko")
    } else if value.starts_with("en") || value.contains("english") {
        Some("en")
    } else {
        None
    }
}

fn language_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(PathBuf::from);
        for _ in 0..3 {
            let Some(current) = dir else { break };
            paths.push(current.join("install-language.txt"));
            dir = current.parent().map(PathBuf::from);
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let home = PathBuf::from(home);
        paths.push(home.join("AppData/Roaming/com.mycalendar.multios/install-language.txt"));
        paths.push(home.join(".config/my-calendar/install-language.txt"));
        paths.push(home.join("Library/Application Support/com.mycalendar.multios/install-language.txt"));
    }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        paths.push(PathBuf::from(xdg).join("my-calendar/install-language.txt"));
    }
    paths
}

fn read_install_language_value() -> Option<String> {
    for path in language_paths() {
        let Ok(text) = fs::read_to_string(&path) else { continue };
        if let Some(language) = normalize_language(&text) {
            return Some(language.to_string());
        }
    }
    None
}

fn labels(language: &str) -> (&'static str, &'static str, &'static str, &'static str, &'static str) {
    if language == "ko" {
        ("캘린더 표시/숨기기", "설정", "프로그램 정보", "종료", "마이 캘린더")
    } else {
        ("Show / Hide calendar", "Settings", "About", "Quit", "My Calendar")
    }
}

/// The language item offers the other language, so it carries that language's flag and name.
fn language_switch_label(language: &str) -> &'static str {
    if language == "ko" { "English" } else { "한국어" }
}

fn language_switch_icon(language: &str) -> &'static [u8] {
    if language == "ko" {
        tray_icon_bytes!("flag-uk")
    } else {
        tray_icon_bytes!("flag-kr")
    }
}

fn other_language(language: &str) -> &'static str {
    if language == "ko" { "en" } else { "ko" }
}

fn set_language_item(state: &TrayState, language: &str, label: &str) -> tauri::Result<()> {
    state.language.set_text(label)?;
    state.language.set_icon(Some(Image::from_bytes(language_switch_icon(language))?))?;
    if let Ok(mut current) = state.current_language.lock() {
        *current = language.to_string();
    }
    Ok(())
}

fn toggle_main(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn events_label(language: &str) -> &'static str {
    if language == "ko" { "일정 관리" } else { "Manage events" }
}

fn aux_title(app: &tauri::AppHandle, label: &str) -> String {
    if label == "print" || label == "editor" {
        // Not in the tray, so there is no label to copy; the page sets its own title once it loads.
        let language = read_install_language_value().unwrap_or_else(|| "en".to_string());
        let title = match (label, language == "ko") {
            ("print", true) => "인쇄 미리 보기",
            ("print", false) => "Print preview",
            (_, true) => "일정 추가",
            (_, false) => "Add event",
        };
        return title.to_string();
    }
    let current = app.try_state::<TrayState>().and_then(|state| {
        let item = if label == "events" { &state.events } else { &state.settings };
        item.text().ok()
    });
    current.unwrap_or_else(|| {
        let language = read_install_language_value().unwrap_or_else(|| "en".to_string());
        let (_, settings, _, _, _) = labels(&language);
        if label == "events" { events_label(&language) } else { settings }.to_string()
    })
}

fn open_aux(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    if label != "settings" && label != "events" && label != "print" && label != "editor" {
        return Err("unknown window".into());
    }
    // The editor is opened from the calendar, so it must not end up behind a calendar kept on top.
    let on_top = label == "editor" && KEEP_ON_TOP.load(Ordering::SeqCst);
    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(|error| error.to_string())?;
        if label == "editor" {
            window.set_always_on_top(on_top).map_err(|error| error.to_string())?;
        }
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    // The print preview shows whole pages beside its options, so it is wide and can be resized. The editor can be
    // resized too; its form scrolls when the window is shorter than the form.
    let (icon, width, height, min_width, min_height, resizable): (&[u8], f64, f64, f64, f64, bool) = match label {
        "events" => (include_bytes!("../icons/tray/events-64.png"), 520.0, 640.0, 380.0, 420.0, false),
        "print" => (include_bytes!("../icons/tray/print-64.png"), 1040.0, 720.0, 760.0, 520.0, true),
        // The height of a plain new event; the window then follows the form as fields come and go.
        "editor" => (include_bytes!("../icons/tray/events-64.png"), 460.0, 492.0, 380.0, EDITOR_MIN_HEIGHT, true),
        // Tall enough for the longest tab (the general one, with holidays and the background) in either language.
        _ => (include_bytes!("../icons/tray/settings-64.png"), 600.0, 760.0, 380.0, 420.0, false),
    };
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(aux_title(app, label))
        .icon(Image::from_bytes(icon).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?
        .inner_size(width, height)
        .min_inner_size(min_width, min_height)
        .resizable(resizable)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(on_top)
        .center()
        .visible(true)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn install_language() -> Option<String> {
    read_install_language_value()
}

#[tauri::command]
fn update_tray_labels(
    app: tauri::AppHandle,
    show: String,
    events: String,
    settings: String,
    about: String,
    quit: String,
    tooltip: String,
    language: String,
    language_switch: String,
) -> Result<(), String> {
    let state = app.state::<TrayState>();
    state.show.set_text(show).map_err(|error| error.to_string())?;
    state.events.set_text(events).map_err(|error| error.to_string())?;
    state.settings.set_text(settings).map_err(|error| error.to_string())?;
    set_language_item(&state, &language, &language_switch).map_err(|error| error.to_string())?;
    state.about.set_text(about).map_err(|error| error.to_string())?;
    state.quit.set_text(quit).map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_tooltip(Some(tooltip)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// The user's "keep above other windows" choice. A maximized calendar ignores it and sits below every other
/// window like a wallpaper.
static KEEP_ON_TOP: AtomicBool = AtomicBool::new(false);
/// Last layer applied, so the many resize events of a drag do not each reorder the window.
static MAIN_MAXIMIZED: AtomicBool = AtomicBool::new(false);

fn apply_main_layer(app: &tauri::AppHandle, force: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("missing main window")?;
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    let was_maximized = MAIN_MAXIMIZED.swap(maximized, Ordering::SeqCst);
    if was_maximized == maximized && !force {
        return Ok(());
    }
    if maximized {
        window.set_always_on_top(false).map_err(|error| error.to_string())?;
        return window.set_always_on_bottom(true).map_err(|error| error.to_string());
    }
    window.set_always_on_bottom(false).map_err(|error| error.to_string())?;
    let keep_on_top = KEEP_ON_TOP.load(Ordering::SeqCst);
    window.set_always_on_top(keep_on_top).map_err(|error| error.to_string())?;
    if was_maximized {
        raise_main(&window, keep_on_top)?;
    }
    Ok(())
}

/// Leaving the bottom layer does not raise the window. On Windows a window coming off HWND_BOTTOM also ignores
/// HWND_TOPMOST until it is explicitly made non-topmost first, which tao's flag bookkeeping skips.
#[cfg(target_os = "windows")]
fn raise_main(window: &tauri::WebviewWindow, topmost: bool) -> Result<(), String> {
    #[link(name = "user32")]
    extern "system" {
        fn SetWindowPos(hwnd: isize, after: isize, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
    }
    const HWND_TOP: isize = 0;
    const HWND_TOPMOST: isize = -1;
    const HWND_NOTOPMOST: isize = -2;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as isize;
    let after = if topmost { HWND_TOPMOST } else { HWND_TOP };
    window
        .run_on_main_thread(move || unsafe {
            SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
            SetWindowPos(hwnd, after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
        })
        .map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn raise_main(window: &tauri::WebviewWindow, _topmost: bool) -> Result<(), String> {
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_main_always_on_top(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    KEEP_ON_TOP.store(on, Ordering::SeqCst);
    apply_main_layer(&app, true)
}

#[tauri::command]
fn hide_main(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or("missing main window")?
        .hide()
        .map_err(|error| error.to_string())
}

/// The calendar stays off the taskbar, so minimizing hides it to the tray; the tray icon brings it back.
/// A real minimize without a taskbar button would leave a small stub on the desktop on Windows.
#[tauri::command]
fn minimize_main(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("missing main window")?;
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn toggle_maximize_main(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main").ok_or("missing main window")?;
    // The layer follows in the Resized event.
    if window.is_maximized().map_err(|error| error.to_string())? {
        window.unmaximize().map_err(|error| error.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|error| error.to_string())?;
        Ok(true)
    }
}

const REMINDER_WIDTH: f64 = 360.0;
const REMINDER_MARGIN: f64 = 16.0;
const REMINDER_INITIAL_HEIGHT: f64 = 170.0;
/// Overlapping calls would otherwise each build a "reminder" window.
static REMINDER_LOCK: Mutex<()> = Mutex::new(());

// Async so window creation runs off the main thread; a sync command that builds a window can deadlock on Windows.
#[tauri::command]
async fn show_reminder_window(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = REMINDER_LOCK.lock().map_err(|error| error.to_string())?;
    if let Some(window) = app.get_webview_window("reminder") {
        window.show().map_err(|error| error.to_string())?;
        window.set_always_on_top(true).map_err(|error| error.to_string())?;
        return Ok(());
    }
    // A hidden webview may not render, so the window is pinned and shown first; the page then fits its height.
    let window = WebviewWindowBuilder::new(&app, "reminder", WebviewUrl::App("index.html".into()))
        .title("My Calendar")
        .icon(Image::from_bytes(include_bytes!("../icons/tray/show-64.png")).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?
        .inner_size(REMINDER_WIDTH, REMINDER_INITIAL_HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .build()
        .map_err(|error| error.to_string())?;
    place_reminder(&window, REMINDER_INITIAL_HEIGHT)
}

#[tauri::command]
async fn fit_reminder_window(window: tauri::WebviewWindow, height: f64) -> Result<(), String> {
    place_reminder(&window, height)
}

fn place_reminder(window: &tauri::WebviewWindow, height: f64) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let height = height.clamp(80.0, 640.0);
    window
        .set_size(tauri::LogicalSize::new(REMINDER_WIDTH, height))
        .map_err(|error| error.to_string())?;
    let x = area.position.x as f64 + area.size.width as f64 - (REMINDER_WIDTH + REMINDER_MARGIN) * scale;
    let y = area.position.y as f64 + area.size.height as f64 - (height + REMINDER_MARGIN) * scale;
    window
        .set_position(tauri::PhysicalPosition::new(x.round() as i32, y.round() as i32))
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_always_on_top(true).map_err(|error| error.to_string())
}

/// Fits the event editor's height to its form, keeping its width and staying inside the work area.
#[tauri::command]
async fn fit_editor_window(window: tauri::WebviewWindow, height: f64) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let area_top = area.position.y as f64 / scale;
    let area_height = area.size.height as f64 / scale;
    let height = height.clamp(EDITOR_MIN_HEIGHT, (area_height - 16.0).max(EDITOR_MIN_HEIGHT));
    let width = window.inner_size().map_err(|error| error.to_string())?.width as f64 / scale;
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let top = position.y as f64 / scale;
    let fitted = top.min(area_top + area_height - height - 8.0).max(area_top + 8.0);
    if (fitted - top).abs() >= 1.0 {
        window
            .set_position(tauri::LogicalPosition::new(position.x as f64 / scale, fitted))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

const EDITOR_MIN_HEIGHT: f64 = 240.0;

struct MenuWindow {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// Size and position from before a context menu grew the window. A second grow reuses it, so pads do not stack.
static MENU_WINDOW: Mutex<Option<MenuWindow>> = Mutex::new(None);

fn restore_menu_window(window: &tauri::WebviewWindow, held: MenuWindow) -> Result<(), String> {
    window
        .set_position(tauri::PhysicalPosition::new(held.x, held.y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(tauri::PhysicalSize::new(held.width, held.height))
        .map_err(|error| error.to_string())
}

/// Grows the window so a context menu can extend past the calendar. Ignored while maximized, which would
/// otherwise leave full screen. The page pins the calendar; closing the menu restores this geometry.
#[tauri::command]
async fn grow_window_for_menu(
    window: tauri::WebviewWindow,
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        return Ok(());
    }
    let saved = {
        let mut slot = MENU_WINDOW.lock().map_err(|error| error.to_string())?;
        if slot.is_none() {
            let pos = window.outer_position().map_err(|error| error.to_string())?;
            let size = window.inner_size().map_err(|error| error.to_string())?;
            *slot = Some(MenuWindow {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
            });
        }
        slot.as_ref().map(|held| (held.x, held.y, held.width, held.height))
    };
    let Some((saved_x, saved_y, saved_width, saved_height)) = saved else {
        return Ok(());
    };
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    if scale <= 0.0 {
        return Ok(());
    }
    window
        .set_position(tauri::LogicalPosition::new(
            saved_x as f64 / scale - left,
            saved_y as f64 / scale - top,
        ))
        .map_err(|error| error.to_string())?;
    window
        .set_size(tauri::LogicalSize::new(
            (saved_width as f64 / scale + left + right).ceil().max(1.0),
            (saved_height as f64 / scale + top + bottom).ceil().max(1.0),
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn restore_window_after_menu(window: tauri::WebviewWindow) -> Result<(), String> {
    let held = MENU_WINDOW.lock().map_err(|error| error.to_string())?.take();
    if let Some(held) = held {
        restore_menu_window(&window, held)?;
    }
    Ok(())
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct MenuEntry {
    id: String,
    label: String,
    icon: String,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    separated: bool,
    #[serde(default)]
    checked: Option<bool>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct MenuPayload {
    generation: u64,
    label: String,
    entries: Vec<MenuEntry>,
}

struct MenuSession {
    generation: u64,
    anchor_x: f64,
    anchor_y: f64,
    payload: MenuPayload,
    settled: bool,
}

/// The open context menu. A newer open replaces it, so a dismiss from the previous one is ignored.
static MENU_SESSION: Mutex<Option<MenuSession>> = Mutex::new(None);
static MENU_GENERATION: AtomicU64 = AtomicU64::new(0);
static MENU_LOCK: Mutex<()> = Mutex::new(());

const MENU_PROVISIONAL_WIDTH: f64 = 320.0;
const MENU_PROVISIONAL_HEIGHT: f64 = 720.0;
const MENU_SCREEN_MARGIN: f64 = 6.0;

fn menu_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    WebviewWindowBuilder::new(app, "menu", WebviewUrl::App("index.html".into()))
        .title("Menu")
        .inner_size(MENU_PROVISIONAL_WIDTH, MENU_PROVISIONAL_HEIGHT)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .background_color(tauri::window::Color(0, 0, 0, 0))
        .build()
        .map_err(|error| error.to_string())
}

fn present_menu(window: &tauri::WebviewWindow, anchor_x: f64, anchor_y: f64) -> Result<(), String> {
    window
        .set_size(tauri::LogicalSize::new(MENU_PROVISIONAL_WIDTH, MENU_PROVISIONAL_HEIGHT))
        .map_err(|error| error.to_string())?;
    window
        .set_position(tauri::LogicalPosition::new(anchor_x, anchor_y))
        .map_err(|error| error.to_string())?;
    let _ = window.set_always_on_top(true);
    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

/// The monitor that contains the cursor, so a menu opened on a side screen stays on that screen.
fn monitor_for_anchor(window: &tauri::WebviewWindow, x: f64, y: f64) -> Option<tauri::Monitor> {
    if let Ok(monitors) = window.available_monitors() {
        for monitor in monitors {
            let scale = monitor.scale_factor();
            if scale <= 0.0 {
                continue;
            }
            let pos = monitor.position();
            let size = monitor.size();
            let left = pos.x as f64 / scale;
            let top = pos.y as f64 / scale;
            let right = left + size.width as f64 / scale;
            let bottom = top + size.height as f64 / scale;
            if x >= left && x < right && y >= top && y < bottom {
                return Some(monitor);
            }
        }
    }
    window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
}

fn axis_origin(anchor: f64, size: f64, start: f64, end: f64, margin: f64) -> f64 {
    let forward = anchor;
    let backward = anchor - size;
    let fits = |origin: f64| origin >= start + margin && origin + size <= end - margin;
    let chosen = if fits(forward) {
        forward
    } else if fits(backward) {
        backward
    } else {
        let room_forward = end - margin - (anchor + size);
        let room_backward = backward - (start + margin);
        if room_backward > room_forward { backward } else { forward }
    };
    let min = start + margin;
    let max = (end - margin - size).max(min);
    chosen.clamp(min, max)
}

/// Builds the menu window once and keeps it, so the first right-click does not wait on a new webview.
#[tauri::command]
async fn prepare_menu_window(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = MENU_LOCK.lock().map_err(|error| error.to_string())?;
    if app.get_webview_window("menu").is_none() {
        menu_window(&app)?;
    }
    Ok(())
}

/// Opens the context menu in its own window, at the cursor, so it can extend past the calendar.
#[tauri::command]
async fn open_menu_window(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    x: f64,
    y: f64,
    label: String,
    entries: Vec<MenuEntry>,
) -> Result<(), String> {
    let _guard = MENU_LOCK.lock().map_err(|error| error.to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    if scale <= 0.0 {
        return Ok(());
    }
    let origin = window.inner_position().map_err(|error| error.to_string())?;
    let anchor_x = origin.x as f64 / scale + x;
    let anchor_y = origin.y as f64 / scale + y;
    let generation = MENU_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    {
        let mut slot = MENU_SESSION.lock().map_err(|error| error.to_string())?;
        *slot = Some(MenuSession {
            generation,
            anchor_x,
            anchor_y,
            payload: MenuPayload {
                generation,
                label,
                entries,
            },
            settled: false,
        });
    }
    let menu = match app.get_webview_window("menu") {
        Some(existing) => existing,
        None => menu_window(&app)?,
    };
    present_menu(&menu, anchor_x, anchor_y)?;
    app.emit_to("menu", "menu-open", generation)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn menu_payload() -> Result<Option<MenuPayload>, String> {
    let slot = MENU_SESSION.lock().map_err(|error| error.to_string())?;
    Ok(slot.as_ref().map(|session| session.payload.clone()))
}

/// Sizes the menu window to its contents and keeps that window on the work area, outside the calendar if needed.
#[tauri::command]
async fn place_menu_window(window: tauri::WebviewWindow, width: f64, height: f64, generation: u64) -> Result<(), String> {
    if !width.is_finite() || !height.is_finite() {
        return Ok(());
    }
    let (anchor_x, anchor_y) = {
        let slot = MENU_SESSION.lock().map_err(|error| error.to_string())?;
        let Some(session) = slot.as_ref() else {
            return Ok(());
        };
        if session.generation != generation || session.settled {
            return Ok(());
        }
        (session.anchor_x, session.anchor_y)
    };
    let Some(monitor) = monitor_for_anchor(&window, anchor_x, anchor_y) else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    if scale <= 0.0 {
        return Ok(());
    }
    let area = monitor.work_area();
    let area_left = area.position.x as f64 / scale;
    let area_top = area.position.y as f64 / scale;
    let area_right = area_left + area.size.width as f64 / scale;
    let area_bottom = area_top + area.size.height as f64 / scale;
    let max_w = (area_right - area_left - MENU_SCREEN_MARGIN * 2.0).max(1.0);
    let max_h = (area_bottom - area_top - MENU_SCREEN_MARGIN * 2.0).max(1.0);
    let width = width.ceil().clamp(1.0, max_w);
    let height = height.ceil().clamp(1.0, max_h);
    let x = axis_origin(anchor_x, width, area_left, area_right, MENU_SCREEN_MARGIN);
    let y = axis_origin(anchor_y, height, area_top, area_bottom, MENU_SCREEN_MARGIN);
    {
        let slot = MENU_SESSION.lock().map_err(|error| error.to_string())?;
        let Some(session) = slot.as_ref() else {
            return Ok(());
        };
        if session.generation != generation || session.settled {
            return Ok(());
        }
    }
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    let _ = window.set_always_on_top(true);
    window.show().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

/// Hides the menu window and tells the calendar which item was chosen. A stale generation is ignored.
#[tauri::command]
async fn finish_menu(app: tauri::AppHandle, id: Option<String>, generation: u64) -> Result<(), String> {
    {
        let mut slot = MENU_SESSION.lock().map_err(|error| error.to_string())?;
        let Some(session) = slot.as_mut() else {
            return Ok(());
        };
        if session.generation != generation || session.settled {
            return Ok(());
        }
        session.settled = true;
    }
    if let Some(window) = app.get_webview_window("menu") {
        let _ = window.hide();
    }
    app.emit_to("main", "menu-result", id)
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Overlapping calls would otherwise each build the same settings or events window.
static AUX_LOCK: Mutex<()> = Mutex::new(());

// Async for the same reason as show_reminder_window: building the window inside a sync command blocks every
// later command from the calendar until the app restarts.
#[tauri::command]
async fn open_aux_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let _guard = AUX_LOCK.lock().map_err(|error| error.to_string())?;
    open_aux(&app, &label)
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if url != "https://date.nager.at" && url != "https://date.nager.at/" {
        return Err("url not allowed".into());
    }
    open::that(url).map_err(|error| error.to_string())?;
    Ok(())
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let language = read_install_language_value().unwrap_or_else(|| "en".to_string());
    let (show_label, settings_label, about_label, quit_label, tooltip) = labels(&language);
    let show = tray_menu_item(app, "toggle", show_label, tray_icon_bytes!("show"))?;
    let events = tray_menu_item(app, "events", events_label(&language), tray_icon_bytes!("events"))?;
    let settings = tray_menu_item(app, "settings", settings_label, tray_icon_bytes!("settings"))?;
    let language_item = tray_menu_item(
        app,
        "language",
        language_switch_label(&language),
        language_switch_icon(&language),
    )?;
    let about = tray_menu_item(app, "about", about_label, tray_icon_bytes!("about"))?;
    let quit = tray_menu_item(app, "quit", quit_label, tray_icon_bytes!("quit"))?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &events, &settings, &language_item, &about, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_main(app),
            "events" => {
                let _ = open_aux(app, "events");
            }
            "settings" => {
                let _ = open_aux(app, "settings");
            }
            // The calendar window picks the About tab before it opens the settings window.
            "about" => {
                let _ = app.emit_to("main", "tray-about", ());
            }
            "language" => {
                let state = app.state::<TrayState>();
                let current = state.current_language.lock().map(|value| value.clone()).unwrap_or_default();
                let next = other_language(&current);
                // Flip the item right away; the webview then confirms every label through update_tray_labels.
                let _ = set_language_item(&state, next, language_switch_label(next));
                let _ = app.emit("tray-language", next);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    app.manage(TrayState {
        show,
        events,
        settings,
        language: language_item,
        about,
        quit,
        current_language: Mutex::new(language),
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            toggle_main(app);
        }))
        .plugin(tauri_plugin_autostart::Builder::new().app_name("My Calendar").build())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // Minimizing from the OS (Win+Down) also goes to the tray, so no taskbar button or desktop stub appears.
                WindowEvent::Resized(_) if window.is_minimized().unwrap_or(false) => {
                    let _ = window.hide();
                }
                // Covers maximizing from the OS too (Win+Up, dragging to the top edge, double-clicking).
                // Queued from another thread so the layer is applied after the size change in progress finishes.
                WindowEvent::Resized(_) => {
                    let app = window.app_handle().clone();
                    std::thread::spawn(move || {
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || {
                            let _ = apply_main_layer(&handle, false);
                        });
                    });
                }
                _ => {}
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            install_language,
            update_tray_labels,
            set_main_always_on_top,
            hide_main,
            minimize_main,
            toggle_maximize_main,
            open_aux_window,
            open_external,
            show_reminder_window,
            fit_reminder_window,
            fit_editor_window,
            grow_window_for_menu,
            restore_window_after_menu,
            prepare_menu_window,
            open_menu_window,
            menu_payload,
            place_menu_window,
            finish_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running My Calendar");
}
