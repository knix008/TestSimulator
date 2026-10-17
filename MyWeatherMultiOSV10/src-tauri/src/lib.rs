//! MyWeather's desktop shell. One process owns the tray icon, every weather window, their
//! dialogs and menus, settings.json and window.json. The pages in `src/` talk to it only
//! through the commands below (see `src/platform/tauri-bridge.js`).
//!
//! Locking rule: the shared state is never held while a window is shown, hidden, moved or
//! destroyed. Those calls can report back through a window event that takes the same lock.

mod hub;
mod placement;
mod store;

use hub::{close_result, Begin, Hub, Wait};
use placement::{keep_inside, place_tray_menu, place_window, recorded_window_placement, stamp_window_placement, window_is_visible, Placement, Rect, WINDOW_MIN};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use store::{forget_weather_window, merge_settings, remember_extra_windows, Boot};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Monitor, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

const MAIN: &str = "main";
const TRAY_ID: &str = "myweather";
const FETCH_WAIT: Duration = Duration::from_secs(8);
/// window.json is written once a move or resize has been still this long, not on every step.
const FLUSH_DELAY: Duration = Duration::from_millis(400);
/// A menu that loses focus closes, but not during the moment it takes to appear.
const BLUR_GRACE: Duration = Duration::from_millis(80);

/// WebView2 switches every window must share, or the second window cannot be created.
/// The --disable-features list is Tauri's default. Every window is a small page from one
/// site, so one renderer process serves them all (process-per-site; without it each dialog
/// and menu started its own, ~35 MB each). Pages are drawn without the GPU: nothing here
/// animates, and the GPU process shrinks from ~95 MB to ~22 MB. Transparent windows look
/// the same either way.
#[cfg(windows)]
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --process-per-site --renderer-process-limit=1 --disable-gpu";

struct NewWindow {
  city_index: i64,
  cities: Option<Value>,
  window_key: String,
  saved: Option<Rect>,
}

#[derive(Default)]
struct State {
  dir: PathBuf,
  webview_dir: Option<PathBuf>,
  live: Option<Placement>,
  record_placement: bool,
  placement_token: u64,
  flush_due: Option<Instant>,
  main: Option<String>,
  weather: Vec<String>,
  revealed: HashSet<String>,
  boots: HashMap<String, Boot>,
  owners: HashMap<String, String>,
  menu_specs: HashMap<String, Value>,
  popup_of: HashMap<String, String>,
  resize_starts: HashMap<String, Rect>,
  move_starts: HashMap<String, (f64, f64)>,
  window_state: HashMap<String, (bool, bool)>,
  accept_blur: HashSet<String>,
  tray_menu: Option<String>,
  tray_anchor: Option<(f64, f64)>,
  tray_closed_at: Option<Instant>,
  tray_command: String,
  tray_rect: Option<Rect>,
  shown_city: i64,
  cascade: i32,
  quitting: bool,
  seq: u64,
  hub: Hub<WebviewWindow>,
  fonts: Option<Value>,
  prints: HashMap<String, String>,
}

type Shared = Mutex<State>;

fn st(app: &AppHandle) -> MutexGuard<'_, State> {
  app.state::<Shared>().inner().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

// ---------------------------------------------------------------------------------------
// Files

fn env_flag(name: &str) -> bool {
  matches!(std::env::var(name).unwrap_or_default().to_ascii_lowercase().as_str(), "1" | "true" | "yes")
}

/// `--multi` and MYWEATHER_MULTI drive a second copy while developing. A packaged build ignores them.
fn allow_multiple() -> bool {
  cfg!(debug_assertions) && (std::env::args().any(|arg| arg == "--multi") || env_flag("MYWEATHER_MULTI"))
}

/// The folder Electron used, so settings carry over: %APPDATA%\MyWeather, ~/.config/MyWeather,
/// ~/Library/Application Support/MyWeather. MYWEATHER_CONFIG_DIR moves it (tests use this).
fn config_dir(app: &AppHandle) -> (PathBuf, bool) {
  if let Ok(dir) = std::env::var("MYWEATHER_CONFIG_DIR") {
    if !dir.trim().is_empty() {
      return (PathBuf::from(dir), true);
    }
  }
  let base = app.path().config_dir().unwrap_or_else(|_| std::env::temp_dir());
  if allow_multiple() {
    return (base.join(format!("MyWeather-pid-{}", std::process::id())), true);
  }
  (base.join("MyWeather"), false)
}

fn read_json(path: &Path) -> Value {
  std::fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or(Value::Null)
}

fn write_json(path: &Path, value: &Value, pretty: bool) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let text = if pretty { serde_json::to_string_pretty(value) } else { serde_json::to_string(value) }.map_err(|e| e.to_string())?;
  std::fs::write(path, text).map_err(|e| e.to_string())
}

fn settings_file(s: &State) -> PathBuf {
  s.dir.join("settings.json")
}

fn window_state_file(s: &State) -> PathBuf {
  s.dir.join("window.json")
}

// ---------------------------------------------------------------------------------------
// Geometry

fn logical_area(monitor: &Monitor) -> Rect {
  let scale = monitor.scale_factor();
  let area = monitor.work_area();
  Rect {
    x: area.position.x as f64 / scale,
    y: area.position.y as f64 / scale,
    width: area.size.width as f64 / scale,
    height: area.size.height as f64 / scale,
  }
}

/// Every display's work area, the primary one first.
fn work_areas(app: &AppHandle) -> Vec<Rect> {
  let mut areas: Vec<Rect> = Vec::new();
  let primary = app.primary_monitor().ok().flatten();
  let all = app.available_monitors().unwrap_or_default();
  for monitor in primary.iter().chain(all.iter()) {
    let area = logical_area(monitor);
    if !areas.contains(&area) {
      areas.push(area);
    }
  }
  areas
}

fn overlap(a: &Rect, b: &Rect) -> f64 {
  let w = (a.x + a.width).min(b.x + b.width) - a.x.max(b.x);
  let h = (a.y + a.height).min(b.y + b.height) - a.y.max(b.y);
  if w <= 0.0 || h <= 0.0 {
    0.0
  } else {
    w * h
  }
}

/// The work area a rectangle is mostly on, or the nearest one.
fn area_for(areas: &[Rect], rect: &Rect) -> Rect {
  let fallback = Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1080.0 };
  if let Some(best) = areas.iter().filter(|a| overlap(a, rect) > 0.0).max_by(|a, b| overlap(a, rect).total_cmp(&overlap(b, rect))) {
    return *best;
  }
  let (cx, cy) = (rect.x + rect.width / 2.0, rect.y + rect.height / 2.0);
  let distance = |a: &Rect| {
    let dx = (a.x - cx).max(0.0).max(cx - (a.x + a.width));
    let dy = (a.y - cy).max(0.0).max(cy - (a.y + a.height));
    dx * dx + dy * dy
  };
  areas.iter().min_by(|a, b| distance(a).total_cmp(&distance(b))).copied().unwrap_or(fallback)
}

fn bounds(win: &WebviewWindow) -> Option<Rect> {
  let scale = win.scale_factor().ok()?;
  let position = win.outer_position().ok()?.to_logical::<f64>(scale);
  let size = win.outer_size().ok()?.to_logical::<f64>(scale);
  Some(Rect { x: position.x.round(), y: position.y.round(), width: size.width.round(), height: size.height.round() })
}

fn set_bounds(win: &WebviewWindow, rect: &Rect) {
  let _ = win.set_size(LogicalSize::new(rect.width, rect.height));
  let _ = win.set_position(LogicalPosition::new(rect.x, rect.y));
}

fn rect_json(rect: &Rect) -> Value {
  json!({ "x": rect.x, "y": rect.y, "width": rect.width, "height": rect.height })
}

fn placement_json(p: &Placement) -> Value {
  json!({ "x": p.x, "y": p.y, "width": p.width, "height": p.height, "maximized": p.maximized })
}

fn num(value: &Value, key: &str) -> Option<f64> {
  value.get(key).and_then(Value::as_f64).filter(|n| n.is_finite())
}

