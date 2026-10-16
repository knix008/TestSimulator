//! The transparent always-on-top window, where it sits, and everything that
//! moves on a clock: the auto-hide slide, its timers and the pointer poll.
//!
//! All of it runs on one thread, `dock-driver`. Commands from the pages only
//! change the state below and wake that thread; it is the only thing that
//! moves or reshapes the window, so two moves can never arrive out of order.
//! Nothing here holds the lock while it talks to the window: Tauri's getters
//! wait on the main thread, and the main thread may itself be waiting on this
//! lock.
//!
//! Units: the window, the screen and the cursor are physical pixels; what the
//! page reports (its size, the plate) and what it is told (the pointer) are its
//! own CSS pixels. `scale` converts between them.

use crate::{
  bridge,
  config::{num, text, truthy},
  geometry::{self, Edge, Point, Rect},
  pointer::Feeder,
};
use serde_json::{json, Value};
use std::{
  sync::{Arc, Condvar, Mutex},
  thread,
  time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime};

pub const LABEL: &str = "dock";
const MIN: f64 = 80.0;
/// Roughly one frame: the slide is redrawn this often while it runs.
const FRAME: Duration = Duration::from_millis(16);
const NEAR_POLL: Duration = Duration::from_millis(16);
const FAR_POLL: Duration = Duration::from_millis(120);
/// How often the dock checks that its screen has not changed under it.
const DISPLAY_CHECK: Duration = Duration::from_secs(2);
/// Grace band around the dock, in page pixels: leaving it by a hair should not
/// start the dock hiding.
const NEAR_DOCK: f64 = 48.0;
/// Within this of the window, the pointer is polled hard.
const NEIGHBOURHOOD: f64 = 60.0;

#[derive(Clone, Debug, PartialEq)]
pub struct Display {
  pub name: String,
  pub area: Rect,
  pub scale: f64,
}

#[derive(Clone, Copy)]
struct Slide {
  from: f64,
  to: f64,
  started: Instant,
  span: Duration,
}

enum Op {
  Place { x: i32, y: i32, w: u32, h: u32 },
  Ignore(bool),
  Show,
  Hide,
  Level,
  Emit(&'static str, Value),
}

#[derive(Default)]
struct State {
  dock: Value,
  start_with_os: bool,
  content: (f64, f64),
  shown_once: bool,
  visible: bool,
  hidden: bool,
  slide: f64,
  sliding: Option<Slide>,
  hide_at: Option<Instant>,
  show_at: Option<Instant>,
  feeder: Feeder,
  interactive: Option<bool>,
  bounds: Option<Rect>,
  display: Option<Display>,
  resolve: bool,
  next_display_check: Option<Instant>,
  next_poll: Option<Instant>,
  poll_every: Duration,
  ops: Vec<Op>,
}

pub struct Dock<R: Runtime> {
  app: AppHandle<R>,
  state: Mutex<State>,
  wake: Condvar,
  /// The window handle, for owning the bin's progress dialog.
  pub hwnd: Mutex<Option<isize>>,
}

impl<R: Runtime> Dock<R> {
  pub fn new(app: AppHandle<R>, dock: Value, start_with_os: bool) -> Arc<Self> {
    let state = State { dock, start_with_os, content: (400.0, 90.0), poll_every: FAR_POLL, resolve: true, ..Default::default() };
    Arc::new(Self { app, state: Mutex::new(state), wake: Condvar::new(), hwnd: Mutex::new(None) })
  }

  fn with<T>(&self, f: impl FnOnce(&mut State) -> T) -> T {
    let out = f(&mut self.state.lock().unwrap());
    self.wake.notify_all();
    out
  }

  pub fn start(self: &Arc<Self>) {
    let me = self.clone();
    let _ = thread::Builder::new().name("dock-driver".into()).spawn(move || me.run());
  }

  /* ------------------------------ commands ------------------------------ */

  /// Re-apply every window-level setting after the user edits preferences.
  pub fn apply_config(&self, dock: Value, start_with_os: bool) {
    self.with(|s| {
      s.dock = dock;
      s.start_with_os = start_with_os;
      if !truthy(&s.dock["autoHide"]) && s.hidden {
        set_hidden(s, false);
      }
      s.resolve = true;
      s.ops.push(Op::Level);
    });
  }

