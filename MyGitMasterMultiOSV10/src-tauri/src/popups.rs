// Menus and dialogs as real OS windows.
//
// Two requirements are met by one mechanism. A menu has to be able to spill past the
// app window — a File menu with ten recent files is taller than a small window — and
// every dialog has to be independent of the main window, fixed size and scroll-free,
// yet go away when the app does.
//
// Both are their own window loading the same bundle on a hash route (`#menu=` /
// `#dialog=`). The routes carry no name: creating a window is cheap but starting a
// webview behind it is not, so dialogs are pooled, handed an identity by event, and
// hidden rather than destroyed when dismissed. Sizes come from the renderer
// (src/dialogSpecs.ts) with each opening.
use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MENU: &str = "menu";
const DIALOG_PREFIX: &str = "dlg-";
const SPARE_TARGET: usize = 2;
const SPARE_LIMIT: usize = 3;

#[derive(Clone, Copy, Deserialize, Default)]
pub struct Spec {
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub fixed: bool,
    #[serde(default)]
    pub resizable: bool,
    /// The smallest a resizable dialog may be dragged to (0: the pool's default).
    #[serde(default, rename = "minWidth")]
    pub min_width: f64,
    #[serde(default, rename = "minHeight")]
    pub min_height: f64,
    /// Shown without taking the focus (the progress popup must not steal the keyboard).
    #[serde(default, rename = "noFocus")]
    pub no_focus: bool,
}

#[derive(Default)]
struct DialogWin {
    name: Option<String>,
    message: Value,
    owner: String,
    spec: Spec,
    loaded: bool,
    show_when_loaded: bool,
}

#[derive(Default)]
struct Inner {
    base: String,
    background: String,
    menu_message: Option<Value>,
    menu_opener: String,
    menu_loaded: bool,
    /// When the menu was last shown. Windows may take the focus straight back from a
    /// window that was just shown (it does so whenever the app is not the foreground
    /// one); a blur that early is not the user clicking elsewhere.
    menu_shown: Option<std::time::Instant>,
    /// Dialog name → window label. One window per name: a button cannot open two.
    by_name: HashMap<String, String>,
    windows: HashMap<String, DialogWin>,
    spares: Vec<String>,
    sequence: u64,
    counter: u64,
    shutting_down: bool,
}

#[derive(Default)]
pub struct Popups {
    inner: Mutex<Inner>,
}

impl Popups {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set_base(&self, base: &str) {
        self.lock().base = base.trim_end_matches('/').to_string();
    }

    pub fn set_background(&self, colour: &str) {
        self.lock().background = colour.to_string();
    }

    pub fn shutting_down(&self) -> bool {
        self.lock().shutting_down
    }
}

fn popups(app: &AppHandle) -> &Popups {
    app.state::<Popups>().inner()
}

fn route(app: &AppHandle, hash: &str) -> Option<WebviewUrl> {
    let base = popups(app).lock().base.clone();
    tauri::Url::parse(&format!("{base}/#{hash}")).ok().map(WebviewUrl::External)
}

pub fn colour(hex: &str) -> Option<tauri::window::Color> {
    let hex = hex.trim().strip_prefix('#')?;
    if hex.len() != 6 && hex.len() != 8 {
        return None;
    }
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    let alpha = if hex.len() == 8 { byte(6)? } else { 255 };
    Some(tauri::window::Color(byte(0)?, byte(2)?, byte(4)?, alpha))
}

