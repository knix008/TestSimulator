//! Two related jobs:
//!
//!  - `names`: every running executable, used for the "this app is running"
//!    dot under a pinned icon.
//!  - `apps`: the running applications that actually own a window, so the dock
//!    can show their icons the way the macOS Dock and the taskbar do.
//!
//! Both are polled, because there is no portable event for either. On Windows
//! a poll is now a process snapshot and a window enumeration made in-process -
//! a fraction of a millisecond - where the Electron build started tasklist.exe
//! and PowerShell every five seconds.

use serde::Serialize;
use std::{
  collections::HashSet,
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Condvar, Mutex,
  },
  thread,
  time::Duration,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RunningApp {
  pub name: String,
  pub path: String,
}

const INTERVAL: Duration = Duration::from_secs(5);

/// Shell and OS surfaces that own a window but are not applications a user
/// would ever want an icon for.
pub const WINDOWS_SYSTEM_PROCESSES: [&str; 28] = [
  "applicationframehost", "systemsettings", "shellexperiencehost", "startmenuexperiencehost", "searchhost", "searchapp", "searchui",
  "textinputhost", "lockapp", "explorer", "dwm", "csrss", "winlogon", "sihost", "ctfmon", "runtimebroker", "taskhostw", "dllhost",
  "wudfhost", "fontdrvhost", "smartscreen", "usoclient", "widgets", "widgetboard", "phoneexperiencehost", "crossdeviceresume", "openwith",
  "msedgewebview2",
];

/// The dock must never list itself - the packaged executable, or the debug
/// build that is hosting it.
pub fn is_self(target: &str) -> bool {
  if target.is_empty() {
    return false;
  }
  let lower = target.to_lowercase();
  let own = std::env::current_exe().map(|p| p.to_string_lossy().to_lowercase()).unwrap_or_default();
  lower == own || lower.ends_with("\\mydockbar.exe") || lower.ends_with("/mydockbar.exe") || lower.ends_with("/mydockbar")
}

/// True for binaries that live in the Windows directory, i.e. the OS itself.
pub fn is_system_path(target: &str) -> bool {
  let lower = target.to_lowercase().replace('/', "\\");
  let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into()).to_lowercase();
  if !lower.starts_with(&format!("{root}\\")) {
    return false;
  }
  // WindowsApps holds real Store applications, which do belong on the dock.
  !lower.contains("\\windowsapps\\")
}

/* ---------------------------- every process ----------------------------- */

#[cfg(windows)]
fn list_names() -> Option<HashSet<String>> {
  crate::win::process_names()
}

#[cfg(target_os = "linux")]
fn list_names() -> Option<HashSet<String>> {
  let mut names = HashSet::new();
  for entry in std::fs::read_dir("/proc").ok()?.flatten() {
    let pid = entry.file_name();
    if !pid.to_string_lossy().bytes().all(|b| b.is_ascii_digit()) {
      continue;
    }
    if let Ok(exe) = std::fs::read_link(entry.path().join("exe")) {
      if let Some(name) = exe.file_name() {
        names.insert(name.to_string_lossy().to_lowercase());
      }
    } else if let Ok(comm) = std::fs::read_to_string(entry.path().join("comm")) {
      names.insert(comm.trim().to_lowercase());
    }
  }
  Some(names)
}

#[cfg(target_os = "macos")]
fn ps_lines() -> Option<Vec<String>> {
  let out = std::process::Command::new("ps").args(["-A", "-o", "comm="]).output().ok()?;
  out.status.success().then(|| String::from_utf8_lossy(&out.stdout).lines().map(|l| l.trim().to_string()).collect())
}

#[cfg(target_os = "macos")]
fn list_names() -> Option<HashSet<String>> {
  let mut names = HashSet::new();
  for line in ps_lines()? {
    if line.is_empty() {
      continue;
    }
    let base = line.rsplit('/').next().unwrap_or(&line).to_lowercase();
    names.insert(base);
    if let Some(at) = line.find(".app/") {
      let bundle = &line[..at];
      let name = bundle.rsplit('/').next().unwrap_or(bundle);
      names.insert(format!("{}.app", name.to_lowercase()));
    }
  }
  Some(names)
}

