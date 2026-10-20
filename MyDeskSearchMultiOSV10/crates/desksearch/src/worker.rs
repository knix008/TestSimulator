use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use desksearch_core::model::{FileEntry, IndexOutcome, IndexProgress};
use desksearch_core::sort::SearchResultSortOrder;
use desksearch_core::watch::{apply_fs_event, FsEvent};
use desksearch_core::{
    active_search_db, prepare_startup, reset_databases, run_index_job, search, IndexJob,
    SearchOptions, StartupPlan,
};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

pub enum Command {
    Search {
        query: String,
        case_sensitive: bool,
        use_regex: bool,
        sort: SearchResultSortOrder,
    },
    StartIndex {
        roots: Vec<PathBuf>,
        excluded: Vec<String>,
        fresh: bool,
    },
    Configure {
        roots: Vec<PathBuf>,
        excluded: Vec<String>,
        resync_hours: u32,
    },
    Pause,
    ResetIndex,
    Shutdown,
}

pub enum UiEvent {
    Results(Vec<FileEntry>),
    Progress(IndexProgress),
    Outcome(IndexOutcome),
    Error(String),
    UsingPrevious(bool),
    IndexChanged,
}

struct Scope {
    roots: Vec<PathBuf>,
    excluded: Vec<String>,
    resync_hours: u32,
}

pub fn spawn(
    data_dir: PathBuf,
    cancel: Arc<AtomicBool>,
    roots: Vec<PathBuf>,
    excluded: Vec<String>,
    resync_hours: u32,
) -> (Sender<Command>, Receiver<UiEvent>) {
    let (command_tx, command_rx) = std::sync::mpsc::channel();
    let (event_tx, event_rx) = std::sync::mpsc::channel();
    thread::spawn(move || {
        worker_loop(
            data_dir,
            cancel,
            Scope {
                roots,
                excluded,
                resync_hours,
            },
            command_rx,
            event_tx,
        );
    });
    (command_tx, event_rx)
}

