//! MyClock — Tauri 셸 (Electron 판 electron/main.js 의 이식).
//!
//! 창 구성 (MyClockWinV10 의 WPF 창과 1:1 대응)
//!   clock      — MainWindow            : 테두리 없는 투명 탁상시계
//!   panel-N    — SidePanelWindow       : 시계 좌/우에 붙는 400px 설정 패널
//!   alarm-N    — AlarmNotificationWindow: 알람·타이머 팝업
//!   full-N     — ScreensaverWindow      : 전체 화면 시계 (Windows .scr 대체)
//!   zone-N     — 추가 시계들            : 시간대·테마·모양을 저마다 따로 갖는 시계 창
//!   clockset-N — 추가 시계의 설정 창
//!   tool-N     — 분리한 탭 창들         : 알람·타이머·스톱워치·캘린더·세계 시간
//!   menu-N     — 컨텍스트 메뉴 창,  about-N — 프로그램 정보 창
//!
//! 설정만 시계마다 따로 간다. 알람·타이머·스톱워치·일정은 메인 시계 창이 하나로
//! 들고 있고, 패널이든 분리한 창이든 같은 상태를 보고 같은 명령을 보낸다.
//!
//! 렌더러(src/)는 src/js/bridge.js 의 window.myclock 하나로만 이 셸과 이야기한다.
//! 명령은 아래 #[tauri::command] 들이고, 알림은 post() 로 창 하나에 보낸다.
//!
//! 잠금 규칙: 공유 상태(State)를 잡은 채로 창을 보이거나 숨기거나 옮기거나 만들지 않는다.
//! 그런 호출은 같은 잠금을 잡는 창 이벤트를 곧바로 부를 수 있다.
//! 창을 만드는 일은 메인 스레드가 아닌 곳에서 한다 (메인 스레드에서 만들면 Windows 에서 멈춘다).

mod geometry;
mod menu_icons;
mod store;

use geometry::{Display, Placement, Rect};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime};
use store::{jnum, Store};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, IconMenuItem, IsMenuItem, Menu, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, EventTarget, Manager, Monitor, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry};

const APP_NAME: &str = "MyClock";
const STARTUP_ARG: &str = "--autostart";
const TRAY_ID: &str = "myclock";
const CLOCK: &str = "clock";

// 설정 창 — 갈래 탭으로 나눠 스크롤 없이 한 화면에 담기는 크기.
// 내용이 더 필요하면 패널이 재서 알려 준다 (panel_fit).
const PANEL_WIDTH: f64 = 400.0;
const PANEL_HEIGHT: f64 = 600.0;
// 분리한 기능 창 (알람·타이머·캘린더…) — 목록이 길어 세로로 긴 편이 낫다.
const TOOL_WIDTH: f64 = 420.0;
const TOOL_HEIGHT: f64 = 620.0;
const DIGITAL_MIN_WIDTH: f64 = 140.0;
const DIGITAL_MIN_HEIGHT: f64 = 50.0;
const DIGITAL_AMPM_ROW: f64 = 28.0;
const ANALOG_MIN_WIDTH: f64 = 150.0;
const ANALOG_MIN_HEIGHT: f64 = 150.0;

/// 창을 끌어 옮기는 동안 설정 파일을 매번 쓰지 않도록 이만큼 멈추면 저장한다.
const SAVE_DELAY: Duration = Duration::from_millis(400);
/// 메뉴는 포커스를 잃으면 닫힌다. 다만 막 뜨는 순간에는 닫지 않는다.
const BLUR_GRACE: Duration = Duration::from_millis(80);
/// 끌기 안전장치 — 커서가 이만큼 멈춰 있거나, 이만큼 오래 이어지면 끌기를 끝낸다.
const GESTURE_IDLE: Duration = Duration::from_millis(1200);
const GESTURE_MAX: Duration = Duration::from_millis(15000);
const GESTURE_STEP: Duration = Duration::from_millis(12);

/// 모든 창이 같은 WebView2 인자를 써야 한다 (다르면 두 번째 창을 만들지 못한다).
///
/// 시계 창은 트레이로 숨긴 동안에도 알람·타이머를 재야 한다. 숨긴 창의 타이머를
/// 늦추거나(IntensiveWakeUpThrottling) 가려진 창을 쉬게 하면 알람이 1분까지 늦는다.
/// 앞 세 기능은 Tauri 의 기본값이다.
#[cfg(windows)]
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

const TOOL_TITLES: [(&str, &str); 6] =
  [("world", "세계 시간"), ("alarm", "알람"), ("timer", "타이머"), ("stopwatch", "스톱워치"), ("calendar", "캘린더"), ("settings", "설정")];

fn tool_title(tab: &str) -> Option<&'static str> {
  TOOL_TITLES.iter().find(|(t, _)| *t == tab).map(|(_, title)| *title)
}

type Task = Box<dyn FnOnce(&AppHandle) + Send>;

#[derive(Default, Clone, Copy)]
struct Recover {
  remount: bool,
  force_show: bool,
  repaint: bool,
}

struct State {
  store: Option<Store>,
  webview_dir: Option<PathBuf>,
  fake_startup: Option<bool>,
  quitting: bool,
  start_in_tray: bool,
  seq: u64,

  // 사용자가 트레이로 숨긴 경우에만 true. 노트북 덮개·절전으로 창이 사라진 것과 구분한다.
  hidden_by_user: bool,
  last_hide_wall: Option<SystemTime>,
  last_display_change_at: Option<Instant>,
  display_recovering: bool,
  pending_recover: Recover,
  last_surface_refresh: Option<Instant>,
  boot_armed: bool,

  clock_placement: Option<Placement>,
  /// 프로그램이 창을 옮기는 동안에는 그 움직임을 사용자의 배치로 적지 않는다.
  quiet_until: Option<Instant>,

  panel: Option<String>,
  panel_opens_right: bool,
  panel_pending_tab: Option<String>,
  /// 설정 패널이 재서 알려 준 크기 — 내용이 잘리지 않을 만큼.
  panel_fit: Option<(f64, f64)>,

  /// 추가 시계 — 시계 id → 창 이름, 창 이름 → 시계 id
  zone_of_clock: HashMap<String, String>,
  clock_of_zone: HashMap<String, String>,
  /// 아직 파일에 쓰지 않은 추가 시계 위치. 종료 직전에 남김없이 저장한다.
  zone_pending_bounds: HashMap<String, Rect>,
  /// 추가 시계의 설정 창 — 시계 id → 창 이름
  clock_settings: HashMap<String, String>,
  /// 분리한 탭 창 — 탭 이름 → 창 이름
  tools: HashMap<String, String>,

  menu: Option<String>,
  /// 컨텍스트 메뉴를 연 창 — 고른 항목을 그 창에 돌려준다.
  menu_opener: Option<String>,
  menu_anchor: (f64, f64),
  menu_blur_ok: bool,
  alarm: Option<String>,
  about: Option<String>,
  full: Option<String>,
  full_anchor: (f64, f64),
  full_fitted: Option<(f64, f64)>,
  /// 전체 화면으로 들어가며 숨긴 시계 — 돌아올 때 이 창만 다시 보인다.
  hidden_for_fullscreen: HashSet<String>,

  min_sizes: HashMap<String, (f64, f64)>,
  shown_once: HashSet<String>,
  /// 창마다 듣고 있는 알림 / 아직 듣지 않아 쌓아 둔 알림
  listening: HashMap<String, HashSet<String>>,
  queued: HashMap<String, HashMap<String, VecDeque<Value>>>,
  /// 미뤄 둔 일 — 이름 → (때, 할 일). 같은 이름으로 다시 걸면 앞의 것은 버린다.
  timers: HashMap<String, (Instant, Task)>,

  gesture: u64,
  gesture_label: Option<String>,
  tray_cities: Vec<Value>,
}

impl Default for State {
  fn default() -> Self {
    Self {
      store: None,
      webview_dir: None,
      fake_startup: None,
      quitting: false,
      start_in_tray: false,
      seq: 0,
      hidden_by_user: false,
      last_hide_wall: None,
      last_display_change_at: None,
      display_recovering: false,
      pending_recover: Recover::default(),
      last_surface_refresh: None,
      boot_armed: false,
      clock_placement: None,
      quiet_until: None,
      panel: None,
      panel_opens_right: true,
      panel_pending_tab: None,
      panel_fit: None,
      zone_of_clock: HashMap::new(),
      clock_of_zone: HashMap::new(),
      zone_pending_bounds: HashMap::new(),
      clock_settings: HashMap::new(),
      tools: HashMap::new(),
      menu: None,
      menu_opener: None,
      menu_anchor: (0.0, 0.0),
      menu_blur_ok: false,
      alarm: None,
      about: None,
      full: None,
      full_anchor: (0.0, 0.0),
      full_fitted: None,
      hidden_for_fullscreen: HashSet::new(),
      min_sizes: HashMap::new(),
      shown_once: HashSet::new(),
      listening: HashMap::new(),
      queued: HashMap::new(),
      timers: HashMap::new(),
      gesture: 0,
      gesture_label: None,
      tray_cities: Vec::new(),
    }
  }
}

type Shared = Mutex<State>;

thread_local! {
  /// 이 스레드가 지금 State 잠금을 쥐고 있는가 — 같은 스레드가 다시 잡으면 조용히 멈추므로 잡아낸다.
  static HOLDING: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// State 잠금. 놓을 때 HOLDING 을 되돌린다.
struct StateGuard<'a>(MutexGuard<'a, State>);

impl std::ops::Deref for StateGuard<'_> {
  type Target = State;
  fn deref(&self) -> &State {
    &self.0
  }
}

impl std::ops::DerefMut for StateGuard<'_> {
  fn deref_mut(&mut self) -> &mut State {
    &mut self.0
  }
}

impl Drop for StateGuard<'_> {
  fn drop(&mut self) {
    HOLDING.with(|h| h.set(false));
  }
}

/// 공유 상태. 잡은 채로 st() 를 또 부르면 (같은 식 안의 `st(app).a || f(app)` 처럼) 멈추는 대신
/// 개발 빌드에서는 곧바로 알려 준다.
fn st(app: &AppHandle) -> StateGuard<'_> {
  if HOLDING.with(|h| h.get()) {
    debug_assert!(false, "MyClock: State 잠금을 같은 스레드에서 다시 잡았다 (교착)");
  }
  let guard = app.state::<Shared>().inner().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  HOLDING.with(|h| h.set(true));
  StateGuard(guard)
}

/// 설정 파일을 읽고-합치고-쓰는 동안 다른 저장이 끼어들지 않게 한다.
static STORE_LOCK: Mutex<()> = Mutex::new(());

fn store(app: &AppHandle) -> Store {
  st(app).store.clone().expect("store is set in setup")
}

fn load_settings(app: &AppHandle) -> Value {
  store(app).load_settings()
}

fn save_settings(app: &AppHandle, patch: Value) -> Value {
  let store = store(app);
  let _guard = STORE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
  store.save_settings(&patch)
}

fn quitting(app: &AppHandle) -> bool {
  st(app).quitting
}

fn next_label(app: &AppHandle, prefix: &str) -> String {
  let mut s = st(app);
  s.seq += 1;
  format!("{prefix}-{}", s.seq)
}

fn win(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
  app.get_webview_window(label)
}

fn win_opt(app: &AppHandle, label: Option<String>) -> Option<WebviewWindow> {
  label.and_then(|l| app.get_webview_window(&l))
}

fn clock_win(app: &AppHandle) -> Option<WebviewWindow> {
  win(app, CLOCK)
}

fn is_visible(w: &WebviewWindow) -> bool {
  w.is_visible().unwrap_or(false)
}

fn is_minimized(w: &WebviewWindow) -> bool {
  w.is_minimized().unwrap_or(false)
}

fn s_str<'a>(v: &'a Value, key: &str) -> &'a str {
  v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn f(v: &Value, key: &str) -> Option<f64> {
  v.get(key).and_then(Value::as_f64).filter(|n| n.is_finite())
}

fn rect_json(r: &Rect) -> Value {
  json!({ "x": jnum(r.x), "y": jnum(r.y), "width": jnum(r.width), "height": jnum(r.height) })
}

/// 무거운 일이나 창을 만드는 일은 메인 스레드 밖에서 한다.
fn bg(app: &AppHandle, work: impl FnOnce(&AppHandle) + Send + 'static) {
  let app = app.clone();
  std::thread::spawn(move || work(&app));
}

/// `delay` 뒤에 한 번 한다. 같은 이름으로 다시 걸면 앞의 것은 버린다 (몰아서 하기).
fn schedule(app: &AppHandle, key: &str, delay: Duration, work: impl FnOnce(&AppHandle) + Send + 'static) {
  st(app).timers.insert(key.to_string(), (Instant::now() + delay, Box::new(work)));
}

fn cancel(app: &AppHandle, key: &str) {
  st(app).timers.remove(key);
}

/// 이름이 겹치지 않는 미룬 일 (Electron 판의 later()).
fn later(app: &AppHandle, delay: Duration, work: impl FnOnce(&AppHandle) + Send + 'static) {
  let key = format!("later-{}", next_label(app, "t"));
  schedule(app, &key, delay, move |app| {
    if !quitting(app) {
      work(app);
    }
  });
}

// ── 알림 (메인 → 창) ───────────────────────────────────────────────────
//
// Electron 은 ready-to-show 뒤에 보내면 페이지가 이미 듣고 있었다. 여기서는 창이 아직
// 듣기 전이면 쌓아 두었다가, 페이지가 듣기 시작할 때(bridge_listen) 한꺼번에 넘긴다.

fn post(app: &AppHandle, label: &str, event: &str, payload: Value) {
  let deliver = {
    let mut s = st(app);
    if s.listening.get(label).is_some_and(|set| set.contains(event)) {
      true
    } else {
      let queue = s.queued.entry(label.to_string()).or_default().entry(event.to_string()).or_default();
      if queue.len() >= 64 {
        queue.pop_front();
      }
      queue.push_back(payload.clone());
      false
    }
  };
  if deliver {
    let _ = app.emit_to(EventTarget::WebviewWindow { label: label.to_string() }, event, payload);
  }
}

