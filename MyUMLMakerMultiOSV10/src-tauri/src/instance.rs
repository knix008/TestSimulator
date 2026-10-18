//! Several MyUMLMaker copies may run at once: every start opens its own main
//! window. This module only tells a start whether other copies are running, so
//! that just the first one restores the previous session (src/app.js
//! restoreSession) and a later one opens its window a little offset
//! (`cascade`) instead of exactly over the first.
//!
//! Each running copy holds an OS file lock on `<pid>.lock` in a per-user folder
//! (`myumlmaker-<user>` in the temporary folder). A start counts the lock files
//! that are still locked; a file that can be locked belongs to a copy that has
//! ended (even after a crash the OS releases the lock) and is removed. The
//! counting is done while holding `startup.lock`, so two copies started at the
//! same moment never both believe they are the first.
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};

const GATE: &str = "startup.lock";

pub struct Instance {
    _file: File,
    /// Other copies running when this one started.
    pub others: usize,
}

impl Instance {
    pub fn is_first(&self) -> bool {
        self.others == 0
    }
}

fn lock_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("MYUMLMAKER_LOCK_DIR") {
        return PathBuf::from(dir);
    }
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_else(|_| "user".into());
    let user: String = user.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
    std::env::temp_dir().join(format!("myumlmaker-{user}"))
}

fn open(path: &Path) -> Option<File> {
    OpenOptions::new().create(true).truncate(false).read(true).write(true).open(path).ok()
}

/// Registers this process. `None` only when the lock folder cannot be used;
/// the caller then behaves as the first copy.
pub fn register() -> Option<Instance> {
    register_in(&lock_dir(), std::process::id())
}

pub fn register_in(dir: &Path, pid: u32) -> Option<Instance> {
    std::fs::create_dir_all(dir).ok()?;
    // Serialises the starts; released when `gate` is dropped at the end.
    let gate = open(&dir.join(GATE));
    if let Some(gate) = &gate {
        let _ = gate.lock();
    }
    let own_name = format!("{pid}.lock");
    let file = open(&dir.join(&own_name))?;
    file.try_lock().ok()?;
    let mut others = 0;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".lock") || name == GATE || name == own_name {
            continue;
        }
        let Some(other) = open(&entry.path()) else { continue };
        match other.try_lock() {
            Ok(()) => {
                // Left behind by a copy that has ended.
                drop(other);
                let _ = std::fs::remove_file(entry.path());
            }
            Err(_) => others += 1,
        }
    }
    drop(gate);
    Some(Instance { _file: file, others })
}

/// Where a later copy opens its window: `step` px further right and down per
/// copy that runs already, starting again at the top-left of the work area when
/// the window would leave it. Physical pixels.
pub fn cascade(position: (i32, i32), size: (u32, u32), area: (i32, i32, u32, u32), step: i32, copies: usize) -> (i32, i32) {
    let (ax, ay, aw, ah) = (area.0, area.1, area.2 as i32, area.3 as i32);
    let (w, h) = (size.0 as i32, size.1 as i32);
    let (mut x, mut y) = position;
    for _ in 0..copies {
        x += step;
        y += step;
        if x + w > ax + aw {
            x = ax;
        }
        if y + h > ay + ah {
            y = ay;
        }
    }
    // Never left of / above the work area (the title row must stay reachable).
    (x.max(ax).min((ax + aw - 120).max(ax)), y.max(ay).min((ay + ah - 120).max(ay)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_the_copies_that_are_running() {
        let dir = tempfile::tempdir().unwrap();
        let first = register_in(dir.path(), 101).expect("first copy");
        assert!(first.is_first());
        let second = register_in(dir.path(), 102).expect("a second copy starts too");
        assert_eq!(second.others, 1, "it sees the first");
        assert!(!second.is_first());
        let third = register_in(dir.path(), 103).unwrap();
        assert_eq!(third.others, 2);
        drop(first);
        drop(second);
        let fourth = register_in(dir.path(), 104).unwrap();
        assert_eq!(fourth.others, 1, "ended copies are not counted");
        assert!(!dir.path().join("101.lock").exists(), "and their lock files are cleaned up");
        drop(third);
        drop(fourth);
        assert!(register_in(dir.path(), 105).unwrap().is_first(), "alone again: first");
    }

    #[test]
    fn later_windows_are_offset_and_stay_on_screen() {
        let area = (0, 0, 1920, 1080);
        assert_eq!(cascade((100, 80), (1480, 900), area, 32, 0), (100, 80), "the first copy is not moved");
        assert_eq!(cascade((100, 80), (1480, 900), area, 32, 1), (132, 112));
        assert_eq!(cascade((100, 80), (1480, 900), area, 32, 2), (164, 144));
        // Near the edge: starts again at the top-left of the work area.
        assert_eq!(cascade((420, 100), (1480, 900), area, 32, 1), (0, 132));
        assert_eq!(cascade((420, 200), (1480, 900), area, 32, 1), (0, 0));
        // Second monitor on the left; a window larger than the screen.
        assert_eq!(cascade((-1280, 0), (1000, 700), (-1280, 0, 1280, 1024), 32, 1), (-1248, 32));
        assert_eq!(cascade((0, 0), (3000, 2000), area, 32, 3), (0, 0));
    }
}
