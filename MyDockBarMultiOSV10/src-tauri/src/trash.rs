//! Whether the recycle bin / trash holds anything, emptying it, and watching it.
//!
//! Every platform keeps this somewhere different, so each one gets its own
//! probe. The probes are plain directory reads that stop at the first deleted
//! item: the dock repaints its Trash icon from the answer, so it has to come
//! back in a millisecond. A failure reports "unknown but not empty" rather than
//! an error - the dock would rather show a full bin it cannot verify.
//!
//! `watch()` turns the probes into a live feed: the OS reports the moment
//! anything lands in the bin or leaves it, and a slow sweep sits behind that
//! purely as a safety net.

use serde::Serialize;
use std::{
  collections::HashSet,
  fs,
  path::{Path, PathBuf},
  sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
  },
  thread,
  time::Duration,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct State {
  pub empty: bool,
  pub known: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
  Yes,
  No,
  Missing,
  Denied,
}

/// Does `dir` hold at least one entry `accept` recognises? Stops at the first
/// hit: a bin with fifty thousand files in it costs one directory read.
pub fn holds_item(dir: &Path, accept: &dyn Fn(&str) -> bool) -> Verdict {
  let entries = match fs::read_dir(dir) {
    Ok(entries) => entries,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Verdict::Missing,
    Err(_) => return Verdict::Denied,
  };
  for entry in entries {
    match entry {
      Ok(entry) => {
        if accept(&entry.file_name().to_string_lossy()) {
          return Verdict::Yes;
        }
      }
      Err(_) => return Verdict::Denied,
    }
  }
  Verdict::No
}

#[cfg_attr(windows, allow(dead_code))]
fn from_verdict(v: Verdict) -> State {
  match v {
    Verdict::Yes => State { empty: false, known: true },
    // The folder is only created by the first delete, so "not there" is a
    // genuine empty. "There but refused" is not.
    Verdict::No | Verdict::Missing => State { empty: true, known: true },
    Verdict::Denied => State { empty: false, known: false },
  }
}

/// A deleted item is the `$R…` copy of the data. `$I…` is only its metadata
/// record, and orphaned `$I` files outlive an emptied bin - counting those
/// reports a full bin long after the user emptied it.
pub fn is_deleted_item(name: &str) -> bool {
  let b = name.as_bytes();
  b.len() > 2 && b[0] == b'$' && (b[1] == b'R' || b[1] == b'r')
}

/// Finder's own bookkeeping files live in ~/.Trash and are not deleted items.
#[cfg_attr(not(any(test, target_os = "macos")), allow(dead_code))]
pub const MAC_IGNORED: [&str; 2] = [".DS_Store", ".localized"];

/* ------------------------------- Windows -------------------------------- */

#[cfg(windows)]
mod platform {
  use super::*;
  use std::sync::OnceLock;

  static ROOTS: Mutex<Option<Vec<PathBuf>>> = Mutex::new(None);

  /// Every mounted volume keeps its own bin; probing the drive letters costs
  /// two dozen stat calls, so the answer is kept until the slow sweep.
  pub fn roots(rescan: bool) -> Vec<PathBuf> {
    let mut cache = ROOTS.lock().unwrap();
    if let (Some(list), false) = (cache.as_ref(), rescan) {
      return list.clone();
    }
    let list: Vec<PathBuf> = (b'C'..=b'Z')
      .map(|letter| PathBuf::from(format!("{}:\\$Recycle.Bin", letter as char)))
      .filter(|dir| dir.is_dir())
      .collect();
    *cache = Some(list.clone());
    list
  }

  pub fn sid() -> Option<&'static str> {
    static SID: OnceLock<Option<String>> = OnceLock::new();
    SID.get_or_init(crate::win::current_sid).as_deref()
  }

  fn bins(rescan: bool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for root in roots(rescan) {
      if let Some(sid) = sid() {
        out.push(root.join(sid));
        continue;
      }
      // Without a SID, fall back to every folder we are allowed to read.
      if let Ok(entries) = fs::read_dir(&root) {
        for e in entries.flatten() {
          if e.file_name().to_string_lossy().starts_with("S-1-") {
            out.push(e.path());
          }
        }
      }
    }
    out
  }

  pub fn state_with(rescan: bool) -> State {
    let mut answered = false;
    for bin in bins(rescan) {
      match holds_item(&bin, &is_deleted_item) {
        // One full volume is enough; the rest cannot change the answer.
        Verdict::Yes => return State { empty: false, known: true },
        // `Denied` is what another account's folder looks like, so it only
        // decides the answer when no volume answered at all.
        Verdict::Denied => {}
        _ => answered = true,
      }
    }
    if answered {
      State { empty: true, known: true }
    } else {
      State { empty: false, known: false }
    }
  }

  pub fn empty(owner: Option<isize>) -> Result<(), String> {
    crate::win::empty_recycle_bin(owner)
  }

  /// One directory each, never a subtree: the user's own folder in each bin,
  /// or - until the first delete on that volume creates it - the volume's bin
  /// itself, whose new subfolder is then the event that swaps the watch over.
  pub fn watch_targets(rescan: bool) -> Vec<PathBuf> {
    roots(rescan)
      .into_iter()
      .map(|root| match sid() {
        Some(sid) if root.join(sid).exists() => root.join(sid),
        _ => root,
      })
      .collect()
  }
}

