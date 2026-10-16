//! Window placement. A port of the parts of `src/ui/window-spec.js` and `src/ui/tray-menu.js`
//! that run before any page exists. Every number is in logical (CSS) pixels.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Same as `WINDOW_DEFAULT` in window-spec.js.
pub const WINDOW_DEFAULT: Size = Size { width: 760.0, height: 640.0 };
/// Same as `WINDOW_MIN` in window-spec.js (title bar pieces, 60% scene).
pub const WINDOW_MIN: Size = Size { width: 313.0, height: 150.0 };

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Size {
  pub width: f64,
  pub height: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Rect {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Placement {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
  pub maximized: bool,
}

impl Placement {
  pub fn rect(&self) -> Rect {
    Rect { x: self.x, y: self.y, width: self.width, height: self.height }
  }
}

/// What settings.json and window.json remember, before it meets the displays.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Recorded {
  pub x: Option<f64>,
  pub y: Option<f64>,
  pub width: Option<f64>,
  pub height: Option<f64>,
  pub maximized: bool,
}

fn number(value: Option<&Value>) -> Option<f64> {
  let value = value?;
  let n = match value {
    Value::Number(n) => n.as_f64()?,
    Value::String(s) => s.trim().parse::<f64>().ok()?,
    _ => return None,
  };
  n.is_finite().then_some(n)
}

fn at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
  path.iter().try_fold(value, |node, key| node.get(*key))
}

/// A size worth remembering: at least the window's own minimum, as `isUsableSize` says.
pub fn is_usable_size(width: f64, height: f64) -> bool {
  width.round() >= WINDOW_MIN.width && height.round() >= WINDOW_MIN.height
}

fn usable(width: Option<f64>, height: Option<f64>) -> Option<(f64, f64)> {
  let (width, height) = (width?, height?);
  is_usable_size(width, height).then(|| (width.round(), height.round()))
}

/// Prefer the size recorded while resizing. Settings often keep the position and drop the size.
pub fn recorded_window_placement(settings: &Value, recorded: &Value) -> Recorded {
  let first = |own: Option<f64>, fallback: Option<f64>| own.or(fallback).map(f64::round);
  let size = usable(number(recorded.get("width")), number(recorded.get("height")))
    .or_else(|| usable(number(at(settings, &["windowSize", "width"])), number(at(settings, &["windowSize", "height"]))));
  Recorded {
    x: first(number(recorded.get("x")), number(at(settings, &["windowPosition", "x"]))),
    y: first(number(recorded.get("y")), number(at(settings, &["windowPosition", "y"]))),
    width: size.map(|s| s.0),
    height: size.map(|s| s.1),
    maximized: truthy(recorded.get("maximized")) || truthy(settings.get("windowMaximized")),
  }
}

fn truthy(value: Option<&Value>) -> bool {
  matches!(value, Some(Value::Bool(true)))
}

/// Writes the window's place into a settings object, as `stampWindowPlacement` does.
pub fn stamp_window_placement(settings: &mut Value, placement: &Placement) {
  if !settings.is_object() {
    *settings = json!({});
  }
  let width = placement.width.round();
  let height = placement.height.round();
  if !(width >= WINDOW_MIN.width) || !(height >= WINDOW_MIN.height) {
    return;
  }
  settings["windowSize"] = json!({ "width": width as i64, "height": height as i64 });
  if placement.x.is_finite() && placement.y.is_finite() {
    settings["windowPosition"] = json!({ "x": placement.x.round() as i64, "y": placement.y.round() as i64 });
  }
  settings["windowMaximized"] = json!(placement.maximized);
}

pub fn clamp_window_size(width: f64, height: f64) -> Size {
  let width = if width.is_finite() && width != 0.0 { width.round() } else { WINDOW_DEFAULT.width };
  let height = if height.is_finite() && height != 0.0 { height.round() } else { WINDOW_DEFAULT.height };
  Size { width: width.max(WINDOW_MIN.width), height: height.max(WINDOW_MIN.height) }
}

fn overlap(a: &Rect, b: &Rect) -> f64 {
  let width = (a.x + a.width).min(b.x + b.width) - a.x.max(b.x);
  let height = (a.y + a.height).min(b.y + b.height) - a.y.max(b.y);
  if width <= 0.0 || height <= 0.0 {
    0.0
  } else {
    width * height
  }
}

/// Enough of the title row is on a display that the window can still be moved.
pub fn window_is_visible(bounds: &Rect, areas: &[Rect]) -> bool {
  let title = Rect { x: bounds.x, y: bounds.y, width: bounds.width.min(120.0), height: bounds.height.min(46.0) };
  areas.iter().any(|area| overlap(&title, area) >= 32.0 * 16.0)
}

fn fit_to_area(size: Size, area: &Rect) -> Size {
  clamp_window_size(size.width.min(area.width), size.height.min(area.height))
}

/// Restore the last window. A position that no longer meets a display opens centered on the first one.
pub fn place_window(saved: &Recorded, areas: &[Rect]) -> Rect {
  let areas: Vec<Rect> = areas.iter().copied().filter(|a| a.width > 0.0 && a.height > 0.0).collect();
  let primary = areas.first().copied().unwrap_or(Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1080.0 });
  let requested = clamp_window_size(
    saved.width.unwrap_or(WINDOW_DEFAULT.width),
    saved.height.unwrap_or(WINDOW_DEFAULT.height),
  );
  let displays = if areas.is_empty() { vec![primary] } else { areas };
  if let (Some(x), Some(y)) = (saved.x, saved.y) {
    let candidate = Rect { x: x.round(), y: y.round(), width: requested.width, height: requested.height };
    if window_is_visible(&candidate, &displays) {
      let mut home = primary;
      let mut best = 0.0;
      for area in &displays {
        let amount = overlap(&candidate, area);
        if amount > best {
          home = *area;
          best = amount;
        }
      }
      let fitted = fit_to_area(requested, &home);
      return Rect { x: candidate.x, y: candidate.y, width: fitted.width, height: fitted.height };
    }
  }
  let fitted = fit_to_area(requested, &primary);
  Rect {
    x: (primary.x + (primary.width - fitted.width) / 2.0).round(),
    y: (primary.y + (primary.height - fitted.height) / 2.0).round(),
    width: fitted.width,
    height: fitted.height,
  }
}

