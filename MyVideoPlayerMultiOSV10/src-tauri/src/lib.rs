//! MyVideoPlayer on Tauri 2. The renderer (src/) is unchanged from the Electron build:
//! bridge.js rebuilds `window.desktopAPI`, and every call lands in the `vp` command below
//! under its old IPC channel name. Pages are served by server.rs over http://127.0.0.1.

mod auth;
mod compat;
mod download;
mod native;
mod persist;
mod rtsp;
mod server;
mod subs;
mod tools;

use download::{DlError, Progress};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::webview::PageLoadEvent;
use tauri::{
  AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, Theme, WebviewUrl, WebviewWindow,
  WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

const APP_NAME: &str = "MyVideoPlayer";
const AUTHOR: &str = "SHKWON";
const AUTHOR_EMAIL: &str = "knix008@naver.com";
const OPEN_DIR_KEY: &str = "dialog.lastOpenDir";
const SAVE_DIR_KEY: &str = "dialog.lastSaveDir";
const APP_WINDOWS: [&str; 3] = ["main", "spectrum", "history"];

const MEDIA_EXTS: [&str; 17] = [
  "mp4", "m4v", "webm", "mkv", "mov", "avi", "ogv", "hevc", "h265", "mp3", "aac", "m4a", "wav", "flac", "opus", "ogg", "wma",
];
const DIALOG_MEDIA: [&str; 18] = [
  "mp4", "m4v", "webm", "mkv", "mov", "avi", "ogv", "ogg", "mp3", "aac", "m4a", "wav", "flac", "opus", "wma", "hevc", "h265",
  "h264",
];
const DIALOG_VIDEO: [&str; 9] = ["mp4", "m4v", "webm", "mkv", "mov", "avi", "ogv", "hevc", "h265"];
const DIALOG_AUDIO: [&str; 8] = ["mp3", "aac", "m4a", "wav", "flac", "opus", "ogg", "wma"];

struct Drag {
  label: String,
  offset: (f64, f64),
}

struct AppState {
  store: persist::Store,
  data_dir: PathBuf,
  temp_dir: PathBuf,
  webview_dir: Option<PathBuf>,
  pending_open: Mutex<Vec<String>>,
  open_ready: AtomicBool,
  pending_init: Mutex<HashMap<String, Value>>,
  min_size: Mutex<HashMap<String, (f64, f64)>>,
  opacity: Mutex<HashMap<String, f64>>,
  drag: Mutex<Option<Drag>>,
  restore_group: AtomicBool,
  /// Held from "is it open?" until build(): two quick opens must not make two windows.
  child_lock: Mutex<()>,
  download_busy: AtomicBool,
  main_state: Mutex<(bool, bool)>,
}

fn state(app: &AppHandle) -> tauri::State<'_, AppState> {
  app.state::<AppState>()
}

fn is_media(path: &Path) -> bool {
  path
    .extension()
    .map(|e| e.to_string_lossy().to_ascii_lowercase())
    .is_some_and(|e| MEDIA_EXTS.contains(&e.as_str()))
}

/// Media files among command-line arguments (file association, "Open with", drop).
fn media_paths(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
  args
    .into_iter()
    .filter(|a| !a.starts_with('-'))
    .map(|a| {
      let p = PathBuf::from(&a);
      if p.is_absolute() {
        p
      } else {
        cwd.join(p)
      }
    })
    .filter(|p| is_media(p) && p.is_file())
    .map(|p| std::path::absolute(&p).unwrap_or(p).to_string_lossy().into_owned())
    .collect()
}

fn open_paths(app: &AppHandle, paths: Vec<String>) {
  if paths.is_empty() {
    return;
  }
  // Until the page has its listener up (it then asks with open:takePending), keep them.
  let st = state(app);
  let mut pending = st.pending_open.lock().unwrap();
  if st.open_ready.load(Ordering::SeqCst) {
    drop(pending);
    let _ = app.emit_to("main", "app:openMediaPaths", paths);
  } else {
    pending.extend(paths);
  }
}

fn arg<'a>(args: &'a [Value], i: usize) -> &'a Value {
  args.get(i).unwrap_or(&Value::Null)
}

fn arg_str(args: &[Value], i: usize) -> String {
  match arg(args, i) {
    Value::String(s) => s.clone(),
    Value::Null => String::new(),
    v => v.to_string(),
  }
}

/// The input field of a renderer payload: { url } or { input } (or a bare string).
fn payload_input(p: &Value) -> String {
  match p {
    Value::String(s) => s.trim().to_string(),
    _ => p
      .get("url")
      .or_else(|| p.get("input"))
      .and_then(|v| v.as_str())
      .unwrap_or("")
      .trim()
      .to_string(),
  }
}

fn file_name(p: &Path) -> String {
  p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn ext_of(p: &Path) -> String {
  p.extension().map(|e| format!(".{}", e.to_string_lossy().to_ascii_lowercase())).unwrap_or_default()
}

// ── Windows ─────────────────────────────────────────────────────

fn bridge_script() -> String {
  format!(
    "window.__VP__ = {};\n{}",
    json!({ "persistPath": server::persist_path() }),
    include_str!("bridge.js")
  )
}

fn base_builder<'a>(app: &'a AppHandle, label: &'a str, page: &str) -> Result<WebviewWindowBuilder<'a, tauri::Wry, AppHandle>, String> {
  let url = server::page_url(page).parse().map_err(|e| format!("{e}"))?;
  let mut b = WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
    .decorations(false)
    .visible(false)
    .background_color(tauri::window::Color(0x12, 0x14, 0x18, 0xff))
    .initialization_script(bridge_script())
    .on_page_load(|w, p| {
      if p.event() == PageLoadEvent::Started && w.label() == "main" {
        w.state::<AppState>().open_ready.store(false, Ordering::SeqCst);
      }
      if p.event() == PageLoadEvent::Finished && !w.is_visible().unwrap_or(true) {
        let _ = w.show();
        let _ = w.set_focus();
      }
    });
  if let Some(dir) = &state(app).webview_dir {
    b = b.data_directory(dir.clone());
  }
  Ok(b)
}

fn attach_events(app: &AppHandle, win: &WebviewWindow) {
  native::apply_window_icon(win);
  let label = win.label().to_string();
  let handle = app.clone();
  let w = win.clone();
  win.on_window_event(move |event| match event {
    WindowEvent::Resized(_) => {
      let st = state(&handle);
      if st.restore_group.load(Ordering::SeqCst) && !w.is_minimized().unwrap_or(true) {
        restore_all(&handle);
      }
      if label == "main" {
        let now = (w.is_maximized().unwrap_or(false), w.is_fullscreen().unwrap_or(false));
        let mut last = st.main_state.lock().unwrap();
        if now.0 != last.0 {
          let _ = handle.emit_to("main", "window:state", json!({ "maximized": now.0 }));
        }
        if now.1 != last.1 {
          let _ = handle.emit_to("main", "window:state", json!({ "fullscreen": now.1 }));
        }
        *last = now;
      }
    }
    WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) if label == "main" => {
      let list: Vec<String> =
        paths.iter().filter(|p| is_media(p) && p.is_file()).map(|p| p.to_string_lossy().into_owned()).collect();
      open_paths(&handle, list);
    }
    WindowEvent::Destroyed => match label.as_str() {
      "main" => {
        for other in ["spectrum", "history", auth::WINDOW] {
          if let Some(o) = handle.get_webview_window(other) {
            let _ = o.destroy();
          }
        }
      }
      "spectrum" | "history" => {
        let _ = handle.emit_to("main", &format!("{label}:hostEvent"), json!({ "type": "closed" }));
      }
      _ => {}
    },
    _ => {}
  });
}

