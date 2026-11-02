// ── Pop-out windows: Settings, About and the context menu ─────
//
// The page opens them with window.open("about:blank#dialog-<name>") or
// window.open("about:blank#menu") and renders into that document itself (a
// React portal: same origin, same renderer, same state), so the host only has
// to build the window: frameless, owned by the main window, hidden until the
// page has measured its content and asks for it to be placed and shown.
//
// Dialogs can then be moved anywhere, outside the program too, and the main
// window is disabled while one is open, as the in-page modal was. The menu
// window is shown without taking focus, natively; a click on it still hands
// its webview the focus, so the page keeps the menu open across that blur
// (ContextMenu.jsx).
use serde::Deserialize;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MENU: &str = "popout-menu";
const DIALOG_PREFIX: &str = "dialog-";

/// The window label for `about:blank#<fragment>`, or None for anything the
/// page is not allowed to open this way.
pub fn popout_label(fragment: Option<&str>) -> Option<String> {
  let f = fragment?;
  if f.is_empty() || f.len() > 48 || !f.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
    return None;
  }
  if f == "menu" {
    return Some(MENU.to_string());
  }
  let name = f.strip_prefix(DIALOG_PREFIX)?;
  (!name.is_empty()).then(|| f.to_string())
}

pub fn is_popout(label: &str) -> bool {
  label == MENU || label.starts_with(DIALOG_PREFIX)
}

/// Builds the window window.open asked for (called from the main window's
/// on_new_window handler).
pub fn new_window(app: &AppHandle, owner: &WebviewWindow, url: &Url, features: NewWindowFeatures) -> NewWindowResponse<tauri::Wry> {
  let Some(label) = popout_label(url.fragment()) else {
    return NewWindowResponse::Deny;
  };
  // A window left over from a page reload is replaced.
  if let Some(old) = app.get_webview_window(&label) {
    let _ = old.destroy();
  }
  let menu = label == MENU;
  let Ok(blank) = "about:blank".parse::<Url>() else {
    return NewWindowResponse::Deny;
  };
  let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(blank))
    .window_features(features)
    .title("MyEBookReader")
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .skip_taskbar(true)
    .shadow(true)
    .visible(false)
    .background_color(tauri::window::Color(20, 16, 15, 255))
    .disable_drag_drop_handler();
  if menu {
    b = b.focused(false).focusable(false);
  }
  let b = match b.parent(owner) {
    Ok(next) => next,
    Err(_) => return NewWindowResponse::Deny,
  };
  match b.build() {
    Ok(window) => NewWindowResponse::Create { window },
    Err(_) => NewWindowResponse::Deny,
  }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PlaceOpts {
  pub label: String,
  /// Screen position of the client area (CSS px). None centres the window
  /// over the main window.
  pub x: Option<f64>,
  pub y: Option<f64>,
  pub width: f64,
  pub height: f64,
  /// Where a menu that does not fit below its point goes instead (its bottom
  /// edge), as menus do at the bottom of the screen.
  pub flip_y: Option<f64>,
  /// Disable the main window while this one is open.
  pub modal: bool,
  /// Give it the keyboard (dialogs); menus never take it.
  pub activate: bool,
  /// Only follow a size change of the content: no move, no show.
  pub resize_only: bool,
}

/// (x, y, width, height) of the work area of the monitor holding the point.
fn work_area_at(app: &AppHandle, x: f64, y: f64, scale: f64) -> Option<(f64, f64, f64, f64)> {
  let m = app.monitor_from_point(x * scale, y * scale).ok().flatten().or_else(|| app.primary_monitor().ok().flatten())?;
  let ms = m.scale_factor();
  let wa = m.work_area();
  Some((
    wa.position.x as f64 / ms,
    wa.position.y as f64 / ms,
    wa.size.width as f64 / ms,
    wa.size.height as f64 / ms,
  ))
}

/// Keeps a w×h box at x, y on the work area; one that hangs off the bottom
/// goes above `flip_y` when there is room there.
pub fn clamp_to_area(x: f64, y: f64, w: f64, h: f64, flip_y: Option<f64>, area: (f64, f64, f64, f64)) -> (f64, f64) {
  let (ax, ay, aw, ah) = area;
  let mut x = x;
  let mut y = y;
  if x + w > ax + aw {
    x = ax + aw - w;
  }
  if x < ax {
    x = ax;
  }
  if y + h > ay + ah {
    let above = flip_y.map(|f| f - h);
    y = match above {
      Some(a) if a >= ay => a,
      _ => ay + ah - h,
    };
  }
  if y < ay {
    y = ay;
  }
  (x.round(), y.round())
}

/// Moves the window so that its client area starts at x, y: a frameless
/// window's outer rectangle includes an invisible resize border.
fn place_client(window: &WebviewWindow, x: f64, y: f64) {
  let scale = window.scale_factor().unwrap_or(1.0);
  let (dx, dy) = match (window.inner_position(), window.outer_position()) {
    (Ok(i), Ok(o)) => (f64::from(i.x - o.x) / scale, f64::from(i.y - o.y) / scale),
    _ => (0.0, 0.0),
  };
  let _ = window.set_position(LogicalPosition::new((x - dx).round(), (y - dy).round()));
}

