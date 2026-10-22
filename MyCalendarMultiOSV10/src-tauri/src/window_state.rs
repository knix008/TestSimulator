//! Where each window was last left, so the next start opens it there again. Positions are kept for every tracked
//! window, and the size of the ones the user resizes. The file is written through to disk on shutdown, because
//! Windows ends the process without waiting for a deferred save.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::Manager;

#[derive(Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
pub struct Geometry {
    /// Outer position in physical pixels, as the OS reports it.
    pub x: i32,
    pub y: i32,
    /// Inner size in logical pixels; absent for windows whose size is not remembered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
}

const FILE_NAME: &str = "window-state.json";
/// Windows whose place is remembered. The menu and the reminder are placed by the app each time.
const TRACKED: [&str; 5] = ["main", "settings", "events", "print", "editor"];
/// Windows whose size is remembered here too. The calendar's size used to live only in the page, which shutdown
/// can kill before that write reaches disk.
const SIZED: [&str; 2] = ["main", "print"];
/// How much of the title area must still be on a screen for a saved position to be used.
const VISIBLE_X: i32 = 80;
const VISIBLE_Y: i32 = 24;

static STATE: Mutex<Option<HashMap<String, Geometry>>> = Mutex::new(None);
static WRITE_PENDING: AtomicBool = AtomicBool::new(false);

fn file_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(FILE_NAME))
}

fn read_file(path: &PathBuf) -> Option<HashMap<String, Geometry>> {
    fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok())
}

fn with_state<R>(app: &tauri::AppHandle, f: impl FnOnce(&mut HashMap<String, Geometry>) -> R) -> Option<R> {
    let mut slot = STATE.lock().ok()?;
    if slot.is_none() {
        // A shutdown can tear the file. The temporary copy is the last complete write.
        let loaded = file_path(app)
            .and_then(|path| read_file(&path).or_else(|| read_file(&path.with_extension("json.tmp"))))
            .unwrap_or_default();
        *slot = Some(loaded);
    }
    slot.as_mut().map(f)
}

pub fn is_tracked(label: &str) -> bool {
    TRACKED.contains(&label)
}

pub fn saved(app: &tauri::AppHandle, label: &str) -> Option<Geometry> {
    with_state(app, |state| state.get(label).copied()).flatten()
}

/// Writes the file and asks the OS to put it on disk. A shutdown can cut power soon after the process ends.
pub fn flush(app: &tauri::AppHandle) {
    let Some(text) = with_state(app, |state| serde_json::to_string_pretty(state).ok()).flatten() else {
        return;
    };
    let Some(path) = file_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("json.tmp");
    let stored = (|| {
        let mut file = fs::File::create(&tmp)?;
        use std::io::Write;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        if fs::rename(&tmp, &path).is_err() {
            // Windows will not replace an existing file by renaming over it.
            let _ = fs::remove_file(&path);
            fs::rename(&tmp, &path)?;
        }
        fs::File::open(&path)?.sync_all()?;
        Ok::<(), std::io::Error>(())
    })();
    if stored.is_err() {
        let _ = fs::write(&path, text);
    }
}

/// The place a window has right now, when that place is one the user left rather than a minimized or full screen.
fn geometry_of(window: &tauri::WebviewWindow) -> Option<Geometry> {
    if window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return None;
    }
    let position = window.outer_position().ok()?;
    // A minimized window reports a position far off the desktop; never keep that.
    if position.x <= -32000 || position.y <= -32000 {
        return None;
    }
    let mut geometry = Geometry {
        x: position.x,
        y: position.y,
        ..Geometry::default()
    };
    if SIZED.contains(&window.label()) {
        let scale = window.scale_factor().unwrap_or(1.0);
        if let Ok(size) = window.inner_size() {
            if scale > 0.0 {
                let width = size.width as f64 / scale;
                let height = size.height as f64 / scale;
                if width.is_finite() && height.is_finite() && width >= 200.0 && height >= 200.0 {
                    geometry.width = Some(width);
                    geometry.height = Some(height);
                }
            }
        }
    }
    Some(geometry)
}

