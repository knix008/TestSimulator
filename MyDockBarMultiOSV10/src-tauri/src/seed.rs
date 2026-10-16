//! What the dock contains the first time it runs.

use crate::app_scanner::Found;
use serde_json::{json, Value};
use std::{
  collections::hash_map::RandomState,
  hash::{BuildHasher, Hasher},
  sync::atomic::{AtomicU64, Ordering},
  time::{SystemTime, UNIX_EPOCH},
};

/// 16 hex digits, like the Electron build's `crypto.randomBytes(8)`.
pub fn new_id() -> String {
  static COUNTER: AtomicU64 = AtomicU64::new(0);
  let mut hasher = RandomState::new().build_hasher();
  hasher.write_u64(COUNTER.fetch_add(1, Ordering::Relaxed));
  hasher.write_u128(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
  format!("{:016x}", hasher.finish())
}

type Wish = (fn(&str) -> bool, &'static str);

/// Apps we try to put on the dock the first time MyDockBar runs, matched
/// loosely (case-insensitively, on the trimmed name) against whatever the
/// scanner found on this machine.
fn wishlist() -> &'static [Wish] {
  #[cfg(windows)]
  {
    &[
      (|l| l == "chrome" || l == "google chrome", "Chrome"),
      (|l| l == "edge" || l == "microsoft edge", "Edge"),
      (|l| l == "firefox", "Firefox"),
      (|l| l == "terminal" || l == "windows terminal", "Terminal"),
      (|l| l == "visual studio code", "VS Code"),
      (|l| l == "word" || l == "microsoft word", "Word"),
      (|l| l == "excel" || l == "microsoft excel", "Excel"),
      (|l| l == "notepad" || l == "notepad++", "Notepad"),
      (|l| l.starts_with("calculator") || l.ends_with("계산기"), "Calculator"),
    ]
  }
  #[cfg(target_os = "macos")]
  {
    &[
      (|l| l == "safari", "Safari"),
      (|l| l == "chrome" || l == "google chrome", "Chrome"),
      (|l| l == "mail", "Mail"),
      (|l| l == "terminal", "Terminal"),
      (|l| l == "visual studio code", "VS Code"),
      (|l| l == "notes", "Notes"),
      (|l| l == "calendar", "Calendar"),
      (|l| l.starts_with("system settings") || l.ends_with("system preferences"), "Settings"),
    ]
  }
  #[cfg(not(any(windows, target_os = "macos")))]
  {
    &[
      (|l| l.starts_with("firefox"), "Firefox"),
      (|l| l.starts_with("chrome") || l.starts_with("google chrome"), "Chrome"),
      (|l| l.starts_with("terminal") || l.starts_with("gnome terminal") || l.ends_with("konsole"), "Terminal"),
      (|l| matches!(l, "nautilus" | "files" | "dolphin" | "thunar"), "Files"),
      (|l| l.starts_with("visual studio code") || l.ends_with("code"), "VS Code"),
      (|l| l.starts_with("text editor") || l.contains("gedit") || l.ends_with("kate"), "Editor"),
      (|l| l == "calculator" || l == "gnome calculator", "Calculator"),
    ]
  }
}

/// The built-in entries every dock starts with. They are `special`, which is
/// also what marks them undeletable - the dock's own settings button in
/// particular has to stay reachable.
pub const DEFAULTS: [(&str, &str); 4] = [
  ("Home", "system:home"),
  ("Show Desktop", "system:show-desktop"),
  ("Trash", "system:trash"),
  ("Settings", "dock:settings"),
];

fn special(label: &str, path: &str) -> Value {
  json!({ "id": new_id(), "type": "special", "args": "", "icon": "", "label": label, "path": path })
}

pub fn build(found: &[Found]) -> Vec<Value> {
  let mut items = Vec::new();
  let mut used: Vec<&str> = Vec::new();

  for (matches, label) in wishlist() {
    let hit = found.iter().find(|entry| matches(&entry.label.trim().to_lowercase()) && !used.contains(&entry.path.as_str()));
    let Some(entry) = hit else { continue };
    used.push(&entry.path);
    items.push(json!({
      "id": new_id(), "type": "app", "label": label,
      "path": entry.path, "args": entry.args, "icon": entry.icon,
    }));
    if items.len() >= 7 {
      break;
    }
  }

  items.push(json!({ "id": new_id(), "type": "separator", "label": "", "path": "", "args": "", "icon": "" }));
  for (label, path) in DEFAULTS {
    items.push(special(label, path));
  }
  items
}

/// Add any of the dock's own buttons that a previously saved config predates.
/// Returns the new list when something was missing.
pub fn missing_defaults(items: &[Value]) -> Option<Vec<Value>> {
  let present: Vec<&str> = items.iter().filter_map(|i| i["path"].as_str()).collect();
  let missing: Vec<_> = DEFAULTS.iter().filter(|(_, path)| !present.contains(path)).collect();
  if missing.is_empty() {
    return None;
  }
  let mut next = items.to_vec();
  for (label, path) in missing {
    next.push(special(label, path));
  }
  Some(next)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn app(label: &str, path: &str) -> Found {
    Found { label: label.into(), path: path.into(), args: String::new(), icon: String::new(), source: String::new() }
  }

  #[test]
  fn always_ends_with_the_docks_own_buttons() {
    let items = build(&[]);
    let specials: Vec<_> = items.iter().filter(|i| i["type"] == "special").map(|i| i["path"].as_str().unwrap()).collect();
    for (_, path) in DEFAULTS {
      assert!(specials.contains(&path), "{path} missing from the seed");
    }
    assert!(DEFAULTS.iter().any(|(_, p)| *p == "dock:settings"));
  }

  #[test]
  fn gives_every_seeded_item_a_distinct_id() {
    let ids: Vec<_> = build(&[]).iter().map(|i| i["id"].as_str().unwrap().to_string()).collect();
    let mut unique = ids.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), ids.len());
    assert!(ids.iter().all(|id| id.len() == 16));
  }

  #[cfg(windows)]
  #[test]
  fn picks_known_applications_out_of_a_scan() {
    let scan = [app("Google Chrome", "C:\\chrome.exe"), app("Some Random Tool", "C:\\rnd.exe")];
    let labels: Vec<_> = build(&scan).iter().map(|i| i["label"].as_str().unwrap().to_string()).collect();
    assert!(labels.contains(&"Chrome".to_string()));
    assert!(!labels.contains(&"Some Random Tool".to_string()));
  }

  #[test]
  fn caps_how_many_applications_it_seeds() {
    let scan: Vec<_> = (0..40).map(|i| app("Firefox", &format!("C:\\ff{i}.exe"))).collect();
    let apps = build(&scan).iter().filter(|i| i["type"] == "app").count();
    assert!(apps <= 7, "seeded {apps} applications");
  }

  #[test]
  fn restores_buttons_an_older_config_predates() {
    let items = vec![json!({"id": "a", "type": "special", "path": "system:home"})];
    let next = missing_defaults(&items).unwrap();
    assert_eq!(next.len(), 4);
    assert!(missing_defaults(&next).is_none());
  }
}
