use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use desksearch_core::inclusion::InclusionPolicy;
use desksearch_core::model::FileEntry;
use desksearch_core::store::IndexStore;
use desksearch_core::watch::{apply_fs_event, reconcile_root, FsEvent};
use desksearch_core::{
    active_search_db, parse_query, prepare_startup, reset_databases, run_index_job, search,
    search_memory, IndexJob, IndexOutcome, SearchOptions, SearchResultSortOrder, StartupPlan,
    MAX_SEARCH_RESULTS,
};

fn entry(path: &str, name: &str, modified: i64, dir: bool) -> FileEntry {
    let parent = path
        .rsplit_once(['\\', '/'])
        .map(|(parent, _)| parent)
        .unwrap_or("");
    FileEntry::new(path, name, parent, dir, modified)
}

fn sample() -> Vec<FileEntry> {
    vec![
        entry(r"C:\docs\report.pdf", "report.pdf", 10, false),
        entry(r"C:\docs\my-report.pdf", "my-report.pdf", 20, false),
        entry(r"C:\docs\repo.txt", "repo.txt", 30, false),
        entry(r"C:\docs\budget-2024.xlsx", "budget-2024.xlsx", 40, false),
        entry(r"C:\docs\draft.txt", "draft.txt", 50, false),
        entry(r"C:\docs\notes.doc", "notes.doc", 5, false),
        entry(r"C:\docs\readme.pdf", "readme.pdf", 60, false),
        entry(r"C:\docs\file1.txt", "file1.txt", 70, false),
        entry(r"C:\docs\file12.txt", "file12.txt", 80, false),
        entry(r"C:\docs\Photos", "Photos", 15, true),
        entry(r"C:\docs\photo.png", "photo.png", 90, false),
        entry("/data/권수호.txt", "권수호.txt", 11, false),
        entry("/data/日本語.txt", "日本語.txt", 12, false),
    ]
}

fn names(entries: &[FileEntry]) -> Vec<&str> {
    entries
        .iter()
        .map(|entry| entry.file_name.as_str())
        .collect()
}

fn search_names(
    query: &str,
    regex: bool,
    case_sensitive: bool,
    sort: SearchResultSortOrder,
) -> Vec<String> {
    let parsed = parse_query(query, regex, case_sensitive).expect(query);
    search_memory(&sample(), &parsed, case_sensitive, sort, MAX_SEARCH_RESULTS)
        .into_iter()
        .map(|entry| entry.file_name)
        .collect()
}

#[test]
fn readme_search_grammar() {
    assert_eq!(
        search_names("report", false, false, SearchResultSortOrder::NameAsc),
        vec!["my-report.pdf", "report.pdf"]
    );
    assert!(
        !search_names("report", false, false, SearchResultSortOrder::NameAsc)
            .contains(&"repo.txt".to_string())
    );
    assert_eq!(
        search_names("권수호", false, false, SearchResultSortOrder::NameAsc),
        vec!["권수호.txt"]
    );
    assert!(search_names("Report", false, true, SearchResultSortOrder::NameAsc).is_empty());
    assert_eq!(
        search_names("Report", false, false, SearchResultSortOrder::NameAsc).len(),
        2
    );
    assert_eq!(
        search_names(
            "budget * 2024",
            false,
            false,
            SearchResultSortOrder::NameAsc
        ),
        vec!["budget-2024.xlsx"]
    );
    let or_names = search_names("doc + pdf", false, false, SearchResultSortOrder::NameAsc);
    assert!(or_names.contains(&"notes.doc".to_string()));
    assert!(or_names.contains(&"readme.pdf".to_string()));
    assert!(!or_names.contains(&"draft.txt".to_string()));
    assert_eq!(
        search_names(
            "budget * 2024 + draft",
            false,
            false,
            SearchResultSortOrder::NameAsc
        ),
        vec!["budget-2024.xlsx", "draft.txt"]
    );
    assert_eq!(
        search_names("*.pdf", false, false, SearchResultSortOrder::NameAsc)
            .iter()
            .all(|name| name.ends_with(".pdf") || name.ends_with(".PDF")),
        true
    );
    assert!(
        !search_names("*.pdf", false, false, SearchResultSortOrder::NameAsc)
            .iter()
            .any(|name| name == "notes.doc")
    );
    assert_eq!(
        search_names("file?.txt", false, false, SearchResultSortOrder::NameAsc),
        vec!["file1.txt"]
    );
    assert_eq!(
        search_names("foo+bar", false, false, SearchResultSortOrder::NameAsc),
        Vec::<String>::new()
    );
    assert!(parse_query("   ", false, false).is_none());
    assert_eq!(
        search_names(r"\.pdf$", true, false, SearchResultSortOrder::NameAsc)
            .iter()
            .all(|n| n.ends_with(".pdf")),
        true
    );
    assert_eq!(
        search_names(r"^report", true, false, SearchResultSortOrder::NameAsc),
        vec!["report.pdf"]
    );
    assert!(parse_query("(", true, false).is_none());
    assert_eq!(
        search_names(
            r"C:\docs\readme.pdf",
            false,
            false,
            SearchResultSortOrder::NameAsc
        ),
        vec!["readme.pdf"]
    );
}

