//! Dialog bookkeeping, ported from the Electron `popup-hub.js`. The hub never touches a
//! window itself: it hands back the handles to focus or close, so the caller can do that
//! after it lets go of the shared lock (a closing window reports back through that lock).

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use tokio::sync::oneshot;

/// Only one of these is open per weather window. Asking again brings it forward.
const ONE_WINDOW: [&str; 7] = ["forecast", "settings", "about", "print", "preview", "unsaved", "search"];

pub fn popup_key(spec: &Value) -> String {
  match spec.get("type").and_then(Value::as_str) {
    None | Some("") => "popup".into(),
    Some("forecast") => format!("forecast:{}", spec.get("range").and_then(Value::as_str).filter(|r| !r.is_empty()).unwrap_or("daily")),
    Some(kind) => kind.into(),
  }
}

pub fn keeps_one_window(spec: &Value) -> bool {
  spec.get("type").and_then(Value::as_str).is_some_and(|kind| ONE_WINDOW.contains(&kind))
}

pub fn close_result() -> Value {
  json!({ "action": "close" })
}

struct Entry<W> {
  id: String,
  spec: Value,
  win: W,
  key: String,
  owner: String,
}

pub enum Begin<W> {
  /// A new dialog. The caller creates its window and then calls `attach`.
  New { id: String, spec: Value },
  /// The same dialog is already open in this owner; bring it forward.
  Existing { id: String, win: W },
  /// The same dialog was asked for a moment ago and its window is still being built.
  Building { id: String },
}

pub enum Wait {
  Ready(Value),
  Later(oneshot::Receiver<Value>),
}

pub struct Hub<W: Clone> {
  entries: Vec<Entry<W>>,
  reserved: HashMap<String, (Value, String, String)>,
  waiters: HashMap<String, Vec<oneshot::Sender<Value>>>,
  pending: HashMap<String, Value>,
  sequence: u64,
}

impl<W: Clone> Default for Hub<W> {
  fn default() -> Self {
    Self { entries: Vec::new(), reserved: HashMap::new(), waiters: HashMap::new(), pending: HashMap::new(), sequence: 0 }
  }
}

impl<W: Clone> Hub<W> {
  fn scoped(key: &str, owner: &str) -> String {
    format!("{owner}#{key}")
  }

  /// Each weather window keeps its own dialogs, so a key is only unique within one owner.
  pub fn begin(&mut self, spec: &Value, owner: &str) -> Begin<W> {
    let key = Self::scoped(&popup_key(spec), owner);
    if keeps_one_window(spec) {
      if let Some(entry) = self.entries.iter().find(|entry| entry.key == key) {
        return Begin::Existing { id: entry.id.clone(), win: entry.win.clone() };
      }
      if let Some((id, _)) = self.reserved.iter().find(|(_, (_, k, _))| *k == key) {
        // Still being built; asking twice in a row must not open a second one.
        return Begin::Building { id: id.clone() };
      }
    }
    self.sequence += 1;
    let kind = spec.get("type").and_then(Value::as_str).unwrap_or("popup");
    let id = format!("{kind}-{}", self.sequence);
    let mut stored = spec.as_object().cloned().unwrap_or_default();
    stored.insert("popupId".into(), json!(id));
    let stored = Value::Object(stored);
    self.reserved.insert(id.clone(), (stored.clone(), key, owner.to_string()));
    Begin::New { id, spec: stored }
  }

  /// The window for a dialog that `begin` reserved now exists.
  pub fn attach(&mut self, id: &str, win: W) {
    if let Some((spec, key, owner)) = self.reserved.remove(id) {
      self.entries.push(Entry { id: id.to_string(), spec, win, key, owner });
    }
  }

  /// The window could not be built, so the dialog ends as if it was closed.
  pub fn abandon(&mut self, id: &str) {
    self.reserved.remove(id);
    self.settle(id, close_result());
  }

  /// The page can ask before `attach` has run, so a reserved dialog answers too.
  pub fn take(&self, id: &str) -> Option<Value> {
    self.entries
      .iter()
      .find(|entry| entry.id == id)
      .map(|entry| entry.spec.clone())
      .or_else(|| self.reserved.get(id).map(|(spec, _, _)| spec.clone()))
  }

  pub fn has(&self, id: &str) -> bool {
    self.entries.iter().any(|entry| entry.id == id)
  }

  #[cfg(test)]
  pub fn len(&self) -> usize {
    self.entries.len()
  }

  /// Merges `patch` into an open dialog and returns its window so the caller can send the patch.
  pub fn refresh(&mut self, key: &str, patch: &Value, owner: &str) -> Option<(String, W)> {
    let scoped = Self::scoped(key, owner);
    let entry = self.entries.iter_mut().find(|entry| entry.key == scoped)?;
    merge(&mut entry.spec, patch);
    Some((entry.id.clone(), entry.win.clone()))
  }

  pub fn window(&self, id: &str) -> Option<W> {
    self.entries.iter().find(|entry| entry.id == id).map(|entry| entry.win.clone())
  }

  pub fn wait(&mut self, id: &str) -> Wait {
    if let Some(result) = self.pending.remove(id) {
      return Wait::Ready(result);
    }
    let (tx, rx) = oneshot::channel();
    self.waiters.entry(id.to_string()).or_default().push(tx);
    Wait::Later(rx)
  }

