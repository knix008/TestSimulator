//! settings.json for several market windows, ported from the Electron `read-settings`,
//! `write-settings` and `editSlots`. The first window ("main") owns `defaultBoard`, `fonts` and
//! the saved placement; every other window owns one slot in `windows`. Boards arrive already
//! sanitized by the page (`sanitizeBoard`), so here they are only stored and handed back.

use crate::placement::{stamp_window_placement, Placement, Rect};
use serde_json::{json, Map, Value};

pub const MAIN_SLOT: &str = "main";
/// Same as `WINDOW_FIELDS` in src/core/settings.js.
pub const WINDOW_FIELDS: [&str; 5] = ["defaultBoard", "windowSize", "windowPosition", "windowMaximized", "fonts"];
/// Same as `WINDOW_LIST_FIELD`. Only this process writes it.
pub const WINDOW_LIST_FIELD: &str = "windows";
/// Same as `MAX_EXTRA_WINDOWS`.
pub const MAX_EXTRA_WINDOWS: usize = 15;

fn object(value: &Value) -> Map<String, Value> {
  value.as_object().cloned().unwrap_or_default()
}

fn valid_id(id: &str) -> bool {
  id.len() > 1 && id.starts_with('w') && id[1..].chars().all(|c| c.is_ascii_alphanumeric())
}

/// The saved extra windows: a slot without a usable id is dropped, as `sanitizeWindowSlots` does.
pub fn slots(stored: &Value) -> Vec<Value> {
  let mut seen = Vec::new();
  let mut list = Vec::new();
  for entry in stored.get(WINDOW_LIST_FIELD).and_then(Value::as_array).into_iter().flatten() {
    let Some(id) = entry.get("id").and_then(Value::as_str).map(str::trim) else { continue };
    if !valid_id(id) || seen.iter().any(|s| s == id) {
      continue;
    }
    seen.push(id.to_string());
    let mut slot = object(entry);
    slot.insert("id".into(), json!(id));
    slot.entry("board").or_insert(Value::Null);
    slot.entry("bounds").or_insert(Value::Null);
    list.push(Value::Object(slot));
    if list.len() >= MAX_EXTRA_WINDOWS {
      break;
    }
  }
  list
}

pub fn slot_of<'a>(list: &'a [Value], id: &str) -> Option<&'a Value> {
  list.iter().find(|entry| entry.get("id").and_then(Value::as_str) == Some(id))
}

/// Settings without the per-window part, for telling the other windows what changed.
pub fn shared_settings(settings: &Value) -> Value {
  let mut shared = object(settings);
  for field in WINDOW_FIELDS {
    shared.remove(field);
  }
  shared.remove(WINDOW_LIST_FIELD);
  Value::Object(shared)
}

/// What `read-settings` hands a window: the shared settings with its own board and rectangle.
pub fn settings_view(stored: &Value, slot: &str, own: Option<Rect>) -> Value {
  if stored.is_null() {
    return Value::Null;
  }
  if slot == MAIN_SLOT || slot.is_empty() {
    let mut view = object(stored);
    view.remove(WINDOW_LIST_FIELD);
    return Value::Object(view);
  }
  let list = slots(stored);
  let entry = slot_of(&list, slot);
  let mut view = shared_settings(stored);
  view["defaultBoard"] = entry.and_then(|e| e.get("board")).cloned().unwrap_or(Value::Null);
  view["fonts"] = entry.and_then(|e| e.get("fonts")).filter(|f| f.is_object()).or_else(|| stored.get("fonts")).cloned().unwrap_or(Value::Null);
  if let Some(own) = own {
    view["windowSize"] = json!({ "width": own.width.round() as i64, "height": own.height.round() as i64 });
    view["windowPosition"] = json!({ "x": own.x.round() as i64, "y": own.y.round() as i64 });
  }
  view["windowMaximized"] = json!(false);
  view
}

