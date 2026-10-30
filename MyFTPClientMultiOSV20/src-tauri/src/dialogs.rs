// Popup dialogs as their own OS windows: movable anywhere (onto another
// monitor too), closed with the main window. Opening a dialog that is already
// open focuses it and hands it the new payload instead of making a second copy.
//
// The page in a dialog window is the app's own index.html; an initialization
// script tells it which dialog to render (window.__MFC_DIALOG__). It asks for
// its payload, reports when it is painted (the window is shown then) and its
// content size (the window is fitted once, then locked), and submits a result
// that goes back to the window that opened it as a `dialog:result` event.
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MANUAL_LABEL: &str = "manual";

/// Size of a dialog window. Popups are never user-resizable: `fit: false`
/// keeps the designed size (the settings tabs); the rest are sized once to
/// their content, then locked.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spec {
    pub width: f64,
    pub height: f64,
    pub fit: bool,
}

pub fn spec(kind: &str) -> Spec {
    let (width, height, fit) = match kind {
        "settings" => (540.0, 520.0, false),
        "about" => (520.0, 360.0, true),
        "error" => (580.0, 280.0, true),
        "message" => (520.0, 240.0, true),
        "confirm" => (500.0, 240.0, true),
        "prompt" => (460.0, 220.0, true),
        "conflict" => (540.0, 280.0, true),
        "profileDelete" => (440.0, 280.0, true),
        _ => (520.0, 360.0, true),
    };
    Spec { width, height, fit }
}

/// Window label for a dialog name ("kind" or "kind#id"): letters, digits, - and _ only.
pub fn label_for(name: &str) -> String {
    let clean: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    format!("dlg-{clean}")
}

struct Entry {
    name: String,
    payload: Value,
    opener: String,
    submitted: bool,
}

#[derive(Default)]
pub struct Dialogs {
    open: Mutex<HashMap<String, Entry>>, // label → entry
}

fn colour(hex: &str) -> Option<tauri::window::Color> {
    let hex = hex.trim().strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    Some(tauri::window::Color(byte(0)?, byte(2)?, byte(4)?, 255))
}

/// Logical rectangle of a window: (x, y, width, height).
fn logical_bounds(win: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let scale = win.scale_factor().ok()?;
    let pos = win.outer_position().ok()?.to_logical::<f64>(scale);
    let size = win.outer_size().ok()?.to_logical::<f64>(scale);
    Some((pos.x, pos.y, size.width, size.height))
}

/// Centre of `opener`, kept inside the monitor it is on.
fn centred_on(opener: &WebviewWindow, width: f64, height: f64) -> Option<(f64, f64)> {
    let (x, y, w, h) = logical_bounds(opener)?;
    let mut left = x + (w - width) / 2.0;
    let mut top = y + (h - height) / 2.0;
    if let Ok(Some(monitor)) = opener.current_monitor() {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let mx = area.position.x as f64 / scale;
        let my = area.position.y as f64 / scale;
        let mw = area.size.width as f64 / scale;
        let mh = area.size.height as f64 / scale;
        left = left.min(mx + mw - width).max(mx);
        top = top.min(my + mh - height).max(my);
    }
    Some((left, top))
}

fn reveal(win: &WebviewWindow) {
    if !win.is_visible().unwrap_or(true) {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[tauri::command]
pub async fn dialog_open(app: AppHandle, window: WebviewWindow, state: tauri::State<'_, Dialogs>, name: String, payload: Value) -> Result<bool, String> {
    let label = label_for(&name);
    let kind = name.split('#').next().unwrap_or("").to_string();
    if let Some(existing) = app.get_webview_window(&label) {
        if let Some(entry) = state.open.lock().unwrap_or_else(|e| e.into_inner()).get_mut(&label) {
            entry.payload = payload.clone();
            entry.submitted = false;
            entry.opener = window.label().to_string();
        }
        let _ = existing.emit_to(label.as_str(), "dialog:payload", payload);
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(true);
    }

    let size = spec(&kind);
    let title = payload.get("title").and_then(Value::as_str).unwrap_or("My FTP Client").to_string();
    let bg = payload.pointer("/appearance/bg").and_then(Value::as_str).and_then(colour);
    let script = format!("window.__MFC_DIALOG__ = {};", json!(name));
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(size.width, size.height)
        .resizable(false)
        .maximizable(false)
        .minimizable(true)
        .decorations(false)
        .shadow(true)
        .visible(false)
        .skip_taskbar(false)
        .initialization_script(&script);
    if let Some(color) = bg {
        builder = builder.background_color(color);
    }
    if let Some((x, y)) = centred_on(&window, size.width, size.height) {
        builder = builder.position(x, y);
    }
    // Owned by the window that opened it: it stays above it and closes with it,
    // but is not modal and moves freely, outside the main window as well.
    builder = builder.parent(&window).map_err(|e| e.to_string())?;
    state.open.lock().unwrap_or_else(|e| e.into_inner()).insert(
        label.clone(),
        Entry { name: name.clone(), payload, opener: window.label().to_string(), submitted: false },
    );
    let win = builder.build().map_err(|e| e.to_string())?;
    // The page reports when it is painted (dialog_ready). If it never does, show it anyway.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        reveal(&win);
    });
    Ok(true)
}

