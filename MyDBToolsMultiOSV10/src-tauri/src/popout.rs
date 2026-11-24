// Pop-out windows: every dialog and the print window.
//
// The page opens them with window.open("about:blank#dialog-<n>") or
// window.open("about:blank#print-<n>") and renders into that document itself (a
// React portal: same origin, same JavaScript context, same state), so the host
// only builds the window: frameless, owned by the main window, hidden until the
// page has measured its content and asks for it to be placed and shown.
//
// A dialog disables the main window while it is open, as a modal does; the print
// window does not; it has a taskbar entry of its own. Neither can be resized.
use serde::Deserialize;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const DIALOG_PREFIX: &str = "dialog-";
const PRINT_PREFIX: &str = "print-";

/// The window label for `about:blank#<fragment>`, or None for anything the page
/// is not allowed to open this way.
pub fn popout_label(fragment: Option<&str>) -> Option<String> {
    let f = fragment?;
    if f.is_empty() || f.len() > 48 || !f.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return None;
    }
    let rest = f.strip_prefix(DIALOG_PREFIX).or_else(|| f.strip_prefix(PRINT_PREFIX))?;
    (!rest.is_empty()).then(|| f.to_string())
}

pub fn is_popout(label: &str) -> bool {
    label.starts_with(DIALOG_PREFIX) || label.starts_with(PRINT_PREFIX)
}

fn is_dialog(label: &str) -> bool {
    label.starts_with(DIALOG_PREFIX)
}

