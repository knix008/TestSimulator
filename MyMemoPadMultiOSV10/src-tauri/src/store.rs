//! JSON files in the user data folder — a port of the Electron build's electron/store.js.
//!
//! | file                 | contents                                        |
//! |----------------------|-------------------------------------------------|
//! | memos.json           | array of HTML strings                           |
//! | editor_settings.json | global font, colours, language, transparency    |
//! | memo_settings.json   | per-memo look (null where a memo has none yet)  |
//!
//! The shapes are exactly what the Electron build wrote, so an existing data folder keeps working.

use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

const MEMOS: &str = "memos.json";
const SETTINGS: &str = "editor_settings.json";
const LOOKS: &str = "memo_settings.json";

pub const DEFAULT_FONT: &str = "Malgun Gothic";
pub const DEFAULT_BACK: &str = "#F8E18C";

#[derive(Clone)]
pub struct Store {
  dir: PathBuf,
}

/// What upsert_memo did — the same fields as store.js upsertMemo().
pub struct Upsert {
  pub items: Vec<String>,
  pub source_index: i64,
  pub source_memo: Option<String>,
  pub updated: bool,
}

fn color_from_stored(value: Option<&Value>, fallback: &str) -> String {
  match value {
    Some(Value::String(s)) if s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit()) => s.to_uppercase(),
    // WinForms ARGB integers (MemoPadV10 settings)
    Some(Value::Number(n)) if n.as_f64().is_some_and(f64::is_finite) => {
      let v = n.as_f64().unwrap_or(0.0) as i64 as u32;
      format!("#{:02X}{:02X}{:02X}", (v >> 16) & 255, (v >> 8) & 255, v & 255)
    }
    _ => fallback.to_string(),
  }
}

/// Like JavaScript Number(v): numbers and numeric strings.
fn number(value: Option<&Value>) -> Option<f64> {
  match value? {
    Value::Number(n) => n.as_f64(),
    Value::String(s) => s.trim().parse::<f64>().ok(),
    Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
    _ => None,
  }
  .filter(|n| n.is_finite())
}

pub fn clamp_transparency(value: Option<&Value>) -> i64 {
  match number(value) {
    Some(n) => n.round().clamp(0.0, 100.0) as i64,
    None => 0,
  }
}

/// `a ?? b` — the first key that is present and not null.
fn first<'a>(src: &'a Value, keys: &[&str]) -> Option<&'a Value> {
  keys.iter().filter_map(|k| src.get(*k)).find(|v| !v.is_null())
}

fn num_value(n: f64) -> Value {
  if n.fract() == 0.0 && n.abs() < 1e15 {
    json!(n as i64)
  } else {
    json!(n)
  }
}

pub fn normalize_look(raw: &Value) -> Value {
  let empty = json!({});
  let src = if raw.is_object() { raw } else { &empty };
  let font_name = match src.get("fontName") {
    Some(Value::String(s)) if !s.trim().is_empty() => s.clone(),
    _ => DEFAULT_FONT.to_string(),
  };
  let font_style = match src.get("fontStyle") {
    Some(Value::String(s)) => s.clone(),
    _ => "Regular".to_string(),
  };
  json!({
    "fontName": font_name,
    "fontSize": num_value(number(src.get("fontSize")).unwrap_or(12.0)),
    "fontStyle": font_style,
    "foreColor": color_from_stored(first(src, &["foreColor", "ForeColorArgb"]), "#000000"),
    "editorBackColor": color_from_stored(first(src, &["editorBackColor", "EditorBackColorArgb"]), DEFAULT_BACK),
    "formBackColor": color_from_stored(first(src, &["formBackColor", "FormBackColorArgb"]), DEFAULT_BACK),
    "transparencyPercent": clamp_transparency(first(src, &["transparencyPercent", "TransparencyPercent"])),
  })
}