fn create_main(app: &AppHandle) -> Result<(), String> {
  let win = base_builder(app, "main", "index.html")?
    .title(APP_NAME)
    .inner_size(1280.0, 800.0)
    .min_inner_size(800.0, 420.0)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
  state(app).min_size.lock().unwrap().insert("main".into(), (800.0, 420.0));
  attach_events(app, &win);
  Ok(())
}

fn apply_opacity(app: &AppHandle, win: &WebviewWindow, value: f64) -> f64 {
  let v = native::clamp_opacity(value);
  native::set_opacity(win, v);
  state(app).opacity.lock().unwrap().insert(win.label().to_string(), v);
  v
}

fn opacity_of(app: &AppHandle, label: &str) -> f64 {
  state(app).opacity.lock().unwrap().get(label).copied().unwrap_or(1.0)
}

/// Opens (or focuses) the spectrum / play-list window. The page takes `init` with init:take.
fn open_child(app: &AppHandle, label: &str, init: Value) -> Result<Value, String> {
  let st = state(app);
  let _creating = st.child_lock.lock().unwrap();
  let pct = init.get("opacity").and_then(|v| v.as_f64());
  let has_init = init.as_object().is_some_and(|o| !o.is_empty());
  let message = |init: &Value| {
    let mut m = json!({ "type": "init" });
    if let (Some(dst), Some(src)) = (m.as_object_mut(), init.as_object()) {
      for (k, v) in src {
        dst.insert(k.clone(), v.clone());
      }
    }
    m
  };
  if let Some(win) = app.get_webview_window(label) {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
    if let Some(p) = pct {
      apply_opacity(app, &win, p / 100.0);
    }
    if has_init {
      let _ = app.emit_to(label, &format!("{label}:message"), message(&init));
    }
    return Ok(json!(true));
  }
  let (page, title, w, h, mw, mh) = if label == "spectrum" {
    ("spectrum.html", "Spectrum — MyVideoPlayer", 520.0, 320.0, 320.0, 200.0)
  } else {
    ("history.html", "Play list — MyVideoPlayer", 380.0, 560.0, 300.0, 280.0)
  };
  if has_init {
    state(app).pending_init.lock().unwrap().insert(label.into(), message(&init));
  }
  let win = base_builder(app, label, page)?
    .title(title)
    .inner_size(w, h)
    .min_inner_size(mw, mh)
    .build()
    .map_err(|e| e.to_string())?;
  state(app).min_size.lock().unwrap().insert(label.into(), (mw, mh));
  attach_events(app, &win);
  if let Some(p) = pct {
    apply_opacity(app, &win, p / 100.0);
  }
  Ok(json!(true))
}

fn close_child(app: &AppHandle, label: &str) -> Value {
  if let Some(w) = app.get_webview_window(label) {
    let _ = w.close();
  }
  json!(true)
}

fn focus_child(app: &AppHandle, label: &str) -> Value {
  match app.get_webview_window(label) {
    Some(w) => {
      let _ = w.set_focus();
      json!(true)
    }
    None => json!(false),
  }
}

/// Esc / caption minimize: the player and its satellite windows go down together.
fn minimize_all(app: &AppHandle) {
  let mut any = false;
  for label in APP_WINDOWS {
    if let Some(w) = app.get_webview_window(label) {
      if !w.is_minimized().unwrap_or(false) {
        let _ = w.minimize();
        any = true;
      }
    }
  }
  if any {
    state(app).restore_group.store(true, Ordering::SeqCst);
  }
}

fn restore_all(app: &AppHandle) {
  state(app).restore_group.store(false, Ordering::SeqCst);
  for label in APP_WINDOWS {
    if let Some(w) = app.get_webview_window(label) {
      if w.is_minimized().unwrap_or(false) {
        let _ = w.unminimize();
      }
      if !w.is_visible().unwrap_or(true) {
        let _ = w.show();
      }
    }
  }
}

fn get_bounds(win: &WebviewWindow) -> Value {
  let scale = win.scale_factor().unwrap_or(1.0);
  let (Ok(pos), Ok(size)) = (win.outer_position(), win.inner_size()) else { return Value::Null };
  let pos: LogicalPosition<f64> = pos.to_logical(scale);
  let size: LogicalSize<f64> = size.to_logical(scale);
  json!({ "x": pos.x.round(), "y": pos.y.round(), "width": size.width.round(), "height": size.height.round() })
}

fn set_bounds(app: &AppHandle, win: &WebviewWindow, b: &Value) -> bool {
  if !b.is_object() {
    return false;
  }
  if win.is_maximized().unwrap_or(false) {
    let _ = win.unmaximize();
  }
  let (min_w, min_h) = state(app).min_size.lock().unwrap().get(win.label()).copied().unwrap_or((320.0, 200.0));
  let num = |k: &str| b.get(k).and_then(|v| v.as_f64()).filter(|v| v.is_finite());
  let width = num("width").unwrap_or(480.0).round().max(min_w);
  let height = num("height").unwrap_or(300.0).round().max(min_h);
  if let (Some(x), Some(y)) = (num("x"), num("y")) {
    let _ = win.set_position(LogicalPosition::new(x.round(), y.round()));
  }
  let _ = win.set_size(LogicalSize::new(width, height));
  true
}

