//! Per-platform discovery of installed applications.

use serde::Serialize;
use std::{
  collections::HashMap,
  fs,
  path::{Path, PathBuf},
  sync::Mutex,
  time::{Duration, Instant},
};

#[derive(Clone, Debug, Default, Serialize)]
pub struct Found {
  pub label: String,
  pub path: String,
  pub args: String,
  pub icon: String,
  pub source: String,
}

fn walk(dir: &Path, depth: i32, out: &mut Vec<PathBuf>, accept: &dyn Fn(&str) -> bool) {
  if depth < 0 {
    return;
  }
  let Ok(entries) = fs::read_dir(dir) else { return };
  for entry in entries.flatten() {
    let full = entry.path();
    let Ok(kind) = entry.file_type() else { continue };
    if kind.is_dir() {
      walk(&full, depth - 1, out, accept);
    } else if accept(&entry.file_name().to_string_lossy()) {
      out.push(full);
    }
  }
}

pub fn home() -> PathBuf {
  std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).unwrap_or_default()
}

/* ------------------------------ Windows ------------------------------ */

#[cfg(windows)]
fn scan_windows() -> Vec<Found> {
  let mut roots = Vec::new();
  if let Some(data) = std::env::var_os("ProgramData") {
    roots.push(PathBuf::from(data).join("Microsoft\\Windows\\Start Menu\\Programs"));
  }
  if let Some(data) = std::env::var_os("APPDATA") {
    roots.push(PathBuf::from(data).join("Microsoft\\Windows\\Start Menu\\Programs"));
  }

  let mut found: Vec<Found> = Vec::new();
  let mut keys: Vec<String> = Vec::new();
  let mut unreadable = Vec::new();
  for root in roots {
    let mut links = Vec::new();
    walk(&root, 4, &mut links, &|name| name.to_lowercase().ends_with(".lnk"));
    for link in links {
      let label = link.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
      if skip_label(&label) {
        continue;
      }
      let Some(info) = crate::win::read_shortcut(&link) else {
        // Shell-namespace shortcuts (Control Panel, Run, ...) have no file
        // target and legitimately fail here.
        unreadable.push(label);
        continue;
      };
      let lower = info.target.to_lowercase();
      if ![".exe", ".bat", ".cmd", ".com"].iter().any(|ext| lower.ends_with(ext)) {
        continue;
      }
      if !Path::new(&info.target).exists() {
        continue;
      }
      let key = format!("{lower}|{}", info.args.to_lowercase());
      if keys.contains(&key) {
        continue;
      }
      keys.push(key);
      let icon = if !info.icon.is_empty() && Path::new(&info.icon).exists() { info.icon } else { String::new() };
      found.push(Found { label, path: info.target, args: info.args, icon, source: link.to_string_lossy().into_owned() });
    }
  }
  if !unreadable.is_empty() {
    println!("[app-scanner] {} shortcut(s) had no file target: {}", unreadable.len(), unreadable.join(", "));
  }
  found
}

/// Uninstallers, read-me files and web links are not applications.
#[cfg_attr(not(windows), allow(dead_code))]
fn skip_label(label: &str) -> bool {
  let l = label.to_lowercase();
  let compact: String = l.chars().filter(|c| !c.is_whitespace()).collect();
  ["uninstall", "readme", "help", "website", "documentation", "license"].iter().any(|w| l.contains(w))
    || ["설치제거", "제거", "웹사이트", "설명서"].iter().any(|w| compact.contains(w))
}

/* ------------------------------- macOS ------------------------------- */

#[cfg(target_os = "macos")]
fn scan_mac() -> Vec<Found> {
  let roots = [
    PathBuf::from("/Applications"),
    PathBuf::from("/Applications/Utilities"),
    PathBuf::from("/System/Applications"),
    PathBuf::from("/System/Applications/Utilities"),
    home().join("Applications"),
  ];
  let mut found: Vec<Found> = Vec::new();
  for root in roots {
    let Ok(entries) = fs::read_dir(&root) else { continue };
    for entry in entries.flatten() {
      let name = entry.file_name().to_string_lossy().into_owned();
      if !name.ends_with(".app") {
        continue;
      }
      let full = entry.path().to_string_lossy().into_owned();
      if found.iter().any(|f| f.path == full) {
        continue;
      }
      found.push(Found { label: name.trim_end_matches(".app").to_string(), path: full.clone(), args: String::new(), icon: String::new(), source: full });
    }
  }
  found
}