fn forget_window(app: &AppHandle, label: &str) {
  let mut s = st(app);
  s.listening.remove(label);
  s.queued.remove(label);
  s.min_sizes.remove(label);
  s.shown_once.remove(label);
  s.hidden_for_fullscreen.remove(label);
}

// ── 화면 ────────────────────────────────────────────────────────────────

/// 화면 하나 — 논리 좌표의 Display 와, 물리 좌표로 되돌릴 때 쓰는 배율·원점.
#[derive(Clone, Copy, Debug)]
struct Screen {
  display: Display,
  scale: f64,
  px: f64,
  py: f64,
  pw: f64,
  ph: f64,
}

/// 다시 실행해도 같은 화면이면 같은 번호 (화면 이름의 FNV-1a 해시).
fn display_id(monitor: &Monitor) -> f64 {
  let key = monitor.name().cloned().unwrap_or_else(|| format!("{},{}", monitor.position().x, monitor.position().y));
  let mut hash: u32 = 0x811c_9dc5;
  for byte in key.bytes() {
    hash ^= byte as u32;
    hash = hash.wrapping_mul(0x0100_0193);
  }
  hash as f64
}

fn screen_of(monitor: &Monitor) -> Screen {
  let scale = monitor.scale_factor();
  let (px, py) = (monitor.position().x as f64, monitor.position().y as f64);
  let (pw, ph) = (monitor.size().width as f64, monitor.size().height as f64);
  let area = monitor.work_area();
  let lx = px / scale;
  let ly = py / scale;
  Screen {
    display: Display {
      id: display_id(monitor),
      bounds: Rect::new(lx, ly, pw / scale, ph / scale),
      work_area: Rect::new(
        lx + (area.position.x as f64 - px) / scale,
        ly + (area.position.y as f64 - py) / scale,
        area.size.width as f64 / scale,
        area.size.height as f64 / scale,
      ),
    },
    scale,
    px,
    py,
    pw,
    ph,
  }
}

/// 연결된 화면들, 주 화면이 맨 앞.
fn screens(app: &AppHandle) -> Vec<Screen> {
  let primary = app.primary_monitor().ok().flatten();
  let all = app.available_monitors().unwrap_or_default();
  let mut out: Vec<Screen> = Vec::new();
  for monitor in primary.iter().chain(all.iter()) {
    let screen = screen_of(monitor);
    if !out.iter().any(|o| o.px == screen.px && o.py == screen.py) {
      out.push(screen);
    }
  }
  out
}

fn displays(app: &AppHandle) -> Vec<Display> {
  screens(app).into_iter().map(|s| s.display).collect()
}

fn primary_area(app: &AppHandle) -> Rect {
  displays(app).first().map(|d| d.work_area).unwrap_or(Rect::new(0.0, 0.0, 1920.0, 1040.0))
}

fn screen_for_physical(list: &[Screen], x: f64, y: f64) -> Option<Screen> {
  list
    .iter()
    .find(|s| x >= s.px && x < s.px + s.pw && y >= s.py && y < s.py + s.ph)
    .or_else(|| {
      list.iter().min_by(|a, b| {
        let d = |s: &Screen| {
          let dx = (s.px - x).max(0.0).max(x - (s.px + s.pw));
          let dy = (s.py - y).max(0.0).max(y - (s.py + s.ph));
          dx * dx + dy * dy
        };
        d(a).total_cmp(&d(b))
      })
    })
    .copied()
}

fn to_logical_point(list: &[Screen], x: f64, y: f64) -> (f64, f64) {
  match screen_for_physical(list, x, y) {
    Some(s) => (s.display.bounds.x + (x - s.px) / s.scale, s.display.bounds.y + (y - s.py) / s.scale),
    None => (x, y),
  }
}

/// 커서 위치 (논리 좌표).
fn cursor_point(app: &AppHandle) -> (f64, f64) {
  let p = app.cursor_position().unwrap_or(PhysicalPosition::new(0.0, 0.0));
  to_logical_point(&screens(app), p.x, p.y)
}

/// 창의 내용 영역 (논리 좌표). Electron 의 getBounds 와 같은 뜻.
fn bounds(app: &AppHandle, w: &WebviewWindow) -> Option<Rect> {
  let list = screens(app);
  let pos = w.inner_position().ok()?;
  let size = w.inner_size().ok()?;
  let (cx, cy) = (pos.x as f64 + size.width as f64 / 2.0, pos.y as f64 + size.height as f64 / 2.0);
  let scale = screen_for_physical(&list, cx, cy).map(|s| s.scale).unwrap_or(1.0);
  let (x, y) = to_logical_point(&list, pos.x as f64, pos.y as f64);
  Some(Rect::new(x, y, size.width as f64 / scale, size.height as f64 / scale).rounded())
}

/// 창을 논리 좌표 상자로 옮긴다. 테두리(바깥 크기와 안쪽 크기의 차이)를 빼고 놓는다.
fn set_bounds_raw(app: &AppHandle, w: &WebviewWindow, r: &Rect) {
  let list = screens(app);
  let ds: Vec<Display> = list.iter().map(|s| s.display).collect();
  let screen = geometry::display_matching(&ds, r).and_then(|d| list.iter().find(|s| s.display.id == d.id && s.display.bounds == d.bounds)).copied();
  let (scale, px, py) = match screen {
    Some(s) => (s.scale, s.px + (r.x - s.display.bounds.x) * s.scale, s.py + (r.y - s.display.bounds.y) * s.scale),
    None => (1.0, r.x, r.y),
  };
  let (dx, dy) = match (w.inner_position(), w.outer_position()) {
    (Ok(inner), Ok(outer)) => ((inner.x - outer.x) as f64, (inner.y - outer.y) as f64),
    _ => (0.0, 0.0),
  };
  let _ = w.set_size(PhysicalSize::new((r.width * scale).round().max(1.0) as u32, (r.height * scale).round().max(1.0) as u32));
  let _ = w.set_position(PhysicalPosition::new((px - dx).round() as i32, (py - dy).round() as i32));
}

/// 프로그램이 옮기는 것 — 이 움직임은 사용자의 배치로 기억하지 않는다.
fn set_bounds(app: &AppHandle, w: &WebviewWindow, r: &Rect) {
  st(app).quiet_until = Some(Instant::now() + Duration::from_millis(300));
  set_bounds_raw(app, w, r);
}

fn quiet(app: &AppHandle) -> bool {
  st(app).quiet_until.is_some_and(|until| Instant::now() < until)
}

fn min_size_of(app: &AppHandle, label: &str) -> (f64, f64) {
  st(app).min_sizes.get(label).copied().unwrap_or((DIGITAL_MIN_WIDTH, DIGITAL_MIN_HEIGHT))
}

fn set_min_size(app: &AppHandle, w: &WebviewWindow, size: (f64, f64)) {
  st(app).min_sizes.insert(w.label().to_string(), size);
  let _ = w.set_min_size(Some(tauri::LogicalSize::new(size.0, size.1)));
}

/// 창을 다른 창들 위로 올린다 (Electron 의 moveTop). 포커스는 빼앗지 않는다.
fn raise(w: &WebviewWindow) {
  #[cfg(windows)]
  {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOP, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE};
    if let Ok(hwnd) = w.hwnd() {
      let after = if w.is_always_on_top().unwrap_or(false) { HWND_TOPMOST } else { HWND_TOP };
      unsafe {
        SetWindowPos(hwnd.0 as _, after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      }
    }
  }
  #[cfg(not(windows))]
  {
    // 맨 위 창들끼리는 마지막으로 맨 위가 된 창이 위다.
    if w.is_always_on_top().unwrap_or(false) {
      let _ = w.set_always_on_top(false);
      let _ = w.set_always_on_top(true);
    }
  }
}

/// 작업 표시줄에 버튼을 남기지 않는 트레이 전용 앱이다 — 보일 때마다 다시 못 박는다.
fn show(w: &WebviewWindow, focus: bool) {
  if is_minimized(w) {
    let _ = w.unminimize();
  }
  let _ = w.show();
  let _ = w.set_skip_taskbar(true);
  if focus {
    let _ = w.set_focus();
  }
}

// ── 창 만들기 ───────────────────────────────────────────────────────────

struct Spec {
  label: String,
  page: String,
  title: String,
  bounds: Rect,
  min: Option<(f64, f64)>,
  transparent: bool,
  resizable: bool,
  on_top: bool,
  focused: bool,
}

#[cfg(windows)]
fn browser_args() -> String {
  // MYCLOCK_DEBUG_PORT 를 주면 DevTools 프로토콜을 열어 검사가 진짜 창을 몰 수 있다.
  match std::env::var("MYCLOCK_DEBUG_PORT").ok().and_then(|p| p.trim().parse::<u16>().ok()) {
    Some(port) => format!("{BROWSER_ARGS} --remote-debugging-port={port}"),
    None => BROWSER_ARGS.to_string(),
  }
}

fn build_window(app: &AppHandle, spec: Spec) -> tauri::Result<WebviewWindow> {
  let mut builder = WebviewWindowBuilder::new(app, &spec.label, WebviewUrl::App(spec.page.into()))
    .title(&spec.title)
    .inner_size(spec.bounds.width, spec.bounds.height)
    .position(spec.bounds.x, spec.bounds.y)
    .decorations(false)
    .transparent(spec.transparent)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(spec.on_top)
    .resizable(spec.resizable)
    .maximizable(spec.resizable)
    .visible(false)
    .focused(spec.focused)
    .zoom_hotkeys_enabled(false)
    .on_page_load(|w, payload| {
      let app = w.app_handle().clone();
      let label = w.label().to_string();
      match payload.event() {
        // 페이지를 다시 읽으면 듣던 알림을 처음부터 다시 듣는다.
        PageLoadEvent::Started => {
          st(&app).listening.remove(&label);
        }
        PageLoadEvent::Finished => on_loaded(&app, &label),
      }
    });
  if !spec.transparent {
    builder = builder.background_color(tauri::window::Color(0x1E, 0x1E, 0x2E, 0xFF));
  }
  if let Some((w, h)) = spec.min {
    builder = builder.min_inner_size(w, h);
  }
  if let Some(dir) = st(app).webview_dir.clone() {
    builder = builder.data_directory(dir);
  }
  #[cfg(windows)]
  {
    builder = builder.additional_browser_args(&browser_args());
  }
  let label = spec.label.clone();
  if let Some(min) = spec.min {
    st(app).min_sizes.insert(label.clone(), min);
  }
  let w = builder.build()?;
  // 배율이 다른 화면에서도 논리 좌표가 맞도록 한 번 더 놓는다.
  set_bounds(app, &w, &spec.bounds);
  let handle = app.clone();
  w.on_window_event(move |event| on_window_event(&handle, &label, event));
  Ok(w)
}

/// 페이지를 다 읽었을 때 — Electron 의 ready-to-show.
fn on_loaded(app: &AppHandle, label: &str) {
  let first = st(app).shown_once.insert(label.to_string());
  if !first {
    return;
  }
  let Some(w) = win(app, label) else { return };
  let fullscreen = is_fullscreen_open(app);
  if label == CLOCK {
    {
      let mut s = st(app);
      if s.start_in_tray {
        return;
      }
      s.hidden_by_user = false;
    }
    if fullscreen {
      st(app).hidden_for_fullscreen.insert(label.to_string());
      return;
    }
    show(&w, false);
    if st(app).clock_placement.is_none() {
      let placement = bounds(app, &w).and_then(|b| geometry::capture_placement(&displays(app), &b));
      st(app).clock_placement = placement;
    }
    raise_highest_clocks(app);
    arm_boot_surface_refresh(app);
  } else if label.starts_with("zone-") {
    if fullscreen {
      st(app).hidden_for_fullscreen.insert(label.to_string());
      return;
    }
    if st(app).hidden_by_user {
      return;
    }
    show(&w, false);
    raise_highest_clocks(app);
  } else if label.starts_with("panel-") {
    show(&w, false);
    let (right, tab) = {
      let s = st(app);
      (s.panel_opens_right, s.panel_pending_tab.clone())
    };
    post(app, label, "panel:side", json!(right));
    if let Some(tab) = tab {
      post(app, label, "panel:tab", json!(tab));
    }
    post(app, CLOCK, "panel:opened", json!(true));
    raise_over_fullscreen(app, &w);
  } else if label.starts_with("full-") {
    pin_fullscreen(app, true);
    // 시계 상자를 재기 전에는 화면만 한 창이다. 그 사이 클릭은 바탕으로 통과시킨다.
    let _ = w.set_ignore_cursor_events(true);
    hide_clocks_for_fullscreen(app);
    show(&w, false);
    raise_fullscreen_overlays(app);
    refresh_tray_menu(app);
    // 창을 보인 직후 OS 가 크기를 되돌리는 경우가 있어 한 번 더 맞춘다.
    later(app, Duration::from_millis(200), |app| pin_fullscreen(app, true));
  } else if label.starts_with("menu-") {
    // 메뉴는 내용을 잰 뒤(menu_ready) 보인다.
  } else if label.starts_with("alarm-") {
    show(&w, true);
    raise(&w);
    raise_over_fullscreen(app, &w);
  } else {
    // 기능 창·시계별 설정 창·정보 창
    show(&w, true);
    raise_over_fullscreen(app, &w);
  }
}

fn on_window_event(app: &AppHandle, label: &str, event: &WindowEvent) {
  match event {
    WindowEvent::Moved(_) | WindowEvent::Resized(_) => on_geometry(app, label),
    WindowEvent::Focused(true) => keep_highest_on_top(app, label),
    WindowEvent::Focused(false) => {
      // 창이 포커스를 잃으면 끌기도 끝난 것이다.
      if st(app).gesture_label.as_deref() == Some(label) {
        stop_gesture(app);
      }
      let close_menu = {
        let s = st(app);
        s.menu.as_deref() == Some(label) && s.menu_blur_ok
      };
      if close_menu {
        close_menu_window(app);
      }
    }
    WindowEvent::CloseRequested { api, .. } => {
      // 시계 창을 닫으면 트레이로 숨긴다 (WPF 판과 같다).
      if label == CLOCK && !quitting(app) {
        api.prevent_close();
        bg(app, hide_to_tray);
      }
    }
    WindowEvent::Destroyed => on_destroyed(app, label),
    _ => {}
  }
}

