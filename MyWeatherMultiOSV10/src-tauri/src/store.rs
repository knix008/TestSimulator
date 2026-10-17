//! settings.json merging, ported from the Electron `write-settings` handler. The first
//! weather window owns `cities` and `fonts`; every other window owns one `extraWindows` slot.

use crate::placement::{stamp_window_placement, Placement, Rect};
use serde_json::{json, Value};

#[derive(Clone, Debug, Default)]
pub struct Boot {
  pub city_index: i64,
  pub primary: bool,
  pub cities: Option<Value>,
  pub window_key: String,
}

impl Boot {
  pub fn to_json(&self) -> Value {
    json!({
      "cityIndex": self.city_index,
      "primary": self.primary,
      "cities": self.cities.clone().unwrap_or(Value::Null),
      "windowKey": self.window_key,
    })
  }

  fn is_extra(&self) -> bool {
    !self.primary && !self.window_key.is_empty()
  }
}

fn present(value: Option<&Value>) -> bool {
  match value {
    None | Some(Value::Null) | Some(Value::Bool(false)) => false,
    Some(Value::String(s)) => !s.is_empty(),
    _ => true,
  }
}

fn write_box(slot: &mut Value, bounds: &Rect) {
  slot["x"] = json!(bounds.x.round() as i64);
  slot["y"] = json!(bounds.y.round() as i64);
  slot["width"] = json!(bounds.width.round() as i64);
  slot["height"] = json!(bounds.height.round() as i64);
}

