//! Dropdown lists as their own borderless window, so a list can reach past the edges of the
//! main window (a list drawn inside the page is clipped to it).
//!
//! Flow: the page calls `menu_open` with the list and the button's rectangle → the popup page
//! (src/menu.html) renders it and reports its size with `menu_ready` → it is placed under the
//! button (above it when there is no room below), shown and focused. Picking an item
//! (`menu_pick`), Esc (`menu_close`) or clicking elsewhere (focus lost) hides it again and tells
//! the main page which list it was (`menu-picked` / `menu-closed`).

use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub const LABEL: &str = "menu";
const MAX_HEIGHT: f64 = 440.0;

/// The button the list belongs to, in the main window's logical (CSS) pixels.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Anchor {
  pub id: String,
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

#[derive(Default)]
pub struct MenuState {
  anchor: Mutex<Option<Anchor>>,
  closed: Mutex<Option<(String, Instant)>>,
}

/// Creates the (hidden) popup window once, next to the main window.
pub fn create(app: &AppHandle, browser_args: Option<&str>) -> tauri::Result<WebviewWindow> {
  let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("menu.html".into()))
    .title("QR Generator menu")
    .decorations(false)
    .shadow(true)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .focused(false)
    .visible(false)
    .inner_size(200.0, 100.0);
  #[cfg(windows)]
  let builder = match browser_args {
    Some(args) => builder.additional_browser_args(args),
    None => builder,
  };
  #[cfg(not(windows))]
  let _ = browser_args;
  let builder = match crate::webview_dir() {
    Some(dir) => builder.data_directory(dir),
    None => builder,
  };
  let menu = builder.build()?;
  let handle = app.clone();
  menu.on_window_event(move |event| {
    if let WindowEvent::Focused(false) = event {
      close(&handle);
    }
  });
  Ok(menu)
}

fn close(app: &AppHandle) {
  let Some(menu) = app.get_webview_window(LABEL) else { return };
  if !menu.is_visible().unwrap_or(false) {
    return;
  }
  let _ = menu.hide();
  let state = app.state::<MenuState>();
  let id = state.anchor.lock().unwrap().take().map(|a| a.id).unwrap_or_default();
  *state.closed.lock().unwrap() = Some((id.clone(), Instant::now()));
  let _ = app.emit_to("main", "menu-closed", json!({ "id": id }));
}

/// Opens the list for `anchor`. Returns false when that same list was closed a moment ago by
/// the click on its own button (that click means "close", not "open again").
#[tauri::command]
pub fn menu_open(app: AppHandle, anchor: Anchor, list: Value) -> bool {
  let state = app.state::<MenuState>();
  if let Some((id, at)) = state.closed.lock().unwrap().as_ref() {
    if *id == anchor.id && at.elapsed() < Duration::from_millis(250) {
      return false;
    }
  }
  *state.anchor.lock().unwrap() = Some(anchor);
  app.emit_to(LABEL, "menu-show", list).is_ok()
}

/// The popup page has drawn the list at `width`×`height` (logical px): place and show it.
#[tauri::command]
pub fn menu_ready(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
  let (Some(main), Some(menu)) = (app.get_webview_window("main"), app.get_webview_window(LABEL)) else {
    return Err("windows missing".into());
  };
  let Some(anchor) = app.state::<MenuState>().anchor.lock().unwrap().clone() else { return Ok(()) };
  let scale = main.scale_factor().map_err(|e| e.to_string())?;
  let origin = main.inner_position().map_err(|e| e.to_string())?;
  let w = width.max(anchor.width).ceil();
  let h = height.min(MAX_HEIGHT).ceil();

  let mut x = origin.x as f64 + anchor.x * scale;
  let below = origin.y as f64 + (anchor.y + anchor.height + 4.0) * scale;
  let above = origin.y as f64 + (anchor.y - 4.0 - h) * scale;
  let mut y = below;
  if let Ok(Some(monitor)) = main.current_monitor() {
    let area = monitor.work_area();
    let (left, top) = (area.position.x as f64, area.position.y as f64);
    let (right, bottom) = (left + area.size.width as f64, top + area.size.height as f64);
    if below + h * scale > bottom && above >= top {
      y = above;
    }
    x = x.min(right - w * scale).max(left);
    y = y.min(bottom - h * scale).max(top);
  }
  menu.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
  menu.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32)).map_err(|e| e.to_string())?;
  menu.show().map_err(|e| e.to_string())?;
  menu.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn menu_pick(app: AppHandle, value: String) {
  let id = app.state::<MenuState>().anchor.lock().unwrap().as_ref().map(|a| a.id.clone()).unwrap_or_default();
  let _ = app.emit_to("main", "menu-picked", json!({ "id": id, "value": value }));
  close(&app);
}

#[tauri::command]
pub fn menu_close(app: AppHandle) {
  close(&app);
}
