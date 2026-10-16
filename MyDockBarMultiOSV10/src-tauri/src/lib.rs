//! MyDockBar: lifecycle, the shared state, and every command the pages call.
//!
//! The pages reach this only through `window.dockApi` (`src/bridge.js`), whose
//! every method is one `#[tauri::command]` below; the notifications going the
//! other way are `bridge::post`. That is the whole surface - adding a
//! capability means adding a command *and* a bridge method.

mod app_scanner;
mod app_windows;
mod bridge;
mod config;
mod dock;
mod dropped_files;
mod error_report;
mod geometry;
mod i18n;
mod icons;
mod launcher;
mod menus;
mod pe_icons;
mod pointer;
mod protocol;
mod running;
mod seed;
mod themes;
mod trash;
#[cfg(windows)]
mod win;

use config::{text, truthy, Config};
use icons::Icons;
use serde_json::{json, Map, Value};
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Condvar, Mutex,
  },
  time::{Duration, Instant},
};
use tauri::{
  webview::PageLoadEvent, AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;
use themes::Themes;

pub type Dock = dock::Dock<Wry>;
pub type Action = Arc<dyn Fn(&AppHandle) + Send + Sync>;

const SETTINGS: &str = "settings";
/// Every tab is laid out to fit exactly this window, so nothing scrolls and
/// resizing could only break that.
const SETTINGS_SIZE: (f64, f64) = (880.0, 600.0);

/// Every source file, for the tests that read the code itself.
#[cfg(test)]
pub(crate) const SOURCES: &[(&str, &str)] = &[
  ("lib.rs", include_str!("lib.rs")),
  ("menus.rs", include_str!("menus.rs")),
  ("dock.rs", include_str!("dock.rs")),
  ("error_report.rs", include_str!("error_report.rs")),
];

/* --------------------------------------------------------------------- *
 * Shared state
 * --------------------------------------------------------------------- */

pub struct Ctx {
  pub data_dir: PathBuf,
  pub config: Mutex<Config>,
  pub icons: Icons,
  pub themes: Themes,
  pub dock: Arc<Dock>,
  pub running: running::RunningWatch,
  pub trash: Mutex<Option<trash::Watch>>,
  pub menu_actions: Mutex<HashMap<String, Action>>,
  pub tray: Mutex<Option<tauri::tray::TrayIcon>>,
  /// Set when the app runs on a throwaway data folder (MYDOCKBAR_CONFIG_DIR):
  /// the login item is then pretended, so a test run never touches the real one.
  pub fake_autostart: Option<Mutex<bool>>,
  pub quitting: AtomicBool,
  saver: Arc<(Mutex<Option<Instant>>, Condvar)>,
}

pub fn ctx(app: &AppHandle) -> Arc<Ctx> {
  app.state::<Arc<Ctx>>().inner().clone()
}

impl Ctx {
  pub fn cfg(&self) -> Value {
    self.config.lock().unwrap().get().clone()
  }

  pub fn dock_cfg(&self) -> Value {
    self.config.lock().unwrap().dock().clone()
  }

  pub fn items(&self) -> Vec<Value> {
    self.config.lock().unwrap().items()
  }

  /// Merge a partial config in; written a quarter of a second after the last
  /// change, because slider drags fire continuously.
  pub fn patch(&self, partial: &Value) {
    self.config.lock().unwrap().patch(partial);
    let (lock, wake) = &*self.saver;
    *lock.lock().unwrap() = Some(Instant::now() + Duration::from_millis(250));
    wake.notify_all();
  }

  /// Replace the items and write at once - a deliberate edit, not a drag.
  pub fn set_items(&self, items: Vec<Value>) {
    self.config.lock().unwrap().set_items(items);
  }

  pub fn save_now(&self) {
    *self.saver.0.lock().unwrap() = None;
    self.config.lock().unwrap().save_now();
  }

  /// The lock is enforced here rather than only in the UI: the renderer's
  /// buttons are the convenience, this is the guarantee.
  pub fn locked(&self) -> bool {
    truthy(&self.dock_cfg()["lockItems"])
  }
}

fn start_saver(ctx: &Arc<Ctx>) {
  let weak = Arc::downgrade(ctx);
  let saver = ctx.saver.clone();
  let _ = std::thread::Builder::new().name("config-saver".into()).spawn(move || {
    let (lock, wake) = &*saver;
    loop {
      let mut due = lock.lock().unwrap();
      match *due {
        None => due = wake.wait(due).unwrap(),
        Some(at) if Instant::now() >= at => {
          *due = None;
          drop(due);
          match weak.upgrade() {
            Some(ctx) => ctx.config.lock().unwrap().save_now(),
            None => return,
          }
          continue;
        }
        Some(at) => due = wake.wait_timeout(due, at.saturating_duration_since(Instant::now())).unwrap().0,
      }
      drop(due);
    }
  });
}

/// The locale actually in force, resolving 'auto' against the OS.
pub fn active_locale(cfg: &Value) -> &'static str {
  i18n::resolve(&text(&cfg["locale"]), &i18n::system_locale())
}

pub fn t(app: &AppHandle, key: &str, vars: &[(&str, &str)]) -> String {
  i18n::translate(active_locale(&ctx(app).cfg()), key, vars)
}

fn platform() -> &'static str {
  if cfg!(windows) {
    "win32"
  } else if cfg!(target_os = "macos") {
    "darwin"
  } else {
    "linux"
  }
}