/* ------------------------------------------------------------- geometry */

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// The work area (logical pixels) of the monitor under a logical point.
fn work_area_at(window: &WebviewWindow, x: f64, y: f64) -> Rect {
    let monitors = window.available_monitors().unwrap_or_default();
    for monitor in &monitors {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let rect = Rect {
            x: area.position.x as f64 / scale,
            y: area.position.y as f64 / scale,
            width: area.size.width as f64 / scale,
            height: area.size.height as f64 / scale,
        };
        let full = Rect {
            x: monitor.position().x as f64 / scale,
            y: monitor.position().y as f64 / scale,
            width: monitor.size().width as f64 / scale,
            height: monitor.size().height as f64 / scale,
        };
        if x >= full.x && x < full.x + full.width && y >= full.y && y < full.y + full.height {
            return rect;
        }
    }
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        return Rect {
            x: area.position.x as f64 / scale,
            y: area.position.y as f64 / scale,
            width: area.size.width as f64 / scale,
            height: area.size.height as f64 / scale,
        };
    }
    Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1080.0 }
}

/// A window's position and its INNER size, in logical pixels: the same size
/// `set_size` sets. Mixing in the outer size (which on Windows includes the invisible
/// resize border and shadow) made a content-fitted dialog grow on every refit.
pub fn bounds(window: &WebviewWindow) -> Option<Rect> {
    let scale = window.scale_factor().ok()?;
    let pos = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(Rect { x: pos.x, y: pos.y, width: size.width, height: size.height })
}

fn set_bounds(window: &WebviewWindow, rect: Rect) {
    let _ = window.set_size(LogicalSize::new(rect.width, rect.height));
    let _ = window.set_position(LogicalPosition::new(rect.x, rect.y));
}

/// Where a menu of `width` × `height` goes for an anchor (screen coordinates of the
/// trigger's bottom-left, plus its height): below it, kept on the display, flipped
/// above it when it would run off the bottom. It may overhang the app window.
pub fn place_menu(anchor: Rect, width: f64, height: f64, area: Rect) -> Rect {
    let mut x = anchor.x.round();
    let mut y = anchor.y.round();
    if x + width > area.x + area.width {
        x = area.x + area.width - width;
    }
    if x < area.x {
        x = area.x;
    }
    if y + height > area.y + area.height {
        let above = (anchor.y - anchor.height - height).round();
        y = if above >= area.y { above } else { area.y.max(area.y + area.height - height) };
    }
    Rect { x, y, width, height }
}

/// A dialog grown or shrunk around its middle, kept inside the work area.
pub fn refit(current: Rect, width: f64, height: f64, area: Rect) -> Rect {
    let mut x = (current.x + (current.width - width) / 2.0).round();
    let mut y = (current.y + (current.height - height) / 2.0).round();
    x = x.max(area.x).min(area.x + area.width - width);
    y = y.max(area.y).min(area.y + area.height - height);
    Rect { x, y, width, height }
}

/* ------------------------------------------------------------------ menus */

fn ensure_menu(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(win) = app.get_webview_window(MENU) {
        return Some(win);
    }
    let url = route(app, "menu=")?;
    let handle = app.clone();
    WebviewWindowBuilder::new(app, MENU, url)
        .title("Menu")
        .inner_size(260.0, 80.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .on_page_load(move |_, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                popups(&handle).lock().menu_loaded = true;
            }
        })
        .build()
        .ok()
}

/// Focus changes of the menu window: a blur after real focus dismisses it.
pub fn menu_focus_changed(app: &AppHandle, focused: bool) {
    let dismiss = !focused && {
        let inner = popups(app).lock();
        inner.menu_message.is_some()
            && inner.menu_shown.is_some_and(|shown| shown.elapsed() > std::time::Duration::from_millis(300))
    };
    if dismiss {
        hide_menu(app);
    }
}

/// Hides the menu (Escape, a click elsewhere, the opener closing it) and tells the
/// window that opened it that nothing was chosen, so its pending openMenu resolves with
/// null and its button stops looking open.
pub fn hide_menu(app: &AppHandle) {
    if let Some((opener, open_id)) = take_menu(app) {
        let _ = app.emit_to(opener.as_str(), "menu:chosen", json!({ "openId": open_id, "id": Value::Null }));
    }
}