/* ------------------------ applications with a window --------------------- */

#[cfg(windows)]
fn list_windowed_apps() -> Option<Vec<RunningApp>> {
  let mut seen = HashSet::new();
  let mut apps = Vec::new();
  for app in crate::win::windowed_apps() {
    let key = app.path.to_lowercase();
    if seen.contains(&key) || WINDOWS_SYSTEM_PROCESSES.contains(&app.name.to_lowercase().as_str()) {
      continue;
    }
    if is_system_path(&app.path) || is_self(&app.path) {
      continue;
    }
    seen.insert(key);
    apps.push(RunningApp { name: app.name, path: app.path });
  }
  Some(apps)
}

#[cfg(target_os = "macos")]
fn list_windowed_apps() -> Option<Vec<RunningApp>> {
  let mut apps: Vec<RunningApp> = Vec::new();
  for line in ps_lines()? {
    // /Applications/Safari.app/Contents/MacOS/Safari -> the bundle itself.
    let Some(at) = line.find(".app/Contents/MacOS/") else { continue };
    let bundle = format!("{}.app", &line[..at]);
    // System agents and embedded helper bundles are not user applications.
    if bundle.starts_with("/System/") || is_self(&bundle) || bundle.to_lowercase().contains("mydockbar") {
      continue;
    }
    if bundle.contains(".framework/") || bundle[..bundle.len() - 4].contains(".app/Contents/") {
      continue;
    }
    if apps.iter().any(|a| a.path == bundle) {
      continue;
    }
    let name = bundle.trim_end_matches(".app").rsplit('/').next().unwrap_or("").to_string();
    apps.push(RunningApp { name, path: bundle });
  }
  Some(apps)
}

#[cfg(target_os = "linux")]
fn list_windowed_apps() -> Option<Vec<RunningApp>> {
  // wmctrl maps windows to pids; /proc then gives the executable. Without
  // wmctrl there is no portable way to tell a windowed process from a daemon,
  // so the feature simply reports nothing rather than guessing.
  let Ok(out) = std::process::Command::new("wmctrl").arg("-lp").output() else { return Some(Vec::new()) };
  let mut apps: Vec<RunningApp> = Vec::new();
  for line in String::from_utf8_lossy(&out.stdout).lines() {
    let parts: Vec<&str> = line.split_whitespace().collect();
    let Some(pid) = parts.get(2).and_then(|p| p.parse::<u32>().ok()).filter(|p| *p > 0) else { continue };
    let Ok(target) = std::fs::read_link(format!("/proc/{pid}/exe")) else { continue };
    let target = target.to_string_lossy().into_owned();
    if apps.iter().any(|a| a.path == target) {
      continue;
    }
    // /usr/libexec and /usr/lib hold the desktop shell, not applications.
    if target.starts_with("/usr/libexec/") || target.starts_with("/usr/lib/") || is_self(&target) {
      continue;
    }
    let name = target.rsplit('/').next().unwrap_or("").to_string();
    apps.push(RunningApp { name, path: target });
  }
  Some(apps)
}

/* -------------------------------- watch --------------------------------- */

#[derive(Default)]
struct Shared {
  names: HashSet<String>,
  apps: Vec<RunningApp>,
  want_apps: bool,
  active: bool,
  generation: u64,
}

/// Polls while either the indicator or the open-applications row is on, and
/// not at all otherwise.
pub struct RunningWatch {
  shared: Arc<(Mutex<Shared>, Condvar)>,
  thread_started: AtomicBool,
  on_change: Arc<dyn Fn(Vec<String>, Vec<RunningApp>) + Send + Sync>,
}

impl RunningWatch {
  pub fn new(on_change: impl Fn(Vec<String>, Vec<RunningApp>) + Send + Sync + 'static) -> Self {
    Self { shared: Arc::new((Mutex::new(Shared::default()), Condvar::new())), thread_started: AtomicBool::new(false), on_change: Arc::new(on_change) }
  }

  /// The names currently running, or None when nothing is being tracked - in
  /// which case the caller asks the OS itself.
  pub fn names(&self) -> Option<HashSet<String>> {
    let s = self.shared.0.lock().unwrap();
    s.active.then(|| s.names.clone())
  }