/* -------------------------------- macOS --------------------------------- */

#[cfg(target_os = "macos")]
mod platform {
  use super::*;

  fn dir() -> PathBuf {
    crate::app_scanner::home().join(".Trash")
  }

  pub fn state_with(_rescan: bool) -> State {
    from_verdict(holds_item(&dir(), &|name| !MAC_IGNORED.contains(&name)))
  }

  pub fn empty(_owner: Option<isize>) -> Result<(), String> {
    let status = std::process::Command::new("osascript").args(["-e", "tell application \"Finder\" to empty trash"]).status().map_err(|e| e.to_string())?;
    if status.success() {
      Ok(())
    } else {
      Err(format!("osascript exited with {status}"))
    }
  }

  pub fn watch_targets(_rescan: bool) -> Vec<PathBuf> {
    vec![dir()]
  }
}

/* -------------------------------- Linux --------------------------------- */

#[cfg(not(any(windows, target_os = "macos")))]
mod platform {
  use super::*;

  fn root() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| crate::app_scanner::home().join(".local/share")).join("Trash")
  }

  pub fn state_with(_rescan: bool) -> State {
    from_verdict(holds_item(&root().join("files"), &|_| true))
  }

  pub fn empty(_owner: Option<isize>) -> Result<(), String> {
    for sub in ["files", "info"] {
      let dir = root().join(sub);
      let Ok(entries) = fs::read_dir(&dir) else { continue };
      for entry in entries.flatten() {
        let path = entry.path();
        let result = if path.is_dir() && !path.is_symlink() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
        result.map_err(|e| e.to_string())?;
      }
    }
    Ok(())
  }

  pub fn watch_targets(_rescan: bool) -> Vec<PathBuf> {
    vec![root().join("files")]
  }
}

/// Is the bin empty? `known` is false only when every probe was refused.
pub fn state() -> State {
  platform::state_with(false)
}

/// Empty the bin. On Windows, `owner` is the dock's window handle so the
/// progress dialog stacks above an always-on-top dock.
pub fn empty(owner: Option<isize>) -> Result<(), String> {
  platform::empty(owner)
}

/// How long to let a burst of filesystem events settle before re-probing.
const SETTLE: Duration = Duration::from_millis(120);
/// Backstop sweep: the watches carry the work; this only re-checks what no
/// watch can report - a volume being mounted, or a watch the OS dropped.
const SWEEP: Duration = Duration::from_secs(60);

pub struct Watch {
  stopped: Arc<AtomicBool>,
  wake: mpsc::Sender<()>,
}

impl Watch {
  pub fn stop(&self) {
    self.stopped.store(true, Ordering::SeqCst);
    let _ = self.wake.send(());
  }
}

impl Drop for Watch {
  fn drop(&mut self) {
    self.stop();
  }
}

