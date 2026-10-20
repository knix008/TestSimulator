use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, UNIX_EPOCH};

use walkdir::WalkDir;

use crate::error::DeskError;
use crate::inclusion::{normalize_stored_path, path_is_under, should_skip_directory_name};
use crate::model::{FileEntry, IndexProgress};
use crate::store::IndexStore;

#[derive(Debug)]
pub enum ScanRootError {
    Failed,
    Cancelled,
}

pub trait RootScan {
    fn scan_root(
        &mut self,
        root: &Path,
        cancel: &AtomicBool,
        emit: &mut dyn FnMut(FileEntry),
    ) -> Result<(), ScanRootError>;
}

#[derive(Clone, Debug)]
pub struct FsScanner {
    pub excluded: Vec<String>,
    pub case_insensitive: bool,
    pub skip_prefix: Option<String>,
}

impl RootScan for FsScanner {
    fn scan_root(
        &mut self,
        root: &Path,
        cancel: &AtomicBool,
        emit: &mut dyn FnMut(FileEntry),
    ) -> Result<(), ScanRootError> {
        scan_filesystem(
            root,
            &self.excluded,
            self.case_insensitive,
            self.skip_prefix.as_deref(),
            cancel,
            emit,
        )
    }
}

pub struct PassResult {
    pub failed: Vec<PathBuf>,
    pub cancelled: bool,
    pub indexed: u64,
    pub updated: u64,
}

pub fn index_into<S: RootScan>(
    store: &IndexStore,
    roots: &[PathBuf],
    scanner: &mut S,
    rounds: u32,
    retry_delay: Duration,
    cancel: &AtomicBool,
    mut progress: impl FnMut(&IndexProgress) -> bool,
) -> Result<PassResult, DeskError> {
    let rounds = rounds.max(1);
    let mut pending: Vec<PathBuf> = roots.to_vec();
    let total = pending.len().max(1) as u64;
    let mut indexed = 0_u64;
    let mut updated = 0_u64;
    let mut completed = 0_u64;

    for round in 0..rounds {
        if pending.is_empty() || cancel.load(Ordering::Relaxed) {
            break;
        }
        if round > 0 && !retry_delay.is_zero() {
            std::thread::sleep(retry_delay);
        }
        let current = std::mem::take(&mut pending);
        for root in current {
            if cancel.load(Ordering::Relaxed) {
                return Ok(PassResult {
                    failed: Vec::new(),
                    cancelled: true,
                    indexed,
                    updated,
                });
            }
            let batch = std::cell::RefCell::new(Vec::<FileEntry>::new());
            let error = std::cell::RefCell::new(None::<DeskError>);
            let last_report = std::cell::Cell::new(Instant::now() - Duration::from_secs(1));
            let indexed_in_root = std::cell::Cell::new(0_u64);
            let scan_result = scanner.scan_root(&root, cancel, &mut |entry| {
                if error.borrow().is_some() || cancel.load(Ordering::Relaxed) {
                    return;
                }
                indexed += 1;
                indexed_in_root.set(indexed_in_root.get() + 1);
                let ready = {
                    let mut batch = batch.borrow_mut();
                    batch.push(entry);
                    if batch.len() >= 256 {
                        Some(std::mem::take(&mut *batch))
                    } else {
                        None
                    }
                };
                if let Some(ready) = ready {
                    match store.upsert(&ready) {
                        Ok(changed) => updated += changed,
                        Err(err) => *error.borrow_mut() = Some(err),
                    }
                }
                if last_report.get().elapsed() >= Duration::from_millis(200) {
                    last_report.set(Instant::now());
                    if !progress(&IndexProgress {
                        phase: crate::model::IndexPhase::Scanning,
                        indexed,
                        updated,
                        percent: scan_percent(completed, total, indexed_in_root.get()),
                    }) {
                        cancel.store(true, Ordering::Relaxed);
                    }
                }
            });
            if let Some(err) = error.into_inner() {
                return Err(err);
            }
            let mut remaining = batch.into_inner();
            if !remaining.is_empty() {
                updated += store.upsert(&remaining)?;
                remaining.clear();
            }
            match scan_result {
                Ok(()) => {
                    completed += 1;
                    let percent = ((completed * 90) / total).min(90) as u8;
                    if !progress(&IndexProgress {
                        phase: crate::model::IndexPhase::Scanning,
                        indexed,
                        updated,
                        percent,
                    }) {
                        cancel.store(true, Ordering::Relaxed);
                        return Ok(PassResult {
                            failed: Vec::new(),
                            cancelled: true,
                            indexed,
                            updated,
                        });
                    }
                }
                Err(ScanRootError::Cancelled) => {
                    return Ok(PassResult {
                        failed: Vec::new(),
                        cancelled: true,
                        indexed,
                        updated,
                    });
                }
                Err(ScanRootError::Failed) => pending.push(root),
            }
        }
    }

    Ok(PassResult {
        failed: pending,
        cancelled: cancel.load(Ordering::Relaxed),
        indexed,
        updated,
    })
}