  /// Called by the renderer once it knows how big the dock actually is.
  pub fn set_content_size(&self, width: f64, height: f64) {
    self.with(|s| {
      let w = MIN.max(width.ceil());
      let h = MIN.max(height.ceil());
      let first = !s.shown_once;
      if (w, h) == s.content && !first {
        return;
      }
      s.content = (w, h);
      s.resolve = true;
      // The window is shown once the page has laid itself out, so the first
      // thing on screen is the finished dock and not an empty frame.
      if first {
        s.shown_once = true;
        s.visible = true;
        s.ops.push(Op::Show);
        s.ops.push(Op::Level);
      }
    });
  }

  pub fn set_rect(&self, rect: Option<Rect>) {
    self.with(|s| {
      s.feeder.plate = rect;
      s.next_poll = Some(Instant::now());
    });
  }

  /// A popup menu takes the mouse: while one is up the dock's window sees no
  /// move and no leave, so the pointer is fed to it from here - and once more
  /// as the menu closes, so it settles on whatever is true by then.
  pub fn set_menu_open(&self, open: bool) {
    self.with(|s| {
      if s.feeder.menu_open == open {
        return;
      }
      s.feeder.menu_open = open;
      s.next_poll = Some(Instant::now());
      if !open {
        s.feeder.menu_open = false;
        s.ops.push(Op::Emit("__menu_closed", Value::Null));
      }
    });
  }

  pub fn reveal(&self) {
    self.with(|s| {
      s.hide_at = None;
      set_hidden(s, false);
    });
  }

  pub fn schedule_hide(&self) {
    self.with(schedule_hide);
  }

  pub fn show(&self) {
    self.with(|s| {
      s.visible = true;
      s.ops.push(Op::Show);
      s.ops.push(Op::Level);
    });
  }

  pub fn is_visible(&self) -> bool {
    self.state.lock().unwrap().visible
  }

  pub fn toggle_visible(&self) {
    self.with(|s| {
      s.visible = !s.visible;
      s.ops.push(if s.visible { Op::Show } else { Op::Hide });
      if s.visible {
        s.ops.push(Op::Level);
      }
    });
  }

  /* ------------------------------- driver ------------------------------- */

  fn run(self: Arc<Self>) {
    loop {
      // Anything that needs an answer from the main thread is asked here,
      // before the lock is taken.
      let (resolve, check, setting) = {
        let s = self.state.lock().unwrap();
        let check = s.next_display_check.map(|t| Instant::now() >= t).unwrap_or(false);
        (s.resolve, check, text(&s.dock["display"]))
      };
      let cursor = self.cursor();
      let display = if resolve {
        self.target_display(&setting, cursor)
      } else if check {
        // Same screen as before; has it moved or changed size?
        let name = self.state.lock().unwrap().display.as_ref().map(|d| d.name.clone()).unwrap_or_default();
        self.monitors().into_iter().find(|d| d.name == name).or_else(|| self.target_display(&setting, cursor))
      } else {
        None
      };

      let (ops, wait) = {
        let mut s = self.state.lock().unwrap();
        let now = Instant::now();
        if resolve || check {
          s.next_display_check = Some(now + DISPLAY_CHECK);
        }
        if resolve {
          s.resolve = false;
        }
        if let Some(d) = display {
          let changed = s.display.as_ref() != Some(&d);
          s.display = Some(d);
          if changed || resolve {
            reposition(&mut s);
          }
        }
        step(&mut s, now, cursor);
        let wait = next_wait(&s, now);
        (std::mem::take(&mut s.ops), wait)
      };

      self.apply(ops);

      let s = self.state.lock().unwrap();
      if s.ops.is_empty() && !s.resolve {
        let _ = self.wake.wait_timeout(s, wait);
      }
    }
  }

  fn cursor(&self) -> Option<Point> {
    #[cfg(windows)]
    {
      crate::win::cursor_pos().map(|(x, y)| Point { x: x as f64, y: y as f64 })
    }
    #[cfg(not(windows))]
    {
      self.app.cursor_position().ok().map(|p| Point { x: p.x, y: p.y })
    }
  }

  fn monitors(&self) -> Vec<Display> {
    self
      .app
      .available_monitors()
      .unwrap_or_default()
      .into_iter()
      .map(|m| {
        let wa = m.work_area();
        Display {
          name: m.name().cloned().unwrap_or_default(),
          area: Rect::new(wa.position.x as f64, wa.position.y as f64, wa.size.width as f64, wa.size.height as f64),
          scale: m.scale_factor(),
        }
      })
      .collect()
  }