// ---------------------------------------------------------------------------------------
// Placement of the first weather window

fn saved_window_placement(app: &AppHandle) -> Placement {
  let (settings, recorded) = {
    let s = st(app);
    (read_json(&settings_file(&s)), read_json(&window_state_file(&s)))
  };
  let recorded = recorded_window_placement(&settings, &recorded);
  let areas = work_areas(app);
  let placed = place_window(&recorded, &areas);
  let on_screen = match (recorded.x, recorded.y) {
    (Some(x), Some(y)) => window_is_visible(&Rect { x, y, width: placed.width, height: placed.height }, &areas),
    _ => true,
  };
  Placement { x: placed.x, y: placed.y, width: placed.width, height: placed.height, maximized: recorded.maximized && on_screen }
}

/// A saved extra window keeps its last spot while that spot is still on a display.
fn extra_window_placement(app: &AppHandle, saved: Option<Rect>) -> Placement {
  let base = saved_window_placement(app);
  if let Some(saved) = saved {
    let width = if saved.width >= WINDOW_MIN.width { saved.width } else { base.width };
    let height = if saved.height >= WINDOW_MIN.height { saved.height } else { base.height };
    let rect = Rect { x: saved.x.round(), y: saved.y.round(), width, height };
    if window_is_visible(&rect, &work_areas(app)) {
      return Placement { x: rect.x, y: rect.y, width, height, maximized: false };
    }
  }
  // Extra windows step down and right from the saved spot instead of covering it.
  let step = {
    let mut s = st(app);
    s.cascade += 1;
    32.0 * s.cascade as f64
  };
  let area = area_for(&work_areas(app), &base.rect());
  let x = (base.x + step).min(area.x + area.width - base.width).max(area.x).round();
  let y = (base.y + step).min(area.y + area.height - base.height).max(area.y).round();
  Placement { x, y, width: base.width, height: base.height, maximized: false }
}

/// Updates the remembered place of the first window. Returns what is remembered now.
fn note_bounds(app: &AppHandle, x: Option<f64>, y: Option<f64>, width: Option<f64>, height: Option<f64>, maximized: Option<bool>) -> Option<Placement> {
  let mut s = st(app);
  let live = s.live;
  let next = Placement {
    x: x.or(live.map(|l| l.x)).unwrap_or(f64::NAN).round(),
    y: y.or(live.map(|l| l.y)).unwrap_or(f64::NAN).round(),
    width: width.filter(|w| *w >= WINDOW_MIN.width).or(live.map(|l| l.width)).unwrap_or(0.0).round(),
    height: height.filter(|h| *h >= WINDOW_MIN.height).or(live.map(|l| l.height)).unwrap_or(0.0).round(),
    maximized: maximized.unwrap_or(live.is_some_and(|l| l.maximized)),
  };
  if !(next.width >= WINDOW_MIN.width && next.height >= WINDOW_MIN.height && next.x.is_finite() && next.y.is_finite()) {
    return live;
  }
  if live == Some(next) {
    return live;
  }
  s.live = Some(next);
  let pending = s.flush_due.is_some();
  s.flush_due = Some(Instant::now() + FLUSH_DELAY);
  drop(s);
  if !pending {
    let app = app.clone();
    std::thread::spawn(move || loop {
      let due = st(&app).flush_due;
      let Some(due) = due else { return };
      let now = Instant::now();
      if now < due {
        std::thread::sleep(due - now);
        continue;
      }
      flush_window_state(&app);
      return;
    });
  }
  Some(next)
}

fn flush_window_state(app: &AppHandle) {
  let mut s = st(app);
  s.flush_due = None;
  if let Some(live) = s.live {
    let _ = write_json(&window_state_file(&s), &placement_json(&live), false);
  }
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
  let label = st(app).main.clone()?;
  app.get_webview_window(&label)
}

/// Where the first window is now. A maximized window keeps the size it will restore to.
fn current_placement(app: &AppHandle) -> Option<Placement> {
  let (record, live) = {
    let s = st(app);
    (s.record_placement, s.live)
  };
  let win = main_window(app);
  if let (true, Some(win)) = (record, win.as_ref()) {
    if win.is_maximized().unwrap_or(false) {
      return note_bounds(app, None, None, None, None, Some(true));
    }
    if let Some(b) = bounds(win) {
      return note_bounds(app, Some(b.x), Some(b.y), Some(b.width), Some(b.height), Some(false));
    }
  }
  if live.is_some() {
    return live;
  }
  let win = win?;
  let b = bounds(&win)?;
  note_bounds(app, Some(b.x), Some(b.y), Some(b.width), Some(b.height), Some(win.is_maximized().unwrap_or(false)))
}

fn open_extra_window_boxes(app: &AppHandle) -> Vec<(String, Rect)> {
  let list: Vec<(String, String)> = {
    let s = st(app);
    s.weather
      .iter()
      .filter(|label| s.main.as_deref() != Some(label.as_str()))
      .filter_map(|label| s.boots.get(label).filter(|b| !b.window_key.is_empty()).map(|b| (label.clone(), b.window_key.clone())))
      .collect()
  };
  list.into_iter().filter_map(|(label, key)| Some((key, bounds(&app.get_webview_window(&label)?)?))).collect()
}

fn save_window_placement(app: &AppHandle, use_windows: bool) {
  let placement = if use_windows { current_placement(app) } else { st(app).live };
  let Some(placement) = placement else { return };
  let boxes = if use_windows { open_extra_window_boxes(app) } else { Vec::new() };
  let s = st(app);
  let file = settings_file(&s);
  let mut settings = read_json(&file);
  if !settings.is_object() {
    settings = json!({});
  }
  stamp_window_placement(&mut settings, &placement);
  if settings.get("windowSize").is_none() {
    return;
  }
  remember_extra_windows(&mut settings, &boxes);
  let _ = write_json(&file, &settings, true);
  let _ = write_json(&window_state_file(&s), &placement_json(&placement), false);
}

// ---------------------------------------------------------------------------------------
// Windows

fn window_builder<'a>(app: &'a AppHandle, label: &str, page: &str) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
  let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()));
  if let Some(dir) = st(app).webview_dir.clone() {
    builder = builder.data_directory(dir);
  }
  #[cfg(windows)]
  {
    builder = builder.additional_browser_args(&browser_args());
  }
  builder
}

/// MYWEATHER_DEBUG_PORT opens the DevTools protocol so tests can drive the real windows.
#[cfg(windows)]
fn browser_args() -> String {
  match std::env::var("MYWEATHER_DEBUG_PORT").ok().and_then(|port| port.trim().parse::<u16>().ok()) {
    Some(port) => format!("{BROWSER_ARGS} --remote-debugging-port={port}"),
    None => BROWSER_ARGS.to_string(),
  }
}

fn next_label(app: &AppHandle, prefix: &str) -> String {
  let mut s = st(app);
  s.seq += 1;
  format!("{prefix}-{}", s.seq)
}

fn emit(app: &AppHandle, label: &str, event: &str, payload: Value) {
  let _ = app.emit_to(EventTarget::WebviewWindow { label: label.to_string() }, event, payload);
}

/// The weather window a command belongs to: itself, the window that opened it, or the first one.
fn weather_label_of(s: &State, label: &str) -> Option<String> {
  if s.weather.iter().any(|l| l == label) {
    return Some(label.to_string());
  }
  if let Some(owner) = s.owners.get(label).filter(|owner| s.weather.contains(owner)) {
    return Some(owner.clone());
  }
  s.main.clone()
}

fn weather_window_of(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
  let owner = weather_label_of(&st(app), label)?;
  app.get_webview_window(&owner)
}

fn is_primary(app: &AppHandle, label: &str) -> bool {
  st(app).main.as_deref() == Some(label)
}

fn owner_key(label: Option<&str>) -> String {
  label.map(|l| format!("win-{l}")).unwrap_or_default()
}