pub fn scan_filesystem(
    root: &Path,
    excluded: &[String],
    case_insensitive: bool,
    skip_prefix: Option<&str>,
    cancel: &AtomicBool,
    emit: &mut dyn FnMut(FileEntry),
) -> Result<(), ScanRootError> {
    if !root.exists() {
        return Err(ScanRootError::Failed);
    }
    let walker = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            if cancel.load(Ordering::Relaxed) {
                return false;
            }
            let name = entry.file_name().to_string_lossy();
            if entry.depth() > 0 && entry.file_type().is_dir() && should_skip_directory_name(&name)
            {
                return false;
            }
            let path = entry.path().to_string_lossy().to_string();
            if let Some(skip) = skip_prefix {
                if path_is_under(&normalize_stored_path(&path), skip, case_insensitive) {
                    return false;
                }
            }
            if entry.depth() > 0 && is_excluded(&path, excluded, case_insensitive) {
                return false;
            }
            true
        });

    for item in walker {
        if cancel.load(Ordering::Relaxed) {
            return Err(ScanRootError::Cancelled);
        }
        match item {
            Ok(entry) => {
                if let Some(file) = file_entry_from_path(entry.path()) {
                    emit(file);
                }
            }
            Err(error) => {
                if error.depth() == 0 {
                    return Err(ScanRootError::Failed);
                }
            }
        }
    }
    Ok(())
}

pub fn file_entry_from_path(path: &Path) -> Option<FileEntry> {
    let meta = path.metadata().ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let full = normalize_stored_path(&path.to_string_lossy());
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| full.clone());
    let directory = path
        .parent()
        .map(|parent| normalize_stored_path(&parent.to_string_lossy()))
        .unwrap_or_default();
    Some(FileEntry::new(
        full,
        file_name,
        directory,
        meta.is_dir(),
        modified,
    ))
}

fn scan_percent(completed_roots: u64, total_roots: u64, indexed_in_root: u64) -> u8 {
    let total_roots = total_roots.max(1);
    let start = (completed_roots * 90) / total_roots;
    let end = ((completed_roots + 1) * 90) / total_roots;
    let room = end.saturating_sub(start).saturating_sub(1);
    let bump = (indexed_in_root / 4_000).min(room);
    (start + bump).min(89) as u8
}

fn is_excluded(path: &str, excluded: &[String], case_insensitive: bool) -> bool {
    let stored = normalize_stored_path(path);
    excluded.iter().any(|item| {
        let root =
            crate::inclusion::normalize_directory_display(item).unwrap_or_else(|| item.clone());
        path_is_under(&stored, &root, case_insensitive)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::atomic::AtomicU32;

    struct Flaky {
        failures_left: HashMap<PathBuf, u32>,
        emitted: AtomicU32,
    }

    impl RootScan for Flaky {
        fn scan_root(
            &mut self,
            root: &Path,
            _cancel: &AtomicBool,
            emit: &mut dyn FnMut(FileEntry),
        ) -> Result<(), ScanRootError> {
            let left = self.failures_left.entry(root.to_path_buf()).or_insert(0);
            if *left > 0 {
                *left -= 1;
                return Err(ScanRootError::Failed);
            }
            self.emitted.fetch_add(1, Ordering::Relaxed);
            emit(FileEntry::new(
                root.to_string_lossy().to_string(),
                "ok.txt",
                root.to_string_lossy().to_string(),
                false,
                1,
            ));
            Ok(())
        }
    }

    #[test]
    fn failed_roots_are_retried_then_indexed() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("index.building.db");
        let store = IndexStore::create(&db).unwrap();
        let root = PathBuf::from(if cfg!(windows) { r"C:\data" } else { "/data" });
        let mut scanner = Flaky {
            failures_left: HashMap::from([(root.clone(), 2)]),
            emitted: AtomicU32::new(0),
        };
        let cancel = AtomicBool::new(false);
        let pass = index_into(
            &store,
            &[root],
            &mut scanner,
            3,
            Duration::ZERO,
            &cancel,
            |_| true,
        )
        .unwrap();
        assert!(pass.failed.is_empty());
        assert!(!pass.cancelled);
        assert_eq!(scanner.emitted.load(Ordering::Relaxed), 1);
        assert_eq!(store.count().unwrap(), 1);
    }

    #[test]
    fn root_that_keeps_failing_is_not_completed() {
        let dir = tempfile::tempdir().unwrap();
        let store = IndexStore::create(&dir.path().join("index.building.db")).unwrap();
        let root = PathBuf::from("/missing");
        let mut scanner = Flaky {
            failures_left: HashMap::from([(root.clone(), 9)]),
            emitted: AtomicU32::new(0),
        };
        let pass = index_into(
            &store,
            &[root.clone()],
            &mut scanner,
            3,
            Duration::ZERO,
            &AtomicBool::new(false),
            |_| true,
        )
        .unwrap();
        assert_eq!(pass.failed, vec![root]);
        assert_eq!(store.count().unwrap(), 0);
    }
}