  fn settle(&mut self, id: &str, result: Value) {
    let waiters = self.waiters.remove(id).unwrap_or_default();
    if waiters.is_empty() {
      self.pending.insert(id.to_string(), result);
    } else {
      for tx in waiters {
        let _ = tx.send(result.clone());
      }
    }
  }

  /// Ends a dialog with its answer. Returns the window to close, if it is still open.
  pub fn finish(&mut self, id: &str, result: Value) -> Option<W> {
    let at = self.entries.iter().position(|entry| entry.id == id);
    let entry = at.map(|at| self.entries.remove(at));
    self.settle(id, result);
    entry.map(|entry| entry.win)
  }

  pub fn close_all(&mut self) -> Vec<W> {
    let ids: Vec<String> = self.entries.iter().map(|entry| entry.id.clone()).collect();
    ids.iter().filter_map(|id| self.finish(id, close_result())).collect()
  }

  /// A weather window that goes away takes its own dialogs with it.
  pub fn close_owned(&mut self, owner: &str) -> Vec<W> {
    let ids: Vec<String> = self.entries.iter().filter(|entry| entry.owner == owner).map(|entry| entry.id.clone()).collect();
    ids.iter().filter_map(|id| self.finish(id, close_result())).collect()
  }
}

fn merge(target: &mut Value, patch: &Value) {
  let Some(patch) = patch.as_object() else { return };
  if !target.is_object() {
    *target = Value::Object(Map::new());
  }
  let object = target.as_object_mut().expect("object");
  for (key, value) in patch {
    object.insert(key.clone(), value.clone());
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn open(hub: &mut Hub<&'static str>, spec: Value, owner: &str, win: &'static str) -> (String, bool) {
    match hub.begin(&spec, owner) {
      Begin::New { id, .. } => {
        hub.attach(&id, win);
        (id, false)
      }
      Begin::Existing { id, .. } | Begin::Building { id } => (id, true),
    }
  }

  #[test]
  fn each_window_keeps_its_own_dialogs_and_loses_them_when_it_closes() {
    let mut hub = Hub::default();
    let (first, again) = open(&mut hub, json!({ "type": "settings" }), "window-a", "first");
    let (second, _) = open(&mut hub, json!({ "type": "settings" }), "window-b", "second");
    assert!(!again);
    assert_ne!(first, second);
    assert!(open(&mut hub, json!({ "type": "settings" }), "window-a", "again").1);
    assert_eq!(hub.refresh("settings", &json!({ "title": "x" }), "window-b").map(|r| r.0), Some(second));
    assert!(hub.refresh("settings", &json!({ "title": "x" }), "window-c").is_none());
    assert_eq!(hub.close_owned("window-a"), vec!["first"]);
    assert_eq!(hub.len(), 1);
    hub.close_all();
    assert_eq!(hub.len(), 0);
  }

  #[test]
  fn forecasts_are_one_window_per_range_and_refresh_merges() {
    let mut hub = Hub::default();
    let (daily, _) = open(&mut hub, json!({ "type": "forecast", "range": "daily" }), "", "daily");
    let (weekly, _) = open(&mut hub, json!({ "type": "forecast", "range": "weekly" }), "", "weekly");
    assert_ne!(daily, weekly);
    let (id, win) = hub.refresh("forecast:daily", &json!({ "markup": "<p>2026-10-09</p>" }), "").unwrap();
    assert_eq!((id.as_str(), win), (daily.as_str(), "daily"));
    assert_eq!(hub.take(&daily).unwrap()["markup"], "<p>2026-10-09</p>");
    assert_eq!(hub.take(&daily).unwrap()["popupId"], daily.as_str());
    assert!(hub.refresh("forecast:missing", &json!({}), "").is_none());
  }

  #[test]
  fn quitting_answers_every_waiting_dialog_with_close() {
    let mut hub = Hub::default();
    let (id, _) = open(&mut hub, json!({ "type": "about" }), "", "about");
    let Wait::Later(mut rx) = hub.wait(&id) else { panic!("about is still open") };
    assert_eq!(hub.close_all(), vec!["about"]);
    assert_eq!(rx.try_recv().unwrap(), close_result());
    assert_eq!(hub.len(), 0);
  }

  #[test]
  fn an_answer_given_before_anyone_waits_is_kept() {
    let mut hub = Hub::default();
    let (id, _) = open(&mut hub, json!({ "type": "unsaved" }), "", "unsaved");
    assert_eq!(hub.finish(&id, json!({ "action": "save" })), Some("unsaved"));
    match hub.wait(&id) {
      Wait::Ready(value) => assert_eq!(value["action"], "save"),
      Wait::Later(_) => panic!("the answer was lost"),
    }
  }

  #[test]
  fn several_message_boxes_may_be_open_at_once() {
    let mut hub = Hub::default();
    let (a, _) = open(&mut hub, json!({ "type": "message" }), "", "a");
    let (b, again) = open(&mut hub, json!({ "type": "message" }), "", "b");
    assert!(!again);
    assert_ne!(a, b);
    assert_eq!(popup_key(&json!({})), "popup");
    assert_eq!(popup_key(&json!({ "type": "forecast" })), "forecast:daily");
  }
}