/// Keep the menu's left edge on the tray icon, then slide it back onto the screen.
pub fn place_tray_menu(icon: &Rect, width: f64, height: f64, area: &Rect) -> Rect {
  let width = width.ceil();
  let height = height.ceil();
  let mut x = icon.x.round();
  let mut y = (icon.y - height).round();
  if icon.y <= area.y + 4.0 {
    y = (icon.y + icon.height).round();
  }
  let right = area.x + area.width;
  let bottom = area.y + area.height;
  if x + width > right {
    x = (right - width).round();
  }
  if x < area.x {
    x = area.x.round();
  }
  if y + height > bottom {
    y = (bottom - height).round();
  }
  if y < area.y {
    y = area.y.round();
  }
  Rect { x, y, width, height }
}

/// Slides a rectangle back inside an area without changing its size.
pub fn keep_inside(rect: Rect, area: &Rect) -> Rect {
  let mut x = rect.x;
  let mut y = rect.y;
  if x + rect.width > area.x + area.width {
    x = area.x + area.width - rect.width;
  }
  if x < area.x {
    x = area.x;
  }
  if y + rect.height > area.y + area.height {
    y = area.y + area.height - rect.height;
  }
  if y < area.y {
    y = area.y;
  }
  Rect { x: x.round(), y: y.round(), ..rect }
}

#[cfg(test)]
mod tests {
  use super::*;

  const WORK: Rect = Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1040.0 };

  #[test]
  fn recorded_size_wins_over_settings() {
    let settings = json!({ "windowSize": { "width": 500, "height": 400 }, "windowPosition": { "x": 10, "y": 20 } });
    let recorded = json!({ "width": 640, "height": 480 });
    let r = recorded_window_placement(&settings, &recorded);
    assert_eq!((r.x, r.y, r.width, r.height), (Some(10.0), Some(20.0), Some(640.0), Some(480.0)));
    let tiny = recorded_window_placement(&settings, &json!({ "width": 20, "height": 20 }));
    assert_eq!((tiny.width, tiny.height), (Some(500.0), Some(400.0)));
    assert!(recorded_window_placement(&json!({ "windowMaximized": true }), &Value::Null).maximized);
  }

  #[test]
  fn stamp_skips_a_window_below_the_minimum() {
    let mut settings = json!({});
    stamp_window_placement(&mut settings, &Placement { x: 1.0, y: 2.0, width: 100.0, height: 100.0, maximized: false });
    assert_eq!(settings, json!({}));
    stamp_window_placement(&mut settings, &Placement { x: 1.4, y: 2.6, width: 700.2, height: 500.0, maximized: true });
    assert_eq!(settings["windowSize"], json!({ "width": 700, "height": 500 }));
    assert_eq!(settings["windowPosition"], json!({ "x": 1, "y": 3 }));
    assert_eq!(settings["windowMaximized"], json!(true));
  }

  #[test]
  fn a_lost_window_comes_back_centered() {
    let saved = Recorded { x: Some(5000.0), y: Some(5000.0), width: Some(800.0), height: Some(600.0), maximized: false };
    let placed = place_window(&saved, &[WORK]);
    assert_eq!(placed, Rect { x: 560.0, y: 220.0, width: 800.0, height: 600.0 });
    let kept = place_window(&Recorded { x: Some(100.0), y: Some(80.0), ..saved }, &[WORK]);
    assert_eq!(kept, Rect { x: 100.0, y: 80.0, width: 800.0, height: 600.0 });
  }

  #[test]
  fn the_window_never_opens_below_the_minimum() {
    let placed = place_window(&Recorded { width: Some(10.0), height: Some(10.0), ..Default::default() }, &[WORK]);
    assert_eq!((placed.width, placed.height), (WINDOW_MIN.width, WINDOW_MIN.height));
    let fallback = place_window(&Recorded::default(), &[]);
    assert_eq!((fallback.width, fallback.height), (WINDOW_DEFAULT.width, WINDOW_DEFAULT.height));
  }

  #[test]
  fn tray_menu_opens_above_a_bottom_taskbar_and_below_a_top_one() {
    let icon = Rect { x: 1800.0, y: 1050.0, width: 24.0, height: 24.0 };
    let menu = place_tray_menu(&icon, 220.0, 300.0, &WORK);
    assert_eq!(menu, Rect { x: 1700.0, y: 740.0, width: 220.0, height: 300.0 });
    let top = Rect { x: 0.0, y: 30.0, width: 1920.0, height: 1050.0 };
    let below = place_tray_menu(&Rect { x: 40.0, y: 2.0, width: 24.0, height: 24.0 }, 220.0, 300.0, &top);
    assert_eq!((below.x, below.y), (40.0, 30.0));
  }

  #[test]
  fn keep_inside_slides_without_resizing() {
    let moved = keep_inside(Rect { x: 1900.0, y: -20.0, width: 100.0, height: 50.0 }, &WORK);
    assert_eq!(moved, Rect { x: 1820.0, y: 0.0, width: 100.0, height: 50.0 });
  }
}