fn set_min_size(app: &AppHandle, win: &WebviewWindow, w: f64, h: f64) -> bool {
  // Compact mode may go below the normal toolbar minimum.
  let min_w = if w.is_finite() && w > 0.0 { w.round() } else { 800.0 }.max(320.0);
  let min_h = if h.is_finite() && h > 0.0 { h.round() } else { 420.0 }.max(200.0);
  let _ = win.set_min_size(Some(LogicalSize::new(min_w, min_h)));
  state(app).min_size.lock().unwrap().insert(win.label().into(), (min_w, min_h));
  if let Ok(size) = win.inner_size() {
    let size: LogicalSize<f64> = size.to_logical(win.scale_factor().unwrap_or(1.0));
    if size.width < min_w || size.height < min_h {
      let _ = win.set_size(LogicalSize::new(size.width.max(min_w), size.height.max(min_h)));
    }
  }
  true
}

/// Toolbar drag: the window follows the real cursor (physical pixels throughout, so the
/// invisible resize border and DPI never enter the sums).
fn begin_drag(app: &AppHandle, win: &WebviewWindow) {
  let st = state(app);
  *st.drag.lock().unwrap() = None;
  if win.is_fullscreen().unwrap_or(false) {
    return;
  }
  let Ok(cursor) = win.cursor_position() else { return };
  let Ok(mut pos) = win.outer_position() else { return };
  if win.is_maximized().unwrap_or(false) {
    let before = win.outer_size().ok();
    let _ = win.unmaximize();
    let after = win.outer_size().ok();
    if let (Some(before), Some(after)) = (before, after) {
      let ratio = if before.width > 0 { ((cursor.x - pos.x as f64) / before.width as f64).clamp(0.0, 1.0) } else { 0.5 };
      let scale = win.scale_factor().unwrap_or(1.0);
      let x = (cursor.x - after.width as f64 * ratio).round();
      let y = (cursor.y - (24.0 * scale).min(after.height as f64 / 3.0)).round();
      let _ = win.set_position(PhysicalPosition::new(x as i32, y as i32));
      pos = PhysicalPosition::new(x as i32, y as i32);
    }
  }
  *st.drag.lock().unwrap() =
    Some(Drag { label: win.label().into(), offset: (cursor.x - pos.x as f64, cursor.y - pos.y as f64) });
}

fn update_drag(app: &AppHandle, win: &WebviewWindow) {
  let st = state(app);
  let guard = st.drag.lock().unwrap();
  let Some(drag) = guard.as_ref() else { return };
  if drag.label != win.label() {
    return;
  }
  let Ok(cursor) = win.cursor_position() else { return };
  let _ = win.set_position(PhysicalPosition::new(
    (cursor.x - drag.offset.0).round() as i32,
    (cursor.y - drag.offset.1).round() as i32,
  ));
}

// ── Files and dialogs ───────────────────────────────────────────

fn fallback_media_dir(app: &AppHandle) -> PathBuf {
  let p = app.path();
  p.video_dir().or_else(|_| p.document_dir()).or_else(|_| p.home_dir()).unwrap_or_default()
}

fn remembered_dir(app: &AppHandle, key: &str) -> PathBuf {
  state(app).store.get(key).map(PathBuf::from).filter(|p| p.is_dir()).unwrap_or_else(|| fallback_media_dir(app))
}

fn remember_dir(app: &AppHandle, key: &str, file: &Path) {
  if let Some(dir) = file.parent().filter(|d| d.is_dir()) {
    if state(app).store.set(key, &dir.to_string_lossy()) {
      let _ = app.emit("persist:changed", json!({ "key": key, "value": dir.to_string_lossy() }));
    }
  }
}

fn subtitle_near(media: &Path) -> Value {
  let (Some(dir), Some(stem)) = (media.parent(), media.file_stem()) else { return Value::Null };
  for ext in ["smi", "SMI", "srt", "SRT", "vtt", "VTT"] {
    let p = dir.join(format!("{}.{ext}", stem.to_string_lossy()));
    if p.is_file() {
      return read_subtitle(&p);
    }
  }
  Value::Null
}

fn read_subtitle(p: &Path) -> Value {
  let content = std::fs::read(p).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
  json!({ "path": p, "name": file_name(p), "content": content, "ext": ext_of(p) })
}

fn media_from_path(input: &str) -> Value {
  if input.is_empty() {
    return Value::Null;
  }
  let p = std::path::absolute(input).unwrap_or(PathBuf::from(input));
  if !p.is_file() {
    return json!({ "ok": false, "error": "파일을 찾을 수 없습니다.", "path": p });
  }
  json!({
    "ok": true,
    "path": p,
    "name": file_name(&p),
    "url": server::media_url(&p),
    "size": tools::file_size(&p),
    "ext": ext_of(&p),
    "subtitle": subtitle_near(&p),
    "subtitles": subs::list(&p),
  })
}

fn merge(base: Value, extra: Value) -> Value {
  let mut base = base;
  if let (Some(b), Some(e)) = (base.as_object_mut(), extra.as_object()) {
    for (k, v) in e {
      b.insert(k.clone(), v.clone());
    }
  }
  base
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

fn pick_file(app: &AppHandle, win: &WebviewWindow, title: &str, filters: &[(&str, &[&str])]) -> Option<PathBuf> {
  let mut d = app.dialog().file().set_title(title).set_parent(win).set_directory(remembered_dir(app, OPEN_DIR_KEY));
  for (name, exts) in filters {
    d = d.add_filter(*name, exts);
  }
  d.blocking_pick_file()?.into_path().ok()
}

fn save_file(app: &AppHandle, win: &WebviewWindow, title: &str, name: &str) -> Option<PathBuf> {
  // Automated checks save without the native dialog.
  if let Some(dir) = std::env::var_os("MYVIDEOPLAYER_TEST_SAVE_DIR").filter(|d| !d.is_empty()) {
    return Some(PathBuf::from(dir).join(name));
  }
  app
    .dialog()
    .file()
    .set_title(title)
    .set_parent(win)
    .set_directory(remembered_dir(app, SAVE_DIR_KEY))
    .set_file_name(name)
    .add_filter("MP4 Video", &["mp4"])
    .add_filter("All Files", &["*"])
    .blocking_save_file()?
    .into_path()
    .ok()
}

fn progress_to(app: &AppHandle, event: &'static str) -> Progress {
  let app = app.clone();
  Arc::new(move |p: Value| {
    let _ = app.emit_to("main", event, p);
  })
}

fn stamp() -> String {
  let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
  // UTC yyyy-mm-ddThh-mm-ss, like the Electron build's ISO stamp.
  let days = secs / 86400;
  let (h, m, s) = ((secs % 86400) / 3600, (secs % 3600) / 60, secs % 60);
  let (y, mo, d) = civil_from_days(days as i64);
  format!("{y:04}-{mo:02}-{d:02}T{h:02}-{m:02}-{s:02}")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
  let z = z + 719468;
  let era = z.div_euclid(146097);
  let doe = z.rem_euclid(146097);
  let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
  let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
  (yoe + era * 400 + i64::from(m <= 2), m, d)
}

// ── Downloads ───────────────────────────────────────────────────

/// Runs a download while holding the one-at-a-time flag.
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
  fn drop(&mut self) {
    self.0.store(false, Ordering::SeqCst);
  }
}