fn on_geometry(app: &AppHandle, label: &str) {
  let Some(w) = win(app, label) else { return };
  if label == CLOCK {
    // WPF 판과 같이 최소화 = 트레이로 숨기기. 작업 표시줄에 최소화된 창을 남기지 않는다.
    if is_minimized(&w) {
      on_clock_minimized(app);
      return;
    }
    if !quiet(app) {
      remember_clock_placement(app);
    }
    position_panel(app);
    if let Some(b) = bounds(app, &w) {
      post(app, CLOCK, "clock:bounds", rect_json(&b));
    }
    return;
  }
  // if let 의 오른쪽 잠금은 본문 끝까지 살아 있다 — 먼저 꺼내 두고 놓는다.
  let zone_id = st(app).clock_of_zone.get(label).cloned();
  if let Some(id) = zone_id {
    if quiet(app) || is_minimized(&w) || !is_visible(&w) {
      return;
    }
    if let Some(b) = bounds(app, &w) {
      schedule_extra_clock_save(app, &id, b);
    }
  } else if label.starts_with("tool-") {
    if is_minimized(&w) || !is_visible(&w) {
      return;
    }
    let tab = st(app).tools.iter().find(|(_, l)| l.as_str() == label).map(|(t, _)| t.clone());
    if let (Some(tab), Some(b)) = (tab, bounds(app, &w)) {
      schedule(app, &format!("tool-save:{tab}"), SAVE_DELAY, move |app| {
        let mut tool_windows = load_settings(app)["toolWindows"].clone();
        tool_windows[tab.as_str()] = rect_json(&b);
        save_settings(app, json!({ "toolWindows": tool_windows }));
      });
    }
  }
}

fn on_destroyed(app: &AppHandle, label: &str) {
  forget_window(app, label);
  if label.starts_with("zone-") {
    let mut s = st(app);
    if let Some(id) = s.clock_of_zone.remove(label) {
      s.zone_of_clock.remove(&id);
    }
  } else if label.starts_with("panel-") {
    let mine = {
      let mut s = st(app);
      let mine = s.panel.as_deref() == Some(label);
      if mine {
        s.panel = None;
      }
      mine
    };
    if mine {
      post(app, CLOCK, "panel:opened", json!(false));
    }
  } else if label.starts_with("clockset-") {
    st(app).clock_settings.retain(|_, l| l != label);
  } else if label.starts_with("tool-") {
    st(app).tools.retain(|_, l| l != label);
  } else if label.starts_with("menu-") {
    let opener = {
      let mut s = st(app);
      if s.menu.as_deref() == Some(label) {
        s.menu = None;
        s.menu_blur_ok = false;
      }
      s.menu_opener.clone()
    };
    let target = opener.filter(|l| win(app, l).is_some()).unwrap_or_else(|| CLOCK.into());
    post(app, &target, "menu:closed", Value::Null);
  } else if label.starts_with("alarm-") {
    let mut s = st(app);
    if s.alarm.as_deref() == Some(label) {
      s.alarm = None;
    }
  } else if label.starts_with("about-") {
    let mut s = st(app);
    if s.about.as_deref() == Some(label) {
      s.about = None;
    }
  } else if label.starts_with("full-") {
    let mine = {
      let mut s = st(app);
      let mine = s.full.as_deref() == Some(label);
      if mine {
        s.full = None;
        s.full_fitted = None;
      }
      mine
    };
    if mine {
      unbind_fullscreen_escape(app);
      bg(app, |app| {
        show_clocks_after_fullscreen(app);
        restore_overlays_after_fullscreen(app);
        refresh_tray_menu(app);
      });
    }
  }
}

// ── 시계 창 ─────────────────────────────────────────────────────────────

fn min_size_for(settings: &Value) -> (f64, f64) {
  if settings["isDigital"] == false {
    return (ANALOG_MIN_WIDTH, ANALOG_MIN_HEIGHT);
  }
  let style = s_str(settings, "digitalStyle");
  let canvas_style = style == "SevenSegment" || style == "DotMatrix";
  let extra = if settings["use24h"] != true && canvas_style { DIGITAL_AMPM_ROW } else { 0.0 };
  (DIGITAL_MIN_WIDTH, DIGITAL_MIN_HEIGHT + extra)
}

fn placement_from_settings(settings: &Value) -> Option<Placement> {
  let rx = f(settings, "windowRelX")?;
  let ry = f(settings, "windowRelY")?;
  Some(Placement {
    display_id: f(settings, "windowRelDisplayId"),
    rx,
    ry,
    width: f(settings, "windowWidth").unwrap_or(300.0).round(),
    height: f(settings, "windowHeight").unwrap_or(300.0).round(),
  })
}

fn persist_placement(app: &AppHandle, placement: Option<Placement>) {
  let Some(p) = placement else { return };
  save_settings(
    app,
    json!({ "windowRelX": p.rx, "windowRelY": p.ry, "windowRelDisplayId": p.display_id.map(jnum).unwrap_or(Value::Null) }),
  );
}

fn remember_clock_placement(app: &AppHandle) {
  if st(app).display_recovering {
    return;
  }
  let Some(w) = clock_win(app) else { return };
  if is_minimized(&w) || !is_visible(&w) {
    return;
  }
  let Some(next) = bounds(app, &w).and_then(|b| geometry::capture_placement(&displays(app), &b)) else { return };
  st(app).clock_placement = Some(next);
  schedule(app, "persist-placement", SAVE_DELAY, |app| {
    let placement = st(app).clock_placement;
    persist_placement(app, placement);
  });
}

fn initial_clock_bounds(app: &AppHandle, settings: &Value) -> Rect {
  let width = f(settings, "windowWidth").unwrap_or(300.0).round();
  let height = f(settings, "windowHeight").unwrap_or(300.0).round();
  let ds = displays(app);
  let min = min_size_for(settings);
  if let Some(rel) = placement_from_settings(settings) {
    if let Some(next) = geometry::apply_placement(&ds, &rel, min.0, min.1) {
      st(app).clock_placement = Some(rel);
      return next;
    }
  }
  let (left, top) = (f(settings, "windowLeft"), f(settings, "windowTop"));
  let rect = match (left, top) {
    (Some(x), Some(y)) => geometry::clamp_to_work_area(&ds, Rect::new(x.round(), y.round(), width, height)),
    _ => {
      let area = primary_area(app);
      Rect::new((area.x + area.width - width - 40.0).round(), (area.y + 40.0).round(), width, height)
    }
  };
  st(app).clock_placement = geometry::capture_placement(&ds, &rect);
  rect
}

fn create_clock_window(app: &AppHandle) -> tauri::Result<()> {
  let settings = load_settings(app);
  let rect = initial_clock_bounds(app, &settings);
  let min = min_size_for(&settings);
  let on_top = priority_on_top(s_str(&settings, "displayPriority"), settings["alwaysOnTop"] == true);
  let w = build_window(
    app,
    Spec {
      label: CLOCK.into(),
      page: "index.html".into(),
      title: APP_NAME.into(),
      bounds: rect,
      min: Some(min),
      transparent: true,
      resizable: true,
      on_top,
      focused: false,
    },
  )?;
  set_window_priority(&w, s_str(&settings, "displayPriority"), settings["alwaysOnTop"] == true);
  Ok(())
}

/// 최소화는 트레이로 숨기기다. 다만 덮개 닫힘·디스플레이 전환으로 OS 가 최소화하는 경우는 사용자 숨김이 아니다.
fn on_clock_minimized(app: &AppHandle) {
  schedule(app, "clock-minimized", Duration::from_millis(200), |app| {
    if quitting(app) || clock_win(app).is_none() {
      return;
    }
    let display_change = {
      let s = st(app);
      s.display_recovering || s.last_display_change_at.is_some_and(|at| at.elapsed() < Duration::from_millis(2500))
    };
    if display_change {
      recover_clock_on_screen(app, Recover { remount: true, ..Recover::default() });
    } else {
      hide_to_tray(app);
    }
  });
}

// ── 추가 시계 창 ────────────────────────────────────────────────────────
//
// 시간대·테마·모양을 저마다 따로 갖는 시계들. 설정만 시계별로 나뉘고
// 알람·타이머·스톱워치·캘린더는 앱 전체가 하나로 함께 쓴다.

fn extra_clocks(app: &AppHandle) -> Vec<Value> {
  load_settings(app)["extraClocks"].as_array().cloned().unwrap_or_default()
}

fn extra_clock_config(app: &AppHandle, id: &str) -> Option<Value> {
  extra_clocks(app).into_iter().find(|c| s_str(c, "id") == id)
}

fn zone_win(app: &AppHandle, id: &str) -> Option<WebviewWindow> {
  let label = st(app).zone_of_clock.get(id).cloned();
  win_opt(app, label)
}

fn zone_title(config: &Value) -> String {
  let name = if s_str(config, "city").is_empty() { s_str(config, "zone") } else { s_str(config, "city") };
  format!("{APP_NAME} — {name}")
}

/// 열려 있는 추가 시계 목록이 바뀌었음을 패널·분리 창에 알린다.
fn broadcast_clocks(app: &AppHandle) {
  let list = json!(extra_clocks(app));
  let labels: Vec<String> = {
    let s = st(app);
    s.panel.iter().cloned().chain(s.tools.values().cloned()).chain(s.clock_settings.values().cloned()).collect()
  };
  for label in labels {
    post(app, &label, "clocks:changed", list.clone());
  }
}

fn save_extra_clocks(app: &AppHandle, list: Vec<Value>) {
  save_settings(app, json!({ "extraClocks": list }));
  broadcast_clocks(app);
  // 트레이의 "시계 닫기" 목록도 따라가게 한다.
  refresh_tray_menu(app);
}

fn extra_clock_bounds(app: &AppHandle, config: &Value) -> Rect {
  let width = f(config, "windowWidth").unwrap_or(260.0).round();
  let height = f(config, "windowHeight").unwrap_or(180.0).round();
  let ds = displays(app);
  if let (Some(x), Some(y)) = (f(config, "windowLeft"), f(config, "windowTop")) {
    return geometry::clamp_to_work_area(&ds, Rect::new(x.round(), y.round(), width, height));
  }
  // 처음 열 때는 이미 열려 있는 창들과 겹치지 않도록 계단처럼 어긋나게 둔다.
  let area = primary_area(app);
  let step = 36.0 * (st(app).zone_of_clock.len() as f64 + 1.0);
  geometry::clamp_to_work_area(&ds, Rect::new((area.x + area.width - width - 40.0 - step).round(), (area.y + 40.0 + step).round(), width, height))
}

fn open_extra_clock(app: &AppHandle, config: &Value, focus: bool) {
  let id = s_str(config, "id").to_string();
  if let Some(existing) = zone_win(app, &id) {
    if is_fullscreen_open(app) {
      if is_visible(&existing) {
        st(app).hidden_for_fullscreen.insert(existing.label().to_string());
        let _ = existing.hide();
      }
      return;
    }
    show(&existing, focus);
    return;
  }
  let label = next_label(app, "zone");
  {
    let mut s = st(app);
    s.zone_of_clock.insert(id.clone(), label.clone());
    s.clock_of_zone.insert(label.clone(), id.clone());
  }
  let global_top = load_settings(app)["alwaysOnTop"] == true;
  let priority = s_str(config, "displayPriority").to_string();
  let built = build_window(
    app,
    Spec {
      label: label.clone(),
      page: format!("zoneclock.html?id={}", encode_query(&id)),
      title: zone_title(config),
      bounds: extra_clock_bounds(app, config),
      min: Some((DIGITAL_MIN_WIDTH, DIGITAL_MIN_HEIGHT)),
      transparent: true,
      resizable: true,
      on_top: priority_on_top(&priority, global_top),
      focused: focus,
    },
  );
  match built {
    Ok(w) => set_window_priority(&w, &priority, global_top),
    Err(error) => {
      let mut s = st(app);
      s.zone_of_clock.remove(&id);
      s.clock_of_zone.remove(&label);
      eprintln!("[{APP_NAME}] 추가 시계를 열지 못했습니다: {} ({error})", s_str(config, "city"));
    }
  }
}

fn encode_query(text: &str) -> String {
  text
    .bytes()
    .map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
    .collect()
}

/// 창을 끌어 옮기는 동안 설정 파일을 매번 쓰지 않도록 몰아서 저장한다.
fn schedule_extra_clock_save(app: &AppHandle, id: &str, b: Rect) {
  st(app).zone_pending_bounds.insert(id.to_string(), b);
  schedule(app, "zone-save", SAVE_DELAY, flush_extra_clock_saves);
}

fn flush_extra_clock_saves(app: &AppHandle) {
  cancel(app, "zone-save");
  let pending: HashMap<String, Rect> = std::mem::take(&mut st(app).zone_pending_bounds);
  if pending.is_empty() {
    return;
  }
  let list: Vec<Value> = extra_clocks(app)
    .into_iter()
    .map(|mut clock| {
      if let Some(b) = pending.get(s_str(&clock, "id")) {
        clock["windowLeft"] = jnum(b.x);
        clock["windowTop"] = jnum(b.y);
        clock["windowWidth"] = jnum(b.width);
        clock["windowHeight"] = jnum(b.height);
      }
      clock
    })
    .collect();
  save_settings(app, json!({ "extraClocks": list }));
}

/// 세계 시간 목록에서 고른 도시로 시계를 하나 더 만든다.
fn add_extra_clock(app: &AppHandle, city: &Value) -> Option<Value> {
  let zone = s_str(city, "zone");
  if zone.is_empty() {
    return None;
  }
  let settings = load_settings(app);
  let name = if s_str(city, "city").is_empty() { zone } else { s_str(city, "city") };
  let region = if s_str(city, "region").is_empty() { s_str(city, "country") } else { s_str(city, "region") };
  // 새 시계는 메인 시계의 모양을 그대로 물려받고, 그 뒤로는 따로 간다.
  let mut raw = json!({ "city": name, "region": region, "zone": zone });
  for key in ["theme", "customThemeColor", "customThemeLight", "isDigital", "digitalStyle", "analogStyle", "use24h", "brightness", "digitColor", "amPmColor"] {
    raw[key] = settings[key].clone();
  }
  let config = store::normalize_extra_clock(&raw)?;
  let mut list = settings["extraClocks"].as_array().cloned().unwrap_or_default();
  list.push(config.clone());
  save_extra_clocks(app, list);
  open_extra_clock(app, &config, true);
  Some(config)
}

