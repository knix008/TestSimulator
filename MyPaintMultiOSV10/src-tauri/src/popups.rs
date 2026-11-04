//! Menus and popups as real operating-system windows, so a long menu or a dialog can run
//! past the edge of the main window. The page sends the finished HTML (with the theme as
//! CSS variables inside it); the child window shows it and sends back one action.
//!
//! There is one `menu` window and one `popup` window. Both are created hidden once the
//! main page has loaded and are then only hidden and shown, so opening a menu does not
//! wait for a new webview to start. A window is shown only after its page reports that
//! it has rendered the HTML of the current opening (`child_rendered` with the matching
//! sequence number), so the previous menu never flashes up.
//!
//! Frameless, transparent, not in the taskbar, owned by the main window (they stay above
//! it, minimise and close with it). A menu also stays on top and closes when it loses the
//! focus. Places are given relative to the content origin of the window that asked and
//! are kept on the screen the same way the Electron build did (`fit_to_screen`).
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MAIN: &str = "main";
pub const MENU: &str = "menu";
pub const POPUP: &str = "popup";

/// Actions that change a popup without closing it.
pub const KEEP_POPUP: &[&str] = &[
    "print-prev",
    "print-next",
    "print-sync",
    "settings-sync",
    "settings-tab",
    "start-bg",
    "start-arrange",
    "start-reset",
    "palette-sync",
    "canvas-sync",
    "convert-sync",
];

/// A blur this soon after showing is Windows handing the focus around, not a click elsewhere.
const BLUR_GRACE: Duration = Duration::from_millis(150);

#[derive(Default)]
struct Child {
    html: String,
    seq: u64,
    pending_show: bool,
    shown_at: Option<Instant>,
}

#[derive(Default)]
struct Inner {
    /// The newest popup command seen. open_popup runs on a worker and close_popup on the main
    /// thread, so they can arrive out of order: a late close must not cancel the dialog after it.
    popup_gen: u64,
    menu: Child,
    popup: Child,
    sequence: u64,
    shutting_down: bool,
}

#[derive(Default)]
pub struct Popups {
    inner: Mutex<Inner>,
}

#[derive(Serialize, Clone)]
pub struct Html {
    pub html: String,
    pub seq: u64,
}

impl Inner {
    /// Whether a popup command is still current; commands that carry no number always are.
    fn accept(&mut self, gen: Option<u64>) -> bool {
        match gen {
            Some(number) if number < self.popup_gen => false,
            Some(number) => {
                self.popup_gen = number;
                true
            }
            None => true,
        }
    }
    fn child(&mut self, label: &str) -> Option<&mut Child> {
        match label {
            MENU => Some(&mut self.menu),
            POPUP => Some(&mut self.popup),
            _ => None,
        }
    }
}

fn state(app: &AppHandle) -> std::sync::MutexGuard<'_, Inner> {
    app.state::<Popups>().inner().inner.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn is_child(label: &str) -> bool {
    label == MENU || label == POPUP
}

/* ------------------------------------------------------------- geometry */

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A menu may run past the edge of the window but never past the edge of the screen: if it
/// does not fit right of / below the point it was asked for, it opens left of / above it,
/// and failing that it is pushed back inside the work area.
pub fn fit_to_screen(x: f64, y: f64, width: f64, height: f64, area: Rect) -> (f64, f64) {
    let (mut left, mut top) = (x, y);
    if left + width > area.x + area.width {
        left = x - width;
    }
    if left + width > area.x + area.width {
        left = area.x + area.width - width;
    }
    if left < area.x {
        left = area.x;
    }
    if top + height > area.y + area.height {
        top = y - height;
    }
    if top + height > area.y + area.height {
        top = area.y + area.height - height;
    }
    if top < area.y {
        top = area.y;
    }
    (left.round(), top.round())
}

/// The work area (logical pixels) of the monitor under a logical point.
fn work_area_at(window: &WebviewWindow, x: f64, y: f64) -> Rect {
    let to_rect = |position: tauri::PhysicalPosition<i32>, size: tauri::PhysicalSize<u32>, scale: f64| Rect {
        x: position.x as f64 / scale,
        y: position.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    };
    for monitor in window.available_monitors().unwrap_or_default() {
        let scale = monitor.scale_factor();
        let full = to_rect(*monitor.position(), *monitor.size(), scale);
        if x >= full.x && x < full.x + full.width && y >= full.y && y < full.y + full.height {
            let area = monitor.work_area();
            return to_rect(area.position, area.size, scale);
        }
    }
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let area = monitor.work_area();
        return to_rect(area.position, area.size, monitor.scale_factor());
    }
    Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1080.0 }
}

/// The content area of a window, in logical screen pixels.
pub fn content_bounds(window: &WebviewWindow) -> Option<Rect> {
    let scale = window.scale_factor().ok()?;
    let position = window.inner_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(Rect { x: position.x, y: position.y, width: size.width, height: size.height })
}

