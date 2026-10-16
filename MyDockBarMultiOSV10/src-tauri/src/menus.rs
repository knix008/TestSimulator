//! The tray icon and its menu, and the dock's own popup menus.
//!
//! Every entry carries an icon (`test::every_menu_entry_has_an_icon` holds the
//! code to it), so "which one is active" lives in the icon rather than in a
//! tick. Clicks arrive on the UI thread through `on_menu_event`, and are run on
//! a thread of their own: several open dialogs or wait on the shell.

use crate::{
  app_windows::AppWindow,
  config::{text, truthy},
  ctx, geometry, icons, launcher, protocol, seed, t, Action,
};
use serde_json::{json, Value};
use std::sync::{
  atomic::{AtomicU64, Ordering},
  Arc,
};
use tauri::{
  image::Image,
  menu::{IconMenuItem, IsMenuItem, Menu, PredefinedMenuItem, Submenu},
  tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
  AppHandle, Manager,
};

const TRAY_ID: &str = "mydockbar";
static NEXT: AtomicU64 = AtomicU64::new(1);

/// Menu glyphs at the size the screen wants: the 32px drawing on a display
/// scaled by 150% or more.
fn double_size(app: &AppHandle) -> bool {
  app.primary_monitor().ok().flatten().map(|m| m.scale_factor() >= 1.5).unwrap_or(false)
}

/// A glyph by name. A missing one leaves its entry without an icon rather than
/// breaking the menu.
fn glyph(app: &AppHandle, name: &str) -> Option<Image<'static>> {
  let bytes = protocol::glyph(name, double_size(app));
  if bytes.is_none() {
    eprintln!("[menu-icons] missing glyph: {name}");
  }
  Image::from_bytes(bytes?).ok().map(|i| i.to_owned())
}

/// The glyph for a dock entry, based on what kind of entry it is.
fn type_glyph(app: &AppHandle, item: Option<&Value>) -> Option<Image<'static>> {
  let Some(item) = item else { return glyph(app, "app") };
  let path = text(&item["path"]);
  let name = match text(&item["type"]).as_str() {
    "separator" => "separator",
    "folder" => "add-folder",
    "url" => "link",
    _ if path.starts_with("system:") || path.starts_with("dock:") => "dock",
    _ => "app",
  };
  glyph(app, name)
}

/// The entry's own icon, scaled for a menu, or its type glyph.
fn item_icon(app: &AppHandle, item: &Value) -> Option<Image<'static>> {
  let px = if double_size(app) { 32 } else { 16 };
  if item["type"] != "separator" {
    if let Some(file) = ctx(app).icons.resolve_file(item) {
      if let Some((rgba, w, h)) = icons::menu_bitmap(&file, px) {
        return Some(Image::new_owned(rgba, w, h));
      }
    }
  }
  type_glyph(app, Some(item))
}

/// Builds one menu, recording what each entry does under an id of its own.
struct Builder<'a> {
  app: &'a AppHandle,
  scope: &'static str,
  actions: Vec<(String, Action)>,
}

impl<'a> Builder<'a> {
  fn new(app: &'a AppHandle, scope: &'static str) -> Self {
    Self { app, scope, actions: Vec::new() }
  }

  fn entry(&mut self, label: &str, icon: Option<Image<'static>>, enabled: bool, action: Option<Action>) -> IconMenuItem<tauri::Wry> {
    let id = format!("{}:{}", self.scope, NEXT.fetch_add(1, Ordering::Relaxed));
    if let Some(action) = action {
      self.actions.push((id.clone(), action));
    }
    IconMenuItem::with_id(self.app, id, label, enabled, icon, None::<&str>).expect("menu item")
  }

  fn item(&mut self, label: &str, icon: &str, enabled: bool, action: impl Fn(&AppHandle) + Send + Sync + 'static) -> IconMenuItem<tauri::Wry> {
    let image = glyph(self.app, icon);
    self.entry(label, image, enabled, Some(Arc::new(action)))
  }

  fn header(&mut self, label: &str, icon: Option<Image<'static>>) -> IconMenuItem<tauri::Wry> {
    self.entry(label, icon, false, None)
  }

  fn separator(&self) -> PredefinedMenuItem<tauri::Wry> {
    PredefinedMenuItem::separator(self.app).expect("separator")
  }

  /// Make these the actions of this scope, replacing the last menu's.
  fn commit(self) {
    let c = ctx(self.app);
    let mut map = c.menu_actions.lock().unwrap();
    let prefix = format!("{}:", self.scope);
    map.retain(|id, _| !id.starts_with(&prefix));
    map.extend(self.actions);
  }
}