/// Report the bin's state whenever it changes, starting with its state now.
///
/// Idle cost is meant to be nil: no polling loop, one directory watch per
/// volume, and a probe only when the OS says something moved.
pub fn watch(on_change: impl Fn(State) + Send + 'static) -> Watch {
  use notify::{RecursiveMode, Watcher};

  let stopped = Arc::new(AtomicBool::new(false));
  let (tx, rx) = mpsc::channel::<()>();
  let flag = stopped.clone();
  let bump = tx.clone();

  thread::Builder::new()
    .name("trash-watch".into())
    .spawn(move || {
      let mut watcher = match notify::recommended_watcher(move |_res: notify::Result<notify::Event>| {
        let _ = bump.send(());
      }) {
        Ok(w) => Some(w),
        Err(err) => {
          eprintln!("[trash] cannot watch the bin: {err}");
          None
        }
      };
      let watched: Mutex<HashSet<PathBuf>> = Mutex::new(HashSet::new());
      let arm = |watcher: &mut Option<notify::RecommendedWatcher>, rescan: bool| {
        let Some(w) = watcher.as_mut() else { return };
        let wanted: HashSet<PathBuf> = platform::watch_targets(rescan).into_iter().collect();
        let mut current = watched.lock().unwrap();
        // The per-user folder appearing retires the stand-in watch above it.
        for dir in current.clone().difference(&wanted) {
          let _ = w.unwatch(dir);
          current.remove(dir);
        }
        for dir in wanted.difference(&current.clone()) {
          if w.watch(dir, RecursiveMode::NonRecursive).is_ok() {
            current.insert(dir.clone());
          }
        }
      };

      let mut last: Option<bool> = None;
      let mut probe = |rescan: bool| {
        let info = platform::state_with(rescan);
        if last != Some(info.empty) {
          last = Some(info.empty);
          on_change(info);
        }
      };

      arm(&mut watcher, false);
      probe(false);
      loop {
        match rx.recv_timeout(SWEEP) {
          Ok(()) => {
            if flag.load(Ordering::SeqCst) {
              break;
            }
            // Let the burst settle, swallowing whatever else arrives meanwhile.
            thread::sleep(SETTLE);
            while rx.try_recv().is_ok() {}
            if flag.load(Ordering::SeqCst) {
              break;
            }
            probe(false);
            // It may be the moment the per-user folder was just created.
            arm(&mut watcher, false);
          }
          Err(mpsc::RecvTimeoutError::Timeout) => {
            if flag.load(Ordering::SeqCst) {
              break;
            }
            arm(&mut watcher, true);
            probe(true);
          }
          Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
      }
    })
    .ok();

  Watch { stopped, wake: tx }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn bin(root: &Path, label: &str, names: &[&str]) -> PathBuf {
    let dir = root.join(label);
    fs::create_dir_all(&dir).unwrap();
    for n in names {
      fs::write(dir.join(n), "x").unwrap();
    }
    dir
  }

  #[test]
  fn counts_only_the_r_copy_as_a_deleted_item() {
    assert!(is_deleted_item("$RABC123.txt"));
    assert!(!is_deleted_item("$IABC123.txt"), "the $I record is only metadata");
    assert!(is_deleted_item("$rABC123"));
    assert!(!is_deleted_item("desktop.ini"));
    assert!(!is_deleted_item("$R") && !is_deleted_item("$") && !is_deleted_item(""));
    assert!(!is_deleted_item("my$Rfile.txt"));
  }

  #[test]
  fn scans_a_bin() {
    let tmp = tempfile::tempdir().unwrap();
    let t = tmp.path();
    assert_eq!(holds_item(&bin(t, "empty", &[]), &is_deleted_item), Verdict::No);
    assert_eq!(holds_item(&bin(t, "orphans", &["$IAAA.txt", "$IBBB.pdf", "desktop.ini"]), &is_deleted_item), Verdict::No);
    assert_eq!(holds_item(&bin(t, "full", &["$IAAA.txt", "desktop.ini", "$RAAA.txt"]), &is_deleted_item), Verdict::Yes);
    assert_eq!(holds_item(&t.join("never-created"), &is_deleted_item), Verdict::Missing);
    let file = t.join("not-a-folder");
    fs::write(&file, "x").unwrap();
    assert_eq!(holds_item(&file, &is_deleted_item), Verdict::Denied, "a file where a folder should be is refused, not empty");

    let accept = |name: &str| !MAC_IGNORED.contains(&name);
    assert_eq!(holds_item(&bin(t, "mac-empty", &[".DS_Store", ".localized"]), &accept), Verdict::No);
    assert_eq!(holds_item(&bin(t, "mac-full", &[".DS_Store", "notes.txt"]), &accept), Verdict::Yes);
  }

  #[test]
  fn stops_at_the_first_hit() {
    let tmp = tempfile::tempdir().unwrap();
    let mut names = vec!["$RAAA.txt".to_string()];
    names.extend((0..400).map(|i| format!("filler-{i}.txt")));
    let refs: Vec<&str> = names.iter().map(String::as_str).collect();
    let dir = bin(tmp.path(), "big", &refs);
    let seen = std::cell::Cell::new(0);
    let verdict = holds_item(&dir, &|n| {
      seen.set(seen.get() + 1);
      is_deleted_item(n)
    });
    assert_eq!(verdict, Verdict::Yes);
    assert!(seen.get() < names.len(), "looked at {} of {}", seen.get(), names.len());
  }

  #[test]
  fn answers_fast_enough_to_repaint_an_icon_with() {
    let _ = state();
    let started = std::time::Instant::now();
    for _ in 0..20 {
      let _ = state();
    }
    let each = started.elapsed().as_secs_f64() * 1000.0 / 20.0;
    assert!(each < 25.0, "{each:.2} ms per probe");
  }

  #[test]
  fn reports_once_at_the_start_then_stays_quiet() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let s = seen.clone();
    let w = watch(move |info| s.lock().unwrap().push(info));
    thread::sleep(Duration::from_millis(900));
    w.stop();
    w.stop(); // can be stopped more than once
    assert_eq!(seen.lock().unwrap().len(), 1, "reported {:?} while idle", seen.lock().unwrap());
  }
}