/// What a window's save turns into on disk. `board` is the page's sanitized `defaultBoard`.
pub fn merge_settings(incoming: &Value, stored: &Value, slot: &str, board: &Value, placement: Option<Placement>) -> Value {
  let mut incoming = object(incoming);
  incoming.remove(WINDOW_LIST_FIELD);
  let list = slots(stored);
  if slot != MAIN_SLOT && !slot.is_empty() {
    // An extra window writes the shared part over the file and its board into its slot.
    let mut next = object(stored);
    for (key, value) in object(&shared_settings(&Value::Object(incoming.clone()))) {
      next.insert(key, value);
    }
    for field in WINDOW_FIELDS {
      match stored.get(field) {
        Some(value) => next.insert(field.into(), value.clone()),
        None => next.remove(field),
      };
    }
    let fonts = incoming.get("fonts").cloned();
    let list: Vec<Value> = list
      .into_iter()
      .map(|mut entry| {
        if entry.get("id").and_then(Value::as_str) == Some(slot) {
          entry["board"] = board.clone();
          match &fonts {
            Some(fonts) => entry["fonts"] = fonts.clone(),
            None => {
              entry.as_object_mut().map(|e| e.remove("fonts"));
            }
          }
        }
        entry
      })
      .collect();
    next.insert(WINDOW_LIST_FIELD.into(), Value::Array(list));
    return Value::Object(next);
  }
  incoming.insert(WINDOW_LIST_FIELD.into(), Value::Array(list));
  let mut incoming = Value::Object(incoming);
  match placement {
    Some(placement) => stamp_window_placement(&mut incoming, &placement),
    None => {
      for key in ["windowSize", "windowPosition", "windowMaximized"] {
        if incoming.get(key).is_none_or(Value::is_null) && stored.get(key).is_some_and(|v| !v.is_null()) {
          incoming[key] = stored[key].clone();
        }
      }
    }
  }
  incoming
}

/// Read, change and write the slot list in one step, so two windows never undo each other.
pub fn edit_slots(stored: &Value, change: impl FnOnce(Vec<Value>) -> Vec<Value>) -> Value {
  let mut next = object(stored);
  next.insert(WINDOW_LIST_FIELD.into(), Value::Array(change(slots(stored))));
  Value::Object(next)
}

pub fn with_bounds(list: Vec<Value>, id: &str, bounds: &Rect) -> Vec<Value> {
  list
    .into_iter()
    .map(|mut entry| {
      if entry.get("id").and_then(Value::as_str) == Some(id) {
        entry["bounds"] = json!({
          "x": bounds.x.round() as i64,
          "y": bounds.y.round() as i64,
          "width": bounds.width.round() as i64,
          "height": bounds.height.round() as i64,
        });
      }
      entry
    })
    .collect()
}