fn update_extra_clock(app: &AppHandle, id: &str, patch: &Value) -> Option<Value> {
  let mut list = extra_clocks(app);
  let index = list.iter().position(|c| s_str(c, "id") == id)?;
  let mut merged = list[index].clone();
  if let (Some(target), Some(patch)) = (merged.as_object_mut(), patch.as_object()) {
    for (key, value) in patch {
      target.insert(key.clone(), value.clone());
    }
  }
  merged["id"] = json!(id);
  let next = store::normalize_extra_clock(&merged)?;
  list[index] = next.clone();
  save_extra_clocks(app, list);
  if let Some(w) = zone_win(app, id) {
    let _ = w.set_title(&zone_title(&next));
    post(app, w.label(), "clock:config", next.clone());
  }
  if patch.get("displayPriority").is_some() {
    apply_display_priority(app);
  }
  Some(next)
}

/// 시계를 닫는다. 목록에서도 지우므로 다음 실행에 다시 뜨지 않는다.
fn remove_extra_clock(app: &AppHandle, id: &str) {
  close_clock_settings(app, id);
  if let Some(w) = zone_win(app, id) {
    let _ = w.close();
  }
  st(app).zone_pending_bounds.remove(id);
  let list: Vec<Value> = extra_clocks(app).into_iter().filter(|c| s_str(c, "id") != id).collect();
  save_extra_clocks(app, list);
}

/// 추가 시계 하나의 설정 창. 그 시계 옆에 뜨고, 시계를 닫으면 함께 닫힌다.
fn open_clock_settings(app: &AppHandle, id: &str) {
  let Some(config) = extra_clock_config(app, id) else { return };
  let existing = st(app).clock_settings.get(id).cloned();
  if let Some(w) = win_opt(app, existing) {
    show(&w, true);
    return;
  }
  let anchor = zone_win(app, id).and_then(|w| bounds(app, &w));
  let area = primary_area(app);
  let height = PANEL_HEIGHT.min(area.height);
  let rect = geometry::clamp_to_work_area(
    &displays(app),
    Rect::new(
      anchor.map(|a| a.x + a.width + 8.0).unwrap_or(area.x + area.width - PANEL_WIDTH - 60.0).round(),
      anchor.map(|a| a.y).unwrap_or(area.y + 60.0).round(),
      PANEL_WIDTH,
      height,
    ),
  );
  let label = next_label(app, "clockset");
  st(app).clock_settings.insert(id.to_string(), label.clone());
  let global_top = load_settings(app)["alwaysOnTop"] == true;
  let name = if s_str(&config, "city").is_empty() { s_str(&config, "zone") } else { s_str(&config, "city") };
  let built = build_window(
    app,
    Spec {
      label,
      page: format!("panel.html?only=settings&tool=1&clock={}", encode_query(id)),
      title: format!("{APP_NAME} — {name} 설정"),
      bounds: rect,
      min: Some((420.0, 360.0)),
      transparent: false,
      resizable: true,
      on_top: priority_on_top(s_str(&config, "displayPriority"), global_top),
      focused: true,
    },
  );
  if built.is_err() {
    st(app).clock_settings.remove(id);
  }
}

fn close_clock_settings(app: &AppHandle, id: &str) {
  let label = st(app).clock_settings.remove(id);
  if let Some(w) = win_opt(app, label) {
    let _ = w.close();
  }
}

/// 저장해 둔 추가 시계를 모두 연다.
/// 다시 시작하면 닫아 두지 않은 시계가 하나도 빠지지 않아야 한다.
/// 시계 하나를 열다 실패해도 나머지는 계속 연다.
fn present_saved_extra_clocks(app: &AppHandle) {
  if quitting(app) || is_fullscreen_open(app) {
    return;
  }
  for config in extra_clocks(app) {
    open_extra_clock(app, &config, false);
  }
}

// ── 분리한 탭 창 ────────────────────────────────────────────────────────
//
// 알람·타이머·스톱워치·캘린더·세계 시간은 앱이 하나로 들고 있는 기능이다.
// 설정 패널 안에서 탭으로 보거나, 여기서처럼 독립한 창으로 떼어 볼 수 있다.
// 창 내용은 패널과 같은 panel.html 이며 only=<탭> 으로 그 탭만 띄운다.

fn tool_bounds(app: &AppHandle, tab: &str) -> Rect {
  let saved = load_settings(app)["toolWindows"][tab].clone();
  let is_settings = tab == "settings";
  let width = f(&saved, "width").unwrap_or(if is_settings { PANEL_WIDTH } else { TOOL_WIDTH }).round();
  let height = f(&saved, "height").unwrap_or(if is_settings { PANEL_HEIGHT } else { TOOL_HEIGHT }).round();
  let ds = displays(app);
  if let (Some(x), Some(y)) = (f(&saved, "x"), f(&saved, "y")) {
    return geometry::clamp_to_work_area(&ds, Rect::new(x.round(), y.round(), width, height));
  }
  let area = primary_area(app);
  let step = 28.0 * (st(app).tools.len() as f64 + 1.0);
  geometry::clamp_to_work_area(&ds, Rect::new((area.x + area.width / 2.0 - width / 2.0 + step).round(), (area.y + 60.0 + step).round(), width, height))
}

fn open_tool_window(app: &AppHandle, tab: &str) {
  let Some(title) = tool_title(tab) else { return };
  let existing = st(app).tools.get(tab).cloned();
  if let Some(w) = win_opt(app, existing) {
    show(&w, true);
    return;
  }
  let label = next_label(app, "tool");
  st(app).tools.insert(tab.to_string(), label.clone());
  let built = build_window(
    app,
    Spec {
      label,
      page: format!("panel.html?only={tab}&tool=1"),
      title: format!("{APP_NAME} — {title}"),
      bounds: tool_bounds(app, tab),
      min: Some((280.0, 200.0)),
      transparent: false,
      resizable: true,
      on_top: load_settings(app)["alwaysOnTop"] == true,
      focused: true,
    },
  );
  if built.is_err() {
    st(app).tools.remove(tab);
  }
}

// ── 설정 패널 창 ────────────────────────────────────────────────────────

fn panel_win(app: &AppHandle) -> Option<WebviewWindow> {
  let label = st(app).panel.clone();
  win_opt(app, label)
}

fn panel_rect(app: &AppHandle, clock: &Rect, open_right: bool) -> Rect {
  let fit = st(app).panel_fit;
  geometry::panel_bounds_for(&displays(app), clock, open_right, (PANEL_WIDTH, PANEL_HEIGHT), fit)
}

fn determine_open_right(app: &AppHandle, clock: &Rect, prefer_right: bool) -> bool {
  let fit = st(app).panel_fit.map(|(w, _)| w);
  geometry::determine_open_right(&displays(app), clock, prefer_right, PANEL_WIDTH, fit)
}

fn position_panel(app: &AppHandle) {
  let (Some(panel), Some(clock)) = (panel_win(app), clock_win(app)) else { return };
  let Some(cb) = bounds(app, &clock) else { return };
  let prefer = st(app).panel_opens_right;
  let right = determine_open_right(app, &cb, prefer);
  st(app).panel_opens_right = right;
  set_bounds(app, &panel, &panel_rect(app, &cb, right));
  post(app, panel.label(), "panel:side", json!(right));
}

fn open_panel(app: &AppHandle, tab: Option<String>) {
  if let Some(panel) = panel_win(app) {
    show(&panel, false);
    if let Some(tab) = tab {
      post(app, panel.label(), "panel:tab", json!(tab));
    }
    return;
  }
  let Some(clock) = clock_win(app) else { return };
  let Some(cb) = bounds(app, &clock) else { return };
  let prefer = st(app).panel_opens_right;
  let right = determine_open_right(app, &cb, prefer);
  let label = next_label(app, "panel");
  {
    // 패널이 첫 상태를 받아오는 사이에 'panel:tab' 을 보내면 흘릴 수 있다.
    // 열어 달라고 한 탭을 적어 두고 패널이 직접 물어 가게 한다.
    let mut s = st(app);
    s.panel_pending_tab = tab;
    s.panel_opens_right = right;
    s.panel = Some(label.clone());
  }
  // 설정 패널은 설정만 맡는다. 알람·타이머·스톱워치·캘린더·세계 시간은 저마다 창이다.
  let built = build_window(
    app,
    Spec {
      label,
      page: "panel.html?only=settings".into(),
      title: format!("{APP_NAME} 설정"),
      bounds: panel_rect(app, &cb, right),
      min: None,
      transparent: false,
      resizable: false,
      on_top: clock.is_always_on_top().unwrap_or(false),
      focused: false,
    },
  );
  if built.is_err() {
    st(app).panel = None;
  }
}

fn close_panel(app: &AppHandle) {
  if let Some(panel) = panel_win(app) {
    let _ = panel.close();
  }
}

fn toggle_panel(app: &AppHandle, tab: Option<String>) {
  if let Some(panel) = panel_win(app) {
    if let Some(tab) = tab {
      post(app, panel.label(), "panel:tab", json!(tab));
      let _ = panel.set_focus();
      return;
    }
    close_panel(app);
  } else {
    open_panel(app, tab);
  }
}

// ── 프로그램 정보 창 ────────────────────────────────────────────────────

