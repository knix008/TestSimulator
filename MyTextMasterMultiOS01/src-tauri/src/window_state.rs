//! The main window's place and size between runs: window-state.json in the app config folder,
//! written when the window moves, resizes or closes. A saved place that is no longer on any
//! monitor (a screen was unplugged) is ignored, so the window never opens out of sight.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// MYTEXTMASTER_CONFIG_DIR (tests, a second copy beside an installed one) keeps the window place elsewhere.
pub fn state_file(app: &AppHandle) -> Option<PathBuf> {
    let dir = match std::env::var_os("MYTEXTMASTER_CONFIG_DIR") {
        Some(dir) => PathBuf::from(dir),
        None => app.path().app_config_dir().ok()?,
    };
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("window-state.json"))
}

pub fn load(path: &Path) -> Option<WindowState> {
    let text = std::fs::read_to_string(path).ok()?;
    let state: WindowState = serde_json::from_str(&text).ok()?;
    (state.width >= 400 && state.height >= 300).then_some(state)
}

/// Does the rectangle overlap a monitor's work area by at least 100×60 px?
pub fn visible_on(state: &WindowState, areas: &[(i32, i32, u32, u32)]) -> bool {
    areas.iter().any(|&(x, y, w, h)| {
        let left = state.x.max(x);
        let top = state.y.max(y);
        let right = (state.x + state.width as i32).min(x + w as i32);
        let bottom = (state.y + state.height as i32).min(y + h as i32);
        right - left >= 100 && bottom - top >= 60
    })
}

/// The saved place (physical pixels) and the scale factor of the monitor it is on.
pub fn saved_placement(app: &AppHandle, path: &Path) -> Option<(WindowState, f64)> {
    let state = load(path)?;
    let monitors = app.available_monitors().ok()?;
    let areas: Vec<_> = monitors.iter().map(|m| (m.work_area().position.x, m.work_area().position.y, m.work_area().size.width, m.work_area().size.height)).collect();
    if !visible_on(&state, &areas) {
        return None;
    }
    let scale = monitors
        .iter()
        .find(|m| visible_on(&state, &[(m.position().x, m.position().y, m.size().width, m.size().height)]))
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    Some((state, scale))
}

pub fn track(window: &WebviewWindow, path: PathBuf) {
    let handle = window.clone();
    let save = move || {
        let maximized = handle.is_maximized().unwrap_or(false);
        let minimized = handle.is_minimized().unwrap_or(false);
        if minimized {
            return;
        }
        // While maximized, keep the normal place of the last save (the restored size).
        let previous = load(&path);
        let state = if maximized {
            match previous {
                Some(old) => WindowState { maximized: true, ..old },
                None => return,
            }
        } else {
            let (Ok(position), Ok(size)) = (handle.outer_position(), handle.inner_size()) else { return };
            WindowState { x: position.x, y: position.y, width: size.width, height: size.height, maximized: false }
        };
        if previous != Some(state) {
            if let Ok(text) = serde_json::to_string(&state) {
                let _ = std::fs::write(&path, text);
            }
        }
    };
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_) | WindowEvent::CloseRequested { .. }) {
            save();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_off_every_screen_is_not_visible() {
        let state = WindowState { x: 4000, y: 100, width: 1200, height: 800, maximized: false };
        assert!(!visible_on(&state, &[(0, 0, 1920, 1040)]));
        assert!(visible_on(&state, &[(0, 0, 1920, 1040), (1920, 0, 2560, 1400)]));
    }

    #[test]
    fn a_tiny_saved_window_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.json");
        std::fs::write(&path, r#"{"x":0,"y":0,"width":10,"height":10,"maximized":false}"#).unwrap();
        assert_eq!(load(&path), None);
    }
}
