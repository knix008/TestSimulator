// MyDBTools - Tauri shell.
//
//   - the main window: frameless (the page draws the title bar), at the saved place
//     and size; hidden until the page says it has painted, so there is no white flash
//   - dialogs and the print window as windows of their own (popout.rs)
//   - the user guide and the tutorial (doc/index.html) in a window of their own
//   - files, settings and recent files (files.rs), printing and PDF (print.rs)
//   - closing asks the page first, which may have unsaved work
//   - one instance: a second start hands its file to the running window
mod files;
mod popout;
mod print;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MAIN: &str = "main";
pub const TITLE: &str = "MyDBTools v1.0.1";
/// The page measures the toolbar and raises this (set_min_width).
const MIN_WIDTH: f64 = 900.0;
const MIN_HEIGHT: f64 = 640.0;
const DEFAULT_WIDTH: f64 = 1480.0;
const DEFAULT_HEIGHT: f64 = 920.0;
/// Where settings, recent files and the window place live (under %APPDATA% etc.).
const DATA_FOLDER: &str = "MyDBTools";
/// The folder the program used while it was called DBTools (and the Electron
/// build before it); its files are carried over once, on the first start.
const OLD_DATA_FOLDER: &str = "DBTools";
/// The program's own files in the data folder (the old Electron folder also
/// holds Chromium's caches, which are not ours to move).
const DATA_FILES: &[&str] = &["settings.json", "recent.json", "window.json"];
const DOC_WINDOW: &str = "doc";
const DOC_PRINT_WINDOW: &str = "doc-print";
/// Files the app opens from the command line or a file association.
const OPENABLE: &[&str] = &["mdprj", "json", "db", "sqlite", "sqlite3", "db3", "sql", "faiss", "findex", "hnsw", "index"];

/* ---------------------------------------------------------------- state */

#[derive(Default)]
struct Shell {
    /// The last normal (not maximized / minimized) place, in logical pixels.
    normal: Mutex<Option<(f64, f64, f64, f64)>>,
    shown: AtomicBool,
    quitting: AtomicBool,
    /// The content width the toolbar needs (f64 bits); 0 = MIN_WIDTH.
    min_width: AtomicU64,
    /// The minimum changed while the window was maximized and still has to be applied.
    min_pending: AtomicBool,
    startup_file: Mutex<Option<String>>,
}

/// Settings, recent files and the window place. DBTOOLS_DATA_DIR moves it (and
/// marks an isolated test run).
pub fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("DBTOOLS_DATA_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    config_root().join(DATA_FOLDER)
}

/// The per-user folder that application data folders sit in.
fn config_root() -> PathBuf {
    let var = |name: &str| std::env::var(name).unwrap_or_else(|_| ".".into());
    if cfg!(windows) {
        return PathBuf::from(var("APPDATA"));
    }
    if cfg!(target_os = "macos") {
        return PathBuf::from(var("HOME")).join("Library/Application Support");
    }
    PathBuf::from(std::env::var("XDG_CONFIG_HOME").unwrap_or_else(|_| format!("{}/.config", var("HOME"))))
}

/// First start under the new name: bring the settings, recent files and window
/// place over from the old DBTools folder. Copies (the old folder is left as it
/// was) and never overwrites a file the new folder already has. Not in a test
/// run with its own data folder.
fn carry_over_old_data() {
    if std::env::var_os("DBTOOLS_DATA_DIR").is_some_and(|d| !d.is_empty()) {
        return;
    }
    let root = config_root();
    copy_missing_files(&root.join(OLD_DATA_FOLDER), &root.join(DATA_FOLDER), DATA_FILES);
}

/// Copies each of `names` from `from` to `to` where `to` lacks it. Returns how many.
fn copy_missing_files(from: &Path, to: &Path, names: &[&str]) -> usize {
    let mut copied = 0;
    for name in names {
        let source = from.join(name);
        let target = to.join(name);
        if !source.is_file() || target.exists() {
            continue;
        }
        if std::fs::create_dir_all(to).is_ok() && std::fs::copy(&source, &target).is_ok() {
            copied += 1;
        }
    }
    copied
}

/// The first argument that names an openable file that exists.
pub fn find_openable(args: &[String]) -> Option<String> {
    args.iter().skip(1).find_map(|arg| {
        if arg.starts_with('-') {
            return None;
        }
        let path = Path::new(arg);
        let ext = path.extension()?.to_str()?.to_ascii_lowercase();
        (OPENABLE.contains(&ext.as_str()) && path.is_file()).then(|| arg.clone())
    })
}

/* --------------------------------------------------------- window place */

fn window_file() -> PathBuf {
    data_dir().join("window.json")
}