  /// The display the dock should live on, per config.
  fn target_display(&self, setting: &str, cursor: Option<Point>) -> Option<Display> {
    let all = self.monitors();
    if setting == "cursor" {
      if let Some(c) = cursor {
        // Nearest to the pointer: inside it, or failing that the closest edge.
        let distance = |d: &Display| {
          let dx = (d.area.x - c.x).max(0.0).max(c.x - (d.area.x + d.area.width));
          let dy = (d.area.y - c.y).max(0.0).max(c.y - (d.area.y + d.area.height));
          dx * dx + dy * dy
        };
        if let Some(best) = all.iter().min_by(|a, b| distance(a).total_cmp(&distance(b))) {
          return Some(best.clone());
        }
      }
    } else if !setting.is_empty() && setting != "primary" {
      if let Some(found) = all.iter().find(|d| d.name == setting) {
        return Some(found.clone());
      }
    }
    let primary = self.app.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    all.iter().find(|d| Some(&d.name) == primary.as_ref()).cloned().or_else(|| all.into_iter().next())
  }

  fn apply(&self, ops: Vec<Op>) {
    if ops.is_empty() {
      return;
    }
    let Some(win) = self.app.get_webview_window(LABEL) else { return };
    for op in ops {
      match op {
        Op::Place { x, y, w, h } => place_window(&win, x, y, w, h),
        Op::Ignore(ignore) => {
          let _ = win.set_ignore_cursor_events(ignore);
        }
        Op::Show => {
          let _ = win.show();
          // Showing puts a taskbar button back on Windows, so the setting is
          // applied again straight afterwards.
          let (dock, start_with_os) = self.snapshot();
          let _ = win.set_skip_taskbar(!wants_taskbar(&dock, start_with_os));
        }
        Op::Hide => {
          let _ = win.hide();
        }
        Op::Level => {
          let (dock, start_with_os) = self.snapshot();
          apply_level(&win, &dock);
          let _ = win.set_visible_on_all_workspaces(truthy(&dock["showOnAllWorkspaces"]));
          let _ = win.set_skip_taskbar(!wants_taskbar(&dock, start_with_os));
        }
        Op::Emit("__menu_closed", _) => {
          // The menu has gone: tell the dock where the pointer ended up.
          let cursor = self.cursor();
          let msg = {
            let mut s = self.state.lock().unwrap();
            local_css(&s, cursor).and_then(|local| s.feeder.feed(Some(local), true))
          };
          if let Some(point) = msg {
            bridge::post(&self.app, LABEL, "dock:pointer", json!(point));
          }
        }
        Op::Emit(event, payload) => bridge::post(&self.app, LABEL, event, payload),
      }
    }
  }

