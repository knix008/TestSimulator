//! Durable key/value strings (settings, recent list, last dialog folders): <data>/persist.json.
//! Same file format as the Electron build, which kept it in %APPDATA%\my-video-player-multios.

use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Store {
  file: PathBuf,
  map: Mutex<Map<String, Value>>,
}

impl Store {
  pub fn open(file: PathBuf) -> Self {
    let map = std::fs::read_to_string(&file)
      .ok()
      .and_then(|raw| serde_json::from_str::<Value>(raw.trim_start_matches('\u{feff}')).ok())
      .and_then(|v| match v {
        Value::Object(m) => Some(m),
        _ => None,
      })
      .unwrap_or_default();
    Self { file, map: Mutex::new(map) }
  }

  /// Copies the Electron build's persist.json in when this build has none yet.
  pub fn migrate_from(file: &Path, legacy: &[PathBuf]) {
    if file.exists() {
      return;
    }
    for old in legacy {
      if old.is_file() {
        if let Some(dir) = file.parent() {
          let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::copy(old, file);
        return;
      }
    }
  }

  pub fn snapshot(&self) -> Value {
    let map = self.map.lock().unwrap();
    let mut out = Map::new();
    for (k, v) in map.iter() {
      if let Some(s) = as_text(v) {
        out.insert(k.clone(), Value::String(s));
      }
    }
    Value::Object(out)
  }

  pub fn get(&self, key: &str) -> Option<String> {
    self.map.lock().unwrap().get(key).and_then(as_text)
  }

  pub fn set(&self, key: &str, value: &str) -> bool {
    if key.is_empty() {
      return false;
    }
    let mut map = self.map.lock().unwrap();
    map.insert(key.to_string(), Value::String(value.to_string()));
    write(&self.file, &map)
  }

  pub fn remove(&self, key: &str) -> bool {
    if key.is_empty() {
      return false;
    }
    let mut map = self.map.lock().unwrap();
    if map.remove(key).is_none() {
      return true;
    }
    write(&self.file, &map)
  }
}

fn as_text(v: &Value) -> Option<String> {
  match v {
    Value::Null => None,
    Value::String(s) => Some(s.clone()),
    other => Some(other.to_string()),
  }
}

fn write(file: &Path, map: &Map<String, Value>) -> bool {
  if let Some(dir) = file.parent() {
    let _ = std::fs::create_dir_all(dir);
  }
  let tmp = file.with_extension("json.tmp");
  let Ok(text) = serde_json::to_string_pretty(map) else { return false };
  std::fs::write(&tmp, text).is_ok() && std::fs::rename(&tmp, file).is_ok()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn round_trips_and_survives_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("persist.json");
    let store = Store::open(file.clone());
    assert!(store.set("a", "1"));
    assert!(store.set("b", "two"));
    assert!(store.remove("a"));
    let again = Store::open(file);
    assert_eq!(again.get("a"), None);
    assert_eq!(again.get("b").as_deref(), Some("two"));
    assert_eq!(again.snapshot()["b"], "two");
  }

  #[test]
  fn migrates_the_electron_file_once() {
    let dir = tempfile::tempdir().unwrap();
    let old = dir.path().join("old.json");
    std::fs::write(&old, r#"{"settings":"{\"theme\":\"dark\"}"}"#).unwrap();
    let file = dir.path().join("new").join("persist.json");
    Store::migrate_from(&file, &[old.clone()]);
    assert!(Store::open(file.clone()).get("settings").unwrap().contains("dark"));
    std::fs::write(&old, "{}").unwrap();
    Store::migrate_from(&file, &[old]);
    assert!(Store::open(file).get("settings").is_some());
  }
}
