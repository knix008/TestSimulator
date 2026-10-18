use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;

mod edit_menu;
mod print_job;

// The calculator window is not a free rectangle. Each mode has one content
// size, and the page asks for it by name. The same numbers size `.app` in CSS.
const MODE_CONTENT_SIZE: &[(&str, f64, f64)] = &[
    ("basic", 360.0, 594.0),
    ("scientific", 560.0, 594.0),
    ("programmer", 480.0, 700.0),
    ("stats", 560.0, 810.0),
    ("currency", 360.0, 594.0),
    ("unit", 360.0, 594.0),
    ("date", 360.0, 594.0),
    ("graph", 520.0, 594.0),
];

struct ChildSpec {
    width: f64,
    height: f64,
    min_width: f64,
    min_height: f64,
    title: &'static str,
    // The graph page uses the desktop class for its own frame. The other
    // pages style themselves from the pop class alone.
    desktop: bool,
    fixed: bool,
}

fn child_spec(kind: &str) -> Option<ChildSpec> {
    Some(match kind {
        "graph" => ChildSpec {
            width: 1140.0,
            height: 700.0,
            // Narrower than this and the toolbar would fold onto a second line.
            // The same floor is GRAPH_MIN_WIDTH / GRAPH_MIN_HEIGHT in src/app.js.
            min_width: 870.0,
            min_height: 520.0,
            title: "MyCalc 10.0 Graph",
            desktop: true,
            fixed: false,
        },
        "settings" => ChildSpec {
            width: 780.0,
            height: 520.0,
            min_width: 720.0,
            min_height: 460.0,
            title: "설정 — MyCalc 10.0",
            desktop: false,
            fixed: false,
        },
        "info" => ChildSpec {
            width: 560.0,
            height: 436.0,
            min_width: 560.0,
            min_height: 436.0,
            title: "프로그램 정보 — MyCalc 10.0",
            desktop: false,
            fixed: true,
        },
        "help" => ChildSpec {
            width: 720.0,
            height: 640.0,
            min_width: 560.0,
            min_height: 420.0,
            title: "그래프 도움말 — MyCalc 10.0",
            desktop: false,
            fixed: false,
        },
        "memo" => ChildSpec {
            width: 760.0,
            height: 640.0,
            // The same floor is MEMO_MIN_WIDTH / MEMO_MIN_HEIGHT in src/memo.js.
            min_width: 600.0,
            min_height: 440.0,
            title: "메모장 — MyCalc 10.0",
            desktop: false,
            fixed: false,
        },
        _ => return None,
    })
}

struct AppState {
    // A window remembers the smallest size it was opened with. A drag that
    // reports a smaller box is raised back to this floor.
    floors: Mutex<HashMap<String, (f64, f64)>>,
}

#[derive(serde::Deserialize)]
struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(serde::Serialize)]
struct WindowState {
    maximized: bool,
}

#[derive(serde::Serialize)]
struct SaveOutcome {
    canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn mode_size(mode: &str) -> Option<(f64, f64)> {
    MODE_CONTENT_SIZE
        .iter()
        .find(|(name, _, _)| *name == mode)
        .map(|(_, width, height)| (*width, *height))
}

fn lock_content(window: &WebviewWindow, width: f64, height: f64) {
    let size = LogicalSize::new(width, height);
    let _ = window.set_resizable(true);
    let _ = window.set_min_size(Some(size));
    let _ = window.set_max_size(Some(size));
    let _ = window.set_size(size);
    let _ = window.set_resizable(false);
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }
    if window.is_fullscreen().unwrap_or(false) {
        let _ = window.set_fullscreen(false);
    }
}

fn remember_floor(app: &AppHandle, label: &str, width: f64, height: f64) {
    if let Some(state) = app.try_state::<AppState>() {
        state
            .floors
            .lock()
            .expect("window floors")
            .insert(label.to_string(), (width, height));
    }
}

fn page_url(kind: &str, desktop: bool) -> WebviewUrl {
    let query = if desktop {
        format!("index.html?pop={kind}&desktop=1")
    } else {
        format!("index.html?pop={kind}")
    };
    WebviewUrl::App(query.into())
}

fn shell<R: tauri::Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'_, R, M>,
) -> WebviewWindowBuilder<'_, R, M> {
    builder
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .zoom_hotkeys_enabled(false)
        .center()
}

fn watch_maximized(window: &WebviewWindow) {
    let watch = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Resized(_)) {
            let maximized = watch.is_maximized().unwrap_or(false);
            let _ = watch.emit("window-state", serde_json::json!({ "maximized": maximized }));
        }
    });
}

