//! One MyCapture at a time: the running app holds an exclusive lock on a file in
//! its config folder. The OS drops the lock when the process ends, even after a
//! crash, so a stale lock file never blocks the next start.

use std::fs::{File, OpenOptions, TryLockError};
use std::path::Path;

const LOCK_FILE: &str = "mycapture.lock";

pub enum Instance {
    /// This is the only MyCapture; keep the file open for as long as the app runs.
    First(File),
    /// Another MyCapture already holds the lock.
    AlreadyRunning,
}

/// Takes the lock in `dir`. Errors (folder not writable, …) are reported as `First`
/// without a lock: being unable to check must never stop the app from starting.
pub fn acquire(dir: &Path) -> Option<Instance> {
    std::fs::create_dir_all(dir).ok()?;
    let file = OpenOptions::new().create(true).truncate(false).write(true).open(dir.join(LOCK_FILE)).ok()?;
    match file.try_lock() {
        Ok(()) => Some(Instance::First(file)),
        Err(TryLockError::WouldBlock) => Some(Instance::AlreadyRunning),
        Err(TryLockError::Error(_)) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_instance_is_refused_until_the_first_ends() {
        let dir = tempfile::tempdir().unwrap();
        let first = acquire(dir.path());
        assert!(matches!(first, Some(Instance::First(_))));
        assert!(matches!(acquire(dir.path()), Some(Instance::AlreadyRunning)));
        drop(first);
        assert!(matches!(acquire(dir.path()), Some(Instance::First(_))));
    }
}
