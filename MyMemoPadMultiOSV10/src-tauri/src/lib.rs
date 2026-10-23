//! MyMemoPad — the Tauri port of the Electron build's electron/main.js.
//!
//! Windows: frameless memo pads (`pad-N`), one memo list (`list`) and one settings window
//! (`settings`), all loading src/index.html with `?role=`. The first pad is the host: closing it
//! hides it and the app stays in the system tray; Exit is only in the tray menu.
//!
//! The renderer talks to this file only through src/js/bridge.js (`window.desktopAPI`), which
//! has the same shape as the Electron preload, so the renderer code did not change.

mod native;
mod store;

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use store::Store;
use tauri::image::Image;
use tauri::menu::{IconMenuItem, Menu, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::window::Color;
use tauri::{AppHandle, Emitter, EventTarget, LogicalSize, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

const APP_NAME: &str = "MyMemoPad";
const STARTUP_ARG: &str = "--autostart";
const TRAY_ID: &str = "main";
const LIST: &str = "list";
const SETTINGS: &str = "settings";
const PAD_PREFIX: &str = "pad-";

const PAD_BACK: (u8, u8, u8) = (0xF8, 0xE1, 0x8C);
const SETTINGS_BACK: (u8, u8, u8) = (0xF0, 0xF0, 0xF0);

const ICON_LIST: &[u8] = include_bytes!("../icons/menu/list.png");
const ICON_NEW: &[u8] = include_bytes!("../icons/menu/new-memo.png");
const ICON_AUTOSTART_ON: &[u8] = include_bytes!("../icons/menu/autostart-on.png");
const ICON_AUTOSTART_OFF: &[u8] = include_bytes!("../icons/menu/autostart-off.png");
const ICON_QUIT: &[u8] = include_bytes!("../icons/menu/quit.png");

struct Pad {
  is_host: bool,
  source_index: i64,
  source_memo: Option<String>,
  empty: bool,
  html: String,
  look: Option<Value>,
  /// The first `pad:load`, sent once the page says it is ready (window_ready).
  initial: Option<Value>,
  show_when_ready: bool,
}

struct SettingsSession {
  owner: Option<String>,
  context: Value,
  committed: bool,
}

#[derive(Default)]
struct State {
  store: Option<Store>,
  webview_dir: Option<PathBuf>,
  pads: HashMap<String, Pad>,
  next_pad: u64,
  host: Option<String>,
  list_show_pending: bool,
  settings: Option<SettingsSession>,
  settings_shown: bool,
  /// Events each window listens to / events posted before it listened.
  listening: HashMap<String, HashSet<String>>,
  queued: HashMap<String, HashMap<String, VecDeque<Value>>>,
  quitting: bool,
}

type Shared = Mutex<State>;

thread_local! {
  /// Whether this thread holds the State lock — taking it again on the same thread hangs silently.
  static HOLDING: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

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

/// The shared state. Never call st() again while a guard is alive (e.g. `st(app).a || f(app)`);
/// debug builds catch that instead of hanging.
fn st(app: &AppHandle) -> StateGuard<'_> {
  if HOLDING.with(|h| h.get()) {
    debug_assert!(false, "MyMemoPad: State lock taken twice on one thread (deadlock)");
  }
  let guard = app.state::<Shared>().inner().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  HOLDING.with(|h| h.set(true));
  StateGuard(guard)
}

fn store(app: &AppHandle) -> Store {
  st(app).store.clone().expect("store is set up before any window opens")
}

fn quitting(app: &AppHandle) -> bool {
  st(app).quitting
}

fn is_korean(app: &AppHandle) -> bool {
  store(app).language() != "en"
}

/// Window creation from the main thread (menu events, the single-instance callback) runs here.
fn bg(app: &AppHandle, work: impl FnOnce(&AppHandle) + Send + 'static) {
  let app = app.clone();
  std::thread::spawn(move || work(&app));
}

fn later(app: &AppHandle, delay: Duration, work: impl FnOnce(&AppHandle) + Send + 'static) {
  let app = app.clone();
  std::thread::spawn(move || {
    std::thread::sleep(delay);
    if !quitting(&app) {
      work(&app);
    }
  });
}

fn win(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
  app.get_webview_window(label)
}

fn is_pad(label: &str) -> bool {
  label.starts_with(PAD_PREFIX)
}

// ── Events (main → window) ──────────────────────────────────────────────
//
// Electron sent these after did-finish-load, when the page already listened. Here an event
// posted before the page listens is queued and handed over when it starts (bridge_listen).

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

fn broadcast(app: &AppHandle, event: &str, payload: Value, skip_settings: bool) {
  let mut labels: Vec<String> = st(app).pads.keys().cloned().collect();
  if win(app, LIST).is_some() {
    labels.push(LIST.into());
  }
  if !skip_settings && win(app, SETTINGS).is_some() {
    labels.push(SETTINGS.into());
  }
  for label in labels {
    post(app, &label, event, payload.clone());
  }
}

fn broadcast_memos(app: &AppHandle) {
  broadcast(app, "memos:changed", json!(store(app).load_memos()), false);
}

fn send_to_owner(app: &AppHandle, event: &str, payload: Value) {
  let owner = st(app).settings.as_ref().and_then(|s| s.owner.clone());
  if let Some(owner) = owner.filter(|o| win(app, o).is_some()) {
    post(app, &owner, event, payload);
  }
}

fn forget_window(app: &AppHandle, label: &str) {
  let mut s = st(app);
  s.listening.remove(label);
  s.queued.remove(label);
}

// ── Windows ─────────────────────────────────────────────────────────────

struct Spec {
  label: String,
  query: String,
  title: String,
  size: (f64, f64),
  min: (f64, f64),
  position: Option<(f64, f64)>,
  back: (u8, u8, u8),
  parent: Option<WebviewWindow>,
}

fn encode_query(text: &str) -> String {
  text.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

fn build_window(app: &AppHandle, spec: Spec) -> tauri::Result<WebviewWindow> {
  let url = WebviewUrl::App(format!("index.html?{}", spec.query).into());
  let (r, g, b) = spec.back;
  let mut builder = WebviewWindowBuilder::new(app, &spec.label, url)
    .title(&spec.title)
    .inner_size(spec.size.0, spec.size.1)
    .min_inner_size(spec.min.0, spec.min.1)
    .decorations(false)
    .resizable(true)
    .maximizable(false)
    .minimizable(true)
    .visible(false)
    .background_color(Color(r, g, b, 0xFF))
    .zoom_hotkeys_enabled(false)
    .on_page_load(|w, payload| {
      // A reloaded page listens from scratch.
      if let PageLoadEvent::Started = payload.event() {
        let app = w.app_handle().clone();
        st(&app).listening.remove(w.label());
      }
    });
  builder = match spec.position {
    Some((x, y)) => builder.position(x, y),
    None => builder.center(),
  };
  if let Some(parent) = &spec.parent {
    builder = builder.parent(parent)?;
  }
  if let Some(dir) = st(app).webview_dir.clone() {
    builder = builder.data_directory(dir);
  }
  let w = builder.build()?;
  native::apply_window_icon(&w);
  let handle = app.clone();
  let label = spec.label.clone();
  w.on_window_event(move |event| on_window_event(&handle, &label, event));
  Ok(w)
}

fn show_window(w: &WebviewWindow) {
  if w.is_minimized().unwrap_or(false) {
    let _ = w.unminimize();
  }
  let _ = w.show();
  let _ = w.set_focus();
}

/// Electron's offsetFrom(): a point `dx, dy` (logical) from another window's top-left.
fn offset_from(w: Option<&WebviewWindow>, dx: f64, dy: f64) -> Option<(f64, f64)> {
  let w = w?;
  let scale = w.scale_factor().ok()?;
  let pos = w.outer_position().ok()?;
  Some((pos.x as f64 / scale + dx, pos.y as f64 / scale + dy))
}

fn on_window_event(app: &AppHandle, label: &str, event: &WindowEvent) {
  match event {
    WindowEvent::CloseRequested { api, .. } => {
      if is_pad(label) {
        persist_pad(app, label);
        let is_host = st(app).pads.get(label).is_some_and(|p| p.is_host);
        if is_host && !quitting(app) {
          api.prevent_close();
          if let Some(w) = win(app, label) {
            let _ = w.hide();
          }
        }
      } else if label == SETTINGS {
        let snapshot = {
          let s = st(app);
          s.settings.as_ref().filter(|s| !s.committed).map(|s| s.context.clone())
        };
        if let Some(snapshot) = snapshot {
          send_to_owner(app, "settings:command", json!({ "type": "cancel", "snapshot": snapshot }));
        }
      }
    }
    WindowEvent::Destroyed => {
      forget_window(app, label);
      let mut s = st(app);
      if is_pad(label) {
        s.pads.remove(label);
        if s.host.as_deref() == Some(label) {
          s.host = None;
        }
      } else if label == SETTINGS {
        s.settings = None;
        s.settings_shown = false;
      }
    }
    _ => {}
  }
}

/// Saves what the pad last reported (pad_state) — on close, hide and quit.
fn persist_pad(app: &AppHandle, label: &str) {
  let (index, memo, html, look) = {
    let s = st(app);
    let Some(p) = s.pads.get(label) else { return };
    if p.html.is_empty() {
      return;
    }
    (p.source_index, p.source_memo.clone(), p.html.clone(), p.look.clone())
  };
  let store = store(app);
  let result = store.upsert_memo(index, memo.as_deref(), &html);
  if let Some(p) = st(app).pads.get_mut(label) {
    p.source_index = result.source_index;
    p.source_memo = result.source_memo.clone();
    p.empty = store::is_blank_html(&html);
  }
  if result.source_index >= 0 {
    if let Some(look) = look {
      store.set_look(result.source_index, &look, result.items.len());
    }
  }
  if result.updated || result.source_index >= 0 {
    broadcast_memos(app);
  }
}

#[derive(Default)]
struct PadOpen {
  source_index: i64,
  html: String,
  file: Option<Value>,
  look: Option<Value>,
  from: Option<WebviewWindow>,
  offset: (f64, f64),
  show: bool,
}

fn create_pad(app: &AppHandle, open: PadOpen) -> Option<String> {
  let store = store(app);
  let settings = store.load_settings();
  let look = open.look.unwrap_or_else(|| store.get_look(open.source_index, store.load_memos().len()));
  let (label, is_host) = {
    let mut s = st(app);
    s.next_pad += 1;
    let label = format!("{PAD_PREFIX}{}", s.next_pad);
    let is_host = s.host.is_none();
    if is_host {
      s.host = Some(label.clone());
    }
    let payload = json!({
      "id": label,
      "sourceIndex": open.source_index,
      "html": open.html,
      "file": open.file,
      "look": look,
      "settings": settings,
    });
    s.pads.insert(
      label.clone(),
      Pad {
        is_host,
        source_index: open.source_index,
        source_memo: None,
        empty: store::is_blank_html(&open.html),
        html: open.html.clone(),
        look: Some(look),
        initial: Some(payload),
        show_when_ready: open.show,
      },
    );
    (label, is_host)
  };
  let spec = Spec {
    label: label.clone(),
    query: format!("role=pad&id={}&lang={}", encode_query(&label), settings["language"].as_str().unwrap_or("ko")),
    title: APP_NAME.into(),
    size: (428.0, 406.0),
    min: (320.0, 280.0),
    position: offset_from(open.from.as_ref(), open.offset.0, open.offset.1),
    back: PAD_BACK,
    parent: None,
  };
  match build_window(app, spec) {
    Ok(_) => Some(label),
    Err(error) => {
      eprintln!("[{APP_NAME}] could not open a memo window: {error}");
      let mut s = st(app);
      s.pads.remove(&label);
      if is_host {
        s.host = None;
      }
      None
    }
  }
}

fn host_window(app: &AppHandle) -> Option<WebviewWindow> {
  let host = st(app).host.clone();
  host.and_then(|h| win(app, &h))
}

fn sorted_pads(app: &AppHandle) -> Vec<String> {
  let mut labels: Vec<String> = st(app).pads.keys().cloned().collect();
  labels.sort_by_key(|l| l[PAD_PREFIX.len()..].parse::<u64>().unwrap_or(0));
  labels
}

fn show_list(app: &AppHandle) {
  if let Some(w) = win(app, LIST) {
    show_window(&w);
    return;
  }
  st(app).list_show_pending = true;
  let lang = store(app).language();
  let spec = Spec {
    label: LIST.into(),
    query: format!("role=list&lang={lang}"),
    title: if lang == "en" { "Memo List".into() } else { "메모 목록".into() },
    size: (420.0, 560.0),
    min: (360.0, 400.0),
    position: None,
    back: PAD_BACK,
    parent: None,
  };
  if let Err(error) = build_window(app, spec) {
    eprintln!("[{APP_NAME}] could not open the memo list: {error}");
  }
}

fn load_payload(app: &AppHandle, label: &str, index: i64, html: &str, look: Value) -> Value {
  json!({ "id": label, "sourceIndex": index, "html": html, "look": look, "settings": store(app).load_settings() })
}

fn open_memo_by_index(app: &AppHandle, index: i64) -> bool {
  let store = store(app);
  let memos = store.load_memos();
  if index < 0 || index as usize >= memos.len() {
    return false;
  }
  let html = memos[index as usize].clone();
  let look = store.get_look(index, memos.len());

  // Already open → bring it forward and reload it.
  let existing = sorted_pads(app).into_iter().find(|l| st(app).pads.get(l).is_some_and(|p| p.source_index == index) && win(app, l).is_some());
  if let Some(label) = existing {
    if let Some(w) = win(app, &label) {
      show_window(&w);
    }
    post(app, &label, "pad:load", load_payload(app, &label, index, &html, look));
    return true;
  }

  // An empty, visible pad that was never saved → reuse it.
  let empty = sorted_pads(app).into_iter().find(|l| {
    let blank = st(app).pads.get(l).is_some_and(|p| p.source_index < 0 && p.empty);
    blank && win(app, l).is_some_and(|w| w.is_visible().unwrap_or(false))
  });
  if let Some(label) = empty {
    if let Some(p) = st(app).pads.get_mut(&label) {
      p.source_index = index;
      p.empty = false;
    }
    if let Some(w) = win(app, &label) {
      show_window(&w);
    }
    post(app, &label, "pad:load", load_payload(app, &label, index, &html, look));
    return true;
  }

  create_pad(app, PadOpen { source_index: index, html, look: Some(look), from: host_window(app), offset: (-30.0, -30.0), show: true, ..Default::default() });
  true
}

fn open_blank_memo(app: &AppHandle, from: Option<WebviewWindow>) {
  let store = store(app);
  let look = store.get_look(-1, store.load_memos().len());
  create_pad(app, PadOpen { source_index: -1, look: Some(look), from, offset: (30.0, 30.0), show: true, ..Default::default() });
}

fn open_external_text(app: &AppHandle, path: &Path, from: Option<WebviewWindow>) -> Value {
  if !path.is_file() {
    return json!({ "ok": false, "error": "missing" });
  }
  let Ok(bytes) = std::fs::read(path) else {
    return json!({ "ok": false, "error": "failed" });
  };
  let content = String::from_utf8_lossy(&bytes).trim_start_matches('\u{feff}').to_string();
  let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy().to_lowercase())).unwrap_or_default();
  let store = store(app);
  let mut look = store.get_look(-1, store.load_memos().len());
  look["transparencyPercent"] = json!(0);
  create_pad(
    app,
    PadOpen { source_index: -1, file: Some(json!({ "ext": ext, "content": content })), look: Some(look), from, offset: (-30.0, -30.0), show: true, ..Default::default() },
  );
  json!({ "ok": true })
}

fn show_existing_host(app: &AppHandle) {
  if let Some(w) = host_window(app) {
    show_window(&w);
    return;
  }
  if let Some(w) = sorted_pads(app).iter().find_map(|l| win(app, l)) {
    show_window(&w);
    return;
  }
  if let Some(w) = win(app, LIST) {
    show_window(&w);
    return;
  }
  // Every pad is gone (closed from the taskbar, say) — start a new host pad.
  create_pad(app, PadOpen { source_index: -1, show: true, ..Default::default() });
}

fn arg_value(args: &[String], name: &str) -> Option<String> {
  let i = args.iter().position(|a| a.eq_ignore_ascii_case(name))?;
  args.get(i + 1).cloned()
}

/// Command-line requests: `--list`, `--new`, `--open-index N`, `--open-file PATH`.
/// Returns false when there was none.
fn handle_launch_args(app: &AppHandle, args: &[String]) -> bool {
  if let Some(file) = arg_value(args, "--open-file") {
    open_external_text(app, Path::new(&file), host_window(app));
    return true;
  }
  if let Some(index) = arg_value(args, "--open-index").and_then(|v| v.parse::<i64>().ok()) {
    open_memo_by_index(app, index);
    return true;
  }
  if args.iter().any(|a| a == "--list") {
    show_list(app);
    return true;
  }
  if args.iter().any(|a| a == "--new") {
    open_blank_memo(app, host_window(app));
    return true;
  }
  false
}

/// A second launch: forward its request, or bring the running copy forward.
fn focus_existing_instance(app: &AppHandle, argv: Vec<String>) {
  let args: Vec<String> = argv.into_iter().skip(1).collect();
  // The login entry firing while we already run changes nothing.
  if args.iter().any(|a| a.eq_ignore_ascii_case(STARTUP_ARG)) {
    return;
  }
  if !handle_launch_args(app, &args) {
    show_existing_host(app);
  }
}

fn quit_application(app: &AppHandle) {
  if st(app).quitting {
    return;
  }
  // app.exit() closes windows without CloseRequested, so save every pad first.
  for label in sorted_pads(app) {
    persist_pad(app, &label);
  }
  st(app).quitting = true;
  if let Some(tray) = app.remove_tray_by_id(TRAY_ID) {
    let _ = tray.set_visible(false);
  }
  app.exit(0);
}

// ── Settings window ─────────────────────────────────────────────────────

fn open_settings(app: &AppHandle, owner: WebviewWindow, context: Value) {
  st(app).settings = Some(SettingsSession { owner: Some(owner.label().to_string()), context: context.clone(), committed: false });
  if let Some(w) = win(app, SETTINGS) {
    post(app, SETTINGS, "settings:load", context);
    show_window(&w);
    return;
  }
  st(app).settings_shown = false;
  let lang = store(app).language();
  let spec = Spec {
    label: SETTINGS.into(),
    query: format!("role=settings&lang={lang}"),
    title: if lang == "en" { "Font & Display Settings".into() } else { "폰트 및 표시 설정".into() },
    size: (500.0, 480.0),
    min: (420.0, 240.0),
    position: offset_from(Some(&owner), 40.0, 20.0),
    back: SETTINGS_BACK,
    parent: Some(owner),
  };
  if let Err(error) = build_window(app, spec) {
    eprintln!("[{APP_NAME}] could not open settings: {error}");
  }
}

/// The settings page measured the height it needs — fit the window to it, then show it.
fn fit_settings(app: &AppHandle, w: &WebviewWindow, needed: f64) {
  if !needed.is_finite() || needed < 200.0 {
    return;
  }
  let scale = w.scale_factor().unwrap_or(1.0);
  let work = w.current_monitor().ok().flatten().map(|m| m.work_area().size.height as f64 / m.scale_factor()).unwrap_or(1080.0);
  let width = w.inner_size().map(|s| s.width as f64 / scale).unwrap_or(500.0);
  let height = (needed + 2.0).min(work - 24.0);
  let _ = w.set_min_size(None::<LogicalSize<f64>>);
  let _ = w.set_max_size(None::<LogicalSize<f64>>);
  let _ = w.set_size(LogicalSize::new(width, height));
  let _ = w.set_min_size(Some(LogicalSize::new(420.0, height)));
  let _ = w.set_max_size(Some(LogicalSize::new(2000.0, height)));
  let first = {
    let mut s = st(app);
    !std::mem::replace(&mut s.settings_shown, true)
  };
  if first {
    show_window(w);
  }
}

fn close_settings(app: &AppHandle) {
  if let Some(w) = win(app, SETTINGS) {
    let _ = w.close();
  }
}

// ── Tray ────────────────────────────────────────────────────────────────

fn autostart_enabled(app: &AppHandle) -> bool {
  app.autolaunch().is_enabled().unwrap_or(false)
}

fn set_autostart(app: &AppHandle, enabled: bool) -> bool {
  let launcher = app.autolaunch();
  let _ = if enabled { launcher.enable() } else { launcher.disable() };
  native::remove_legacy_login_items();
  autostart_enabled(app)
}

fn menu_icon(bytes: &[u8]) -> Option<Image<'static>> {
  Image::from_bytes(bytes).ok().map(|i| i.to_owned())
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
  let ko = is_korean(app);
  let auto = autostart_enabled(app);
  let item = |id: &str, ko_text: &str, en_text: &str, icon: &[u8]| {
    IconMenuItem::with_id(app, id, if ko { ko_text } else { en_text }, true, menu_icon(icon), None::<&str>)
  };
  let list = item("list", "메모 목록 열기", "Open memo list", ICON_LIST)?;
  let new = item("new", "새 메모", "New memo", ICON_NEW)?;
  let autostart = if auto {
    item("autostart", "시스템 시작 시 자동 실행: 켜짐", "Start with the system: On", ICON_AUTOSTART_ON)?
  } else {
    item("autostart", "시스템 시작 시 자동 실행: 꺼짐", "Start with the system: Off", ICON_AUTOSTART_OFF)?
  };
  let quit = item("quit", "종료", "Exit", ICON_QUIT)?;
  Menu::with_items(app, &[&list, &new, &PredefinedMenuItem::separator(app)?, &autostart, &PredefinedMenuItem::separator(app)?, &quit])
}