/// Clears and hides the current menu; the opener and openId it had, if any.
fn take_menu(app: &AppHandle) -> Option<(String, u64)> {
    let taken = {
        let mut inner = popups(app).lock();
        let open_id = inner.menu_message.as_ref().and_then(|m| m["openId"].as_u64());
        let opener = std::mem::take(&mut inner.menu_opener);
        inner.menu_message = None;
        inner.menu_shown = None;
        open_id.map(|id| (if opener.is_empty() { "main".to_string() } else { opener }, id))
    };
    if let Some(win) = app.get_webview_window(MENU) {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        }
        let _ = app.emit_to(MENU, "menu:payload", Value::Null);
    }
    taken
}

/// The openId of the menu being shown (0 when none).
fn current_menu_id(app: &AppHandle) -> u64 {
    popups(app).lock().menu_message.as_ref().and_then(|m| m["openId"].as_u64()).unwrap_or(0)
}

#[tauri::command]
pub async fn menu_open(app: AppHandle, window: WebviewWindow, payload: Value, anchor: Value) -> Result<u64, String> {
    let Some(menu) = ensure_menu(&app) else { return Ok(0) };
    // A menu still open is replaced: its opener hears "nothing chosen" for it.
    if current_menu_id(&app) != 0 {
        hide_menu(&app);
    } else if menu.is_visible().unwrap_or(false) {
        let _ = menu.hide();
    }
    let (message, open_id) = {
        let mut inner = popups(&app).lock();
        inner.sequence += 1;
        let mut message = payload;
        if let Value::Object(map) = &mut message {
            map.insert("anchor".into(), anchor);
            map.insert("openId".into(), json!(inner.sequence));
        }
        inner.menu_message = Some(message.clone());
        inner.menu_opener = window.label().to_string();
        (message, inner.sequence)
    };
    let _ = app.emit_to(MENU, "menu:payload", message);
    Ok(open_id)
}

/// Closes the menu `open_id` (0: whatever menu is open). A close for a menu that has
/// already been replaced does nothing — it would otherwise empty the new one.
#[tauri::command]
pub async fn menu_close(app: AppHandle, open_id: Option<u64>) {
    let current = current_menu_id(&app);
    if current != 0 && open_id.map_or(true, |id| id == 0 || id == current) {
        hide_menu(&app);
    }
}

#[tauri::command]
pub async fn menu_payload(app: AppHandle) -> Value {
    popups(&app).lock().menu_message.clone().unwrap_or(Value::Null)
}

/// Fits the popup to its content and shows it; a dismissed menu stays hidden.
#[tauri::command]
pub async fn menu_size(app: AppHandle, width: f64, height: f64, open_id: Option<u64>) {
    let Some(menu) = app.get_webview_window(MENU) else { return };
    let Some(message) = popups(&app).lock().menu_message.clone() else { return };
    // Only the menu currently asked for is shown: a size measured for an older payload
    // would show the window with stale (or no) rows.
    if open_id.is_some_and(|id| Some(id) != message["openId"].as_u64()) {
        return;
    }
    let num = |key: &str| message["anchor"][key].as_f64().unwrap_or(0.0);
    let anchor = Rect { x: num("x"), y: num("y"), width: num("width"), height: num("height") };
    let width = width.ceil().max(180.0);
    let height = height.ceil().max(36.0);
    let area = work_area_at(&menu, anchor.x, anchor.y);
    set_bounds(&menu, place_menu(anchor, width, height, area));
    if !menu.is_visible().unwrap_or(false) {
        popups(&app).lock().menu_shown = Some(std::time::Instant::now());
        let _ = menu.show();
        let _ = menu.set_focus();
    }
}

#[tauri::command]
pub async fn menu_choose(app: AppHandle, command_id: String) {
    let Some((target, open_id)) = take_menu(&app) else { return };
    let _ = app.emit_to(target.as_str(), "menu:chosen", json!({ "openId": open_id, "id": command_id }));
    if let Some(win) = app.get_webview_window(&target) {
        let _ = win.set_focus();
    }
}

