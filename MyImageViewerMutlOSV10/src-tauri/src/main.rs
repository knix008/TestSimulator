#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod host;
mod window_icon;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// The image the app was started with ("Open with", a double-clicked file): the first
/// argument that is an existing file; the page asks for it once it is up (get-launch-file).
fn launch_file() -> Option<String> {
    std::env::args().skip(1).filter(|a| !a.starts_with('-')).find(|a| std::path::Path::new(a).is_file())
}

// ── Menu overlay: a page cannot draw outside its window, so context menus and drop-downs
// are drawn by a transparent window over the main window's monitor work area that never
// takes the focus (src/popup.html + src/js/popupMenu.js, driven by contextMenu.js). ──
const MAIN: &str = "main";
const MENU_OVERLAY: &str = "menu-overlay";

#[derive(Default)]
struct MenuState {
    /// The menu on screen (or being drawn): its seq and the message the overlay draws it from.
    open: Mutex<Option<serde_json::Value>>,
}

fn menu_overlay(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(MENU_OVERLAY) {
        return Ok(w);
    }
    let mut builder = WebviewWindowBuilder::new(app, MENU_OVERLAY, WebviewUrl::App("popup.html".into()))
        .title("MyImageViewer")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .inner_size(16.0, 16.0);
    if let Some(main) = app.get_webview_window(MAIN) {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }
    builder.build().map_err(|e| e.to_string())
}

/// show() would activate the overlay: the main window's blur closes the menu at once and
/// keys would stop reaching it. Shown (and hidden) natively instead, the way menus are;
/// tao never sees that show, so its hide() would be a no-op and leave a click-eating window.
fn show_native(w: &WebviewWindow, visible: bool) {
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        #[link(name = "user32")]
        extern "system" {
            fn ShowWindow(hwnd: isize, cmd: i32) -> i32;
        }
        const SW_HIDE: i32 = 0;
        const SW_SHOWNOACTIVATE: i32 = 4;
        if let Ok(handle) = w.window_handle() {
            if let RawWindowHandle::Win32(raw) = handle.as_raw() {
                unsafe { ShowWindow(raw.hwnd.get() as isize, if visible { SW_SHOWNOACTIVATE } else { SW_HIDE }) };
                return;
            }
        }
    }
    let _ = if visible { w.show() } else { w.hide() };
}

/// Open a menu. `payload` is what contextMenu.js serialised ({ seq, x, y, items, … }) with
/// x / y in CSS px of the main window; the overlay gets the offset to its own coordinates.
#[tauri::command]
fn popup_menu_show(app: AppHandle, payload: serde_json::Value) -> Result<bool, String> {
    let main = app.get_webview_window(MAIN).ok_or("no main window")?;
    let overlay = menu_overlay(&app)?;
    let scale = main.scale_factor().unwrap_or(1.0);
    let inner = main.inner_position().map_err(|e| e.to_string())?;
    let (pos, size) = match main.current_monitor() {
        Ok(Some(m)) => (m.work_area().position, m.work_area().size),
        _ => (main.outer_position().map_err(|e| e.to_string())?, main.outer_size().map_err(|e| e.to_string())?),
    };
    let _ = overlay.set_position(tauri::PhysicalPosition::new(pos.x, pos.y));
    let _ = overlay.set_size(tauri::PhysicalSize::new(size.width, size.height));
    let msg = serde_json::json!({
        "payload": payload,
        "offset": { "x": f64::from(inner.x - pos.x) / scale, "y": f64::from(inner.y - pos.y) / scale },
    });
    *app.state::<MenuState>().open.lock().unwrap() = Some(msg.clone());
    let _ = app.emit_to(MENU_OVERLAY, "popup-show", msg);
    Ok(true)
}

fn open_seq(app: &AppHandle) -> Option<u64> {
    app.state::<MenuState>().open.lock().unwrap().as_ref()
        .and_then(|m| m.pointer("/payload/seq")).and_then(|v| v.as_u64())
}