fn track(window: &tauri::Window) {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let (Ok(scale), Ok(pos), Ok(size)) = (window.scale_factor(), window.outer_position(), window.inner_size()) else { return };
    let pos = pos.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    if let Some(shell) = window.try_state::<Shell>() {
        *shell.normal.lock().unwrap_or_else(|e| e.into_inner()) = Some((pos.x, pos.y, size.width, size.height));
        let min = f64::from_bits(shell.min_width.load(Ordering::SeqCst)).max(MIN_WIDTH);
        // Back from maximized: the minimum that changed meanwhile applies now.
        if shell.min_pending.swap(false, Ordering::SeqCst) {
            if let Some(main) = window.app_handle().get_webview_window(MAIN) {
                apply_min_size(&main, min);
            }
        }
        // Aero Snap and SetWindowPos go around the OS minimum: put the width back.
        // This only answers a resize the user made; nothing else calls set_size.
        if size.width + 1.0 < min {
            let _ = window.set_size(LogicalSize::new(min, size.height.max(MIN_HEIGHT)));
        }
    }
}

fn remember_window(app: &AppHandle) {
    let Some(main) = app.get_webview_window(MAIN) else { return };
    let saved = *app.state::<Shell>().normal.lock().unwrap_or_else(|e| e.into_inner());
    let Some((x, y, width, height)) = saved else { return };
    let text = json!({ "x": x.round(), "y": y.round(), "width": width.round(), "height": height.round(), "maximized": main.is_maximized().unwrap_or(false) });
    let _ = std::fs::create_dir_all(data_dir());
    let _ = std::fs::write(window_file(), text.to_string());
}

/// A saved position on a monitor that is gone would open the window off screen.
fn keep_on_screen(window: &WebviewWindow) {
    let (Ok(pos), Ok(size), Ok(monitors)) = (window.outer_position(), window.outer_size(), window.available_monitors()) else { return };
    let visible = monitors.iter().any(|m| {
        let (mx, my) = (m.position().x, m.position().y);
        let (mw, mh) = (m.size().width as i32, m.size().height as i32);
        pos.x + 80 < mx + mw && pos.x + size.width as i32 - 80 > mx && pos.y >= my - 8 && pos.y + 40 < my + mh
    });
    if !visible {
        let _ = window.center();
    }
}

/// The OS minimum binds the outer rectangle, which on a frameless window carries
/// invisible resize borders; without them the toolbar would be cut short.
///
/// Only the minimum is set — the window's own size is never changed here: a toolbar
/// button that changes a label must not move or resize the window. A maximized or
/// full-screen window is left alone entirely (changing its minimum restores it on
/// Windows); the minimum is applied when it comes back to a normal size (track).
/// Returns whether it was applied.
fn apply_min_size(window: &WebviewWindow, content_width: f64) -> bool {
    if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return false;
    }
    if let (Ok(scale), Ok(outer), Ok(inner)) = (window.scale_factor(), window.outer_size(), window.inner_size()) {
        let extra_w = outer.width.saturating_sub(inner.width) as f64 / scale;
        let extra_h = outer.height.saturating_sub(inner.height) as f64 / scale;
        let _ = window.set_min_size(Some(LogicalSize::new(content_width + extra_w, MIN_HEIGHT + extra_h)));
        return true;
    }
    false
}

fn open_main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let saved: Value = std::fs::read_to_string(window_file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    let num = |key: &str| saved[key].as_f64();
    let popouts = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title(TITLE)
        // Files dropped on the window go to the page (DiagramCanvas), not to Tauri.
        .disable_drag_drop_handler()
        .inner_size(num("width").unwrap_or(DEFAULT_WIDTH).max(MIN_WIDTH), num("height").unwrap_or(DEFAULT_HEIGHT).max(MIN_HEIGHT))
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .visible(false)
        .background_color(tauri::window::Color(0x1c, 0x1c, 0x28, 255))
        .on_new_window(move |url, features| {
            if url.scheme() == "about" {
                if let Some(main) = popouts.get_webview_window(MAIN) {
                    return popout::new_window(&popouts, &main, &url, features);
                }
            }
            tauri::webview::NewWindowResponse::Deny
        });
    match (num("x"), num("y")) {
        (Some(x), Some(y)) => builder = builder.position(x, y),
        _ => builder = builder.center(),
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    keep_on_screen(&window);
    if saved["maximized"].as_bool().unwrap_or(false) {
        let _ = window.maximize();
    }
    apply_min_size(&window, MIN_WIDTH);
    Ok(window)
}

fn show_main(app: &AppHandle) {
    if app.state::<Shell>().shown.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

fn quit(app: &AppHandle) {
    remember_window(app);
    app.state::<Shell>().quitting.store(true, Ordering::SeqCst);
    popout::close_all(app);
    print::close_host(app);
    for label in [DOC_PRINT_WINDOW, DOC_WINDOW] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
    app.exit(0);
}

/* ------------------------------------------------------------- commands */

/// The page has painted: the window can appear.
#[tauri::command]
async fn window_ready(app: AppHandle) {
    show_main(&app);
}

/// The page has dealt with any unsaved work, or there was none.
#[tauri::command]
async fn window_force_close(app: AppHandle) {
    quit(&app);
}

/// The width the toolbar needs on one row: the window may not be narrower.
#[tauri::command]
async fn set_min_width(app: AppHandle, width: f64) {
    if !width.is_finite() || width <= 0.0 {
        return;
    }
    let width = width.clamp(MIN_WIDTH, 2400.0);
    let shell = app.state::<Shell>();
    let previous = f64::from_bits(shell.min_width.load(Ordering::SeqCst));
    if (previous - width).abs() < 2.0 && !shell.min_pending.load(Ordering::SeqCst) {
        return;
    }
    shell.min_width.store(width.to_bits(), Ordering::SeqCst);
    if let Some(main) = app.get_webview_window(MAIN) {
        let applied = apply_min_size(&main, width);
        shell.min_pending.store(!applied, Ordering::SeqCst);
    }
}

#[tauri::command]
async fn set_title(app: AppHandle, title: String) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.set_title(&title);
    }
}