/* ---------------------------------------------------------------- dialogs */

fn create_dialog(app: &AppHandle) -> Option<String> {
    let url = route(app, "dialog=")?;
    let (label, background) = {
        let mut inner = popups(app).lock();
        inner.counter += 1;
        (format!("{DIALOG_PREFIX}{}", inner.counter), inner.background.clone())
    };
    popups(app).lock().windows.insert(label.clone(), DialogWin { message: Value::Null, ..Default::default() });
    let handle = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, &label, url)
        .title("My Git Master")
        .inner_size(520.0, 360.0)
        .min_inner_size(320.0, 120.0)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .minimizable(false)
        .maximizable(false)
        .skip_taskbar(true)
        .visible(false)
        .on_page_load(move |win, payload| {
            if !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                return;
            }
            let reveal = {
                let state = popups(&handle);
                let mut inner = state.lock();
                match inner.windows.get_mut(win.label()) {
                    Some(entry) => {
                        entry.loaded = true;
                        let show = std::mem::take(&mut entry.show_when_loaded) && entry.name.is_some();
                        show.then_some(entry.spec.no_focus)
                    }
                    None => None,
                }
            };
            if let Some(no_focus) = reveal {
                let _ = win.show();
                if !no_focus {
                    let _ = win.set_focus();
                }
            }
        });
    if let Some(colour) = colour(&background) {
        builder = builder.background_color(colour);
    }
    // Owned by the main window: it stays above it and goes away with it, while
    // remaining freely movable anywhere on the desktop.
    if let Some(main) = app.get_webview_window("main") {
        builder = match builder.parent(&main) {
            Ok(owned) => owned,
            Err(_) => return None,
        };
    }
    match builder.build() {
        Ok(_) => Some(label),
        Err(_) => {
            popups(app).lock().windows.remove(&label);
            None
        }
    }
}

fn take_spare(app: &AppHandle) -> Option<String> {
    loop {
        let label = popups(app).lock().spares.pop();
        match label {
            Some(label) if app.get_webview_window(&label).is_some() => return Some(label),
            Some(_) => continue,
            None => return create_dialog(app),
        }
    }
}

/// Keeps a couple of loaded, hidden dialog windows ready, so opening one is instant.
pub fn warm(app: &AppHandle) {
    let _ = ensure_menu(app);
    loop {
        {
            let inner = popups(app).lock();
            if inner.shutting_down || inner.base.is_empty() || inner.spares.len() >= SPARE_TARGET {
                return;
            }
        }
        match create_dialog(app) {
            Some(label) => popups(app).lock().spares.push(label),
            None => return,
        }
    }
}

fn warm_later(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        warm(&handle);
    });
}