fn hold_still(window: &WebviewWindow) {
    let guard = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Resized(_)) {
            if guard.is_maximized().unwrap_or(false) {
                let _ = guard.unmaximize();
            }
            if guard.is_fullscreen().unwrap_or(false) {
                let _ = guard.set_fullscreen(false);
            }
            round_corners(&guard);
        }
    });
}

fn round_corners(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        let Ok(handle) = window.window_handle() else {
            return;
        };
        let RawWindowHandle::Win32(raw) = handle.as_raw() else {
            return;
        };
        unsafe { clip_round_corners(raw.hwnd.get() as isize) };
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
unsafe fn clip_round_corners(hwnd: isize) {
    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetDpiForWindow(hwnd: isize) -> u32;
        fn GetWindowRect(hwnd: isize, rect: *mut Rect) -> i32;
        fn SetWindowRgn(hwnd: isize, region: isize, redraw: i32) -> i32;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateRoundRectRgn(left: i32, top: i32, right: i32, bottom: i32, width: i32, height: i32) -> isize;
    }
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(hwnd: isize, attribute: u32, value: *const u32, size: u32) -> i32;
    }
    let mut rect = Rect { left: 0, top: 0, right: 0, bottom: 0 };
    if GetWindowRect(hwnd, &mut rect) == 0 {
        return;
    }
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    if width < 20 || height < 20 {
        return;
    }
    let mut dpi = GetDpiForWindow(hwnd);
    if dpi == 0 {
        dpi = 96;
    }
    // The same 16px the calculator card uses. Windows 11 would otherwise
    // round the frame again, a little less, on top of this.
    let radius = (16 * dpi / 96) as i32;
    let region = CreateRoundRectRgn(0, 0, width, height, radius * 2, radius * 2);
    if region == 0 {
        return;
    }
    SetWindowRgn(hwnd, region, 1);
    let square: u32 = 1;
    DwmSetWindowAttribute(hwnd, 33, &square, 4);
}

fn open_child(app: &AppHandle, kind: &str) -> Result<(), String> {
    let spec = child_spec(kind).ok_or_else(|| "window".to_string())?;
    if let Some(existing) = app.get_webview_window(kind) {
        let _ = existing.set_focus();
        return Ok(());
    }
    let mut builder = shell(WebviewWindowBuilder::new(
        app,
        kind,
        page_url(kind, spec.desktop),
    ))
    .title(spec.title)
    .inner_size(spec.width, spec.height);
    if spec.fixed {
        builder = builder
            .min_inner_size(spec.width, spec.height)
            .max_inner_size(spec.width, spec.height)
            .resizable(false)
            .maximizable(false)
            .fullscreen(false);
    } else {
        builder = builder
            .min_inner_size(spec.min_width, spec.min_height)
            .resizable(true)
            .maximizable(true);
    }
    let child = builder.build().map_err(|err| err.to_string())?;
    edit_menu::hide_builtin_menu(&child);
    if spec.fixed {
        lock_content(&child, spec.width, spec.height);
        hold_still(&child);
    } else {
        remember_floor(app, kind, spec.min_width, spec.min_height);
        watch_maximized(&child);
    }
    Ok(())
}

fn open_print(app: &AppHandle, owner: &WebviewWindow) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("print") {
        let _ = existing.set_focus();
        return Ok(());
    }
    let child = shell(WebviewWindowBuilder::new(
        app,
        "print",
        page_url("print", false),
    ))
    .title("인쇄 — MyCalc 10.0")
    .inner_size(920.0, 680.0)
    .min_inner_size(760.0, 520.0)
    .resizable(true)
    .maximizable(true)
    .parent(owner)
    .map_err(|err| err.to_string())?
    .build()
    .map_err(|err| err.to_string())?;
    remember_floor(app, "print", 760.0, 520.0);
    watch_maximized(&child);
    edit_menu::hide_builtin_menu(&child);
    Ok(())
}

#[tauri::command]
fn list_printers() -> Vec<print_job::PrinterInfo> {
    print_job::list_printers()
}

#[tauri::command]
async fn print_page(
    window: WebviewWindow,
    options: print_job::PrintOptions,
) -> print_job::PrintOutcome {
    tauri::async_runtime::spawn_blocking(move || print_job::print_page(&window, options))
        .await
        .unwrap_or(print_job::PrintOutcome {
            success: false,
            failure_reason: "print failed".into(),
        })
}

#[tauri::command]
fn set_content_size(window: WebviewWindow, mode: String) {
    if window.label() != "main" {
        return;
    }
    let Some((width, height)) = mode_size(&mode) else {
        return;
    };
    lock_content(&window, width, height);
}