/// ISO 8601 (UTC) — 정보 창이 지역 시각으로 바꿔 보여 준다.
fn iso_time(time: SystemTime) -> Option<String> {
  let secs = time.duration_since(SystemTime::UNIX_EPOCH).ok()?.as_secs() as i64;
  let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
  // Howard Hinnant 의 civil_from_days
  let z = days + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = yoe + era * 400 + i64::from(m <= 2);
  Some(format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z", rem / 3600, rem % 3600 / 60, rem % 60))
}

/// 정보 창에 띄울 버전·빌드 정보.
fn app_info_value(app: &AppHandle) -> Value {
  // 설치본·개발 실행 모두 실행 파일이 만들어진 시각을 빌드 시각으로 본다.
  let build_date = std::env::current_exe().ok().and_then(|exe| std::fs::metadata(exe).ok()).and_then(|m| m.modified().ok()).and_then(iso_time);
  json!({
    "name": APP_NAME,
    "version": app.package_info().version.to_string(),
    "author": "SHKWON",
    "email": "knix008@naver.com",
    "license": "MIT",
    "tauri": tauri::VERSION,
    "webview": tauri::webview_version().unwrap_or_default(),
    "platform": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
    "packaged": !cfg!(debug_assertions),
    "buildDate": build_date,
    "iconSvg": include_str!("../../asset/icon.svg")
  })
}

fn open_about_window(app: &AppHandle) {
  let existing = st(app).about.clone();
  if let Some(w) = win_opt(app, existing) {
    show(&w, true);
    return;
  }
  let area = primary_area(app);
  let (width, height) = (380.0, 560.0);
  let label = next_label(app, "about");
  st(app).about = Some(label.clone());
  let built = build_window(
    app,
    Spec {
      label,
      page: "about.html".into(),
      title: format!("{APP_NAME} 정보"),
      bounds: geometry::center_in(&area, (width, height)),
      min: None,
      transparent: false,
      resizable: false,
      on_top: load_settings(app)["alwaysOnTop"] == true,
      focused: true,
    },
  );
  if built.is_err() {
    st(app).about = None;
  }
}

// ── 알람 팝업 ───────────────────────────────────────────────────────────

fn show_alarm_popup(app: &AppHandle, payload: Value) {
  let old = st(app).alarm.take();
  if let Some(w) = win_opt(app, old) {
    let _ = w.close();
  }
  let area = primary_area(app);
  let (width, height) = (340.0, 190.0);
  let label = next_label(app, "alarm");
  st(app).alarm = Some(label.clone());
  // 페이지가 듣기 시작하면 넘겨진다.
  post(app, &label, "alarm:show", payload);
  let built = build_window(
    app,
    Spec {
      label: label.clone(),
      page: "alarm.html".into(),
      title: APP_NAME.into(),
      bounds: Rect::new((area.x + (area.width - width) / 2.0).round(), (area.y + (area.height - height) / 3.0).round(), width, height),
      min: None,
      transparent: false,
      resizable: false,
      on_top: true,
      focused: true,
    },
  );
  if built.is_err() {
    st(app).alarm = None;
    forget_window(app, &label);
  }
}

// ── 컨텍스트 메뉴 창 ────────────────────────────────────────────────────
//
// 메뉴를 시계 창 안에 그리면 창 크기(작게는 140×50)에 잘린다.
// 별도 창으로 띄워야 창 밖으로 넘칠 수 있다.

fn close_menu_window(app: &AppHandle) {
  let label = {
    let mut s = st(app);
    s.menu_blur_ok = false;
    s.menu.clone()
  };
  if let Some(w) = win_opt(app, label) {
    let _ = w.close();
  }
}

fn open_menu_window(app: &AppHandle, opener: &str, payload: Value) {
  close_menu_window(app);
  let anchor = cursor_point(app);
  let label = next_label(app, "menu");
  {
    let mut s = st(app);
    s.menu = Some(label.clone());
    s.menu_opener = Some(opener.to_string());
    s.menu_anchor = anchor;
    s.menu_blur_ok = false;
  }
  let mut items = if payload.is_object() { payload } else { json!({ "items": [] }) };
  items["anchor"] = json!({ "x": jnum(anchor.0.round()), "y": jnum(anchor.1.round()) });
  post(app, &label, "menu:items", items);
  // 내용 크기를 잰 뒤 menu_ready 에서 실제 크기로 바꾼다.
  let built = build_window(
    app,
    Spec {
      label: label.clone(),
      page: "menu.html".into(),
      title: APP_NAME.into(),
      bounds: Rect::new(anchor.0.round(), anchor.1.round(), 240.0, 200.0),
      min: None,
      transparent: true,
      resizable: false,
      on_top: true,
      focused: true,
    },
  );
  if built.is_err() {
    let mut s = st(app);
    s.menu = None;
    drop(s);
    forget_window(app, &label);
  }
}

/// 메뉴가 잰 크기에 맞춰 창을 커서 옆에 놓고 보여준다 — 화면 밖으로 나가면 반대쪽으로 뒤집는다.
fn place_menu_window(app: &AppHandle, size: &Value) {
  let (label, anchor) = {
    let s = st(app);
    (s.menu.clone(), s.menu_anchor)
  };
  let Some(w) = win_opt(app, label.clone()) else { return };
  let ds = displays(app);
  let area = geometry::display_nearest_point(&ds, anchor.0, anchor.1).map(|d| d.work_area).unwrap_or_else(|| primary_area(app));
  let rect = geometry::place_menu(&area, anchor, (f(size, "width").unwrap_or(240.0), f(size, "height").unwrap_or(200.0)));
  set_bounds(app, &w, &rect);
  show(&w, true);
  raise(&w);
  let label = label.unwrap_or_default();
  schedule(app, &format!("menu-blur:{label}"), BLUR_GRACE, move |app| {
    let mut s = st(app);
    if s.menu.as_deref() == Some(label.as_str()) {
      s.menu_blur_ok = true;
    }
  });
}

// ── 전체 화면 시계 (화면 보호기 대체) ──────────────────────────────────

fn is_fullscreen_open(app: &AppHandle) -> bool {
  let label = st(app).full.clone();
  win_opt(app, label).is_some()
}

fn full_win(app: &AppHandle) -> Option<WebviewWindow> {
  let label = st(app).full.clone();
  win_opt(app, label)
}

/// 커서가 있던 화면의 작업 영역. 작업 표시줄은 창 밖에 두어 트레이를 누를 수 있게 한다.
fn fullscreen_display_area(app: &AppHandle, anchor: (f64, f64)) -> Rect {
  let ds = displays(app);
  geometry::display_nearest_point(&ds, anchor.0, anchor.1).map(|d| d.work_area).unwrap_or_else(|| primary_area(app)).rounded()
}

/// 시계가 그려진 상자. 아직 재기 전이면 작업 영역 전체다.
fn fullscreen_clock_bounds(app: &AppHandle) -> Rect {
  let (anchor, fitted) = {
    let s = st(app);
    (s.full_anchor, s.full_fitted)
  };
  let area = fullscreen_display_area(app, anchor);
  match fitted {
    Some(size) => geometry::center_in(&area, size),
    None => area,
  }
}

/// 전체 화면 시계를 그 화면 위에 고정한다.
/// 크기는 시계가 보이는 상자만 쓴다 — 그 밖은 다른 창이 마우스를 받는다.
fn pin_fullscreen(app: &AppHandle, force_bounds: bool) {
  let Some(w) = full_win(app) else { return };
  if force_bounds {
    set_bounds(app, &w, &fullscreen_clock_bounds(app));
  }
  // 탁상시계를 '항상 위'로 올려도 전체 화면 시계가 그 위에 남는다.
  let _ = w.set_always_on_top(true);
  raise(&w);
  // 설정·기능 창은 전체 화면 위에도 그대로 둔다.
  raise_fullscreen_overlays(app);
}

/// 전체 화면을 연 동안 보이던 탁상시계를 치운다.
fn hide_clocks_for_fullscreen(app: &AppHandle) {
  for w in all_clock_windows(app) {
    if !is_visible(&w) {
      continue;
    }
    st(app).hidden_for_fullscreen.insert(w.label().to_string());
    let _ = w.hide();
  }
}

/// 전체 화면을 닫으면 숨겼던 시계만 원래 자리에 다시 둔다.
fn show_clocks_after_fullscreen(app: &AppHandle) {
  let (ids, hidden) = {
    let mut s = st(app);
    (std::mem::take(&mut s.hidden_for_fullscreen), s.hidden_by_user)
  };
  if hidden {
    return;
  }
  present_saved_extra_clocks(app);
  for w in all_clock_windows(app) {
    if !ids.contains(w.label()) {
      continue;
    }
    show(&w, false);
    post(app, w.label(), "surface:refresh", Value::Null);
  }
  if let Some(clock) = clock_win(app) {
    if ids.contains(CLOCK) && is_visible(&clock) {
      let _ = clock.set_focus();
    }
  }
}

fn bind_fullscreen_escape(app: &AppHandle) {
  use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
  let shortcuts = app.global_shortcut();
  if shortcuts.is_registered("Escape") {
    return;
  }
  let _ = shortcuts.on_shortcut("Escape", |app, _shortcut, event| {
    if event.state == ShortcutState::Pressed {
      close_fullscreen_clock(app);
    }
  });
}

fn unbind_fullscreen_escape(app: &AppHandle) {
  use tauri_plugin_global_shortcut::GlobalShortcutExt;
  let shortcuts = app.global_shortcut();
  if shortcuts.is_registered("Escape") {
    let _ = shortcuts.unregister("Escape");
  }
}

/// 렌더러가 잰 시계 상자로 창을 줄인다.
fn apply_fullscreen_fit(app: &AppHandle, rect: &Value) {
  let Some(w) = full_win(app) else { return };
  let width = f(rect, "width").unwrap_or(0.0).round().max(40.0);
  let height = f(rect, "height").unwrap_or(0.0).round().max(40.0);
  let Some(origin) = bounds(app, &w) else { return };
  st(app).full_fitted = Some((width, height));
  set_bounds(app, &w, &Rect::new((origin.x + f(rect, "x").unwrap_or(0.0)).round(), (origin.y + f(rect, "y").unwrap_or(0.0)).round(), width, height));
  let _ = w.set_ignore_cursor_events(false);
  show(&w, true);
}

/// 전체 화면 위에 올려도 되는 창 — 시계 창은 넣지 않는다.
fn overlay_windows(app: &AppHandle) -> Vec<WebviewWindow> {
  let labels: Vec<String> = {
    let s = st(app);
    [s.panel.clone(), s.about.clone(), s.alarm.clone(), s.menu.clone()]
      .into_iter()
      .flatten()
      .chain(s.tools.values().cloned())
      .chain(s.clock_settings.values().cloned())
      .collect()
  };
  labels.iter().filter_map(|l| win(app, l)).collect()
}

fn raise_over_fullscreen(app: &AppHandle, w: &WebviewWindow) {
  if !is_fullscreen_open(app) {
    return;
  }
  let _ = w.set_always_on_top(true);
  raise(w);
}

fn raise_fullscreen_overlays(app: &AppHandle) {
  if !is_fullscreen_open(app) {
    return;
  }
  for w in overlay_windows(app) {
    if is_visible(&w) {
      raise_over_fullscreen(app, &w);
    }
  }
}

/// 전체 화면 위로 올렸던 창들을 원래 높이로 되돌린다.
fn restore_overlays_after_fullscreen(app: &AppHandle) {
  let global_top = load_settings(app)["alwaysOnTop"] == true;
  let (panel, about) = {
    let s = st(app);
    (s.panel.clone(), s.about.clone())
  };
  if let Some(w) = win_opt(app, panel) {
    let _ = w.set_always_on_top(clock_win(app).and_then(|c| c.is_always_on_top().ok()).unwrap_or(false));
  }
  if let Some(w) = win_opt(app, about) {
    let _ = w.set_always_on_top(global_top);
  }
  apply_display_priority(app);
}

fn close_fullscreen_clock(app: &AppHandle) {
  match full_win(app) {
    Some(w) => {
      let _ = w.close();
    }
    None => unbind_fullscreen_escape(app),
  }
}

fn open_fullscreen_clock(app: &AppHandle) {
  if let Some(w) = full_win(app) {
    hide_clocks_for_fullscreen(app);
    bind_fullscreen_escape(app);
    let _ = w.set_focus();
    pin_fullscreen(app, true);
    return;
  }
  hide_clocks_for_fullscreen(app);
  bind_fullscreen_escape(app);
  let anchor = cursor_point(app);
  let label = next_label(app, "full");
  {
    let mut s = st(app);
    s.full = Some(label.clone());
    s.full_anchor = anchor;
    s.full_fitted = None;
  }
  // 시계 창과 같이 배경은 비워 둔다 — 바탕화면이 그대로 비친다.
  // 투명 창을 OS 의 전체 화면 모드로 열면 바로 풀리므로, 작업 영역만 한 창을 맨 위에 둔다.
  let built = build_window(
    app,
    Spec {
      label: label.clone(),
      page: "fullscreen.html".into(),
      title: APP_NAME.into(),
      bounds: fullscreen_display_area(app, anchor),
      min: None,
      transparent: true,
      resizable: false,
      on_top: true,
      focused: true,
    },
  );
  if built.is_err() {
    st(app).full = None;
    unbind_fullscreen_escape(app);
    show_clocks_after_fullscreen(app);
  }
}

// ── 시스템 트레이 ───────────────────────────────────────────────────────

fn icon(app: &AppHandle, name: &str) -> Option<Image<'static>> {
  let rgba = menu_icons::render_rgba(name)?;
  // 고해상도 화면에서는 두 배로 키운 그림을 쓴다 (작게 뭉개지지 않게).
  let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
  if scale >= 1.5 {
    let size = (menu_icons::SIZE * 2) as u32;
    Some(Image::new_owned(menu_icons::scale(&rgba, 2), size, size))
  } else {
    let size = menu_icons::SIZE as u32;
    Some(Image::new_owned(rgba, size, size))
  }
}

fn item(app: &AppHandle, id: &str, label: &str, icon_name: &str, enabled: bool) -> tauri::Result<IconMenuItem<Wry>> {
  IconMenuItem::with_id(app, id, label, enabled, icon(app, icon_name), None::<&str>)
}

fn submenu(app: &AppHandle, id: &str, label: &str, icon_name: &str, items: &[&dyn IsMenuItem<Wry>]) -> tauri::Result<Submenu<Wry>> {
  let menu = Submenu::with_id_and_items(app, id, label, true, items)?;
  let _ = menu.set_icon(icon(app, icon_name));
  Ok(menu)
}

fn city_label(city: &Value) -> String {
  let name = s_str(city, "city");
  let region = s_str(city, "region");
  if region.is_empty() {
    name.to_string()
  } else {
    format!("{name} · {region}")
  }
}

/// 트레이 메뉴 — 바뀔 때마다 새로 만든다.
/// 도시 목록과 열려 있는 시계가 바뀌어도 메뉴가 늘 지금 상태를 보여 주도록.
fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
  let settings = load_settings(app);
  let cities: Vec<Value> = match settings["worldCities"].as_array() {
    Some(list) => list.clone(),
    None => store::default_world_cities().as_array().cloned().unwrap_or_default(),
  }
  .into_iter()
  .take(15)
  .collect();
  st(app).tray_cities = cities.clone();
  let open = settings["extraClocks"].as_array().cloned().unwrap_or_default();

  let city_items: Vec<IconMenuItem<Wry>> = cities.iter().enumerate().map(|(i, c)| item(app, &format!("add-city:{i}"), &city_label(c), "clock", true)).collect::<tauri::Result<_>>()?;
  let separator = || PredefinedMenuItem::separator(app);
  let find_city = item(app, "tool:world-find", "다른 도시 찾기...", "world", true)?;
  let sep_add = separator()?;
  let mut add_refs: Vec<&dyn IsMenuItem<Wry>> = city_items.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
  add_refs.push(&sep_add);
  add_refs.push(&find_city);
  let add_menu = submenu(app, "add", "시계 추가", "add", &add_refs)?;

  let open_item = item(app, "open", "열기", "open", true)?;
  // 설정 탭을 지정해 연다 — 지정하지 않으면 패널이 열려 있을 때 그냥 닫힌다.
  let settings_item = item(app, "settings", "설정...", "settings", true)?;

  let close_items: Vec<IconMenuItem<Wry>> = open
    .iter()
    .map(|c| {
      let name = if s_str(c, "city").is_empty() { s_str(c, "zone") } else { s_str(c, "city") };
      item(app, &format!("close-clock:{}", s_str(c, "id")), name, "clock", true)
    })
    .collect::<tauri::Result<_>>()?;
  let close_refs: Vec<&dyn IsMenuItem<Wry>> = close_items.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
  let close_menu = if close_refs.is_empty() { None } else { Some(submenu(app, "close", "시계 닫기", "close", &close_refs)?) };

  // 앱 전체에 걸리는 설정은 여기(트레이)에서 다룬다 — 설정 창은 시계 모양만 맡는다.
  let on_top = CheckMenuItem::with_id(app, "toggle-top", "항상 위에 표시", true, settings["alwaysOnTop"] == true, None::<&str>)?;
  let startup = CheckMenuItem::with_id(app, "toggle-startup", "시작 시 자동 실행", true, is_startup_enabled(app), None::<&str>)?;
  let restore = item(app, "restore-size", "원래 크기로 돌아가기", "restore", is_fullscreen_open(app))?;
  let reset = item(app, "reset", "기본값으로 초기화...", "reset", true)?;
  let system = submenu(app, "system", "시스템 설정", "system", &[&on_top, &startup, &restore, &reset])?;

  let tools: Vec<IconMenuItem<Wry>> = ["world", "alarm", "timer", "stopwatch", "calendar"]
    .iter()
    .map(|tab| item(app, &format!("tool:{tab}"), tool_title(tab).unwrap_or(tab), tab, true))
    .collect::<tauri::Result<_>>()?;
  let about = item(app, "about", "프로그램 정보...", "info", true)?;
  let quit = item(app, "quit", "종료", "quit", true)?;
  let (s1, s2, s3, s4) = (separator()?, separator()?, separator()?, separator()?);

  let mut refs: Vec<&dyn IsMenuItem<Wry>> = vec![&open_item, &settings_item, &s1, &add_menu];
  if let Some(close_menu) = close_menu.as_ref() {
    refs.push(close_menu);
  }
  refs.push(&s2);
  refs.push(&system);
  refs.push(&s3);
  for tool in &tools {
    refs.push(tool);
  }
  refs.push(&s4);
  refs.push(&about);
  refs.push(&quit);
  Menu::with_items(app, &refs)
}

fn tray(app: &AppHandle) -> Option<TrayIcon<Wry>> {
  app.tray_by_id(TRAY_ID)
}

fn refresh_tray_menu(app: &AppHandle) {
  let Some(tray) = tray(app) else { return };
  match build_tray_menu(app) {
    Ok(menu) => {
      let _ = tray.set_menu(Some(menu));
    }
    Err(error) => eprintln!("[{APP_NAME}] 트레이 메뉴를 만들지 못했습니다: {error}"),
  }
}

