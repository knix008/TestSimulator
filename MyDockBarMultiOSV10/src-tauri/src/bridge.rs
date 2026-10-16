//! Main → page notifications.
//!
//! A page that is still loading has not started listening yet, and an event
//! sent to it then is simply lost - which is how "open the settings window on
//! this item" used to open it on whatever tab it was on. So every notification
//! goes through `post()`: delivered at once to a page that is listening, kept
//! for one that is not, and handed over by `bridge_listen` the moment it starts.
//! A page that reloads starts again from not listening (`forget()`).

use serde_json::Value;
use std::{
  collections::{HashMap, HashSet},
  sync::Mutex,
};
use tauri::{AppHandle, Emitter, EventTarget, Runtime};

/// Kept per window and event until the page listens; the oldest go first.
const KEEP: usize = 32;

#[derive(Default)]
struct Bridge {
  listening: HashSet<(String, String)>,
  queued: HashMap<(String, String), Vec<Value>>,
}

static BRIDGE: Mutex<Option<Bridge>> = Mutex::new(None);

fn with<T>(f: impl FnOnce(&mut Bridge) -> T) -> T {
  let mut guard = BRIDGE.lock().unwrap();
  f(guard.get_or_insert_with(Bridge::default))
}

/// High-frequency notifications that are stale by the time a page could read
/// them, so they are never kept.
fn transient(event: &str) -> bool {
  matches!(event, "dock:pointer")
}

pub fn post<R: Runtime>(app: &AppHandle<R>, label: &str, event: &str, payload: Value) {
  let key = (label.to_string(), event.to_string());
  let live = with(|b| {
    if b.listening.contains(&key) {
      return true;
    }
    if !transient(event) {
      let list = b.queued.entry(key).or_default();
      list.push(payload.clone());
      if list.len() > KEEP {
        list.remove(0);
      }
    }
    false
  });
  if live {
    let _ = app.emit_to(EventTarget::webview_window(label), event, payload);
  }
}

/// Every window at once - the config snapshot, the bin's state.
pub fn broadcast<R: Runtime>(app: &AppHandle<R>, labels: &[String], event: &str, payload: Value) {
  for label in labels {
    post(app, label, event, payload.clone());
  }
}

/// The page has started listening: hand over what it missed.
pub fn listen(label: &str, event: &str) -> Vec<Value> {
  let key = (label.to_string(), event.to_string());
  with(|b| {
    b.listening.insert(key.clone());
    b.queued.remove(&key).unwrap_or_default()
  })
}

/// The page is loading again (a reload, or a window closing).
pub fn forget(label: &str) {
  with(|b| {
    b.listening.retain(|(l, _)| l != label);
  });
}

/// The window has gone for good: nothing kept for it is wanted any more.
pub fn drop_window(label: &str) {
  with(|b| {
    b.listening.retain(|(l, _)| l != label);
    b.queued.retain(|(l, _), _| l != label);
  });
}