#[tauri::command]
fn window_control(window: WebviewWindow, action: String) -> WindowState {
    // The calculator window has one size per mode. It does not maximize.
    if window.label() == "main" {
        if action == "minimize" {
            let _ = window.minimize();
        }
        return WindowState { maximized: false };
    }
    if action == "minimize" {
        let _ = window.minimize();
    } else if action == "maximize" {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
    WindowState {
        maximized: window.is_maximized().unwrap_or(false),
    }
}

#[tauri::command]
fn set_bounds(window: WebviewWindow, state: tauri::State<AppState>, bounds: Bounds) {
    if window.label() == "main" || window.is_maximized().unwrap_or(false) {
        return;
    }
    let floor = state
        .floors
        .lock()
        .expect("window floors")
        .get(window.label())
        .copied();
    let (min_width, min_height) = floor.unwrap_or((1.0, 1.0));
    let width = bounds.width.max(min_width);
    let height = bounds.height.max(min_height);
    if ![bounds.x, bounds.y, width, height]
        .iter()
        .all(|value| value.is_finite())
    {
        return;
    }
    let minimum = LogicalSize::new(min_width, min_height);
    let _ = window.set_min_size(Some(minimum));
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.set_position(LogicalPosition::new(bounds.x, bounds.y));
    let _ = window.set_min_size(Some(minimum));
}

#[tauri::command]
fn open_window(app: AppHandle, window: WebviewWindow, kind: String) -> Result<(), String> {
    // The button's command is running on the UI thread. Building the graph
    // window there waits for that same thread, so the calculator never gets
    // another turn. Hand the creation to the next turn and return now.
    let owner = window.clone();
    std::thread::spawn(move || {
        let queued = app.clone();
        let _ = queued.run_on_main_thread(move || {
            let _ = if kind == "print" {
                open_print(&app, &owner)
            } else {
                open_child(&app, &kind)
            };
        });
    });
    Ok(())
}

#[tauri::command]
fn save_file(window: WebviewWindow, name: String, bytes: Vec<u8>) -> SaveOutcome {
    if bytes.len() < 8 || bytes.len() > 40 * 1024 * 1024 {
        return SaveOutcome {
            canceled: true,
            error: Some("invalid".into()),
        };
    }
    let mut safe = name.replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    if safe.trim().is_empty() {
        safe = "MyCalc-10.0.png".into();
    }
    let ext = safe.rsplit('.').next().unwrap_or("png").to_ascii_lowercase();
    let ext = if ext.is_empty() || ext == safe.to_ascii_lowercase() {
        "png".to_string()
    } else {
        ext
    };
    let picked = window
        .dialog()
        .file()
        .set_file_name(&safe)
        .add_filter(ext.to_uppercase(), &[&ext])
        .blocking_save_file();
    let Some(file) = picked else {
        return SaveOutcome {
            canceled: true,
            error: None,
        };
    };
    let path = match file.into_path() {
        Ok(path) => path,
        Err(_) => {
            return SaveOutcome {
                canceled: true,
                error: Some("save".into()),
            };
        }
    };
    match std::fs::write(&path, &bytes) {
        Ok(()) => SaveOutcome {
            canceled: false,
            error: None,
        },
        Err(err) => SaveOutcome {
            canceled: true,
            error: Some(err.to_string()),
        },
    }
}

fn close_children(app: &AppHandle) {
    for label in ["graph", "settings", "info", "help", "memo", "print"] {
        if let Some(child) = app.get_webview_window(label) {
            let _ = child.close();
        }
    }
}

#[tauri::command]
fn close_window(app: AppHandle, window: WebviewWindow) {
    if window.label() == "main" {
        close_children(&app);
    }
    let _ = window.close();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            floors: Mutex::new(HashMap::new()),
        })
        .manage(edit_menu::EditState::new())
        .invoke_handler(tauri::generate_handler![
            set_content_size,
            window_control,
            set_bounds,
            open_window,
            close_window,
            save_file,
            list_printers,
            print_page,
            edit_menu::edit_menu
        ])
        .setup(|app| {
            edit_menu::install(app.handle());
            let Some(main) = app.get_webview_window("main") else {
                return Ok(());
            };
            lock_content(&main, 360.0, 594.0);
            // An opaque window appears as soon as it exists. The corners are
            // still rounded, so the desktop shows through them.
            round_corners(&main);
            hold_still(&main);
            edit_menu::hide_builtin_menu(&main);
            let handle = app.handle().clone();
            main.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                    close_children(&handle);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MyCalc");
}
