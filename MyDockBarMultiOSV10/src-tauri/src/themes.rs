//! Theme discovery, `url()` rewriting and the `ui` palette.
//!
//! A theme is a folder holding `theme.json` plus any images it references.
//! `variables` become CSS custom properties on the dock root; `ui` is the
//! palette the settings window paints itself with; `css` is an optional extra
//! stylesheet. `url(...)` references in either are rewritten to resolve against
//! the theme folder, through the app's own protocol.

use serde_json::{json, Map, Value};
use std::{
  fs,
  path::{Path, PathBuf},
  sync::Mutex,
  time::{Duration, Instant},
};

#[derive(Clone, Debug)]
pub struct Theme {
  pub id: String,
  pub name: String,
  pub author: String,
  pub description: String,
  pub dark: bool,
  pub builtin: bool,
  pub variables: Map<String, Value>,
  pub ui: Value,
  pub css: String,
}

impl Theme {
  /// What the renderer is given inside a config snapshot.
  pub fn payload(&self) -> Value {
    json!({ "id": self.id, "name": self.name, "variables": self.variables, "ui": self.ui, "css": self.css, "dark": self.dark })
  }
  pub fn summary(&self) -> Value {
    json!({ "id": self.id, "name": self.name, "author": self.author, "description": self.description, "dark": self.dark, "builtin": self.builtin })
  }
}

/// `url(x)` → `url(<folder>/x)` for every relative reference.
pub fn rewrite_urls(text: &str, dir: &Path) -> String {
  let mut out = String::with_capacity(text.len());
  let mut rest = text;
  while let Some(at) = rest.find("url(") {
    out.push_str(&rest[..at + 4]);
    rest = &rest[at + 4..];
    let Some(close) = rest.find(')') else { break };
    let inner = rest[..close].trim();
    let (quote, body) = match inner.chars().next() {
      Some(q @ ('\'' | '"')) if inner.len() >= 2 && inner.ends_with(q) => (q.to_string(), &inner[1..inner.len() - 1]),
      _ => (String::new(), inner),
    };
    let absolute = ["data:", "http:", "https:", "file:", "dock:"].iter().any(|p| body.starts_with(p));
    if absolute || body.is_empty() {
      out.push_str(&rest[..close]);
    } else {
      let rel = body.strip_prefix("./").unwrap_or(body);
      out.push_str(&format!("{quote}{}{quote}", crate::icons::file_url(&dir.join(rel))));
    }
    rest = &rest[close..];
  }
  out.push_str(rest);
  out
}

fn read_theme(dir: &Path, builtin: bool) -> Option<Theme> {
  let raw: Value = match fs::read_to_string(dir.join("theme.json")) {
    Ok(text) => match serde_json::from_str(&text) {
      Ok(v) => v,
      Err(err) => {
        eprintln!("[themes] bad manifest in {}: {err}", dir.display());
        return None;
      }
    },
    Err(_) => return None,
  };
  let folder = dir.file_name()?.to_string_lossy().into_owned();
  let id = raw["id"].as_str().filter(|s| !s.is_empty()).map(String::from).unwrap_or(folder);
  let mut css = String::new();
  if let Some(file) = raw["css"].as_str().filter(|s| !s.is_empty()) {
    match fs::read_to_string(dir.join(file)) {
      Ok(text) => css = text,
      Err(err) => eprintln!("[themes] {id}: cannot read {file}: {err}"),
    }
  }
  let css = rewrite_urls(&css, dir);
  let mut variables = raw["variables"].as_object().cloned().unwrap_or_default();
  for value in variables.values_mut() {
    if let Value::String(s) = value {
      *s = rewrite_urls(s, dir);
    }
  }
  Some(Theme {
    name: raw["name"].as_str().filter(|s| !s.is_empty()).map(String::from).unwrap_or_else(|| id.clone()),
    id,
    author: raw["author"].as_str().unwrap_or("").into(),
    description: raw["description"].as_str().unwrap_or("").into(),
    dark: raw["dark"] != Value::Bool(false),
    builtin,
    variables,
    ui: if raw["ui"].is_object() { raw["ui"].clone() } else { Value::Null },
    css,
  })
}