fn send_window_state(app: &AppHandle, win: &WebviewWindow) {
  let state = (win.is_maximized().unwrap_or(false), win.is_minimized().unwrap_or(false));
  let label = win.label().to_string();
  if st(app).window_state.insert(label.clone(), state) == Some(state) {
    return;
  }
  emit(app, &label, "window-state", json!({ "maximized": state.0, "minimized": state.1 }));
}

fn reveal(win: &WebviewWindow, focus: bool) {
  if win.is_minimized().unwrap_or(false) {
    let _ = win.unminimize();
  }
  let _ = win.show();
  if focus {
    let _ = win.set_focus();
  }
}

fn arm_blur(app: &AppHandle, label: &str) {
  let app = app.clone();
  let label = label.to_string();
  std::thread::spawn(move || {
    std::thread::sleep(BLUR_GRACE);
    st(&app).accept_blur.insert(label);
  });
}

fn create_weather_window(app: &AppHandle, opts: NewWindow) -> tauri::Result<WebviewWindow> {
  let first = st(app).weather.is_empty();
  let placement = if first { saved_window_placement(app) } else { extra_window_placement(app, opts.saved) };
  let label = if first && app.get_webview_window(MAIN).is_none() { MAIN.to_string() } else { next_label(app, "weather") };
  {
    let mut s = st(app);
    if first {
      s.live = Some(placement);
      s.main = Some(label.clone());
    }
    s.weather.push(label.clone());
    s.boots.insert(label.clone(), Boot { city_index: opts.city_index, primary: first, cities: opts.cities, window_key: opts.window_key });
  }
  let built = window_builder(app, &label, "src/index.html")
    .title("MyWeather")
    .inner_size(placement.width, placement.height)
    .position(placement.x, placement.y)
    .min_inner_size(WINDOW_MIN.width, WINDOW_MIN.height)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .resizable(true)
    .visible(false)
    .focused(first)
    .on_page_load(|win, payload| {
      if payload.event() == PageLoadEvent::Finished {
        reveal_weather_window(win.app_handle(), win.label());
      }
    })
    .build();
  let win = match built {
    Ok(win) => win,
    Err(error) => {
      let mut s = st(app);
      s.weather.retain(|l| *l != label);
      s.boots.remove(&label);
      if s.main.as_deref() == Some(label.as_str()) {
        s.main = None;
      }
      return Err(error);
    }
  };
  let handle = app.clone();
  let own = label.clone();
  win.on_window_event(move |event| on_weather_event(&handle, &own, event));
  publish_window_count(app);
  // A page that never reports back still gets its window shown.
  let handle = app.clone();
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_millis(1500));
    let app = handle.clone();
    let _ = handle.run_on_main_thread(move || reveal_weather_window(&app, &label));
  });
  Ok(win)
}

fn reveal_weather_window(app: &AppHandle, label: &str) {
  let (first, placement) = {
    let mut s = st(app);
    if !s.weather.iter().any(|l| l == label) || !s.revealed.insert(label.to_string()) {
      return;
    }
    (s.main.as_deref() == Some(label), s.live)
  };
  let Some(win) = app.get_webview_window(label) else { return };
  if first && placement.is_some_and(|p| p.maximized) {
    let _ = win.maximize();
  }
  reveal(&win, first);
  send_window_state(app, &win);
  if first {
    let app = app.clone();
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_millis(200));
      let untouched = {
        let mut s = st(&app);
        s.record_placement = true;
        s.placement_token == 0
      };
      if untouched {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || remember_current(&handle));
      }
    });
  }
}

fn remember_current(app: &AppHandle) {
  if !st(app).record_placement {
    return;
  }
  let Some(win) = main_window(app) else { return };
  if win.is_maximized().unwrap_or(false) {
    return;
  }
  if let Some(b) = bounds(&win) {
    note_bounds(app, Some(b.x), Some(b.y), Some(b.width), Some(b.height), Some(false));
  }
}

fn on_weather_event(app: &AppHandle, label: &str, event: &WindowEvent) {
  match event {
    WindowEvent::CloseRequested { api, .. } => {
      if st(app).quitting {
        return;
      }
      if !is_primary(app, label) {
        let closing = st(app).hub.close_owned(&owner_key(Some(label)));
        destroy_all(closing);
        return;
      }
      api.prevent_close();
      hide_main_window(app);
    }
    WindowEvent::Destroyed => {
      {
        let mut s = st(app);
        s.weather.retain(|l| l != label);
        s.boots.remove(label);
        s.revealed.remove(label);
        s.resize_starts.remove(label);
        s.move_starts.remove(label);
        s.window_state.remove(label);
        s.owners.retain(|_, owner| owner != label);
        if s.main.as_deref() == Some(label) {
          s.main = s.weather.first().cloned();
        }
      }
      publish_window_count(app);
    }
    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
      let Some(win) = app.get_webview_window(label) else { return };
      let was = st(app).window_state.get(label).copied();
      send_window_state(app, &win);
      if !is_primary(app, label) {
        return;
      }
      let maximized = win.is_maximized().unwrap_or(false);
      if maximized {
        if was.is_some_and(|(m, _)| !m) {
          note_bounds(app, None, None, None, None, Some(true));
        }
      } else if !win.is_minimized().unwrap_or(false) {
        remember_current(app);
      }
    }
    _ => {}
  }
}

fn destroy_all(windows: Vec<WebviewWindow>) {
  for win in windows {
    let _ = win.destroy();
  }
}

/// The tray icon keeps the program alive, so the window is only put away.
fn hide_main_window(app: &AppHandle) {
  let Some(win) = main_window(app) else { return };
  save_window_placement(app, true);
  let closing = st(app).hub.close_all();
  destroy_all(closing);
  let _ = win.hide();
}

fn open_configured_windows(app: &AppHandle) {
  if let Err(error) = create_weather_window(app, NewWindow { city_index: 0, cities: None, window_key: String::new(), saved: None }) {
    eprintln!("MyWeather: the window could not be created: {error}");
    return;
  }
  let settings = read_json(&settings_file(&st(app)));
  let extra = settings.get("extraWindows").and_then(Value::as_array).cloned().unwrap_or_default();
  for entry in extra {
    let key = entry.get("key").and_then(Value::as_str).unwrap_or_default().to_string();
    let cities = entry.get("cities").filter(|c| c.as_array().is_some_and(|a| !a.is_empty())).cloned();
    if key.is_empty() || cities.is_none() {
      continue;
    }
    let saved = match (num(&entry, "x"), num(&entry, "y")) {
      (Some(x), Some(y)) => Some(Rect { x, y, width: num(&entry, "width").unwrap_or(0.0), height: num(&entry, "height").unwrap_or(0.0) }),
      _ => None,
    };
    let _ = create_weather_window(app, NewWindow { city_index: 0, cities, window_key: key, saved });
  }
}

// ---------------------------------------------------------------------------------------
// Tray

fn tray_icon_rect(app: &AppHandle, rect: &tauri::Rect) -> Rect {
  let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
  let position = rect.position.to_logical::<f64>(scale);
  let size = rect.size.to_logical::<f64>(scale);
  Rect { x: position.x, y: position.y, width: size.width, height: size.height }
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
  if let Some(old) = app.remove_tray_by_id(TRAY_ID) {
    drop(old);
  }
  let mut builder = TrayIconBuilder::with_id(TRAY_ID).tooltip("MyWeather").show_menu_on_left_click(false);
  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }
  builder
    .on_tray_icon_event(|tray, event| match event {
      TrayIconEvent::Click { rect, button_state: MouseButtonState::Up, .. } => {
        let app = tray.app_handle();
        let icon = tray_icon_rect(app, &rect);
        show_tray_menu(app, icon);
      }
      TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => show_window_from_tray(tray.app_handle()),
      _ => {}
    })
    .build(app)?;
  Ok(())
}

