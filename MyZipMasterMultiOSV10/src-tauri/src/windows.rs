//! Frameless windows: the main one, and Settings and About as windows of their own.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window, WindowEvent};

const MAIN: &str = "main";
const DEFAULT_SIZE: (f64, f64) = (1280.0, 800.0);
/// A floor until the page has measured its toolbar.
const FLOOR: (f64, f64) = (720.0, 480.0);

/// The smallest the main window may be, in logical pixels of page content.
#[derive(Default)]
pub struct MinSize(Mutex<Option<(f64, f64)>>);

pub fn create_main(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("MyZipMaster")
        .inner_size(DEFAULT_SIZE.0, DEFAULT_SIZE.1)
        .min_inner_size(FLOOR.0, FLOOR.1)
        .decorations(false)
        .visible(false)
        .build()?;
    crate::window_icon::apply(&window);
    // Whatever happens to the page, the program never stays invisible.
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        reveal_main(&handle);
    });
    Ok(())
}

static MAIN_SHOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn reveal_main(app: &AppHandle) {
    if MAIN_SHOWN.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The page has something to show.
#[tauri::command]
pub fn window_ready(app: AppHandle) {
    reveal_main(&app);
}

/// Border the frameless window has around its page: on Windows the minimum applies to the outer
/// rectangle, which includes an invisible resize border.
fn frame_extra(window: &WebviewWindow) -> (f64, f64) {
    let scale = window.scale_factor().unwrap_or(1.0);
    match (window.outer_size(), window.inner_size()) {
        (Ok(outer), Ok(inner)) => (
            (outer.width.saturating_sub(inner.width)) as f64 / scale,
            (outer.height.saturating_sub(inner.height)) as f64 / scale,
        ),
        _ => (0.0, 0.0),
    }
}

/// The page measured its toolbar: nothing may ever be cut off, so the window stops there.
#[tauri::command]
pub fn set_min_window_size(app: AppHandle, state: tauri::State<'_, MinSize>, width: f64, height: f64) -> Result<(), String> {
    let window = app.get_webview_window(MAIN).ok_or("no main window")?;
    let (w, h) = (width.max(FLOOR.0), height.max(FLOOR.1));
    *state.0.lock().unwrap() = Some((w, h));
    let (ew, eh) = frame_extra(&window);
    window
        .set_min_size(Some(Size::Logical(LogicalSize::new(w + ew, h + eh))))
        .map_err(|e| e.to_string())?;
    grow_if_small(&window, w, h);
    Ok(())
}

fn grow_if_small(window: &WebviewWindow, w: f64, h: f64) {
    let scale = window.scale_factor().unwrap_or(1.0);
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    if let Ok(now) = window.inner_size() {
        let (cw, ch) = (now.width as f64 / scale, now.height as f64 / scale);
        if cw + 0.5 < w || ch + 0.5 < h {
            let _ = window.set_size(Size::Logical(LogicalSize::new(cw.max(w), ch.max(h))));
        }
    }
}

/// `set_min_size` only binds the user's own dragging. Snap and other programs go straight past
/// it, so anything too small is sent back here.
pub fn on_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN {
        return;
    }
    if let WindowEvent::Resized(_) = event {
        let app = window.app_handle();
        let Some(state) = app.try_state::<MinSize>() else { return };
        let min = *state.0.lock().unwrap();
        if let (Some((w, h)), Some(main)) = (min, app.get_webview_window(MAIN)) {
            grow_if_small(&main, w, h);
        }
    }
}

/// Windows honours the CSS drag region; macOS and Linux need asking.
#[tauri::command]
pub fn start_window_drag(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// Window creation waits on the main thread, so these must be async: a synchronous command runs
/// on that thread and would wait for itself.
async fn open_child(app: AppHandle, label: &str, route: &str, width: f64, height: f64, resizable: bool) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.set_focus();
        return Ok(());
    }
    let mut b = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(format!("index.html#{route}").into()))
        .title("MyZipMaster")
        .inner_size(width, height)
        .min_inner_size(width.min(560.0), height.min(420.0))
        .decorations(false)
        .resizable(resizable)
        .center();
    if let Some(main) = app.get_webview_window(MAIN) {
        b = b.parent(&main).map_err(|e| e.to_string())?;
    }
    let child = b.build().map_err(|e| e.to_string())?;
    crate::window_icon::apply(&child);
    Ok(())
}

const THEME_MENU: &str = "theme-menu";
const THEME_MENU_WIDTH: f64 = 340.0;
const THEME_MENU_HEIGHT: f64 = 640.0;

/// The theme menu is a window of its own, so it can reach past the edge of a small main window.
/// `x` is where its right edge goes and `y` its top, in the main window's page coordinates.
#[tauri::command]
pub async fn show_theme_menu(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let main = app.get_webview_window(MAIN).ok_or("no main window")?;
    let scale = main.scale_factor().map_err(|e| e.to_string())?;
    let origin = main.inner_position().map_err(|e| e.to_string())?;
    let menu = match app.get_webview_window(THEME_MENU) {
        Some(existing) => existing,
        None => WebviewWindowBuilder::new(&app, THEME_MENU, WebviewUrl::App("index.html#thememenu".into()))
            .title("MyZipMaster")
            .inner_size(THEME_MENU_WIDTH, THEME_MENU_HEIGHT)
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .visible(false)
            .parent(&main)
            .map_err(|e| e.to_string())?
            .build()
            .map_err(|e| e.to_string())?,
    };
    let width = menu.outer_size().map(|s| s.width as f64).unwrap_or(THEME_MENU_WIDTH * scale);
    let height = menu.outer_size().map(|s| s.height as f64).unwrap_or(THEME_MENU_HEIGHT * scale);
    let mut left = origin.x as f64 + x * scale - width;
    let mut top = origin.y as f64 + y * scale;
    // Stay on the screen.
    if let Ok(Some(monitor)) = main.current_monitor() {
        let m = monitor.position();
        left = left.min(m.x as f64 + monitor.size().width as f64 - width).max(m.x as f64);
        top = top.min(m.y as f64 + monitor.size().height as f64 - height).max(m.y as f64);
    }
    menu.set_position(Position::Physical(PhysicalPosition::new(left as i32, top as i32))).map_err(|e| e.to_string())?;
    menu.show().map_err(|e| e.to_string())?;
    menu.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_theme_menu(app: AppHandle) -> Result<(), String> {
    if let Some(menu) = app.get_webview_window(THEME_MENU) {
        menu.hide().map_err(|e| e.to_string())?;
    }
    app.emit("theme-menu-closed", ()).map_err(|e| e.to_string())
}

/// The page measured the menu. Never smaller than a real menu, whatever a page mid-load reports.
#[tauri::command]
pub fn fit_theme_menu(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    if width < 200.0 || height < 100.0 {
        return Ok(());
    }
    if let Some(menu) = app.get_webview_window(THEME_MENU) {
        menu.set_size(Size::Logical(LogicalSize::new(width, height))).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    // A fixed size: everything in it fits, so it never needs a scrollbar.
    open_child(app, "settings", "settings", 580.0, 640.0, false).await
}

#[tauri::command]
pub async fn open_guide_window(app: AppHandle) -> Result<(), String> {
    open_child(app, "guide", "guide", 1000.0, 720.0, true).await
}

#[tauri::command]
pub async fn open_about_window(app: AppHandle) -> Result<(), String> {
    open_child(app, "about", "about", 560.0, 740.0, false).await
}