pub fn on_menu_event(app: &AppHandle, id: &str) {
  let action = ctx(app).menu_actions.lock().unwrap().get(id).cloned();
  if let Some(action) = action {
    let app = app.clone();
    std::thread::spawn(move || action(&app));
  }
}

/* ------------------------------- the tray ------------------------------- */

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
  // macOS wants a template image so the icon adapts to light/dark menu bars.
  #[cfg(target_os = "macos")]
  let bytes: &[u8] = include_bytes!("../../build/trayTemplate@2x.png");
  #[cfg(not(target_os = "macos"))]
  let bytes: &[u8] = if double_size(app) { include_bytes!("../../build/tray@2x.png") } else { include_bytes!("../../build/tray.png") };
  let image = Image::from_bytes(bytes)?.to_owned();

  let menu = tray_menu(app)?;
  let tray = TrayIconBuilder::with_id(TRAY_ID)
    .icon(image)
    .icon_as_template(cfg!(target_os = "macos"))
    .tooltip("MyDockBar")
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = event {
        ctx(tray.app_handle()).dock.toggle_visible();
      }
    })
    .build(app)?;
  *ctx(app).tray.lock().unwrap() = Some(tray);
  Ok(())
}

pub fn rebuild_tray(app: &AppHandle) {
  let Ok(menu) = tray_menu(app) else { return };
  if let Some(tray) = ctx(app).tray.lock().unwrap().as_ref() {
    let _ = tray.set_menu(Some(menu));
  }
}

/// A setting changed from a menu: write it, apply it, show it everywhere.
fn change(app: &AppHandle, partial: Value) {
  let c = ctx(app);
  c.patch(&partial);
  crate::apply_dock(app);
  rebuild_tray(app);
  crate::push_config(app);
}

fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
  let c = ctx(app);
  let cfg = c.cfg();
  let dock = &cfg["dock"];
  let locale = crate::active_locale(&cfg);
  let tr = |key: &str| crate::i18n::translate(locale, key, &[]);
  let mut b = Builder::new(app, "tray");

  let header = b.header(&tr("menu.app"), glyph(app, "dock"));
  let show = b.item(&tr("menu.showHide"), "show", true, |app| ctx(app).dock.toggle_visible());

  let current_theme = text(&cfg["theme"]);
  let themes = c.themes.list();
  let mut theme_items: Vec<IconMenuItem<tauri::Wry>> = Vec::new();
  for theme in &themes {
    let id = theme.id.clone();
    let icon = if theme.id == current_theme { "theme-active" } else { "theme" };
    theme_items.push(b.item(&theme.name, icon, true, move |app| change(app, json!({ "theme": id }))));
  }
  if theme_items.is_empty() {
    theme_items.push(b.item(&tr("menu.noThemes"), "theme", false, |_| {}));
  }
  let theme_refs: Vec<&dyn IsMenuItem<tauri::Wry>> = theme_items.iter().map(|i| i as &dyn IsMenuItem<tauri::Wry>).collect();
  let theme_menu = Submenu::with_items(app, tr("menu.theme"), true, &theme_refs)?;
  let _ = theme_menu.set_icon(glyph(app, "theme"));

  let position = text(&dock["position"]);
  let mut position_items = Vec::new();
  for pos in geometry::POSITIONS {
    let icon = if position == pos { format!("pos-{pos}-active") } else { format!("pos-{pos}") };
    position_items.push(b.item(&tr(&format!("pos.{pos}")), &icon, true, move |app| change(app, json!({ "dock": { "position": pos } }))));
  }
  let position_refs: Vec<&dyn IsMenuItem<tauri::Wry>> = position_items.iter().map(|i| i as &dyn IsMenuItem<tauri::Wry>).collect();
  let position_menu = Submenu::with_items(app, tr("menu.position"), true, &position_refs)?;
  let _ = position_menu.set_icon(glyph(app, &format!("pos-{position}")));

  // One item that switches to the other language rather than a submenu: with
  // only two languages, a submenu is a second click for an answer there is
  // only one of. Name and flag are the language offered, not the one in force.
  let other = if locale == "ko" { "en" } else { "ko" };
  let language = b.item(&tr(&format!("lang.{other}")), if other == "ko" { "flag-ko" } else { "flag-en" }, true, move |app| change(app, json!({ "locale": other })));

  let locked = truthy(&dock["lockItems"]);
  let lock = b.item(&tr(if locked { "menu.unlock" } else { "menu.lock" }), if locked { "locked" } else { "unlocked" }, true, move |app| change(app, json!({ "dock": { "lockItems": !locked } })));
  let auto_hide = truthy(&dock["autoHide"]);
  let hide = b.item(&tr(if auto_hide { "menu.autoHideOn" } else { "menu.autoHideOff" }), if auto_hide { "toggle-on" } else { "toggle-off" }, true, move |app| change(app, json!({ "dock": { "autoHide": !auto_hide } })));

  let settings = b.item(&tr("menu.settings"), "settings", true, crate::open_settings);
  let reload = b.item(&tr("menu.reload"), "reload", true, crate::reload_all);
  let quit = b.item(&tr("menu.quit"), "quit", true, crate::quit);
  let (s1, s2, s3) = (b.separator(), b.separator(), b.separator());

  let menu = Menu::with_items(app, &[&header, &s1, &show, &theme_menu, &position_menu, &language, &lock, &hide, &s2, &settings, &reload, &s3, &quit])?;
  b.commit();
  Ok(menu)
}