fn tray_tooltip(app: &AppHandle) -> &'static str {
  if is_korean(app) {
    "메모 패드"
  } else {
    "Memo Pad"
  }
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
  let mut builder = TrayIconBuilder::with_id(TRAY_ID)
    .tooltip(tray_tooltip(app))
    .menu(&build_tray_menu(app)?)
    // macOS opens the menu on click like the Electron build; elsewhere a click opens the list.
    .show_menu_on_left_click(cfg!(target_os = "macos"));
  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }
  builder
    .on_tray_icon_event(|tray, event| {
      let app = tray.app_handle();
      match event {
        TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => bg(app, show_list),
        TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } if !cfg!(target_os = "macos") => bg(app, show_list),
        _ => {}
      }
    })
    .build(app)?;
  Ok(())
}

fn rebuild_tray(app: &AppHandle) {
  let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
  if let Ok(menu) = build_tray_menu(app) {
    let _ = tray.set_menu(Some(menu));
  }
  let _ = tray.set_tooltip(Some(tray_tooltip(app)));
}

fn on_menu(app: &AppHandle, id: &str) {
  match id {
    "list" => bg(app, show_list),
    "new" => bg(app, |app| open_blank_memo(app, host_window(app))),
    "autostart" => bg(app, |app| {
      let enabled = autostart_enabled(app);
      set_autostart(app, !enabled);
      rebuild_tray(app);
    }),
    "quit" => bg(app, quit_application),
    _ => {}
  }
}