/// Builds the window window.open asked for (from the main window's on_new_window).
pub fn new_window(app: &AppHandle, owner: &WebviewWindow, url: &Url, features: NewWindowFeatures) -> NewWindowResponse<tauri::Wry> {
    let Some(label) = popout_label(url.fragment()) else {
        return NewWindowResponse::Deny;
    };
    // A window left over from a page reload is replaced.
    if let Some(old) = app.get_webview_window(&label) {
        let _ = old.destroy();
    }
    let Ok(blank) = "about:blank".parse::<Url>() else {
        return NewWindowResponse::Deny;
    };
    let print = !is_dialog(&label);
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
        .window_features(features)
        .title(crate::TITLE)
        .decorations(false)
        // Neither dialogs nor the print window change size: each is laid out for
        // the size it opens at, without scroll bars.
        .resizable(false)
        .maximizable(false)
        .minimizable(print)
        .skip_taskbar(!print)
        .shadow(true)
        .visible(false)
        .disable_drag_drop_handler();
    let builder = match builder.parent(owner) {
        Ok(next) => next,
        Err(_) => return NewWindowResponse::Deny,
    };
    match builder.build() {
        Ok(window) => NewWindowResponse::Create { window },
        Err(_) => NewWindowResponse::Deny,
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PlaceOpts {
    pub label: String,
    pub width: f64,
    pub height: f64,
    /// Only follow a size change of the content: no move, no show.
    pub resize_only: bool,
    /// Disable the main window while this one is open.
    pub modal: bool,
}

/// (x, y, width, height) of the work area of the monitor holding the point.
fn work_area_at(app: &AppHandle, x: f64, y: f64, scale: f64) -> Option<(f64, f64, f64, f64)> {
    let m = app.monitor_from_point(x * scale, y * scale).ok().flatten().or_else(|| app.primary_monitor().ok().flatten())?;
    let ms = m.scale_factor();
    let wa = m.work_area();
    Some((wa.position.x as f64 / ms, wa.position.y as f64 / ms, wa.size.width as f64 / ms, wa.size.height as f64 / ms))
}

/// Keeps a w x h box at x, y on the work area.
pub fn clamp_to_area(x: f64, y: f64, w: f64, h: f64, area: (f64, f64, f64, f64)) -> (f64, f64) {
    let (ax, ay, aw, ah) = area;
    let x = x.min(ax + aw - w).max(ax);
    let y = y.min(ay + ah - h).max(ay);
    (x.round(), y.round())
}

/// Moves the window so that its client area starts at x, y: a frameless window's
/// outer rectangle includes an invisible resize border.
fn place_client(window: &WebviewWindow, x: f64, y: f64) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let (dx, dy) = match (window.inner_position(), window.outer_position()) {
        (Ok(i), Ok(o)) => (f64::from(i.x - o.x) / scale, f64::from(i.y - o.y) / scale),
        _ => (0.0, 0.0),
    };
    let _ = window.set_position(LogicalPosition::new((x - dx).round(), (y - dy).round()));
}

/// Sizes a pop-out to the content the page measured, centres it over the main
/// window and shows it.
#[tauri::command]
pub fn popout_show(app: AppHandle, opts: PlaceOpts) -> bool {
    if !is_popout(&opts.label) || !opts.width.is_finite() || !opts.height.is_finite() {
        return false;
    }
    let Some(window) = app.get_webview_window(&opts.label) else { return false };
    let main = app.get_webview_window(crate::MAIN);
    let scale = window.scale_factor().unwrap_or(1.0);
    let (mut w, mut h) = (opts.width.round().max(120.0), opts.height.round().max(80.0));
    // Never larger than the screen it opens on.
    let centre = main.as_ref().and_then(|m| {
        let ms = m.scale_factor().ok()?;
        let p = m.inner_position().ok()?.to_logical::<f64>(ms);
        let s = m.inner_size().ok()?.to_logical::<f64>(ms);
        Some((p.x + s.width / 2.0, p.y + s.height / 2.0))
    });
    let (cx, cy) = centre.unwrap_or((640.0, 400.0));
    let area = work_area_at(&app, cx, cy, scale);
    if let Some((_, _, aw, ah)) = area {
        w = w.min(aw - 16.0);
        h = h.min(ah - 16.0);
    }
    let _ = window.set_size(LogicalSize::new(w, h));
    if opts.resize_only {
        return true;
    }
    let (x, y) = (cx - w / 2.0, cy - h / 2.0);
    let (x, y) = match area {
        Some(area) => clamp_to_area(x, y, w, h, area),
        None => (x.round(), y.round()),
    };
    place_client(&window, x, y);
    if opts.modal && is_dialog(&opts.label) {
        if let Some(m) = &main {
            let _ = m.set_enabled(false);
        }
    }
    let _ = window.show();
    let _ = window.set_focus();
    true
}

/// window.close() from the opener does not reach a window the host created.
#[tauri::command]
pub fn popout_close(app: AppHandle, label: String) -> bool {
    if !is_popout(&label) {
        return false;
    }
    // Destroyed then re-enables the main window and tells the page.
    app.get_webview_window(&label).is_some_and(|w| w.destroy().is_ok())
}

/// A pop-out is gone (closed by the page, by its own close button or by Alt+F4):
/// the main window takes input again, and the page drops its state for it.
pub fn closed(app: &AppHandle, label: &str) {
    if is_dialog(label) {
        let others_open = app.webview_windows().keys().any(|l| l != label && is_dialog(l));
        if let Some(m) = app.get_webview_window(crate::MAIN) {
            if !others_open {
                let _ = m.set_enabled(true);
                let _ = m.set_focus();
            }
        }
    }
    let _ = app.emit_to(crate::MAIN, "popout-closed", label);
}

/// Every pop-out, when the app quits.
pub fn close_all(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if is_popout(&label) {
            let _ = window.destroy();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_only_for_dialogs_and_print_windows() {
        assert_eq!(popout_label(Some("dialog-3")).as_deref(), Some("dialog-3"));
        assert_eq!(popout_label(Some("print-1")).as_deref(), Some("print-1"));
        assert_eq!(popout_label(Some("dialog-")), None);
        assert_eq!(popout_label(Some("menu")), None);
        assert_eq!(popout_label(Some("dialog-a/b")), None);
        assert_eq!(popout_label(None), None);
        assert!(is_popout("dialog-2") && is_popout("print-1") && !is_popout("main"));
    }

    #[test]
    fn keeps_boxes_on_the_work_area() {
        let area = (0.0, 0.0, 1920.0, 1080.0);
        assert_eq!(clamp_to_area(100.0, 100.0, 200.0, 300.0, area), (100.0, 100.0));
        assert_eq!(clamp_to_area(1800.0, 900.0, 200.0, 300.0, area), (1720.0, 780.0));
        assert_eq!(clamp_to_area(-50.0, -20.0, 200.0, 300.0, area), (0.0, 0.0));
    }
}