/// The overlay has drawn menu `seq`: put it on screen, unless that menu was closed meanwhile.
#[tauri::command]
fn popup_menu_shown(app: AppHandle, seq: u64) -> bool {
    if open_seq(&app) != Some(seq) {
        return false;
    }
    if let Some(w) = app.get_webview_window(MENU_OVERLAY) {
        show_native(&w, true);
    }
    true
}

#[tauri::command]
fn popup_menu_hide(app: AppHandle) -> bool {
    let was = app.state::<MenuState>().open.lock().unwrap().take().is_some();
    if let Some(w) = app.get_webview_window(MENU_OVERLAY) {
        show_native(&w, false);
        let _ = app.emit_to(MENU_OVERLAY, "popup-hide", serde_json::Value::Null);
    }
    was
}

/// The open menu's rows changed (check marks, a removed recent entry).
#[tauri::command]
fn popup_menu_refresh(app: AppHandle, payload: serde_json::Value) -> bool {
    if open_seq(&app).is_none() {
        return false;
    }
    app.emit_to(MENU_OVERLAY, "popup-refresh", payload).is_ok()
}

/// The overlay page loaded after a menu was requested: that menu, if any.
#[tauri::command]
fn popup_menu_ready(app: AppHandle) -> Option<serde_json::Value> {
    app.state::<MenuState>().open.lock().unwrap().clone()
}

/// What the user did in the overlay (action / remove / title / closed) goes to the main page,
/// which owns the menus and runs the actions.
#[tauri::command]
fn popup_menu_event(app: AppHandle, ev: serde_json::Value) -> bool {
    let seq = ev.get("seq").and_then(|v| v.as_u64());
    let current = open_seq(&app);
    let closes = matches!(ev.get("type").and_then(|v| v.as_str()), Some("closed") | Some("action"));
    if closes && seq.is_some() && seq == current {
        app.state::<MenuState>().open.lock().unwrap().take();
        if let Some(w) = app.get_webview_window(MENU_OVERLAY) {
            show_native(&w, false);
        }
    }
    app.emit_to(MAIN, "popup-menu-event", ev).is_ok()
}

/// Win32 visibility of the overlay (tao does not track the native show / hide): an overlay
/// left on screen after its menu closed would swallow every click, so the checks read this.
#[tauri::command]
fn popup_menu_visible(app: AppHandle) -> bool {
    let Some(w) = app.get_webview_window(MENU_OVERLAY) else {
        return false;
    };
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        #[link(name = "user32")]
        extern "system" {
            fn IsWindowVisible(hwnd: isize) -> i32;
        }
        if let Ok(handle) = w.window_handle() {
            if let RawWindowHandle::Win32(raw) = handle.as_raw() {
                return unsafe { IsWindowVisible(raw.hwnd.get() as isize) } != 0;
            }
        }
    }
    w.is_visible().unwrap_or(false)
}

// ── Main window (built here, not in tauri.conf.json, so it can create dialog windows) ──
fn build_main_window(app: &AppHandle) -> tauri::Result<()> {
    let popups = app.clone();
    // Built where it was last time and in the theme's colour, so the window neither opens
    // white nor jumps when the page starts.
    let (place, background) = host::main_window_start();
    let num = |k: &str| place.get(k).and_then(serde_json::Value::as_f64);
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::default())
        .title("MyImageViewer")
        .inner_size(num("width").unwrap_or(1400.0), num("height").unwrap_or(900.0))
        .min_inner_size(1200.0, 600.0)
        .decorations(false)
        .resizable(true)
        .maximized(place.get("maximized").and_then(serde_json::Value::as_bool).unwrap_or(false));
    builder = match (num("x"), num("y")) {
        (Some(x), Some(y)) => builder.position(x, y),
        _ => builder.center(),
    };
    if let Some((r, g, b)) = background {
        builder = builder.background_color(tauri::window::Color(r, g, b, 255));
    }
    builder
        // window.open("about:blank#dialog-…") from the page = one of its dialogs
        // (dialogWindow.js); anything else is not ours to open.
        .on_new_window(move |url, features| {
            if url.scheme() == "about" {
                return dialog_window(&popups, &url, features);
            }
            NewWindowResponse::Deny
        })
        .build()?;
    // Big + small icon from the exe itself: taskbar / Alt+Tab show the same icon as
    // the shortcuts and the installer (tao only sets a small one)
    if let Some(main) = app.get_webview_window(MAIN) {
        window_icon::apply(&main);
    }
    Ok(())
}