// ── Commands (window.desktopAPI, src/js/bridge.js) ─────────────────────
//
// Commands that open, show or close windows are async: a sync command runs on the main thread,
// and building a webview there waits on itself on Windows.

#[tauri::command]
fn bridge_listen(app: AppHandle, window: WebviewWindow, event: String) -> Vec<Value> {
  let mut s = st(&app);
  let label = window.label().to_string();
  s.listening.entry(label.clone()).or_default().insert(event.clone());
  s.queued.get_mut(&label).and_then(|events| events.remove(&event)).map(Vec::from).unwrap_or_default()
}

/// The page finished booting (src/js/app.js) — hand it its first payload and show it.
#[tauri::command]
async fn window_ready(app: AppHandle, window: WebviewWindow) {
  let label = window.label().to_string();
  if is_pad(&label) {
    let (payload, show) = {
      let mut s = st(&app);
      match s.pads.get_mut(&label) {
        Some(p) => (p.initial.take(), std::mem::take(&mut p.show_when_ready)),
        None => (None, false),
      }
    };
    if let Some(payload) = payload {
      post(&app, &label, "pad:load", payload);
    }
    if show {
      show_window(&window);
    }
  } else if label == LIST {
    let store = store(&app);
    post(&app, LIST, "settings:changed", store.load_settings());
    post(&app, LIST, "memos:changed", json!(store.load_memos()));
    if std::mem::take(&mut st(&app).list_show_pending) {
      show_window(&window);
    }
  } else if label == SETTINGS {
    let context = st(&app).settings.as_ref().map(|s| s.context.clone());
    if let Some(context) = context {
      post(&app, SETTINGS, "settings:load", context);
    }
    // The page fits and shows itself (window_fit_settings); this is the fallback.
    later(&app, Duration::from_millis(700), |app| {
      let first = {
        let mut s = st(app);
        !std::mem::replace(&mut s.settings_shown, true)
      };
      if first {
        if let Some(w) = win(app, SETTINGS) {
          show_window(&w);
        }
      }
    });
  }
}

