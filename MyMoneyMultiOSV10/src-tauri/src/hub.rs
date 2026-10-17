//! Dialog bookkeeping, ported from the Electron `popup-hub.js`. The hub never touches a
//! window itself: it hands back the handles to focus or close, so the caller can do that
//! after it lets go of the shared lock (a closing window reports back through that lock).

use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::oneshot;

/// Only one of these is open per market window. Asking again brings it forward.
/// Same list as `ONE_WINDOW` in src/ui/menu-layout.js.
const ONE_WINDOW: [&str; 8] = ["panel", "settings", "about", "print", "preview", "unsaved", "remove-window", "close-other-windows"];

/// Same as `popupKey` in src/ui/menu-layout.js: each panel is its own dialog.
pub fn popup_key(spec: &Value) -> String {
  match spec.get("type").and_then(Value::as_str) {
    None | Some("") => "popup".into(),
    Some("panel") => format!("panel:{}", spec.get("panel").and_then(Value::as_str).filter(|p| !p.is_empty()).unwrap_or("stocks")),
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
  /// Each market window keeps its own dialogs, so a key is only unique within one owner.
  pub fn begin(&mut self, spec: &Value, owner: &str) -> Begin<W> {
    let key = format!("{owner}#{}", popup_key(spec));
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

  /// A market window that goes away takes its own dialogs with it.
  pub fn close_owned(&mut self, owner: &str) -> Vec<W> {
    let ids: Vec<String> = self.entries.iter().filter(|entry| entry.owner == owner).map(|entry| entry.id.clone()).collect();
    ids.iter().filter_map(|id| self.finish(id, close_result())).collect()
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
  fn each_window_keeps_its_own_dialogs_and_loses_them_when_it_is_put_away() {
    let mut hub = Hub::default();
    let (first, again) = open(&mut hub, json!({ "type": "settings" }), "window-a", "first");
    let (second, _) = open(&mut hub, json!({ "type": "settings" }), "window-b", "second");
    assert!(!again);
    assert_ne!(first, second);
    assert!(open(&mut hub, json!({ "type": "settings" }), "window-a", "again").1);
    assert_eq!(hub.close_owned("window-a"), vec!["first"]);
    assert_eq!(hub.len(), 1);
    hub.close_all();
    assert_eq!(hub.len(), 0);
  }

  #[test]
  fn each_panel_is_one_window_of_its_own() {
    let mut hub = Hub::default();
    let (stocks, _) = open(&mut hub, json!({ "type": "panel", "panel": "stocks" }), "", "stocks");
    let (rates, _) = open(&mut hub, json!({ "type": "panel", "panel": "rates" }), "", "rates");
    assert_ne!(stocks, rates);
    assert!(open(&mut hub, json!({ "type": "panel", "panel": "rates" }), "", "again").1);
    assert_eq!(hub.take(&stocks).unwrap()["popupId"], stocks.as_str());
    assert_eq!(popup_key(&json!({ "type": "panel" })), "panel:stocks");
    assert_eq!(popup_key(&json!({ "type": "settings" })), "settings");
    assert_eq!(popup_key(&json!({})), "popup");
  }

  #[test]
  fn asking_twice_while_the_window_is_built_opens_one() {
    let mut hub: Hub<&'static str> = Hub::default();
    let Begin::New { id, .. } = hub.begin(&json!({ "type": "about" }), "") else { panic!("first ask") };
    assert!(matches!(hub.begin(&json!({ "type": "about" }), ""), Begin::Building { id: ref again } if *again == id));
    hub.abandon(&id);
    assert!(matches!(hub.wait(&id), Wait::Ready(ref v) if *v == close_result()));
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
  }
}