#[tauri::command]
pub fn dialog_payload(window: WebviewWindow, state: tauri::State<'_, Dialogs>) -> Option<Value> {
    let open = state.open.lock().unwrap_or_else(|e| e.into_inner());
    open.get(window.label()).map(|e| json!({ "name": e.name, "payload": e.payload }))
}

#[tauri::command]
pub fn dialog_submit(app: AppHandle, state: tauri::State<'_, Dialogs>, name: String, data: Value, keep_open: Option<bool>) -> bool {
    let label = label_for(&name);
    let opener = {
        let mut open = state.open.lock().unwrap_or_else(|e| e.into_inner());
        let Some(entry) = open.get_mut(&label) else { return false };
        if !keep_open.unwrap_or(false) {
            entry.submitted = true;
        }
        entry.opener.clone()
    };
    let _ = app.emit_to(opener.as_str(), "dialog:result", json!({ "name": name, "data": data }));
    true
}

#[tauri::command]
pub fn dialog_close(app: AppHandle, name: String) -> bool {
    if let Some(win) = app.get_webview_window(&label_for(&name)) {
        let _ = win.close();
    }
    true
}

#[tauri::command]
pub fn dialog_close_self(window: WebviewWindow) -> bool {
    let _ = window.close();
    true
}

#[tauri::command]
pub fn dialog_ready(window: WebviewWindow) -> bool {
    reveal(&window);
    true
}

/// Fits a dialog to its content once (not the settings window, which keeps its size).
#[tauri::command]
pub fn dialog_set_size(window: WebviewWindow, width: f64, height: f64) -> bool {
    let kind = window.label().trim_start_matches("dlg-").split('_').next().unwrap_or("").to_string();
    if !spec(&kind).fit || width < 80.0 || height < 80.0 {
        return false;
    }
    let (mut w, mut h) = (width.round(), height.round());
    if let Ok(Some(monitor)) = window.current_monitor() {
        let scale = monitor.scale_factor();
        w = w.min(monitor.work_area().size.width as f64 / scale);
        h = h.min(monitor.work_area().size.height as f64 / scale);
    }
    let _ = window.set_size(LogicalSize::new(w, h));
    true
}

/// Theme / language / font size changed in one window: every window follows.
#[tauri::command]
pub fn broadcast_appearance(app: AppHandle, appearance: Value) -> bool {
    let _ = app.emit("dialog:appearance", appearance);
    true
}

/// The user guide (doc/index.html) in its own top-level window. It is not owned by
/// the main window, so it can be moved anywhere and stays visible on its own.
/// A second request focuses the open guide and hands it the current appearance.
#[tauri::command]
pub async fn manual_open(app: AppHandle, window: WebviewWindow, appearance: Value) -> Result<bool, String> {
    if let Some(existing) = app.get_webview_window(MANUAL_LABEL) {
        let _ = existing.emit_to(MANUAL_LABEL, "dialog:appearance", appearance);
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(true);
    }
    let (width, height) = (1040.0, 760.0);
    let script = format!("window.__MFC_DOC__ = {};", appearance);
    let mut builder = WebviewWindowBuilder::new(&app, MANUAL_LABEL, WebviewUrl::App("doc/index.html".into()))
        .title("My FTP Client — User Guide")
        .inner_size(width, height)
        .min_inner_size(820.0, 480.0)
        .resizable(true)
        .decorations(false)
        .shadow(true)
        .initialization_script(&script);
    if let Some(color) = appearance.get("bg").and_then(Value::as_str).and_then(colour) {
        builder = builder.background_color(color);
    }
    if let Some((x, y, _, _)) = logical_bounds(&window) {
        builder = builder.position(x + 60.0, y + 40.0);
    }
    builder.build().map_err(|e| e.to_string())?;
    Ok(true)
}

/// A dialog window is gone (submitted, closed, Alt+F4): its opener gets `null`
/// as the result if nothing was submitted, and a `dialog:closed` event.
pub fn on_destroyed(app: &AppHandle, label: &str) {
    let Some(state) = app.try_state::<Dialogs>() else { return };
    let Some(entry) = state.open.lock().unwrap_or_else(|e| e.into_inner()).remove(label) else { return };
    if !entry.submitted {
        let _ = app.emit_to(entry.opener.as_str(), "dialog:result", json!({ "name": entry.name, "data": null }));
    }
    let _ = app.emit_to(entry.opener.as_str(), "dialog:closed", json!({ "name": entry.name }));
}

/// Closing the main window closes every dialog and the guide with it.
pub fn close_all(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label != "main" {
            let _ = win.destroy();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_keeps_its_designed_size() {
        assert_eq!(spec("settings"), Spec { width: 540.0, height: 520.0, fit: false });
    }

    #[test]
    fn other_dialogs_fit_their_content() {
        for kind in ["about", "error", "message", "confirm", "prompt", "conflict", "profileDelete", "unknown"] {
            assert!(spec(kind).fit, "{kind}");
        }
    }

    #[test]
    fn labels_are_valid_window_labels() {
        assert_eq!(label_for("settings"), "dlg-settings");
        assert_eq!(label_for("error#3"), "dlg-error_3");
        assert!(label_for("a b/c.d").chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn colours_parse_from_hex() {
        assert!(colour("#12161c").is_some());
        assert!(colour("12161c").is_none());
        assert!(colour("#fff").is_none());
    }
}
