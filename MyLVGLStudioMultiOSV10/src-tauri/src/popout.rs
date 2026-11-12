// Dialogs as windows of their own.
//
// The page opens one with window.open("about:blank#dialog-<name>") and renders into that document
// itself (a React portal: same origin, same state), so the host only builds the window: frameless,
// owned by the main window, hidden until the page has measured its content and asks for it to be
// shown. A dialog can then be moved anywhere, also outside the program. The main window takes no
// input while one is open, as under the dimmed backdrop of an in-page dialog.
use serde::Deserialize;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const PREFIX: &str = "dialog-";
/// A window to keep open beside the work (the user guide): no owner, a taskbar button, can be
/// minimized and resized, and the main window goes on taking input.
const FREE_PREFIX: &str = "dialog-free-";
const FREE_MIN: (f64, f64) = (560.0, 360.0);

/// The minimum a window's content asked for (popout_min_size), by label. Windows keeps a minimum
/// only while the mouse sizes a window; a size set any other way is held to it here.
static MINIMUMS: std::sync::Mutex<Vec<(String, f64, f64)>> = std::sync::Mutex::new(Vec::new());

fn minimum_of(label: &str) -> Option<(f64, f64)> {
    MINIMUMS.lock().ok()?.iter().find(|(name, _, _)| name == label).map(|(_, w, h)| (*w, *h))
}

/// The window label for `about:blank#<fragment>`, or None for what the page may not open this way.
pub fn label_for(fragment: Option<&str>) -> Option<String> {
    let fragment = fragment?;
    let name = fragment.strip_prefix(PREFIX)?;
    let fits = !name.is_empty() && fragment.len() <= 48 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    fits.then(|| fragment.to_string())
}

pub fn is_dialog(label: &str) -> bool {
    label.starts_with(PREFIX)
}

pub fn is_free(label: &str) -> bool {
    label.starts_with(FREE_PREFIX)
}

fn is_modal(label: &str) -> bool {
    is_dialog(label) && !is_free(label)
}