// ── Dialog windows: the page's dialogs (Settings, About, Print, Resize …) move into
// their own window so they can sit past the main window's edge. The page opens
// about:blank#dialog-<id>, moves the dialog's DOM in (same origin, listeners and all),
// measures it and calls fit_dialog, which sizes, centres and shows the window. ──
fn dialog_label(fragment: Option<&str>) -> Option<String> {
    fragment
        .filter(|f| f.starts_with("dialog-") && f.len() < 64 && f.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        .map(str::to_string)
}

fn dialog_window(app: &AppHandle, url: &tauri::Url, features: NewWindowFeatures) -> NewWindowResponse<tauri::Wry> {
    let Some(label) = dialog_label(url.fragment()) else {
        return NewWindowResponse::Deny;
    };
    if app.get_webview_window(&label).is_some() {
        return NewWindowResponse::Deny;
    }
    let mut b = WebviewWindowBuilder::new(app, label, WebviewUrl::External("about:blank".parse().expect("about:blank")))
        .window_features(features)
        .title("MyImageViewer")
        .decorations(false)
        .resizable(true)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .visible(false)
        .min_inner_size(240.0, 120.0)
        .disable_drag_drop_handler();
    if let Some(main) = app.get_webview_window(MAIN) {
        b = match b.parent(&main) {
            Ok(next) => next,
            Err(_) => return NewWindowResponse::Deny,
        };
    }
    match b.build() {
        Ok(window) => {
            window_icon::apply(&window);
            NewWindowResponse::Create { window }
        }
        Err(_) => NewWindowResponse::Deny,
    }
}

/// The monitor work area of a window, in logical px: (x, y, w, h).
fn work_area(window: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let m = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten())?;
    let s = m.scale_factor();
    let a = m.work_area();
    Some((f64::from(a.position.x) / s, f64::from(a.position.y) / s, f64::from(a.size.width) / s, f64::from(a.size.height) / s))
}

/// Size a dialog window to its content (CSS px), centre it over the main window inside
/// the work area the first time (`place`), and show it.
#[tauri::command]
fn fit_dialog(app: AppHandle, label: String, width: f64, height: f64, place: bool) -> bool {
    if !label.starts_with("dialog-") {
        return false;
    }
    let Some(dialog) = app.get_webview_window(&label) else {
        return false;
    };
    let main = app.get_webview_window(MAIN);
    let anchor = main.as_ref().unwrap_or(&dialog);
    let (ax, ay, aw, ah) = work_area(anchor).unwrap_or((0.0, 0.0, 1920.0, 1080.0));
    let w = width.round().max(240.0).min(aw);
    let h = height.round().max(120.0).min(ah);
    let _ = dialog.set_size(tauri::LogicalSize::new(w, h));
    if place {
        let scale = anchor.scale_factor().unwrap_or(1.0);
        let (mx, my, mw, mh) = match (anchor.inner_position(), anchor.inner_size()) {
            (Ok(p), Ok(s)) => {
                let p = p.to_logical::<f64>(scale);
                let s = s.to_logical::<f64>(scale);
                (p.x, p.y, s.width, s.height)
            }
            _ => (ax, ay, aw, ah),
        };
        let x = (mx + (mw - w) / 2.0).round().clamp(ax, (ax + aw - w).max(ax));
        let y = (my + ((mh - h) / 2.0).max(24.0)).round().clamp(ay, (ay + ah - h).max(ay));
        // A frameless window's outer rect has an invisible resize border: place the client area
        let ds = dialog.scale_factor().unwrap_or(1.0);
        let (dx, dy) = match (dialog.inner_position(), dialog.outer_position()) {
            (Ok(i), Ok(o)) => (f64::from(i.x - o.x) / ds, f64::from(i.y - o.y) / ds),
            _ => (0.0, 0.0),
        };
        let _ = dialog.set_position(tauri::LogicalPosition::new((x - dx).round(), (y - dy).round()));
    }
    if !dialog.is_visible().unwrap_or(false) {
        let _ = dialog.show();
        let _ = dialog.set_focus();
        // Sized while still hidden, an undecorated window comes out a caption's height
        // taller (a blank band under the dialog's buttons); once shown, it takes the size
        // exactly — so give it again.
        let _ = dialog.set_size(tauri::LogicalSize::new(w, h));
    }
    true
}