/// Everything the renderer needs to draw itself in one payload.
pub fn snapshot(app: &AppHandle) -> Value {
  let c = ctx(app);
  let data = c.cfg();
  let theme = c.themes.get(&text(&data["theme"]));
  json!({
    "locale": data["locale"],
    "resolvedLocale": active_locale(&data),
    "dock": data["dock"],
    "themeId": data["theme"],
    "theme": theme.map(|t| t.payload()),
    "items": data["items"],
    "startWithOS": data["startWithOS"],
    "platform": platform(),
    "version": app.package_info().version.to_string(),
  })
}

fn window_labels(app: &AppHandle) -> Vec<String> {
  app.webview_windows().keys().cloned().collect()
}

/// One snapshot, one broadcast: every mutation ends here, so both pages are
/// always looking at the same state.
pub fn push_config(app: &AppHandle) {
  // Adding or removing the Trash entry decides whether the bin is watched.
  sync_trash_watch(app);
  bridge::broadcast(app, &window_labels(app), "config:changed", snapshot(app));
}

pub fn reload_all(app: &AppHandle) {
  for win in app.webview_windows().values() {
    let _ = win.eval("location.reload()");
  }
  let c = ctx(app);
  c.dock.apply_config(c.dock_cfg(), truthy(&c.cfg()["startWithOS"]));
}

/// Settings that change how the window itself behaves.
pub fn apply_dock(app: &AppHandle) {
  let c = ctx(app);
  c.dock.apply_config(c.dock_cfg(), truthy(&c.cfg()["startWithOS"]));
}

pub fn quit(app: &AppHandle) {
  let c = ctx(app);
  c.quitting.store(true, Ordering::SeqCst);
  c.save_now();
  if let Some(w) = c.trash.lock().unwrap().take() {
    w.stop();
  }
  app.exit(0);
}

/// Map `f` over `items` on a few threads: resolving icons means asking the
/// shell, which is slow per file and happy to be asked in parallel.
fn par_map<T: Sync, U: Send>(items: &[T], f: impl Fn(&T) -> U + Sync) -> Vec<U> {
  if items.len() < 4 {
    return items.iter().map(&f).collect();
  }
  let chunk = items.len().div_ceil(4);
  std::thread::scope(|scope| {
    let handles: Vec<_> = items.chunks(chunk).map(|part| scope.spawn(|| part.iter().map(&f).collect::<Vec<_>>())).collect();
    handles.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
  })
}

pub fn with_icons(app: &AppHandle, items: &[Value]) -> Vec<Value> {
  let c = ctx(app);
  par_map(items, |item| {
    let mut out = item.clone();
    out["protected"] = json!(item["type"] == "special");
    out["iconUrl"] = if item["type"] == "separator" { Value::Null } else { c.icons.resolve(item).map(Value::String).unwrap_or(Value::Null) };
    out
  })
}

/* --------------------------------------------------------------------- *
 * Items
 * --------------------------------------------------------------------- */

fn blank_item(kind: &str, label: &str, path: &str) -> Value {
  json!({ "id": seed::new_id(), "type": kind, "label": label, "path": path, "args": "", "icon": "" })
}

/// "notepad++.exe" -> "Notepad++", as a last resort.
fn pretty_name(target: &str) -> String {
  let p = Path::new(target);
  let base = p.file_stem().map(|s| s.to_string_lossy().into_owned()).filter(|s| !s.is_empty()).unwrap_or_else(|| target.to_string());
  let mut chars = base.chars();
  match chars.next() {
    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    None => base,
  }
}

/// Build a dock item from a filesystem path the user dropped or picked.
pub fn item_from_path(target: &str) -> Value {
  let p = Path::new(target);
  let is_dir = p.is_dir();

  #[cfg(target_os = "macos")]
  if target.ends_with(".app") {
    return blank_item("app", target.rsplit('/').next().unwrap_or(target).trim_end_matches(".app"), target);
  }
  #[cfg(target_os = "linux")]
  if target.ends_with(".desktop") {
    if let Some(entry) = app_scanner::parse_desktop_entry(p) {
      let mut item = blank_item("app", &entry.label, &entry.path);
      item["args"] = json!(entry.args);
      item["icon"] = json!(entry.icon);
      return item;
    }
  }
  #[cfg(windows)]
  if target.to_lowercase().ends_with(".lnk") {
    if let Some(info) = win::read_shortcut(p) {
      let mut item = blank_item("app", &p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(), &info.target);
      item["args"] = json!(info.args);
      item["icon"] = json!(if !info.icon.is_empty() && Path::new(&info.icon).exists() { info.icon } else { String::new() });
      return item;
    }
  }

  // An installed application already has a name and an icon the system knows
  // it by; a bare filename like "notepad++.exe" is a poor substitute.
  let known = if is_dir { None } else { app_scanner::scan(false).into_iter().find(|e| e.path.to_lowercase() == target.to_lowercase()) };
  let mut item = blank_item(
    if is_dir { "folder" } else { "app" },
    &known.as_ref().map(|k| k.label.clone()).unwrap_or_else(|| pretty_name(target)),
    target,
  );
  if let Some(k) = known {
    item["icon"] = json!(k.icon);
  }
  item
}

fn memory_key(item: &Value) -> String {
  text(&item["path"]).to_lowercase()
}

/// Remember the icon chosen for a target before its entry goes away.
fn remember_icon(c: &Ctx, item: Option<&Value>) {
  let Some(item) = item else { return };
  let key = memory_key(item);
  let icon = text(&item["icon"]);
  if key.is_empty() || icon.is_empty() {
    return;
  }
  let mut memory = Map::new();
  memory.insert(key, Value::String(icon));
  c.patch(&json!({ "iconMemory": memory }));
}

