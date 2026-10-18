use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;

mod edit_menu;
mod instances;
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
            height: 660.0,
            min_width: 720.0,
            // Shorter than this and the four rows of theme swatches get squashed.
            min_height: 640.0,
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
    // Windows are built hidden. These are the ones somebody asked for, to be
    // shown once their page has loaded. A window built ahead of time is not
    // in here and stays hidden until its button is pressed.
    waiting: Mutex<HashSet<String>>,
    // Set once the calculator is closing, so no window is built ahead of time
    // that would keep the program running with nothing on screen.
    closing: AtomicBool,
    // How far this copy's windows step away from those of copies already open.
    cascade: AtomicU32,
}

// Building a WebView2 window holds the UI thread for a quarter of a second or
// more, and the page then takes as long again to load. The windows the
// calculator's own buttons open are built hidden in advance, and built again
// after each close, so a press only has to show one.
const PREBUILT: &[&str] = &["settings", "info", "memo", "graph"];

// A page that never reports in is shown anyway after this long.
const REVEAL_FALLBACK: Duration = Duration::from_millis(1500);

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
        // A transparent window shown before its page has painted is only a
        // shadow and an outline. window_ready shows it instead.
        .visible(false)
}

fn reveal(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

// Show the window when its page reports in, or after REVEAL_FALLBACK.
fn reveal_when_ready(app: &AppHandle, label: &str) {
    if let Some(state) = app.try_state::<AppState>() {
        state.waiting.lock().expect("waiting windows").insert(label.to_string());
    }
    let app = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(REVEAL_FALLBACK);
        let queued = app.clone();
        let _ = queued.run_on_main_thread(move || {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            if !state.waiting.lock().expect("waiting windows").remove(&label) {
                return;
            }
            if let Some(window) = app.get_webview_window(&label) {
                reveal(&window);
            }
        });
    });
}

fn cascade(app: &AppHandle) -> u32 {
    app.try_state::<AppState>().map(|state| state.cascade.load(Ordering::SeqCst)).unwrap_or(0)
}

fn closing(app: &AppHandle) -> bool {
    app.try_state::<AppState>()
        .map(|state| state.closing.load(Ordering::SeqCst))
        .unwrap_or(true)
}

// Build a hidden copy of the window after `delay`, unless one exists already.
fn prebuild_later(app: &AppHandle, kind: &'static str, delay: Duration) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        let queued = app.clone();
        let _ = queued.run_on_main_thread(move || {
            if closing(&app) || app.get_webview_window(kind).is_some() {
                return;
            }
            let _ = build_child(&app, kind);
        });
    });
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
        }
    });
}

fn open_child(app: &AppHandle, kind: &str) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(kind) {
        // Either open already, or built ahead of time and waiting.
        reveal(&existing);
        return Ok(());
    }
    build_child(app, kind)?;
    reveal_when_ready(app, kind);
    Ok(())
}

fn build_child(app: &AppHandle, kind: &str) -> Result<WebviewWindow, String> {
    let spec = child_spec(kind).ok_or_else(|| "window".to_string())?;
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
    instances::shift(&child, cascade(app));
    edit_menu::hide_builtin_menu(&child);
    if spec.fixed {
        lock_content(&child, spec.width, spec.height);
        hold_still(&child);
    } else {
        remember_floor(app, kind, spec.min_width, spec.min_height);
        watch_maximized(&child);
    }
    if let Some(&kind) = PREBUILT.iter().find(|&&name| name == kind) {
        let handle = app.clone();
        child.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                // Closed, so have the next one ready. Not at once: the build
                // holds the UI thread, and the reader is likely still busy.
                prebuild_later(&handle, kind, Duration::from_millis(1200));
            }
        });
    }
    Ok(child)
}

fn open_print(app: &AppHandle, owner: &WebviewWindow) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("print") {
        reveal(&existing);
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
    instances::shift(&child, cascade(app));
    reveal_when_ready(app, "print");
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
    if let Some(state) = app.try_state::<AppState>() {
        state.closing.store(true, Ordering::SeqCst);
    }
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

// The page calls this once it has loaded, so its window shows up drawn.
#[tauri::command]
fn window_ready(app: AppHandle, window: WebviewWindow, state: tauri::State<AppState>) {
    let label = window.label().to_string();
    if state.waiting.lock().expect("waiting windows").remove(&label) {
        reveal(&window);
    }
    // Even when the fallback showed it first. A window that exists already
    // is left alone, so a reload asks for nothing new.
    if label == "main" {
        for (index, &kind) in PREBUILT.iter().enumerate() {
            prebuild_later(&app, kind, Duration::from_millis(600 + 400 * index as u64));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The pages tell their own copy's windows apart from another copy's by this.
    let instance = tauri::plugin::Builder::<tauri::Wry, ()>::new("mycalc-instance")
        .js_init_script(format!("window.__MYCALC_INSTANCE__ = '{}';", std::process::id()))
        .build();
    tauri::Builder::default()
        .plugin(instance)
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            floors: Mutex::new(HashMap::new()),
            waiting: Mutex::new(HashSet::new()),
            closing: AtomicBool::new(false),
            cascade: AtomicU32::new(0),
        })
        .manage(edit_menu::EditState::new())
        .invoke_handler(tauri::generate_handler![
            set_content_size,
            window_control,
            set_bounds,
            open_window,
            close_window,
            window_ready,
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
            let steps = instances::free_step(&main);
            app.state::<AppState>().cascade.store(steps, Ordering::SeqCst);
            instances::shift(&main, steps);
            hold_still(&main);
            edit_menu::hide_builtin_menu(&main);
            reveal_when_ready(app.handle(), "main");
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
