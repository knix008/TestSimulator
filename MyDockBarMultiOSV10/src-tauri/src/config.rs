//! Settings: defaults, deep merge, atomic writes.
//!
//! The settings are a plain JSON object written to `config.json` in the data
//! folder - the same file, in the same folder and with the same keys, as the
//! Electron build wrote, so an existing dock comes across untouched.
//!
//! - **`defaults()`** is the single declaration of every setting
//!   (`data/defaults.json`, which the JavaScript tests read too). `merge()`
//!   deep-merges a saved file onto it, so a file written by an older version
//!   gains new keys instead of losing them, and arrays are replaced wholesale
//!   rather than merged element-wise.
//! - **Writes are atomic**: written to `config.json.tmp`, then renamed.
//! - **Slider drags are debounced** (250ms) by the caller (`lib.rs`), because
//!   they fire continuously. **Item edits are not** - adding, removing or
//!   reordering an icon is a discrete act, and a crash a quarter of a second
//!   later should not undo it.
//! - An unreadable file is renamed aside rather than silently overwritten.

use serde_json::{Map, Value};
use std::{
  fs,
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};

pub const DEFAULTS_JSON: &str = include_str!("../data/defaults.json");

/// Every setting with its default value.
pub fn defaults() -> Value {
  serde_json::from_str(DEFAULTS_JSON).expect("data/defaults.json is valid JSON")
}

/// Deep-merge `src` onto a copy of `base`, keeping arrays atomic.
///
/// The same rules as the Electron build's `merge()`: a non-object `src`
/// replaces `base` outright, and `false`, `0` and `null` are real values.
pub fn merge(base: &Value, src: &Value) -> Value {
  let Value::Object(incoming) = src else {
    return src.clone();
  };
  let mut out = match base {
    Value::Object(map) => map.clone(),
    _ => Map::new(),
  };
  for (key, value) in incoming {
    let next = match out.get(key) {
      Some(existing @ Value::Object(_)) => merge(existing, value),
      _ => value.clone(),
    };
    out.insert(key.clone(), next);
  }
  Value::Object(out)
}

pub struct Config {
  pub dir: PathBuf,
  pub file: PathBuf,
  pub data: Value,
}

impl Config {
  pub fn new(dir: PathBuf) -> Self {
    let file = dir.join("config.json");
    Self { dir, file, data: defaults() }
  }

  pub fn load(&mut self) -> &Value {
    match fs::read_to_string(&self.file) {
      Ok(raw) => match serde_json::from_str::<Value>(&raw) {
        Ok(saved) => self.data = merge(&defaults(), &saved),
        Err(err) => {
          eprintln!("[config] unreadable, starting from defaults: {err}");
          self.backup_broken();
          self.data = defaults();
        }
      },
      Err(err) => {
        if err.kind() != std::io::ErrorKind::NotFound {
          eprintln!("[config] unreadable, starting from defaults: {err}");
          self.backup_broken();
        }
        self.data = defaults();
      }
    }
    &self.data
  }

  fn backup_broken(&self) {
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let _ = fs::rename(&self.file, format!("{}.broken-{ms}", self.file.display()));
  }

  pub fn get(&self) -> &Value {
    &self.data
  }

  pub fn dock(&self) -> &Value {
    &self.data["dock"]
  }

  /// Merge a partial config in. The caller decides when it is written.
  pub fn patch(&mut self, partial: &Value) {
    self.data = merge(&self.data, partial);
  }

  /// Replace the items and write straight away.
  pub fn set_items(&mut self, items: Vec<Value>) {
    self.data["items"] = Value::Array(items);
    // Adding, removing or reordering an icon is a discrete edit the user just
    // made on purpose. Slider drags can be debounced; this cannot.
    self.save_now();
  }

  pub fn items(&self) -> Vec<Value> {
    self.data["items"].as_array().cloned().unwrap_or_default()
  }

  pub fn save_now(&self) {
    if let Err(err) = self.write_atomic() {
      eprintln!("[config] save failed: {err}");
    }
  }

  fn write_atomic(&self) -> std::io::Result<()> {
    fs::create_dir_all(&self.dir)?;
    let tmp = self.file.with_extension("json.tmp");
    fs::write(&tmp, pretty(&self.data))?;
    // Atomic-ish: never leave a half-written config.
    fs::rename(&tmp, &self.file)
  }

  pub fn export_to(&self, target: &Path) -> std::io::Result<()> {
    fs::write(target, pretty(&self.data))
  }