fn on_tray_menu(app: &AppHandle, id: &str) {
  let id = id.to_string();
  // 메뉴 처리는 메인 스레드에서 불린다 — 창을 만들 수 있도록 밖에서 한다.
  bg(app, move |app| match id.as_str() {
    "open" => restore_from_tray(app),
    "settings" => {
      restore_from_tray(app);
      toggle_panel(app, Some("settings".into()));
    }
    "tool:world-find" => open_tool_window(app, "world"),
    "toggle-top" => {
      let next = load_settings(app)["alwaysOnTop"] != true;
      set_always_on_top(app, next);
    }
    "toggle-startup" => {
      let enabled = set_startup(app, !is_startup_enabled(app));
      save_settings(app, json!({ "startWithSystem": enabled }));
      refresh_tray_menu(app);
    }
    "restore-size" => close_fullscreen_clock(app),
    "reset" => confirm_reset(app),
    "about" => open_about_window(app),
    "quit" => quit_app(app),
    other => {
      if let Some(index) = other.strip_prefix("add-city:").and_then(|i| i.parse::<usize>().ok()) {
        let city = st(app).tray_cities.get(index).cloned();
        if let Some(city) = city {
          add_extra_clock(app, &city);
        }
      } else if let Some(clock) = other.strip_prefix("close-clock:") {
        remove_extra_clock(app, clock);
      } else if let Some(tab) = other.strip_prefix("tool:") {
        open_tool_window(app, tab);
      }
    }
  });
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
  let mut builder = TrayIconBuilder::with_id(TRAY_ID).tooltip(APP_NAME).show_menu_on_left_click(false).menu(&build_tray_menu(app)?);
  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }
  builder
    .on_tray_icon_event(|tray, event| {
      let app = tray.app_handle();
      match event {
        TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => bg(app, restore_from_tray),
        // Windows 에서는 두 번 눌러야 연다 (한 번 누르기는 메뉴와 헷갈린다).
        TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } if !cfg!(windows) => bg(app, restore_from_tray),
        _ => {}
      }
    })
    .build(app)?;
  Ok(())
}

/// 항상 위에 표시 — 표시 우선순위가 "보통"인 시계와 기능 창에 걸고 설정에도 적어 둔다.
fn set_always_on_top(app: &AppHandle, on_top: bool) {
  save_settings(app, json!({ "alwaysOnTop": on_top }));
  apply_display_priority(app);
  // 열려 있는 설정 창들이 같은 값을 보도록 시계 창에 알린다.
  post(app, CLOCK, "from-panel", json!({ "type": "settings:patch", "patch": { "alwaysOnTop": on_top } }));
  refresh_tray_menu(app);
}

/// 되돌릴 수 없는 일이라 한 번 묻는다.
fn confirm_reset(app: &AppHandle) {
  use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
  let handle = app.clone();
  app
    .dialog()
    .message("모든 설정을 처음 상태로 되돌릴까요?\n\n테마·모양·알람·타이머·세계 도시 목록이 처음 상태가 됩니다.\n추가한 시계 창은 그대로 둡니다. 되돌릴 수 없습니다.")
    .title(format!("{APP_NAME} 기본값으로 초기화"))
    .kind(MessageDialogKind::Warning)
    .buttons(MessageDialogButtons::OkCancelCustom("초기화".into(), "취소".into()))
    .show(move |ok| {
      if ok {
        post(&handle, CLOCK, "from-panel", json!({ "type": "settings:reset" }));
        refresh_tray_menu(&handle);
      }
    });
}

// ── 표시 우선순위 ───────────────────────────────────────────────────────
//
// 시계마다 낮음·보통·높음·가장 높음 중 하나를 고른다 (store.rs 의 DISPLAY_PRIORITIES).
// 트레이의 "항상 위에 표시"는 "보통" 시계와 기능 창에만 걸린다.

fn priority_on_top(priority: &str, global_on_top: bool) -> bool {
  match priority {
    "low" => false,
    "high" | "highest" => true,
    _ => global_on_top,
  }
}

/// 창 하나에 우선순위를 건다. "가장 높음"은 맨 위 창들 가운데서도 위로 올린다.
fn set_window_priority(w: &WebviewWindow, priority: &str, global_on_top: bool) {
  let on_top = priority_on_top(priority, global_on_top);
  let _ = w.set_always_on_top(on_top);
  if on_top && priority == "highest" && is_visible(w) {
    raise(w);
  }
}

/// 모든 시계 창 — 메인 시계와 추가 시계.
fn all_clock_windows(app: &AppHandle) -> Vec<WebviewWindow> {
  let labels: Vec<String> = std::iter::once(CLOCK.to_string()).chain(st(app).zone_of_clock.values().cloned()).collect();
  labels.iter().filter_map(|l| win(app, l)).collect()
}

/// 우선순위가 붙은 시계 창들 — (창, 우선순위, 그 시계의 설정 창)
fn clock_priority_entries(app: &AppHandle, settings: &Value) -> Vec<(Option<WebviewWindow>, String, Option<WebviewWindow>)> {
  let mut entries = vec![(clock_win(app), s_str(settings, "displayPriority").to_string(), panel_win(app))];
  for config in settings["extraClocks"].as_array().cloned().unwrap_or_default() {
    let id = s_str(&config, "id");
    let settings_label = st(app).clock_settings.get(id).cloned();
    entries.push((zone_win(app, id), s_str(&config, "displayPriority").to_string(), win_opt(app, settings_label)));
  }
  entries
}

/// "가장 높음" 시계를 다른 시계 위로 다시 올린다.
/// 맨 위 창들끼리는 단계가 없고 마지막으로 앞에 온 창이 위이므로,
/// 다른 시계를 누를 때마다 다시 올려야 한다. 그 뒤 메뉴·알람 팝업을 그 위로 되돌린다.
fn raise_highest_clocks(app: &AppHandle) {
  let settings = load_settings(app);
  for (w, priority, _) in clock_priority_entries(app, &settings) {
    if let Some(w) = w.filter(|w| priority == "highest" && is_visible(w)) {
      raise(&w);
    }
  }
  let (alarm, menu) = {
    let s = st(app);
    (s.alarm.clone(), s.menu.clone())
  };
  for w in [win_opt(app, alarm), win_opt(app, menu)].into_iter().flatten() {
    if is_visible(&w) {
      raise(&w);
    }
  }
}

/// 저장된 우선순위를 열려 있는 창 모두에 다시 건다.
/// 시계의 설정 창은 그 시계보다 낮으면 시계 뒤로 숨으므로 시계와 같은 높이로 둔다.
fn apply_display_priority(app: &AppHandle) {
  let settings = load_settings(app);
  let global = settings["alwaysOnTop"] == true;
  for (w, priority, settings_win) in clock_priority_entries(app, &settings) {
    if let Some(w) = w {
      set_window_priority(&w, &priority, global);
    }
    if let Some(sw) = settings_win {
      set_window_priority(&sw, if priority == "highest" { "high" } else { &priority }, global);
    }
  }
  let tools: Vec<String> = st(app).tools.values().cloned().collect();
  for w in tools.iter().filter_map(|l| win(app, l)) {
    set_window_priority(&w, "normal", global);
  }
  raise_highest_clocks(app);
  pin_fullscreen(app, false);
}

/// 시계를 누르면 그 시계가 앞으로 오므로, "가장 높음" 시계를 다시 위로 올린다.
fn keep_highest_on_top(app: &AppHandle, label: &str) {
  let priority = if label == CLOCK {
    Some(s_str(&load_settings(app), "displayPriority").to_string())
  } else {
    let id = st(app).clock_of_zone.get(label).cloned();
    id.and_then(|id| extra_clock_config(app, &id)).map(|c| s_str(&c, "displayPriority").to_string())
  };
  match priority {
    Some(p) if p != "highest" => later(app, Duration::from_millis(1), raise_highest_clocks),
    _ => {}
  }
}

// ── 트레이로 숨기기·되살리기 ────────────────────────────────────────────

/// 트레이 전용 상태로 들어간다.
/// 숨긴 창은 작업 표시줄에서도 사라지므로, 트레이에서 동작하는 동안에는
/// 작업 표시줄에 아무것도 남지 않는다. 최소화(창 버튼·Win+D 등)도 이 경로를 탄다.
fn hide_to_tray(app: &AppHandle) {
  {
    let mut s = st(app);
    s.hidden_by_user = true;
    s.last_hide_wall = Some(SystemTime::now());
  }
  close_panel(app);
  close_menu_window(app);
  // 추가 시계와 분리한 창도 함께 숨긴다 (목록에는 남는다).
  let labels: Vec<String> = {
    let s = st(app);
    s.zone_of_clock.values().cloned().chain(s.tools.values().cloned()).chain(s.clock_settings.values().cloned()).collect()
  };
  for w in labels.iter().filter_map(|l| win(app, l)) {
    if is_visible(&w) {
      let _ = w.hide();
    }
  }
  let Some(clock) = clock_win(app) else { return };
  // 최소화된 채로 숨기면 다음에 보일 때 최소화 상태로 나오므로 먼저 되돌린다.
  if is_minimized(&clock) {
    let _ = clock.unminimize();
  }
  // 숨기기 직전의 상대 위치를 고정한다. 복원·해상도 변경은 이 비율로 한다.
  if let Some(placement) = bounds(app, &clock).and_then(|b| geometry::capture_placement(&displays(app), &b)) {
    st(app).clock_placement = Some(placement);
    persist_placement(app, Some(placement));
  }
  let _ = clock.hide();
}

fn restore_from_tray(app: &AppHandle) {
  // 전체 화면 시계가 떠 있으면 그 모드를 유지한다. 숨긴 탁상시계를 꺼내지 않는다.
  if is_fullscreen_open(app) {
    pin_fullscreen(app, true);
    return;
  }
  let zones: Vec<String> = st(app).zone_of_clock.values().cloned().collect();
  for w in zones.iter().filter_map(|l| win(app, l)) {
    if !is_visible(&w) {
      show(&w, false);
    }
  }
  let Some(clock) = clock_win(app) else { return };
  {
    let mut s = st(app);
    s.hidden_by_user = false;
    s.start_in_tray = false;
  }
  recover_clock_on_screen(app, Recover { force_show: true, remount: true, ..Recover::default() });
  let _ = clock.set_focus();
}

fn ensure_clock_on_screen(app: &AppHandle) {
  let Some(clock) = clock_win(app) else { return };
  let ds = displays(app);
  if !geometry::has_usable_displays(&ds) {
    return;
  }
  let live = if is_visible(&clock) && !is_minimized(&clock) { bounds(app, &clock) } else { None };
  let placement = {
    let current = st(app).clock_placement;
    current.or_else(|| live.and_then(|b| geometry::capture_placement(&ds, &b))).or_else(|| placement_from_settings(&load_settings(app)))
  };
  st(app).clock_placement = placement;
  let min = min_size_of(app, CLOCK);
  let next = placement.and_then(|p| geometry::apply_placement(&ds, &p, min.0, min.1)).or_else(|| bounds(app, &clock).map(|b| geometry::clamp_to_work_area(&ds, b)));
  if let (Some(next), Some(current)) = (next, bounds(app, &clock)) {
    if next != current {
      set_bounds(app, &clock, &next);
    }
  }
}

fn reapply_always_on_top(app: &AppHandle) {
  if let Some(clock) = clock_win(app) {
    if clock.is_always_on_top().unwrap_or(false) {
      let _ = clock.set_always_on_top(false);
      set_window_priority(&clock, s_str(&load_settings(app), "displayPriority"), true);
    }
  }
  raise_highest_clocks(app);
  pin_fullscreen(app, false);
}

fn page_ready(app: &AppHandle, label: &str) -> bool {
  st(app).shown_once.contains(label)
}

/// 로그인 직후 그래픽 드라이버가 늦으면 첫 프레임이 비어 보일 수 있다.
/// 창을 보인 뒤 몇 번에 걸쳐 시계를 다시 그리게 한다.
fn arm_boot_surface_refresh(app: &AppHandle) {
  {
    let mut s = st(app);
    if s.boot_armed || s.hidden_by_user {
      return;
    }
    s.boot_armed = true;
  }
  let delays: &[u64] = if cfg!(windows) { &[600, 1800, 5000] } else { &[600] };
  for delay in delays {
    later(app, Duration::from_millis(*delay), refresh_visible_clock_surfaces);
  }
}

/// 사용자가 숨기지 않은 시계를 작업 영역 안으로 끌어와 보이게 한다.
fn ensure_clocks_shown(app: &AppHandle) {
  // 조건식 안에서 잠금을 쥔 채 다른 잠금을 잡으면 같은 스레드에서 멈춘다 — 따로 읽는다.
  let hidden = st(app).hidden_by_user;
  if hidden || is_fullscreen_open(app) || !geometry::has_usable_displays(&displays(app)) {
    return;
  }
  present_saved_extra_clocks(app);
  if let Some(clock) = clock_win(app) {
    if page_ready(app, CLOCK) {
      show(&clock, false);
      ensure_clock_on_screen(app);
    }
  }
  let zones: Vec<(String, String)> = st(app).clock_of_zone.iter().map(|(l, id)| (l.clone(), id.clone())).collect();
  let ds = displays(app);
  for (label, id) in zones {
    let Some(w) = win(app, &label) else { continue };
    if !page_ready(app, &label) {
      continue;
    }
    show(&w, false);
    let Some(current) = bounds(app, &w) else { continue };
    let next = geometry::clamp_to_work_area(&ds, current);
    if next != current {
      set_bounds(app, &w, &next);
      schedule_extra_clock_save(app, &id, next);
    }
  }
}

/// 지금 화면에 있어야 하는 시계만 다시 그린다. 트레이로 숨긴 시계는 꺼내지 않는다.
fn refresh_visible_clock_surfaces(app: &AppHandle) {
  if quitting(app) || !geometry::has_usable_displays(&displays(app)) {
    return;
  }
  st(app).last_surface_refresh = Some(Instant::now());
  if let Some(full) = full_win(app) {
    post(app, full.label(), "surface:refresh", Value::Null);
    pin_fullscreen(app, true);
    return;
  }
  if !st(app).hidden_by_user {
    ensure_clocks_shown(app);
  }
  for w in all_clock_windows(app) {
    if !is_visible(&w) || is_minimized(&w) {
      continue;
    }
    post(app, w.label(), "surface:refresh", Value::Null);
    if w.label() == CLOCK {
      if let Some(b) = bounds(app, &w) {
        post(app, CLOCK, "clock:bounds", rect_json(&b));
      }
    }
  }
}