#[tauri::command]
pub async fn dialog_open(app: AppHandle, window: WebviewWindow, name: String, payload: Value, spec: Spec) -> Result<bool, String> {
    let message = {
        let mut inner = popups(&app).lock();
        inner.sequence += 1;
        json!({ "name": name, "payload": payload, "openId": inner.sequence })
    };

    let existing = popups(&app).lock().by_name.get(&name).cloned();
    if let Some(label) = existing {
        if let Some(win) = app.get_webview_window(&label) {
            if let Some(entry) = popups(&app).lock().windows.get_mut(&label) {
                entry.message = message.clone();
            }
            let _ = app.emit_to(label.as_str(), "dialog:payload", message);
            let _ = win.unminimize();
            let _ = win.show();
            let _ = win.set_focus();
            return Ok(true);
        }
    }

    let Some(label) = take_spare(&app) else { return Ok(false) };
    let Some(win) = app.get_webview_window(&label) else { return Ok(false) };
    let loaded = {
        let mut inner = popups(&app).lock();
        inner.by_name.insert(name.clone(), label.clone());
        let entry = inner.windows.entry(label.clone()).or_default();
        entry.name = Some(name.clone());
        entry.message = message.clone();
        entry.owner = window.label().to_string();
        entry.spec = spec;
        entry.show_when_loaded = !entry.loaded;
        entry.loaded
    };

    // Centred over the window that asked.
    let _ = win.set_resizable(true);
    let mut rect = Rect { x: 0.0, y: 0.0, width: spec.width.max(320.0), height: spec.height.max(120.0) };
    if let Some(parent) = bounds(&window) {
        rect.x = (parent.x + (parent.width - rect.width) / 2.0).round();
        rect.y = (parent.y + (parent.height - rect.height) / 2.0).round();
        let area = work_area_at(&window, parent.x + parent.width / 2.0, parent.y + parent.height / 2.0);
        rect = refit(rect, rect.width.min(area.width), rect.height.min(area.height), area);
    }
    set_bounds(&win, rect);
    let _ = win.set_min_size(Some(LogicalSize::new(spec.min_width.max(320.0), spec.min_height.max(120.0))));
    let _ = win.set_resizable(spec.resizable);
    if let Some(colour) = payload.get("background").and_then(Value::as_str).and_then(colour) {
        let _ = win.set_background_color(Some(colour));
    }
    let _ = app.emit_to(label.as_str(), "dialog:payload", message);
    if loaded {
        let _ = win.show();
        if !spec.no_focus {
            let _ = win.set_focus();
        }
    }
    warm_later(&app);
    Ok(true)
}

/// A new payload for an open dialog (the progress popup's latest line): no show, no
/// focus, same `openId`, so the dialog keeps its state. False when it is not open.
#[tauri::command]
pub async fn dialog_update(app: AppHandle, name: String, payload: Value) -> bool {
    let target = {
        let mut inner = popups(&app).lock();
        let Some(label) = inner.by_name.get(&name).cloned() else { return false };
        let Some(entry) = inner.windows.get_mut(&label) else { return false };
        let open_id = entry.message["openId"].clone();
        entry.message = json!({ "name": name, "payload": payload, "openId": open_id });
        (label, entry.message.clone())
    };
    let _ = app.emit_to(target.0.as_str(), "dialog:payload", target.1);
    true
}

#[tauri::command]
pub async fn dialog_payload(app: AppHandle, window: WebviewWindow) -> Value {
    popups(&app).lock().windows.get(window.label()).map(|entry| entry.message.clone()).unwrap_or(Value::Null)
}

#[tauri::command]
pub async fn dialog_result(app: AppHandle, window: WebviewWindow, name: String, result: Value) {
    let owner = popups(&app).lock().windows.get(window.label()).map(|entry| entry.owner.clone()).unwrap_or_default();
    let target = if owner.is_empty() { "main".to_string() } else { owner };
    let _ = app.emit_to(target.as_str(), "dialog:result", json!({ "name": name, "result": result }));
}

#[tauri::command]
pub async fn dialog_close(app: AppHandle, window: WebviewWindow, name: Option<String>) {
    match name {
        Some(name) => {
            let label = popups(&app).lock().by_name.get(&name).cloned();
            if let Some(label) = label {
                recycle(&app, &label);
            }
        }
        None => recycle(&app, window.label()),
    }
}

#[tauri::command]
pub async fn dialog_close_all(app: AppHandle) {
    let labels: Vec<String> = popups(&app).lock().by_name.values().cloned().collect();
    for label in labels {
        recycle(&app, &label);
    }
}