/// Windows hides new tray icons in the overflow. MyWeather has no other way in, so it asks
/// to be shown (the same switch as Settings > Taskbar > Other system tray icons).
#[cfg(windows)]
fn promote_tray_icon(app: &AppHandle) {
  use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
  use winreg::RegKey;
  let Ok(exe) = std::env::current_exe() else { return };
  let exe = exe.to_string_lossy().to_lowercase();
  let app = app.clone();
  std::thread::spawn(move || {
    for _ in 0..7 {
      if st(&app).quitting {
        return;
      }
      let mut changed = false;
      if let Ok(root) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags("Control Panel\\NotifyIconSettings", KEY_READ) {
        for name in root.enum_keys().flatten() {
          let Ok(item) = root.open_subkey_with_flags(&name, KEY_READ | KEY_SET_VALUE) else { continue };
          let path: String = item.get_value("ExecutablePath").unwrap_or_default();
          let promoted: u32 = item.get_value("IsPromoted").unwrap_or(0);
          if path.to_lowercase() == exe && promoted != 1 && item.set_value("IsPromoted", &1u32).is_ok() {
            changed = true;
          }
        }
      }
      if changed {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
          let _ = create_tray(&handle);
        });
        return;
      }
      std::thread::sleep(Duration::from_millis(800));
    }
  });
}

/// A double click brings the window back, as Show window in the tray menu does. The first
/// click of the pair has already opened the menu, so it closes again; the click that ends
/// the pair arrives within the 500 ms in which a just-closed menu is not reopened.
fn show_window_from_tray(app: &AppHandle) {
  st(app).tray_command = "show-window".into();
  close_tray_menu(app);
}

fn show_tray_menu(app: &AppHandle, icon: Rect) {
  if st(app).tray_menu.is_some() {
    close_tray_menu(app);
    return;
  }
  if st(app).tray_closed_at.is_some_and(|at| at.elapsed() < Duration::from_millis(500)) {
    return;
  }
  let label = next_label(app, "tray");
  let start = keep_inside(Rect { x: icon.x, y: icon.y - 300.0, width: 220.0, height: 300.0 }, &area_for(&work_areas(app), &icon));
  {
    let mut s = st(app);
    s.tray_rect = Some(icon);
    s.tray_menu = Some(label.clone());
    s.tray_anchor = None;
    s.tray_command.clear();
    let spec = json!({ "kind": "tray", "activeIndex": s.shown_city });
    s.menu_specs.insert(label.clone(), spec);
  }
  let built = window_builder(app, &label, "src/menu-host.html")
    .title("MyWeather")
    .inner_size(start.width, start.height)
    .position(start.x, start.y)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .visible(false)
    .focused(true)
    .build();
  let win = match built {
    Ok(win) => win,
    Err(_) => {
      let mut s = st(app);
      s.tray_menu = None;
      s.menu_specs.remove(&label);
      return;
    }
  };
  let handle = app.clone();
  win.on_window_event(move |event| match event {
    WindowEvent::Focused(false) => {
      let close = {
        let s = st(&handle);
        s.accept_blur.contains(&label) && s.tray_command.is_empty() && s.tray_menu.as_deref() == Some(label.as_str())
      };
      if close {
        close_tray_menu(&handle);
      }
    }
    WindowEvent::Destroyed => {
      let pending = {
        let mut s = st(&handle);
        s.menu_specs.remove(&label);
        s.accept_blur.remove(&label);
        if s.tray_menu.as_deref() == Some(label.as_str()) {
          s.tray_menu = None;
        }
        !s.tray_command.is_empty()
      };
      if pending {
        finish_tray_command(&handle);
      }
    }
    _ => {}
  });
}

fn close_tray_menu(app: &AppHandle) {
  let label = {
    let mut s = st(app);
    s.tray_closed_at = Some(Instant::now());
    s.tray_anchor = None;
    s.tray_menu.take()
  };
  if let Some(win) = label.and_then(|label| app.get_webview_window(&label)) {
    let _ = win.hide();
    let _ = win.destroy();
    return;
  }
  if !st(app).tray_command.is_empty() {
    finish_tray_command(app);
  }
}

fn reveal_main_from_tray(app: &AppHandle) {
  let (main, others) = {
    let s = st(app);
    (s.main.clone(), s.weather.iter().filter(|l| Some(*l) != s.main.as_ref()).cloned().collect::<Vec<_>>())
  };
  for label in others {
    if let Some(win) = app.get_webview_window(&label) {
      reveal(&win, false);
    }
  }
  if let Some(win) = main.and_then(|label| app.get_webview_window(&label)) {
    let _ = win.set_always_on_top(true);
    reveal(&win, true);
  }
}

fn finish_tray_command(app: &AppHandle) {
  let command = std::mem::take(&mut st(app).tray_command);
  let Some(main) = st(app).main.clone() else { return };
  if command.is_empty() {
    return;
  }
  if command == "exit" {
    emit(app, &main, "menu-command", json!(command));
    return;
  }
  reveal_main_from_tray(app);
  let app = app.clone();
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_millis(280));
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
      let Some(win) = handle.get_webview_window(&main) else { return };
      let _ = win.set_always_on_top(false);
      reveal(&win, true);
      emit(&handle, &main, "menu-command", json!(command));
    });
  });
}

fn apply_open_at_login(app: &AppHandle, enabled: bool) {
  // A development build or a test run must not point the login entry at itself.
  if cfg!(debug_assertions) || std::env::var_os("MYWEATHER_CONFIG_DIR").is_some() {
    return;
  }
  use tauri_plugin_autostart::ManagerExt;
  let launcher = app.autolaunch();
  let result = if enabled { launcher.enable() } else if launcher.is_enabled().unwrap_or(false) { launcher.disable() } else { Ok(()) };
  if let Err(error) = result {
    eprintln!("MyWeather: open at login: {error}");
  }
}

// ---------------------------------------------------------------------------------------
// Commands: window placement

#[tauri::command]
fn window_resize(app: AppHandle, window: WebviewWindow, step: Value) -> Value {
  let Some(win) = weather_window_of(&app, window.label()) else { return Value::Null };
  if win.is_maximized().unwrap_or(false) {
    return Value::Null;
  }
  let label = win.label().to_string();
  let primary = is_primary(&app, &label);
  if primary {
    let mut s = st(&app);
    s.placement_token += 1;
    s.record_placement = true;
  }
  match step.get("phase").and_then(Value::as_str).unwrap_or("move") {
    "start" => {
      let Some(b) = bounds(&win) else { return Value::Null };
      let start = Rect { width: b.width.max(WINDOW_MIN.width), height: b.height.max(WINDOW_MIN.height), ..b };
      st(&app).resize_starts.insert(label, start);
      rect_json(&start)
    }
    "end" => {
      st(&app).resize_starts.remove(&label);
      if primary {
        return current_placement(&app).map(|p| placement_json(&p)).unwrap_or(Value::Null);
      }
      bounds(&win).map(|b| placement_json(&Placement { x: b.x, y: b.y, width: b.width, height: b.height, maximized: false })).unwrap_or(Value::Null)
    }
    _ => {
      let started = st(&app).resize_starts.get(&label).copied();
      let Some(base) = started.or_else(|| bounds(&win)) else { return Value::Null };
      if started.is_none() {
        st(&app).resize_starts.insert(label.clone(), base);
      }
      let width = (base.width + num(&step, "dx").unwrap_or(0.0)).round().max(WINDOW_MIN.width);
      let height = (base.height + num(&step, "dy").unwrap_or(0.0)).round().max(WINDOW_MIN.height);
      let _ = win.set_size(LogicalSize::new(width, height));
      let Some(actual) = bounds(&win) else { return Value::Null };
      if primary {
        note_bounds(&app, Some(actual.x), Some(actual.y), Some(actual.width), Some(actual.height), Some(false));
      }
      rect_json(&actual)
    }
  }
}

