//! A single, reusable borderless window for dropdowns and context menus.
//!
//! Menus live in their own OS window so they can extend past the edges of the
//! main window. The window is created once, then shown/hidden and re-filled
//! with a new payload for every menu; it hides itself as soon as it loses focus.

use crate::dialogs;
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "popup";

struct PopupState {
    payload: Value,
    open: bool,
    shown_at: Option<Instant>,
}

static STATE: Mutex<PopupState> = Mutex::new(PopupState { payload: Value::Null, open: false, shown_at: None });

fn token_of(payload: &Value) -> Value {
    payload.get("token").cloned().unwrap_or(Value::Null)
}

fn num(v: &Value, key: &str) -> f64 {
    v.get(key).and_then(|x| x.as_f64()).unwrap_or(0.0)
}

fn monitor_at(app: &AppHandle, main: &WebviewWindow, x: f64, y: f64) -> Option<Monitor> {
    if let Ok(list) = app.available_monitors() {
        for m in list {
            let p = m.position();
            let s = m.size();
            if x >= p.x as f64 && y >= p.y as f64 && x < p.x as f64 + s.width as f64 && y < p.y as f64 + s.height as f64 {
                return Some(m);
            }
        }
    }
    main.current_monitor().ok().flatten()
}

/// Hide the popup and tell the main window it closed. No-op if already hidden.
pub fn hide(app: &AppHandle) {
    let token = {
        let Ok(mut st) = STATE.lock() else { return };
        if !st.open {
            return;
        }
        st.open = false;
        st.shown_at = None;
        token_of(&st.payload)
    };
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("popup:closed", json!({ "token": token }));
    }
}

/// Focus moving away from the popup closes it. Focus changes before it is
/// shown (window creation) or right after (stale events while it appears)
/// are ignored.
pub fn on_focus_lost(app: &AppHandle) {
    let settled = STATE
        .lock()
        .ok()
        .and_then(|st| st.shown_at)
        .map(|t| t.elapsed() >= Duration::from_millis(120))
        .unwrap_or(false);
    if settled {
        hide(app);
    }
}

// Async: creating a webview inside a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn popup_show(app: AppHandle, payload: Value) -> Result<bool, String> {
    hide(&app);
    {
        let mut st = STATE.lock().map_err(|e| e.to_string())?;
        st.payload = payload.clone();
        st.open = true;
        st.shown_at = None;
    }

    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.emit("popup:payload", payload);
        return Ok(true);
    }

    let bg = payload
        .get("appearance")
        .and_then(|a| a.get("tokens"))
        .and_then(|v| v.get("--bg-raised"))
        .and_then(|v| v.as_str())
        .unwrap_or("#1b2028")
        .to_string();
    let mut builder = WebviewWindowBuilder::new(&app, LABEL, dialogs::dialog_url(&app, "popup"))
        .title("CaptureMaster")
        .inner_size(10.0, 10.0)
        .decorations(false)
        .resizable(false)
        .visible(false)
        .skip_taskbar(true)
        .shadow(true)
        .focused(true)
        .background_color(dialogs::parse_color(&bg))
        .initialization_script("window.__CM_DIALOG__ = \"popup\";");
    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }
    builder.build().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn popup_get_payload() -> Value {
    STATE.lock().map(|st| st.payload.clone()).unwrap_or(Value::Null)
}

/// Called by the popup page once it has measured its content (CSS pixels).
/// Positions the window next to its anchor, clamped to the monitor work area,
/// and shows it.
#[tauri::command]
pub fn popup_place(app: AppHandle, window: WebviewWindow, token: Value, width: f64, height: f64) -> bool {
    let payload = {
        let Ok(st) = STATE.lock() else { return false };
        if !st.open || token_of(&st.payload) != token {
            return false;
        }
        st.payload.clone()
    };
    let Some(main) = app.get_webview_window("main") else { return false };
    let scale = main.scale_factor().unwrap_or(1.0);
    let Ok(origin) = main.inner_position() else { return false };
    let anchor = payload.get("anchor").cloned().unwrap_or(Value::Null);
    let ax = origin.x as f64 + num(&anchor, "x") * scale;
    let ay = origin.y as f64 + num(&anchor, "y") * scale;
    let aw = num(&anchor, "w") * scale;
    let ah = num(&anchor, "h") * scale;
    let at_point = payload.get("mode").and_then(|v| v.as_str()) == Some("point");
    let align_right = payload.get("align").and_then(|v| v.as_str()) == Some("right");

    let monitor = monitor_at(&app, &main, ax, ay);
    let ms = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(scale);
    let pw = (width * ms).ceil();
    let ph = (height * ms).ceil();
    let gap = (2.0 * ms).round();

    let (left, top, right, bottom) = match &monitor {
        Some(m) => {
            let wa = m.work_area();
            let l = wa.position.x as f64;
            let t = wa.position.y as f64;
            (l, t, l + wa.size.width as f64, t + wa.size.height as f64)
        }
        None => (f64::MIN / 4.0, f64::MIN / 4.0, f64::MAX / 4.0, f64::MAX / 4.0),
    };

    let mut x = if at_point { ax } else if align_right { ax + aw - pw } else { ax };
    let mut y = if at_point { ay } else { ay + ah + gap };
    if x + pw > right {
        x = if at_point { ax - pw } else { right - pw };
    }
    if x < left {
        x = left;
    }
    if y + ph > bottom {
        y = if at_point { ay - ph } else { ay - ph - gap };
    }
    if y + ph > bottom {
        y = bottom - ph;
    }
    if y < top {
        y = top;
    }

    let _ = window.set_size(PhysicalSize::new(pw as u32, ph as u32));
    let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    if let Ok(mut st) = STATE.lock() {
        st.shown_at = Some(Instant::now());
    }
    let _ = window.show();
    let _ = window.set_focus();
    true
}

/// Re-fill the open popup (e.g. after removing a recent-file entry).
#[tauri::command]
pub fn popup_update(app: AppHandle, payload: Value) -> bool {
    {
        let Ok(mut st) = STATE.lock() else { return false };
        if !st.open || token_of(&st.payload) != token_of(&payload) {
            return false;
        }
        st.payload = payload.clone();
    }
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.emit("popup:payload", payload);
    }
    true
}

#[tauri::command]
pub fn popup_choose(app: AppHandle, token: Value, id: Value, keep_open: Option<bool>) -> bool {
    let current = STATE.lock().map(|st| token_of(&st.payload)).unwrap_or(Value::Null);
    if current != token {
        return false;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("popup:result", json!({ "token": token, "id": id }));
    }
    if !keep_open.unwrap_or(false) {
        hide(&app);
    }
    true
}

#[tauri::command]
pub fn popup_hide(app: AppHandle) -> bool {
    hide(&app);
    true
}
