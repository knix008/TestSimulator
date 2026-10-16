//! Where the dock sits, and the auto-hide slide.
//!
//! An auto-hiding dock does not blink out of existence: it travels to the
//! screen edge and back, leaving a sliver behind. The awkward parts of that -
//! where it comes to rest, how far along it is at a given moment, and which
//! part of it is still on screen while it moves - are kept here, free of any
//! window, so they can be reasoned about and tested on their own.
//!
//! `resolve()` mirrors `src/shared/placement.js`, which the renderer uses.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Rect {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Point {
  pub x: f64,
  pub y: f64,
}

impl Rect {
  pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
    Self { x, y, width, height }
  }
  pub fn scaled(&self, by: f64) -> Rect {
    Rect::new(self.x * by, self.y * by, self.width * by, self.height * by)
  }
}

/* ------------------------------ placement ------------------------------- */

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Edge {
  Bottom,
  Top,
  Left,
  Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Align {
  Start,
  Center,
  End,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Place {
  pub edge: Edge,
  pub align: Align,
  pub vertical: bool,
  pub corner: bool,
}

/// Every position the settings and the tray menu offer, edges then corners.
pub const POSITIONS: [&str; 8] = ["bottom", "top", "left", "right", "bottom-left", "bottom-right", "top-left", "top-right"];

/// A corner is an edge with the bar pinned to one end, so the rest of the
/// layout only has to know the edge. The caller's own alignment applies on an
/// edge; a corner names its end and ignores that alignment.
pub fn resolve(position: &str, align: &str) -> Place {
  let corner = match position {
    "bottom-left" => Some((Edge::Bottom, Align::Start)),
    "bottom-right" => Some((Edge::Bottom, Align::End)),
    "top-left" => Some((Edge::Top, Align::Start)),
    "top-right" => Some((Edge::Top, Align::End)),
    _ => None,
  };
  if let Some((edge, align)) = corner {
    return Place { edge, align, vertical: false, corner: true };
  }
  let edge = match position {
    "top" => Edge::Top,
    "left" => Edge::Left,
    "right" => Edge::Right,
    _ => Edge::Bottom,
  };
  let align = match align {
    "start" => Align::Start,
    "end" => Align::End,
    _ => Align::Center,
  };
  Place { edge, align, vertical: matches!(edge, Edge::Left | Edge::Right), corner: false }
}

pub fn align_within(start: f64, total: f64, size: f64, align: Align) -> f64 {
  match align {
    Align::Start => start,
    Align::End => start + total - size,
    Align::Center => start + (total - size) / 2.0,
  }
}

/* -------------------------------- slide --------------------------------- */

/// JavaScript's `Math.round`: halves always go up.
pub fn js_round(v: f64) -> f64 {
  (v + 0.5).floor()
}

/// Smooth at both ends. A linear slide starts and stops with a visible jerk;
/// this eases in and out so the dock appears to gather speed and settle.
pub fn ease(t: f64) -> f64 {
  let c = t.clamp(0.0, 1.0);
  if c < 0.5 {
    4.0 * c * c * c
  } else {
    1.0 - (-2.0 * c + 2.0).powi(3) / 2.0
  }
}

/// Where the window sits once the dock has hidden: off the edge it belongs to,
/// with `peek` pixels left on screen for the pointer to find.
pub fn away_origin(shown: Point, edge: Edge, area: Rect, width: f64, height: f64, peek: f64) -> Point {
  let keep = peek.max(1.0);
  match edge {
    Edge::Top => Point { x: shown.x, y: area.y - height + keep },
    Edge::Left => Point { x: area.x - width + keep, y: shown.y },
    Edge::Right => Point { x: area.x + area.width - keep, y: shown.y },
    Edge::Bottom => Point { x: shown.x, y: area.y + area.height - keep },
  }
}

/// The window origin part-way through the slide, `progress` running from 0
/// (fully out) to 1 (fully away). Rounded: a window placed on a fractional
/// pixel shimmers as it moves.
pub fn origin_at(shown: Point, away: Point, progress: f64) -> Point {
  let p = progress.clamp(0.0, 1.0);
  Point { x: js_round(shown.x + (away.x - shown.x) * p), y: js_round(shown.y + (away.y - shown.y) * p) }
}

/// How long a slide should take. Reversing part-way is charged only for the
/// distance left to cover.
pub fn duration(full: f64, from: f64, to: f64) -> f64 {
  js_round(full.max(0.0) * (to - from).abs())
}

/// The strip of screen edge that wakes a hidden dock, in screen coordinates.
pub fn edge_band(edge: Edge, area: Rect, peek: f64) -> Rect {
  let keep = peek.max(1.0);
  match edge {
    Edge::Top => Rect::new(area.x, area.y, area.width, keep),
    Edge::Left => Rect::new(area.x, area.y, keep, area.height),
    Edge::Right => Rect::new(area.x + area.width - keep, area.y, keep, area.height),
    Edge::Bottom => Rect::new(area.x, area.y + area.height - keep, area.width, keep),
  }
}

/// `band` clipped to `bounds`, in coordinates local to `bounds`, or None when
/// the two do not meet.
pub fn local_overlap(bounds: Rect, band: Rect) -> Option<Rect> {
  let x1 = bounds.x.max(band.x);
  let y1 = bounds.y.max(band.y);
  let x2 = (bounds.x + bounds.width).min(band.x + band.width);
  let y2 = (bounds.y + bounds.height).min(band.y + band.height);
  if x2 <= x1 || y2 <= y1 {
    return None;
  }
  Some(Rect::new(x1 - bounds.x, y1 - bounds.y, x2 - x1, y2 - y1))
}

/// Is `point` inside `rect`, allowing a grace margin? Far edges are outside.
pub fn within(point: Point, rect: Option<Rect>, margin: f64) -> bool {
  let Some(r) = rect else { return false };
  point.x >= r.x - margin && point.y >= r.y - margin && point.x < r.x + r.width + margin && point.y < r.y + r.height + margin
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Decision {
  pub interactive: bool,
  pub show: bool,
  pub hide: bool,
}

/// What the pointer's position means for an auto-hiding dock.
///
/// `plate` is the region the renderer says is actually dock, and `sliver` the
/// part of a hidden dock still showing at the screen edge - both in window-local
/// coordinates, either of them possibly absent.
///
/// While the dock slides out it is still largely on screen, so the pointer must
/// be able to catch it there; and the window is much bigger than the dock, so
/// "the pointer left" is judged by the plate, never by the window.
pub fn decide(point: Point, hidden: bool, sliding: bool, plate: Option<Rect>, sliver: Option<Rect>, margin: f64) -> Decision {
  let mut zones = vec![if hidden { sliver } else { plate }];
  // Mid-slide, whichever of the two the pointer finds counts.
  if hidden && sliding {
    zones.push(plate);
  }
  let on_dock = zones.iter().any(|z| within(point, *z, 0.0));
  let near_dock = zones.iter().any(|z| within(point, *z, margin));
  Decision { interactive: on_dock, show: on_dock, hide: !on_dock && !near_dock }
}

#[cfg(test)]
mod tests {
  use super::*;

  const AREA: Rect = Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1040.0 };
  const W: f64 = 600.0;
  const H: f64 = 120.0;

  #[test]
  fn placement_resolves_edges_and_corners() {
    assert_eq!(resolve("bottom-left", "center"), Place { edge: Edge::Bottom, align: Align::Start, vertical: false, corner: true });
    assert_eq!(resolve("left", "end"), Place { edge: Edge::Left, align: Align::End, vertical: true, corner: false });
    assert_eq!(resolve("nonsense", "nonsense").edge, Edge::Bottom);
    assert_eq!(resolve("top", "nonsense").align, Align::Center);
  }

  #[test]
  fn easing_starts_and_ends_at_rest_and_never_goes_backwards() {
    assert_eq!(ease(0.0), 0.0);
    assert_eq!(ease(1.0), 1.0);
    assert!((ease(0.5) - 0.5).abs() < 1e-9);
    let mut previous = -1.0;
    let mut t = 0.0;
    while t <= 1.0001 {
      assert!(ease(t) >= previous, "dipped at {t}");
      previous = ease(t);
      t += 0.02;
    }
    assert!(ease(0.05) < 0.01 && ease(0.95) > 0.99, "creeps away rather than jumping");
    assert_eq!(ease(-3.0), 0.0);
    assert_eq!(ease(7.0), 1.0);
  }

  #[test]
  fn hides_to_the_edge_it_belongs_to_leaving_the_sliver() {
    let bottom = away_origin(Point { x: 660.0, y: 920.0 }, Edge::Bottom, AREA, W, H, 3.0);
    assert_eq!(bottom, Point { x: 660.0, y: 1037.0 }, "sliding down must not drift sideways");
    assert_eq!(away_origin(Point { x: 660.0, y: 0.0 }, Edge::Top, AREA, W, H, 3.0).y, 3.0 - H);
    assert_eq!(away_origin(Point { x: 0.0, y: 460.0 }, Edge::Left, AREA, W, H, 3.0), Point { x: 3.0 - W, y: 460.0 });
    assert_eq!(away_origin(Point { x: 1320.0, y: 460.0 }, Edge::Right, AREA, W, H, 3.0).x, 1917.0);
    // A dock hidden without a sliver could never be reached again.
    assert_eq!(away_origin(Point { x: 0.0, y: 920.0 }, Edge::Bottom, AREA, W, H, 0.0).y, 1039.0);
  }

  #[test]
  fn moves_steadily_on_whole_pixels() {
    let shown = Point { x: 100.0, y: 920.0 };
    let away = Point { x: 100.0, y: 1037.0 };
    assert_eq!(origin_at(shown, away, 0.0), shown);
    assert_eq!(origin_at(shown, away, 1.0), away);
    let mut previous = shown.y - 1.0;
    let mut p = 0.0;
    while p <= 1.0001 {
      let at = origin_at(shown, away, p);
      assert_eq!(at.y, at.y.round());
      assert!(at.y >= previous);
      previous = at.y;
      p += 0.05;
    }
  }

  #[test]
  fn charges_only_for_the_distance_left() {
    assert_eq!(duration(260.0, 0.0, 1.0), 260.0);
    assert_eq!(duration(260.0, 0.25, 0.0), 65.0);
    assert_eq!(duration(260.0, 1.0, 1.0), 0.0);
    assert_eq!(duration(0.0, 0.0, 1.0), 0.0);
  }

  #[test]
  fn the_waking_strip_hugs_the_edge() {
    assert_eq!(edge_band(Edge::Bottom, AREA, 3.0), Rect::new(0.0, 1037.0, 1920.0, 3.0));
    assert_eq!(edge_band(Edge::Top, AREA, 3.0), Rect::new(0.0, 0.0, 1920.0, 3.0));
    assert_eq!(edge_band(Edge::Left, AREA, 3.0), Rect::new(0.0, 0.0, 3.0, 1040.0));
    assert_eq!(edge_band(Edge::Right, AREA, 3.0), Rect::new(1917.0, 0.0, 3.0, 1040.0));

    let hidden = Rect::new(660.0, 1037.0, 600.0, 120.0);
    assert_eq!(local_overlap(hidden, edge_band(Edge::Bottom, AREA, 3.0)), Some(Rect::new(0.0, 0.0, 600.0, 3.0)));
    // Half way out, waking the dock must still take reaching the very edge.
    let half = Rect::new(660.0, 980.0, 600.0, 120.0);
    assert_eq!(local_overlap(half, edge_band(Edge::Bottom, AREA, 3.0)), Some(Rect::new(0.0, 57.0, 600.0, 3.0)));
    let gone = Rect::new(660.0, 100.0, 600.0, 120.0);
    assert_eq!(local_overlap(gone, edge_band(Edge::Bottom, AREA, 3.0)), None);
  }

  const PLATE: Rect = Rect { x: 45.0, y: 54.0, width: 680.0, height: 78.0 };
  const SLIVER: Rect = Rect { x: 0.0, y: 0.0, width: 770.0, height: 3.0 };
  const MARGIN: f64 = 48.0;
  fn ask(x: f64, y: f64, hidden: bool, sliding: bool, sliver: Option<Rect>) -> Decision {
    decide(Point { x, y }, hidden, sliding, Some(PLATE), sliver, MARGIN)
  }

  #[test]
  fn wakes_on_the_sliver_and_ignores_the_rest_of_a_hidden_dock() {
    let call = ask(400.0, 1.0, true, false, Some(SLIVER));
    assert!(call.show && call.interactive);
    assert!(!ask(400.0, 90.0, true, false, Some(SLIVER)).show);
  }

  #[test]
  fn lets_the_pointer_catch_the_dock_on_its_way_out() {
    let call = ask(400.0, 90.0, true, true, Some(SLIVER));
    assert!(call.show && !call.hide);
    assert!(!ask(400.0, 10.0, true, true, None).show, "above the plate is empty air, even mid-slide");
  }

  #[test]
  fn keeps_awake_on_the_plate_with_a_grace_band() {
    assert_eq!(ask(400.0, 100.0, false, false, None), Decision { interactive: true, show: true, hide: false });
    let graze = ask(400.0, 30.0, false, false, None);
    assert!(!graze.interactive, "stops swallowing clicks at once");
    assert!(!graze.hide);
    assert!(ask(400.0, 0.0, false, false, None).hide);
    let tall = Rect::new(0.0, 60.0, 60.0, 680.0);
    assert!(decide(Point { x: 250.0, y: 400.0 }, false, false, Some(tall), None, MARGIN).hide);
    for y in [0.0, 20.0, 30.0, 54.0, 90.0, 131.0] {
      let call = ask(400.0, y, false, false, None);
      assert!(!(call.show && call.hide), "contradictory at y={y}");
    }
    let nothing = decide(Point { x: 5.0, y: 5.0 }, false, false, None, None, MARGIN);
    assert_eq!(nothing, Decision { interactive: false, show: false, hide: true });
  }

  #[test]
  fn within_treats_far_edges_as_outside() {
    let r = Some(Rect::new(10.0, 20.0, 100.0, 40.0));
    assert!(within(Point { x: 50.0, y: 30.0 }, r, 0.0));
    assert!(!within(Point { x: 5.0, y: 30.0 }, r, 0.0));
    assert!(within(Point { x: 10.0, y: 20.0 }, r, 0.0));
    assert!(!within(Point { x: 110.0, y: 30.0 }, r, 0.0));
    assert!(within(Point { x: 50.0, y: 75.0 }, r, 20.0));
    assert!(!within(Point { x: 0.0, y: 0.0 }, None, 100.0));
  }
}