#[tauri::command]
fn app_get_info(app: AppHandle) -> Value {
  let platform = if cfg!(windows) {
    "win32"
  } else if cfg!(target_os = "macos") {
    "darwin"
  } else {
    "linux"
  };
  json!({
    "name": APP_NAME,
    "version": app.package_info().version.to_string(),
    "platform": platform,
    "packaged": !cfg!(debug_assertions),
    "language": store(&app).language(),
  })
}

#[tauri::command]
async fn app_quit(app: AppHandle) {
  quit_application(&app);
}

#[tauri::command]
fn clipboard_write_text(app: AppHandle, text: Option<String>) -> bool {
  app.clipboard().write_text(text.unwrap_or_default()).is_ok()
}

#[tauri::command]
fn clipboard_read_text(app: AppHandle) -> String {
  app.clipboard().read_text().unwrap_or_default()
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool {
  autostart_enabled(&app)
}

#[tauri::command]
fn autostart_set(app: AppHandle, enabled: bool) -> bool {
  let now = set_autostart(&app, enabled);
  rebuild_tray(&app);
  now
}

#[tauri::command]
async fn window_minimize(window: WebviewWindow) {
  let _ = window.minimize();
}

#[tauri::command]
async fn window_close(app: AppHandle, window: WebviewWindow) {
  let label = window.label().to_string();
  let is_host = st(&app).pads.get(&label).is_some_and(|p| p.is_host);
  if is_host {
    let _ = window.hide();
  } else {
    let _ = window.close();
  }
}

#[tauri::command]
async fn window_fit_settings(app: AppHandle, window: WebviewWindow, height: f64) {
  if window.label() == SETTINGS {
    fit_settings(&app, &window, height);
  }
}

#[tauri::command]
fn window_set_opacity(window: WebviewWindow, opacity: f64) -> f64 {
  native::set_opacity(&window, opacity);
  native::clamp_opacity(opacity)
}

/// Moves the window with the OS (snap included) while the mouse button is held.
#[tauri::command]
async fn window_start_drag(window: WebviewWindow) {
  let _ = window.start_dragging();
}

#[tauri::command]
fn memos_get(app: AppHandle) -> Vec<String> {
  store(&app).load_memos()
}

#[tauri::command]
fn memos_save(app: AppHandle, items: Vec<Value>) -> Vec<String> {
  let list = store(&app).save_memos(&items);
  broadcast_memos(&app);
  list
}

#[tauri::command]
fn settings_get(app: AppHandle) -> Value {
  store(&app).load_settings()
}

#[tauri::command]
fn settings_save(app: AppHandle, data: Value) -> Value {
  let next = store(&app).save_settings(&data);
  broadcast(&app, "settings:changed", next.clone(), false);
  broadcast(&app, "settings:language", next["language"].clone(), false);
  rebuild_tray(&app);
  next
}

#[tauri::command]
fn look_get(app: AppHandle, index: i64) -> Value {
  let store = store(&app);
  store.get_look(index, store.load_memos().len())
}

#[tauri::command]
fn look_set(app: AppHandle, index: i64, look: Value) -> Value {
  let store = store(&app);
  let count = store.load_memos().len();
  store.set_look(index, &look, count);
  store.get_look(index, count)
}

#[tauri::command]
fn look_remove(app: AppHandle, index: i64) -> bool {
  store(&app).remove_look_at(index);
  true
}

#[tauri::command]
async fn pad_open_new(app: AppHandle, window: WebviewWindow) {
  open_blank_memo(&app, Some(window));
}

#[tauri::command]
async fn pad_open_index(app: AppHandle, index: i64) -> bool {
  open_memo_by_index(&app, index)
}

#[tauri::command]
async fn pad_open_file(app: AppHandle, window: WebviewWindow) -> Value {
  let ko = is_korean(&app);
  let picked = app
    .dialog()
    .file()
    .set_title(if ko { "텍스트 파일 불러오기" } else { "Open a text file" })
    .add_filter(if ko { "텍스트 파일" } else { "Text files" }, &["txt", "rtf", "html", "md"])
    .add_filter(if ko { "모든 파일" } else { "All files" }, &["*"])
    .set_parent(&window)
    .blocking_pick_file();
  match picked.and_then(|p| p.into_path().ok()) {
    Some(path) => open_external_text(&app, &path, Some(window)),
    None => json!({ "ok": false, "canceled": true }),
  }
}

#[tauri::command]
async fn list_show(app: AppHandle) {
  show_list(&app);
}

#[tauri::command]
async fn settings_open(app: AppHandle, window: WebviewWindow, context: Option<Value>) {
  open_settings(&app, window, context.unwrap_or_else(|| json!({})));
}

#[tauri::command]
fn settings_get_context(app: AppHandle) -> Value {
  st(&app).settings.as_ref().map(|s| s.context.clone()).unwrap_or(Value::Null)
}

#[tauri::command]
fn settings_command(app: AppHandle, cmd: Value) {
  let kind = cmd["type"].as_str().unwrap_or_default().to_string();
  match kind.as_str() {
    "commit" => {
      if let Some(s) = st(&app).settings.as_mut() {
        s.committed = true;
      }
      if let Some(back) = cmd["look"]["editorBackColor"].as_str().filter(|c| !c.is_empty()) {
        let store = store(&app);
        let mut patch = cmd["settings"].clone();
        if !patch.is_object() {
          patch = json!({});
        }
        let form = cmd["look"]["formBackColor"].as_str().filter(|c| !c.is_empty()).unwrap_or(back);
        patch["editorBackColor"] = json!(back);
        patch["formBackColor"] = json!(form);
        store.save_settings(&patch);
        store.apply_back_color_to_all_looks(&json!(back));
        broadcast(&app, "settings:previewColor", json!(back), true);
        broadcast(&app, "settings:changed", store.load_settings(), false);
      }
      send_to_owner(&app, "settings:command", cmd);
      close_settings(&app);
    }
    "cancel" => {
      let snapshot = st(&app).settings.as_ref().map(|s| s.context.clone()).unwrap_or_else(|| cmd["snapshot"].clone());
      send_to_owner(&app, "settings:command", json!({ "type": "cancel", "snapshot": snapshot }));
      broadcast(&app, "settings:restoreLooks", Value::Null, true);
      if let Some(s) = st(&app).settings.as_mut() {
        s.committed = true;
      }
      close_settings(&app);
    }
    _ => {
      send_to_owner(&app, "settings:command", cmd.clone());
      if kind == "previewColor" {
        broadcast(&app, "settings:previewColor", cmd["color"].clone(), true);
      }
      if kind == "language" {
        broadcast(&app, "settings:language", cmd["language"].clone(), false);
      }
    }
  }
}

#[tauri::command]
async fn pad_hide(window: WebviewWindow) {
  let _ = window.hide();
}

#[tauri::command]
fn pad_state(app: AppHandle, window: WebviewWindow, state: Value) {
  let mut s = st(&app);
  let Some(p) = s.pads.get_mut(window.label()) else { return };
  if let Some(n) = state["sourceIndex"].as_f64() {
    p.source_index = n as i64;
  }
  if let Some(b) = state["empty"].as_bool() {
    p.empty = b;
  }
  if let Some(html) = state["html"].as_str() {
    p.html = html.to_string();
  }
  match &state["sourceMemo"] {
    Value::String(m) => p.source_memo = Some(m.clone()),
    Value::Null if state.get("sourceMemo").is_some() => p.source_memo = None,
    _ => {}
  }
  if state["look"].is_object() {
    p.look = Some(state["look"].clone());
  }
}

#[tauri::command]
fn preview_color(app: AppHandle, color: Value) {
  broadcast(&app, "settings:previewColor", color, true);
}

// ── Start-up ────────────────────────────────────────────────────────────

/// (data folder, Electron-era folder to import from, isolated?)
///
/// The data folder is the packaged Electron build's userData (%APPDATA%\MyMemoPad,
/// ~/Library/Application Support/MyMemoPad, ~/.config/MyMemoPad); its unpackaged runs used
/// "my-memopad-multios". MYMEMOPAD_CONFIG_DIR points a test run somewhere else entirely.
fn data_dirs(app: &AppHandle, multi: bool) -> (PathBuf, Option<PathBuf>, bool) {
  if let Some(dir) = std::env::var_os("MYMEMOPAD_CONFIG_DIR").filter(|d| !d.is_empty()) {
    return (PathBuf::from(dir), None, true);
  }
  let base = app.path().config_dir().unwrap_or_else(|_| std::env::temp_dir());
  let dir = base.join(APP_NAME);
  if multi {
    return (base.join(format!("{APP_NAME}-pid-{}", std::process::id())), None, true);
  }
  (dir, Some(base.join("my-memopad-multios")), false)
}

fn multi_instance_requested(args: &[String]) -> bool {
  // Installed builds are always single-instance; --multi is for development runs only.
  cfg!(debug_assertions)
    && (args.iter().any(|a| a == "--multi") || matches!(std::env::var("MYMEMOPAD_MULTI").unwrap_or_default().to_lowercase().as_str(), "1" | "true" | "yes"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let args: Vec<String> = std::env::args().collect();
  let multi = multi_instance_requested(&args);
  let start_in_tray = args.iter().any(|a| a.eq_ignore_ascii_case(STARTUP_ARG));

  let mut builder = tauri::Builder::default();
  if !multi {
    // Must be the first plugin.
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      let argv = argv.clone();
      bg(app, move |app| focus_existing_instance(app, argv));
    }));
  }
  let app = builder
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![STARTUP_ARG])))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .manage::<Shared>(Mutex::new(State::default()))
    .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
    .invoke_handler(tauri::generate_handler![
      bridge_listen,
      window_ready,
      app_get_info,
      app_quit,
      clipboard_write_text,
      clipboard_read_text,
      autostart_get,
      autostart_set,
      window_minimize,
      window_close,
      window_fit_settings,
      window_set_opacity,
      window_start_drag,
      memos_get,
      memos_save,
      settings_get,
      settings_save,
      look_get,
      look_set,
      look_remove,
      pad_open_new,
      pad_open_index,
      pad_open_file,
      list_show,
      settings_open,
      settings_get_context,
      settings_command,
      pad_hide,
      pad_state,
      preview_color,
    ])
    .setup(move |app| {
      let handle = app.handle().clone();
      let (dir, legacy, isolated) = data_dirs(&handle, multi);
      let store = Store::new(dir);
      if let Some(legacy) = legacy {
        if store.migrate_from(&legacy) {
          println!("[{APP_NAME}] imported memos from {}", legacy.display());
        }
      }
      {
        let mut s = st(&handle);
        s.webview_dir = isolated.then(|| store.dir().join("webview"));
        s.store = Some(store);
      }

      // Point an existing login entry at this executable, and drop the Electron build's.
      // (Development runs never take over the user's login entry.)
      if !cfg!(debug_assertions) && !isolated {
        if autostart_enabled(&handle) {
          let _ = handle.autolaunch().enable();
        }
        native::remove_legacy_login_items();
      }

      if let Err(error) = create_tray(&handle) {
        eprintln!("[{APP_NAME}] could not create the tray icon: {error}");
      }
      // The host pad; a login start keeps it hidden so only the tray icon appears.
      create_pad(&handle, PadOpen { source_index: -1, show: !start_in_tray, ..Default::default() });
      if !start_in_tray {
        let rest: Vec<String> = args.iter().skip(1).cloned().collect();
        bg(&handle, move |app| {
          handle_launch_args(app, &rest);
        });
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("MyMemoPad could not start");

  app.run(|app, event| match event {
    // Closing every window keeps the app in the tray; Exit in the tray menu is the way out.
    RunEvent::ExitRequested { api, code, .. } => {
      if code.is_none() && !quitting(app) {
        api.prevent_exit();
      }
    }
    #[cfg(target_os = "macos")]
    RunEvent::Reopen { has_visible_windows, .. } => {
      if has_visible_windows {
        bg(app, show_list);
      } else {
        bg(app, show_existing_host);
      }
    }
    _ => {}
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  fn strings(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
  }

  #[test]
  fn launch_arguments_are_parsed() {
    let args = strings(&["--open-index", "3", "--x"]);
    assert_eq!(arg_value(&args, "--open-index").as_deref(), Some("3"));
    assert_eq!(arg_value(&args, "--OPEN-INDEX").as_deref(), Some("3"));
    assert_eq!(arg_value(&args, "--x"), None);
    assert_eq!(arg_value(&args, "--open-file"), None);
  }

  #[test]
  fn query_values_are_escaped() {
    assert_eq!(encode_query("pad-12"), "pad-12");
    assert_eq!(encode_query("a b&c"), "a%20b%26c");
  }

  #[test]
  fn multi_instance_needs_a_flag() {
    if std::env::var_os("MYMEMOPAD_MULTI").is_none() {
      assert!(!multi_instance_requested(&strings(&["MyMemoPad.exe"])));
    }
    assert_eq!(multi_instance_requested(&strings(&["MyMemoPad.exe", "--multi"])), cfg!(debug_assertions));
  }
}