/* ------------------------------- Linux ------------------------------- */

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn desktop_file_roots() -> Vec<PathBuf> {
  let h = home();
  let mut dirs = vec![
    h.join(".local/share/applications"),
    PathBuf::from("/usr/share/applications"),
    PathBuf::from("/usr/local/share/applications"),
    PathBuf::from("/var/lib/flatpak/exports/share/applications"),
    h.join(".local/share/flatpak/exports/share/applications"),
    PathBuf::from("/var/lib/snapd/desktop/applications"),
  ];
  if let Ok(extra) = std::env::var("XDG_DATA_DIRS") {
    for base in extra.split(':').filter(|b| !b.is_empty()) {
      dirs.push(Path::new(base).join("applications"));
    }
  }
  let mut unique = Vec::new();
  for d in dirs {
    if !unique.contains(&d) {
      unique.push(d);
    }
  }
  unique
}

#[cfg_attr(not(any(test, target_os = "linux")), allow(dead_code))]
/// Minimal .desktop parser: only the `[Desktop Entry]` group matters.
pub fn parse_desktop_entry(file: &Path) -> Option<Found> {
  let text = fs::read_to_string(file).ok()?;
  let mut entry: HashMap<String, String> = HashMap::new();
  let mut in_group = false;
  for line in text.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
      continue;
    }
    if trimmed.starts_with('[') {
      in_group = trimmed == "[Desktop Entry]";
      continue;
    }
    if !in_group {
      continue;
    }
    let Some(eq) = trimmed.find('=') else { continue };
    entry.insert(trimmed[..eq].trim().to_string(), trimmed[eq + 1..].trim().to_string());
  }

  if entry.get("Type").map(|t| t != "Application").unwrap_or(false) {
    return None;
  }
  if entry.get("NoDisplay").map(|v| v == "true").unwrap_or(false) || entry.get("Hidden").map(|v| v == "true").unwrap_or(false) {
    return None;
  }
  let exec = entry.get("Exec")?;
  // Strip the field codes (%f %U %i ...) the spec lets launchers substitute.
  let exec = strip_field_codes(exec);
  let argv = split_exec(exec.trim());
  if argv.is_empty() {
    return None;
  }
  Some(Found {
    label: entry.get("Name").cloned().unwrap_or_else(|| file.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()),
    path: argv[0].clone(),
    args: argv[1..].join(" "),
    icon: entry.get("Icon").cloned().unwrap_or_default(),
    source: file.to_string_lossy().into_owned(),
  })
}

#[cfg_attr(not(any(test, target_os = "linux")), allow(dead_code))]
fn strip_field_codes(exec: &str) -> String {
  let mut out = String::new();
  let mut chars = exec.chars().peekable();
  while let Some(c) = chars.next() {
    if c == '%' {
      if let Some(&next) = chars.peek() {
        if "fFuUdDnNickvm".contains(next) {
          chars.next();
          continue;
        }
      }
    }
    out.push(c);
  }
  out
}

/// Split a command line honouring quotes, the way a shell would.
pub fn split_exec(line: &str) -> Vec<String> {
  let mut out = Vec::new();
  let mut current = String::new();
  let mut quote: Option<char> = None;
  for ch in line.chars() {
    if let Some(q) = quote {
      if ch == q {
        quote = None;
      } else {
        current.push(ch);
      }
    } else if ch == '"' || ch == '\'' {
      quote = Some(ch);
    } else if ch.is_whitespace() {
      if !current.is_empty() {
        out.push(std::mem::take(&mut current));
      }
    } else {
      current.push(ch);
    }
  }
  if !current.is_empty() {
    out.push(current);
  }
  out
}

#[cfg(not(any(windows, target_os = "macos")))]
fn scan_linux() -> Vec<Found> {
  let mut found: Vec<(String, Found)> = Vec::new();
  for root in desktop_file_roots() {
    let mut files = Vec::new();
    walk(&root, 2, &mut files, &|name| name.ends_with(".desktop"));
    for file in files {
      let Some(entry) = parse_desktop_entry(&file) else { continue };
      let key = file.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
      if !found.iter().any(|(k, _)| *k == key) {
        found.push((key, entry));
      }
    }
  }
  found.into_iter().map(|(_, f)| f).collect()
}