fn number(payload: &Value, key: &str, fallback: f64) -> f64 {
    payload.get(key).and_then(Value::as_f64).filter(|v| v.is_finite()).unwrap_or(fallback)
}

/// Where a child of the payload's size goes: at the payload's (x, y) inside the parent's
/// content area, or centred over it.
fn screen_point(parent: &WebviewWindow, payload: &Value, centered: bool) -> Rect {
    let width = number(payload, "width", 320.0).max(1.0);
    let height = number(payload, "height", 200.0).max(1.0);
    let origin = content_bounds(parent).unwrap_or(Rect { x: 0.0, y: 0.0, width: 0.0, height: 0.0 });
    let (x, y) = if centered {
        (origin.x + ((origin.width - width) / 2.0).max(0.0), origin.y + ((origin.height - height) / 2.0).max(0.0))
    } else {
        (origin.x + number(payload, "x", 0.0), origin.y + number(payload, "y", 0.0))
    };
    let area = work_area_at(parent, x, y);
    let (left, top) = fit_to_screen(x, y, width, height, area);
    Rect { x: left, y: top, width, height }
}

/* --------------------------------------------------------------- windows */

fn ensure(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
    if let Some(win) = app.get_webview_window(label) {
        return Some(win);
    }
    if state(app).shutting_down {
        return None;
    }
    let page = if label == MENU { "menu.html" } else { "popup.html" };
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title(crate::TITLE)
        .inner_size(320.0, 200.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .skip_taskbar(true)
        .always_on_top(label == MENU)
        .focused(false)
        .visible(false)
        .disable_drag_drop_handler()
        .on_navigation(crate::allowed_navigation);
    if let Some(main) = app.get_webview_window(MAIN) {
        builder = builder.parent(&main).ok()?;
    }
    builder.build().ok()
}

/// Creates both windows ahead of their first use.
pub fn warm(app: &AppHandle) {
    let _ = ensure(app, MENU);
    let _ = ensure(app, POPUP);
}

fn open(app: &AppHandle, caller: &WebviewWindow, label: &str, payload: &Value, centered: bool) -> bool {
    let html = payload.get("html").and_then(Value::as_str).unwrap_or("").to_string();
    let Some(win) = ensure(app, label) else { return false };
    let rect = screen_point(caller, payload, centered);
    let message = {
        // Deciding and recording are one step under one lock: a close that came in between them
        // would otherwise be undone by this open marking the window as waiting to be shown.
        let mut inner = state(app);
        if label == POPUP && !inner.accept(payload.get("gen").and_then(Value::as_u64)) {
            return true;
        }
        inner.sequence += 1;
        let seq = inner.sequence;
        let child = inner.child(label).expect("menu or popup");
        child.html = html.clone();
        child.seq = seq;
        child.pending_show = true;
        Html { html, seq }
    };
    if let Some(title) = payload.get("title").and_then(Value::as_str).filter(|t| !t.is_empty()) {
        let _ = win.set_title(title);
    }
    let _ = win.set_size(LogicalSize::new(rect.width, rect.height));
    let _ = win.set_position(LogicalPosition::new(rect.x, rect.y));
    let _ = app.emit_to(label, "popup-html", message);
    true
}

pub fn open_menu(app: &AppHandle, caller: &WebviewWindow, payload: &Value) -> bool {
    hide(app, MENU);
    open(app, caller, MENU, payload, false)
}

pub fn open_popup(app: &AppHandle, caller: &WebviewWindow, payload: &Value) -> bool {
    hide(app, MENU);
    let anchored = payload.get("anchor").and_then(Value::as_bool).unwrap_or(false);
    open(app, caller, POPUP, payload, !anchored)
}

pub fn close_popup(app: &AppHandle, gen: Option<u64>) {
    if state(app).accept(gen) {
        hide_then(app, POPUP, true);
    }
}

pub fn refresh_popup(app: &AppHandle, html: String, gen: Option<u64>) {
    let message = {
        let mut inner = state(app);
        if !inner.accept(gen) {
            return;
        }
        let child = &mut inner.popup;
        child.html = html.clone();
        Html { html, seq: child.seq }
    };
    let _ = app.emit_to(POPUP, "popup-html", message);
}

pub fn hide(app: &AppHandle, label: &str) {
    hide_then(app, label, false);
}

/// Hides a child; with `refocus` the main window gets the keyboard back (after an action,
/// not after a click into another program).
pub fn hide_then(app: &AppHandle, label: &str, refocus: bool) {
    let was_shown = {
        let mut inner = state(app);
        let Some(child) = inner.child(label) else { return };
        child.pending_show = false;
        child.shown_at.take().is_some()
    };
    // Showing and hiding take turns on the main thread, and each looks at what is wanted when its
    // turn comes. Otherwise a quick job closes first and the show still on its way lands after it,
    // which leaves a progress window on screen for good.
    let handle = app.clone();
    let name = label.to_string();
    let _ = app.run_on_main_thread(move || {
        let wanted = {
            let mut inner = state(&handle);
            inner.child(&name).is_some_and(|child| child.pending_show || child.shown_at.is_some())
        };
        if wanted {
            return; // opened again since
        }
        if let Some(win) = handle.get_webview_window(&name) {
            let _ = win.hide();
        }
        if was_shown && refocus {
            if let Some(main) = handle.get_webview_window(MAIN) {
                if main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(false) {
                    let _ = main.set_focus();
                }
            }
        }
    });
}

/// What a child window loaded late should show.
pub fn pull(app: &AppHandle, label: &str) -> Value {
    let mut inner = state(app);
    match inner.child(label) {
        Some(child) if !child.html.is_empty() => json!({ "html": child.html, "seq": child.seq }),
        _ => Value::Null,
    }
}

/// The child has drawn opening `seq`: show it now.
pub fn rendered(app: &AppHandle, window: &WebviewWindow, seq: u64) {
    let show = {
        let mut inner = state(app);
        match inner.child(window.label()) {
            Some(child) if child.pending_show && child.seq == seq => {
                child.pending_show = false;
                child.shown_at = Some(Instant::now());
                true
            }
            _ => false,
        }
    };
    if show {
        let handle = app.clone();
        let win = window.clone();
        let _ = app.run_on_main_thread(move || {
            let wanted = state(&handle).child(win.label()).is_some_and(|child| child.shown_at.is_some());
            if !wanted {
                return; // closed since
            }
            let _ = win.show();
            // at the end of a drag another program is in front, and Windows will not hand over the
            // focus: without this a dialog can open behind it, which looks like nothing happened
            if win.label() == POPUP {
                let _ = win.set_always_on_top(true);
                let _ = win.set_always_on_top(false);
            }
            let _ = win.set_focus();
        });
    }
}

/// One action from a child window, handed to the main window. The child goes away unless
/// the action only updates it.
pub fn action(app: &AppHandle, window: &WebviewWindow, payload: Value) {
    let name = payload.get("name").and_then(Value::as_str).unwrap_or("").to_string();
    let _ = app.emit_to(MAIN, "popup-action", payload);
    if is_child(window.label()) && !KEEP_POPUP.contains(&name.as_str()) {
        hide_then(app, window.label(), true);
    }
}

pub fn apply_theme(app: &AppHandle, css: String) {
    for label in [MENU, POPUP] {
        let _ = app.emit_to(label, "popup-theme", css.clone());
    }
}

/// A menu that loses the focus closes, as a menu does.
pub fn focus_changed(app: &AppHandle, label: &str, focused: bool) {
    if label != MENU || focused {
        return;
    }
    let dismiss = state(app).menu.shown_at.is_some_and(|shown| shown.elapsed() > BLUR_GRACE);
    if dismiss {
        hide(app, MENU);
    }
}

/// Alt+F4 on a child hides it instead of destroying the pooled window.
pub fn close_requested(app: &AppHandle, label: &str) -> bool {
    if !is_child(label) || state(app).shutting_down {
        return false;
    }
    hide(app, label);
    true
}

pub fn close_all(app: &AppHandle) {
    state(app).shutting_down = true;
    for label in [MENU, POPUP] {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.destroy();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA: Rect = Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1040.0 };

    #[test]
    fn a_menu_opens_at_the_point() {
        assert_eq!(fit_to_screen(100.0, 40.0, 320.0, 300.0, AREA), (100.0, 40.0));
    }

    #[test]
    fn a_menu_opens_left_of_the_point_at_the_right_edge() {
        assert_eq!(fit_to_screen(1800.0, 40.0, 320.0, 300.0, AREA), (1480.0, 40.0));
    }

    #[test]
    fn a_menu_opens_above_the_point_at_the_bottom() {
        assert_eq!(fit_to_screen(100.0, 900.0, 320.0, 300.0, AREA), (100.0, 600.0));
    }

    #[test]
    fn a_menu_taller_than_the_screen_is_pushed_inside() {
        assert_eq!(fit_to_screen(100.0, 200.0, 320.0, 1200.0, AREA), (100.0, 0.0));
        let second = Rect { x: -1280.0, y: 0.0, width: 1280.0, height: 1000.0 };
        assert_eq!(fit_to_screen(-1400.0, 10.0, 200.0, 100.0, second), (-1280.0, 10.0));
    }

    #[test]
    fn a_late_popup_command_does_not_undo_a_newer_one() {
        let mut inner = Inner::default();
        assert!(inner.accept(Some(3)), "the dialog opens");
        assert!(!inner.accept(Some(2)), "the close sent before it comes too late");
        assert!(inner.accept(Some(3)), "its own refresh still counts");
        assert!(inner.accept(Some(4)), "and so does what comes after");
        assert!(inner.accept(None), "a command with no number always counts");
    }

    #[test]
    fn the_export_dialog_stays_open_while_its_fields_change() {
        for name in ["convert-sync", "print-sync", "settings-sync", "print-next"] {
            assert!(KEEP_POPUP.contains(&name), "{name}");
        }
        assert!(!KEEP_POPUP.contains(&"close"));
    }
}
