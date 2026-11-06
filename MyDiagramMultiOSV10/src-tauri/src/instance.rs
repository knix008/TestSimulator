//! Any number of MyDiagram windows may run side by side. The first copy holds
//! this lock and is the primary one: it alone restores the last session and
//! remembers the window place, so that the copies do not overwrite each other.
//!
//! The lock is an OS file lock on `mydiagram-<user>.lock` in the temporary
//! folder: it is released by the OS when the first copy ends, even after a
//! crash, so a stale file never makes a later start secondary.
use std::fs::{File, OpenOptions};
use std::path::PathBuf;

pub struct InstanceLock {
    _file: File,
}

fn lock_path() -> PathBuf {
    let dir = std::env::var_os("MYDIAGRAM_LOCK_DIR").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_else(|_| "user".into());
    let user: String = user.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
    dir.join(format!("mydiagram-{user}.lock"))
}

/// Takes the lock, or returns `None` when another copy holds it.
pub fn acquire() -> Option<InstanceLock> {
    acquire_at(&lock_path())
}

pub fn acquire_at(path: &std::path::Path) -> Option<InstanceLock> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let file = OpenOptions::new().create(true).truncate(false).read(true).write(true).open(path).ok()?;
    match file.try_lock() {
        Ok(()) => Some(InstanceLock { _file: file }),
        Err(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_first_copy_is_primary_until_it_ends() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.lock");
        let first = acquire_at(&path).expect("first copy gets the lock");
        assert!(acquire_at(&path).is_none(), "a second copy is secondary");
        drop(first);
        assert!(acquire_at(&path).is_some(), "the next copy is primary once the first ends");
    }
}