#[test]
fn sort_orders_match_the_settings() {
    let mut entries = sample();
    entries.push(entry("/data/o.txt", "o.txt", 1, false));
    let parsed = parse_query("o", false, false).unwrap();
    let ranked = search_memory(
        &entries,
        &parsed,
        false,
        SearchResultSortOrder::MatchQuality,
        20,
    );
    assert_eq!(ranked[0].file_name, "o.txt");
    let by_name = search_memory(
        &entries,
        &parsed,
        false,
        SearchResultSortOrder::NameDesc,
        20,
    );
    let actual: Vec<_> = by_name
        .iter()
        .map(|entry| entry.file_name.to_lowercase())
        .collect();
    let mut expected = actual.clone();
    expected.sort();
    expected.reverse();
    assert_eq!(actual, expected);
    let folders = search_memory(
        &entries,
        &parsed,
        false,
        SearchResultSortOrder::FoldersFirst,
        20,
    );
    assert!(folders[0].is_directory);
    let files = search_memory(
        &entries,
        &parsed,
        false,
        SearchResultSortOrder::FilesFirst,
        20,
    );
    assert!(!files[0].is_directory);
    let newest = search_memory(
        &entries,
        &parsed,
        false,
        SearchResultSortOrder::ModifiedDesc,
        20,
    );
    assert_eq!(newest[0].file_name, "photo.png");
}

#[test]
fn sqlite_matches_memory_and_keeps_a_result_cap() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("index.db");
    let store = IndexStore::create(&db).unwrap();
    store.upsert(&sample()).unwrap();
    let options = SearchOptions {
        sort: SearchResultSortOrder::NameAsc,
        ..SearchOptions::default()
    };
    let from_sql = store
        .search(
            &parse_query("report", false, false).unwrap(),
            false,
            options.sort,
            20,
        )
        .unwrap();
    let from_memory = search_memory(
        &sample(),
        &parse_query("report", false, false).unwrap(),
        false,
        options.sort,
        20,
    );
    assert_eq!(names(&from_sql), names(&from_memory));

    let mut many = Vec::new();
    for index in 0..2_005 {
        many.push(entry(
            &format!("/tmp/match-{index:04}.txt"),
            &format!("match-{index:04}.txt"),
            index as i64,
            false,
        ));
    }
    store.upsert(&many).unwrap();
    let capped = store
        .search(
            &parse_query("match", false, false).unwrap(),
            false,
            SearchResultSortOrder::NameAsc,
            MAX_SEARCH_RESULTS,
        )
        .unwrap();
    assert_eq!(capped.len(), MAX_SEARCH_RESULTS);
    let _ = options;
}

#[test]
fn dual_database_search_uses_live_until_promotion() {
    let dir = tempfile::tempdir().unwrap();
    let live = IndexStore::create(&dir.path().join("index.db")).unwrap();
    live.upsert(&[entry("/data/old.txt", "old.txt", 1, false)])
        .unwrap();
    live.checkpoint().unwrap();
    drop(live);

    let building = IndexStore::create(&dir.path().join("index.building.db")).unwrap();
    building
        .upsert(&[entry("/data/new.txt", "new.txt", 2, false)])
        .unwrap();
    building.checkpoint().unwrap();
    drop(building);

    assert_eq!(
        active_search_db(dir.path()).unwrap().file_name().unwrap(),
        "index.db"
    );
    let hits = search(dir.path(), "txt", &SearchOptions::default()).unwrap();
    assert_eq!(names(&hits), vec!["old.txt"]);

    desksearch_core::promote_building(dir.path()).unwrap();
    assert!(!dir.path().join("index.building.db").exists());
    let hits = search(dir.path(), "txt", &SearchOptions::default()).unwrap();
    assert_eq!(names(&hits), vec!["new.txt"]);
}