async fn youtube_download(app: AppHandle, win: WebviewWindow, payload: Value) -> Result<Value, String> {
  let st = state(&app);
  if st.download_busy.load(Ordering::SeqCst) {
    return Ok(json!({ "ok": false, "error": "이미 다운로드가 진행 중입니다." }));
  }
  let input = payload_input(&payload);
  let Some(url) = download::normalize_watch_url(&input) else {
    return Ok(json!({ "ok": false, "error": "유효한 YouTube 링크가 아닙니다." }));
  };
  let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let mut suggested = tools::sanitize_filename(if title.is_empty() {
    download::extract_video_id(&url).unwrap_or_else(|| "youtube-video".into())
  } else {
    title.clone()
  }
  .as_str());
  if title.is_empty() {
    let u = url.clone();
    if let Ok(Ok(info)) = blocking(move || download::youtube_info(&u)).await {
      if let Some(t) = info.get("title").and_then(|v| v.as_str()) {
        suggested = tools::sanitize_filename(t);
      }
    }
  }
  let (a, w, name) = (app.clone(), win.clone(), format!("{suggested}.mp4"));
  let Some(target) = blocking(move || save_file(&a, &w, "Save YouTube Video", &name)).await? else {
    return Ok(json!({ "ok": false, "cancelled": true }));
  };
  remember_dir(&app, SAVE_DIR_KEY, &target);

  if st.download_busy.swap(true, Ordering::SeqCst) {
    return Ok(json!({ "ok": false, "error": "이미 다운로드가 진행 중입니다." }));
  }
  let _busy = Busy(&st.download_busy);
  let progress = progress_to(&app, "youtube:downloadProgress");
  progress(json!({ "percent": 0, "message": "Starting download…" }));

  // Subtitle language the viewer chose as default ("ko", "en", …).
  let sub_lang = payload.get("subtitleLang").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let data_dir = st.data_dir.clone();
  let a = app.clone();
  let result = blocking(move || {
    let cookies = auth::saved(&data_dir).filter(|s| s.authenticated).map(|s| s.path);
    let downloaded = match download::download_youtube(&url, &target, progress.clone(), cookies.as_deref()) {
      Err(DlError::Failed(msg)) if !msg.contains("yt-dlp is not available") => {
        // Some videos need a signed-in session (age gate / bot check). Ask once.
        progress(json!({ "percent": null, "message": "Sign in to YouTube required for this download…" }));
        match auth::prompt(&a, &data_dir).filter(|s| s.authenticated) {
          Some(signed) => {
            progress(json!({ "percent": null, "message": "Continuing download with signed-in session…" }));
            download::download_youtube(&url, &target, progress.clone(), Some(&signed.path)).map(|r| (r, target))
          }
          None => Err(DlError::Failed(msg)),
        }
      }
      other => other.map(|r| (r, target)),
    };
    // Then the subtitles, saved beside the video under the same name.
    downloaded.map(|(r, target)| {
      let path = r.get("path").and_then(|v| v.as_str()).map(PathBuf::from).unwrap_or(target.clone());
      progress(json!({ "percent": null, "message": "Downloading subtitles…" }));
      let cookies = auth::saved(&data_dir).filter(|s| s.authenticated).map(|s| s.path);
      let tracks = subs::fetch_youtube(&url, &path, &sub_lang, cookies.as_deref());
      (r, target, tracks.len())
    })
  })
  .await?;

  Ok(match result {
    Ok((r, target, subtitle_count)) => {
      let path = r.get("path").and_then(|v| v.as_str()).map(PathBuf::from).unwrap_or(target);
      let size = r.get("size").and_then(|v| v.as_u64()).unwrap_or_else(|| tools::file_size(&path));
      json!({
        "ok": true,
        "path": path,
        "name": r.get("name").and_then(|v| v.as_str()).map(String::from).unwrap_or_else(|| file_name(&path)),
        "size": size,
        "engine": r.get("engine").cloned().unwrap_or(json!("yt-dlp")),
        "stopped": r.get("stopped").and_then(|v| v.as_bool()).unwrap_or(false),
        "partial": r.get("partial").and_then(|v| v.as_bool()).unwrap_or(false),
        "subtitles": subtitle_count,
      })
    }
    Err(DlError::Cancelled) => json!({ "ok": false, "cancelled": true }),
    Err(DlError::Failed(e)) => json!({ "ok": false, "error": e }),
  })
}