fn recover_clock_on_screen(app: &AppHandle, opts: Recover) {
  if clock_win(app).is_none() || quitting(app) || !geometry::has_usable_displays(&displays(app)) {
    return;
  }
  if is_fullscreen_open(app) {
    hide_clocks_for_fullscreen(app);
    pin_fullscreen(app, true);
    if opts.remount || opts.repaint {
      if let Some(full) = full_win(app) {
        post(app, full.label(), "surface:refresh", Value::Null);
      }
    }
    return;
  }
  {
    let mut s = st(app);
    if s.hidden_by_user && !opts.force_show {
      return;
    }
    if opts.force_show {
      s.hidden_by_user = false;
    }
  }
  if opts.remount || opts.repaint {
    refresh_visible_clock_surfaces(app);
  } else {
    ensure_clocks_shown(app);
  }
  reapply_always_on_top(app);
}

fn schedule_clock_recover(app: &AppHandle, opts: Recover) {
  {
    let mut s = st(app);
    s.pending_recover.remount |= opts.remount;
    s.pending_recover.force_show |= opts.force_show;
    s.pending_recover.repaint |= opts.repaint;
    s.last_display_change_at = Some(Instant::now());
    s.display_recovering = true;
  }
  cancel(app, "recover-settle");
  schedule(app, "recover", Duration::from_millis(400), |app| {
    let run = std::mem::take(&mut st(app).pending_recover);
    recover_clock_on_screen(app, run);
    schedule(app, "recover-settle", Duration::from_millis(1500), |app| st(app).display_recovering = false);
  });
}

/// 모니터를 꽂거나 빼거나, 해상도·배율이 바뀌었는지 보는 값.
fn monitor_signature(app: &AppHandle) -> String {
  screens(app).iter().map(|s| format!("{:?}", s)).collect::<Vec<_>>().join("|")
}

/// 미뤄 둔 일을 하고, 화면 구성 변화와 절전에서 깨어남을 지켜본다.
///
/// Electron 의 screen·powerMonitor 이벤트 대신이다. 2초마다 화면 구성을 보고,
/// 시계가 크게 건너뛰면(잠자기) 깨어난 것으로 본다.
fn start_ticker(app: &AppHandle) {
  let app = app.clone();
  std::thread::spawn(move || {
    let mut signature = monitor_signature(&app);
    let mut last_check = Instant::now();
    let mut last_wall = SystemTime::now();
    loop {
      std::thread::sleep(Duration::from_millis(40));
      let due: Vec<Task> = {
        let mut s = st(&app);
        if s.quitting {
          return;
        }
        let now = Instant::now();
        let keys: Vec<String> = s.timers.iter().filter(|(_, (at, _))| *at <= now).map(|(k, _)| k.clone()).collect();
        keys.into_iter().filter_map(|k| s.timers.remove(&k).map(|(_, task)| task)).collect()
      };
      for task in due {
        task(&app);
      }
      if last_check.elapsed() < Duration::from_secs(2) {
        continue;
      }
      last_check = Instant::now();
      let now_wall = SystemTime::now();
      let gap = now_wall.duration_since(last_wall).unwrap_or_default();
      if gap > Duration::from_secs(10) {
        // 잠자기에서 깨어났다. 잠들기 직전에 OS 가 창을 최소화해 트레이로 숨겼다면
        // 사용자가 숨긴 것이 아니다.
        {
          let mut s = st(&app);
          let slept_at = last_wall;
          if s.hidden_by_user && s.last_hide_wall.is_some_and(|at| slept_at.duration_since(at).map(|d| d < Duration::from_secs(8)).unwrap_or(true)) {
            s.hidden_by_user = false;
          }
        }
        schedule_clock_recover(&app, Recover { remount: true, ..Recover::default() });
      }
      last_wall = now_wall;
      let next = monitor_signature(&app);
      if next != signature {
        signature = next;
        schedule_clock_recover(&app, Recover { remount: true, ..Recover::default() });
      }
    }
  });
}

// ── 자동 실행 ───────────────────────────────────────────────────────────

fn is_startup_enabled(app: &AppHandle) -> bool {
  if let Some(fake) = st(app).fake_startup {
    return fake;
  }
  use tauri_plugin_autostart::ManagerExt;
  app.autolaunch().is_enabled().unwrap_or(false)
}

fn set_startup(app: &AppHandle, enable: bool) -> bool {
  // 검사 실행(MYCLOCK_CONFIG_DIR)은 쓰는 사람의 로그인 항목을 건드리지 않는다.
  {
    let mut s = st(app);
    if s.fake_startup.is_some() {
      s.fake_startup = Some(enable);
      return enable;
    }
  }
  use tauri_plugin_autostart::ManagerExt;
  let launcher = app.autolaunch();
  let result = if enable {
    launcher.enable()
  } else if launcher.is_enabled().unwrap_or(false) {
    launcher.disable()
  } else {
    Ok(())
  };
  if let Err(error) = result {
    eprintln!("[{APP_NAME}] 자동 실행 설정 실패: {error}");
  }
  is_startup_enabled(app)
}

fn quit_app(app: &AppHandle) {
  st(app).quitting = true;
  post(app, CLOCK, "app:before-quit", Value::Null);
  // 렌더러가 마지막 설정을 저장할 짧은 여유를 준다.
  let app = app.clone();
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_millis(120));
    before_exit(&app);
    app.exit(0);
  });
}

fn before_exit(app: &AppHandle) {
  stop_gesture(app);
  flush_extra_clock_saves(app);
  let placement = {
    let mut s = st(app);
    s.timers.clear();
    s.clock_placement
  };
  persist_placement(app, placement);
}

// ── 창 끌기 / 크기 조절 (투명 창에서도 안정적으로 동작) ────────────────
//
// 창을 끄는 동안에는 창이 커서를 따라간다. 렌더러가 pointerup 을 놓치면 (창이
// 포커스를 잃거나 포인터 캡처가 풀리는 경우) 창이 커서에 붙은 채로 남아,
// 손대지 않았는데도 창이 저 혼자 움직이는 것처럼 보인다.
//
// 그래서 여기서도 끊는다.
//   · 마우스 버튼이 떼어졌으면 (Windows)
//   · 커서가 한동안 멈춰 있으면 — 끌기가 끝난 것으로 본다.
//   · 아주 오래 이어지면 — 무조건 끊는다.

fn stop_gesture(app: &AppHandle) {
  let mut s = st(app);
  s.gesture += 1;
  s.gesture_label = None;
}

#[cfg(windows)]
fn primary_button_down() -> bool {
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
  use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};
  // GetAsyncKeyState 는 물리 단추를 본다 — 왼손잡이 설정이면 오른쪽 단추가 주 단추다.
  let key = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0 { VK_RBUTTON } else { VK_LBUTTON };
  (unsafe { GetAsyncKeyState(key as i32) } as u16 & 0x8000) != 0
}

#[cfg(not(windows))]
fn primary_button_down() -> bool {
  true
}

fn start_gesture(app: &AppHandle, w: &WebviewWindow, resize: bool) {
  let generation = {
    let mut s = st(app);
    s.gesture += 1;
    s.gesture_label = Some(w.label().to_string());
    s.gesture
  };
  let Ok(start) = app.cursor_position() else { return };
  let (Ok(outer), Ok(inner), Ok(size)) = (w.outer_position(), w.inner_position(), w.inner_size()) else { return };
  let scale = w.scale_factor().unwrap_or(1.0);
  let (min_w, min_h) = min_size_of(app, w.label());
  let (min_w, min_h) = (min_w * scale, min_h * scale);
  let dx = start.x - outer.x as f64;
  let dy = start.y - outer.y as f64;
  let grip_dx = inner.x as f64 + size.width as f64 - start.x;
  let grip_dy = inner.y as f64 + size.height as f64 - start.y;
  let app = app.clone();
  let w = w.clone();
  std::thread::spawn(move || {
    let began = Instant::now();
    let mut last_point = (start.x, start.y);
    let mut last_move = Instant::now();
    loop {
      std::thread::sleep(GESTURE_STEP);
      let current = st(&app).gesture;
      if current != generation || quitting(&app) {
        return;
      }
      if began.elapsed() > GESTURE_MAX || !primary_button_down() {
        break;
      }
      let Ok(p) = app.cursor_position() else { break };
      if (p.x, p.y) != last_point {
        last_point = (p.x, p.y);
        last_move = Instant::now();
      } else if last_move.elapsed() >= GESTURE_IDLE {
        break;
      } else {
        continue;
      }
      if resize {
        let Ok(inner) = w.inner_position() else { break };
        let width = (p.x + grip_dx - inner.x as f64).round().max(min_w);
        let height = (p.y + grip_dy - inner.y as f64).round().max(min_h);
        let _ = w.set_size(PhysicalSize::new(width as u32, height as u32));
      } else {
        let _ = w.set_position(PhysicalPosition::new((p.x - dx).round() as i32, (p.y - dy).round() as i32));
      }
    }
    let mut s = st(&app);
    if s.gesture == generation {
      s.gesture += 1;
      s.gesture_label = None;
    }
  });
}

// ── 명령 (렌더러 → 메인) ───────────────────────────────────────────────
//
// 창을 만드는 명령은 async 다. 동기 명령은 메인 스레드에서 돌아 Windows 에서 멈춘다.

#[tauri::command]
fn bridge_listen(app: AppHandle, window: WebviewWindow, event: String) -> Vec<Value> {
  let mut s = st(&app);
  let label = window.label().to_string();
  s.listening.entry(label.clone()).or_default().insert(event.clone());
  s.queued.get_mut(&label).and_then(|events| events.remove(&event)).map(Vec::from).unwrap_or_default()
}

#[tauri::command]
fn settings_load(app: AppHandle) -> Value {
  load_settings(&app)
}

#[tauri::command]
fn settings_save(app: AppHandle, patch: Value) -> Value {
  let saved = save_settings(&app, patch.clone());
  // 트레이 메뉴에 보이는 값이 바뀌었으면 메뉴도 새로 만든다.
  if ["worldCities", "alwaysOnTop", "extraClocks", "startWithSystem"].iter().any(|k| patch.get(*k).is_some()) {
    refresh_tray_menu(&app);
  }
  saved
}

#[tauri::command]
fn settings_reset(app: AppHandle) -> Value {
  let store = store(&app);
  let saved = {
    let _guard = STORE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    store.reset_settings()
  };
  refresh_tray_menu(&app);
  saved
}

#[tauri::command]
fn settings_default_cities() -> Value {
  store::default_world_cities()
}

#[tauri::command]
fn events_load(app: AppHandle) -> Value {
  store(&app).load_events()
}

#[tauri::command]
fn events_save(app: AppHandle, events: Value) -> Value {
  let store = store(&app);
  let _guard = STORE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
  store.save_events(&events)
}

#[tauri::command]
fn startup_get(app: AppHandle) -> bool {
  is_startup_enabled(&app)
}

#[tauri::command]
fn startup_set(app: AppHandle, enable: bool) -> bool {
  let enabled = set_startup(&app, enable);
  refresh_tray_menu(&app);
  enabled
}

#[tauri::command]
fn clock_get_bounds(app: AppHandle) -> Value {
  clock_win(&app).and_then(|w| bounds(&app, &w)).map(|b| rect_json(&b)).unwrap_or(Value::Null)
}

#[tauri::command]
fn surface_request_refresh(app: AppHandle) {
  // 방금 다시 그리며 생긴 보이기 변화로 또 다시 그리지 않는다.
  if st(&app).last_surface_refresh.is_some_and(|at| at.elapsed() < Duration::from_millis(1000)) {
    return;
  }
  schedule(&app, "surface", Duration::from_millis(250), refresh_visible_clock_surfaces);
}

#[tauri::command]
fn window_drag_start(app: AppHandle, window: WebviewWindow) {
  start_gesture(&app, &window, false);
}

#[tauri::command]
fn window_resize_start(app: AppHandle, window: WebviewWindow) {
  start_gesture(&app, &window, true);
}

#[tauri::command]
fn window_gesture_end(app: AppHandle) {
  stop_gesture(&app);
}

#[tauri::command]
fn window_minimize(app: AppHandle) {
  bg(&app, hide_to_tray);
}

#[tauri::command]
fn window_hide_to_tray(app: AppHandle) {
  bg(&app, hide_to_tray);
}

#[tauri::command]
fn window_close_self(app: AppHandle, window: WebviewWindow) {
  let label = window.label().to_string();
  // 추가 시계는 닫으면 목록에서도 지운다 (다음 실행에 되살아나지 않도록).
  let clock_id = st(&app).clock_of_zone.get(&label).cloned();
  if let Some(id) = clock_id {
    bg(&app, move |app| remove_extra_clock(app, &id));
  } else if label != CLOCK {
    let _ = window.close();
  }
}

#[tauri::command]
fn window_toggle_maximize(window: WebviewWindow) {
  if window.is_maximized().unwrap_or(false) {
    let _ = window.unmaximize();
  } else {
    let _ = window.maximize();
  }
}

#[tauri::command]
fn window_is_maximized(window: WebviewWindow) -> bool {
  window.is_maximized().unwrap_or(false)
}

/// 시계 창이 항상 위·표시 우선순위를 저장한 뒤 부른다 — 저장된 값을 창마다 다시 건다.
#[tauri::command]
fn window_set_always_on_top(app: AppHandle) {
  bg(&app, apply_display_priority);
}

#[tauri::command]
fn window_set_min_size(app: AppHandle, window: WebviewWindow, size: Value) {
  let width = f(&size, "width").unwrap_or(DIGITAL_MIN_WIDTH).round().max(80.0);
  let height = f(&size, "height").unwrap_or(DIGITAL_MIN_HEIGHT).round().max(40.0);
  set_min_size(&app, &window, (width, height));
  if let Some(b) = bounds(&app, &window) {
    if b.width < width || b.height < height {
      set_bounds(&app, &window, &Rect::new(b.x, b.y, b.width.max(width), b.height.max(height)));
    }
  }
}