/// What a window's save turns into on disk.
pub fn merge_settings(incoming: Value, stored: &Value, boot: Option<&Boot>, own_bounds: Option<Rect>, placement: Option<Placement>) -> Value {
  let mut incoming = if incoming.is_object() { incoming } else { json!({}) };
  let object = incoming.as_object_mut().expect("object");
  let window_cities = object.remove("windowCities").filter(|v| v.as_array().is_some_and(|a| !a.is_empty()));
  let window_fonts = object.remove("windowFonts").filter(Value::is_object);
  let stored_extra = stored.get("extraWindows").filter(|v| v.is_array());
  match boot {
    Some(boot) if boot.is_extra() => {
      if stored.get("cities").and_then(Value::as_array).is_some_and(|a| !a.is_empty()) {
        object.insert("cities".into(), stored["cities"].clone());
      }
      for key in ["fonts", "fontFamily"] {
        if present(stored.get(key)) {
          object.insert(key.into(), stored[key].clone());
        }
      }
      let mut extra = stored_extra.cloned().unwrap_or_else(|| json!([]));
      if let Some(slot) = extra
        .as_array_mut()
        .and_then(|list| list.iter_mut().find(|entry| entry.get("key").and_then(Value::as_str) == Some(boot.window_key.as_str())))
      {
        if let Some(cities) = window_cities {
          slot["cities"] = cities;
        }
        if let Some(fonts) = window_fonts {
          slot["fonts"] = fonts;
        }
        if let Some(bounds) = own_bounds {
          write_box(slot, &bounds);
        }
      }
      object.insert("extraWindows".into(), extra);
    }
    // Moved cities are recorded by new-window, so a later save cannot drop those windows.
    _ => {
      if let Some(extra) = stored_extra {
        object.insert("extraWindows".into(), extra.clone());
      }
    }
  }
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

/// One weather window left the set. `promoted_key` is set when the first window was the one
/// removed and another window took its cities.
pub struct ForgottenWindow {
  pub promoted_key: Option<String>,
  pub cities: Option<Value>,
  pub fonts: Option<Value>,
}

/// Drops the window the user asked to remove. The last saved window stays.
pub fn forget_weather_window(settings: &mut Value, primary: bool, window_key: &str) -> Option<ForgottenWindow> {
  if !settings.is_object() {
    *settings = json!({});
  }
  let extra = settings.get("extraWindows").and_then(Value::as_array).cloned().unwrap_or_default();
  if 1 + extra.len() <= 1 {
    return None;
  }
  if !primary {
    if window_key.is_empty() {
      return None;
    }
    let next: Vec<Value> = extra.iter().filter(|entry| entry.get("key").and_then(Value::as_str) != Some(window_key)).cloned().collect();
    if next.len() == extra.len() {
      return None;
    }
    settings["extraWindows"] = json!(next);
    return Some(ForgottenWindow { promoted_key: None, cities: None, fonts: None });
  }
  let mut extra = extra;
  let promoted = extra.remove(0);
  let key = promoted.get("key").and_then(Value::as_str).unwrap_or("").to_string();
  if key.is_empty() {
    return None;
  }
  let cities = promoted.get("cities").filter(|c| c.as_array().is_some_and(|a| !a.is_empty())).cloned();
  let fonts = promoted.get("fonts").filter(|f| f.is_object()).cloned();
  if let Some(cities) = cities.clone() {
    settings["cities"] = cities;
  }
  if let Some(fonts) = fonts.clone() {
    settings["fonts"] = fonts;
  }
  settings["extraWindows"] = json!(extra);
  Some(ForgottenWindow { promoted_key: Some(key), cities, fonts })
}

/// Each open extra window writes where it is now into its saved slot.
pub fn remember_extra_windows(settings: &mut Value, open: &[(String, Rect)]) {
  let Some(list) = settings.get_mut("extraWindows").and_then(Value::as_array_mut) else { return };
  for (key, bounds) in open {
    if let Some(slot) = list.iter_mut().find(|entry| entry.get("key").and_then(Value::as_str) == Some(key.as_str())) {
      write_box(slot, bounds);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn extra_boot() -> Boot {
    Boot { primary: false, window_key: "win-a".into(), ..Default::default() }
  }

  #[test]
  fn an_extra_window_saves_only_its_own_slot() {
    let stored = json!({
      "cities": [{ "cityEn": "Seoul" }],
      "fontFamily": "Segoe UI",
      "extraWindows": [{ "key": "win-a", "cities": [{ "cityEn": "Tokyo" }] }, { "key": "win-b", "cities": [{ "cityEn": "Paris" }] }],
    });
    let incoming = json!({
      "cities": [{ "cityEn": "Tokyo" }],
      "windowCities": [{ "cityEn": "Osaka" }],
      "windowFonts": { "scene": "Arial" },
      "theme": "dark-ink",
    });
    let bounds = Rect { x: 10.4, y: 20.0, width: 400.0, height: 300.0 };
    let saved = merge_settings(incoming, &stored, Some(&extra_boot()), Some(bounds), None);
    assert_eq!(saved["cities"], stored["cities"], "the first window's cities stay");
    assert_eq!(saved["theme"], "dark-ink");
    assert!(saved.get("windowCities").is_none());
    assert!(saved.get("windowFonts").is_none());
    assert_eq!(saved["extraWindows"][0]["cities"][0]["cityEn"], "Osaka");
    assert_eq!(saved["extraWindows"][0]["fonts"]["scene"], "Arial");
    assert_eq!(saved["extraWindows"][0]["x"], 10);
    assert_eq!(saved["extraWindows"][1], stored["extraWindows"][1]);
  }

  #[test]
  fn the_first_window_keeps_the_saved_extra_windows_and_stamps_its_place() {
    let stored = json!({ "extraWindows": [{ "key": "win-a", "cities": [] }], "windowSize": { "width": 500, "height": 400 } });
    let primary = Boot { primary: true, ..Default::default() };
    let placement = Placement { x: 5.0, y: 6.0, width: 700.0, height: 500.0, maximized: false };
    let saved = merge_settings(json!({ "extraWindows": [] }), &stored, Some(&primary), None, Some(placement));
    assert_eq!(saved["extraWindows"], stored["extraWindows"]);
    assert_eq!(saved["windowSize"], json!({ "width": 700, "height": 500 }));
    let unplaced = merge_settings(json!({}), &stored, Some(&primary), None, None);
    assert_eq!(unplaced["windowSize"], stored["windowSize"]);
  }

  #[test]
  #[test]
  fn removing_a_window_leaves_the_last_one() {
    let mut alone = json!({ "cities": [{ "cityEn": "Seoul" }], "extraWindows": [] });
    assert!(forget_weather_window(&mut alone, true, "").is_none());
    let mut settings = json!({
      "cities": [{ "cityEn": "Seoul" }],
      "extraWindows": [{ "key": "win-a", "cities": [{ "cityEn": "Tokyo" }], "fonts": { "city": "Verdana" } }, { "key": "win-b", "cities": [{ "cityEn": "Paris" }] }],
    });
    let dropped = forget_weather_window(&mut settings, false, "win-a").unwrap();
    assert!(dropped.promoted_key.is_none());
    assert_eq!(settings["cities"][0]["cityEn"], "Seoul");
    assert_eq!(settings["extraWindows"].as_array().unwrap().len(), 1);
    assert_eq!(settings["extraWindows"][0]["key"], "win-b");
    let promoted = forget_weather_window(&mut settings, true, "").unwrap();
    assert_eq!(promoted.promoted_key.as_deref(), Some("win-b"));
    assert_eq!(settings["cities"][0]["cityEn"], "Paris");
    assert!(settings["extraWindows"].as_array().unwrap().is_empty());
    assert!(forget_weather_window(&mut settings, true, "").is_none());
  }

  fn open_extra_windows_record_where_they_are() {
    let mut settings = json!({ "extraWindows": [{ "key": "win-a" }, { "key": "win-b" }] });
    remember_extra_windows(&mut settings, &[("win-b".into(), Rect { x: 1.0, y: 2.0, width: 330.0, height: 160.0 })]);
    assert!(settings["extraWindows"][0].get("x").is_none());
    assert_eq!(settings["extraWindows"][1]["width"], 330);
  }
}