  fn snapshot(&self) -> (Value, bool) {
    let s = self.state.lock().unwrap();
    (s.dock.clone(), s.start_with_os)
  }
}

/// A login item must stay off the taskbar: the tray is the only icon that
/// launch is allowed.
pub fn wants_taskbar(dock: &Value, start_with_os: bool) -> bool {
  !start_with_os && truthy(&dock["showInTaskbar"])
}

fn apply_level<R: Runtime>(win: &tauri::WebviewWindow<R>, dock: &Value) {
  // 'normal' is what "not on top" means, so the stacking level is the whole
  // setting; a separate always-on-top switch could only ever contradict it.
  let level = text(&dock["stackingLevel"]);
  let _ = win.set_always_on_top(level != "normal");
  #[cfg(target_os = "macos")]
  if level != "normal" {
    // 'floating' sits above ordinary windows; 'screen-saver' also clears
    // full-screen apps and most launchers.
    let value: isize = if level == "floating" { 3 } else { 1000 };
    if let Ok(ns) = win.ns_window() {
      unsafe {
        let ns: &objc2::runtime::AnyObject = &*(ns as *const objc2::runtime::AnyObject);
        let _: () = objc2::msg_send![ns, setLevel: value];
      }
    }
  }
}

fn place_window<R: Runtime>(win: &tauri::WebviewWindow<R>, x: i32, y: i32, w: u32, h: u32) {
  #[cfg(windows)]
  {
    // One SetWindowPos for both, posted rather than sent, so a slide frame
    // never waits on the UI thread and position and size never land apart.
    use windows::Win32::{
      Foundation::HWND,
      UI::WindowsAndMessaging::{SetWindowPos, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOZORDER},
    };
    if let Ok(hwnd) = win.hwnd() {
      unsafe {
        let _ = SetWindowPos(HWND(hwnd.0), None, x, y, w as i32, h as i32, SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
      }
      return;
    }
  }
  let _ = win.set_size(PhysicalSize::new(w, h));
  let _ = win.set_position(PhysicalPosition::new(x, y));
}

/* --------------------------- state transitions --------------------------- */

fn slide_ms(s: &State) -> f64 {
  num(&s.dock["autoHideAnimation"], 0.0).max(0.0)
}

fn set_hidden(s: &mut State, hidden: bool) {
  if s.hidden == hidden {
    return;
  }
  s.hidden = hidden;
  let ms = slide_ms(s);
  // The renderer fades the dock out over the same span, so the two halves of
  // the effect finish together.
  s.ops.push(Op::Emit("dock:hidden-changed", json!({ "hidden": hidden, "duration": ms })));
  slide_to(s, if hidden { 1.0 } else { 0.0 }, ms);
}

/// Walk the window to `target` (0 out, 1 away), easing at both ends. Starting
/// a new slide part-way through redirects the one in flight.
fn slide_to(s: &mut State, target: f64, ms: f64) {
  s.sliding = None;
  let span = geometry::duration(ms, s.slide, target);
  if span <= 0.0 {
    s.slide = target;
    reposition(s);
    return;
  }
  s.sliding = Some(Slide { from: s.slide, to: target, started: Instant::now(), span: Duration::from_millis(span as u64) });
}

fn schedule_hide(s: &mut State) {
  s.show_at = None;
  // The poll calls this every time, so an already-pending hide must be left
  // alone - restarting it would keep pushing the deadline back.
  if !truthy(&s.dock["autoHide"]) || s.hidden || s.hide_at.is_some() {
    return;
  }
  s.hide_at = Some(Instant::now() + Duration::from_millis(num(&s.dock["autoHideDelay"], 450.0).max(0.0) as u64));
}

/// Reveal after the pointer has rested on the edge for `autoShowDelay`, so
/// merely sweeping past the edge does not pop the dock open.
fn schedule_show(s: &mut State) {
  s.hide_at = None;
  if !s.hidden {
    return;
  }
  let delay = num(&s.dock["autoShowDelay"], 0.0).max(0.0);
  if delay == 0.0 {
    set_hidden(s, false);
    return;
  }
  if s.show_at.is_none() {
    s.show_at = Some(Instant::now() + Duration::from_millis(delay as u64));
  }
}

/// Where the window rests when the dock is fully out, and fully hidden.
fn stops(s: &State) -> Option<(Point, Point, f64, f64, Edge)> {
  let d = s.display.as_ref()?;
  let dock = &s.dock;
  let w = (s.content.0 * d.scale).round();
  let h = (s.content.1 * d.scale).round();
  let place = geometry::resolve(&text(&dock["position"]), &text(&dock["align"]));
  // An auto-hiding dock has to sit flush against the edge, otherwise the
  // pointer that reveals it lands in the gap and it hides straight away.
  let offset = if truthy(&dock["autoHide"]) { 0.0 } else { num(&dock["edgeOffset"], 0.0) * d.scale };
  let area = d.area;
  let (x, y) = if place.vertical {
    let y = geometry::align_within(area.y, area.height, h, place.align);
    let x = if place.edge == Edge::Left { area.x + offset } else { area.x + area.width - w - offset };
    (x, y)
  } else {
    let x = geometry::align_within(area.x, area.width, w, place.align);
    let y = if place.edge == Edge::Top { area.y + offset } else { area.y + area.height - h - offset };
    (x, y)
  };
  let shown = Point { x: geometry::js_round(x), y: geometry::js_round(y) };
  let peek = (num(&dock["autoHidePeek"], 3.0) * d.scale).round();
  let away = geometry::away_origin(shown, place.edge, area, w, h, peek);
  Some((shown, away, w, h, place.edge))
}

/// Move the window to wherever the slide currently stands.
fn place(s: &mut State) {
  let Some((shown, away, w, h, _)) = stops(s) else { return };
  let at = geometry::origin_at(shown, away, s.slide);
  let bounds = Rect::new(at.x, at.y, w, h);
  if s.bounds == Some(bounds) {
    return;
  }
  s.bounds = Some(bounds);
  s.ops.push(Op::Place { x: at.x as i32, y: at.y as i32, w: w as u32, h: h as u32 });
}

fn reposition(s: &mut State) {
  place(s);
  // A transparent, always-on-top window can be pushed behind full-screen apps;
  // the level is re-asserted whenever the layout changes.
  s.ops.push(Op::Level);
}

/// The cursor in the page's own pixels, relative to the window.
fn local_css(s: &State, cursor: Option<Point>) -> Option<Point> {
  let (c, b, d) = (cursor?, s.bounds?, s.display.as_ref()?);
  Some(Point { x: (c.x - b.x) / d.scale, y: (c.y - b.y) / d.scale })
}

/// The strip that wakes a hidden dock, in page pixels local to the window.
/// Only the sliver at the screen edge counts, not the whole window sweeping
/// across the desktop as it slides.
fn hot_rect(s: &State) -> Option<Rect> {
  let d = s.display.as_ref()?;
  let b = s.bounds?;
  let place = geometry::resolve(&text(&s.dock["position"]), &text(&s.dock["align"]));
  let peek = (num(&s.dock["autoHidePeek"], 3.0) * d.scale).round();
  let band = geometry::edge_band(place.edge, d.area, peek);
  geometry::local_overlap(b, band).map(|r| r.scaled(1.0 / d.scale))
}

fn step(s: &mut State, now: Instant, cursor: Option<Point>) {
  // The slide.
  if let Some(sl) = s.sliding {
    let t = now.duration_since(sl.started).as_secs_f64() / sl.span.as_secs_f64();
    if t >= 1.0 {
      s.slide = sl.to;
      s.sliding = None;
    } else {
      s.slide = sl.from + (sl.to - sl.from) * geometry::ease(t);
    }
    place(s);
  }

  // The timers.
  if s.hide_at.map(|t| now >= t).unwrap_or(false) {
    s.hide_at = None;
    set_hidden(s, true);
  }
  if s.show_at.map(|t| now >= t).unwrap_or(false) {
    s.show_at = None;
    s.hide_at = None;
    set_hidden(s, false);
  }

  // The pointer.
  if s.next_poll.map(|t| now < t).unwrap_or(false) {
    return;
  }
  if !s.visible {
    s.poll_every = FAR_POLL;
    s.next_poll = Some(now + FAR_POLL);
    return;
  }
  let Some(local) = local_css(s, cursor) else {
    s.next_poll = Some(now + FAR_POLL);
    return;
  };
  let scale = s.display.as_ref().map(|d| d.scale).unwrap_or(1.0);
  let size = s.bounds.map(|b| (b.width / scale, b.height / scale)).unwrap_or((0.0, 0.0));

  let call = geometry::decide(local, s.hidden, s.sliding.is_some(), s.feeder.plate, if s.hidden { hot_rect(s) } else { None }, NEAR_DOCK);

  if s.interactive != Some(call.interactive) {
    s.interactive = Some(call.interactive);
    s.ops.push(Op::Ignore(!call.interactive));
  }
  let track = s.feeder.menu_open;
  if let Some(point) = s.feeder.feed(Some(local), track) {
    s.ops.push(Op::Emit("dock:pointer", json!(point)));
  }
  if call.show {
    schedule_show(s);
  } else if call.hide {
    schedule_hide(s);
  }

  // Poll hard only while the pointer is in the neighbourhood.
  let near = local.x >= -NEIGHBOURHOOD && local.y >= -NEIGHBOURHOOD && local.x < size.0 + NEIGHBOURHOOD && local.y < size.1 + NEIGHBOURHOOD;
  s.poll_every = if near || s.feeder.menu_open { NEAR_POLL } else { FAR_POLL };
  s.next_poll = Some(now + s.poll_every);
}

fn next_wait(s: &State, now: Instant) -> Duration {
  let mut wait = s.poll_every;
  if s.sliding.is_some() {
    wait = wait.min(FRAME);
  }
  for deadline in [s.hide_at, s.show_at, s.next_poll, s.next_display_check].into_iter().flatten() {
    wait = wait.min(deadline.saturating_duration_since(now));
  }
  wait.max(Duration::from_millis(1))
}