/* ------------------------------ popup menus ------------------------------ */

/// Show a popup menu over the dock. The pointer poll has to know: a menu that
/// is up takes every mouse event away from the dock, so the dock is told where
/// the cursor goes by someone else until the menu is dismissed.
fn popup(app: &AppHandle, menu: &Menu<tauri::Wry>) {
  let c = ctx(app);
  let Some(win) = app.get_webview_window(crate::dock::LABEL) else { return };
  c.dock.set_menu_open(true);
  // On Windows and macOS this returns once the menu has closed.
  let _ = win.popup_menu(menu);
  c.dock.set_menu_open(false);
}

/// Several windows of one program: let the user pick, showing each window's
/// title beside the application's own icon.
pub fn window_picker(app: &AppHandle, item: &Value, windows: &[AppWindow]) {
  let mut b = Builder::new(app, "ctx");
  let icon = item_icon(app, item);
  let label = text(&item["label"]);
  let title = if label.is_empty() { t(app, "menu.unnamed", &[]) } else { label };
  let header = b.header(&title, icon.clone());
  let mut rows = Vec::new();
  for w in windows {
    let id = w.id.clone();
    rows.push(b.entry(&w.title, icon.clone(), true, Some(Arc::new(move |_: &AppHandle| {
      crate::app_windows::focus(&id);
    }))));
  }
  let target = item.clone();
  let fresh = b.item(&t(app, "menu.newWindow", &[]), "open", true, move |app| {
    let _ = launcher::launch(&target, &crate::folders_for(app));
  });
  let (s1, s2) = (b.separator(), b.separator());
  let mut refs: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![&header, &s1];
  refs.extend(rows.iter().map(|r| r as &dyn IsMenuItem<tauri::Wry>));
  refs.push(&s2);
  refs.push(&fresh);
  let Ok(menu) = Menu::with_items(app, &refs) else { return };
  b.commit();
  popup(app, &menu);
}

