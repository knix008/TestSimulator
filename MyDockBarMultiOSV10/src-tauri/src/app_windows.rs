//! Finding and activating the windows an application already has open, so
//! clicking a dock icon raises what is running instead of starting another copy.
//!
//!  - Windows: one main window per process, enumerated in-process, raised with
//!    the AttachThreadInput sequence in `win.rs`.
//!  - macOS: `open -a` already activates a running application instead of
//!    launching another instance, so the launcher needs no help.
//!  - Linux: wmctrl when it is installed; without it, no window list.
//!
//! Results are still cached briefly and warmed on hover, as before: the click
//! itself reads memory.

use serde::Serialize;
use std::{
  collections::HashMap,
  sync::Mutex,
  time::{Duration, Instant},
};

#[derive(Clone, Debug, Serialize)]
pub struct AppWindow {
  pub id: String,
  pub title: String,
}

const CACHE_FOR: Duration = Duration::from_secs(4);
static CACHE: Mutex<Option<HashMap<String, (Instant, Vec<AppWindow>)>>> = Mutex::new(None);

fn lookup(target: &str) -> Vec<AppWindow> {
  #[cfg(windows)]
  {
    crate::win::windows_of(target).into_iter().map(|(id, title)| AppWindow { id, title }).collect()
  }
  #[cfg(target_os = "macos")]
  {
    let _ = target;
    Vec::new()
  }
  #[cfg(target_os = "linux")]
  {
    let Ok(out) = std::process::Command::new("wmctrl").arg("-lp").output() else { return Vec::new() };
    let mut windows = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
      // 0x03a00007  0 4321   host Title words
      let mut parts = line.trim().splitn(5, char::is_whitespace).filter(|p| !p.is_empty());
      let (Some(id), Some(_desk), Some(pid)) = (parts.next(), parts.next(), parts.next()) else { continue };
      let rest: Vec<&str> = line.trim().split_whitespace().skip(4).collect();
      let Ok(exe) = std::fs::read_link(format!("/proc/{pid}/exe")) else { continue };
      if exe.to_string_lossy() != target {
        continue;
      }
      let title = rest.join(" ");
      windows.push(AppWindow { id: id.to_string(), title: if title.is_empty() { id.to_string() } else { title } });
    }
    windows
  }
}

/// The open windows of the program at `target`, at most four seconds stale.
pub fn list(target: &str) -> Vec<AppWindow> {
  if target.is_empty() {
    return Vec::new();
  }
  if let Some((at, windows)) = CACHE.lock().unwrap().as_ref().and_then(|c| c.get(target)) {
    if at.elapsed() < CACHE_FOR {
      return windows.clone();
    }
  }
  let windows = lookup(target);
  CACHE.lock().unwrap().get_or_insert_with(HashMap::new).insert(target.to_string(), (Instant::now(), windows.clone()));
  windows
}

/// Warm the cache without waiting for the answer.
pub fn prefetch(target: &str) {
  let target = target.to_string();
  let _ = std::thread::Builder::new().name("window-prefetch".into()).spawn(move || {
    let _ = list(&target);
  });
}

/// Whether the window was raised.
pub fn focus(id: &str) -> bool {
  if id.is_empty() {
    return false;
  }
  #[cfg(windows)]
  {
    crate::win::focus_window(id)
  }
  #[cfg(target_os = "linux")]
  {
    std::process::Command::new("wmctrl").args(["-i", "-a", id]).status().map(|s| s.success()).unwrap_or(false)
  }
  #[cfg(target_os = "macos")]
  {
    false
  }
}