#[tauri::command]
fn window_move(app: AppHandle, window: WebviewWindow, step: Value) -> Value {
  if window.is_maximized().unwrap_or(false) {
    return Value::Null;
  }
  let label = window.label().to_string();
  let primary = is_primary(&app, &label);
  if primary {
    let mut s = st(&app);
    s.placement_token += 1;
    s.record_placement = true;
  }
  match step.get("phase").and_then(Value::as_str).unwrap_or("move") {
    "start" => {
      let Some(b) = bounds(&window) else { return Value::Null };
      st(&app).move_starts.insert(label, (b.x, b.y));
      json!({ "x": b.x, "y": b.y })
    }
    "end" => {
      st(&app).move_starts.remove(&label);
      let Some(b) = bounds(&window) else { return Value::Null };
      let maximized = window.is_maximized().unwrap_or(false);
      if !primary {
        return placement_json(&Placement { x: b.x, y: b.y, width: b.width, height: b.height, maximized });
      }
      let live = st(&app).live;
      let noted = note_bounds(&app, Some(b.x), Some(b.y), live.map(|l| l.width).or(Some(b.width)), live.map(|l| l.height).or(Some(b.height)), Some(maximized));
      placement_json(&noted.unwrap_or(Placement { x: b.x, y: b.y, width: b.width, height: b.height, maximized }))
    }
    _ => {
      let origin = st(&app).move_starts.get(&label).copied();
      let Some((ox, oy)) = origin.or_else(|| bounds(&window).map(|b| (b.x, b.y))) else { return Value::Null };
      let x = (ox + num(&step, "dx").unwrap_or(0.0)).round();
      let y = (oy + num(&step, "dy").unwrap_or(0.0)).round();
      let _ = window.set_position(LogicalPosition::new(x, y));
      if primary {
        note_bounds(&app, Some(x), Some(y), None, None, Some(false));
      }
      json!({ "x": x, "y": y })
    }
  }
}

#[tauri::command]
fn window_bounds(app: AppHandle, window: WebviewWindow) -> Value {
  let Some(win) = weather_window_of(&app, window.label()) else { return Value::Null };
  if is_primary(&app, win.label()) {
    return current_placement(&app).map(|p| placement_json(&p)).unwrap_or(Value::Null);
  }
  let maximized = win.is_maximized().unwrap_or(false);
  bounds(&win).map(|b| placement_json(&Placement { x: b.x, y: b.y, width: b.width, height: b.height, maximized })).unwrap_or(Value::Null)
}

/// The calling window and the work area it is on, for placing a dialog or menu beside it.
#[tauri::command]
fn screen_info(app: AppHandle, window: WebviewWindow, point: Option<Value>) -> Value {
  let own = bounds(&window).unwrap_or_default();
  let areas = work_areas(&app);
  let probe = match point.as_ref().and_then(|p| Some((num(p, "x")?, num(p, "y")?))) {
    Some((x, y)) => Rect { x, y, width: 1.0, height: 1.0 },
    None => own,
  };
  json!({ "bounds": rect_json(&own), "workArea": rect_json(&area_for(&areas, &probe)) })
}

#[tauri::command]
fn window_control(app: AppHandle, window: WebviewWindow, action: String) {
  let Some(win) = weather_window_of(&app, window.label()) else { return };
  match action.as_str() {
    "minimize" => {
      let _ = win.minimize();
    }
    "maximize" => {
      if win.is_maximized().unwrap_or(false) {
        let _ = win.unmaximize();
      } else {
        let _ = win.maximize();
      }
    }
    "hide" | "close" => {
      if is_primary(&app, win.label()) {
        hide_main_window(&app);
      } else {
        let _ = win.close();
      }
      return;
    }
    _ => {}
  }
  send_window_state(&app, &win);
}