  pub fn start(&self, apps: bool) {
    {
      let mut s = self.shared.0.lock().unwrap();
      s.want_apps = apps;
      s.active = true;
      s.generation += 1;
    }
    self.shared.1.notify_all();
    if !self.thread_started.swap(true, Ordering::SeqCst) {
      let shared = self.shared.clone();
      let on_change = self.on_change.clone();
      let _ = thread::Builder::new().name("running-watch".into()).spawn(move || run(shared, on_change));
    }
  }

  pub fn stop(&self) {
    let changed = {
      let mut s = self.shared.0.lock().unwrap();
      s.active = false;
      s.generation += 1;
      let had = !s.names.is_empty() || !s.apps.is_empty();
      s.names.clear();
      s.apps.clear();
      had
    };
    self.shared.1.notify_all();
    if changed {
      (self.on_change)(Vec::new(), Vec::new());
    }
  }
}

fn run(shared: Arc<(Mutex<Shared>, Condvar)>, on_change: Arc<dyn Fn(Vec<String>, Vec<RunningApp>) + Send + Sync>) {
  let (lock, wake) = &*shared;
  loop {
    // Sleep until there is something to watch.
    let want_apps = {
      let mut s = lock.lock().unwrap();
      while !s.active {
        s = wake.wait(s).unwrap();
      }
      s.want_apps
    };

    let names = list_names();
    let apps = if want_apps { list_windowed_apps() } else { Some(Vec::new()) };

    let report = {
      let mut s = lock.lock().unwrap();
      if !s.active {
        None
      } else {
        let mut changed = false;
        if let Some(n) = names {
          if n != s.names {
            s.names = n;
            changed = true;
          }
        }
        if let Some(a) = apps {
          if a != s.apps {
            s.apps = a;
            changed = true;
          }
        }
        changed.then(|| (s.names.iter().cloned().collect::<Vec<_>>(), s.apps.clone()))
      }
    };
    if let Some((names, apps)) = report {
      on_change(names, apps);
    }

    // Wait out the interval, or wake early when the settings change.
    let s = lock.lock().unwrap();
    let start_gen = s.generation;
    let _ = wake.wait_timeout_while(s, INTERVAL, |s| s.generation == start_gen && s.active);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn treats_binaries_under_the_windows_directory_as_system() {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    assert!(is_system_path(&format!("{root}\\explorer.exe")));
    assert!(is_system_path(&format!("{root}\\System32\\notepad.exe")));
    assert!(!is_system_path("C:\\Program Files\\Google\\Chrome\\chrome.exe"));
    assert!(!is_system_path("D:\\Tools\\thing.exe"));
    assert!(!is_system_path(&format!("{root}\\SystemApps\\WindowsApps\\Some.App.exe")), "Store apps belong on the dock");
    assert!(is_system_path(&format!("{}/System32/cmd.exe", root.replace('\\', "/"))));
    assert!(!is_system_path(""));
  }

  #[test]
  fn lists_the_shell_surfaces_that_are_not_applications() {
    for name in ["explorer", "searchhost", "applicationframehost", "textinputhost"] {
      assert!(WINDOWS_SYSTEM_PROCESSES.contains(&name), "{name} should be filtered out");
    }
  }

  #[test]
  fn never_lists_itself() {
    assert!(is_self(&std::env::current_exe().unwrap().to_string_lossy()));
    assert!(is_self("C:\\Program Files\\MyDockBar\\MyDockBar.exe"));
    assert!(!is_self("C:\\Program Files\\Google\\Chrome\\chrome.exe"));
    assert!(!is_self("/Applications/Safari.app"));
    assert!(!is_self(""));
  }

  #[test]
  fn finds_running_processes() {
    let names = list_names().expect("no process list");
    assert!(names.len() > 5);
  }

  #[cfg(windows)]
  #[test]
  fn lists_windowed_apps_quickly_and_without_the_shell() {
    let started = std::time::Instant::now();
    let apps = list_windowed_apps().unwrap();
    assert!(started.elapsed() < Duration::from_millis(500), "took {:?}", started.elapsed());
    assert!(apps.iter().all(|a| !WINDOWS_SYSTEM_PROCESSES.contains(&a.name.to_lowercase().as_str())));
  }
}