#[test]
fn full_index_reset_and_interrupted_startup() {
    let data = tempfile::tempdir().unwrap();
    let tree = tempfile::tempdir().unwrap();
    fs::write(tree.path().join("report.pdf"), "x").unwrap();
    fs::create_dir(tree.path().join("Photos")).unwrap();
    fs::write(tree.path().join("Photos").join("photo.png"), "x").unwrap();
    fs::write(tree.path().join("secret.txt"), "x").unwrap();
    let secret = tree.path().join("hidden");
    fs::create_dir(&secret).unwrap();
    fs::write(secret.join("skip.txt"), "x").unwrap();

    let job = IndexJob {
        data_dir: data.path().to_path_buf(),
        roots: vec![tree.path().to_path_buf()],
        excluded: vec![secret.to_string_lossy().to_string()],
        fresh: true,
        retry_rounds: 3,
        retry_delay: Duration::ZERO,
        case_insensitive: cfg!(windows),
        cancel: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let outcome = run_index_job(&job, |_| true).unwrap();
    assert!(matches!(outcome, IndexOutcome::Promoted { .. }));
    assert!(data.path().join("index.db").is_file());
    assert!(!data.path().join("index.building.db").exists());
    let hits = search(data.path(), "report", &SearchOptions::default()).unwrap();
    assert_eq!(hits.len(), 1);
    assert!(search(data.path(), "skip", &SearchOptions::default())
        .unwrap()
        .is_empty());
    assert!(!search(data.path(), "photo", &SearchOptions::default())
        .unwrap()
        .is_empty());

    fs::write(tree.path().join("added-note.txt"), "x").unwrap();
    fs::remove_file(tree.path().join("report.pdf")).unwrap();
    let policy = InclusionPolicy::new(
        Vec::<String>::new(),
        [tree.path().to_string_lossy().to_string()],
        [&secret.to_string_lossy().to_string()],
        cfg!(windows),
    );
    let store = IndexStore::create(&data.path().join("index.db")).unwrap();
    reconcile_root(&store, tree.path(), &policy).unwrap();
    drop(store);
    assert!(
        search(data.path(), "added-note", &SearchOptions::default())
            .unwrap()
            .len()
            == 1
    );
    assert!(search(data.path(), "report", &SearchOptions::default())
        .unwrap()
        .is_empty());

    let store = IndexStore::create(&data.path().join("index.db")).unwrap();
    apply_fs_event(
        &store,
        &FsEvent::Remove(tree.path().join("added-note.txt")),
        &policy,
    )
    .unwrap();
    drop(store);
    assert!(search(data.path(), "added-note", &SearchOptions::default())
        .unwrap()
        .is_empty());

    fs::write(data.path().join("index.building.db"), "partial").unwrap();
    assert_eq!(
        prepare_startup(data.path()),
        StartupPlan::RescanAfterInterrupt
    );
    assert!(!data.path().join("index.building.db").exists());

    reset_databases(data.path());
    assert!(search(data.path(), "photo", &SearchOptions::default())
        .unwrap()
        .is_empty());
    assert_eq!(prepare_startup(data.path()), StartupPlan::InitialIndex);
}

#[test]
fn missing_root_does_not_promote() {
    let data = tempfile::tempdir().unwrap();
    let missing = PathBuf::from(if cfg!(windows) {
        r"C:\no-such-desksearch-root"
    } else {
        "/no-such-desksearch-root"
    });
    let outcome = run_index_job(
        &IndexJob {
            data_dir: data.path().to_path_buf(),
            roots: vec![missing],
            excluded: Vec::new(),
            fresh: true,
            retry_rounds: 3,
            retry_delay: Duration::ZERO,
            case_insensitive: true,
            cancel: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        },
        |_| true,
    )
    .unwrap();
    assert!(matches!(outcome, IndexOutcome::Incomplete { .. }));
    assert!(!data.path().join("index.db").exists());
    assert!(desksearch_core::should_retry_incomplete(&outcome));
}

#[test]
fn resync_stamp_is_written_after_a_successful_index() {
    let data = tempfile::tempdir().unwrap();
    let tree = tempfile::tempdir().unwrap();
    fs::write(tree.path().join("a.txt"), "x").unwrap();
    run_index_job(
        &IndexJob {
            data_dir: data.path().to_path_buf(),
            roots: vec![tree.path().to_path_buf()],
            excluded: Vec::new(),
            fresh: true,
            retry_rounds: 1,
            retry_delay: Duration::ZERO,
            case_insensitive: cfg!(windows),
            cancel: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        },
        |_| true,
    )
    .unwrap();
    let stamp = desksearch_core::settings::read_index_stamp(data.path()).unwrap();
    let age = SystemTime::now()
        .duration_since(stamp)
        .unwrap_or(Duration::ZERO);
    assert!(age < Duration::from_secs(30));
    assert!(!desksearch_core::settings::resync_due(
        Some(UNIX_EPOCH + Duration::from_secs(10)),
        UNIX_EPOCH + Duration::from_secs(20),
        8
    ));
}