#[tauri::command]
async fn new_window(app: AppHandle, options: Value) -> Result<bool, String> {
  let cities = options.get("cities").filter(|c| c.as_array().is_some_and(|a| !a.is_empty())).cloned();
  let Some(cities) = cities else {
    let city_index = options.get("cityIndex").and_then(Value::as_i64).unwrap_or(0);
    create_weather_window(&app, NewWindow { city_index, cities: None, window_key: String::new(), saved: None }).map_err(|e| e.to_string())?;
    return Ok(true);
  };
  let window_key = options
    .get("windowKey")
    .and_then(Value::as_str)
    .filter(|k| !k.is_empty())
    .map(str::to_string)
    .unwrap_or_else(|| format!("win-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
  // The page has already moved the city between saved windows (moveCityToWindow).
  if let Some(extra) = options.get("extraWindows").filter(|v| v.is_array()) {
    let s = st(&app);
    let file = settings_file(&s);
    let mut stored = read_json(&file);
    if !stored.is_object() {
      stored = json!({});
    }
    stored["extraWindows"] = extra.clone();
    write_json(&file, &stored, true)?;
  }
  create_weather_window(&app, NewWindow { city_index: 0, cities: Some(cities), window_key, saved: None }).map_err(|e| e.to_string())?;
  Ok(true)
}

#[tauri::command]
fn window_boot(app: AppHandle, window: WebviewWindow) -> Value {
  st(&app).boots.get(window.label()).map(Boot::to_json).unwrap_or(Value::Null)
}

fn publish_window_count(app: &AppHandle) {
  let labels = st(app).weather.clone();
  let message = json!({ "count": labels.len() });
  for label in labels {
    emit(app, &label, "windows-changed", message.clone());
  }
}

/// The window on screen leaves the saved set and closes. The last open window stays.
#[tauri::command]
fn remove_window(app: AppHandle, window: WebviewWindow) -> bool {
  let label = match weather_label_of(&st(&app), window.label()) {
    Some(label) => label,
    None => return false,
  };
  let (primary, window_key, successor) = {
    let s = st(&app);
    if s.weather.len() <= 1 {
      return false;
    }
    let primary = s.main.as_deref() == Some(label.as_str());
    let window_key = s.boots.get(&label).map(|boot| boot.window_key.clone()).unwrap_or_default();
    let successor = if primary { s.weather.iter().find(|other| *other != &label).cloned() } else { None };
    (primary, window_key, successor)
  };
  save_window_placement(&app, true);
  let file = settings_file(&st(&app));
  let mut settings = read_json(&file);
  let Some(forgotten) = forget_weather_window(&mut settings, primary, &window_key) else { return false };
  if let Some(next) = successor.as_ref().filter(|_| forgotten.promoted_key.is_some()) {
    if let Some(win) = app.get_webview_window(next) {
      if let Some(bounds) = bounds(&win) {
        let placement = Placement {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          maximized: win.is_maximized().unwrap_or(false),
        };
        stamp_window_placement(&mut settings, &placement);
        st(&app).live = Some(placement);
      }
    }
  }
  if write_json(&file, &settings, true).is_err() {
    return false;
  }
  let extra = settings.get("extraWindows").cloned().unwrap_or_else(|| json!([]));
  if forgotten.promoted_key.is_some() {
    if let Some(next) = successor.clone() {
      {
        let mut s = st(&app);
        if let Some(boot) = s.boots.get_mut(&next) {
          boot.primary = true;
          boot.window_key.clear();
        }
        s.main = Some(next.clone());
      }
      let mut role = json!({ "primary": true, "windowKey": "", "extraWindows": extra.clone() });
      if let Some(cities) = forgotten.cities {
        role["cities"] = cities;
      }
      if let Some(fonts) = forgotten.fonts {
        role["fonts"] = fonts;
      }
      emit(&app, &next, "window-role", role);
    }
  }
  for other in st(&app).weather.clone() {
    if other == label {
      continue;
    }
    emit(&app, &other, "windows-changed", json!({ "extraWindows": extra.clone() }));
  }
  let closing = st(&app).hub.close_owned(&owner_key(Some(&label)));
  destroy_all(closing);
  if let Some(win) = app.get_webview_window(&label) {
    let _ = win.destroy();
  }
  true
}

#[tauri::command]
fn weather_window_count(app: AppHandle) -> usize {
  st(&app).weather.len()
}

/// The tray marks the city the window shows, so it has to hear about every change.
#[tauri::command]
fn shown_city(app: AppHandle, window: WebviewWindow, index: Value) {
  if !is_primary(&app, window.label()) {
    return;
  }
  st(&app).shown_city = index.as_f64().filter(|n| n.is_finite() && *n >= 0.0).map(|n| n.round() as i64).unwrap_or(0);
}

#[tauri::command]
fn confirm_quit(app: AppHandle) {
  save_window_placement(&app, true);
  let closing = {
    let mut s = st(&app);
    s.quitting = true;
    s.hub.close_all()
  };
  destroy_all(closing);
  app.exit(0);
}

// ---------------------------------------------------------------------------------------
// Commands: settings and files

#[tauri::command]
fn read_settings(app: AppHandle) -> Value {
  read_json(&settings_file(&st(&app)))
}

#[tauri::command]
fn write_settings(app: AppHandle, window: WebviewWindow, data: Value) -> Result<bool, String> {
  let label = window.label().to_string();
  let extra_bounds = {
    let s = st(&app);
    s.boots.get(&label).filter(|b| !b.primary && !b.window_key.is_empty()).is_some()
  }
  .then(|| bounds(&window))
  .flatten();
  let placement = current_placement(&app);
  let s = st(&app);
  let file = settings_file(&s);
  let stored = read_json(&file);
  let merged = merge_settings(data, &stored, s.boots.get(&label), extra_bounds, placement);
  write_json(&file, &merged, true)?;
  Ok(true)
}

#[tauri::command]
fn set_open_at_login(app: AppHandle, enabled: bool) -> bool {
  apply_open_at_login(&app, enabled);
  true
}

fn parent_dir(path: &Path) -> String {
  path.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}

fn start_dir(opts: &Value) -> Option<PathBuf> {
  opts.get("startDir").and_then(Value::as_str).map(str::trim).filter(|d| !d.is_empty()).map(PathBuf::from).filter(|d| d.is_dir())
}

#[tauri::command]
async fn open_file(app: AppHandle, window: WebviewWindow, opts: Option<Value>) -> Result<Value, String> {
  use tauri_plugin_dialog::DialogExt;
  let opts = opts.unwrap_or(Value::Null);
  let mut dialog = app.dialog().file().set_parent(&window).add_filter("MyWeather", &["myweather"]);
  if let Some(dir) = start_dir(&opts) {
    dialog = dialog.set_directory(dir);
  }
  let Some(picked) = dialog.blocking_pick_file() else { return Ok(Value::Null) };
  let path = picked.into_path().map_err(|e| e.to_string())?;
  let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
  Ok(json!({ "path": path.to_string_lossy(), "directory": parent_dir(&path), "text": text }))
}

#[tauri::command]
async fn save_file(app: AppHandle, window: WebviewWindow, opts: Value) -> Result<Value, String> {
  use tauri_plugin_dialog::DialogExt;
  let name = opts.get("suggestedName").and_then(Value::as_str).filter(|n| !n.is_empty()).unwrap_or("weather.myweather");
  let mut dialog = app.dialog().file().set_parent(&window).add_filter("MyWeather", &["myweather", "json"]).set_file_name(name);
  if let Some(dir) = start_dir(&opts) {
    dialog = dialog.set_directory(dir);
  }
  let Some(picked) = dialog.blocking_save_file() else { return Ok(Value::Null) };
  let path = picked.into_path().map_err(|e| e.to_string())?;
  std::fs::write(&path, opts.get("text").and_then(Value::as_str).unwrap_or_default()).map_err(|e| e.to_string())?;
  Ok(json!({ "path": path.to_string_lossy(), "directory": parent_dir(&path) }))
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
  std::fs::read_to_string(&path).map_err(|e| format!("{e} ({path})"))
}

#[tauri::command]
fn write_file(path: String, text: Option<String>) -> Result<Value, String> {
  let target = PathBuf::from(&path);
  if let Some(parent) = target.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  std::fs::write(&target, text.unwrap_or_default()).map_err(|e| e.to_string())?;
  Ok(json!({ "path": path, "directory": parent_dir(&target) }))
}

#[tauri::command]
async fn pick_image(app: AppHandle, window: WebviewWindow, opts: Option<Value>) -> Result<Value, String> {
  use base64::Engine;
  use tauri_plugin_dialog::DialogExt;
  let opts = opts.unwrap_or(Value::Null);
  let mut dialog = app.dialog().file().set_parent(&window).add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
  if let Some(dir) = start_dir(&opts) {
    dialog = dialog.set_directory(dir);
  }
  let Some(picked) = dialog.blocking_pick_file() else { return Ok(Value::Null) };
  let path = picked.into_path().map_err(|e| e.to_string())?;
  let data = std::fs::read(&path).map_err(|e| e.to_string())?;
  let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).filter(|e| !e.is_empty()).unwrap_or_else(|| "png".into());
  let mime = match ext.as_str() {
    "svg" => "image/svg+xml".to_string(),
    "jpg" => "image/jpeg".to_string(),
    other => format!("image/{other}"),
  };
  Ok(json!({
    "dataUrl": format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(&data)),
    "name": path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
    "type": mime,
    "size": data.len(),
    "directory": parent_dir(&path),
  }))
}

/// The installed font families, listed once per run (the settings dialog asks every time it opens).
#[tauri::command]
async fn list_fonts(app: AppHandle) -> Value {
  if let Some(cached) = st(&app).fonts.clone() {
    return cached;
  }
  let listed = tauri::async_runtime::spawn_blocking(run_font_lister).await.ok().flatten();
  let result = match listed {
    Some(stdout) => json!({ "platform": std::env::consts::OS, "stdout": stdout }),
    None => return json!({ "platform": std::env::consts::OS, "stdout": "" }),
  };
  st(&app).fonts = Some(result.clone());
  result
}

fn run_font_lister() -> Option<String> {
  let mut command = if cfg!(windows) {
    let mut c = std::process::Command::new("powershell");
    c.args([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }",
    ]);
    c
  } else if cfg!(target_os = "macos") {
    let mut c = std::process::Command::new("system_profiler");
    c.arg("SPFontsDataType");
    c
  } else {
    let mut c = std::process::Command::new("fc-list");
    c.args([":", "family"]);
    c
  };
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
  }
  let output = command.output().ok()?;
  output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned()).filter(|s| !s.trim().is_empty())
}

fn agent() -> &'static ureq::Agent {
  static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
  AGENT.get_or_init(|| ureq::AgentBuilder::new().timeout(FETCH_WAIT).build())
}

/// Weather providers are fetched here: no CORS, and MET Norway needs a User-Agent the page cannot set.
#[tauri::command]
async fn fetch_url(url: String, options: Option<Value>) -> Result<Value, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let mut request = agent().get(&url);
    if let Some(headers) = options.as_ref().and_then(|o| o.get("headers")).and_then(Value::as_object) {
      for (name, value) in headers {
        if let Some(value) = value.as_str() {
          request = request.set(name, value);
        }
      }
    }
    let read = |response: ureq::Response| {
      let status = response.status();
      let text = response.into_string().unwrap_or_default();
      json!({ "ok": (200..300).contains(&status), "status": status, "text": text })
    };
    match request.call() {
      Ok(response) => Ok(read(response)),
      Err(ureq::Error::Status(_, response)) => Ok(read(response)),
      Err(ureq::Error::Transport(error)) => match error.kind() {
        ureq::ErrorKind::Dns | ureq::ErrorKind::ConnectionFailed | ureq::ErrorKind::Io | ureq::ErrorKind::ProxyConnect => {
          Ok(json!({ "ok": false, "offline": true, "status": 0, "text": "" }))
        }
        _ => Err(error.to_string()),
      },
    }
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  open::that_detached(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn clipboard_write(text: Option<String>) -> Result<(), String> {
  arboard::Clipboard::new().and_then(|mut c| c.set_text(text.unwrap_or_default())).map_err(|e| e.to_string())
}

#[tauri::command]
fn clipboard_read() -> String {
  arboard::Clipboard::new().and_then(|mut c| c.get_text()).unwrap_or_default()
}

#[tauri::command]
async fn message_box(app: AppHandle, window: WebviewWindow, options: Value) {
  use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
  let text = |key: &str| options.get(key).and_then(Value::as_str).unwrap_or_default().to_string();
  let detail = text("detail");
  let body = if detail.is_empty() { text("message") } else { format!("{}\n\n{}", text("message"), detail) };
  let ok = Some(text("ok")).filter(|s| !s.is_empty()).unwrap_or_else(|| "OK".into());
  app
    .dialog()
    .message(body)
    .title(Some(text("title")).filter(|s| !s.is_empty()).unwrap_or_else(|| "MyWeather".into()))
    .kind(MessageDialogKind::Info)
    .buttons(MessageDialogButtons::OkCustom(ok))
    .parent(&window)
    .blocking_show();
}

// ---------------------------------------------------------------------------------------
// Commands: print

/// Prints in a window of its own: the system print preview needs more room than the weather window.
#[tauri::command]
async fn print(app: AppHandle, payload: Value) -> Result<bool, String> {
  let label = next_label(&app, "print");
  let html = payload.get("html").and_then(Value::as_str).unwrap_or_default().to_string();
  st(&app).prints.insert(label.clone(), html);
  let area = work_areas(&app).first().copied().unwrap_or(Rect { x: 0.0, y: 0.0, width: 1280.0, height: 900.0 });
  let width = 860f64.min(area.width);
  let height = (area.height - 80.0).clamp(400.0, 1000.0);
  let built = window_builder(&app, &label, "src/print-host.html")
    .title("MyWeather")
    .inner_size(width, height)
    .position((area.x + (area.width - width) / 2.0).round(), (area.y + (area.height - height) / 2.0).round())
    .build();
  match built {
    Ok(win) => {
      let handle = app.clone();
      win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
          st(&handle).prints.remove(&label);
        }
      });
      Ok(true)
    }
    Err(error) => {
      st(&app).prints.remove(&label);
      Err(error.to_string())
    }
  }
}