  pub fn import_from(&mut self, source: &Path) -> Result<(), String> {
    let raw = fs::read_to_string(source).map_err(|e| e.to_string())?;
    let incoming: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    self.data = merge(&defaults(), &incoming);
    self.save_now();
    Ok(())
  }

  pub fn reset(&mut self) {
    self.data = defaults();
    self.data["firstRun"] = Value::Bool(false);
    self.save_now();
  }
}

/// `JSON.stringify(data, null, 2)`.
fn pretty(value: &Value) -> String {
  serde_json::to_string_pretty(value).unwrap_or_else(|_| "{}".into())
}

/// A setting read as a number, with the default when it is missing or not one.
pub fn num(value: &Value, fallback: f64) -> f64 {
  value.as_f64().filter(|v| v.is_finite()).unwrap_or(fallback)
}

/// A setting read as a boolean - JavaScript truthiness, as `!!value`.
pub fn truthy(value: &Value) -> bool {
  match value {
    Value::Null => false,
    Value::Bool(b) => *b,
    Value::Number(n) => n.as_f64().map(|v| v != 0.0 && !v.is_nan()).unwrap_or(false),
    Value::String(s) => !s.is_empty(),
    _ => true,
  }
}

pub fn text(value: &Value) -> String {
  match value {
    Value::String(s) => s.clone(),
    Value::Null => String::new(),
    other => other.to_string(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn keeps_keys_the_patch_does_not_mention() {
    assert_eq!(merge(&json!({"a": 1, "b": 2}), &json!({"b": 3})), json!({"a": 1, "b": 3}));
  }

  #[test]
  fn descends_into_nested_objects_rather_than_replacing_them() {
    let base = json!({"dock": {"iconSize": 48, "spacing": 10, "position": "bottom"}});
    let result = merge(&base, &json!({"dock": {"spacing": 4}}));
    assert_eq!(result["dock"], json!({"iconSize": 48, "spacing": 4, "position": "bottom"}));
  }

  #[test]
  fn replaces_arrays_wholesale_instead_of_merging_them_element_wise() {
    let result = merge(&json!({"items": [1, 2, 3]}), &json!({"items": [9]}));
    assert_eq!(result["items"], json!([9]));
  }

  #[test]
  fn does_not_mutate_the_object_it_was_given() {
    let base = json!({"dock": {"spacing": 10}});
    let _ = merge(&base, &json!({"dock": {"spacing": 99}}));
    assert_eq!(base["dock"]["spacing"], 10);
  }

  #[test]
  fn accepts_false_and_0_as_real_values() {
    let result = merge(&json!({"dock": {"autoHide": true, "opacity": 1}}), &json!({"dock": {"autoHide": false, "opacity": 0}}));
    assert_eq!(result["dock"]["autoHide"], false);
    assert_eq!(result["dock"]["opacity"], 0);
  }

  #[test]
  fn keeps_the_order_of_the_defaults() {
    let merged = merge(&defaults(), &json!({"items": [], "theme": "ruby", "extra": 1}));
    let keys: Vec<_> = merged.as_object().unwrap().keys().cloned().collect();
    assert_eq!(keys.first().map(String::as_str), Some("version"));
    assert_eq!(keys.last().map(String::as_str), Some("extra"));
  }

  #[test]
  fn writes_atomically_and_reads_back() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = Config::new(dir.path().to_path_buf());
    config.load();
    config.patch(&json!({"dock": {"iconSize": 64}}));
    config.save_now();
    assert!(!dir.path().join("config.json.tmp").exists());

    let mut again = Config::new(dir.path().to_path_buf());
    again.load();
    assert_eq!(again.dock()["iconSize"], 64);
    assert_eq!(again.dock()["spacing"], 10, "missing keys come from the defaults");
  }

  #[test]
  fn sets_an_unreadable_file_aside() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("config.json"), "{ not json").unwrap();
    let mut config = Config::new(dir.path().to_path_buf());
    config.load();
    assert_eq!(config.get()["theme"], "aqua");
    let aside = fs::read_dir(dir.path()).unwrap().filter_map(|e| e.ok()).any(|e| e.file_name().to_string_lossy().starts_with("config.json.broken-"));
    assert!(aside, "the broken file was overwritten instead of kept");
  }

  #[test]
  fn reads_javascript_truthiness() {
    assert!(!truthy(&json!(0)));
    assert!(!truthy(&json!("")));
    assert!(!truthy(&Value::Null));
    assert!(truthy(&json!(1)));
    assert!(truthy(&json!("x")));
  }
}