/// Reapply a previously chosen icon when the same target comes back.
fn recall_icon(c: &Ctx, mut item: Value) -> Value {
  if !text(&item["icon"]).is_empty() {
    return item;
  }
  if let Some(remembered) = c.cfg()["iconMemory"].get(memory_key(&item)).and_then(|v| v.as_str()) {
    item["icon"] = json!(remembered);
  }
  item
}

/// Give a new entry its program's own icon, so it arrives showing a picture
/// the user can see and swap out rather than blank.
fn with_default_icon(c: &Ctx, mut item: Value) -> Value {
  if !icons::can_adopt_icon(&item) {
    return item;
  }
  let adopted = c.icons.adopt_default(&text(&item["path"]));
  if !adopted.is_empty() {
    item["icon"] = json!(adopted);
  }
  item
}

/// Remember a departing entry's icon (the context menu's Remove).
pub fn remember(app: &AppHandle, item: &Value) {
  remember_icon(&ctx(app), Some(item));
}

fn is_protected(item: Option<&Value>) -> bool {
  item.map(|i| i["type"] == "special").unwrap_or(false)
}

fn clamp_index(index: f64, len: usize) -> usize {
  if index.is_finite() {
    index.max(0.0).min(len as f64) as usize
  } else {
    len
  }
}

/* --------------------------------------------------------------------- *
 * Watches
 * --------------------------------------------------------------------- */

pub fn sync_running_watch(app: &AppHandle) {
  let c = ctx(app);
  let dock = c.dock_cfg();
  if truthy(&dock["showRunningIndicator"]) || truthy(&dock["showRunningApps"]) {
    c.running.start(truthy(&dock["showRunningApps"]));
  } else {
    c.running.stop();
  }
}

/// The bin fills and empties from outside the dock, so the OS reports the
/// moment it does. Nothing is watched unless a Trash icon is on the dock.
pub fn sync_trash_watch(app: &AppHandle) {
  let c = ctx(app);
  let wanted = c.items().iter().any(|i| i["path"] == "system:trash");
  let mut slot = c.trash.lock().unwrap();
  if wanted == slot.is_some() {
    return;
  }
  if !wanted {
    if let Some(w) = slot.take() {
      w.stop();
    }
    return;
  }
  let handle = app.clone();
  *slot = Some(trash::watch(move |info| {
    bridge::broadcast(&handle, &window_labels(&handle), "dock:trash", json!(info));
  }));
}

/// Running applications as dock-ready entries with resolved icons. They are
/// transient: never written to the config, and skipped when already pinned.
fn decorate_running_apps(app: &AppHandle, apps: &[running::RunningApp]) -> Vec<Value> {
  let c = ctx(app);
  if !truthy(&c.dock_cfg()["showRunningApps"]) || apps.is_empty() {
    return Vec::new();
  }
  let pinned: Vec<String> = c.items().iter().map(|i| text(&i["path"]).to_lowercase()).filter(|p| !p.is_empty()).collect();
  let own = std::env::current_exe().map(|p| p.to_string_lossy().to_lowercase()).unwrap_or_default();
  let transient: Vec<&running::RunningApp> = apps.iter().filter(|a| {
    let t = a.path.to_lowercase();
    !t.is_empty() && t != own && !pinned.contains(&t)
  }).collect();
  par_map(&transient, |entry| {
    json!({
      "id": format!("running:{}", entry.path), "type": "app", "transient": true,
      "label": entry.name, "path": entry.path, "args": "", "icon": "",
      "iconUrl": c.icons.resolve(&json!({ "path": entry.path })),
    })
  })
}

/* --------------------------------------------------------------------- *
 * Autostart
 * --------------------------------------------------------------------- */

pub fn autostart_enabled(app: &AppHandle) -> bool {
  let c = ctx(app);
  if let Some(fake) = &c.fake_autostart {
    return *fake.lock().unwrap();
  }
  app.autolaunch().is_enabled().unwrap_or(false)
}

pub fn set_autostart(app: &AppHandle, enabled: bool) {
  let c = ctx(app);
  if let Some(fake) = &c.fake_autostart {
    *fake.lock().unwrap() = enabled;
    return;
  }
  let result = if enabled { app.autolaunch().enable() } else { app.autolaunch().disable() };
  if let Err(err) = result {
    eprintln!("[autostart] failed: {err}");
  }
  // The Electron build's login entry had another name; a dock switched on or
  // off here must not leave that one starting the old copy.
  #[cfg(target_os = "linux")]
  {
    let legacy = app_scanner::home().join(".config/autostart/mydockbar.desktop");
    let _ = std::fs::remove_file(legacy);
  }
}

/* --------------------------------------------------------------------- *
 * Windows
 * --------------------------------------------------------------------- */

fn create_dock_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
  let c = ctx(app);
  let dock = c.dock_cfg();
  let builder = WebviewWindowBuilder::new(app, dock::LABEL, WebviewUrl::App("renderer/index.html".into()))
    .title("MyDockBar")
    .inner_size(80.0, 80.0)
    .visible(false)
    .focused(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .skip_taskbar(!dock::wants_taskbar(&dock, truthy(&c.cfg()["startWithOS"])))
    .always_on_top(text(&dock["stackingLevel"]) != "normal")
    .visible_on_all_workspaces(truthy(&dock["showOnAllWorkspaces"]));
  let builder = with_data_dir(app, builder);
  #[cfg(windows)]
  let builder = builder.disable_drag_drop_handler();
  let win = builder.build()?;

  #[cfg(windows)]
  if let Ok(h) = win.hwnd() {
    *c.dock.hwnd.lock().unwrap() = Some(h.0 as isize);
  }
  #[cfg(target_os = "linux")]
  if let Ok(gtk) = win.gtk_window() {
    // The dock is chrome, not a document: keep it out of the window cycle.
    use gtk::prelude::GtkWindowExt;
    gtk.set_type_hint(gtk::gdk::WindowTypeHint::Dock);
  }
  dropped_files::attach(&win);
  Ok(win)
}