/// Fits a dialog to the height its content needs; a `fixed` one keeps its size.
#[tauri::command]
pub async fn dialog_size(app: AppHandle, window: WebviewWindow, width: f64, height: f64) {
    let spec = match popups(&app).lock().windows.get(window.label()) {
        Some(entry) if entry.name.is_some() => entry.spec,
        _ => return,
    };
    if spec.fixed {
        return;
    }
    let Some(current) = bounds(&window) else { return };
    let area = work_area_at(&window, current.x + current.width / 2.0, current.y + current.height / 2.0);
    let width = if width > 0.0 { width.ceil().max(320.0).min(area.width - 40.0) } else { current.width };
    let height = height.ceil().max(120.0).min(area.height - 40.0);
    if (current.width - width).abs() < 2.0 && (current.height - height).abs() < 2.0 {
        return;
    }
    let resizable = window.is_resizable().unwrap_or(false);
    if !resizable {
        let _ = window.set_resizable(true);
    }
    set_bounds(&window, refit(current, width, height, area));
    if !resizable {
        let _ = window.set_resizable(false);
    }
}

/// Tells the owner the dialog went away without an answer.
fn release(app: &AppHandle, label: &str) {
    let (name, owner) = {
        let mut inner = popups(app).lock();
        let Some(entry) = inner.windows.get_mut(label) else { return };
        let name = entry.name.take();
        entry.message = Value::Null;
        entry.show_when_loaded = false;
        let owner = std::mem::take(&mut entry.owner);
        if let Some(name) = &name {
            if inner.by_name.get(name).map(String::as_str) == Some(label) {
                inner.by_name.remove(name);
            }
        }
        (name, owner)
    };
    if let Some(name) = name {
        let target = if owner.is_empty() { "main".to_string() } else { owner };
        let _ = app.emit_to(target.as_str(), "dialog:closed", name);
    }
}

/// Back to the pool: hidden, emptied, ready for the next dialog.
pub fn recycle(app: &AppHandle, label: &str) {
    let Some(win) = app.get_webview_window(label) else { return };
    release(app, label);
    let _ = win.hide();
    let _ = app.emit_to(label, "dialog:payload", json!({ "name": null, "payload": null, "openId": 0 }));
    let destroy = {
        let mut inner = popups(app).lock();
        if inner.shutting_down || inner.spares.len() >= SPARE_LIMIT {
            inner.windows.remove(label);
            true
        } else {
            inner.spares.push(label.to_string());
            false
        }
    };
    if destroy {
        let _ = win.destroy();
    }
}

/// The X button, Escape and Alt+F4 on a dialog: recycle instead of closing.
pub fn on_close_requested(app: &AppHandle, label: &str) -> bool {
    if popups(app).shutting_down() {
        return false;
    }
    if label == MENU {
        hide_menu(app);
        return true;
    }
    if label.starts_with(DIALOG_PREFIX) {
        let named = popups(app).lock().windows.get(label).is_some_and(|entry| entry.name.is_some());
        if named {
            recycle(app, label);
            return true;
        }
    }
    false
}

pub fn on_destroyed(app: &AppHandle, label: &str) {
    if !label.starts_with(DIALOG_PREFIX) {
        return;
    }
    release(app, label);
    let mut inner = popups(app).lock();
    inner.windows.remove(label);
    inner.spares.retain(|spare| spare != label);
}

/* ------------------------------------------------------------------ guide */

pub const GUIDE: &str = "guide";