#[tauri::command]
fn close_dialog(app: AppHandle, label: String) -> bool {
    if !label.starts_with("dialog-") {
        return false;
    }
    let closed = app.get_webview_window(&label).is_some_and(|w| w.destroy().is_ok());
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.set_focus();
    }
    closed
}

/// Start moving a dialog window by its title row (macOS / Linux; Windows uses app-region).
#[tauri::command]
fn dialog_start_dragging(app: AppHandle, label: String) -> bool {
    app.get_webview_window(&label).is_some_and(|w| w.start_dragging().is_ok())
}

// ── Drag-out: an in-app drag that leaves the window becomes a real OS file drag, so the
// files can be dropped on Explorer, the desktop or another app. Offered as copy only:
// a drop somewhere else never takes the original away. ──
fn drag_icon_path() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join("myimageviewer-drag.png");
    if !path.is_file() {
        std::fs::write(&path, include_bytes!("../icons/32x32.png")).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// Async so the command is not on the main thread while it waits for the drag there.
#[tauri::command]
async fn start_file_drag(window: WebviewWindow, paths: Vec<String>) -> Result<bool, String> {
    let files: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).filter(|p| p.exists()).collect();
    if files.is_empty() {
        return Ok(false);
    }
    let icon = drag_icon_path()?;
    let (tx, rx) = std::sync::mpsc::channel();
    let host = window.clone();
    window
        .run_on_main_thread(move || {
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                drag::start_drag(
                    &host,
                    drag::DragItem::Files(files),
                    drag::Image::File(icon),
                    |_, _| {},
                    drag::Options { skip_animatation_on_cancel_or_failure: false, mode: drag::DragMode::Copy },
                )
                .map_err(|e| e.to_string())
            }))
            .unwrap_or_else(|_| Err("drag failed".into()));
            let _ = tx.send(outcome);
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())??;
    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(MenuState::default())
        .invoke_handler(tauri::generate_handler![
            host::ipc,
            host::read_file_bytes,
            popup_menu_show,
            popup_menu_shown,
            popup_menu_hide,
            popup_menu_refresh,
            popup_menu_ready,
            popup_menu_event,
            popup_menu_visible,
            start_file_drag,
            fit_dialog,
            close_dialog,
            dialog_start_dragging,
        ])
        .on_window_event(|window, event| {
            if cfg!(debug_assertions) {
                match event {
                    tauri::WindowEvent::CloseRequested { .. } => eprintln!("[window] close requested: {}", window.label()),
                    tauri::WindowEvent::Destroyed => eprintln!("[window] destroyed: {}", window.label()),
                    _ => {}
                }
            }
            // The overlay is a second window: without this the app would outlive its main window.
            if window.label() == MAIN && matches!(event, tauri::WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .setup(|app| {
            host::init(app.handle(), launch_file());
            build_main_window(app.handle())?;
            // Built up front (hidden) so the first menu does not wait for a webview to start.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = menu_overlay(&handle) {
                    eprintln!("[myimageviewer] menu overlay: {err}");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MyImageViewer")
        .run(|_app, event| {
            if cfg!(debug_assertions) {
                if let tauri::RunEvent::ExitRequested { code, .. } = &event {
                    eprintln!("[app] exit requested, code {code:?}");
                }
            }
            if let tauri::RunEvent::Exit = event {
                host::shutdown();
            }
        });
}