pub fn normalize_settings(raw: &Value) -> Value {
  let empty = json!({});
  let src = if raw.is_object() { raw } else { &empty };
  let mut merged = src.as_object().cloned().unwrap_or_default();
  let window_t = first(src, &["windowTransparencyPercent", "WindowTransparencyPercent"]).cloned();
  merged.insert(
    "transparencyPercent".into(),
    window_t.clone().or_else(|| src.get("transparencyPercent").cloned()).unwrap_or(Value::Null),
  );
  let mut look = normalize_look(&Value::Object(merged));
  let english = src.get("language").and_then(Value::as_str) == Some("en") || src.get("Language").and_then(Value::as_str) == Some("en");
  let window = match window_t {
    Some(v) => clamp_transparency(Some(&v)),
    None => look["transparencyPercent"].as_i64().unwrap_or(0),
  };
  let obj = look.as_object_mut().expect("look is an object");
  obj.insert("language".into(), json!(if english { "en" } else { "ko" }));
  obj.insert("windowTransparencyPercent".into(), json!(window));
  look
}

impl Store {
  pub fn new(dir: PathBuf) -> Self {
    Self { dir }
  }

  pub fn dir(&self) -> &Path {
    &self.dir
  }

  fn read(&self, name: &str) -> Option<Value> {
    let text = fs::read_to_string(self.dir.join(name)).ok()?;
    let text = text.trim_start_matches('\u{feff}');
    serde_json::from_str::<Value>(text).ok().filter(|v| !v.is_null())
  }

  /// Written to a .tmp file first and renamed, so a crash never leaves half a file.
  fn write(&self, name: &str, value: &Value) {
    let _ = fs::create_dir_all(&self.dir);
    let file = self.dir.join(name);
    let tmp = self.dir.join(format!("{name}.tmp"));
    let text = serde_json::to_string_pretty(value).unwrap_or_else(|_| "null".into());
    if fs::write(&tmp, text).is_ok() && fs::rename(&tmp, &file).is_err() {
      let _ = fs::remove_file(&tmp);
    }
  }

  pub fn load_memos(&self) -> Vec<String> {
    match self.read(MEMOS) {
      Some(Value::Array(items)) => items
        .into_iter()
        .filter_map(|v| match v {
          Value::String(s) if !s.trim().is_empty() => Some(s),
          _ => None,
        })
        .collect(),
      _ => Vec::new(),
    }
  }

  pub fn save_memos(&self, items: &[Value]) -> Vec<String> {
    let list: Vec<String> = items.iter().filter_map(|v| v.as_str().map(str::to_string)).collect();
    self.write(MEMOS, &json!(list));
    list
  }

  fn save_memo_list(&self, items: &[String]) {
    self.write(MEMOS, &json!(items));
  }

  pub fn load_settings(&self) -> Value {
    normalize_settings(&self.read(SETTINGS).unwrap_or(Value::Null))
  }

  pub fn save_settings(&self, data: &Value) -> Value {
    let mut merged: Map<String, Value> = self.load_settings().as_object().cloned().unwrap_or_default();
    if let Some(patch) = data.as_object() {
      for (k, v) in patch {
        merged.insert(k.clone(), v.clone());
      }
    }
    let next = normalize_settings(&Value::Object(merged));
    self.write(SETTINGS, &next);
    next
  }

  pub fn language(&self) -> String {
    self.load_settings()["language"].as_str().unwrap_or("ko").to_string()
  }

  fn load_looks_raw(&self) -> Vec<Value> {
    match self.read(LOOKS) {
      Some(Value::Array(items)) => items,
      _ => Vec::new(),
    }
  }

  fn align_looks(&self, count: usize) -> Vec<Value> {
    let mut values: Vec<Value> = self
      .load_looks_raw()
      .into_iter()
      .map(|v| if v.is_null() || v == json!(false) { Value::Null } else { normalize_look(&v) })
      .collect();
    values.resize(count, Value::Null);
    values
  }

  /// The default look for new memos: global settings with the default window transparency.
  fn default_look(&self) -> Value {
    let settings = self.load_settings();
    let mut src = settings.clone();
    src["transparencyPercent"] = settings["windowTransparencyPercent"].clone();
    normalize_look(&src)
  }