async fn remote_open(app: AppHandle, payload: Value) -> Result<Value, String> {
  let url = payload_input(&payload);
  if !download::is_http_url(&url) {
    return Ok(json!({ "ok": false, "error": "유효한 HTTP(S) 링크가 아닙니다." }));
  }
  let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let source = payload.get("sourcePath").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let service = download::detect_service(&url);

  // Reuse a file already downloaded for this link.
  if let Some(cached) = download::find_local_remote(&url, &source) {
    let media = media_from_path(&cached.path.to_string_lossy());
    if media.get("ok").and_then(|v| v.as_bool()) == Some(true) {
      let svc = if cached.service.is_empty() { service.to_string() } else { cached.service.clone() };
      let original = [title.as_str(), cached.title.as_str()].into_iter().find(|s| !s.is_empty()).map(String::from);
      let name = media.get("name").cloned().unwrap_or(Value::Null);
      return Ok(merge(
        media,
        json!({
          "ok": true,
          "sourceUrl": url,
          "service": svc,
          "serviceLabel": download::service_label(&svc),
          "originalTitle": original.map(Value::String).unwrap_or(name),
          "reused": true,
        }),
      ));
    }
  }

  let mut info = if title.is_empty() {
    Value::Null
  } else {
    json!({ "title": title, "service": service, "serviceLabel": download::service_label(service) })
  };
  if info.is_null() {
    let u = url.clone();
    if let Ok(Ok(i)) = blocking(move || download::remote_info(&u)).await {
      info = i;
    }
  }
  let info_title = info.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let target = download::temp_output_path(&state(&app).temp_dir, &url, &info_title);
  let progress = progress_to(&app, "remote:downloadProgress");
  progress(json!({ "percent": 0, "message": "Starting download…" }));
  let u = url.clone();
  let sub_lang = payload.get("subtitleLang").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let result = blocking(move || {
    let r = download::download_remote(&u, &target, progress.clone());
    // A YouTube video played from a file keeps its subtitles next to it.
    if let Ok(done) = &r {
      if download::extract_video_id(&u).is_some() {
        if let Some(p) = done.get("path").and_then(|v| v.as_str()) {
          progress(json!({ "percent": null, "message": "Downloading subtitles…" }));
          subs::fetch_youtube(&u, Path::new(p), &sub_lang, None);
        }
      }
    }
    r
  })
  .await?;
  Ok(match result {
    Ok(r) => {
      let path = r.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let name = r.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let svc = info.get("service").and_then(|v| v.as_str()).unwrap_or(service).to_string();
      download::set_cached_remote(&url, Path::new(&path), if info_title.is_empty() { &name } else { &info_title }, &svc);
      let media = media_from_path(&path);
      if media.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return Ok(json!({ "ok": false, "error": "다운로드된 파일을 열 수 없습니다." }));
      }
      let original = if !info_title.is_empty() { info_title } else if !name.is_empty() { name } else { file_name(Path::new(&path)) };
      merge(
        media,
        json!({
          "ok": true,
          "sourceUrl": url,
          "service": svc,
          "serviceLabel": download::service_label(&svc),
          "originalTitle": original,
        }),
      )
    }
    Err(DlError::Cancelled) => json!({ "ok": false, "cancelled": true }),
    Err(DlError::Failed(e)) => json!({ "ok": false, "error": e }),
  })
}

async fn remote_download(app: AppHandle, win: WebviewWindow, payload: Value) -> Result<Value, String> {
  let st = state(&app);
  if st.download_busy.load(Ordering::SeqCst) {
    return Ok(json!({ "ok": false, "error": "이미 다운로드가 진행 중입니다." }));
  }
  let url = payload_input(&payload);
  if !download::is_http_url(&url) {
    return Ok(json!({ "ok": false, "error": "유효한 HTTP(S) 링크가 아닙니다." }));
  }
  let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let source = payload.get("sourcePath").and_then(|v| v.as_str()).unwrap_or("").to_string();
  // Prefer the file already played / downloaded; download only when there is none.
  let local = download::find_local_remote(&url, &source);
  let (info_title, service) = match &local {
    Some(l) => {
      let t = [title.as_str(), l.title.as_str()].into_iter().find(|s| !s.is_empty()).map(String::from).unwrap_or_else(|| {
        l.path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
      });
      let svc = if l.service.is_empty() { download::detect_service(&url).to_string() } else { l.service.clone() };
      (t, svc)
    }
    None => {
      let u = url.clone();
      let info = blocking(move || download::remote_info(&u)).await?.ok();
      let t = info.as_ref().and_then(|i| i.get("title")).and_then(|v| v.as_str()).unwrap_or("").to_string();
      let svc = info
        .as_ref()
        .and_then(|i| i.get("service"))
        .and_then(|v| v.as_str())
        .unwrap_or(download::detect_service(&url))
        .to_string();
      (t, svc)
    }
  };
  let label = download::service_label(&service);
  let base = [title.as_str(), info_title.as_str()].into_iter().find(|s| !s.is_empty()).map(String::from).unwrap_or(format!("{label}-video"));
  let (a, w, name, dlg_title) = (app.clone(), win.clone(), format!("{}.mp4", tools::sanitize_filename(&base)), format!("Save {label} Video"));
  let Some(dest) = blocking(move || save_file(&a, &w, &dlg_title, &name)).await? else {
    return Ok(json!({ "ok": false, "cancelled": true }));
  };
  remember_dir(&app, SAVE_DIR_KEY, &dest);
  if st.download_busy.swap(true, Ordering::SeqCst) {
    return Ok(json!({ "ok": false, "error": "이미 다운로드가 진행 중입니다." }));
  }
  let _busy = Busy(&st.download_busy);
  let progress = progress_to(&app, "remote:downloadProgress");
  progress(json!({ "percent": 0, "message": if local.is_some() { "Copying saved file…" } else { "Starting download…" } }));

  let final_title = if info_title.is_empty() { None } else { Some(info_title.clone()) };
  if let Some(l) = local {
    let src = std::path::absolute(&l.path).unwrap_or(l.path.clone());
    let d = std::path::absolute(&dest).unwrap_or(dest.clone());
    if src != d {
      if let Err(e) = std::fs::copy(&src, &d) {
        return Ok(json!({ "ok": false, "error": e.to_string() }));
      }
    }
    download::set_cached_remote(&url, &src, &info_title, &service);
    progress(json!({ "percent": 100, "message": "Save complete" }));
    return Ok(json!({
      "ok": true,
      "path": d,
      "name": file_name(&d),
      "size": tools::file_size(&d),
      "title": final_title.unwrap_or_else(|| file_name(&d)),
      "sourceUrl": url,
      "service": service,
      "serviceLabel": label,
      "reused": true,
    }));
  }
  let u = url.clone();
  let result = blocking(move || download::download_remote(&u, &dest, progress)).await?;
  Ok(match result {
    Ok(r) => {
      let path = r.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
      let name = r.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
      download::set_cached_remote(&url, Path::new(&path), if info_title.is_empty() { &name } else { &info_title }, &service);
      merge(
        r,
        json!({
          "ok": true,
          "title": final_title.unwrap_or(name),
          "sourceUrl": url,
          "service": service,
          "serviceLabel": label,
        }),
      )
    }
    Err(DlError::Cancelled) => json!({ "ok": false, "cancelled": true }),
    Err(DlError::Failed(e)) => json!({ "ok": false, "error": e }),
  })
}