#[tauri::command]
fn take_print_html(app: AppHandle, window: WebviewWindow) -> String {
  st(&app).prints.get(window.label()).cloned().unwrap_or_default()
}

#[tauri::command]
fn close_self(window: WebviewWindow) {
  let _ = window.destroy();
}

// ---------------------------------------------------------------------------------------
// Commands: dialogs

#[tauri::command]
async fn begin_popup(app: AppHandle, window: WebviewWindow, spec: Value, place: Option<Value>) -> Result<Value, String> {
  let owner = weather_label_of(&st(&app), window.label());
  let begun = st(&app).hub.begin(&spec, &owner_key(owner.as_deref()));
  let (id, stored) = match begun {
    Begin::Existing { id, win } => {
      reveal(&win, true);
      return Ok(json!({ "id": id, "focused": true }));
    }
    Begin::Building { id } => return Ok(json!({ "id": id, "focused": true })),
    Begin::New { id, spec } => (id, spec),
  };
  let place = place.unwrap_or(Value::Null);
  let width = num(&place, "width").or_else(|| num(&stored, "width")).unwrap_or(480.0);
  let height = num(&place, "height").or_else(|| num(&stored, "height")).unwrap_or(360.0);
  let label = next_label(&app, "popup");
  let mut builder = window_builder(&app, &label, "src/popup-host.html")
    .title("MyWeather")
    .inner_size(width, height)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .visible(false)
    .on_page_load(|win, payload| {
      if payload.event() == PageLoadEvent::Finished {
        reveal(&win, true);
      }
    });
  if let (Some(x), Some(y)) = (num(&place, "x"), num(&place, "y")) {
    builder = builder.position(x, y);
  } else {
    builder = builder.center();
  }
  // A dialog rides with the window that opened it (stays above it, minimizes with it).
  let builder = match builder.parent(&window) {
    Ok(builder) => builder,
    Err(error) => {
      st(&app).hub.abandon(&id);
      return Err(error.to_string());
    }
  };
  {
    let mut s = st(&app);
    s.popup_of.insert(label.clone(), id.clone());
    if let Some(owner) = owner {
      s.owners.insert(label.clone(), owner);
    }
  }
  match builder.build() {
    Ok(win) => {
      let handle = app.clone();
      let own = label.clone();
      win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
          let mut s = st(&handle);
          let id = s.popup_of.remove(&own);
          s.owners.remove(&own);
          if let Some(id) = id.filter(|id| s.hub.has(id)) {
            s.hub.finish(&id, close_result());
          }
        }
      });
      st(&app).hub.attach(&id, win);
      Ok(json!({ "id": id, "focused": false }))
    }
    Err(error) => {
      let mut s = st(&app);
      s.popup_of.remove(&label);
      s.owners.remove(&label);
      s.hub.abandon(&id);
      Err(error.to_string())
    }
  }
}

#[tauri::command]
async fn wait_popup(app: AppHandle, id: String) -> Value {
  let waiting = st(&app).hub.wait(&id);
  match waiting {
    Wait::Ready(value) => value,
    Wait::Later(rx) => rx.await.unwrap_or_else(|_| close_result()),
  }
}

#[tauri::command]
fn take_popup_spec(app: AppHandle, window: WebviewWindow) -> Value {
  let s = st(&app);
  s.popup_of.get(window.label()).and_then(|id| s.hub.take(id)).unwrap_or(Value::Null)
}

fn finish(app: &AppHandle, id: &str, result: Value) -> Value {
  let closing = st(app).hub.finish(id, result.clone());
  if let Some(win) = closing {
    let _ = win.destroy();
  }
  result
}

#[tauri::command]
fn finish_popup(app: AppHandle, window: WebviewWindow, result: Value) -> Value {
  let id = st(&app).popup_of.get(window.label()).cloned();
  match id {
    Some(id) => finish(&app, &id, result),
    None => result,
  }
}

#[tauri::command]
fn end_popup(app: AppHandle, id: String) -> Value {
  finish(&app, &id, close_result())
}

#[tauri::command]
fn update_popup(app: AppHandle, id: String, patch: Value) {
  let win = st(&app).hub.window(&id);
  if let Some(win) = win {
    emit(&app, win.label(), "popup-update", patch);
  }
}

#[tauri::command]
fn refresh_popup(app: AppHandle, window: WebviewWindow, key: String, patch: Value, options: Option<Value>) -> Value {
  let owner = owner_key(weather_label_of(&st(&app), window.label()).as_deref());
  let found = st(&app).hub.refresh(&key, &patch, &owner);
  let Some((id, win)) = found else { return Value::Null };
  if options.as_ref().and_then(|o| o.get("focus")) != Some(&Value::Bool(false)) {
    reveal(&win, true);
  }
  emit(&app, win.label(), "popup-update", patch);
  json!({ "id": id, "focused": true })
}

#[tauri::command]
fn popup_immediate(app: AppHandle, window: WebviewWindow, message: Value) {
  let (popup_id, owner) = {
    let s = st(&app);
    (s.popup_of.get(window.label()).cloned(), weather_label_of(&s, window.label()))
  };
  let Some(owner) = owner else { return };
  let mut message = if message.is_object() { message } else { json!({}) };
  if let Some(id) = popup_id {
    message["popupId"] = json!(id);
  }
  emit(&app, &owner, "popup-immediate", message);
}

fn broadcast(app: &AppHandle, from: &str, event: &str, message: Value) {
  for label in app.webview_windows().into_keys().filter(|label| label != from) {
    emit(app, &label, event, message.clone());
  }
}

#[tauri::command]
fn broadcast_theme(app: AppHandle, window: WebviewWindow, payload: Value) {
  if !payload.is_object() {
    return;
  }
  let text = |key: &str| payload.get(key).and_then(Value::as_str).unwrap_or_default();
  let mut message = json!({
    "vars": payload.get("vars").filter(|v| v.is_object()).cloned().unwrap_or_else(|| json!({})),
    "mode": text("mode"),
    "theme": text("theme"),
    "customTheme": payload.get("customTheme").cloned().unwrap_or(Value::Null),
    "transparency": payload.get("transparency").cloned().unwrap_or(Value::Null),
    "language": text("language"),
  });
  if let Some(font) = payload.get("fontFamily").filter(|f| f.as_str().is_some_and(|s| !s.is_empty())) {
    message["fontFamily"] = font.clone();
  }
  broadcast(&app, window.label(), "apply-theme", message);
}