  pub fn get_look(&self, index: i64, memo_count: usize) -> Value {
    if index < 0 {
      return self.default_look();
    }
    let i = index as usize;
    let values = self.align_looks(memo_count.max(i + 1));
    if values[i].is_null() {
      self.default_look()
    } else {
      values[i].clone()
    }
  }

  pub fn set_look(&self, index: i64, look: &Value, memo_count: usize) {
    if index < 0 || look.is_null() {
      return;
    }
    let i = index as usize;
    let mut values = self.align_looks(memo_count.max(i + 1));
    values[i] = normalize_look(look);
    self.write(LOOKS, &Value::Array(values));
  }

  pub fn apply_back_color_to_all_looks(&self, color: &Value) -> String {
    let hex = color_from_stored(Some(color), DEFAULT_BACK);
    let memos = self.load_memos();
    let mut values = self.align_looks(memos.len());
    for v in values.iter_mut() {
      let mut look = if v.is_null() { self.default_look() } else { v.clone() };
      look["editorBackColor"] = json!(hex);
      look["formBackColor"] = json!(hex);
      *v = normalize_look(&look);
    }
    self.write(LOOKS, &Value::Array(values));
    hex
  }

  pub fn remove_look_at(&self, index: i64) {
    if index < 0 {
      return;
    }
    let mut values = self.load_looks_raw();
    if (index as usize) < values.len() {
      values.remove(index as usize);
      self.write(LOOKS, &Value::Array(values));
    }
  }

  /// Saves a pad's HTML: replaces the memo it was opened from, or appends a new one.
  pub fn upsert_memo(&self, source_index: i64, source_memo: Option<&str>, html: &str) -> Upsert {
    let plain = strip_tags(html).replace("&nbsp;", " ");
    let mut items = self.load_memos();
    if plain.trim().is_empty() {
      return Upsert { items, source_index, source_memo: source_memo.map(str::to_string), updated: false };
    }
    let mut updated = false;
    let index;
    if source_index >= 0 && (source_index as usize) < items.len() {
      items[source_index as usize] = html.to_string();
      index = source_index;
      updated = true;
    } else if let Some(found) = source_memo.and_then(|src| items.iter().position(|m| m == src)) {
      items[found] = html.to_string();
      index = found as i64;
      updated = true;
    } else {
      items.push(html.to_string());
      index = items.len() as i64 - 1;
    }
    self.save_memo_list(&items);
    Upsert { items, source_index: index, source_memo: Some(html.to_string()), updated }
  }

  /// First run of this build: copy the Electron build's files from an older folder name.
  /// The old folder is left alone.
  pub fn migrate_from(&self, legacy: &Path) -> bool {
    if self.dir.join(MEMOS).exists() || !legacy.join(MEMOS).exists() {
      return false;
    }
    let _ = fs::create_dir_all(&self.dir);
    for name in [MEMOS, SETTINGS, LOOKS] {
      let from = legacy.join(name);
      if from.exists() {
        let _ = fs::copy(&from, self.dir.join(name));
      }
    }
    true
  }
}

/// `html.replace(/<[^>]+>/g, '')`
pub fn strip_tags(html: &str) -> String {
  let mut out = String::with_capacity(html.len());
  let mut rest = html;
  while let Some(start) = rest.find('<') {
    out.push_str(&rest[..start]);
    let after = &rest[start + 1..];
    match after.find('>') {
      // `<>` is not a tag in the regex (needs one or more characters).
      Some(end) if end > 0 => rest = &after[end + 1..],
      _ => {
        out.push('<');
        rest = after;
      }
    }
  }
  out.push_str(rest);
  out
}

pub fn is_blank_html(html: &str) -> bool {
  strip_tags(html).trim().is_empty()
}

#[cfg(test)]
mod tests {
  use super::*;

  fn store() -> (tempfile::TempDir, Store) {
    let dir = tempfile::tempdir().unwrap();
    let s = Store::new(dir.path().to_path_buf());
    (dir, s)
  }

