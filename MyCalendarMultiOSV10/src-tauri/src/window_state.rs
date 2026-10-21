//! Where each window was last left, so the next start opens it there again. The calendar's own size lives in the
//! page's settings; this file keeps positions, and the size of the windows the user resizes freely.

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
/// Windows whose size is remembered here too.
const SIZED: [&str; 1] = ["print"];
/// How much of the title area must still be on a screen for a saved position to be used.
const VISIBLE_X: i32 = 80;
const VISIBLE_Y: i32 = 24;

static STATE: Mutex<Option<HashMap<String, Geometry>>> = Mutex::new(None);
static WRITE_PENDING: AtomicBool = AtomicBool::new(false);

fn file_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(FILE_NAME))
}

fn with_state<R>(app: &tauri::AppHandle, f: impl FnOnce(&mut HashMap<String, Geometry>) -> R) -> Option<R> {
    let mut slot = STATE.lock().ok()?;
    if slot.is_none() {
        let loaded = file_path(app)
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|text| serde_json::from_str(&text).ok())
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

/// Writes the file now. Called by the debounced writer and on quit.
pub fn flush(app: &tauri::AppHandle) {
    let Some(text) = with_state(app, |state| serde_json::to_string_pretty(state).ok()).flatten() else {
        return;
    };
    let Some(path) = file_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let _ = fs::write(path, text);
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
    let size = if SIZED.contains(&label) {
        let scale = window.scale_factor().unwrap_or(1.0);
        window
            .inner_size()
            .ok()
            .filter(|_| scale > 0.0)
            .map(|size| (size.width as f64 / scale, size.height as f64 / scale))
    } else {
        None
    };
    let app = window.app_handle().clone();
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