/// What the About window lists about the shell.
#[tauri::command]
async fn app_info() -> Value {
    json!({
        "tauri": tauri::VERSION,
        "webview": tauri::webview_version().unwrap_or_default(),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "dataDir": data_dir().to_string_lossy(),
    })
}

/// The file the app was started with (command line or file association), once.
#[tauri::command]
async fn startup_file(app: AppHandle) -> Option<String> {
    app.state::<Shell>().startup_file.lock().unwrap_or_else(|e| e.into_inner()).take()
}

/// The example files shipped with the app (template/).
#[tauri::command]
async fn template_dir(app: AppHandle) -> String {
    let bundled = app.path().resource_dir().map(|d| d.join("template")).ok().filter(|d| d.is_dir());
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("template");
    bundled.unwrap_or(dev).to_string_lossy().into_owned()
}

/// The user guide or the tutorial in a top-level window of its own (not owned by
/// the main window, so it can sit beside it). Asking again raises it on the page asked for.
#[tauri::command]
async fn open_doc(app: AppHandle, doc: String, language: String) -> Result<(), String> {
    let doc = if doc == "tutorial" { "tutorial" } else { "guide" };
    let language = if language == "en" { "en" } else { "ko" };
    let page = format!("doc/index.html?doc={doc}&lang={language}");
    let title = match (doc, language) {
        ("tutorial", "en") => "MyDBTools Tutorial",
        ("tutorial", _) => "MyDBTools 튜토리얼",
        (_, "en") => "MyDBTools User Guide",
        _ => "MyDBTools 사용자 설명서",
    };
    if let Some(win) = app.get_webview_window(DOC_WINDOW) {
        let _ = win.eval(format!("window.location.replace('index.html?doc={doc}&lang={language}')"));
        let _ = win.set_title(title);
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, DOC_WINDOW, WebviewUrl::App(page.into()))
        .title(title)
        .inner_size(1180.0, 840.0)
        .min_inner_size(760.0, 480.0)
        // No title bar: the page's toolbar carries the window buttons and moves it.
        .decorations(false)
        .shadow(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// The print window for the user guide / tutorial: printer, page settings, preview.
#[tauri::command]
async fn open_doc_print(app: AppHandle, doc: String, language: String) -> Result<(), String> {
    let doc = if doc == "tutorial" { "tutorial" } else { "guide" };
    let language = if language == "en" { "en" } else { "ko" };
    let page = format!("doc/print.html?doc={doc}&lang={language}");
    let title = if language == "en" { "MyDBTools — Print" } else { "MyDBTools — 인쇄" };
    if let Some(win) = app.get_webview_window(DOC_PRINT_WINDOW) {
        let _ = win.eval(format!("window.location.replace('print.html?doc={doc}&lang={language}')"));
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(&app, DOC_PRINT_WINDOW, WebviewUrl::App(page.into()))
        .title(title)
        // Laid out for this size, like the app's own print window: not resizable.
        .inner_size(1260.0, 900.0)
        .resizable(false)
        .maximizable(false)
        // No title bar: the settings head carries the title and Close, and moves it.
        .decorations(false)
        .shadow(true)
        .center();
    if let Some(owner) = app.get_webview_window(DOC_WINDOW) {
        builder = builder.parent(&owner).map_err(|e| e.to_string())?;
    }
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    let app = window.app_handle();
    let label = window.label();
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } if label == MAIN => {
            if !app.state::<Shell>().quitting.load(Ordering::SeqCst) {
                api.prevent_close();
                let _ = app.emit_to(MAIN, "window:close-request", ());
            }
        }
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) if label == MAIN => track(window),
        tauri::WindowEvent::Destroyed => {
            if label == MAIN {
                quit(app);
            } else if popout::is_popout(label) {
                popout::closed(app, label);
            }
        }
        _ => {}
    }
}