/// Reads every open window and writes the file immediately. System shutdown ends the process in this call.
pub fn save_session(app: &tauri::AppHandle) {
    let captured: Vec<(String, Geometry)> = TRACKED
        .iter()
        .filter_map(|label| app.get_webview_window(label))
        .filter_map(|window| {
            let geometry = geometry_of(&window)?;
            // Shutdown can shove a window off the desktop. Keep the place that was still on a screen.
            if !keep_position(&window, geometry.x, geometry.y) {
                return None;
            }
            Some((window.label().to_string(), geometry))
        })
        .collect();
    with_state(app, |state| {
        for (label, geometry) in captured {
            let entry = state.entry(label).or_default();
            entry.x = geometry.x;
            entry.y = geometry.y;
            // A size that could not be read (a window Windows has already collapsed) keeps the last good one.
            if geometry.width.is_some() && geometry.height.is_some() {
                entry.width = geometry.width;
                entry.height = geometry.height;
            }
        }
    });
    flush(app);
}

/// A drag sends a stream of moves; the file is written once things settle.
fn schedule_write(app: &tauri::AppHandle) {
    if WRITE_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        WRITE_PENDING.store(false, Ordering::SeqCst);
        flush(&app);
    });
}

/// Records where a tracked window is now. Maximized and minimized windows keep the place they had before.
pub fn record(window: &tauri::Window) {
    let label = window.label();
    if !is_tracked(label) || window.is_maximized().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    if !window.is_visible().unwrap_or(false) {
        return;
    }
    let Ok(position) = window.outer_position() else { return };
    let app = window.app_handle().clone();
    if let Some(webview) = app.get_webview_window(label) {
        if !keep_position(&webview, position.x, position.y) {
            return;
        }
    }
    let size = if SIZED.contains(&label) {
        let scale = window.scale_factor().unwrap_or(1.0);
        window
            .inner_size()
            .ok()
            .filter(|_| scale > 0.0)
            .map(|size| (size.width as f64 / scale, size.height as f64 / scale))
            .filter(|(width, height)| width.is_finite() && height.is_finite() && *width >= 200.0 && *height >= 200.0)
    } else {
        None
    };
    let changed = with_state(&app, |state| {
        let entry = state.entry(label.to_string()).or_default();
        let before = (entry.x, entry.y, entry.width, entry.height);
        entry.x = position.x;
        entry.y = position.y;
        if let Some((width, height)) = size {
            entry.width = Some(width);
            entry.height = Some(height);
        }
        before != (entry.x, entry.y, entry.width, entry.height)
    });
    if changed == Some(true) {
        schedule_write(&app);
    }
}

/// False only when the monitors are known and this point is on none of them. An unknown layout is kept.
fn keep_position(window: &tauri::WebviewWindow, x: i32, y: i32) -> bool {
    let Ok(monitors) = window.available_monitors() else { return true };
    if monitors.is_empty() {
        return true;
    }
    let (px, py) = (x + VISIBLE_X, y + VISIBLE_Y);
    monitors.iter().any(|monitor| {
        let pos = monitor.position();
        let size = monitor.size();
        px >= pos.x && px < pos.x + size.width as i32 && py >= pos.y && py < pos.y + size.height as i32
    })
}

/// True when the top-left part of a window at this position would be on one of the screens, so a position saved
/// on a monitor that has since been unplugged is not used.
fn on_screen(window: &tauri::WebviewWindow, x: i32, y: i32) -> bool {
    let Ok(monitors) = window.available_monitors() else { return false };
    let (px, py) = (x + VISIBLE_X, y + VISIBLE_Y);
    monitors.iter().any(|monitor| {
        let pos = monitor.position();
        let size = monitor.size();
        px >= pos.x && px < pos.x + size.width as i32 && py >= pos.y && py < pos.y + size.height as i32
    })
}

/// Puts a freshly built, still hidden window where it was last left. Returns false when there was nothing to apply.
pub fn restore(window: &tauri::WebviewWindow) -> bool {
    let Some(geometry) = saved(window.app_handle(), window.label()) else { return false };
    if !on_screen(window, geometry.x, geometry.y) {
        return false;
    }
    if let (Some(width), Some(height)) = (geometry.width, geometry.height) {
        if width >= 1.0 && height >= 1.0 {
            let _ = window.set_size(tauri::LogicalSize::new(width, height));
        }
    }
    window.set_position(tauri::PhysicalPosition::new(geometry.x, geometry.y)).is_ok()
}
