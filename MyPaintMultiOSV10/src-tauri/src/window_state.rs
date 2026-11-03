//! Remembers where each window was: the main window and every page opened with
//! `desktop.openWindow`, keyed by window label, plus the theme's background colour so the
//! next start paints the window in it before the page has loaded (no white flash).
//!
//! Moves and resizes are recorded only while the window is in its normal state, so a
//! maximized or minimized window keeps its last normal bounds, and the file
//! (`window-state.json` in the app config folder) is written half a second after the last
//! change. At start-up a saved place is used only if it is visible on a connected monitor.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

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

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Saved {
    #[serde(default)]
    pub windows: BTreeMap<String, WindowState>,
    #[serde(default)]
    pub background: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub struct Store {
    path: Option<PathBuf>,
    saved: Mutex<Saved>,
    scheduled: AtomicBool,
}

/// `MYPAINT_CONFIG_DIR` points test runs elsewhere so the user's own windows are never touched.
pub fn config_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("MYPAINT_CONFIG_DIR").filter(|d| !d.is_empty()) {
        return Some(PathBuf::from(dir));
    }
    app.path().app_config_dir().ok()
}

fn sane(state: &WindowState) -> bool {
    state.width >= 200 && state.height >= 150 && state.width <= 20_000 && state.height <= 20_000
}

pub fn load(path: &Path) -> Saved {
    let mut saved: Saved = std::fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
    saved.windows.retain(|_, state| sane(state));
    if !is_colour(&saved.background) {
        saved.background.clear();
    }
    saved
}

pub fn save(path: &Path, saved: &Saved) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    // Write-then-rename so a crash mid-write never leaves a broken file.
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(saved)?)?;
    std::fs::rename(&temporary, path)
}