/// A file handed over by a second start or by the OS: to the running page.
fn open_in_main(app: &AppHandle, file: String) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
        let _ = app.emit_to(MAIN, "app:open-file", file);
    } else {
        *app.state::<Shell>().startup_file.lock().unwrap_or_else(|e| e.into_inner()) = Some(file);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    carry_over_old_data();
    let mut builder = tauri::Builder::default();
    // A test run with its own data folder must not hand over to an installed copy.
    if std::env::var_os("DBTOOLS_DATA_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            match find_openable(&args) {
                Some(file) => open_in_main(app, file),
                None => {
                    if let Some(main) = app.get_webview_window(MAIN) {
                        let _ = main.unminimize();
                        let _ = main.show();
                        let _ = main.set_focus();
                    }
                }
            }
        }));
    }
    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .manage(Shell::default())
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            *app.state::<Shell>().startup_file.lock().unwrap_or_else(|e| e.into_inner()) = find_openable(&args);
            let handle = app.handle().clone();
            open_main_window(&handle).map_err(Box::<dyn std::error::Error>::from)?;
            // Should the page never report in, an empty window beats no window at all.
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(8));
                show_main(&handle);
            });
            Ok(())
        })
        .on_window_event(on_window_event)
        .invoke_handler(tauri::generate_handler![
            window_ready,
            app_info,
            window_force_close,
            set_min_width,
            set_title,
            startup_file,
            template_dir,
            open_doc,
            open_doc_print,
            files::files_open,
            files::files_read,
            files::files_save,
            files::files_pick_save,
            files::files_write,
            files::dir_choose,
            files::dir_write_files,
            files::settings_read,
            files::settings_write,
            files::recent_read,
            files::recent_write,
            print::print_info,
            print::print_pdf,
            print::print_html,
            popout::popout_show,
            popout::popout_close,
        ])
        .build(tauri::generate_context!())
        .expect("MyDBTools failed to start");
    app.run(|_handle, _event| {
        // macOS hands a double-clicked file over as an event, not an argument.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &_event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    open_in_main(_handle, path.to_string_lossy().into_owned());
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_old_dbtools_files_are_carried_over_once_without_overwriting() {
        let base = std::env::temp_dir().join(format!("mydbtools-carry-{}", std::process::id()));
        let old = base.join("DBTools");
        let new = base.join("MyDBTools");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("settings.json"), "{\"Theme\":\"old\"}").unwrap();
        std::fs::write(old.join("recent.json"), "[\"a.mdprj\"]").unwrap();
        std::fs::write(old.join("Cookies"), "chromium").unwrap();

        // First start: the program's files come over; Chromium's do not.
        assert_eq!(copy_missing_files(&old, &new, DATA_FILES), 2);
        assert_eq!(std::fs::read_to_string(new.join("settings.json")).unwrap(), "{\"Theme\":\"old\"}");
        assert!(!new.join("Cookies").exists());
        assert!(old.join("settings.json").exists(), "the old folder is left alone");

        // Later starts never overwrite what the new folder has.
        std::fs::write(new.join("settings.json"), "{\"Theme\":\"new\"}").unwrap();
        assert_eq!(copy_missing_files(&old, &new, DATA_FILES), 0);
        assert_eq!(std::fs::read_to_string(new.join("settings.json")).unwrap(), "{\"Theme\":\"new\"}");

        // Nothing to bring over: nothing happens, no folder is made.
        let none = base.join("none");
        assert_eq!(copy_missing_files(&base.join("missing"), &none, DATA_FILES), 0);
        assert!(!none.exists());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn only_existing_project_files_are_picked_from_the_arguments() {
        let dir = std::env::temp_dir().join(format!("dbtools-args-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let project = dir.join("Shop.mdprj");
        std::fs::write(&project, "{}").unwrap();
        let p = project.to_string_lossy().into_owned();
        assert_eq!(find_openable(&["exe".into(), "--flag".into(), p.clone()]), Some(p.clone()));
        assert_eq!(find_openable(&["exe".into(), dir.join("missing.mdprj").to_string_lossy().into_owned()]), None);
        assert_eq!(find_openable(&["exe".into(), dir.join("x.txt").to_string_lossy().into_owned()]), None);
        // The executable itself is never taken for a document.
        assert_eq!(find_openable(&[p]), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