async fn rtsp_start_record(app: AppHandle, win: WebviewWindow, payload: Value) -> Result<Value, String> {
  let url = payload_input(&payload);
  if !rtsp::is_rtsp_url(&url) {
    return Ok(json!({ "ok": false, "error": "유효한 RTSP 링크가 아닙니다." }));
  }
  let current = rtsp::recording();
  if !current.is_null() {
    return Ok(json!({ "ok": false, "error": "이미 RTSP 녹화가 진행 중입니다.", "recording": current }));
  }
  let host = url
    .split("://")
    .nth(1)
    .and_then(|r| r.split(['/', '?']).next())
    .map(|h| h.rsplit('@').next().unwrap_or(h))
    .map(|h| h.split(':').next().unwrap_or(h).to_string())
    .filter(|h| !h.is_empty())
    .unwrap_or_else(|| "rtsp".into());
  let name = format!("{}.mp4", tools::sanitize_filename(&format!("rtsp-{host}-{}", stamp())));
  let (a, w) = (app.clone(), win.clone());
  let Some(dest) = blocking(move || save_file(&a, &w, "Save RTSP Stream", &name)).await? else {
    return Ok(json!({ "ok": false, "cancelled": true }));
  };
  remember_dir(&app, SAVE_DIR_KEY, &dest);
  Ok(rtsp::start_record(&url, &dest, progress_to(&app, "rtsp:recordProgress")))
}

async fn rtsp_stop_record(app: AppHandle, options: Value) -> Result<Value, String> {
  let discard = options.get("discard").and_then(|v| v.as_bool()).unwrap_or(false);
  let result = blocking(move || rtsp::stop_record(discard)).await?;
  let progress = progress_to(&app, "rtsp:recordProgress");
  if result.get("cancelled").and_then(|v| v.as_bool()) == Some(true) {
    progress(json!({ "phase": "cancelled", "elapsed": result["elapsed"], "elapsedMs": result["elapsedMs"] }));
  } else if result.get("ok").and_then(|v| v.as_bool()) == Some(true) {
    progress(json!({
      "phase": "done",
      "path": result["path"],
      "name": result["name"],
      "size": result["size"],
      "elapsed": result["elapsed"],
      "elapsedMs": result["elapsedMs"],
    }));
  }
  Ok(result)
}

// ── The one command ─────────────────────────────────────────────

fn platform() -> &'static str {
  match std::env::consts::OS {
    "windows" => "win32",
    "macos" => "darwin",
    other => other,
  }
}

fn arch() -> &'static str {
  match std::env::consts::ARCH {
    "x86_64" => "x64",
    "aarch64" => "arm64",
    "x86" => "ia32",
    other => other,
  }
}

fn theme_name(t: Theme) -> &'static str {
  if t == Theme::Dark {
    "dark"
  } else {
    "light"
  }
}