/* ------------------------------ public ------------------------------- */

static CACHE: Mutex<Option<(Instant, Vec<Found>)>> = Mutex::new(None);
const TTL: Duration = Duration::from_secs(60);

pub fn scan(force: bool) -> Vec<Found> {
  if !force {
    if let Some((at, list)) = CACHE.lock().unwrap().as_ref() {
      if at.elapsed() < TTL {
        return list.clone();
      }
    }
  }
  #[cfg(windows)]
  let mut result = scan_windows();
  #[cfg(target_os = "macos")]
  let mut result = scan_mac();
  #[cfg(not(any(windows, target_os = "macos")))]
  let mut result = scan_linux();

  result.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
  *CACHE.lock().unwrap() = Some((Instant::now(), result.clone()));
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  fn desktop(dir: &Path, name: &str, lines: &[&str]) -> PathBuf {
    let file = dir.join(name);
    fs::write(&file, lines.join("\n")).unwrap();
    file
  }

  #[test]
  fn splits_command_lines() {
    assert_eq!(split_exec("firefox --new-window"), ["firefox", "--new-window"]);
    assert_eq!(split_exec("\"C:\\Program Files\\App\\a.exe\" --flag \"two words\""), ["C:\\Program Files\\App\\a.exe", "--flag", "two words"]);
    assert_eq!(split_exec("cmd   'one two'    three"), ["cmd", "one two", "three"]);
    assert!(split_exec("   ").is_empty());
  }

  #[test]
  fn parses_desktop_entries() {
    let tmp = tempfile::tempdir().unwrap();
    let d = tmp.path();
    let ff = parse_desktop_entry(&desktop(d, "firefox.desktop", &["[Desktop Entry]", "Type=Application", "Name=Firefox", "Exec=/usr/bin/firefox %u", "Icon=firefox"])).unwrap();
    assert_eq!((ff.label.as_str(), ff.path.as_str(), ff.icon.as_str()), ("Firefox", "/usr/bin/firefox", "firefox"));

    let codes = parse_desktop_entry(&desktop(d, "codes.desktop", &["[Desktop Entry]", "Name=Thing", "Exec=/bin/thing %F %i %c --real"])).unwrap();
    assert_eq!(codes.args, "--real");

    assert!(parse_desktop_entry(&desktop(d, "hidden.desktop", &["[Desktop Entry]", "Name=Hidden", "Exec=/bin/x", "NoDisplay=true"])).is_none());
    assert!(parse_desktop_entry(&desktop(d, "gone.desktop", &["[Desktop Entry]", "Name=Gone", "Exec=/bin/x", "Hidden=true"])).is_none());
    assert!(parse_desktop_entry(&desktop(d, "link.desktop", &["[Desktop Entry]", "Type=Link", "Name=Site", "URL=https://example.com"])).is_none());

    let actions = parse_desktop_entry(&desktop(d, "actions.desktop", &["[Desktop Entry]", "Name=Real", "Exec=/bin/real", "", "[Desktop Action new]", "Name=Decoy", "Exec=/bin/decoy"])).unwrap();
    assert_eq!((actions.label.as_str(), actions.path.as_str()), ("Real", "/bin/real"));

    let comments = parse_desktop_entry(&desktop(d, "comments.desktop", &["# a comment", "", "[Desktop Entry]", "  ", "# another", "Name=Clean", "Exec=/bin/clean"])).unwrap();
    assert_eq!(comments.label, "Clean");

    assert!(parse_desktop_entry(&desktop(d, "noexec.desktop", &["[Desktop Entry]", "Name=Nothing"])).is_none());
    assert!(parse_desktop_entry(&d.join("absent.desktop")).is_none());
  }

  #[test]
  fn skips_uninstallers_and_documentation() {
    assert!(skip_label("Uninstall Foo"));
    assert!(skip_label("Foo 설치 제거"));
    assert!(skip_label("Foo Website"));
    assert!(!skip_label("Visual Studio Code"));
  }
}
