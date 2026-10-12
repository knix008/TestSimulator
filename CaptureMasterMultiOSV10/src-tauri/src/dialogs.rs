use crate::capture;
use crate::state::{AppState, DialogSlot};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

struct Spec {
    width: f64,
    height: f64,
    min_w: f64,
    min_h: f64,
    resizable: bool,
    always_on_top: bool,
    skip_taskbar: bool,
    detached: bool,
    overlay: bool,
    top_right: bool,
}

fn base_name(name: &str) -> &str {
    name.split('#').next().unwrap_or(name)
}

fn spec_for(name: &str) -> Spec {
    match base_name(name) {
        // Fixed size; these dialogs measure their content and set the size themselves.
        "settings" => Spec { width: 920.0, height: 700.0, min_w: 320.0, min_h: 240.0, resizable: false, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
        "about" => Spec { width: 600.0, height: 560.0, min_w: 320.0, min_h: 240.0, resizable: false, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
        "error" => Spec { width: 660.0, height: 460.0, min_w: 420.0, min_h: 300.0, resizable: true, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
        "progress" => Spec { width: 480.0, height: 190.0, min_w: 480.0, min_h: 190.0, resizable: false, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
        "confirm" => Spec { width: 520.0, height: 230.0, min_w: 520.0, min_h: 230.0, resizable: false, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
        "prompt" => Spec { width: 560.0, height: 230.0, min_w: 560.0, min_h: 230.0, resizable: false, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
        "print" => Spec { width: 1000.0, height: 700.0, min_w: 860.0, min_h: 600.0, resizable: true, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
        "sources" => Spec { width: 920.0, height: 660.0, min_w: 600.0, min_h: 420.0, resizable: true, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
        "recorder" => Spec { width: 320.0, height: 130.0, min_w: 320.0, min_h: 130.0, resizable: false, always_on_top: true, skip_taskbar: true, detached: true, overlay: false, top_right: true },
        "region" => Spec { width: 800.0, height: 600.0, min_w: 200.0, min_h: 200.0, resizable: false, always_on_top: true, skip_taskbar: true, detached: true, overlay: true, top_right: false },
        _ => Spec { width: 640.0, height: 520.0, min_w: 320.0, min_h: 200.0, resizable: true, always_on_top: false, skip_taskbar: false, detached: false, overlay: false, top_right: false },
    }
}

fn label_for(name: &str) -> String {
    let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    format!("dlg-{safe}")
}

pub(crate) fn dialog_url(app: &AppHandle, name: &str) -> WebviewUrl {
    if cfg!(debug_assertions) {
        if let Some(dev) = app.config().build.dev_url.clone() {
            let mut url = dev;
            url.query_pairs_mut().append_pair("dialog", name);
            return WebviewUrl::External(url);
        }
    }
    WebviewUrl::App(format!("index.html?dialog={}", urlencoding::encode(name)).into())
}

fn bg_of(payload: &Value) -> String {
    payload.get("appearance").and_then(|a| a.get("bg")).and_then(|v| v.as_str()).unwrap_or("#12161c").to_string()
}

pub(crate) fn parse_color(hex: &str) -> tauri::window::Color {
    let h = hex.trim().trim_start_matches('#');
    let n = u32::from_str_radix(h, 16).unwrap_or(0x12161c);
    tauri::window::Color(((n >> 16) & 255) as u8, ((n >> 8) & 255) as u8, (n & 255) as u8, 255)
}

pub fn open_dialog(app: &AppHandle, name: String, payload: Value) -> Result<bool, String> {
    let state = app.state::<AppState>();
    let label = label_for(&name);
    {
        let map = state.dialogs.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&name) {
            drop(map);
            if let Some(win) = app.get_webview_window(&label) {
                if let Ok(mut map) = state.dialogs.lock() {
                    if let Some(slot) = map.get_mut(&name) {
                        slot.payload = payload.clone();
                        slot.submitted = false;
                    }
                }
                let _ = win.emit("dialog:payload", payload);
                let _ = win.show();
                let _ = win.set_focus();
                return Ok(true);
            }
        }
    }

    let spec = spec_for(&name);
    let script = format!(
        "window.__CM_DIALOG__ = {};",
        serde_json::to_string(&name).unwrap_or_else(|_| "null".into())
    );
    let mut builder = WebviewWindowBuilder::new(app, &label, dialog_url(app, &name))
        .title(payload.get("title").and_then(|v| v.as_str()).unwrap_or("CaptureMaster"))
        .inner_size(spec.width, spec.height)
        .min_inner_size(spec.min_w, spec.min_h)
        .decorations(false)
        .resizable(spec.resizable)
        .visible(false)
        .always_on_top(spec.always_on_top)
        .skip_taskbar(spec.skip_taskbar)
        .shadow(!spec.overlay)
        .background_color(parse_color(&bg_of(&payload)))
        .initialization_script(&script);

    if !spec.detached && !spec.overlay {
        if let Some(parent) = app.get_webview_window("main") {
            builder = builder.parent(&parent).map_err(|e| e.to_string())?;
            if let (Ok(pos), Ok(size)) = (parent.outer_position(), parent.outer_size()) {
                let scale = parent.scale_factor().unwrap_or(1.0).max(1.0);
                let x = pos.x as f64 / scale + (size.width as f64 / scale - spec.width) / 2.0;
                let y = pos.y as f64 / scale + (size.height as f64 / scale - spec.height) / 2.0;
                builder = builder.position(x, y);
            }
        }
    }

    let win = builder.build().map_err(|e| e.to_string())?;
    // The builder flag alone leaves frameless windows resizable on Windows.
    if !spec.resizable {
        let _ = win.set_resizable(false);
        let _ = win.set_maximizable(false);
    }
    if spec.overlay || spec.top_right {
        let display_id = payload.get("displayId").and_then(|v| v.as_str());
        if let Some((x, y, w, h)) = capture::monitor_bounds(display_id) {
            if spec.overlay {
                let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
                let _ = win.set_size(tauri::PhysicalSize::new(w, h));
            } else {
                let scale = win.scale_factor().unwrap_or(1.0).max(1.0);
                let left = x as f64 / scale + w as f64 / scale - spec.width - 24.0;
                let top = y as f64 / scale + 24.0;
                let _ = win.set_position(tauri::LogicalPosition::new(left, top));
            }
        }
    }

    if let Ok(mut map) = state.dialogs.lock() {
        map.insert(name.clone(), DialogSlot { name, label, payload, submitted: false });
    }
    Ok(true)
}

pub fn finish_dialog(app: &AppHandle, label: &str) {
    let state = app.state::<AppState>();
    let quitting = state.quitting.load(std::sync::atomic::Ordering::SeqCst);
    let slot = {
        let mut map = match state.dialogs.lock() {
            Ok(m) => m,
            Err(_) => return,
        };
        let key = map.iter().find(|(_, slot)| slot.label == label).map(|(k, _)| k.clone());
        key.and_then(|k| map.remove(&k))
    };
    let Some(slot) = slot else { return };
    if quitting {
        return;
    }
    if let Some(main) = app.get_webview_window("main") {
        if !slot.submitted {
            let _ = main.emit("dialog:result", json!({ "name": slot.name, "data": Value::Null }));
        }
        let _ = main.emit("dialog:closed", json!({ "name": slot.name }));
    }
}