#[tauri::command]
async fn vp(app: AppHandle, window: WebviewWindow, channel: String, args: Option<Vec<Value>>) -> Result<Value, String> {
  let args = args.unwrap_or_default();
  let main = || app.get_webview_window("main");
  let label = window.label().to_string();
  let ok = |b: bool| Ok(json!(b));
  match channel.as_str() {
    "app:getInfo" => Ok(json!({
      "name": APP_NAME,
      "version": app.package_info().version.to_string(),
      "author": AUTHOR,
      "email": AUTHOR_EMAIL,
      "platform": platform(),
      "arch": arch(),
      "tauri": tauri::VERSION,
      // What yt-dlp uses for YouTube signature challenges ("deno:<path>" when bundled).
      "jsRuntime": tools::js_runtime(),
      "isElectron": false,
      "isTauri": true,
    })),
    "persist:setItem" => {
      let (key, value) = (arg_str(&args, 0), arg_str(&args, 1));
      let done = state(&app).store.set(&key, &value);
      let _ = app.emit("persist:changed", json!({ "key": key, "value": value }));
      ok(done)
    }
    "persist:removeItem" => {
      let key = arg_str(&args, 0);
      let done = state(&app).store.remove(&key);
      let _ = app.emit("persist:changed", json!({ "key": key, "value": null }));
      ok(done)
    }
    "init:take" => Ok(state(&app).pending_init.lock().unwrap().remove(&label).unwrap_or(Value::Null)),
    "open:takePending" => {
      let st = state(&app);
      let mut pending = st.pending_open.lock().unwrap();
      st.open_ready.store(true, Ordering::SeqCst);
      Ok(json!(std::mem::take(&mut *pending)))
    }

    "window:minimize" => {
      minimize_all(&app);
      ok(true)
    }
    "window:maximizeToggle" => {
      let Some(m) = main() else { return ok(false) };
      if m.is_maximized().unwrap_or(false) {
        let _ = m.unmaximize();
        ok(false)
      } else {
        let _ = m.maximize();
        ok(true)
      }
    }
    "window:close" => {
      if let Some(m) = main() {
        let _ = m.close();
      }
      Ok(Value::Null)
    }
    "window:closeSelf" => {
      let _ = window.close();
      Ok(Value::Null)
    }
    "window:isMinimized" => ok(window.is_minimized().unwrap_or(false)),
    "window:isMaximized" => ok(main().and_then(|m| m.is_maximized().ok()).unwrap_or(false)),
    "window:setFullscreen" => {
      let on = arg(&args, 0).as_bool().unwrap_or(false);
      if window.is_fullscreen().unwrap_or(false) != on {
        let _ = window.set_fullscreen(on);
      }
      ok(on)
    }
    "window:setMinimumSize" => ok(set_min_size(
      &app,
      &window,
      arg(&args, 0).as_f64().unwrap_or(f64::NAN),
      arg(&args, 1).as_f64().unwrap_or(f64::NAN),
    )),
    "window:getBounds" => Ok(get_bounds(&window)),
    "window:setBounds" => ok(set_bounds(&app, &window, arg(&args, 0))),
    "window:setOpacity" => {
      let v = arg(&args, 0).as_f64().unwrap_or(f64::NAN);
      if !v.is_finite() {
        return Ok(json!(opacity_of(&app, &label)));
      }
      Ok(json!(apply_opacity(&app, &window, v)))
    }
    "window:getOpacity" => Ok(json!(opacity_of(&app, &label))),
    "spectrum:setOpacity" => {
      let target = app.get_webview_window("spectrum").unwrap_or(window.clone());
      let v = arg(&args, 0).as_f64().unwrap_or(f64::NAN);
      if !v.is_finite() {
        return Ok(json!(opacity_of(&app, target.label())));
      }
      Ok(json!(apply_opacity(&app, &target, v)))
    }
    "spectrum:getOpacity" => Ok(json!(if app.get_webview_window("spectrum").is_some() { opacity_of(&app, "spectrum") } else { 1.0 })),
    "window:beginDrag" => {
      begin_drag(&app, &window);
      Ok(Value::Null)
    }
    "window:updateDrag" => {
      update_drag(&app, &window);
      Ok(Value::Null)
    }
    "window:endDrag" => {
      *state(&app).drag.lock().unwrap() = None;
      Ok(Value::Null)
    }

    "spectrum:open" | "history:open" => {
      let which = channel.split(':').next().unwrap_or("").to_string();
      open_child(&app, &which, arg(&args, 0).clone())
    }
    "spectrum:close" | "history:close" => Ok(close_child(&app, channel.split(':').next().unwrap_or(""))),
    "spectrum:focus" | "history:focus" => Ok(focus_child(&app, channel.split(':').next().unwrap_or(""))),
    "spectrum:toWindow" | "history:toWindow" => {
      let which = channel.split(':').next().unwrap_or("");
      if app.get_webview_window(which).is_some() {
        let _ = app.emit_to(which, &format!("{which}:message"), arg(&args, 0).clone());
      }
      Ok(Value::Null)
    }
    "spectrum:toHost" | "history:toHost" => {
      let which = channel.split(':').next().unwrap_or("");
      let _ = app.emit_to("main", &format!("{which}:hostEvent"), arg(&args, 0).clone());
      Ok(Value::Null)
    }

    "dialog:openMedia" => {
      let (a, w) = (app.clone(), window.clone());
      let picked = blocking(move || {
        pick_file(
          &a,
          &w,
          "Open Media File",
          &[("Media Files", &DIALOG_MEDIA), ("Video", &DIALOG_VIDEO), ("Audio", &DIALOG_AUDIO), ("All Files", &["*"])],
        )
      })
      .await?;
      let Some(p) = picked else { return Ok(Value::Null) };
      remember_dir(&app, OPEN_DIR_KEY, &p);
      let media = media_from_path(&p.to_string_lossy());
      Ok(if media.get("ok").and_then(|v| v.as_bool()) == Some(true) { media } else { Value::Null })
    }
    "media:openPath" => {
      let media = media_from_path(&arg_str(&args, 0));
      if media.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        if let Some(p) = media.get("path").and_then(|v| v.as_str()) {
          remember_dir(&app, OPEN_DIR_KEY, Path::new(p));
        }
      }
      Ok(media)
    }
    "media:makeCompatible" => {
      let source = arg_str(&args, 0);
      let opts = arg(&args, 1).clone();
      let mode = opts.get("mode").and_then(|v| v.as_str()).unwrap_or("soft").to_string();
      let force = opts.get("force").and_then(|v| v.as_bool()).unwrap_or(false);
      let cache = state(&app).data_dir.join("compat-cache");
      let w = window.clone();
      let src = source.clone();
      let result = blocking(move || {
        compat::make_compatible(Path::new(&src), &cache, &mode, force, |p| {
          let _ = w.emit_to(w.label(), "media:compatProgress", p);
        })
      })
      .await?;
      if result.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return Ok(result);
      }
      let media = media_from_path(result.get("path").and_then(|v| v.as_str()).unwrap_or(""));
      if media.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return Ok(json!({ "ok": false, "error": media.get("error").cloned().unwrap_or(json!("변환된 파일을 열 수 없습니다.")) }));
      }
      Ok(merge(
        media,
        json!({
          "ok": true,
          "cached": result.get("cached").and_then(|v| v.as_bool()).unwrap_or(false),
          "mode": result.get("mode").cloned().unwrap_or(json!("soft")),
          "repairedFrom": std::path::absolute(&source).unwrap_or(PathBuf::from(&source)),
        }),
      ))
    }
    "dialog:openSubtitle" => {
      let (a, w) = (app.clone(), window.clone());
      let picked = blocking(move || {
        pick_file(&a, &w, "Open Subtitle File", &[("Subtitles", &["smi", "srt", "vtt"]), ("All Files", &["*"])])
      })
      .await?;
      let Some(p) = picked else { return Ok(Value::Null) };
      remember_dir(&app, OPEN_DIR_KEY, &p);
      Ok(read_subtitle(&p))
    }
    "fs:listSubtitles" => {
      let p = arg_str(&args, 0);
      Ok(if p.is_empty() { json!([]) } else { json!(subs::list(Path::new(&p))) })
    }
    "fs:findSubtitle" => {
      let p = arg_str(&args, 0);
      Ok(if p.is_empty() { Value::Null } else { subtitle_near(Path::new(&p)) })
    }
    "shell:openExternal" => {
      let url = arg_str(&args, 0);
      if url.starts_with("https://") || url.starts_with("mailto:") {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().open_url(url, None::<&str>);
      }
      Ok(Value::Null)
    }
    "theme:getSystem" => Ok(json!(theme_name(window.theme().unwrap_or(Theme::Dark)))),
    "theme:setSource" => {
      let source = arg_str(&args, 0);
      let theme = match source.as_str() {
        "dark" => Some(Some(Theme::Dark)),
        "light" => Some(Some(Theme::Light)),
        "system" => Some(None),
        _ => None,
      };
      if let Some(theme) = theme {
        for (_, w) in app.webview_windows() {
          let _ = w.set_theme(theme);
        }
      }
      Ok(json!(theme_name(window.theme().unwrap_or(Theme::Dark))))
    }

    "rtsp:open" => {
      let r = rtsp::open_stream(&arg_str(&args, 0));
      if r.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return Ok(r);
      }
      let id = r["id"].as_str().unwrap_or("").to_string();
      Ok(json!({ "ok": true, "id": id, "url": r["url"], "name": r["name"], "playUrl": server::rtsp_url(&id), "isRtsp": true }))
    }
    "rtsp:stop" => Ok(rtsp::stop_stream()),
    "rtsp:getActive" => Ok(rtsp::active_stream()),
    "rtsp:isUrl" => ok(rtsp::is_rtsp_url(&arg_str(&args, 0))),
    "rtsp:getRecording" => Ok(rtsp::recording()),
    "rtsp:startRecord" => rtsp_start_record(app.clone(), window.clone(), arg(&args, 0).clone()).await,
    "rtsp:stopRecord" => rtsp_stop_record(app.clone(), arg(&args, 0).clone()).await,

    "youtube:parse" => {
      let input = arg_str(&args, 0);
      Ok(match (download::extract_video_id(&input), download::normalize_watch_url(&input)) {
        (Some(id), Some(url)) => json!({ "id": id, "url": url }),
        _ => Value::Null,
      })
    }
    "youtube:info" => {
      let input = arg_str(&args, 0);
      Ok(match blocking(move || download::youtube_info(&input)).await? {
        Ok(info) => json!({ "ok": true, "info": info }),
        Err(e) => json!({ "ok": false, "error": e }),
      })
    }
    "youtube:download" => youtube_download(app.clone(), window.clone(), arg(&args, 0).clone()).await,
    "youtube:cancelDownload" => {
      let discard = arg(&args, 0).get("discard").and_then(|v| v.as_bool()).unwrap_or(true);
      Ok(download::stop_youtube(discard))
    }
    "remote:isSupportedUrl" => {
      let v = arg_str(&args, 0);
      ok(download::is_http_url(&v) && download::extract_video_id(&v).is_none())
    }
    "remote:info" => {
      let input = arg_str(&args, 0);
      Ok(match blocking(move || download::remote_info(&input)).await? {
        Ok(info) => json!({ "ok": true, "info": info }),
        Err(e) => json!({ "ok": false, "error": e }),
      })
    }
    "remote:open" => remote_open(app.clone(), arg(&args, 0).clone()).await,
    "remote:download" => remote_download(app.clone(), window.clone(), arg(&args, 0).clone()).await,
    "remote:cancelDownload" => {
      let discard = arg(&args, 0).get("discard").and_then(|v| v.as_bool()).unwrap_or(true);
      let stopped = download::stop_remote(discard);
      // A YouTube link opened as a file runs through the YouTube downloader.
      if stopped.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        return Ok(stopped);
      }
      Ok(download::stop_youtube(discard))
    }
    other => Err(format!("unknown channel: {other}")),
  }
}