fn scan(dir: &Path, builtin: bool) -> Vec<Theme> {
  let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
  entries.flatten().filter(|e| e.path().is_dir()).filter_map(|e| read_theme(&e.path(), builtin)).collect()
}

pub struct Themes {
  pub builtin_dir: PathBuf,
  pub user_dir: PathBuf,
  /// Every config change sends a snapshot holding the current theme, and a
  /// slider drag is a stream of changes; reading 48 folders for each one is
  /// waste, so the list is kept for a second.
  pub cache: Mutex<Option<(Instant, Vec<Theme>)>>,
}

const FRESH: Duration = Duration::from_secs(1);

impl Themes {
  pub fn list(&self) -> Vec<Theme> {
    if let Some((at, list)) = self.cache.lock().unwrap().as_ref() {
      if at.elapsed() < FRESH {
        return list.clone();
      }
    }
    let list = self.read_all();
    *self.cache.lock().unwrap() = Some((Instant::now(), list.clone()));
    list
  }

  fn read_all(&self) -> Vec<Theme> {
    let mut all: Vec<Theme> = Vec::new();
    for theme in scan(&self.builtin_dir, true).into_iter().chain(scan(&self.user_dir, false)) {
      // User themes win over a built-in one of the same id.
      if let Some(existing) = all.iter_mut().find(|t| t.id == theme.id) {
        *existing = theme;
      } else {
        all.push(theme);
      }
    }
    all.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    all
  }

  pub fn get(&self, id: &str) -> Option<Theme> {
    let all = self.list();
    all.iter().find(|t| t.id == id).or_else(|| all.iter().find(|t| t.id == "aqua")).or_else(|| all.first()).cloned()
  }

  pub fn ensure_user_dir(&self) -> PathBuf {
    let _ = fs::create_dir_all(&self.user_dir);
    self.user_dir.clone()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn builtin() -> Themes {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("themes");
    Themes { builtin_dir: root, user_dir: PathBuf::from("does-not-exist"), cache: Default::default() }
  }

  #[test]
  fn finds_the_built_in_themes_and_falls_back_to_aqua() {
    let themes = builtin();
    let all = themes.list();
    assert_eq!(all.len(), 48);
    assert!(all.iter().all(|t| t.builtin && !t.variables.is_empty()));
    assert_eq!(themes.get("no-such-theme").unwrap().id, "aqua");
    assert!(!themes.get("aqua-light").unwrap().dark);
  }

  #[test]
  fn lets_a_user_theme_replace_a_built_in_one() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("aqua");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("theme.json"), r#"{"name":"My Aqua","variables":{"--plate-bg":"url(./bg.png)"}}"#).unwrap();
    let themes = Themes { user_dir: tmp.path().to_path_buf(), ..builtin() };
    let aqua = themes.get("aqua").unwrap();
    assert_eq!(aqua.name, "My Aqua");
    assert!(!aqua.builtin);
    let bg = aqua.variables["--plate-bg"].as_str().unwrap();
    assert!(bg.starts_with(&format!("url({}/file/", crate::icons::protocol_origin())), "{bg}");
    assert!(bg.ends_with("bg.png)"), "{bg}");
  }

  #[test]
  fn leaves_absolute_urls_alone() {
    let dir = Path::new("C:/t");
    assert_eq!(rewrite_urls("url(data:image/png;base64,AA)", dir), "url(data:image/png;base64,AA)");
    assert_eq!(rewrite_urls("url('https://x/y.png')", dir), "url('https://x/y.png')");
    let rewritten = rewrite_urls("a url(\"img/x.png\") b", dir);
    assert!(rewritten.starts_with(&format!("a url(\"{}/file/", crate::icons::protocol_origin())) && rewritten.ends_with("x.png\") b"), "{rewritten}");
  }
}