/// The user's guide: a window of its own (`#guide`), in the taskbar, resizable, and
/// independent of the main window except that it closes with the app. Opening it again
/// brings the open one forward; `section` jumps to a heading id.
#[tauri::command]
pub async fn guide_open(app: AppHandle, window: WebviewWindow, section: Option<String>) -> Result<bool, String> {
    if let Some(win) = app.get_webview_window(GUIDE) {
        // Always sent, also without a section: an open is also when the guide goes back to
        // the main window's language.
        let _ = app.emit_to(GUIDE, "guide:section", section.unwrap_or_default());
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(true);
    }
    let hash = match section.filter(|s| !s.is_empty()) {
        Some(section) => format!("guide={section}"),
        None => "guide".to_string(),
    };
    let Some(url) = route(&app, &hash) else { return Ok(false) };
    let background = popups(&app).lock().background.clone();
    let (width, height) = (1000.0_f64, 720.0_f64);
    let mut builder = WebviewWindowBuilder::new(&app, GUIDE, url)
        .title("My Git Master — User's Guide")
        .inner_size(width, height)
        .min_inner_size(640.0, 420.0)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .visible(false);
    if let Some(parent) = bounds(&window) {
        let area = work_area_at(&window, parent.x + parent.width / 2.0, parent.y + parent.height / 2.0);
        let rect = refit(
            Rect { x: parent.x, y: parent.y, width: parent.width, height: parent.height },
            width.min(area.width),
            height.min(area.height),
            area,
        );
        builder = builder.position(rect.x, rect.y);
    } else {
        builder = builder.center();
    }
    if let Some(colour) = colour(&background) {
        builder = builder.background_color(colour);
    }
    let win = builder.build().map_err(|e| e.to_string())?;
    // Shown by the page once it has painted in the theme (window_ready); this is the
    // fallback if that never comes.
    let fallback = win.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(4));
        if !fallback.is_visible().unwrap_or(true) {
            let _ = fallback.show();
        }
    });
    Ok(true)
}

/// Really tears every popup down: the app is going away.
pub fn close_all(app: &AppHandle) {
    let labels: Vec<String> = {
        let mut inner = popups(app).lock();
        inner.shutting_down = true;
        inner.by_name.clear();
        inner.spares.clear();
        inner.windows.drain().map(|(label, _)| label).collect()
    };
    for label in labels.iter().map(String::as_str).chain([MENU, GUIDE]) {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.destroy();
        }
    }
}

/// A new theme colour, so a pooled window never flashes — or edges — in another one.
pub fn apply_background(app: &AppHandle, hex: &str) {
    popups(app).set_background(hex);
    let Some(colour) = colour(hex) else { return };
    let mut labels: Vec<String> = popups(app).lock().windows.keys().cloned().collect();
    labels.push(GUIDE.to_string());
    labels.extend(["tool-diff".to_string(), "tool-merge".to_string()]);
    for label in labels {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.set_background_color(Some(colour));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA: Rect = Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1040.0 };

    #[test]
    fn a_menu_opens_below_its_trigger() {
        let anchor = Rect { x: 100.0, y: 40.0, width: 60.0, height: 28.0 };
        assert_eq!(place_menu(anchor, 240.0, 300.0, AREA), Rect { x: 100.0, y: 40.0, width: 240.0, height: 300.0 });
    }

    #[test]
    fn a_menu_stays_on_the_display() {
        let anchor = Rect { x: 1800.0, y: 40.0, width: 60.0, height: 28.0 };
        assert_eq!(place_menu(anchor, 240.0, 300.0, AREA).x, 1680.0);
    }

    #[test]
    fn a_menu_flips_above_when_there_is_no_room_below() {
        let anchor = Rect { x: 100.0, y: 900.0, width: 60.0, height: 28.0 };
        assert_eq!(place_menu(anchor, 240.0, 300.0, AREA).y, 572.0);
    }

    #[test]
    fn a_tall_menu_is_pushed_up_to_fit() {
        let anchor = Rect { x: 100.0, y: 200.0, width: 60.0, height: 28.0 };
        assert_eq!(place_menu(anchor, 240.0, 1000.0, AREA).y, 40.0);
    }

    #[test]
    fn a_dialog_grows_around_its_middle() {
        let current = Rect { x: 500.0, y: 300.0, width: 400.0, height: 200.0 };
        assert_eq!(refit(current, 400.0, 300.0, AREA), Rect { x: 500.0, y: 250.0, width: 400.0, height: 300.0 });
    }

    #[test]
    fn theme_colours_parse() {
        assert!(colour("#1e1f22").is_some());
        assert!(colour("#00000000").is_some());
        assert!(colour("navy").is_none());
    }
}
