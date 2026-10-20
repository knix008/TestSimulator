use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use crate::error::DeskError;
use crate::model::{IndexOutcome, IndexPhase, IndexProgress};
use crate::paths::{building_db, live_db, remove_sqlite_files};
use crate::query::parse_query;
use crate::scan::{index_into, FsScanner};
use crate::settings::{read_index_stamp, write_index_stamp};
use crate::sort::SearchResultSortOrder;
use crate::store::IndexStore;

#[derive(Clone, Debug)]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub use_regex: bool,
    pub sort: SearchResultSortOrder,
    pub limit: usize,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            case_sensitive: false,
            use_regex: false,
            sort: SearchResultSortOrder::MatchQuality,
            limit: crate::memory::MAX_SEARCH_RESULTS,
        }
    }
}

#[derive(Clone, Debug)]
pub struct IndexJob {
    pub data_dir: PathBuf,
    pub roots: Vec<PathBuf>,
    pub excluded: Vec<String>,
    pub fresh: bool,
    pub retry_rounds: u32,
    pub retry_delay: Duration,
    pub case_insensitive: bool,
    pub cancel: Arc<AtomicBool>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartupPlan {
    Ready,
    InitialIndex,
    RescanAfterInterrupt,
}

pub fn active_search_db(data_dir: &Path) -> Option<PathBuf> {
    let live = live_db(data_dir);
    if live.is_file() {
        return Some(live);
    }
    let building = building_db(data_dir);
    if building.is_file() {
        Some(building)
    } else {
        None
    }
}

pub fn discard_building(data_dir: &Path) -> bool {
    let path = building_db(data_dir);
    let existed = path.exists();
    remove_sqlite_files(&path);
    existed
}

pub fn reset_databases(data_dir: &Path) {
    remove_sqlite_files(&live_db(data_dir));
    remove_sqlite_files(&building_db(data_dir));
    let _ = std::fs::remove_file(crate::settings::stamp_path(data_dir));
}

pub fn prepare_startup(data_dir: &Path) -> StartupPlan {
    let interrupted = discard_building(data_dir);
    if interrupted {
        StartupPlan::RescanAfterInterrupt
    } else if live_db(data_dir).is_file() {
        StartupPlan::Ready
    } else {
        StartupPlan::InitialIndex
    }
}

pub fn promote_building(data_dir: &Path) -> Result<(), DeskError> {
    let building = building_db(data_dir);
    let live = live_db(data_dir);
    if !building.is_file() {
        return Err(DeskError::Message("building index is missing".to_string()));
    }
    remove_sqlite_files(&live);
    std::fs::rename(&building, &live)?;
    for suffix in ["-wal", "-shm", "-journal"] {
        let from = PathBuf::from(format!("{}{suffix}", building.display()));
        let to = PathBuf::from(format!("{}{suffix}", live.display()));
        if from.exists() {
            let _ = std::fs::rename(&from, &to);
        }
    }
    Ok(())
}

pub fn search(
    data_dir: &Path,
    query: &str,
    options: &SearchOptions,
) -> Result<Vec<crate::model::FileEntry>, DeskError> {
    let Some(resolved) = parse_query(query, options.use_regex, options.case_sensitive) else {
        return Ok(Vec::new());
    };
    let Some(path) = active_search_db(data_dir) else {
        return Ok(Vec::new());
    };
    let store = IndexStore::open_reader(&path)?;
    store.search(
        &resolved,
        options.case_sensitive,
        options.sort,
        options.limit,
    )
}

pub fn run_index_job(
    job: &IndexJob,
    mut progress: impl FnMut(&IndexProgress) -> bool,
) -> Result<IndexOutcome, DeskError> {
    std::fs::create_dir_all(&job.data_dir)?;
    if job.fresh {
        discard_building(&job.data_dir);
    }
    let building = building_db(&job.data_dir);
    let store = IndexStore::create(&building)?;
    let mut scanner = FsScanner {
        excluded: job.excluded.clone(),
        case_insensitive: job.case_insensitive,
        skip_prefix: Some(normalize_skip(&job.data_dir)),
    };
    let pass = index_into(
        &store,
        &job.roots,
        &mut scanner,
        job.retry_rounds.max(1),
        job.retry_delay,
        &job.cancel,
        &mut progress,
    )?;
    if pass.cancelled || job.cancel.load(Ordering::Relaxed) {
        store.checkpoint()?;
        return Ok(IndexOutcome::Cancelled {
            indexed: pass.indexed,
        });
    }
    if !pass.failed.is_empty() {
        store.checkpoint()?;
        return Ok(IndexOutcome::Incomplete {
            indexed: pass.indexed,
            failed_roots: pass
                .failed
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
        });
    }
    if !progress(&IndexProgress {
        phase: IndexPhase::Analyzing,
        indexed: pass.indexed,
        updated: pass.updated,
        percent: 95,
    }) {
        store.checkpoint()?;
        return Ok(IndexOutcome::Cancelled {
            indexed: pass.indexed,
        });
    }
    store.rebuild_fts()?;
    store.checkpoint()?;
    drop(store);
    if !progress(&IndexProgress {
        phase: IndexPhase::Applying,
        indexed: pass.indexed,
        updated: pass.updated,
        percent: 99,
    }) {
        return Ok(IndexOutcome::Cancelled {
            indexed: pass.indexed,
        });
    }
    promote_building(&job.data_dir)?;
    write_index_stamp(&job.data_dir, SystemTime::now())?;
    let _ = progress(&IndexProgress {
        phase: IndexPhase::Applying,
        indexed: pass.indexed,
        updated: pass.updated,
        percent: 100,
    });
    Ok(IndexOutcome::Promoted {
        indexed: pass.indexed,
    })
}

fn normalize_skip(path: &Path) -> String {
    crate::inclusion::normalize_stored_path(&path.to_string_lossy())
}

pub fn should_retry_incomplete(outcome: &IndexOutcome) -> bool {
    matches!(outcome, IndexOutcome::Incomplete { .. })
}

pub fn stamp_age_ok(data_dir: &Path, now: SystemTime, hours: u32) -> bool {
    crate::settings::resync_due(read_index_stamp(data_dir), now, hours)
}