/// The dock's right-click menu, for an entry or for the dock itself.
pub fn dock_menu(app: &AppHandle, item_id: Option<&str>, insert_index: Option<f64>) {
  let c = ctx(app);
  let data = c.cfg();
  let items = c.items();
  let item = item_id.and_then(|id| items.iter().find(|i| i["id"] == id)).cloned();
  let locked = truthy(&data["dock"]["lockItems"]);
  // Where the pointer was when the menu opened; anything added goes here.
  let at = insert_index.filter(|v| v.is_finite()).map(|v| v.max(0.0).min(items.len() as f64));

  let mut b = Builder::new(app, "ctx");
  let mut entries: Vec<Box<dyn IsMenuItem<tauri::Wry>>> = Vec::new();

  if let Some(item) = &item {
    let separator = item["type"] == "separator";
    let label = text(&item["label"]);
    // The header shows the entry's real icon, so the menu names the thing it is
    // about both in words and in the picture the user just clicked.
    let title = if separator { t(app, "menu.separator", &[]) } else if label.is_empty() { t(app, "menu.unnamed", &[]) } else { label };
    entries.push(Box::new(b.header(&title, item_icon(app, item))));
    entries.push(Box::new(b.separator()));

    if !separator {
      let target = item.clone();
      entries.push(Box::new(b.item(&t(app, "menu.open", &[]), "open", true, move |app| {
        let _ = launcher::launch(&target, &crate::folders_for(app));
      })));
    }
    let path = text(&item["path"]);
    if path == "system:trash" {
      let full = !crate::trash::state().empty;
      entries.push(Box::new(b.item(&t(app, "menu.emptyTrash", &[]), "trash-empty", full, |app| {
        crate::empty_trash(app);
      })));
    }
    if !path.is_empty() && !path.starts_with("dock:") && !path.starts_with("system:") && item["type"] != "url" {
      let p = path.clone();
      entries.push(Box::new(b.item(&t(app, "menu.reveal", &[]), "reveal", true, move |_| launcher::reveal_in_file_manager(&p))));
    }
    entries.push(Box::new(b.separator()));
    let id = text(&item["id"]);
    entries.push(Box::new(b.item(&t(app, "menu.itemSettings", &[]), "edit", true, move |app| crate::focus_item(app, &id))));
    let protected = item["type"] == "special";
    let victim = item.clone();
    entries.push(Box::new(b.item(&t(app, "menu.removeItem", &[]), "remove", !locked && !protected, move |app| {
      let c = ctx(app);
      if c.locked() || victim["type"] == "special" {
        return;
      }
      crate::remember(app, &victim);
      let rest: Vec<Value> = c.items().into_iter().filter(|i| i["id"] != victim["id"]).collect();
      c.set_items(rest);
      crate::push_config(app);
    })));
    entries.push(Box::new(b.separator()));
  }

  entries.push(Box::new(b.item(&t(app, "menu.addApp", &[]), "add-app", !locked, move |app| {
    crate::pick_and_add(app, at);
  })));
  entries.push(Box::new(b.item(&t(app, "menu.addFolder", &[]), "add-folder", !locked, move |app| {
    crate::pick_folder_and_add(app, at);
  })));
  entries.push(Box::new(b.item(&t(app, "menu.addSeparator", &[]), "separator", !locked, move |app| {
    let c = ctx(app);
    if c.locked() {
      return;
    }
    let mut items = c.items();
    let index = at.map(|v| v.min(items.len() as f64) as usize).unwrap_or(items.len());
    items.insert(index, json!({ "id": seed::new_id(), "type": "separator", "label": "", "path": "", "args": "", "icon": "" }));
    c.set_items(items);
    crate::push_config(app);
  })));
  entries.push(Box::new(b.separator()));

  let auto_hide = truthy(&data["dock"]["autoHide"]);
  entries.push(Box::new(b.item(&t(app, if auto_hide { "menu.autoHideOn" } else { "menu.autoHideOff" }, &[]), if auto_hide { "toggle-on" } else { "toggle-off" }, true, move |app| {
    change(app, json!({ "dock": { "autoHide": !auto_hide } }))
  })));
  entries.push(Box::new(b.item(&t(app, if locked { "menu.unlock" } else { "menu.lock" }, &[]), if locked { "locked" } else { "unlocked" }, true, move |app| {
    change(app, json!({ "dock": { "lockItems": !locked } }))
  })));
  // The same one-click language switch the tray offers.
  let other = if crate::active_locale(&data) == "ko" { "en" } else { "ko" };
  entries.push(Box::new(b.item(&t(app, &format!("lang.{other}"), &[]), if other == "ko" { "flag-ko" } else { "flag-en" }, true, move |app| {
    change(app, json!({ "locale": other }))
  })));
  entries.push(Box::new(b.item(&t(app, "menu.dockSettings", &[]), "settings", true, crate::open_settings)));
  entries.push(Box::new(b.item(&t(app, "menu.reload", &[]), "reload", true, crate::reload_all)));
  entries.push(Box::new(b.separator()));
  entries.push(Box::new(b.item(&t(app, "menu.quit", &[]), "quit", true, crate::quit)));

  let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = entries.iter().map(|e| e.as_ref()).collect();
  let Ok(menu) = Menu::with_items(app, &refs) else { return };
  b.commit();
  popup(app, &menu);
}

#[cfg(test)]
mod tests {
  /// Every `b.item(` names a glyph that exists, and no entry is built bare.
  #[test]
  fn every_menu_entry_has_an_icon() {
    let source = include_str!("menus.rs");
    let body = &source[..source.find("#[cfg(test)]").unwrap()];
    assert!(!body.replace("IconMenuItem::with_id(", "").contains("MenuItem::with_id("), "a plain MenuItem has no icon - use Builder::item");
    let names = crate::protocol::glyph_names();
    let mut missing = Vec::new();
    for (at, _) in body.match_indices(", \"") {
      // `b.item(label, "glyph", …)` and `glyph(app, "glyph")`
      let rest = &body[at + 3..];
      let Some(end) = rest.find('"') else { continue };
      let name = &rest[..end];
      let before = &body[..at];
      let call = before.rfind("b.item(").max(before.rfind("glyph(app")).unwrap_or(0);
      if call + 120 < at || name.contains(' ') || name.contains('.') || name.is_empty() {
        continue;
      }
      if !names.contains(&name) {
        missing.push(name.to_string());
      }
    }
    for pos in crate::geometry::POSITIONS {
      for variant in [format!("pos-{pos}"), format!("pos-{pos}-active")] {
        if !names.contains(&variant.as_str()) {
          missing.push(variant);
        }
      }
    }
    for flag in ["flag-ko", "flag-en", "theme-active", "dock"] {
      if !names.contains(&flag) {
        missing.push(flag.to_string());
      }
    }
    assert!(missing.is_empty(), "glyphs referenced but not generated: {missing:?}");
  }
}