#[tauri::command]
fn window_set_size(app: AppHandle, window: WebviewWindow, size: Value) {
  let Some(b) = bounds(&app, &window) else { return };
  let (min_w, min_h) = min_size_of(&app, window.label());
  let width = f(&size, "width").filter(|w| *w != 0.0).unwrap_or(b.width).max(min_w);
  let height = f(&size, "height").filter(|h| *h != 0.0).unwrap_or(b.height).max(min_h);
  let next = geometry::clamp_to_work_area(
    &displays(&app),
    Rect::new(f(&size, "x").map(f64::round).unwrap_or(b.x), f(&size, "y").map(f64::round).unwrap_or(b.y), width.round(), height.round()),
  );
  set_bounds(&app, &window, &next);
}

#[tauri::command]
async fn panel_toggle(app: AppHandle, tab: Option<String>) {
  toggle_panel(&app, tab);
}

#[tauri::command]
fn panel_close(app: AppHandle) {
  close_panel(&app);
}

#[tauri::command]
fn panel_is_open(app: AppHandle) -> bool {
  panel_win(&app).is_some()
}

/// 한 번만 읽어 간다 — 다시 물으면 null (패널이 새로 뜬 것이 아니므로).
#[tauri::command]
fn panel_pending_tab(app: AppHandle) -> Option<String> {
  st(&app).panel_pending_tab.take()
}

/// 설정 패널이 잰 크기 — 내용이 잘리지 않도록 그만큼 넓혀 준다.
#[tauri::command]
fn panel_fit(app: AppHandle, size: Value) {
  let width = f(&size, "width").unwrap_or(0.0).round();
  let height = f(&size, "height").unwrap_or(0.0).round();
  if width == 0.0 || height == 0.0 {
    return;
  }
  {
    let mut s = st(&app);
    if s.panel_fit == Some((width, height)) {
      return;
    }
    s.panel_fit = Some((width, height));
  }
  position_panel(&app);
}

#[tauri::command]
fn clocks_list(app: AppHandle) -> Value {
  json!(extra_clocks(&app))
}

#[tauri::command]
async fn clocks_add(app: AppHandle, city: Value) -> Value {
  add_extra_clock(&app, &city).unwrap_or(Value::Null)
}

#[tauri::command]
fn clocks_close(app: AppHandle, id: Value) {
  let id = match id {
    Value::String(s) => s,
    other => other.to_string(),
  };
  bg(&app, move |app| remove_extra_clock(app, &id));
}

#[tauri::command]
fn clocks_update(app: AppHandle, id: String, patch: Value) {
  bg(&app, move |app| {
    update_extra_clock(app, &id, &patch);
  });
}

/// 시계 창이 "나는 어느 시계인가"를 물어본다.
#[tauri::command]
fn clock_self(app: AppHandle, window: WebviewWindow) -> Value {
  let id = st(&app).clock_of_zone.get(window.label()).cloned();
  id.and_then(|id| extra_clock_config(&app, &id)).unwrap_or(Value::Null)
}

/// 시계 창의 ⚙ — 그 시계만의 설정 창을 연다.
#[tauri::command]
async fn clocks_open_settings(app: AppHandle, window: WebviewWindow) {
  let id = st(&app).clock_of_zone.get(window.label()).cloned();
  match id {
    Some(id) => open_clock_settings(&app, &id),
    None => toggle_panel(&app, Some("settings".into())),
  }
}

#[tauri::command]
async fn tools_open(app: AppHandle, tab: String) {
  open_tool_window(&app, &tab);
}

#[tauri::command]
fn tools_opened(app: AppHandle) -> Vec<String> {
  let tools: Vec<(String, String)> = st(&app).tools.iter().map(|(t, l)| (t.clone(), l.clone())).collect();
  tools.into_iter().filter(|(_, l)| win(&app, l).is_some()).map(|(t, _)| t).collect()
}

#[tauri::command]
async fn menu_open(app: AppHandle, window: WebviewWindow, payload: Value) {
  // 고른 항목은 메뉴를 연 창에 돌려준다 — 시계가 여러 개이기 때문이다.
  open_menu_window(&app, window.label(), payload);
}

#[tauri::command]
fn menu_ready(app: AppHandle, size: Value) {
  place_menu_window(&app, &size);
}

#[tauri::command]
fn menu_choose(app: AppHandle, id: Value) {
  let opener = st(&app).menu_opener.clone();
  close_menu_window(&app);
  let target = opener.filter(|l| win(&app, l).is_some()).unwrap_or_else(|| CLOCK.into());
  post(&app, &target, "menu:action", id);
}

#[tauri::command]
fn menu_close(app: AppHandle) {
  close_menu_window(&app);
}

#[tauri::command]
async fn alarm_show(app: AppHandle, payload: Value) {
  show_alarm_popup(&app, payload);
}

#[tauri::command]
fn alarm_dismiss(app: AppHandle) {
  let label = st(&app).alarm.clone();
  if let Some(w) = win_opt(&app, label) {
    let _ = w.close();
  }
}

#[tauri::command]
fn app_info(app: AppHandle) -> Value {
  app_info_value(&app)
}

#[tauri::command]
async fn about_open(app: AppHandle) {
  open_about_window(&app);
}

#[tauri::command]
async fn fullscreen_open(app: AppHandle) {
  open_fullscreen_clock(&app);
}

#[tauri::command]
fn fullscreen_close(app: AppHandle) {
  close_fullscreen_clock(&app);
}

#[tauri::command]
fn fullscreen_fit(app: AppHandle, window: WebviewWindow, rect: Value) {
  if st(&app).full.as_deref() != Some(window.label()) {
    return;
  }
  apply_fullscreen_fit(&app, &rect);
}

#[tauri::command]
fn tray_icon(app: AppHandle, data_url: String) {
  use base64::Engine;
  let Some(tray) = tray(&app) else { return };
  let Some(encoded) = data_url.split_once("base64,").map(|(_, data)| data) else { return };
  // 아이콘 갱신 실패는 무시한다 — 다음 초에 다시 그린다.
  let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) else { return };
  if let Ok(image) = Image::from_bytes(&bytes) {
    let _ = tray.set_icon(Some(image));
  }
}

#[tauri::command]
fn tray_tooltip(app: AppHandle, text: String) {
  if let Some(tray) = tray(&app) {
    let _ = tray.set_tooltip(Some(format!("{APP_NAME} — {text}")));
  }
}

#[tauri::command]
fn app_quit(app: AppHandle) {
  quit_app(&app);
}

#[tauri::command]
fn shell_open_external(url: String) {
  let lower = url.to_ascii_lowercase();
  if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:") {
    let _ = open::that_detached(url);
  }
}

/// 시계 렌더러 → 패널 렌더러 중계
#[tauri::command]
fn relay_to_clock(app: AppHandle, message: Value) {
  post(&app, CLOCK, "from-panel", message);
}

#[tauri::command]
fn relay_to_panel(app: AppHandle, message: Value) {
  // 분리한 탭 창과 시계별 설정 창도 같은 상태를 본다 — 알람·타이머는 앱이 하나로 들고 있다.
  let labels: Vec<String> = {
    let s = st(&app);
    [s.panel.clone(), s.full.clone()].into_iter().flatten().chain(s.tools.values().cloned()).chain(s.clock_settings.values().cloned()).collect()
  };
  for label in labels {
    post(&app, &label, "from-clock", message.clone());
  }
}

// ── 앱 수명주기 ─────────────────────────────────────────────────────────

/// Electron 판과 같은 설정 폴더 — %AppData%\MyClockMultiOS, ~/.config/MyClockMultiOS,
/// ~/Library/Application Support/MyClockMultiOS. 그래서 옮겨 와도 설정이 이어진다.
/// WPF 판(MyClockWinV10)이 쓰는 %AppData%\MyClock 과는 겹치지 않는다.
/// MYCLOCK_CONFIG_DIR 로 옮길 수 있다 (검사가 쓴다).
fn config_dirs(app: &AppHandle) -> (PathBuf, PathBuf, bool) {
  let base = app.path().config_dir().unwrap_or_else(|_| std::env::temp_dir());
  let legacy = base.join("MyClock");
  if let Ok(dir) = std::env::var("MYCLOCK_CONFIG_DIR") {
    if !dir.trim().is_empty() {
      let dir = PathBuf::from(dir);
      return (dir.clone(), dir.join("legacy"), true);
    }
  }
  (base.join("MyClockMultiOS"), legacy, false)
}

pub fn run() {
  // 언제나 하나만 실행한다 (개발 실행도 마찬가지). 두 번째 실행은 곧바로 끝나고,
  // 이미 떠 있는 쪽이 트레이에서 나온다. 시계 창은 하나의 프로그램 안에서 여러 개 열 수 있다.
  // single-instance 플러그인은 다른 플러그인보다 먼저 등록해야 한다.
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| bg(app, restore_from_tray)))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![STARTUP_ARG])))
    .manage::<Shared>(Mutex::new(State::default()))
    .on_menu_event(|app, event| on_tray_menu(app, event.id().as_ref()))
    .invoke_handler(tauri::generate_handler![
      bridge_listen,
      settings_load,
      settings_save,
      settings_reset,
      settings_default_cities,
      events_load,
      events_save,
      startup_get,
      startup_set,
      clock_get_bounds,
      surface_request_refresh,
      window_drag_start,
      window_resize_start,
      window_gesture_end,
      window_minimize,
      window_hide_to_tray,
      window_close_self,
      window_toggle_maximize,
      window_is_maximized,
      window_set_always_on_top,
      window_set_min_size,
      window_set_size,
      panel_toggle,
      panel_close,
      panel_is_open,
      panel_pending_tab,
      panel_fit,
      clocks_list,
      clocks_add,
      clocks_close,
      clocks_update,
      clock_self,
      clocks_open_settings,
      tools_open,
      tools_opened,
      menu_open,
      menu_ready,
      menu_choose,
      menu_close,
      alarm_show,
      alarm_dismiss,
      app_info,
      about_open,
      fullscreen_open,
      fullscreen_close,
      fullscreen_fit,
      tray_icon,
      tray_tooltip,
      app_quit,
      shell_open_external,
      relay_to_clock,
      relay_to_panel,
    ])
    .setup(|app| {
      let handle = app.handle().clone();
      let (dir, legacy, isolated) = config_dirs(&handle);
      let _ = std::fs::create_dir_all(&dir);
      let start_in_tray = std::env::args().any(|arg| arg.eq_ignore_ascii_case(STARTUP_ARG));
      {
        let mut s = st(&handle);
        s.store = Some(Store::new(dir.clone(), legacy));
        s.webview_dir = isolated.then(|| dir.join("webview"));
        s.fake_startup = std::env::var_os("MYCLOCK_CONFIG_DIR").map(|_| false);
        s.start_in_tray = start_in_tray;
        s.hidden_by_user = start_in_tray;
      }

      // 처음 실행이면 WPF 판 설정을 한 번만 읽어온다 (원본은 그대로 둔다).
      if let Some((settings, events)) = store(&handle).migrate_from_wpf_if_needed() {
        println!("[migrate] WPF settings imported (settings={settings}, events={events})");
      }

      // macOS 의 Dock 아이콘도 작업 표시줄과 마찬가지로 감추고 메뉴 막대 트레이만 쓴다.
      #[cfg(target_os = "macos")]
      app.set_activation_policy(tauri::ActivationPolicy::Accessory);

      // Electron 판에서 켜 둔 "시작 시 자동 실행"을 이 판의 실행 파일로 다시 건다.
      // (개발 실행은 쓰는 사람의 로그인 항목을 자기 쪽으로 돌려놓지 않는다.)
      if !cfg!(debug_assertions) && !isolated && load_settings(&handle)["startWithSystem"] == true && !is_startup_enabled(&handle) {
        set_startup(&handle, true);
      }

      create_clock_window(&handle)?;
      present_saved_extra_clocks(&handle);
      if let Err(error) = create_tray(&handle) {
        eprintln!("[{APP_NAME}] 트레이 아이콘을 만들지 못했습니다: {error}");
      }
      start_ticker(&handle);
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("MyClock could not start");

  app.run(|app, event| match event {
    // 창이 모두 닫혀도 트레이에 남는다. 끝내는 길은 종료 메뉴뿐이다.
    RunEvent::ExitRequested { api, code, .. } => {
      if code.is_none() && !quitting(app) {
        api.prevent_exit();
      }
    }
    #[cfg(target_os = "macos")]
    RunEvent::Reopen { .. } => bg(app, restore_from_tray),
    RunEvent::Exit => {
      if !st(app).quitting {
        st(app).quitting = true;
        before_exit(app);
      }
    }
    _ => {}
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn priority_rules_match_the_tray_switch() {
    assert!(!priority_on_top("low", true), "낮음은 항상 위를 따르지 않는다");
    assert!(priority_on_top("normal", true));
    assert!(!priority_on_top("normal", false));
    assert!(priority_on_top("high", false));
    assert!(priority_on_top("highest", false));
  }

  #[test]
  fn minimum_size_follows_clock_face() {
    assert_eq!(min_size_for(&json!({ "isDigital": false })), (150.0, 150.0));
    assert_eq!(min_size_for(&json!({ "isDigital": true, "digitalStyle": "SevenSegment", "use24h": false })), (140.0, 78.0));
    assert_eq!(min_size_for(&json!({ "isDigital": true, "digitalStyle": "SevenSegment", "use24h": true })), (140.0, 50.0));
    assert_eq!(min_size_for(&json!({ "isDigital": true, "digitalStyle": "Neon", "use24h": false })), (140.0, 50.0));
  }

  #[test]
  fn build_date_is_iso_utc() {
    let t = SystemTime::UNIX_EPOCH + Duration::from_secs(1_791_004_560);
    assert_eq!(iso_time(t).unwrap(), "2026-10-03T05:16:00.000Z");
  }

  #[test]
  fn query_values_are_escaped() {
    assert_eq!(encode_query("clock-ab12"), "clock-ab12");
    assert_eq!(encode_query("a b&c"), "a%20b%26c");
  }

  #[test]
  fn tool_tabs_have_titles() {
    for tab in ["world", "alarm", "timer", "stopwatch", "calendar", "settings"] {
      assert!(tool_title(tab).is_some(), "{tab}");
    }
    assert!(tool_title("엉뚱").is_none());
  }
}