#[tauri::command]
fn broadcast_wallpaper(app: AppHandle, window: WebviewWindow, payload: Value) {
  let message = json!({
    "image": payload.get("image").and_then(Value::as_str).unwrap_or_default(),
    "opacity": payload.get("opacity").and_then(Value::as_f64).unwrap_or(0.0),
  });
  broadcast(&app, window.label(), "apply-wallpaper", message);
}

// ---------------------------------------------------------------------------------------
// Commands: menus

#[tauri::command]
async fn show_menu(app: AppHandle, window: WebviewWindow, payload: Value) -> Result<bool, String> {
  let owner = weather_label_of(&st(&app), window.label());
  let place = payload.get("place").cloned().unwrap_or(Value::Null);
  let width = num(&place, "width").unwrap_or(280.0).ceil();
  let height = num(&place, "height").unwrap_or(200.0).ceil();
  let (x, y) = (num(&place, "x").unwrap_or(0.0).round(), num(&place, "y").unwrap_or(0.0).round());
  let area = area_for(&work_areas(&app), &Rect { x, y, width: 1.0, height: 1.0 });
  let x = x.min(area.x + area.width - width).max(area.x);
  let y = if y + height > area.y + area.height { (y - height).max(area.y) } else { y };
  let label = next_label(&app, "menu");
  {
    let mut s = st(&app);
    s.menu_specs.insert(label.clone(), payload);
    if let Some(owner) = owner {
      s.owners.insert(label.clone(), owner);
    }
  }
  let built = window_builder(&app, &label, "src/menu-host.html")
    .title("MyWeather")
    .inner_size(width, height)
    .position(x, y)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .visible(false)
    .focused(true)
    .build();
  let win = match built {
    Ok(win) => win,
    Err(error) => {
      let mut s = st(&app);
      s.menu_specs.remove(&label);
      s.owners.remove(&label);
      return Err(error.to_string());
    }
  };
  let handle = app.clone();
  win.on_window_event(move |event| match event {
    WindowEvent::Focused(false) => {
      if st(&handle).accept_blur.contains(&label) {
        if let Some(win) = handle.get_webview_window(&label) {
          let _ = win.destroy();
        }
      }
    }
    WindowEvent::Destroyed => {
      let mut s = st(&handle);
      s.menu_specs.remove(&label);
      s.owners.remove(&label);
      s.accept_blur.remove(&label);
    }
    _ => {}
  });
  Ok(true)
}

#[tauri::command]
fn take_menu_spec(app: AppHandle, window: WebviewWindow) -> Value {
  st(&app).menu_specs.get(window.label()).cloned().unwrap_or(Value::Null)
}

fn show_menu_window(app: &AppHandle, win: &WebviewWindow, rect: &Rect) {
  set_bounds(win, rect);
  if !win.is_visible().unwrap_or(true) {
    reveal(win, true);
    arm_blur(app, win.label());
  }
}

#[tauri::command]
fn fit_menu(app: AppHandle, window: WebviewWindow, size: Value) -> Value {
  let width = num(&size, "width").unwrap_or(1.0).ceil().max(1.0);
  let height = num(&size, "height").unwrap_or(1.0).ceil().max(1.0);
  let Some(b) = bounds(&window) else { return Value::Null };
  let area = area_for(&work_areas(&app), &Rect { x: b.x, y: b.y, width: 1.0, height: 1.0 });
  let rect = keep_inside(Rect { x: b.x, y: b.y, width, height }, &area);
  show_menu_window(&app, &window, &rect);
  rect_json(&rect)
}

#[tauri::command]
fn fit_tray_menu(app: AppHandle, window: WebviewWindow, size: Value) -> Value {
  let (icon, anchor) = {
    let s = st(&app);
    (s.tray_rect, s.tray_anchor)
  };
  let Some(icon) = icon else { return Value::Null };
  let current = bounds(&window).unwrap_or_default();
  let width = num(&size, "width").unwrap_or(current.width).ceil().max(1.0);
  let height = num(&size, "height").unwrap_or(current.height).ceil().max(1.0);
  let area = area_for(&work_areas(&app), &icon);
  let rect = match anchor {
    None => {
      let placed = place_tray_menu(&icon, width, height, &area);
      st(&app).tray_anchor = Some((placed.x, placed.y));
      placed
    }
    Some((x, y)) => keep_inside(Rect { x, y, width, height }, &area),
  };
  show_menu_window(&app, &window, &rect);
  rect_json(&rect)
}

#[tauri::command]
fn menu_command(app: AppHandle, window: WebviewWindow, id: Option<String>) {
  let id = id.unwrap_or_default();
  let label = window.label().to_string();
  let from_tray = {
    let mut s = st(&app);
    let from_tray = s.tray_menu.as_deref() == Some(label.as_str());
    if from_tray && !id.is_empty() {
      s.tray_command = id.clone();
    }
    from_tray
  };
  if from_tray {
    close_tray_menu(&app);
    return;
  }
  let (owner, is_weather) = {
    let s = st(&app);
    (weather_label_of(&s, &label), s.weather.contains(&label))
  };
  if let (false, Some(owner)) = (id.is_empty(), owner) {
    if owner != label {
      if let Some(win) = app.get_webview_window(&owner) {
        reveal(&win, true);
      }
    }
    emit(&app, &owner, "menu-command", json!(id));
  }
  if !is_weather {
    let _ = window.destroy();
  }
}

// ---------------------------------------------------------------------------------------

pub fn run() {
  let mut builder = tauri::Builder::default();
  if !allow_multiple() {
    // A second copy would share settings.json and window.json with this one. It leaves at
    // once, and this copy says so: its close button only hides it, so it may look gone.
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(main) = st(app).main.clone() {
        emit(app, &main, "second-instance", Value::Null);
      }
    }));
  }
  let app = builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
    .manage::<Shared>(Mutex::new(State::default()))
    .invoke_handler(tauri::generate_handler![
      window_resize,
      window_move,
      window_bounds,
      screen_info,
      window_control,
      new_window,
      window_boot,
      remove_window,
      weather_window_count,
      shown_city,
      confirm_quit,
      read_settings,
      write_settings,
      set_open_at_login,
      open_file,
      save_file,
      read_file,
      write_file,
      pick_image,
      list_fonts,
      fetch_url,
      open_external,
      clipboard_write,
      clipboard_read,
      message_box,
      print,
      take_print_html,
      close_self,
      begin_popup,
      wait_popup,
      take_popup_spec,
      finish_popup,
      end_popup,
      update_popup,
      refresh_popup,
      popup_immediate,
      broadcast_theme,
      broadcast_wallpaper,
      show_menu,
      take_menu_spec,
      fit_menu,
      fit_tray_menu,
      menu_command,
    ])
    .setup(|app| {
      let handle = app.handle().clone();
      let (dir, own_webview) = config_dir(&handle);
      let _ = std::fs::create_dir_all(&dir);
      {
        let mut s = st(&handle);
        s.webview_dir = own_webview.then(|| dir.join("webview"));
        s.dir = dir;
      }
      #[cfg(target_os = "macos")]
      app.set_activation_policy(tauri::ActivationPolicy::Accessory);
      let settings = read_json(&settings_file(&st(&handle)));
      apply_open_at_login(&handle, settings.get("openAtLogin").and_then(Value::as_bool).unwrap_or(false));
      if let Err(error) = create_tray(&handle) {
        eprintln!("MyWeather: the tray icon could not be created: {error}");
      }
      #[cfg(windows)]
      promote_tray_icon(&handle);
      open_configured_windows(&handle);
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("MyWeather could not start");
  app.run(|app, event| match event {
    // Hiding the last window is not quitting: the tray icon stays.
    RunEvent::ExitRequested { api, code, .. } => {
      if code.is_none() && !st(app).quitting {
        api.prevent_exit();
      }
    }
    RunEvent::Exit => {
      if !st(app).quitting {
        save_window_placement(app, false);
      }
    }
    _ => {}
  });
}
