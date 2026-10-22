// image-viewer-ui.json in the user data folder: the last opened folder and the window's
// place. Written at once (read / modify / write, so one setting never drops another).

use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const WINDOW_MIN_W: f64 = 1200.0;
const WINDOW_MIN_H: f64 = 600.0;

static LAST_OPEN_DIR: Mutex<Option<String>> = Mutex::new(None);

fn config_path() -> PathBuf {
    super::user_data_dir().join("image-viewer-ui.json")
}

fn read() -> Map<String, Value> {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn write(cfg: &Map<String, Value>) {
    let path = config_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, Value::Object(cfg.clone()).to_string());
}

pub fn load() {
    let cfg = read();
    if let Some(dir) = cfg.get("lastOpenDir").and_then(Value::as_str) {
        if Path::new(dir).exists() {
            *LAST_OPEN_DIR.lock().unwrap() = Some(dir.to_string());
        }
    }
}

pub fn last_open_dir() -> Option<String> {
    LAST_OPEN_DIR.lock().unwrap().clone()
}

/// A folder (or the folder of a file) the user opened; None forgets it.
pub fn save_last_open_dir(dir: Option<&str>) {
    let mut cfg = read();
    match dir.filter(|d| !d.is_empty()) {
        None => {
            *LAST_OPEN_DIR.lock().unwrap() = None;
            cfg.remove("lastOpenDir");
        }
        Some(d) => {
            let resolved = if Path::new(d).is_dir() { d.to_string() } else { super::node_dirname(d) };
            if resolved.is_empty() || !Path::new(&resolved).exists() {
                return;
            }
            *LAST_OPEN_DIR.lock().unwrap() = Some(resolved.clone());
            cfg.insert("lastOpenDir".into(), json!(resolved));
        }
    }
    write(&cfg);
}

/// Where dialogs start: the last folder, or the home folder (fresh install / data deleted).
pub fn dialog_default_path() -> String {
    last_open_dir()
        .filter(|d| Path::new(d).exists())
        .unwrap_or_else(|| super::home_dir().to_string_lossy().into_owned())
}

pub fn window_remember(bounds: &Value) -> Value {
    let num = |k: &str| bounds.get(k).and_then(Value::as_f64).filter(|v| v.is_finite());
    let (Some(width), Some(height)) = (num("width"), num("height")) else {
        return Value::Null;
    };
    let mut state = json!({
        "width": width.round(),
        "height": height.round(),
        "maximized": bounds.get("maximized").and_then(Value::as_bool).unwrap_or(false),
    });
    if let (Some(x), Some(y)) = (num("x"), num("y")) {
        state["x"] = json!(x.round());
        state["y"] = json!(y.round());
    }
    let mut cfg = read();
    cfg.insert("window".into(), state.clone());
    write(&cfg);
    state
}

/// Where the window was last time: size, position and whether it was maximised. A position
/// off every monitor (one that is gone, a stale place) is dropped, so the window can never
/// come back somewhere the user cannot reach it.
pub fn window_recall() -> Value {
    let cfg = read();
    let Some(w) = cfg.get("window") else {
        return Value::Null;
    };
    let num = |k: &str| w.get(k).and_then(Value::as_f64).filter(|v| v.is_finite());
    let (Some(sw), Some(sh)) = (num("width"), num("height")) else {
        return Value::Null;
    };
    let width = sw.round().max(WINDOW_MIN_W);
    let height = sh.round().max(WINDOW_MIN_H);
    let maximized = w.get("maximized").and_then(Value::as_bool).unwrap_or(false);
    let plain = json!({ "width": width, "height": height, "maximized": maximized });
    let (Some(x), Some(y)) = (num("x"), num("y")) else {
        return plain;
    };
    let areas = work_areas();
    let visible = areas.is_empty()
        || areas.iter().any(|&(ax, ay, aw, ah)| {
            x < ax + aw - 48.0 && x + width > ax + 48.0 && y < ay + ah - 48.0 && y + height > ay
        });
    if !visible {
        return plain;
    }
    json!({ "x": x.round(), "y": y.round(), "width": width, "height": height, "maximized": maximized })
}

/// Monitor work areas in logical px (the unit the page saves bounds in).
fn work_areas() -> Vec<(f64, f64, f64, f64)> {
    let Some(app) = super::app() else {
        return Vec::new();
    };
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let s = m.scale_factor();
            let a = m.work_area();
            (
                f64::from(a.position.x) / s,
                f64::from(a.position.y) / s,
                f64::from(a.size.width) / s,
                f64::from(a.size.height) / s,
            )
        })
        .collect()
}