  #[test]
  fn defaults_when_nothing_is_saved() {
    let (_d, s) = store();
    let settings = s.load_settings();
    assert_eq!(settings["language"], "ko");
    assert_eq!(settings["editorBackColor"], DEFAULT_BACK);
    assert_eq!(settings["fontSize"], 12);
    assert_eq!(settings["windowTransparencyPercent"], 0);
    assert!(s.load_memos().is_empty());
  }

  #[test]
  fn settings_merge_and_normalize() {
    let (_d, s) = store();
    let next = s.save_settings(&json!({ "language": "en", "editorBackColor": "#abcdef", "windowTransparencyPercent": 140 }));
    assert_eq!(next["language"], "en");
    assert_eq!(next["editorBackColor"], "#ABCDEF");
    assert_eq!(next["windowTransparencyPercent"], 100);
    assert_eq!(next["transparencyPercent"], 100);
    // a later patch keeps the earlier values
    let again = s.save_settings(&json!({ "fontSize": 20 }));
    assert_eq!(again["language"], "en");
    assert_eq!(again["fontSize"], 20);
  }

  #[test]
  fn winforms_argb_colors_are_read() {
    let look = normalize_look(&json!({ "ForeColorArgb": -16777216i64, "EditorBackColorArgb": -466548i64 }));
    assert_eq!(look["foreColor"], "#000000");
    assert_eq!(look["editorBackColor"], "#F8E18C");
  }

  #[test]
  fn upsert_appends_then_updates() {
    let (_d, s) = store();
    let first = s.upsert_memo(-1, None, "<b>one</b>");
    assert_eq!(first.source_index, 0);
    assert!(!first.updated);
    let second = s.upsert_memo(-1, None, "two");
    assert_eq!(second.source_index, 1);
    let edit = s.upsert_memo(0, Some("<b>one</b>"), "one!");
    assert!(edit.updated);
    assert_eq!(s.load_memos(), vec!["one!".to_string(), "two".to_string()]);
    // found by its old text when the index is gone
    let by_text = s.upsert_memo(-1, Some("two"), "two!");
    assert_eq!(by_text.source_index, 1);
    assert!(by_text.updated);
    // blank pads are never saved
    let blank = s.upsert_memo(-1, None, "<div><br></div> &nbsp;");
    assert!(!blank.updated);
    assert_eq!(s.load_memos().len(), 2);
  }

  #[test]
  fn looks_follow_memo_indexes() {
    let (_d, s) = store();
    s.save_memos(&[json!("a"), json!("b"), json!("c")]);
    s.set_look(1, &json!({ "editorBackColor": "#112233", "transparencyPercent": 30 }), 3);
    assert_eq!(s.get_look(1, 3)["editorBackColor"], "#112233");
    // memos without a look fall back to the global settings
    assert_eq!(s.get_look(0, 3)["editorBackColor"], DEFAULT_BACK);
    s.remove_look_at(0);
    assert_eq!(s.get_look(0, 3)["editorBackColor"], "#112233");
    s.apply_back_color_to_all_looks(&json!("#00ff00"));
    for i in 0..3 {
      assert_eq!(s.get_look(i, 3)["editorBackColor"], "#00FF00");
    }
  }

  #[test]
  fn migration_copies_once() {
    let legacy = tempfile::tempdir().unwrap();
    fs::write(legacy.path().join(MEMOS), r#"["old memo"]"#).unwrap();
    let (_d, s) = store();
    assert!(s.migrate_from(legacy.path()));
    assert_eq!(s.load_memos(), vec!["old memo".to_string()]);
    assert!(!s.migrate_from(legacy.path()), "second run must not overwrite");
  }

  #[test]
  fn tags_are_stripped_like_the_regex() {
    assert_eq!(strip_tags("<p>a<br>b</p>"), "ab");
    assert_eq!(strip_tags("1 < 2 <> 3"), "1  3");
    assert_eq!(strip_tags("a <> b"), "a <> b");
    assert!(is_blank_html("<div><br></div>"));
  }
}
