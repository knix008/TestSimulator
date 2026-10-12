//! Remembers the main window's position, size and maximized state between runs.
//!
//! Every move/resize is recorded (only while the window is in its normal state,
//! so a maximized or minimized window keeps its last normal bounds) and written
//! to `window-state.json` in the app config folder half a second after the last
//! change — the state survives even when the process is killed. At start-up the
//! saved bounds are used only if the window would be visible on a connected
//! monitor; otherwise the window is centred as on a first run.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, WebviewWindow, WindowEvent};

const FILE_NAME: &str = "window-state.json";
const SAVE_DELAY: Duration = Duration::from_millis(500);
/// How much of the window must lie on a monitor (px) for the saved place to be used.
const MIN_VISIBLE: i64 = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Tests point this elsewhere so the user's own saved window is never touched.
pub fn state_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("MYKANBAN_CONFIG_DIR") {
        return Some(PathBuf::from(dir).join(FILE_NAME));
    }
    app.path().app_config_dir().ok().map(|dir| dir.join(FILE_NAME))
}

pub fn load(path: &Path) -> Option<WindowState> {
    let state: WindowState = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    (state.width >= 200 && state.height >= 150 && state.width <= 20_000 && state.height <= 20_000).then_some(state)
}

pub fn save(path: &Path, state: &WindowState) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    // Write-then-rename so a crash mid-write never leaves a broken file.
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(state)?)?;
    std::fs::rename(&temporary, path)
}

/// True when at least `MIN_VISIBLE` × `MIN_VISIBLE` pixels of the window are on one monitor
/// (title-bar area included), so the user can grab and move it.
pub fn is_visible_on(state: &WindowState, monitors: &[Area]) -> bool {
    let (left, top) = (i64::from(state.x), i64::from(state.y));
    let (right, bottom) = (left + i64::from(state.width), top + i64::from(state.height));
    monitors.iter().any(|monitor| {
        let (m_left, m_top) = (i64::from(monitor.x), i64::from(monitor.y));
        let (m_right, m_bottom) = (m_left + i64::from(monitor.width), m_top + i64::from(monitor.height));
        let overlap_x = right.min(m_right) - left.max(m_left);
        let overlap_y = bottom.min(m_bottom) - top.max(m_top);
        // The top of the window (where it is dragged) must be on screen.
        overlap_x >= MIN_VISIBLE && overlap_y >= MIN_VISIBLE && top >= m_top - 8 && top < m_bottom - 40
    })
}

/// Where to open the window: the saved state plus the scale factor of the monitor it
/// lands on, or `None` (first run, damaged file, or that monitor is gone).
pub fn saved_placement(app: &tauri::AppHandle, path: &Path) -> Option<(WindowState, f64)> {
    let state = load(path)?;
    let monitors = app.available_monitors().ok()?;
    let areas: Vec<Area> = monitors
        .iter()
        .map(|m| Area { x: m.position().x, y: m.position().y, width: m.size().width, height: m.size().height })
        .collect();
    if !is_visible_on(&state, &areas) {
        return None;
    }
    let scale = monitors
        .iter()
        .find(|m| {
            let (p, s) = (m.position(), m.size());
            state.x >= p.x && state.x < p.x + s.width as i32 && state.y >= p.y && state.y < p.y + s.height as i32
        })
        .or_else(|| monitors.first())
        .map(|m| m.scale_factor().max(0.5))
        .unwrap_or(1.0);
    Some((state, scale))
}

struct Tracker {
    path: PathBuf,
    normal: Mutex<Option<WindowState>>,
    scheduled: AtomicBool,
}

impl Tracker {
    fn record(&self, window: &WebviewWindow) {
        let minimized = window.is_minimized().unwrap_or(false);
        let maximized = window.is_maximized().unwrap_or(false);
        if minimized {
            return;
        }
        let mut normal = self.normal.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if maximized {
            // Keep the last normal bounds; just note that the window is maximized.
            if let Some(state) = normal.as_mut() {
                state.maximized = true;
            }
        } else if let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) {
            *normal = Some(WindowState { x: position.x, y: position.y, width: size.width, height: size.height, maximized: false });
        }
    }

    fn schedule_save(self: &Arc<Self>) {
        if self.scheduled.swap(true, Ordering::SeqCst) {
            return;
        }
        let tracker = Arc::clone(self);
        std::thread::spawn(move || {
            std::thread::sleep(SAVE_DELAY);
            tracker.scheduled.store(false, Ordering::SeqCst);
            tracker.flush();
        });
    }

    fn flush(&self) {
        let state = *self.normal.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(state) = state {
            let _ = save(&self.path, &state);
        }
    }
}

/// Starts recording the window's bounds; call after `restore`.
pub fn track(window: &WebviewWindow, path: PathBuf) {
    let tracker = Arc::new(Tracker { path, normal: Mutex::new(load_initial(window)), scheduled: AtomicBool::new(false) });
    let handle = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            tracker.record(&handle);
            tracker.schedule_save();
        }
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            tracker.record(&handle);
            tracker.flush();
        }
        _ => {}
    });
}

fn load_initial(window: &WebviewWindow) -> Option<WindowState> {
    let maximized = window.is_maximized().unwrap_or(false);
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    Some(WindowState { x: position.x, y: position.y, width: size.width, height: size.height, maximized })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Area = Area { x: 0, y: 0, width: 1920, height: 1080 };
    const LEFT: Area = Area { x: -1280, y: 0, width: 1280, height: 1024 };
    const fn window(x: i32, y: i32) -> WindowState {
        WindowState { x, y, width: 1100, height: 760, maximized: false }
    }

    #[test]
    fn round_trips_through_the_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sub").join(FILE_NAME);
        assert_eq!(load(&path), None);
        let state = WindowState { x: -1200, y: 40, width: 1000, height: 700, maximized: true };
        save(&path, &state).unwrap();
        assert_eq!(load(&path), Some(state));
        std::fs::write(&path, b"{broken").unwrap();
        assert_eq!(load(&path), None, "a damaged file is ignored");
        std::fs::write(&path, br#"{"x":0,"y":0,"width":10,"height":10,"maximized":false}"#).unwrap();
        assert_eq!(load(&path), None, "absurd sizes are ignored");
    }

    #[test]
    fn saved_place_must_be_on_a_connected_monitor() {
        assert!(is_visible_on(&window(100, 100), &[SCREEN]));
        assert!(is_visible_on(&window(-1000, 50), &[SCREEN, LEFT]), "second monitor on the left");
        assert!(!is_visible_on(&window(-1000, 50), &[SCREEN]), "that monitor was unplugged");
        assert!(!is_visible_on(&window(1880, 100), &[SCREEN]), "only a sliver would show");
        assert!(!is_visible_on(&window(100, -500), &[SCREEN]), "title bar above the screen");
        assert!(!is_visible_on(&window(100, 100), &[]));
    }
}