pub fn slot_bounds(entry: &Value) -> Option<Rect> {
  let b = entry.get("bounds")?;
  let n = |k: &str| b.get(k).and_then(Value::as_f64).filter(|v| v.is_finite());
  Some(Rect { x: n("x")?, y: n("y")?, width: n("width")?, height: n("height")? })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn stored() -> Value {
    json!({
      "language": "ko",
      "theme": "dark-ink",
      "defaultBoard": { "marketCode": "KR" },
      "fonts": { "scene": "main" },
      "windowSize": { "width": 700, "height": 500 },
      "windows": [
        { "id": "w1", "board": { "marketCode": "US" }, "bounds": { "x": 10, "y": 20, "width": 500, "height": 400 } },
        { "id": "w1", "board": { "marketCode": "JP" } },
        { "id": "bad", "board": {} },
        { "id": "w2", "board": { "marketCode": "JP" }, "fonts": { "scene": "own" } },
      ],
    })
  }

  #[test]
  fn slots_drop_bad_and_repeated_ids() {
    let list = slots(&stored());
    let ids: Vec<&str> = list.iter().filter_map(|e| e["id"].as_str()).collect();
    assert_eq!(ids, ["w1", "w2"]);
    assert_eq!(slot_bounds(&list[0]), Some(Rect { x: 10.0, y: 20.0, width: 500.0, height: 400.0 }));
    assert_eq!(slot_bounds(&list[1]), None);
  }

  #[test]
  fn each_window_reads_its_own_board_and_rectangle() {
    let main = settings_view(&stored(), MAIN_SLOT, None);
    assert!(main.get("windows").is_none());
    assert_eq!(main["defaultBoard"]["marketCode"], "KR");
    let own = Rect { x: 1.0, y: 2.0, width: 400.0, height: 300.0 };
    let extra = settings_view(&stored(), "w1", Some(own));
    assert_eq!(extra["defaultBoard"]["marketCode"], "US");
    assert_eq!(extra["fonts"]["scene"], "main", "a slot without fonts uses the first window's");
    assert_eq!(extra["windowSize"], json!({ "width": 400, "height": 300 }));
    assert_eq!(extra["windowMaximized"], false);
    assert_eq!(extra["theme"], "dark-ink");
    assert_eq!(settings_view(&stored(), "w2", None)["fonts"]["scene"], "own");
    assert!(settings_view(&stored(), "w9", None)["defaultBoard"].is_null());
    assert!(settings_view(&Value::Null, "w1", None).is_null());
  }

  #[test]
  fn an_extra_window_saves_the_shared_part_and_its_own_slot() {
    let incoming = json!({ "language": "en", "theme": "light-paper", "defaultBoard": { "marketCode": "US", "symbols": [1] }, "fonts": { "scene": "x" }, "windowSize": { "width": 1, "height": 1 }, "windows": [] });
    let saved = merge_settings(&incoming, &stored(), "w1", &json!({ "marketCode": "US", "symbols": [1] }), None);
    assert_eq!(saved["language"], "en");
    assert_eq!(saved["theme"], "light-paper");
    assert_eq!(saved["defaultBoard"]["marketCode"], "KR", "the first window's board stays");
    assert_eq!(saved["fonts"]["scene"], "main");
    assert_eq!(saved["windowSize"]["width"], 700);
    assert_eq!(saved["windows"][0]["board"]["symbols"], json!([1]));
    assert_eq!(saved["windows"][0]["fonts"]["scene"], "x");
    assert_eq!(saved["windows"][1]["id"], "w2");
    assert_eq!(saved["windows"].as_array().unwrap().len(), 2);
  }

  #[test]
  fn the_first_window_keeps_the_slots_and_stamps_its_place() {
    let placement = Placement { x: 5.0, y: 6.0, width: 720.0, height: 520.0, maximized: false };
    let saved = merge_settings(&json!({ "theme": "x", "windows": [] }), &stored(), MAIN_SLOT, &Value::Null, Some(placement));
    assert_eq!(saved["windows"].as_array().unwrap().len(), 2);
    assert_eq!(saved["windowSize"], json!({ "width": 720, "height": 520 }));
    let unplaced = merge_settings(&json!({}), &stored(), MAIN_SLOT, &Value::Null, None);
    assert_eq!(unplaced["windowSize"], json!({ "width": 700, "height": 500 }));
  }

  #[test]
  fn shared_settings_leave_out_every_window_field() {
    let shared = shared_settings(&stored());
    let mut keys: Vec<&String> = shared.as_object().unwrap().keys().collect();
    keys.sort();
    assert_eq!(keys, ["language", "theme"]);
  }

  #[test]
  fn slot_edits_keep_the_rest_of_the_file() {
    let next = edit_slots(&stored(), |list| with_bounds(list, "w2", &Rect { x: 1.4, y: 2.0, width: 330.0, height: 160.0 }));
    assert_eq!(next["theme"], "dark-ink");
    assert_eq!(next["windows"][1]["bounds"], json!({ "x": 1, "y": 2, "width": 330, "height": 160 }));
    let removed = edit_slots(&stored(), |list| list.into_iter().filter(|e| e["id"] != "w1").collect());
    assert_eq!(slots(&removed).len(), 1);
  }
}