/// A run on a throwaway data folder keeps its webview profile there too.
fn with_data_dir<'a>(app: &AppHandle, builder: WebviewWindowBuilder<'a, Wry, AppHandle>) -> WebviewWindowBuilder<'a, Wry, AppHandle> {
  if std::env::var_os("MYDOCKBAR_CONFIG_DIR").is_some() {
    builder.data_directory(ctx(app).data_dir.join("webview"))
  } else {
    builder
  }
}

pub fn open_settings(app: &AppHandle) {
  if let Some(win) = app.get_webview_window(SETTINGS) {
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
    return;
  }
  // A window cannot be made on the UI thread while it waits, which is where
  // menu clicks arrive.
  let app = app.clone();
  std::thread::spawn(move || {
    let c = ctx(&app);
    let dark = c.themes.get(&text(&c.cfg()["theme"])).map(|t| t.dark).unwrap_or(true);
    let background = if dark { tauri::window::Color(0x1c, 0x1f, 0x26, 255) } else { tauri::window::Color(0xf4, 0xf5, 0xf7, 255) };
    let builder = WebviewWindowBuilder::new(&app, SETTINGS, WebviewUrl::App("renderer/settings.html".into()))
      .title("MyDockBar Settings")
      .inner_size(SETTINGS_SIZE.0, SETTINGS_SIZE.1)
      .min_inner_size(SETTINGS_SIZE.0, SETTINGS_SIZE.1)
      .max_inner_size(SETTINGS_SIZE.0, SETTINGS_SIZE.1)
      .resizable(false)
      .maximizable(false)
      // MyDockBar lives in the tray: nothing it opens belongs on the taskbar.
      .skip_taskbar(true)
      .background_color(background)
      .center();
    let builder = with_data_dir(&app, builder);
    #[cfg(windows)]
    let builder = builder.disable_drag_drop_handler();
    match builder.build() {
      Ok(win) => {
        if let Some(icon) = app.default_window_icon() {
          let _ = win.set_icon(icon.clone());
        }
        dropped_files::attach(&win);
        let _ = win.set_focus();
      }
      Err(err) => error_report::report(&format!("Could not open the settings window: {err}")),
    }
  });
}

pub fn close_settings(app: &AppHandle) {
  if let Some(win) = app.get_webview_window(SETTINGS) {
    let _ = win.close();
  }
}

/// Open the settings window on a particular dock entry. The message is kept
/// until the page is listening, so it lands even while the window is loading.
pub fn focus_item(app: &AppHandle, id: &str) {
  open_settings(app);
  bridge::post(app, SETTINGS, "settings:focus-item", json!(id));
}

/* --------------------------------------------------------------------- *
 * Dialogs
 * --------------------------------------------------------------------- */

fn pick_files(app: &AppHandle, title: &str, filters: &[(&str, &[&str])], dir: Option<PathBuf>, many: bool) -> Vec<PathBuf> {
  let mut dialog = app.dialog().file().set_title(title);
  for (name, exts) in filters {
    dialog = dialog.add_filter(*name, exts);
  }
  if let Some(dir) = dir.filter(|d| d.is_dir()) {
    dialog = dialog.set_directory(dir);
  }
  let picked = if many { dialog.blocking_pick_files() } else { dialog.blocking_pick_file().map(|f| vec![f]) };
  picked.unwrap_or_default().into_iter().filter_map(|f| f.into_path().ok()).collect()
}

