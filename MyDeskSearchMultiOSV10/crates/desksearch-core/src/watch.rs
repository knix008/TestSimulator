use std::collections::HashSet;
use std::path::Path;

use crate::error::DeskError;
use crate::inclusion::InclusionPolicy;
use crate::scan::{file_entry_from_path, scan_filesystem};
use crate::store::IndexStore;

#[derive(Clone, Debug)]
pub enum FsEvent {
    Upsert(std::path::PathBuf),
    Remove(std::path::PathBuf),
    Rename {
        from: std::path::PathBuf,
        to: std::path::PathBuf,
    },
}

pub fn apply_fs_event(
    store: &IndexStore,
    event: &FsEvent,
    policy: &InclusionPolicy,
) -> Result<(), DeskError> {
    match event {
        FsEvent::Remove(path) => {
            store.delete_tree(&path.to_string_lossy())?;
        }
        FsEvent::Upsert(path) => upsert_if_allowed(store, path, policy)?,
        FsEvent::Rename { from, to } => {
            store.delete_tree(&from.to_string_lossy())?;
            upsert_if_allowed(store, to, policy)?;
        }
    }
    Ok(())
}

fn upsert_if_allowed(
    store: &IndexStore,
    path: &Path,
    policy: &InclusionPolicy,
) -> Result<(), DeskError> {
    if !policy.allows_path(path) {
        store.delete_tree(&path.to_string_lossy())?;
        return Ok(());
    }
    if let Some(entry) = file_entry_from_path(path) {
        store.upsert(std::slice::from_ref(&entry))?;
    } else {
        store.delete_tree(&path.to_string_lossy())?;
    }
    Ok(())
}

/// Replace the indexed tree under `root` with what is currently on disk.
pub fn reconcile_root(
    store: &IndexStore,
    root: &Path,
    policy: &InclusionPolicy,
) -> Result<u64, DeskError> {
    let mut seen = HashSet::new();
    let mut batch = Vec::new();
    let mut updated = 0_u64;
    if root.exists() {
        let cancel = std::sync::atomic::AtomicBool::new(false);
        scan_filesystem(
            root,
            policy.excluded_prefixes(),
            policy.case_insensitive(),
            None,
            &cancel,
            &mut |entry| {
                if policy.is_path_in_scope(&entry.full_path) {
                    seen.insert(entry.full_path.clone());
                    batch.push(entry);
                }
            },
        )
        .map_err(|_| DeskError::Message(format!("failed to read {}", root.display())))?;
        if !batch.is_empty() {
            updated += store.upsert(&batch)?;
        }
    }
    let indexed = store.paths_under(&root.to_string_lossy())?;
    for path in indexed {
        if !seen.contains(&path) {
            updated += store.delete_tree(&path)?;
        }
    }
    Ok(updated)
}
