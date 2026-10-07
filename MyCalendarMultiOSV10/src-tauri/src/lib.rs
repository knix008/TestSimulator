use std::fs;
use std::path::PathBuf;

use tauri::image::Image;
use tauri::menu::{IconMenuItem, Menu, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use std::sync::atomic::{AtomicBool, Ordering};
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
    if label == "print" {
        // Not in the tray, so there is no label to copy; the page sets its own title once it loads.
        let language = read_install_language_value().unwrap_or_else(|| "en".to_string());
        return if language == "ko" { "인쇄 미리 보기" } else { "Print preview" }.to_string();
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
    if label != "settings" && label != "events" && label != "print" {
        return Err("unknown window".into());
    }
    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    // The print preview shows whole pages beside its options, so it is wide and can be resized.
    let (icon, width, height, min_width, min_height, resizable): (&[u8], f64, f64, f64, f64, bool) = match label {
        "events" => (include_bytes!("../icons/tray/events-64.png"), 520.0, 640.0, 380.0, 420.0, false),
        "print" => (include_bytes!("../icons/tray/print-64.png"), 1040.0, 720.0, 760.0, 520.0, true),
        _ => (include_bytes!("../icons/tray/settings-64.png"), 520.0, 624.0, 380.0, 420.0, false),
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
            fit_reminder_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running My Calendar");
}