fn program_filters() -> Vec<(&'static str, &'static [&'static str])> {
  if cfg!(windows) {
    vec![("Programs", &["exe", "lnk", "bat", "cmd"]), ("All Files", &["*"])]
  } else {
    vec![("All Files", &["*"])]
  }
}

fn insert_items(app: &AppHandle, at: Option<f64>, picked: Vec<PathBuf>) -> Option<Vec<Value>> {
  let c = ctx(app);
  if picked.is_empty() || c.locked() {
    return None;
  }
  let mut items = c.items();
  let index = clamp_index(at.unwrap_or(f64::NAN), items.len());
  let added: Vec<Value> = picked.iter().map(|p| recall_icon(&c, item_from_path(&p.to_string_lossy()))).collect();
  items.splice(index..index, added);
  c.set_items(items.clone());
  push_config(app);
  Some(items)
}

pub fn pick_and_add(app: &AppHandle, at: Option<f64>) -> Option<Vec<Value>> {
  if ctx(app).locked() {
    return None;
  }
  let dir = if cfg!(target_os = "macos") { Some(PathBuf::from("/Applications")) } else { None };
  let picked = pick_files(app, "Add application to dock", &program_filters(), dir, true);
  insert_items(app, at, picked)
}

pub fn pick_folder_and_add(app: &AppHandle, at: Option<f64>) -> Option<Vec<Value>> {
  if ctx(app).locked() {
    return None;
  }
  let picked = app.dialog().file().set_title("Add folder to dock").blocking_pick_folder().and_then(|f| f.into_path().ok());
  insert_items(app, at, picked.into_iter().collect())
}

/* --------------------------------------------------------------------- *
 * Launching
 * --------------------------------------------------------------------- */

pub fn folders_for(app: &AppHandle) -> launcher::Folders {
  launcher::Folders { documents: app.path().document_dir().ok(), downloads: app.path().download_dir().ok() }
}

/// Raise what is already open rather than starting a second copy. True when
/// the click was handled; false means launch normally.
fn raise_existing(app: &AppHandle, item: &Value) -> bool {
  let c = ctx(app);
  if !truthy(&c.dock_cfg()["focusRunningWindow"]) {
    return false;
  }
  let target = text(&item["path"]);
  let kind = text(&item["type"]);
  if target.is_empty() || kind == "url" || kind == "folder" || target.starts_with("dock:") || target.starts_with("system:") {
    return false;
  }
  // Only worth asking the OS about a program that is actually running. A None
  // set means nothing is being tracked, so fall through and ask properly.
  let key = target.rsplit(['\\', '/']).next().unwrap_or("").to_lowercase();
  if let Some(known) = c.running.names() {
    if !key.is_empty() && !known.contains(&key) {
      return false;
    }
  }
  let windows = app_windows::list(&target);
  match windows.len() {
    0 => false,
    // If it cannot be raised - closed since the list was cached, or refused -
    // saying so lets the caller fall back to launching.
    1 => app_windows::focus(&windows[0].id),
    _ => {
      menus::window_picker(app, item, &windows);
      true
    }
  }
}

fn launch(app: &AppHandle, item: &Value) -> launcher::Launched {
  match item["path"].as_str() {
    Some("dock:settings") => {
      open_settings(app);
      launcher::Launched::ok()
    }
    Some("dock:quit") => {
      quit(app);
      launcher::Launched::ok()
    }
    _ => {
      if raise_existing(app, item) {
        return launcher::Launched::ok();
      }
      launcher::launch(item, &folders_for(app))
    }
  }
}

/// Empty the bin, then tell every window. Only an emptying earns the effect
/// the dock plays over its Trash icon; a cancelled or failed one says nothing.
pub fn empty_trash(app: &AppHandle) -> Value {
  let owner = *ctx(app).dock.hwnd.lock().unwrap();
  match trash::empty(owner) {
    Ok(()) => {
      let info = json!(trash::state());
      let labels = window_labels(app);
      bridge::broadcast(app, &labels, "dock:trash-emptied", info.clone());
      bridge::broadcast(app, &labels, "dock:trash", info);
      json!({ "ok": true })
    }
    Err(error) => {
      eprintln!("[trash] {error}");
      json!({ "ok": false, "error": error })
    }
  }
}

/* --------------------------------------------------------------------- *
 * Commands
 * --------------------------------------------------------------------- */

type Res<T> = Result<T, String>;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Res<T> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn bridge_listen(window: WebviewWindow, event: String) -> Vec<Value> {
  bridge::listen(window.label(), &event)
}

#[tauri::command]
fn config_get(app: AppHandle) -> Value {
  snapshot(&app)
}

#[tauri::command]
async fn config_patch(app: AppHandle, partial: Value) -> Value {
  let c = ctx(&app);
  c.patch(&partial);
  if let Some(on) = partial.get("startWithOS") {
    set_autostart(&app, truthy(on));
  }
  sync_running_watch(&app);
  apply_dock(&app);
  menus::rebuild_tray(&app);
  push_config(&app);
  snapshot(&app)
}

#[tauri::command]
async fn config_reset(app: AppHandle) -> Value {
  ctx(&app).config.lock().unwrap().reset();
  apply_dock(&app);
  reload_all(&app);
  push_config(&app);
  snapshot(&app)
}

#[tauri::command]
async fn config_export(app: AppHandle) -> Value {
  let picked = app
    .dialog()
    .file()
    .set_title("Export MyDockBar settings")
    .set_file_name("mydockbar-config.json")
    .add_filter("JSON", &["json"])
    .blocking_save_file()
    .and_then(|f| f.into_path().ok());
  let Some(path) = picked else { return json!({ "ok": false }) };
  match ctx(&app).config.lock().unwrap().export_to(&path) {
    Ok(()) => json!({ "ok": true, "filePath": path }),
    Err(err) => json!({ "ok": false, "error": err.to_string() }),
  }
}

#[tauri::command]
async fn config_import(app: AppHandle) -> Value {
  let picked = pick_files(&app, "Import MyDockBar settings", &[("JSON", &["json"])], None, false);
  let Some(path) = picked.into_iter().next() else { return json!({ "ok": false }) };
  let result = ctx(&app).config.lock().unwrap().import_from(&path);
  match result {
    Ok(()) => {
      apply_dock(&app);
      reload_all(&app);
      push_config(&app);
      json!({ "ok": true })
    }
    Err(error) => json!({ "ok": false, "error": error }),
  }
}

#[tauri::command]
async fn items_get(app: AppHandle) -> Res<Vec<Value>> {
  let items = ctx(&app).items();
  blocking(move || with_icons(&app, &items)).await
}

#[tauri::command]
async fn items_set(app: AppHandle, items: Vec<Value>) -> Res<Vec<Value>> {
  ctx(&app).set_items(items.clone());
  push_config(&app);
  blocking(move || with_icons(&app, &items)).await
}

#[tauri::command]
async fn items_add_paths(app: AppHandle, paths: Vec<String>) -> Res<Vec<Value>> {
  blocking(move || {
    let c = ctx(&app);
    if c.locked() {
      return with_icons(&app, &c.items());
    }
    let mut items = c.items();
    for target in paths.iter().filter(|p| !p.is_empty()) {
      items.push(with_default_icon(&c, recall_icon(&c, item_from_path(target))));
    }
    c.set_items(items.clone());
    push_config(&app);
    with_icons(&app, &items)
  })
  .await
}

#[tauri::command]
async fn items_insert_paths(app: AppHandle, paths: Vec<String>, index: Option<f64>) -> Res<Vec<Value>> {
  blocking(move || {
    let c = ctx(&app);
    if c.locked() {
      return with_icons(&app, &c.items());
    }
    let mut items = c.items();
    let at = clamp_index(index.unwrap_or(0.0), items.len());
    let targets: Vec<String> = paths.into_iter().filter(|p| !p.is_empty()).collect();
    let added = par_map(&targets, |target| with_default_icon(&c, recall_icon(&c, item_from_path(target))));
    items.splice(at..at, added);
    c.set_items(items.clone());
    push_config(&app);
    with_icons(&app, &items)
  })
  .await
}

#[tauri::command]
async fn items_add(app: AppHandle, item: Value) -> Res<Vec<Value>> {
  blocking(move || {
    let c = ctx(&app);
    if c.locked() {
      return with_icons(&app, &c.items());
    }
    let mut items = c.items();
    let next = config::merge(&blank_item("app", "New item", ""), &item);
    items.push(with_default_icon(&c, recall_icon(&c, next)));
    c.set_items(items.clone());
    push_config(&app);
    with_icons(&app, &items)
  })
  .await
}

#[tauri::command]
async fn items_update(app: AppHandle, id: String, patch: Value) -> Res<Vec<Value>> {
  blocking(move || {
    let c = ctx(&app);
    let current = c.items();
    let before = current.iter().find(|i| i["id"] == id.as_str()).cloned();
    let mut next = patch.clone();
    // Pointing an entry at a different program: if its icon was only the old
    // program's, it should become the new one's rather than linger.
    if let Some(before) = &before {
      let new_path = text(&patch["path"]);
      if !new_path.is_empty() && new_path != text(&before["path"]) && patch.get("icon").is_none() {
        next["icon"] = json!("");
        let with = with_default_icon(&c, config::merge(before, &next));
        next["icon"] = json!(text(&with["icon"]));
      }
    }
    let items: Vec<Value> = current.into_iter().map(|i| if i["id"] == id.as_str() { config::merge(&i, &next) } else { i }).collect();
    if next.get("icon").is_some() {
      remember_icon(&c, items.iter().find(|i| i["id"] == id.as_str()));
    }
    c.set_items(items.clone());
    push_config(&app);
    with_icons(&app, &items)
  })
  .await
}

#[tauri::command]
async fn items_remove(app: AppHandle, id: String) -> Res<Vec<Value>> {
  blocking(move || {
    let c = ctx(&app);
    let current = c.items();
    let victim = current.iter().find(|i| i["id"] == id.as_str());
    if c.locked() || is_protected(victim) {
      return with_icons(&app, &current);
    }
    remember_icon(&c, victim);
    let items: Vec<Value> = current.iter().filter(|i| i["id"] != id.as_str()).cloned().collect();
    c.set_items(items.clone());
    push_config(&app);
    with_icons(&app, &items)
  })
  .await
}

#[tauri::command]
async fn items_move(app: AppHandle, from: i64, to: i64) -> Res<Vec<Value>> {
  blocking(move || {
    let c = ctx(&app);
    let mut items = c.items();
    if c.locked() || from < 0 || from as usize >= items.len() {
      return with_icons(&app, &items);
    }
    let moved = items.remove(from as usize);
    let at = clamp_index(to as f64, items.len());
    items.insert(at, moved);
    c.set_items(items.clone());
    push_config(&app);
    with_icons(&app, &items)
  })
  .await
}

#[tauri::command]
async fn items_launch(app: AppHandle, id: String) -> Res<launcher::Launched> {
  blocking(move || {
    let item = ctx(&app).items().into_iter().find(|i| i["id"] == id.as_str());
    match item {
      Some(item) => launch(&app, &item),
      None => launcher::Launched::fail("Item not found"),
    }
  })
  .await
}

#[tauri::command]
async fn items_launch_path(app: AppHandle, target: String) -> Res<launcher::Launched> {
  blocking(move || launch(&app, &json!({ "type": "app", "path": target, "label": "" }))).await
}

#[tauri::command]
fn dock_content_size(app: AppHandle, width: f64, height: f64) {
  ctx(&app).dock.set_content_size(width, height);
}

#[tauri::command]
fn dock_mouse_enter(app: AppHandle) {
  ctx(&app).dock.reveal();
}

#[tauri::command]
fn dock_mouse_leave(app: AppHandle) {
  ctx(&app).dock.schedule_hide();
}

#[tauri::command]
fn dock_interactive_rect(app: AppHandle, rect: Option<geometry::Rect>) {
  ctx(&app).dock.set_rect(rect);
}

/// Warmed while the pointer is on an icon, so clicking it does not have to
/// wait for a window lookup.
#[tauri::command]
fn dock_prefetch_windows(app: AppHandle, target: String) {
  let c = ctx(&app);
  if !truthy(&c.dock_cfg()["focusRunningWindow"]) || target.is_empty() || target.starts_with("dock:") || target.starts_with("system:") {
    return;
  }
  let key = target.rsplit(['\\', '/']).next().unwrap_or("").to_lowercase();
  if let Some(known) = c.running.names() {
    if !key.is_empty() && !known.contains(&key) {
      return;
    }
  }
  app_windows::prefetch(&target);
}

#[tauri::command]
async fn dock_context_menu(app: AppHandle, item_id: Option<String>, insert_index: Option<f64>) -> Res<bool> {
  blocking(move || {
    menus::dock_menu(&app, item_id.as_deref(), insert_index);
    true
  })
  .await
}

#[tauri::command]
async fn trash_state() -> trash::State {
  trash::state()
}

#[tauri::command]
async fn trash_empty(app: AppHandle) -> Res<Value> {
  blocking(move || empty_trash(&app)).await
}

#[tauri::command]
fn themes_list(app: AppHandle) -> Vec<Value> {
  ctx(&app).themes.list().iter().map(|t| t.summary()).collect()
}

#[tauri::command]
fn themes_variables(app: AppHandle, id: String) -> Value {
  match ctx(&app).themes.get(&id) {
    Some(t) => json!({ "variables": t.variables, "ui": t.ui, "dark": t.dark }),
    None => Value::Null,
  }
}

#[tauri::command]
async fn themes_open_folder(app: AppHandle) -> String {
  let dir = ctx(&app).themes.ensure_user_dir();
  launcher::open_path(&dir.to_string_lossy()).err().unwrap_or_default()
}

#[tauri::command]
async fn apps_scan(app: AppHandle, opts: Option<Value>) -> Res<Vec<Value>> {
  let force = opts.as_ref().map(|o| truthy(&o["force"])).unwrap_or(false);
  blocking(move || {
    let found = app_scanner::scan(force);
    let c = ctx(&app);
    par_map(&found, |entry| {
      let mut out = json!(entry);
      out["iconUrl"] = json!(c.icons.resolve(&json!({ "path": entry.path, "icon": entry.icon })));
      out
    })
  })
  .await
}

#[tauri::command]
async fn dialog_add_app(app: AppHandle) -> Res<Option<Vec<Value>>> {
  blocking(move || pick_and_add(&app, None)).await
}

#[tauri::command]
async fn dialog_add_folder(app: AppHandle) -> Res<Option<Vec<Value>>> {
  blocking(move || pick_folder_and_add(&app, None)).await
}

#[tauri::command]
async fn dialog_pick_icon(app: AppHandle) -> Res<Option<String>> {
  blocking(move || {
    let images: &[&str] = &["png", "svg", "jpg", "jpeg", "gif", "webp", "ico", "icns", "bmp"];
    let picked = pick_files(&app, "Choose an icon", &[("Images", images)], None, false);
    picked.into_iter().next().map(|p| ctx(&app).icons.import_custom_icon(&p.to_string_lossy()))
  })
  .await
}

#[tauri::command]
async fn dialog_pick_target(app: AppHandle) -> Res<Option<String>> {
  blocking(move || pick_files(&app, "Choose a target", &[], None, false).into_iter().next().map(|p| p.to_string_lossy().into_owned())).await
}

/// Every icon stored inside a program file, RocketDock style.
#[tauri::command]
async fn icons_from_program(app: AppHandle, target: String) -> Res<Vec<Value>> {
  blocking(move || {
    let out = ctx(&app).data_dir.join("extracted-icons");
    pe_icons::extract_all(Path::new(&target), &out)
      .into_iter()
      .map(|e| {
        let url = icons::file_url(Path::new(&e.file));
        let mut v = json!(e);
        v["url"] = json!(url);
        v
      })
      .collect()
  })
  .await
}

#[tauri::command]
async fn icons_pick_program(app: AppHandle) -> Res<Option<String>> {
  blocking(move || {
    let title = t(&app, "m.iconFromExe", &[]);
    let filters: Vec<(&str, &[&str])> = if cfg!(windows) {
      vec![("Programs and libraries", &["exe", "dll", "ico", "ocx", "cpl", "mun"]), ("All Files", &["*"])]
    } else {
      vec![("All Files", &["*"])]
    };
    let dir = std::env::var_os("SystemRoot").map(PathBuf::from);
    pick_files(&app, &title, &filters, dir, false).into_iter().next().map(|p| p.to_string_lossy().into_owned())
  })
  .await
}

/// Store a chosen .ico/.png as this item's icon.
#[tauri::command]
async fn icons_use_file(app: AppHandle, source: String) -> Res<String> {
  blocking(move || ctx(&app).icons.import_custom_icon(&source)).await
}

#[tauri::command]
fn system_displays(app: AppHandle) -> Vec<Value> {
  #[cfg(windows)]
  let names = win::display_names();
  let primary = app.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
  app
    .available_monitors()
    .unwrap_or_default()
    .iter()
    .enumerate()
    .map(|(i, m)| {
      let id = m.name().cloned().unwrap_or_else(|| format!("display-{i}"));
      #[cfg(windows)]
      let label = names.get(&id).cloned().unwrap_or_else(|| format!("Display {}", i + 1));
      #[cfg(not(windows))]
      let label = m.name().cloned().unwrap_or_else(|| format!("Display {}", i + 1));
      json!({
        "id": id, "label": label,
        "bounds": { "x": m.position().x, "y": m.position().y, "width": m.size().width, "height": m.size().height },
        "primary": Some(&id) == primary.as_ref(),
      })
    })
    .collect()
}

#[tauri::command]
fn system_autostart(app: AppHandle) -> bool {
  autostart_enabled(&app)
}

#[tauri::command]
async fn system_clear_icon_cache(app: AppHandle) -> bool {
  ctx(&app).icons.clear_cache();
  reload_all(&app);
  true
}

#[tauri::command]
fn settings_open(app: AppHandle) -> bool {
  open_settings(&app);
  true
}

#[tauri::command]
fn settings_close(app: AppHandle) -> bool {
  close_settings(&app);
  true
}

#[tauri::command]
fn app_quit(app: AppHandle) {
  quit(&app);
}

#[tauri::command]
fn app_reload_dock(app: AppHandle) -> bool {
  reload_all(&app);
  true
}

#[tauri::command]
fn app_report_error(text: String) {
  error_report::report(&text);
}

/* --------------------------------------------------------------------- *
 * Start-up
 * --------------------------------------------------------------------- */

/// Where everything lives: the folder the Electron build used (its `userData`),
/// so settings, chosen icons and user themes carry straight over.
fn data_dir(app: &AppHandle) -> PathBuf {
  if let Some(dir) = std::env::var_os("MYDOCKBAR_CONFIG_DIR") {
    return PathBuf::from(dir);
  }
  app.path().config_dir().map(|d| d.join("MyDockBar")).unwrap_or_else(|_| PathBuf::from("MyDockBar"))
}

fn builtin_themes(app: &AppHandle) -> PathBuf {
  let bundled = app.path().resource_dir().map(|d| d.join("themes")).ok().filter(|d| d.is_dir());
  bundled.unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("themes"))
}