/// Builds the window window.open asked for, from the main window's on_new_window handler.
pub fn new_window(app: &AppHandle, owner: &WebviewWindow, url: &Url, features: NewWindowFeatures) -> NewWindowResponse<tauri::Wry> {
    let Some(label) = label_for(url.fragment()) else {
        return NewWindowResponse::Deny;
    };
    // A window left over from a page reload is replaced.
    if let Some(old) = app.get_webview_window(&label) {
        let _ = old.destroy();
    }
    let Ok(blank) = "about:blank".parse::<Url>() else {
        return NewWindowResponse::Deny;
    };
    let free = is_free(&label);
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
        .window_features(features)
        .title("My LVGL Studio")
        .decorations(false)
        .resizable(free)
        .maximizable(false)
        .minimizable(free)
        .skip_taskbar(!free)
        .shadow(true)
        .visible(false)
        .disable_drag_drop_handler();
    let built = if free {
        builder.min_inner_size(FREE_MIN.0, FREE_MIN.1).build()
    } else {
        let Ok(owned) = builder.parent(owner) else {
            return NewWindowResponse::Deny;
        };
        owned.build()
    };
    match built {
        Ok(window) => NewWindowResponse::Create { window },
        Err(_) => NewWindowResponse::Deny,
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ShowOptions {
    pub label: String,
    pub width: f64,
    pub height: f64,
    /// Only follow a change of the content's size: no move, no show.
    pub resize_only: bool,
}

/// (x, y, width, height) of the work area of the monitor holding the point, in logical pixels.
fn work_area_at(app: &AppHandle, x: f64, y: f64, scale: f64) -> Option<(f64, f64, f64, f64)> {
    let monitor = app.monitor_from_point(x * scale, y * scale).ok().flatten().or_else(|| app.primary_monitor().ok().flatten())?;
    let factor = monitor.scale_factor();
    let area = monitor.work_area();
    Some((f64::from(area.position.x) / factor, f64::from(area.position.y) / factor, f64::from(area.size.width) / factor, f64::from(area.size.height) / factor))
}

/// Keeps a box on the work area.
pub fn clamp_to_area(x: f64, y: f64, w: f64, h: f64, area: (f64, f64, f64, f64)) -> (f64, f64) {
    let (ax, ay, aw, ah) = area;
    let x = x.min(ax + aw - w).max(ax);
    let y = y.min(ay + ah - h).max(ay);
    (x.round(), y.round())
}

/// Sizes a dialog to the content the page measured, centres it over the main window and shows it.
#[tauri::command]
pub fn popout_show(app: AppHandle, options: ShowOptions) -> bool {
    if !is_dialog(&options.label) || !options.width.is_finite() || !options.height.is_finite() {
        return false;
    }
    let Some(window) = app.get_webview_window(&options.label) else {
        return false;
    };
    let (mut w, mut h) = (options.width.round().max(40.0), options.height.round().max(24.0));
    if let Some((min_w, min_h)) = minimum_of(&options.label) {
        w = w.max(min_w);
        h = h.max(min_h);
    }
    let _ = window.set_size(LogicalSize::new(w, h));
    if options.resize_only {
        return true;
    }
    let main = app.get_webview_window(crate::MAIN);
    let scale = window.scale_factor().unwrap_or(1.0);
    let (x, y) = main
        .as_ref()
        .and_then(|m| {
            let factor = m.scale_factor().ok()?;
            let at = m.inner_position().ok()?.to_logical::<f64>(factor);
            let size = m.inner_size().ok()?.to_logical::<f64>(factor);
            Some((at.x + (size.width - w) / 2.0, at.y + (size.height - h) / 2.0))
        })
        .unwrap_or((100.0, 100.0));
    let (x, y) = match work_area_at(&app, x + w / 2.0, y, scale) {
        Some(area) => clamp_to_area(x, y, w, h, area),
        None => (x.round(), y.round()),
    };
    let _ = window.set_position(LogicalPosition::new(x, y));
    // Under a modal dialog only it takes input: also a dialog that asked it a question.
    if is_modal(&options.label) {
        if let Some(m) = &main {
            let _ = m.set_enabled(false);
        }
        for (other, under) in app.webview_windows() {
            if is_modal(&other) && other != options.label {
                let _ = under.set_enabled(false);
            }
        }
    }
    let _ = window.show();
    let _ = window.set_focus();
    true
}

/// The smallest size a free-standing window may take, as its content measured it (the code
/// editor: its toolbar on one line). A window already smaller grows to it.
#[tauri::command]
pub fn popout_min_size(app: AppHandle, label: String, width: f64, height: f64) -> bool {
    if !is_dialog(&label) || !width.is_finite() || !height.is_finite() {
        return false;
    }
    let Some(window) = app.get_webview_window(&label) else {
        return false;
    };
    let (w, h) = (width.round().max(FREE_MIN.0), height.round().max(FREE_MIN.1));
    if let Ok(mut list) = MINIMUMS.lock() {
        list.retain(|(name, _, _)| name != &label);
        list.push((label.clone(), w, h));
    }
    let _ = window.set_min_size(Some(LogicalSize::new(w, h)));
    let scale = window.scale_factor().unwrap_or(1.0);
    if let Ok(size) = window.inner_size().map(|size| size.to_logical::<f64>(scale)) {
        if size.width < w || size.height < h {
            let _ = window.set_size(LogicalSize::new(size.width.max(w), size.height.max(h)));
        }
    }
    true
}

/// The dialog's title bar was pressed: the window follows the mouse until it is released.
#[tauri::command]
pub fn popout_drag(app: AppHandle, label: String) -> bool {
    is_dialog(&label) && app.get_webview_window(&label).is_some_and(|window| window.start_dragging().is_ok())
}

#[tauri::command]
pub fn popout_minimize(app: AppHandle, label: String) -> bool {
    is_free(&label) && app.get_webview_window(&label).is_some_and(|window| window.minimize().is_ok())
}

/// Brings a free window back, when what opens it is used again while it is open.
#[tauri::command]
pub fn popout_focus(app: AppHandle, label: String) -> bool {
    is_free(&label)
        && app.get_webview_window(&label).is_some_and(|window| {
            let _ = window.unminimize();
            window.set_focus().is_ok()
        })
}

/// window.close() from the opener does not reach a window the host created.
#[tauri::command]
pub fn popout_close(app: AppHandle, label: String) -> bool {
    is_dialog(&label) && app.get_webview_window(&label).is_some_and(|window| window.destroy().is_ok())
}

/// A free window has no owner to go with: the main window takes them all along when it closes.
pub fn close_all(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if is_dialog(&label) {
            let _ = window.destroy();
        }
    }
}

/// The page has just started: what a reload left behind goes, and the main window takes input.
#[tauri::command]
pub fn popout_reset(app: AppHandle) {
    close_all(&app);
    if let Some(main) = app.get_webview_window(crate::MAIN) {
        let _ = main.set_enabled(true);
    }
}

/// For the GUI tests, which drive one page: dialogs stay inside the main window.
#[tauri::command]
pub fn popout_inline() -> bool {
    std::env::var_os("MLS_INLINE_DIALOGS").is_some()
}

/// A dialog's window is gone. Input goes back to the dialog under it, or one that opened in its
/// place, and otherwise to the main window. The page drops its dialog when the window went some
/// other way (Alt+F4).
pub fn closed(app: &AppHandle, label: &str) {
    if is_free(label) {
        let _ = app.emit_to(crate::MAIN, "popout-closed", label);
        return;
    }
    let mut others = false;
    for (other, window) in app.webview_windows() {
        if is_modal(&other) && other != label {
            others = true;
            let _ = window.set_enabled(true);
            if window.is_visible().unwrap_or(false) {
                let _ = window.set_focus();
            }
        }
    }
    if !others {
        if let Some(main) = app.get_webview_window(crate::MAIN) {
            let _ = main.set_enabled(true);
            let _ = main.set_focus();
        }
    }
    let _ = app.emit_to(crate::MAIN, "popout-closed", label);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_only_for_dialogs() {
        assert_eq!(label_for(Some("dialog-settings")).as_deref(), Some("dialog-settings"));
        assert_eq!(label_for(Some("dialog-new-project")).as_deref(), Some("dialog-new-project"));
        assert_eq!(label_for(Some("dialog-")), None);
        assert_eq!(label_for(Some("main")), None);
        assert_eq!(label_for(Some("dialog-a/b")), None);
        assert_eq!(label_for(None), None);
        assert!(is_dialog("dialog-about") && !is_dialog("main") && !is_dialog("run"));
        assert!(is_free("dialog-free-guide-3") && is_dialog("dialog-free-guide-3") && !is_free("dialog-guide-3"));
        assert!(is_modal("dialog-about-1") && !is_modal("dialog-free-guide-3") && !is_modal("main"));
    }

    #[test]
    fn keeps_boxes_on_the_work_area() {
        let area = (0.0, 0.0, 1920.0, 1080.0);
        assert_eq!(clamp_to_area(100.0, 100.0, 200.0, 300.0, area), (100.0, 100.0));
        assert_eq!(clamp_to_area(1800.0, 900.0, 200.0, 300.0, area), (1720.0, 780.0));
        assert_eq!(clamp_to_area(-50.0, -20.0, 200.0, 300.0, (-1920.0, 0.0, 1920.0, 1080.0)), (-200.0, 0.0));
    }
}