/// Sizes the window for a w×h page. These frameless windows come out with a
/// viewport a caption's height off what set_size asked, and inner_size does
/// not report it, so the page compares its own viewport with its content and
/// asks again with the difference (Modal.jsx / ContextMenu.jsx).
fn set_client_size(window: &WebviewWindow, w: f64, h: f64) {
  let _ = window.set_size(LogicalSize::new(w, h));
}

#[cfg(windows)]
fn show_native(window: &WebviewWindow, show: bool) -> bool {
  use windows::Win32::Foundation::HWND;
  use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE, SW_SHOWNOACTIVATE};
  let Ok(h) = window.hwnd() else { return false };
  // tao never sees this show, so the hide must be native as well.
  unsafe {
    let _ = ShowWindow(HWND(h.0 as _), if show { SW_SHOWNOACTIVATE } else { SW_HIDE });
  }
  true
}

#[cfg(not(windows))]
fn show_native(window: &WebviewWindow, show: bool) -> bool {
  if show { window.show().is_ok() } else { window.hide().is_ok() }
}

/// Sizes a pop-out to the content the page measured, places it and shows it.
#[tauri::command]
pub fn popout_show(app: AppHandle, opts: PlaceOpts) -> bool {
  if !is_popout(&opts.label) || !opts.width.is_finite() || !opts.height.is_finite() {
    return false;
  }
  let Some(window) = app.get_webview_window(&opts.label) else { return false };
  let main = app.get_webview_window(crate::MAIN);
  let (w, h) = (opts.width.round().max(40.0), opts.height.round().max(24.0));
  set_client_size(&window, w, h);
  if opts.resize_only {
    return true;
  }
  let scale = window.scale_factor().unwrap_or(1.0);
  let (x, y) = match (opts.x, opts.y) {
    (Some(x), Some(y)) if x.is_finite() && y.is_finite() => (x, y),
    _ => {
      // Centred over the main window's client area.
      let centre = main.as_ref().and_then(|m| {
        let ms = m.scale_factor().ok()?;
        let p = m.inner_position().ok()?.to_logical::<f64>(ms);
        let s = m.inner_size().ok()?.to_logical::<f64>(ms);
        Some((p.x + (s.width - w) / 2.0, p.y + (s.height - h) / 2.0))
      });
      centre.unwrap_or((100.0, 100.0))
    }
  };
  let (x, y) = match work_area_at(&app, x + w / 2.0, y, scale) {
    Some(area) => clamp_to_area(x, y, w, h, opts.flip_y, area),
    None => (x.round(), y.round()),
  };
  place_client(&window, x, y);
  if opts.modal {
    if let Some(m) = &main {
      let _ = m.set_enabled(false);
    }
  }
  if opts.activate {
    let _ = window.show();
    let _ = window.set_focus();
    true
  } else {
    show_native(&window, true)
  }
}

#[tauri::command]
pub fn popout_hide(app: AppHandle, label: String) -> bool {
  if !is_popout(&label) {
    return false;
  }
  app.get_webview_window(&label).is_some_and(|w| show_native(&w, false))
}

/// window.close() from the opener does not reach a window the host created.
#[tauri::command]
pub fn popout_close(app: AppHandle, label: String) -> bool {
  if !label.starts_with(DIALOG_PREFIX) {
    return false;
  }
  // Destroyed then re-enables the main window and tells the page.
  app.get_webview_window(&label).is_some_and(|w| w.destroy().is_ok())
}

/// A dialog window is gone (closed by the page or by Alt+F4): the main window
/// takes input again.
pub fn closed(app: &AppHandle, label: &str) {
  if !label.starts_with(DIALOG_PREFIX) {
    return;
  }
  if let Some(m) = app.get_webview_window(crate::MAIN) {
    let _ = m.set_enabled(true);
    let _ = m.set_focus();
  }
  // The page drops its dialog state when the window went some other way.
  let _ = app.emit_to(crate::MAIN, "popout-closed", label);
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn labels_only_for_menus_and_dialogs() {
    assert_eq!(popout_label(Some("menu")).as_deref(), Some(MENU));
    assert_eq!(popout_label(Some("dialog-settings")).as_deref(), Some("dialog-settings"));
    assert_eq!(popout_label(Some("dialog-")), None);
    assert_eq!(popout_label(Some("other")), None);
    assert_eq!(popout_label(Some("dialog-a/b")), None);
    assert_eq!(popout_label(None), None);
    assert!(is_popout(MENU) && is_popout("dialog-about") && !is_popout("main"));
  }

  #[test]
  fn keeps_boxes_on_the_work_area() {
    let area = (0.0, 0.0, 1920.0, 1080.0);
    assert_eq!(clamp_to_area(100.0, 100.0, 200.0, 300.0, None, area), (100.0, 100.0));
    // Off the right edge: slides left.
    assert_eq!(clamp_to_area(1800.0, 100.0, 200.0, 300.0, None, area), (1720.0, 100.0));
    // Off the bottom: goes above the click point.
    assert_eq!(clamp_to_area(100.0, 1000.0, 200.0, 300.0, Some(1000.0), area), (100.0, 700.0));
    // No room above either: pinned to the bottom.
    assert_eq!(clamp_to_area(100.0, 200.0, 200.0, 1000.0, Some(150.0), area), (100.0, 80.0));
    // Off the left / top of a second monitor's area.
    assert_eq!(clamp_to_area(-50.0, -20.0, 200.0, 300.0, None, (-1920.0, 0.0, 1920.0, 1080.0)), (-200.0, 0.0));
  }
}