fn setup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let dir = data_dir(app);
  let _ = std::fs::create_dir_all(&dir);
  let mut config = Config::new(dir.clone());
  config.load();
  let dock_cfg = config.dock().clone();
  let start_with_os = truthy(&config.get()["startWithOS"]);

  let handle = app.clone();
  let running = running::RunningWatch::new(move |names, apps| {
    bridge::post(&handle, dock::LABEL, "dock:running", json!(names));
    let decorated = decorate_running_apps(&handle, &apps);
    bridge::post(&handle, dock::LABEL, "dock:running-apps", json!(decorated));
  });

  let ctx = Arc::new(Ctx {
    data_dir: dir.clone(),
    config: Mutex::new(config),
    icons: Icons { data_dir: dir.clone() },
    themes: Themes { builtin_dir: builtin_themes(app), user_dir: dir.join("themes"), cache: Default::default() },
    dock: dock::Dock::new(app.clone(), dock_cfg, start_with_os),
    running,
    trash: Mutex::new(None),
    menu_actions: Mutex::new(HashMap::new()),
    tray: Mutex::new(None),
    fake_autostart: std::env::var_os("MYDOCKBAR_CONFIG_DIR").map(|_| Mutex::new(false)),
    quitting: AtomicBool::new(false),
    saver: Arc::new((Mutex::new(None), Condvar::new())),
  });
  app.manage(ctx.clone());
  start_saver(&ctx);
  ctx.themes.ensure_user_dir();

  if truthy(&ctx.cfg()["firstRun"]) {
    let found = app_scanner::scan(true);
    ctx.config.lock().unwrap().patch(&json!({ "firstRun": false }));
    ctx.set_items(seed::build(&found));
  } else if let Some(items) = seed::missing_defaults(&ctx.items()) {
    ctx.set_items(items);
  }

  // Keep the stored preference and the OS in sync on every launch.
  if start_with_os != autostart_enabled(app) {
    set_autostart(app, start_with_os);
  }

  // macOS: the dock is chrome, so keep it out of the system Dock and app switcher.
  #[cfg(target_os = "macos")]
  app.set_activation_policy(tauri::ActivationPolicy::Accessory);

  create_dock_window(app)?;
  ctx.dock.start();
  sync_running_watch(app);
  sync_trash_watch(app);
  if let Err(err) = menus::create_tray(app) {
    eprintln!("[tray] could not create the tray icon: {err}");
  }
  Ok(())
}