/// `#rgb`, `#rrggbb` or `#rrggbbaa`.
pub fn is_colour(text: &str) -> bool {
    let Some(hex) = text.strip_prefix('#') else { return false };
    matches!(hex.len(), 3 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn colour(text: &str) -> Option<tauri::window::Color> {
    if !is_colour(text) {
        return None;
    }
    let hex = &text[1..];
    let hex: String = if hex.len() == 3 { hex.chars().flat_map(|c| [c, c]).collect() } else { hex.to_string() };
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    let alpha = if hex.len() == 8 { byte(6)? } else { 255 };
    Some(tauri::window::Color(byte(0)?, byte(2)?, byte(4)?, alpha))
}

/// The value of `--bg` in the theme CSS the page sends with `applyTheme`.
pub fn background_of(css: &str) -> Option<String> {
    let at = css.match_indices("--bg:").map(|(at, _)| at).find(|&at| {
        at == 0 || matches!(css.as_bytes()[at - 1], b';' | b'{' | b' ' | b'\n' | b'\t')
    })?;
    let rest = &css[at + 5..];
    let end = rest.find([';', '}', '\n']).unwrap_or(rest.len());
    let value = rest[..end].trim().trim_end_matches("!important").trim().to_string();
    is_colour(&value).then_some(value)
}

/// True when at least `MIN_VISIBLE` × `MIN_VISIBLE` pixels of the window are on one monitor
/// with its top edge on screen, so the user can grab and move it.
pub fn is_visible_on(state: &WindowState, monitors: &[Area]) -> bool {
    let (left, top) = (i64::from(state.x), i64::from(state.y));
    let (right, bottom) = (left + i64::from(state.width), top + i64::from(state.height));
    monitors.iter().any(|monitor| {
        let (m_left, m_top) = (i64::from(monitor.x), i64::from(monitor.y));
        let (m_right, m_bottom) = (m_left + i64::from(monitor.width), m_top + i64::from(monitor.height));
        let overlap_x = right.min(m_right) - left.max(m_left);
        let overlap_y = bottom.min(m_bottom) - top.max(m_top);
        overlap_x >= MIN_VISIBLE && overlap_y >= MIN_VISIBLE && top >= m_top - 8 && top < m_bottom - 40
    })
}

impl Store {
    pub fn open(app: &tauri::AppHandle) -> Store {
        let path = config_dir(app).map(|dir| dir.join(FILE_NAME));
        let saved = path.as_deref().map(load).unwrap_or_default();
        Store { path, saved: Mutex::new(saved), scheduled: AtomicBool::new(false) }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Saved> {
        self.saved.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn background(&self) -> Option<String> {
        let colour = self.lock().background.clone();
        (!colour.is_empty()).then_some(colour)
    }

    pub fn set_background(self: &Arc<Self>, colour: &str) {
        if !is_colour(colour) {
            return;
        }
        {
            let mut saved = self.lock();
            if saved.background == colour {
                return;
            }
            saved.background = colour.to_string();
        }
        self.schedule_save();
    }

    /// The saved place for `label`, when it is still on a connected monitor.
    pub fn placement(&self, app: &tauri::AppHandle, label: &str) -> Option<WindowState> {
        let state = *self.lock().windows.get(label)?;
        let monitors = app.available_monitors().ok()?;
        let areas: Vec<Area> = monitors
            .iter()
            .map(|m| Area { x: m.position().x, y: m.position().y, width: m.size().width, height: m.size().height })
            .collect();
        is_visible_on(&state, &areas).then_some(state)
    }

    fn record(&self, window: &WebviewWindow) {
        if window.is_minimized().unwrap_or(false) {
            return;
        }
        let maximized = window.is_maximized().unwrap_or(false);
        let label = window.label().to_string();
        let mut saved = self.lock();
        if maximized {
            if let Some(state) = saved.windows.get_mut(&label) {
                state.maximized = true;
            }
        } else if let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) {
            let state = WindowState { x: position.x, y: position.y, width: size.width, height: size.height, maximized: false };
            if sane(&state) {
                saved.windows.insert(label, state);
            }
        }
    }

    fn schedule_save(self: &Arc<Self>) {
        if self.scheduled.swap(true, Ordering::SeqCst) {
            return;
        }
        let store = Arc::clone(self);
        std::thread::spawn(move || {
            std::thread::sleep(SAVE_DELAY);
            store.scheduled.store(false, Ordering::SeqCst);
            store.flush();
        });
    }

    pub fn flush(&self) {
        let saved = self.lock().clone();
        if let Some(path) = &self.path {
            let _ = save(path, &saved);
        }
    }
}

/// Puts a window built hidden where it was last time (physical pixels, as recorded).
pub fn restore(window: &WebviewWindow, state: &WindowState) {
    let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
    if state.maximized {
        let _ = window.maximize();
    }
}

/// Starts recording the window's bounds; call after `restore`.
pub fn track(store: &Arc<Store>, window: &WebviewWindow) {
    let store = Arc::clone(store);
    let handle = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            store.record(&handle);
            store.schedule_save();
        }
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            store.record(&handle);
            store.flush();
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Area = Area { x: 0, y: 0, width: 1920, height: 1080 };
    const LEFT: Area = Area { x: -1280, y: 0, width: 1280, height: 1024 };
    const fn window(x: i32, y: i32) -> WindowState {
        WindowState { x, y, width: 1180, height: 760, maximized: false }
    }

    #[test]
    fn round_trips_through_the_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sub").join(FILE_NAME);
        assert_eq!(load(&path), Saved::default());
        let mut saved = Saved::default();
        saved.windows.insert("main".into(), WindowState { x: -1200, y: 40, width: 1300, height: 800, maximized: true });
        saved.windows.insert("guide".into(), window(10, 10));
        saved.background = "#1e1f22".into();
        save(&path, &saved).unwrap();
        assert_eq!(load(&path), saved);
        std::fs::write(&path, b"{broken").unwrap();
        assert_eq!(load(&path), Saved::default(), "a damaged file is ignored");
        std::fs::write(&path, br#"{"windows":{"main":{"x":0,"y":0,"width":10,"height":10,"maximized":false}},"background":"red"}"#).unwrap();
        assert_eq!(load(&path), Saved::default(), "absurd sizes and colours are ignored");
    }

    #[test]
    fn saved_place_must_be_on_a_connected_monitor() {
        assert!(is_visible_on(&window(100, 100), &[SCREEN]));
        assert!(is_visible_on(&window(-1100, 50), &[SCREEN, LEFT]), "second monitor on the left");
        assert!(!is_visible_on(&window(-1100, 50), &[SCREEN]), "that monitor was unplugged");
        assert!(!is_visible_on(&window(1880, 100), &[SCREEN]), "only a sliver would show");
        assert!(!is_visible_on(&window(100, -500), &[SCREEN]), "title bar above the screen");
        assert!(!is_visible_on(&window(100, 100), &[]));
    }

    #[test]
    fn the_theme_background_is_read_from_its_css() {
        assert_eq!(background_of(":root{--fg:#000;--bg:#1e1f22;--accent:#09f}").as_deref(), Some("#1e1f22"));
        assert_eq!(background_of(":root { --bg: #FFF; }").as_deref(), Some("#FFF"));
        assert_eq!(background_of(":root{--bg:var(--x)}"), None);
        assert_eq!(background_of(""), None);
        assert!(colour("#fff").is_some() && colour("#00000000").is_some() && colour("navy").is_none());
    }
}