fn worker_loop(
    data_dir: PathBuf,
    cancel: Arc<AtomicBool>,
    mut scope: Scope,
    commands: Receiver<Command>,
    events: Sender<UiEvent>,
) {
    let mut watcher = install_watcher(&scope.roots);
    let startup = prepare_startup(&data_dir);
    if !matches!(startup, StartupPlan::Ready) && !scope.roots.is_empty() {
        run_job(
            &data_dir,
            &scope,
            true,
            &cancel,
            &commands,
            &events,
            &mut watcher,
        );
    }

    let mut pending_watch: Vec<std::path::PathBuf> = Vec::new();
    let mut watch_deadline: Option<Instant> = None;
    loop {
        match commands.recv_timeout(Duration::from_millis(400)) {
            Ok(command) => {
                if !handle_command(
                    command,
                    &data_dir,
                    &mut scope,
                    &cancel,
                    &commands,
                    &events,
                    &mut watcher,
                    &mut pending_watch,
                ) {
                    break;
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        drain_external_watch(&mut watcher, &mut pending_watch);
        if !pending_watch.is_empty() && watch_deadline.is_none() {
            watch_deadline = Some(Instant::now() + Duration::from_millis(800));
        }
        if watch_deadline.is_some_and(|deadline| Instant::now() >= deadline) {
            apply_watch(&data_dir, &scope, &pending_watch, &events);
            pending_watch.clear();
            watch_deadline = None;
        }
        if scope.resync_hours > 0
            && desksearch_core::settings::resync_due(
                desksearch_core::settings::read_index_stamp(&data_dir),
                SystemTime::now(),
                scope.resync_hours,
            )
            && !scope.roots.is_empty()
        {
            run_job(
                &data_dir,
                &scope,
                true,
                &cancel,
                &commands,
                &events,
                &mut watcher,
            );
        }
    }
}

fn handle_command(
    command: Command,
    data_dir: &std::path::Path,
    scope: &mut Scope,
    cancel: &Arc<AtomicBool>,
    commands: &Receiver<Command>,
    events: &Sender<UiEvent>,
    watcher: &mut Option<(RecommendedWatcher, Receiver<Vec<PathBuf>>)>,
    pending_watch: &mut Vec<PathBuf>,
) -> bool {
    match command {
        Command::Shutdown => return false,
        Command::Pause => cancel.store(true, Ordering::Relaxed),
        Command::ResetIndex => {
            cancel.store(true, Ordering::Relaxed);
            reset_databases(data_dir);
            let _ = events.send(UiEvent::Results(Vec::new()));
        }
        Command::Configure {
            roots,
            excluded,
            resync_hours,
        } => {
            scope.roots = roots;
            scope.excluded = excluded;
            scope.resync_hours = resync_hours;
            *watcher = install_watcher(&scope.roots);
        }
        Command::Search {
            query,
            case_sensitive,
            use_regex,
            sort,
        } => perform_search(data_dir, &query, case_sensitive, use_regex, sort, events),
        Command::StartIndex {
            roots,
            excluded,
            fresh,
        } => {
            scope.roots = roots;
            scope.excluded = excluded;
            *watcher = install_watcher(&scope.roots);
            if !scope.roots.is_empty() {
                run_job(data_dir, scope, fresh, cancel, commands, events, watcher);
            }
        }
    }
    drain_external_watch(watcher, pending_watch);
    true
}

fn perform_search(
    data_dir: &std::path::Path,
    query: &str,
    case_sensitive: bool,
    use_regex: bool,
    sort: SearchResultSortOrder,
    events: &Sender<UiEvent>,
) {
    if query.trim().is_empty() {
        let _ = events.send(UiEvent::Results(Vec::new()));
        return;
    }
    let options = SearchOptions {
        case_sensitive,
        use_regex,
        sort,
        ..SearchOptions::default()
    };
    match search(data_dir, query, &options) {
        Ok(results) => {
            let _ = events.send(UiEvent::Results(results));
        }
        Err(error) => {
            let _ = events.send(UiEvent::Error(error.to_string()));
        }
    }
}

fn run_job(
    data_dir: &std::path::Path,
    scope: &Scope,
    fresh: bool,
    cancel: &Arc<AtomicBool>,
    commands: &Receiver<Command>,
    events: &Sender<UiEvent>,
    watcher: &mut Option<(RecommendedWatcher, Receiver<Vec<PathBuf>>)>,
) {
    cancel.store(false, Ordering::Relaxed);
    let using_previous = data_dir.join("index.db").is_file();
    let _ = events.send(UiEvent::UsingPrevious(using_previous && fresh));
    let job = IndexJob {
        data_dir: data_dir.to_path_buf(),
        roots: scope.roots.clone(),
        excluded: scope.excluded.clone(),
        fresh,
        retry_rounds: 3,
        retry_delay: Duration::from_secs(2),
        case_insensitive: cfg!(windows),
        cancel: Arc::clone(cancel),
    };
    let mut pending = Vec::new();
    let outcome = run_index_job(&job, |progress| {
        let _ = events.send(UiEvent::Progress(progress.clone()));
        while let Ok(command) = commands.try_recv() {
            match command {
                Command::Pause | Command::Shutdown => {
                    cancel.store(true, Ordering::Relaxed);
                    return false;
                }
                Command::Search {
                    query,
                    case_sensitive,
                    use_regex,
                    sort,
                } => perform_search(data_dir, &query, case_sensitive, use_regex, sort, events),
                Command::ResetIndex => {
                    cancel.store(true, Ordering::Relaxed);
                    return false;
                }
                other => {
                    let _ = other;
                }
            }
        }
        drain_external_watch(watcher, &mut pending);
        !cancel.load(Ordering::Relaxed)
    });
    match outcome {
        Ok(outcome) => {
            if matches!(outcome, IndexOutcome::Incomplete { .. }) {
                // The full retry is scheduled by the UI after this outcome.
            }
            let _ = events.send(UiEvent::Outcome(outcome));
        }
        Err(error) => {
            let _ = events.send(UiEvent::Error(error.to_string()));
        }
    }
    let _ = pending;
}

fn install_watcher(roots: &[PathBuf]) -> Option<(RecommendedWatcher, Receiver<Vec<PathBuf>>)> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher =
        notify::recommended_watcher(move |result: Result<notify::Event, notify::Error>| {
            let Ok(event) = result else { return };
            if event.paths.is_empty() {
                return;
            }
            let interesting = matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) | EventKind::Any
            );
            if interesting {
                let _ = tx.send(event.paths);
            }
        })
        .ok()?;
    for root in roots {
        let _ = watcher.watch(root, RecursiveMode::Recursive);
    }
    Some((watcher, rx))
}

fn drain_external_watch(
    watcher: &mut Option<(RecommendedWatcher, Receiver<Vec<PathBuf>>)>,
    pending: &mut Vec<PathBuf>,
) {
    let Some((_, rx)) = watcher else { return };
    while let Ok(paths) = rx.try_recv() {
        pending.extend(paths);
    }
}

fn apply_watch(
    data_dir: &std::path::Path,
    scope: &Scope,
    paths: &[PathBuf],
    events: &Sender<UiEvent>,
) {
    let Some(db) = active_search_db(data_dir) else {
        return;
    };
    if db.file_name().and_then(|name| name.to_str()) != Some("index.db") {
        return;
    }
    let Ok(store) = desksearch_core::store::IndexStore::create(&db) else {
        return;
    };
    let policy = desksearch_core::inclusion::InclusionPolicy::new(
        Vec::<String>::new(),
        scope.roots.iter().map(|path| path.display().to_string()),
        scope.excluded.clone(),
        cfg!(windows),
    );
    for path in paths {
        let event = if path.exists() {
            FsEvent::Upsert(path.clone())
        } else {
            FsEvent::Remove(path.clone())
        };
        let _ = apply_fs_event(&store, &event, &policy);
    }
    let _ = events.send(UiEvent::IndexChanged);
}

pub fn scope_roots(settings: &desksearch_core::model::AppSettings) -> Vec<PathBuf> {
    desksearch_core::inclusion::InclusionPolicy::from_settings(settings)
        .scan_roots()
        .iter()
        .map(PathBuf::from)
        .collect()
}
