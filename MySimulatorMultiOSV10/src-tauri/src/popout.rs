//! Pop-out windows: dialogs and drop-down menus that may reach past the main window.
//!
//! The page opens one with `window.open("about:blank#popout-…")` and builds its content in that document
//! itself (about:blank keeps the opener's origin, so the page simply moves its DOM there). This side only makes
//! the window: frameless, owned by the main window, off the taskbar and hidden until the page has laid it out
//! and calls `place_popout` with its size and place.

use std::sync::atomic::{AtomicU32, Ordering};
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

static NEXT: AtomicU32 = AtomicU32::new(1);

/// The window label from the URL fragment (`popout-` + letters, digits and dashes), or a fresh one.
pub fn popout_label(fragment: Option<&str>) -> String {
    fragment
        .filter(|f| f.starts_with("popout-") && f.len() < 64 && f.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        .map(str::to_string)
        .unwrap_or_else(|| format!("popout-{}", NEXT.fetch_add(1, Ordering::Relaxed)))
}

/// Builds the window for a `window.open("about:blank#popout-…")` from the main page.
pub fn new_window(app: &AppHandle, url: &Url, features: NewWindowFeatures, browser_args: &str) -> NewWindowResponse<tauri::Wry> {
    let label = popout_label(url.fragment());
    if app.get_webview_window(&label).is_some() {
        return NewWindowResponse::Deny;
    }
    let menu = label.starts_with("popout-menu");
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External("about:blank".parse().expect("about:blank")))
        .window_features(features)
        .title(format!("MySimulator v{}", app.package_info().version))
        .decorations(false)
        .shadow(true)
        .resizable(!menu)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .disable_drag_drop_handler()
        .additional_browser_args(browser_args);
    if let Some(main) = app.get_webview_window("main") {
        builder = match builder.parent(&main) {
            Ok(next) => next,
            Err(_) => return NewWindowResponse::Deny,
        };
    }
    match builder.build() {
        Ok(window) => {
            crate::window_icon::apply(&window);
            NewWindowResponse::Create { window }
        }
        Err(_) => NewWindowResponse::Deny,
    }
}

/// The work area (logical px) of the monitor the window is on.
fn work_area(window: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let monitor = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    Some((f64::from(area.position.x) / scale, f64::from(area.position.y) / scale, f64::from(area.size.width) / scale, f64::from(area.size.height) / scale))
}

/// Top-left of a w × h box: centred over (mx, my, mw, mh) when `center`, else at (x, y); kept inside the area.
pub fn place_in(x: f64, y: f64, w: f64, h: f64, center: Option<(f64, f64, f64, f64)>, area: (f64, f64, f64, f64)) -> (f64, f64) {
    let (ax, ay, aw, ah) = area;
    let (px, py) = match center {
        Some((mx, my, mw, mh)) => (mx + (mw - w) / 2.0, my + ((mh - h) / 2.0).max(24.0)),
        None => (x, y),
    };
    (px.round().clamp(ax, (ax + aw - w).max(ax)), py.round().clamp(ay, (ay + ah - h).max(ay)))
}

/// Puts the window so that its client area starts at x, y (a frameless window's outer rectangle includes an
/// invisible resize border, and set_position places that).
fn place_client(window: &WebviewWindow, x: f64, y: f64) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let (dx, dy) = match (window.inner_position(), window.outer_position()) {
        (Ok(inner), Ok(outer)) => (f64::from(inner.x - outer.x) / scale, f64::from(inner.y - outer.y) / scale),
        _ => (0.0, 0.0),
    };
    let _ = window.set_position(LogicalPosition::new((x - dx).round(), (y - dy).round()));
}

/// Sizes a pop-out (logical px), places it — centred over the main window, or with its client area at the
/// screen point x, y (a menu under its button) — keeps it on the screen and shows it.
#[tauri::command]
pub fn place_popout(app: AppHandle, label: String, x: f64, y: f64, width: f64, height: f64, center: bool, focus: bool) -> bool {
    if !label.starts_with("popout-") {
        return false;
    }
    let Some(window) = app.get_webview_window(&label) else {
        return false;
    };
    let main = app.get_webview_window("main");
    let anchor = main.as_ref().unwrap_or(&window);
    let (ax, ay, aw, ah) = work_area(anchor).unwrap_or((0.0, 0.0, 1920.0, 1080.0));
    let w = width.round().clamp(80.0, aw);
    let h = height.round().clamp(40.0, ah);
    let scale = anchor.scale_factor().unwrap_or(1.0);
    let over = if center {
        match (anchor.inner_position(), anchor.inner_size()) {
            (Ok(p), Ok(s)) => {
                let p = p.to_logical::<f64>(scale);
                let s = s.to_logical::<f64>(scale);
                Some((p.x, p.y, s.width, s.height))
            }
            _ => Some((ax, ay, aw, ah)),
        }
    } else {
        None
    };
    let (px, py) = place_in(x, y, w, h, over, (ax, ay, aw, ah));
    let _ = window.set_size(LogicalSize::new(w, h));
    place_client(&window, px, py);
    let _ = window.show();
    if focus {
        let _ = window.set_focus();
    }
    true
}

/// Hides a pop-out kept for reuse (the menu window).
#[tauri::command]
pub fn hide_popout(app: AppHandle, label: String) -> bool {
    label.starts_with("popout-") && app.get_webview_window(&label).is_some_and(|w| w.hide().is_ok())
}

#[tauri::command]
pub fn close_popout(app: AppHandle, label: String) -> bool {
    label.starts_with("popout-") && app.get_webview_window(&label).is_some_and(|w| w.destroy().is_ok())
}

/// Moves a pop-out with the mouse (its title row; macOS and Linux — Windows uses the CSS app-region).
#[tauri::command]
pub fn drag_popout(app: AppHandle, label: String) -> bool {
    label.starts_with("popout-") && app.get_webview_window(&label).is_some_and(|w| w.start_dragging().is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_are_checked() {
        assert_eq!(popout_label(Some("popout-settings-12")), "popout-settings-12");
        assert!(popout_label(Some("../evil")).starts_with("popout-"));
        assert_ne!(popout_label(Some("../evil")), "../evil");
        assert!(popout_label(None).starts_with("popout-"));
    }

    #[test]
    fn placement_stays_on_screen() {
        let area = (0.0, 0.0, 1920.0, 1040.0);
        assert_eq!(place_in(100.0, 200.0, 300.0, 200.0, None, area), (100.0, 200.0));
        // a menu near the right edge is pulled back inside
        assert_eq!(place_in(1800.0, 900.0, 300.0, 200.0, None, area), (1620.0, 840.0));
        // centred over the main window, at least 24 px below its top
        assert_eq!(place_in(0.0, 0.0, 400.0, 900.0, Some((100.0, 100.0, 1000.0, 800.0)), area), (400.0, 124.0));
    }
}