// ── Start-up ────────────────────────────────────────────────────

/// Data folder: MYVIDEOPLAYER_CONFIG_DIR (tests: data and WebView2 profile together), else
/// the platform app-data folder.
fn data_dirs(app: &AppHandle) -> (PathBuf, Option<PathBuf>) {
  if let Ok(dir) = std::env::var("MYVIDEOPLAYER_CONFIG_DIR") {
    if !dir.is_empty() {
      let dir = PathBuf::from(dir);
      return (dir.clone(), Some(dir.join("webview")));
    }
  }
  (app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")), None)
}

pub fn run() {
  let mut builder = tauri::Builder::default();
  // A run with its own data folder (tests) is its own instance; it must not hand over to the
  // MyVideoPlayer the user has open.
  if std::env::var_os("MYVIDEOPLAYER_CONFIG_DIR").is_none_or(|d| d.is_empty()) {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
      let files = media_paths(argv.into_iter().skip(1), Path::new(&cwd));
      restore_all(app);
      if let Some(m) = app.get_webview_window("main") {
        let _ = m.unminimize();
        let _ = m.show();
        let _ = m.set_focus();
      }
      open_paths(app, files);
    }));
  }
  builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![vp])
    .setup(|app| {
      let handle = app.handle().clone();
      tools::init_resource_dir(if cfg!(debug_assertions) { None } else { app.path().resource_dir().ok() });
      let (data_dir, webview_dir) = data_dirs(&handle);
      let store_file = data_dir.join("persist.json");
      if webview_dir.is_none() {
        // The Electron build's userData (packaged: product name; unpackaged: package name).
        let legacy: Vec<PathBuf> = app
          .path()
          .config_dir()
          .map(|base| vec![base.join("MyVideoPlayer").join("persist.json"), base.join("my-video-player-multios").join("persist.json")])
          .unwrap_or_default();
        persist::Store::migrate_from(&store_file, &legacy);
      }
      let store = persist::Store::open(store_file);
      let temp_dir = std::env::temp_dir().join("my-video-player-remote");
      let cwd = std::env::current_dir().unwrap_or_default();
      app.manage(AppState {
        store,
        data_dir,
        temp_dir,
        webview_dir,
        pending_open: Mutex::new(media_paths(std::env::args().skip(1), &cwd)),
        open_ready: AtomicBool::new(false),
        pending_init: Mutex::new(HashMap::new()),
        min_size: Mutex::new(HashMap::new()),
        opacity: Mutex::new(HashMap::new()),
        drag: Mutex::new(None),
        restore_group: AtomicBool::new(false),
        child_lock: Mutex::new(()),
        download_busy: AtomicBool::new(false),
        main_state: Mutex::new((false, false)),
      });

      let assets_app = handle.clone();
      let snapshot_app = handle.clone();
      server::start(
        Arc::new(move |path: &str| {
          let resolver = assets_app.asset_resolver();
          let asset = resolver.get(path.to_string())?;
          // The resolver answers unknown paths with index.html (SPA fallback); the server
          // should say 404 instead.
          if !path.ends_with("index.html") && resolver.get("index.html".into()).is_some_and(|i| i.bytes == asset.bytes) {
            return None;
          }
          Some((asset.bytes, asset.mime_type))
        }),
        Arc::new(move || state(&snapshot_app).store.snapshot().to_string()),
      )?;
      create_main(&handle)?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building MyVideoPlayer")
    .run(|_app, event| {
      if let tauri::RunEvent::Exit = event {
        rtsp::shutdown();
        download::stop_youtube(false);
        download::stop_remote(false);
      }
    });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn media_args_skip_flags_and_missing_files() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.MP4"), b"x").unwrap();
    std::fs::write(dir.path().join("b.txt"), b"x").unwrap();
    let got = media_paths(["--flag".into(), "a.MP4".into(), "b.txt".into(), "c.mp3".into()], dir.path());
    assert_eq!(got.len(), 1);
    assert!(got[0].ends_with("a.MP4"));
  }

  #[test]
  fn payload_inputs() {
    assert_eq!(payload_input(&json!({ "url": " x " })), "x");
    assert_eq!(payload_input(&json!({ "input": "y" })), "y");
    assert_eq!(payload_input(&json!("z")), "z");
  }

  #[test]
  fn stamp_dates() {
    assert_eq!(civil_from_days(0), (1970, 1, 1));
    assert_eq!(civil_from_days(20753), (2026, 10, 27));
    assert_eq!(stamp().len(), 19);
  }
}