pub fn run() {
  let app = tauri::Builder::default()
    // One dock, one process. A second launch means "show me the dock", not
    // "start another copy". The plugin has to come first.
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(c) = app.try_state::<Arc<Ctx>>() {
        c.dock.reveal();
        if !c.dock.is_visible() {
          c.dock.show();
        }
      }
    }))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
    .register_uri_scheme_protocol("dock", |_ctx, request| protocol::handle(request.uri().path()))
    .on_menu_event(|app, event| menus::on_menu_event(app, event.id().as_ref()))
    .on_page_load(|webview, payload| {
      if payload.event() == PageLoadEvent::Started {
        bridge::forget(webview.label());
      }
    })
    .on_window_event(|window, event| {
      if let WindowEvent::Destroyed = event {
        let label = window.label().to_string();
        if error_report::is_error_window(&label) {
          error_report::finished(&label);
        } else {
          bridge::drop_window(&label);
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      bridge_listen,
      config_get,
      config_patch,
      config_reset,
      config_export,
      config_import,
      items_get,
      items_set,
      items_add,
      items_add_paths,
      items_insert_paths,
      items_update,
      items_remove,
      items_move,
      items_launch,
      items_launch_path,
      dock_content_size,
      dock_mouse_enter,
      dock_mouse_leave,
      dock_interactive_rect,
      dock_prefetch_windows,
      dock_context_menu,
      trash_state,
      trash_empty,
      themes_list,
      themes_variables,
      themes_open_folder,
      apps_scan,
      dialog_add_app,
      dialog_add_folder,
      dialog_pick_icon,
      dialog_pick_target,
      icons_from_program,
      icons_pick_program,
      icons_use_file,
      system_displays,
      system_autostart,
      system_clear_icon_cache,
      settings_open,
      settings_close,
      app_quit,
      app_reload_dock,
      app_report_error,
    ])
    .setup(|app| {
      error_report::install(app.handle());
      setup(app.handle())
    })
    .build(tauri::generate_context!())
    .expect("MyDockBar could not start");

  app.run(|app, event| match event {
    // The dock lives in the tray: closing the settings window must not end
    // the process. The only way out is Quit.
    RunEvent::ExitRequested { api, code, .. } => {
      let quitting = app.try_state::<Arc<Ctx>>().map(|c| c.quitting.load(Ordering::SeqCst)).unwrap_or(true);
      if code.is_none() && !quitting {
        api.prevent_exit();
      }
    }
    RunEvent::Exit => {
      if let Some(c) = app.try_state::<Arc<Ctx>>() {
        c.save_now();
      }
    }
    _ => {}
  });
}
