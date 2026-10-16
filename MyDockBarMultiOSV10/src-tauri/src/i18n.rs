//! Translations for the native menus and the error window.
//!
//! There is one translation table, `src/shared/i18n.js`, which the settings
//! window loads with a `<script>` tag. Rather than keep a second copy here, the
//! same file is compiled in and its table read at start-up, so the tray menu,
//! the context menus and the settings window can never disagree.
//!
//! Every entry in that table is one line of the form `'key': 'value',`, which
//! is all this reads; `tests::reads_every_entry` holds the file to it.

use std::{collections::HashMap, sync::OnceLock};

const SOURCE: &str = include_str!("../../src/shared/i18n.js");

pub const SUPPORTED: [&str; 2] = ["en", "ko"];

type Table = HashMap<String, HashMap<String, String>>;

fn table() -> &'static Table {
  static TABLE: OnceLock<Table> = OnceLock::new();
  TABLE.get_or_init(|| parse(SOURCE))
}

fn parse(source: &str) -> Table {
  let mut out: Table = HashMap::new();
  let mut current: Option<String> = None;
  for line in source.lines() {
    let trimmed = line.trim();
    if let Some(locale) = trimmed.strip_suffix(": {") {
      if SUPPORTED.contains(&locale) {
        current = Some(locale.to_string());
        continue;
      }
    }
    if trimmed == "}," || trimmed == "};" {
      if line.starts_with("    }") {
        current = None;
      }
      continue;
    }
    let Some(locale) = &current else { continue };
    if let Some((key, value)) = entry(trimmed) {
      out.entry(locale.clone()).or_default().insert(key, value);
    }
  }
  out
}

/// `'key': 'value',` → (key, value), undoing the escapes JavaScript allows.
fn entry(line: &str) -> Option<(String, String)> {
  let rest = line.strip_prefix('\'')?;
  let close = rest.find('\'')?;
  let key = &rest[..close];
  let rest = rest[close + 1..].trim_start().strip_prefix(':')?.trim_start();
  let rest = rest.strip_prefix('\'')?;
  let rest = rest.strip_suffix(',').unwrap_or(rest).trim_end();
  let body = rest.strip_suffix('\'')?;
  let mut value = String::with_capacity(body.len());
  let mut chars = body.chars();
  while let Some(c) = chars.next() {
    if c == '\\' {
      match chars.next() {
        Some('n') => value.push('\n'),
        Some('t') => value.push('\t'),
        Some(other) => value.push(other),
        None => {}
      }
    } else {
      value.push(c);
    }
  }
  Some((key.to_string(), value))
}

/// Resolve 'auto' against a system locale such as "ko-KR".
pub fn resolve(locale: &str, system: &str) -> &'static str {
  if let Some(found) = SUPPORTED.iter().find(|l| **l == locale) {
    return found;
  }
  if system.to_lowercase().starts_with("ko") {
    "ko"
  } else {
    "en"
  }
}

/// The operating system's language, as Electron's `app.getLocale()` gave it.
pub fn system_locale() -> String {
  sys_locale::get_locale().unwrap_or_else(|| "en-US".into())
}

/// Look up `key`, substituting `{placeholders}` from `vars`.
pub fn translate(locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
  let t = table();
  let text = t
    .get(locale)
    .and_then(|m| m.get(key))
    .or_else(|| t.get("en").and_then(|m| m.get(key)))
    .cloned()
    .unwrap_or_else(|| key.to_string());
  let mut out = text;
  for (name, value) in vars {
    out = out.replace(&format!("{{{name}}}"), value);
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_every_entry() {
    // Every line the table holds, counted the plain way, has to come through.
    let lines = SOURCE.lines().filter(|l| l.starts_with("      '") && l.contains("': ")).count();
    let parsed: usize = table().values().map(|m| m.len()).sum();
    assert_eq!(parsed, lines, "an entry in i18n.js is written in a form this parser does not read");
    assert!(table()["en"].len() > 150);
    assert_eq!(table()["en"].len(), table()["ko"].len());
  }

  #[test]
  fn translates_and_falls_back() {
    assert_eq!(translate("en", "menu.quit", &[]), "Quit MyDockBar");
    assert_ne!(translate("ko", "menu.quit", &[]), "Quit MyDockBar");
    assert_eq!(translate("ko", "no.such.key", &[]), "no.such.key");
    assert_eq!(translate("en", "m.themeSet", &[("name", "Aqua")]), "Theme: Aqua");
  }

  #[test]
  fn resolves_auto_against_the_system() {
    assert_eq!(resolve("auto", "ko-KR"), "ko");
    assert_eq!(resolve("auto", "en-US"), "en");
    assert_eq!(resolve("en", "ko-KR"), "en");
  }

  #[test]
  fn every_key_the_native_side_uses_exists() {
    // The Rust counterpart of the check i18n.test.js makes of settings.html:
    // a `t(…, "key"` in this crate naming a key the table does not have would
    // put the raw key in a menu.
    let mut missing = Vec::new();
    for (file, source) in crate::SOURCES {
      for (at, _) in source.match_indices("t(\"") {
        // Only a call of `t` itself, not `expect("` or `Emit("`.
        let before = source[..at].chars().last().unwrap_or(' ');
        if before.is_alphanumeric() || before == '_' || before == '.' {
          continue;
        }
        let rest = &source[at + 3..];
        let Some(end) = rest.find('"') else { continue };
        let key = &rest[..end];
        if key.contains('{') || key.ends_with('.') {
          continue;
        }
        if !table()["en"].contains_key(key) {
          missing.push(format!("{file}: {key}"));
        }
      }
    }
    assert!(missing.is_empty(), "keys missing from i18n.js: {missing:?}");
  }
}
