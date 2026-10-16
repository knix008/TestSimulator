//! Telling the dock where the pointer is when it cannot see for itself.
//!
//! A transparent dock window is a rectangle: without help it would swallow
//! every click in its empty corners. `dock.rs` polls the cursor and makes the
//! window click-through except while the pointer is over the plate. This file
//! is the part of that which decides what to *say* to the renderer, kept apart
//! so it can be tested without a window.
//!
//! Once the pointer is off the plate the window is made click-through, and a
//! click-through window stops being sent mouse messages - including the
//! `mouseleave` the dock was waiting for. So the dock is told outright, and
//! told more than once: the webview can deliver a move it coalesced earlier
//! *after* this message, and repeating it leaves the last word here.
//!
//! While a popup menu holds the mouse the dock sees no move at all, so for as
//! long as one is open the pointer is followed across the plate from here.

use crate::geometry::{Point, Rect};
use serde::Serialize;

/// How many polls go on saying the pointer has left after it has.
pub const AWAY_REPEATS: u32 = 3;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Fed {
  pub x: f64,
  pub y: f64,
  pub quiet: bool,
}

#[derive(Default)]
pub struct Feeder {
  /// The interactive region, in the page's own (CSS) pixels.
  pub plate: Option<Rect>,
  pub menu_open: bool,
  fed: Option<String>,
  away: u32,
}

impl Feeder {
  /// What to send to the dock for a pointer at `local` (page pixels), or
  /// `None` when there is nothing worth sending. `Some(None)` means "off the
  /// plate".
  ///
  /// `track` also follows the pointer across the plate. Off unless a menu is
  /// open: while the dock is being sent real mouse events, its own handlers
  /// know more than this poll does.
  pub fn feed(&mut self, local: Option<Point>, track: bool) -> Option<Option<Fed>> {
    let inside = match (self.plate, local) {
      (Some(p), Some(l)) => l.x >= p.x && l.x < p.x + p.width && l.y >= p.y && l.y < p.y + p.height,
      _ => false,
    };

    if inside && !track {
      self.fed = None;
      self.away = 0;
      return None;
    }

    let point = if inside {
      let l = local.unwrap();
      Some(Fed { x: l.x.round(), y: l.y.round(), quiet: self.menu_open })
    } else {
      None
    };
    let key = match point {
      Some(p) => format!("{},{},{}", p.x, p.y, p.quiet),
      None => "away".to_string(),
    };
    // A still pointer is not worth repeating; a departed one is, up to a point.
    if self.fed.as_deref() == Some(key.as_str()) && (point.is_some() || self.away >= AWAY_REPEATS) {
      return None;
    }
    self.away = if point.is_some() { 0 } else { self.away + 1 };
    self.fed = Some(key);
    Some(point)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const PLATE: Rect = Rect { x: 100.0, y: 40.0, width: 200.0, height: 60.0 };

  fn watcher() -> (Feeder, Vec<Option<Fed>>) {
    (Feeder { plate: Some(PLATE), ..Default::default() }, Vec::new())
  }
  fn at(x: f64, y: f64) -> Option<Point> {
    Some(Point { x, y })
  }
  fn push(f: &mut Feeder, sent: &mut Vec<Option<Fed>>, local: Option<Point>, track: bool) {
    if let Some(msg) = f.feed(local, track) {
      sent.push(msg);
    }
  }

  #[test]
  fn says_so_as_soon_as_the_pointer_is_off_the_plate() {
    let (mut f, mut sent) = watcher();
    push(&mut f, &mut sent, at(10.0, 10.0), false);
    assert_eq!(sent, vec![None]);
  }

  #[test]
  fn stays_silent_while_the_pointer_is_on_the_plate() {
    let (mut f, mut sent) = watcher();
    push(&mut f, &mut sent, at(150.0, 60.0), false);
    assert!(sent.is_empty());
  }

  #[test]
  fn repeats_it_over_the_next_few_polls_then_falls_silent() {
    let (mut f, mut sent) = watcher();
    for i in 0..10 {
      push(&mut f, &mut sent, at(10.0 + i as f64, 10.0), false);
    }
    assert!(sent.len() > 1 && sent.len() < 10, "sent {} times", sent.len());
    assert!(sent.iter().all(|p| p.is_none()));
  }

  #[test]
  fn starts_counting_afresh_each_time_the_pointer_leaves() {
    let (mut f, mut sent) = watcher();
    for _ in 0..10 {
      push(&mut f, &mut sent, at(10.0, 10.0), false);
    }
    let first = sent.len();
    push(&mut f, &mut sent, at(150.0, 60.0), false);
    for _ in 0..10 {
      push(&mut f, &mut sent, at(10.0, 10.0), false);
    }
    assert_eq!(sent.len(), first * 2);
  }

  #[test]
  fn treats_an_unplaceable_pointer_or_a_missing_plate_as_away() {
    let (mut f, mut sent) = watcher();
    push(&mut f, &mut sent, None, false);
    assert_eq!(sent, vec![None]);
    let mut bare = Feeder::default();
    assert_eq!(bare.feed(at(150.0, 60.0), true), Some(None));
  }

  #[test]
  fn follows_the_pointer_quietly_while_a_menu_is_open() {
    let (mut f, mut sent) = watcher();
    f.menu_open = true;
    push(&mut f, &mut sent, at(150.0, 60.0), true);
    for _ in 0..5 {
      push(&mut f, &mut sent, at(150.0, 60.0), true);
    }
    push(&mut f, &mut sent, at(10.0, 10.0), true);
    assert_eq!(sent, vec![Some(Fed { x: 150.0, y: 60.0, quiet: true }), None]);
  }

  #[test]
  fn asks_for_the_name_back_once_the_menu_has_gone() {
    let (mut f, mut sent) = watcher();
    push(&mut f, &mut sent, at(150.0, 60.0), true);
    assert_eq!(sent[0].unwrap().quiet, false);
  }

  #[test]
  fn rounds_to_whole_pixels_and_respects_the_plate_edges() {
    let (mut f, mut sent) = watcher();
    f.menu_open = true;
    push(&mut f, &mut sent, at(150.2, 60.4), true);
    push(&mut f, &mut sent, at(150.4, 60.1), true);
    assert_eq!(sent, vec![Some(Fed { x: 150.0, y: 60.0, quiet: true })]);

    let (mut f, mut sent) = watcher();
    f.menu_open = true;
    push(&mut f, &mut sent, at(PLATE.x + PLATE.width, 60.0), true);
    assert_eq!(sent, vec![None], "the far edge is outside");
    let (mut f, mut sent) = watcher();
    f.menu_open = true;
    push(&mut f, &mut sent, at(PLATE.x, PLATE.y), true);
    assert_eq!(sent, vec![Some(Fed { x: PLATE.x, y: PLATE.y, quiet: true })], "the near edge is inside");
  }
}
