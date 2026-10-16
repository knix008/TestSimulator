//! Launching items, per platform.

use crate::app_scanner::{home, split_exec};
use serde::Serialize;
use serde_json::Value;
use std::{path::Path, process::Command};

#[derive(Clone, Debug, Serialize)]
pub struct Launched {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

impl Launched {
  pub fn ok() -> Self {
    Self { ok: true, error: None }
  }
  pub fn fail(error: impl Into<String>) -> Self {
    Self { ok: false, error: Some(error.into()) }
  }
}

/// Fire-and-forget: the dock must never keep a launched process attached.
pub fn detach(command: &str, args: &[String], cwd: Option<&Path>) -> Result<(), String> {
  let mut cmd = Command::new(command);
  cmd.args(args).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
  if let Some(dir) = cwd.filter(|d| d.is_dir()) {
    cmd.current_dir(dir);
  }
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
  }
  cmd.spawn().map(|_| ()).map_err(|e| {
    eprintln!("[launcher] {command}: {e}");
    e.to_string()
  })
}

/// Open with whatever the OS associates - Electron's `shell.openPath`.
pub fn open_path(path: &str) -> Result<(), String> {
  #[cfg(windows)]
  {
    crate::win::shell_open(path)
  }
  #[cfg(target_os = "macos")]
  {
    run_ok("open", &[path])
  }
  #[cfg(target_os = "linux")]
  {
    run_ok("xdg-open", &[path])
  }
}

#[cfg(not(windows))]
fn run_ok(command: &str, args: &[&str]) -> Result<(), String> {
  let status = Command::new(command).args(args).status().map_err(|e| e.to_string())?;
  if status.success() {
    Ok(())
  } else {
    Err(format!("{command} exited with {status}"))
  }
}

pub fn open_external(url: &str) -> Result<(), String> {
  #[cfg(windows)]
  {
    crate::win::shell_open(url)
  }
  #[cfg(not(windows))]
  {
    open_path(url)
  }
}

fn show_desktop() {
  #[cfg(windows)]
  crate::win::minimize_all();
  #[cfg(target_os = "macos")]
  let _ = detach("osascript", &["-e".into(), "tell application \"System Events\" to key code 103".into()], None);
  #[cfg(target_os = "linux")]
  let _ = detach("sh", &["-c".into(), "wmctrl -k on || xdotool key super+d".into()], None);
}

fn open_trash() {
  #[cfg(windows)]
  let _ = crate::win::shell_open("shell:RecycleBinFolder");
  #[cfg(target_os = "macos")]
  let _ = detach("open", &[home().join(".Trash").to_string_lossy().into_owned()], None);
  #[cfg(target_os = "linux")]
  let _ = open_path(&home().join(".local/share/Trash/files").to_string_lossy());
}

/// The folders the dock's own entries open.
pub struct Folders {
  pub documents: Option<std::path::PathBuf>,
  pub downloads: Option<std::path::PathBuf>,
}

/// Run one of the dock's own actions. `dock:settings` and `dock:quit` need the
/// application and are answered by the caller.
fn special(key: &str, folders: &Folders) -> bool {
  match key {
    "system:show-desktop" => show_desktop(),
    "system:trash" => open_trash(),
    "system:home" => {
      let _ = open_path(&home().to_string_lossy());
    }
    "system:documents" => {
      let _ = open_path(&folders.documents.clone().unwrap_or_else(|| home().join("Documents")).to_string_lossy());
    }
    "system:downloads" => {
      let _ = open_path(&folders.downloads.clone().unwrap_or_else(|| home().join("Downloads")).to_string_lossy());
    }
    _ => return false,
  }
  true
}

/// Launch a dock item. Returns `{ ok }` or `{ ok: false, error }` so the
/// renderer can shake the icon instead of failing silently.
pub fn launch(item: &Value, folders: &Folders) -> Launched {
  let kind = item["type"].as_str().unwrap_or("");
  let target = item["path"].as_str().unwrap_or("");
  if kind == "separator" {
    return Launched::ok();
  }

  if kind == "special" || target.starts_with("dock:") || target.starts_with("system:") {
    return if special(target, folders) { Launched::ok() } else { Launched::fail(format!("Unknown action: {target}")) };
  }

  if kind == "url" {
    return match open_external(target) {
      Ok(()) => Launched::ok(),
      Err(e) => Launched::fail(e),
    };
  }

  if target.is_empty() {
    return Launched::fail("No target set");
  }
  let path = Path::new(target);
  if !path.exists() && kind != "command" {
    return Launched::fail(format!("Not found: {target}"));
  }

  if kind == "folder" || (path.is_dir() && !cfg!(target_os = "macos")) {
    return match open_path(target) {
      Ok(()) => Launched::ok(),
      Err(e) => Launched::fail(e),
    };
  }

  let args = item["args"].as_str().map(split_exec).unwrap_or_default();

  #[cfg(target_os = "macos")]
  if target.ends_with(".app") {
    let mut a = vec!["-a".to_string(), target.to_string()];
    if !args.is_empty() {
      a.push("--args".into());
      a.extend(args);
    }
    return match detach("open", &a, None) {
      Ok(()) => Launched::ok(),
      Err(e) => Launched::fail(e),
    };
  }

  if args.is_empty() {
    // Let the OS pick the right verb (handles .lnk, documents, bundles).
    match open_path(target) {
      Ok(()) => return Launched::ok(),
      // Some Linux setups refuse plain executables here; fall through.
      Err(e) if !cfg!(target_os = "linux") => return Launched::fail(e),
      Err(_) => {}
    }
  }

  let cwd = item["cwd"].as_str().map(Path::new).map(Path::to_path_buf).or_else(|| path.parent().map(Path::to_path_buf));
  match detach(target, &args, cwd.as_deref()) {
    Ok(()) => Launched::ok(),
    Err(e) => Launched::fail(e),
  }
}

pub fn reveal_in_file_manager(target: &str) {
  if target.is_empty() {
    return;
  }
  #[cfg(windows)]
  crate::win::show_in_folder(target);
  #[cfg(target_os = "macos")]
  let _ = detach("open", &["-R".into(), target.into()], None);
  #[cfg(target_os = "linux")]
  {
    // The file manager's own "show this item", where it offers one.
    let uri = format!("file://{}", target);
    let asked = Command::new("dbus-send")
      .args(["--session", "--dest=org.freedesktop.FileManager1", "--type=method_call", "/org/freedesktop/FileManager1", "org.freedesktop.FileManager1.ShowItems"])
      .arg(format!("array:string:{uri}"))
      .arg("string:")
      .status()
      .map(|s| s.success())
      .unwrap_or(false);
    if !asked {
      if let Some(parent) = Path::new(target).parent() {
        let _ = open_path(&parent.to_string_lossy());
      }
    }
  }
}
