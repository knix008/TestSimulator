//! Everything done to an archive after it exists, and the tools beside it.

mod common;
use common::*;
use std::path::Path;
use std::sync::Arc;
use zipmaster_core::ops::{self, ExtractOptions, ListOptions, ModifyOptions, Rename, SourceSpec, TestOptions};
use zipmaster_core::tools::{self, BenchmarkOptions, HashOptions};
use zipmaster_core::{Ctx, Fs, OsFs};

// ── Extract options ───────────────────────────────────────────────────────────────────────────

fn ready(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let dir = scratch(name);
    let src = dir.join("src");
    sample_tree(&src);
    let a = dir.join("a.zip");
    pack(&a, "zip", &[&src.join("data")], |_| {});
    (dir, a)
}

fn run(a: &Path, dest: &Path, tweak: impl FnOnce(&mut ExtractOptions)) -> ops::ExtractReport {
    let mut o = ExtractOptions { path: s(a), dest: s(dest), ..ExtractOptions::default() };
    tweak(&mut o);
    ops::extract(&ctx(), &o).unwrap()
}

#[test]
fn extract_selected_files_and_folders() {
    let (dir, a) = ready("x-select");
    let dest = dir.join("o");
    let r = run(&a, &dest, |o| o.selection = vec!["data/readme.txt".into(), "data/deep".into()]);
    let tree = read_tree(&dest);
    assert_eq!(tree.len(), 2, "{:?}", tree.keys());
    assert!(tree.contains_key("data/readme.txt"));
    assert!(tree.contains_key("data/deep/a/b/c/d/nested.log"));
    assert_eq!(r.files, 2);
}

#[test]
fn selecting_a_folder_does_not_match_a_longer_name() {
    let dir = scratch("x-prefix");
    std::fs::create_dir_all(dir.join("s/ab")).unwrap();
    std::fs::create_dir_all(dir.join("s/abc")).unwrap();
    std::fs::write(dir.join("s/ab/1.txt"), b"1").unwrap();
    std::fs::write(dir.join("s/abc/2.txt"), b"2").unwrap();
    let a = dir.join("a.zip");
    pack(&a, "zip", &[&dir.join("s")], |_| {});
    let dest = dir.join("o");
    run(&a, &dest, |o| o.selection = vec!["s/ab".into()]);
    assert_eq!(read_tree(&dest).keys().cloned().collect::<Vec<_>>(), vec!["s/ab/1.txt"]);
}

#[test]
fn extract_from_inside_a_folder_drops_its_path() {
    let (dir, a) = ready("x-strip");
    let dest = dir.join("o");
    run(&a, &dest, |o| {
        o.selection = vec!["data/deep/a/b".into()];
        o.strip_prefix = Some("data/deep/a".into());
    });
    assert!(dest.join("b/c/d/nested.log").exists());
}

#[test]
fn extract_flat_ignores_folders() {
    let (dir, a) = ready("x-flat");
    let dest = dir.join("o");
    run(&a, &dest, |o| o.flatten = true);
    assert!(dest.join("nested.log").exists());
    assert!(dest.join("보고서.txt").exists());
    assert!(!dest.join("data").exists());
}

#[test]
fn overwrite_modes() {
    let (dir, a) = ready("x-over");
    let dest = dir.join("o");
    run(&a, &dest, |_| {});
    let target = dest.join("data/readme.txt");
    let original = std::fs::read(&target).unwrap();

    let conflicts = ops::conflicts(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dest), ..ExtractOptions::default() }).unwrap();
    assert_eq!(conflicts.len(), 6, "{conflicts:?}");
    let none = ops::conflicts(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dir.join("fresh")), ..ExtractOptions::default() }).unwrap();
    assert!(none.is_empty());

    // Skip leaves ours.
    std::fs::write(&target, b"mine").unwrap();
    let r = run(&a, &dest, |o| o.overwrite = Some("skip".into()));
    assert_eq!(std::fs::read(&target).unwrap(), b"mine");
    assert_eq!(r.skipped.len(), 6);
    assert_eq!(r.files, 0);

    // Rename keeps both.
    let r = run(&a, &dest, |o| o.overwrite = Some("rename".into()));
    assert_eq!(std::fs::read(&target).unwrap(), b"mine");
    assert_eq!(std::fs::read(dest.join("data/readme (1).txt")).unwrap(), original);
    assert_eq!(r.renamed.len(), 6);
    let r = run(&a, &dest, |o| {
        o.overwrite = Some("rename".into());
        o.selection = vec!["data/readme.txt".into()];
    });
    assert_eq!(r.renamed, vec!["readme (2).txt".to_string()]);

    // Update only replaces what is older.
    filetime::set_file_mtime(&target, filetime::FileTime::from_unix_time(2_000_000_000, 0)).unwrap();
    let r = run(&a, &dest, |o| {
        o.overwrite = Some("update".into());
        o.selection = vec!["data/readme.txt".into()];
    });
    assert_eq!(r.skipped.len(), 1);
    assert_eq!(std::fs::read(&target).unwrap(), b"mine");
    filetime::set_file_mtime(&target, filetime::FileTime::from_unix_time(1_000_000_000, 0)).unwrap();
    let r = run(&a, &dest, |o| {
        o.overwrite = Some("update".into());
        o.selection = vec!["data/readme.txt".into()];
    });
    assert_eq!(r.files, 1);
    assert_eq!(std::fs::read(&target).unwrap(), original);

    // Overwrite is the default.
    std::fs::write(&target, b"mine").unwrap();
    run(&a, &dest, |o| o.selection = vec!["data/readme.txt".into()]);
    assert_eq!(std::fs::read(&target).unwrap(), original);
}

#[test]
fn read_entry_returns_bytes_and_honors_the_limit() {
    let (dir, a) = ready("x-read");
    let path = s(&a);
    let c = ctx();
    let all = ops::read_entry(&c, &ops::ReadEntryOptions { path: path.clone(), entry: "data/readme.txt".into(), ..Default::default() }).unwrap();
    assert_eq!(all, text(20_000));
    let some = ops::read_entry(&c, &ops::ReadEntryOptions { path: path.clone(), entry: "data/readme.txt".into(), limit: Some(100), ..Default::default() }).unwrap();
    assert_eq!(some.len(), 100);
    let e = ops::read_entry(&c, &ops::ReadEntryOptions { path, entry: "no/such".into(), ..Default::default() }).unwrap_err();
    assert_eq!(e.code(), "invalid");
    let _ = dir;
}

// ── Output safety ─────────────────────────────────────────────────────────────────────────────

#[test]
fn existing_output_is_kept_unless_overwriting() {
    let dir = scratch("c-exists");
    let f = dir.join("a.txt");
    std::fs::write(&f, b"new").unwrap();
    let a = dir.join("a.zip");
    std::fs::write(&a, b"precious").unwrap();
    let e = try_pack(&a, "zip", &[&f], |_| {}).unwrap_err();
    assert_eq!(e.code(), "exists");
    assert_eq!(std::fs::read(&a).unwrap(), b"precious");
    pack(&a, "zip", &[&f], |o| o.overwrite = true);
    assert_eq!(listing(&a, None).entries[0].path, "a.txt");
}

fn cancelled_ctx(updates: u64) -> Ctx {
    let fs: Fs = Arc::new(OsFs);
    Ctx::new(fs, CancelAfter::new(updates))
}

#[test]
fn cancelling_a_create_leaves_nothing_and_keeps_the_old_file() {
    let dir = scratch("c-cancel");
    let f = dir.join("big.bin");
    std::fs::write(&f, noise(4_000_000, 1)).unwrap();
    for (format, ext) in [("zip", "zip"), ("7z", "7z"), ("rar", "rar"), ("tar.gz", "tar.gz"), ("tar.zst", "tar.zst")] {
        // A plain output, with something already there.
        let a = dir.join(format!("c.{ext}"));
        std::fs::write(&a, b"old").unwrap();
        let o = ops::CreateOptions {
            output: s(&a),
            format: format.into(),
            sources: vec![SourceSpec { path: s(&f), name: None }],
            overwrite: true,
            ..Default::default()
        };
        let e = ops::create(&cancelled_ctx(2), &o).unwrap_err();
        assert_eq!(e.code(), "cancelled", "{format}: {e}");
        assert_eq!(std::fs::read(&a).unwrap(), b"old", "{format}: the old file must survive");
        assert!(!Path::new(&format!("{}.zmtmp", s(&a))).exists(), "{format}: temp left");

        // A split set: no parts remain.
        let v = dir.join(format!("v.{ext}"));
        let o = ops::CreateOptions {
            output: s(&v),
            format: format.into(),
            sources: vec![SourceSpec { path: s(&f), name: None }],
            volume_size: Some(256 * 1024),
            ..Default::default()
        };
        let e = ops::create(&cancelled_ctx(2), &o).unwrap_err();
        assert_eq!(e.code(), "cancelled", "{format} split: {e}");
    }
    let leftovers: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|i| i.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n.contains(".part") || n.contains(".z0") || n.ends_with(".001") || n.starts_with("v."))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

/// Multi-threaded LZMA2 has read its whole source long before it has written anything, so cancelling
/// then is only noticed on the way out. It must still be noticed, and soon.
#[test]
fn cancelling_after_the_source_is_read_still_stops() {
    struct AfterRead(Arc<std::sync::atomic::AtomicBool>);
    impl zipmaster_core::Progress for AfterRead {
        fn update(&self, done: u64, total: u64, _: &str) {
            if done >= total {
                self.0.store(true, std::sync::atomic::Ordering::Relaxed);
            }
        }
        fn cancelled(&self) -> bool {
            self.0.load(std::sync::atomic::Ordering::Relaxed)
        }
    }
    let dir = scratch("c-cancel-mt");
    let f = dir.join("big.bin");
    std::fs::write(&f, noise(30_000_000, 2)).unwrap();
    let a = dir.join("m.7z");
    let fs: Fs = Arc::new(OsFs);
    let mut c = Ctx::new(fs, Arc::new(AfterRead(Arc::new(std::sync::atomic::AtomicBool::new(false)))));
    c.threads = 8;
    let o = ops::CreateOptions { output: s(&a), format: "7z".into(), level: Some(9), sources: vec![SourceSpec { path: s(&f), name: None }], ..Default::default() };
    let t0 = std::time::Instant::now();
    let e = ops::create(&c, &o).unwrap_err();
    assert_eq!(e.code(), "cancelled", "{e}");
    assert!(!a.exists());
    assert!(!dir.join("m.7z.zmtmp").exists());
    assert!(t0.elapsed().as_secs() < 20, "took {:?}", t0.elapsed());
}

#[test]
fn cancelling_an_extract_removes_the_partial_file() {
    let dir = scratch("c-cancel-x");
    let f = dir.join("big.bin");
    std::fs::write(&f, noise(8_000_000, 2)).unwrap();
    for (format, ext) in [("zip", "zip"), ("7z", "7z"), ("rar", "rar"), ("tar", "tar")] {
        let a = dir.join(format!("a.{ext}"));
        pack(&a, format, &[&f], |_| {});
        let dest = dir.join(format!("o-{ext}"));
        let e = ops::extract(&cancelled_ctx(1), &ExtractOptions { path: s(&a), dest: s(&dest), ..ExtractOptions::default() }).unwrap_err();
        assert_eq!(e.code(), "cancelled", "{format}: {e}");
        assert!(!dest.join("big.bin").exists(), "{format}: partial file kept");
    }
}

#[test]
fn progress_reaches_the_total() {
    let dir = scratch("c-progress");
    let f = dir.join("a.bin");
    std::fs::write(&f, noise(1_000_000, 1)).unwrap();
    let rec = Arc::new(Recorder::default());
    let fs: Fs = Arc::new(OsFs);
    let c = Ctx::new(fs, rec.clone());
    let a = dir.join("a.zip");
    ops::create(&c, &ops::CreateOptions { output: s(&a), format: "zip".into(), sources: vec![SourceSpec { path: s(&f), name: None }], ..Default::default() }).unwrap();
    use std::sync::atomic::Ordering::Relaxed;
    assert_eq!(rec.total.load(Relaxed), 1_000_000);
    assert_eq!(rec.done.load(Relaxed), 1_000_000);
    assert!(rec.calls.load(Relaxed) >= 2);
    let rec2 = Arc::new(Recorder::default());
    let fs: Fs = Arc::new(OsFs);
    let c = Ctx::new(fs, rec2.clone());
    ops::extract(&c, &ExtractOptions { path: s(&a), dest: s(&dir.join("o")), ..ExtractOptions::default() }).unwrap();
    assert_eq!(rec2.done.load(Relaxed), 1_000_000);
    assert_eq!(rec2.total.load(Relaxed), 1_000_000);
}

// ── Damage ────────────────────────────────────────────────────────────────────────────────────

fn flip_middle(path: &Path) {
    let mut d = std::fs::read(path).unwrap();
    let at = d.len() / 2;
    for b in &mut d[at..at + 16] {
        *b ^= 0x5A;
    }
    std::fs::write(path, d).unwrap();
}

#[test]
fn test_finds_damage_in_every_format() {
    let dir = scratch("d-test");
    let f = dir.join("n.bin");
    std::fs::write(&f, noise(200_000, 8)).unwrap();
    for (format, ext) in [("zip", "zip"), ("7z", "7z"), ("rar", "rar"), ("tar.gz", "tar.gz"), ("tar.bz2", "tar.bz2"), ("tar.xz", "tar.xz"), ("gz", "gz"), ("xz", "xz"), ("bz2", "bz2")] {
        let a = dir.join(format!("a.{ext}"));
        pack(&a, format, &[&f], |_| {});
        test_ok(&a, None);
        flip_middle(&a);
        let result = ops::test(&ctx(), &TestOptions { path: s(&a), password: None, encoding: None });
        let bad = match &result {
            Ok(r) => !r.ok,
            Err(_) => true,
        };
        assert!(bad, "{format}: damage not noticed: {result:?}");
    }
}

#[test]
fn zip_test_names_the_bad_entry_and_checks_the_rest() {
    let dir = scratch("d-names");
    std::fs::create_dir_all(dir.join("s")).unwrap();
    std::fs::write(dir.join("s/a.bin"), noise(50_000, 1)).unwrap();
    std::fs::write(dir.join("s/b.bin"), noise(50_000, 2)).unwrap();
    std::fs::write(dir.join("s/c.bin"), noise(50_000, 3)).unwrap();
    let a = dir.join("a.zip");
    pack(&a, "zip", &[&dir.join("s")], |o| o.method = "store".into());
    flip_middle(&a);
    let r = ops::test(&ctx(), &TestOptions { path: s(&a), password: None, encoding: None }).unwrap();
    assert!(!r.ok);
    assert_eq!(r.failed.len(), 1, "{:?}", r.failed);
    assert_eq!(r.failed[0].path, "s/b.bin");
    assert_eq!(r.files, 3);

    // Extraction keeps going, drops the bad file, or keeps it when asked.
    let dest = dir.join("o");
    let rep = ops::extract(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dest), ..ExtractOptions::default() }).unwrap();
    assert_eq!(rep.failed.len(), 1);
    assert!(!dest.join("s/b.bin").exists());
    assert!(dest.join("s/a.bin").exists());
    assert!(dest.join("s/c.bin").exists());
    let dest2 = dir.join("o2");
    let rep2 = ops::extract(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dest2), keep_broken: true, ..ExtractOptions::default() }).unwrap();
    assert_eq!(rep2.failed.len(), 1);
    assert!(dest2.join("s/b.bin").exists());
}

fn make_repairable(dir: &Path) -> (std::path::PathBuf, std::collections::BTreeMap<String, Vec<u8>>) {
    let s_dir = dir.join("s");
    std::fs::create_dir_all(&s_dir).unwrap();
    let mut want = std::collections::BTreeMap::new();
    for (n, d) in [("a.txt", text(60_000)), ("b.bin", noise(60_000, 1)), ("c.txt", text(50_000)), ("한글.txt", text(10_000))] {
        std::fs::write(s_dir.join(n), &d).unwrap();
        want.insert(format!("s/{n}"), d);
    }
    let a = dir.join("broken.zip");
    pack(&a, "zip", &[&s_dir], |_| {});
    (a, want)
}

fn repair(path: &Path) -> ops::RepairReport {
    ops::repair(&ctx(), &ops::RepairOptions { path: s(path), output: None }).unwrap()
}

#[test]
fn repair_rebuilds_a_lost_central_directory() {
    let dir = scratch("r-cd");
    let (a, want) = make_repairable(&dir);
    let mut d = std::fs::read(&a).unwrap();
    let cd = d.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
    d.truncate(cd);
    std::fs::write(&a, &d).unwrap();
    assert!(ops::list(&ctx(), &ListOptions { path: s(&a), password: None, encoding: None }).is_err(), "should be broken");

    let r = repair(&a);
    assert_eq!(r.recovered, 5, "four files and their folder");
    assert_eq!(r.lost, 0);
    assert!(r.output.ends_with("broken.repaired.zip"));
    let got = unpack(Path::new(&r.output), &dir.join("o"), None);
    for (k, v) in &want {
        assert_eq!(&got[k], v);
    }
    seven_zip_tests(Path::new(&r.output), None);
    assert!(Path::new(&a).exists(), "the damaged original stays");
}

#[test]
fn repair_survives_a_truncated_file() {
    let dir = scratch("r-trunc");
    let (a, want) = make_repairable(&dir);
    let mut d = std::fs::read(&a).unwrap();
    // Cut into the last entry's data.
    let last = d.windows(4).rposition(|w| w == b"PK\x03\x04").unwrap();
    d.truncate(last + 200);
    std::fs::write(&a, &d).unwrap();
    let r = repair(&a);
    assert_eq!(r.recovered, 4, "three files and their folder");
    assert_eq!(r.lost, 1);
    let got = unpack(Path::new(&r.output), &dir.join("o"), None);
    assert_eq!(got.len(), 3);
    for (k, v) in &got {
        assert_eq!(v, &want[k]);
    }
    seven_zip_tests(Path::new(&r.output), None);
}

#[test]
fn repair_drops_a_damaged_entry_keeps_the_others() {
    let dir = scratch("r-bad");
    let (a, want) = make_repairable(&dir);
    let mut d = std::fs::read(&a).unwrap();
    let b_at = d.windows(5).position(|w| w == b"b.bin").unwrap();
    for x in &mut d[b_at + 1000..b_at + 1016] {
        *x ^= 0xFF;
    }
    // And the directory too, so only a scan can help.
    let cd = d.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
    d[cd] = 0;
    std::fs::write(&a, &d).unwrap();
    let r = repair(&a);
    assert_eq!(r.recovered, 4, "three files and their folder");
    assert_eq!(r.lost, 1);
    assert_eq!(r.lost_names, vec!["s/b.bin".to_string()]);
    let got = unpack(Path::new(&r.output), &dir.join("o"), None);
    assert!(!got.contains_key("s/b.bin"));
    assert_eq!(got["s/a.txt"], want["s/a.txt"]);
    assert_eq!(got["s/한글.txt"], want["s/한글.txt"]);
}

#[test]
fn repair_keeps_encrypted_entries_encrypted() {
    let dir = scratch("r-enc");
    let f = dir.join("a.txt");
    std::fs::write(&f, text(5000)).unwrap();
    let a = dir.join("e.zip");
    pack(&a, "zip", &[&f], |o| o.password = Some("pw".into()));
    let mut d = std::fs::read(&a).unwrap();
    let cd = d.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
    d.truncate(cd);
    std::fs::write(&a, &d).unwrap();
    let r = repair(&a);
    assert_eq!(r.recovered, 1);
    let got = unpack(Path::new(&r.output), &dir.join("o"), Some("pw"));
    assert_eq!(got["a.txt"], text(5000));
    let e = ops::test(&ctx(), &TestOptions { path: r.output.clone(), password: Some("no".into()), encoding: None }).unwrap_err();
    assert_eq!(e.code(), "wrong_password");
}

#[test]
fn repair_with_data_descriptors() {
    // Streaming ZIPs: sizes come after the data. 7-Zip with -so cannot do it for us, so build one.
    let dir = scratch("r-desc");
    let name = b"stream.txt";
    let data = text(9000);
    let crc = crc32fast::hash(&data);
    let mut enc = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
    use std::io::Write;
    enc.write_all(&data).unwrap();
    let packed = enc.finish().unwrap();
    let mut z = Vec::new();
    z.extend_from_slice(b"PK\x03\x04");
    z.extend_from_slice(&20u16.to_le_bytes());
    z.extend_from_slice(&(1u16 << 3).to_le_bytes());
    z.extend_from_slice(&8u16.to_le_bytes());
    z.extend_from_slice(&[0u8; 4]);
    z.extend_from_slice(&[0u8; 12]);
    z.extend_from_slice(&(name.len() as u16).to_le_bytes());
    z.extend_from_slice(&0u16.to_le_bytes());
    z.extend_from_slice(name);
    z.extend_from_slice(&packed);
    z.extend_from_slice(b"PK\x07\x08");
    z.extend_from_slice(&crc.to_le_bytes());
    z.extend_from_slice(&(packed.len() as u32).to_le_bytes());
    z.extend_from_slice(&(data.len() as u32).to_le_bytes());
    let a = dir.join("stream.zip");
    std::fs::write(&a, &z).unwrap();
    let r = repair(&a);
    assert_eq!(r.recovered, 1);
    let got = unpack(Path::new(&r.output), &dir.join("o"), None);
    assert_eq!(got["stream.txt"], data);
}

#[test]
fn repair_of_nothing_recoverable_fails_clearly() {
    let dir = scratch("r-none");
    let a = dir.join("x.zip");
    std::fs::write(&a, noise(4000, 1)).unwrap();
    let e = ops::repair(&ctx(), &ops::RepairOptions { path: s(&a), output: None }).unwrap_err();
    assert_eq!(e.code(), "corrupt");
    assert!(!dir.join("x.repaired.zip").exists());
}

#[test]
fn rar_recovery_record_repairs_damage() {
    let dir = scratch("r-rar");
    let f = dir.join("n.bin");
    let data = noise(400_000, 11);
    std::fs::write(&f, &data).unwrap();
    let a = dir.join("rr.rar");
    pack(&a, "rar", &[&f], |o| o.recovery_percent = Some(10));
    assert!(listing(&a, None).has_recovery);
    test_ok(&a, None);

    let mut d = std::fs::read(&a).unwrap();
    for x in &mut d[100_000..100_400] {
        *x ^= 0xA5;
    }
    std::fs::write(&a, &d).unwrap();
    let broken = ops::test(&ctx(), &TestOptions { path: s(&a), password: None, encoding: None });
    assert!(broken.is_err() || !broken.unwrap().ok, "damage should show");

    let r = repair(&a);
    assert_eq!(r.format, "rar");
    assert!(r.changed);
    let got = unpack(Path::new(&r.output), &dir.join("o"), None);
    assert_eq!(got["n.bin"], data, "repaired from the recovery record");
}

#[test]
fn split_zip_can_be_repaired_whole() {
    let dir = scratch("r-span");
    let f = dir.join("n.bin");
    let data = noise(300_000, 2);
    std::fs::write(&f, &data).unwrap();
    let a = dir.join("sp.zip");
    let v = pack(&a, "zip", &[&f], |o| o.volume_size = Some(128 * 1024));
    // Lose the end of the last part.
    let last = v.volumes.last().unwrap();
    let mut d = std::fs::read(&last.path).unwrap();
    let cd = d.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
    d.truncate(cd);
    std::fs::write(&last.path, d).unwrap();
    let r = repair(Path::new(&v.volumes[0].path));
    assert_eq!(r.recovered, 1);
    assert_eq!(unpack(Path::new(&r.output), &dir.join("o"), None)["n.bin"], data);
}

// ── Editing an archive ────────────────────────────────────────────────────────────────────────

fn edit(a: &Path, password: Option<&str>, tweak: impl FnOnce(&mut ModifyOptions)) -> zipmaster_core::ArchiveInfo {
    let mut o = ModifyOptions { path: s(a), password: password.map(String::from), ..ModifyOptions::default() };
    tweak(&mut o);
    ops::modify(&ctx(), &o).unwrap_or_else(|e| panic!("modify {}: {e}", a.display()))
}

fn edit_all(format: &str, ext: &str, password: Option<&str>) {
    let dir = scratch(&format!("m-{}", ext.replace('.', "_")));
    let src = dir.join("src");
    let want = sample_tree(&src);
    let a = dir.join(format!("a.{ext}"));
    pack(&a, format, &[&src.join("data")], |o| o.password = password.map(String::from));
    let extra = dir.join("new.txt");
    std::fs::write(&extra, b"added").unwrap();

    // Add, including into a folder.
    let info = edit(&a, password, |o| {
        o.add = vec![SourceSpec { path: s(&extra), name: Some("data/added/new.txt".into()) }];
    });
    assert!(info.entries.iter().any(|e| e.path == "data/added/new.txt"), "{format}: add");

    // Replace by adding the same name.
    std::fs::write(&extra, b"replaced").unwrap();
    edit(&a, password, |o| o.add = vec![SourceSpec { path: s(&extra), name: Some("data/added/new.txt".into()) }]);

    // Delete a file and a whole folder.
    let info = edit(&a, password, |o| o.delete = vec!["data/noise.bin".into(), "data/deep".into()]);
    assert!(!info.entries.iter().any(|e| e.path == "data/noise.bin"), "{format}: delete file");
    assert!(!info.entries.iter().any(|e| e.path.starts_with("data/deep")), "{format}: delete folder");

    // Rename a file and a folder.
    let info = edit(&a, password, |o| {
        o.rename = vec![
            Rename { from: "data/readme.txt".into(), to: "data/README.md".into() },
            Rename { from: "data/한글 폴더".into(), to: "data/renamed".into() },
        ];
    });
    assert!(info.entries.iter().any(|e| e.path == "data/README.md"), "{format}: rename file");
    assert!(info.entries.iter().any(|e| e.path == "data/renamed/보고서.txt"), "{format}: rename folder");
    assert!(!info.entries.iter().any(|e| e.path == "data/readme.txt"), "{format}");

    // New empty folder.
    let info = edit(&a, password, |o| o.mkdir = vec!["data/made/here".into()]);
    assert!(info.entries.iter().any(|e| e.path == "data/made/here" && e.is_dir), "{format}: mkdir");

    // And it all still reads, with the right contents, by us and by 7-Zip.
    test_ok(&a, password);
    let got = unpack(&a, &dir.join("o"), password);
    assert_eq!(got["data/README.md"], want["data/readme.txt"], "{format}");
    assert_eq!(got["data/added/new.txt"], b"replaced", "{format}");
    assert_eq!(got["data/renamed/보고서.txt"], want["data/한글 폴더/보고서.txt"], "{format}");
    assert!(!got.contains_key("data/noise.bin"), "{format}");
    if format != "tar.zst" {
        seven_zip_tests(&a, password);
    }

    // Nothing temporary is left behind.
    let names: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|i| i.unwrap().file_name().to_string_lossy().into_owned()).collect();
    assert!(!names.iter().any(|n| n.contains("zmwork") || n.contains("zmtmp")), "{names:?}");
}

#[test] fn edit_zip() { edit_all("zip", "zip", None); }
#[test] fn edit_zip_encrypted() { edit_all("zip", "zip", Some("pw")); }
#[test] fn edit_7z() { edit_all("7z", "7z", None); }
#[test] fn edit_7z_encrypted() { edit_all("7z", "7z", Some("pw")); }
#[test] fn edit_rar() { edit_all("rar", "rar", None); }
#[test] fn edit_tar() { edit_all("tar", "tar", None); }
#[test] fn edit_tar_gz() { edit_all("tar.gz", "tar.gz", None); }
#[test] fn edit_tar_zst() { edit_all("tar.zst", "tar.zst", None); }

#[test]
fn edit_keeps_encryption_kind() {
    let dir = scratch("m-kind");
    let f = dir.join("a.txt");
    std::fs::write(&f, text(1000)).unwrap();
    std::fs::write(dir.join("b.txt"), text(1000)).unwrap();
    let a = dir.join("zc.zip");
    pack(&a, "zip", &[&f], |o| {
        o.password = Some("x".into());
        o.encryption = Some("zipcrypto".into());
    });
    let info = edit(&a, Some("x"), |o| o.add = vec![SourceSpec { path: s(&dir.join("b.txt")), name: None }]);
    assert!(info.entries.iter().all(|e| e.encrypted && e.method.contains("ZipCrypto")), "{:?}", info.entries);

    // Header encryption stays on too.
    let h = dir.join("h.7z");
    pack(&h, "7z", &[&f], |o| {
        o.password = Some("x".into());
        o.encrypt_names = true;
    });
    edit(&h, Some("x"), |o| o.add = vec![SourceSpec { path: s(&dir.join("b.txt")), name: None }]);
    let e = ops::list(&ctx(), &ListOptions { path: s(&h), password: None, encoding: None }).unwrap_err();
    assert_eq!(e.code(), "password_required");
}

#[test]
fn edits_are_refused_where_they_cannot_work() {
    let dir = scratch("m-refuse");
    let f = dir.join("n.bin");
    std::fs::write(&f, noise(300_000, 1)).unwrap();
    let op = |path: String, password: Option<String>| ModifyOptions { path, password, delete: vec!["x".into()], ..Default::default() };

    let v = pack(&dir.join("v.7z"), "7z", &[&f], |o| o.volume_size = Some(100_000));
    let e = ops::modify(&ctx(), &op(v.volumes[0].path.clone(), None)).unwrap_err();
    assert_eq!(e.to_string(), "unsupported: volumes_read_only");

    let g = dir.join("g.gz");
    pack(&g, "gz", &[&f], |_| {});
    let e = ops::modify(&ctx(), &op(s(&g), None)).unwrap_err();
    assert_eq!(e.to_string(), "unsupported: format_read_only");

    let enc = dir.join("e.zip");
    pack(&enc, "zip", &[&f], |o| o.password = Some("x".into()));
    let e = ops::modify(&ctx(), &op(s(&enc), None)).unwrap_err();
    assert_eq!(e.code(), "password_required");
    assert!(listing(&enc, None).encrypted, "untouched");

    // A failed edit leaves the archive as it was.
    let keep = std::fs::read(&enc).unwrap();
    let e = ops::modify(&ctx(), &ModifyOptions { path: s(&enc), password: Some("wrong".into()), mkdir: vec!["z".into()], ..Default::default() }).unwrap_err();
    assert_eq!(e.code(), "wrong_password");
    assert_eq!(std::fs::read(&enc).unwrap(), keep);
}

#[test]
fn comments_are_set_read_and_cleared() {
    let dir = scratch("m-comment");
    let f = dir.join("a.txt");
    std::fs::write(&f, b"x").unwrap();

    let z = dir.join("c.zip");
    pack(&z, "zip", &[&f], |o| o.comment = Some("first comment".into()));
    assert_eq!(listing(&z, None).comment.as_deref(), Some("first comment"));
    let (_, log) = run_7z(&["l", &s(&z)]);
    assert!(log.contains("first comment"), "7-Zip sees the comment:\n{log}");
    let info = edit(&z, None, |o| o.comment = Some("한글 설명 ".repeat(4)));
    assert!(info.comment.as_deref().unwrap_or("").contains("한글 설명"), "{:?}", info.comment);
    let info = edit(&z, None, |o| o.comment = Some(String::new()));
    assert_eq!(info.comment, None);
    test_ok(&z, None);
    seven_zip_tests(&z, None);

    let r = dir.join("c.rar");
    pack(&r, "rar", &[&f], |o| o.comment = Some("rar comment".into()));
    assert_eq!(listing(&r, None).comment.as_deref(), Some("rar comment"));
    let info = edit(&r, None, |o| o.comment = Some("changed".into()));
    assert_eq!(info.comment.as_deref(), Some("changed"));
}

// ── Converting ────────────────────────────────────────────────────────────────────────────────

#[test]
fn convert_between_every_writable_format() {
    let dir = scratch("v-all");
    let src = dir.join("src");
    let want = sample_tree(&src);
    let start = dir.join("start.zip");
    pack(&start, "zip", &[&src.join("data")], |o| o.password = Some("pw".into()));
    let mut previous = start;
    let mut previous_pw = Some("pw".to_string());
    for (format, ext) in [("7z", "7z"), ("rar", "rar"), ("tar.xz", "tar.xz"), ("tar.zst", "tar.zst"), ("tar.gz", "tar.gz"), ("zip", "end.zip")] {
        let output = dir.join(format!("next.{ext}"));
        let r = ops::convert(
            &ctx(),
            &ops::ConvertOptions {
                path: s(&previous),
                password: previous_pw.take(),
                encoding: None,
                create: ops::CreateOptions { output: s(&output), format: format.into(), ..Default::default() },
            },
        )
        .unwrap_or_else(|e| panic!("to {format}: {e}"));
        assert_eq!(r.files, want.len() as u64, "{format}");
        previous = output;
    }
    assert_same(&unpack(&previous, &dir.join("o"), None), &want, "after the whole chain");
    let names: Vec<_> = std::fs::read_dir(&dir).unwrap().map(|i| i.unwrap().file_name().to_string_lossy().into_owned()).collect();
    assert!(!names.iter().any(|n| n.contains("zmwork")), "{names:?}");
}

#[test]
fn convert_can_encrypt_and_split() {
    let dir = scratch("v-split");
    let f = dir.join("n.bin");
    let data = noise(500_000, 6);
    std::fs::write(&f, &data).unwrap();
    let a = dir.join("a.tar.gz");
    pack(&a, "tar.gz", &[&f], |_| {});
    let output = dir.join("b.7z");
    let r = ops::convert(
        &ctx(),
        &ops::ConvertOptions {
            path: s(&a),
            password: None,
            encoding: None,
            create: ops::CreateOptions { output: s(&output), format: "7z".into(), password: Some("pw".into()), volume_size: Some(128 * 1024), ..Default::default() },
        },
    )
    .unwrap();
    assert!(r.volumes.len() >= 4);
    assert_eq!(unpack(Path::new(&r.volumes[0].path), &dir.join("o"), Some("pw"))["n.bin"], data);
}

#[test]
fn convert_to_a_single_file_format_only_if_it_fits() {
    let dir = scratch("v-one");
    let src = dir.join("src");
    sample_tree(&src);
    let a = dir.join("many.zip");
    pack(&a, "zip", &[&src.join("data")], |_| {});
    let e = ops::convert(
        &ctx(),
        &ops::ConvertOptions { path: s(&a), password: None, encoding: None, create: ops::CreateOptions { output: s(&dir.join("x.gz")), format: "gz".into(), ..Default::default() } },
    )
    .unwrap_err();
    assert_eq!(e.to_string(), "invalid: single_file_only");
    assert!(!dir.join("x.gz").exists());
    assert!(!std::fs::read_dir(&dir).unwrap().any(|i| i.unwrap().file_name().to_string_lossy().contains("zmwork")));

    let f = dir.join("one.txt");
    std::fs::write(&f, text(1000)).unwrap();
    let b = dir.join("one.zip");
    pack(&b, "zip", &[&f], |_| {});
    let out = dir.join("one.txt.xz");
    ops::convert(
        &ctx(),
        &ops::ConvertOptions { path: s(&b), password: None, encoding: None, create: ops::CreateOptions { output: s(&out), format: "xz".into(), ..Default::default() } },
    )
    .unwrap();
    assert_eq!(unpack(&out, &dir.join("ox"), None)["one.txt"], text(1000));
}

// ── Other people's archives ───────────────────────────────────────────────────────────────────

#[test]
fn seven_zip_made_archives_open_here() {
    let dir = scratch("o-theirs");
    let src = dir.join("src");
    let want = sample_tree(&src);
    let data = s(&src.join("data"));
    for (file, args) in [
        ("a.zip", vec!["a", "-tzip"]),
        ("store.zip", vec!["a", "-tzip", "-mm=Copy"]),
        ("d64.zip", vec!["a", "-tzip", "-mm=Deflate64"]),
        ("bz.zip", vec!["a", "-tzip", "-mm=BZip2"]),
        ("lz.zip", vec!["a", "-tzip", "-mm=LZMA"]),
        ("a.7z", vec!["a", "-t7z"]),
        ("solid.7z", vec!["a", "-t7z", "-ms=on", "-mx=9"]),
        ("nsolid.7z", vec!["a", "-t7z", "-ms=off"]),
        ("ppmd.7z", vec!["a", "-t7z", "-m0=PPMd"]),
        ("bz.7z", vec!["a", "-t7z", "-m0=BZip2"]),
        ("a.tar", vec!["a", "-ttar"]),
    ] {
        let out = s(&dir.join(file));
        let mut all = args;
        all.push(&out);
        all.push(&data);
        let (ok, log) = run_7z(&all);
        assert!(ok, "{log}");
        test_ok(Path::new(&out), None);
        assert_same(&unpack(Path::new(&out), &dir.join(format!("x-{file}")), None), &want, file);
    }
}

#[test]
fn seven_zip_made_compressed_streams_open_here() {
    let dir = scratch("o-streams");
    let f = dir.join("file.txt");
    let data = text(100_000);
    std::fs::write(&f, &data).unwrap();
    for (file, kind) in [("o.gz", "-tgzip"), ("o.bz2", "-tbzip2"), ("o.xz", "-txz")] {
        let out = s(&dir.join(file));
        let (ok, log) = run_7z(&["a", kind, &out, &s(&f)]);
        assert!(ok, "{log}");
        let got = unpack(Path::new(&out), &dir.join(format!("x-{file}")), None);
        assert_eq!(got.values().next().unwrap(), &data, "{file}");
    }
}

#[test]
fn real_winrar_archives_read_as_7zip_reads_them() {
    // Made by WinRAR itself; 7-Zip's extraction is the expected answer.
    let dir = scratch("o-winrar");
    let rar = fixtures().join("rar");
    for name in ["m3_default.rar", "solid.rar", "multifile.rar", "with_comment.rar", "with_recovery.rar", "rar13_multifil.rar"] {
        let path = rar.join(name);
        test_ok(&path, None);
        let ours = unpack(&path, &dir.join(format!("ours-{name}")), None);
        assert!(!ours.is_empty(), "{name}");
        // 7-Zip dropped RAR 1.3 support; that one is checked against itself.
        if name != "rar13_multifil.rar" {
            let theirs = seven_zip_extracts(&path, &dir.join(format!("theirs-{name}")), None);
            assert_same(&ours, &theirs, name);
        }
    }
    assert!(listing(&rar.join("with_recovery.rar"), None).has_recovery);
    assert!(listing(&rar.join("with_comment.rar"), None).comment.is_some());
    assert!(listing(&rar.join("solid.rar"), None).solid);
}

#[test]
fn real_winrar_volumes_and_passwords_read() {
    let dir = scratch("o-winrar2");
    let rar = fixtures().join("rar");
    // Multi-volume, from any part.
    let info = listing(&rar.join("multivol.part2.rar"), None);
    assert_eq!(info.volumes.len(), 3);
    let ours = unpack(&rar.join("multivol.part3.rar"), &dir.join("mv"), None);
    let theirs = seven_zip_extracts(&rar.join("multivol.part1.rar"), &dir.join("mv7"), None);
    assert_same(&ours, &theirs, "multivol");

    // Encrypted: password discovered by what the fixture was made with.
    for (name, pw) in [("password_aes.rar", "password"), ("header_encrypted.rar", "password")] {
        let path = rar.join(name);
        let got = unpack(&path, &dir.join(format!("x-{name}")), Some(pw));
        let theirs = seven_zip_extracts(&path, &dir.join(format!("t-{name}")), Some(pw));
        assert_same(&got, &theirs, name);
    }
    let e = ops::list(&ctx(), &ListOptions { path: s(&rar.join("header_encrypted.rar")), password: None, encoding: None }).unwrap_err();
    assert_eq!(e.code(), "password_required");
}

#[test]
fn cab_files_open_read_only() {
    let dir = scratch("o-cab");
    let cab = fixtures().join("cab");
    let lzx = cab.join("lzx.cab");
    let info = listing(&lzx, None);
    assert_eq!(info.format, "cab");
    assert!(info.read_only);
    assert_eq!(info.entries.len(), 2);
    assert_eq!(info.entries[0].method, "LZX");
    test_ok(&lzx, None);
    let got = unpack(&lzx, &dir.join("a"), None);
    assert_eq!(got["a.txt"], b"hello from a cabinet\n");
    let want: Vec<u8> = (0..=255u8).collect::<Vec<_>>().repeat(200);
    assert_eq!(got["b.bin"], want);

    let mz = cab.join("mszip.cab");
    assert_eq!(listing(&mz, None).entries[0].method, "MSZIP");
    assert_eq!(unpack(&mz, &dir.join("b"), None)["a.txt"], b"hello from a cabinet\n");
}

/// A small ISO 9660 image with a Joliet tree, made by hand. 7-Zip checks that the hand was steady.
fn build_iso(path: &Path, joliet: bool) {
    const S: usize = 2048;
    let mut img = vec![0u8; 40 * S];
    let dir_rec = |name: &[u8], extent: u32, size: u32, is_dir: bool| -> Vec<u8> {
        let mut len = 33 + name.len();
        if len % 2 == 1 {
            len += 1;
        }
        let mut r = vec![0u8; len];
        r[0] = len as u8;
        r[2..6].copy_from_slice(&extent.to_le_bytes());
        r[6..10].copy_from_slice(&extent.to_be_bytes());
        r[10..14].copy_from_slice(&size.to_le_bytes());
        r[14..18].copy_from_slice(&size.to_be_bytes());
        r[18..25].copy_from_slice(&[120, 6, 15, 12, 30, 45, 0]);
        r[25] = if is_dir { 2 } else { 0 };
        r[28] = 1;
        r[31] = 1;
        r[32] = name.len() as u8;
        r[33..33 + name.len()].copy_from_slice(name);
        r
    };
    let u16be = |s: &str| -> Vec<u8> { s.encode_utf16().flat_map(|c| c.to_be_bytes()).collect() };
    let hello: &[u8] = b"hello iso\n";
    let inner: &[u8] = b"inner file\n";
    img[35 * S..35 * S + hello.len()].copy_from_slice(hello);
    img[36 * S..36 * S + inner.len()].copy_from_slice(inner);

    let write_dir = |img: &mut Vec<u8>, sector: usize, parent: usize, items: Vec<Vec<u8>>| {
        let mut at = sector * S;
        for r in [dir_rec(&[0], sector as u32, S as u32, true), dir_rec(&[1], parent as u32, S as u32, true)].into_iter().chain(items) {
            img[at..at + r.len()].copy_from_slice(&r);
            at += r.len();
        }
    };
    // Primary tree: 8.3 names.
    write_dir(&mut img, 20, 20, vec![dir_rec(b"HELLO.TXT;1", 35, hello.len() as u32, false), dir_rec(b"SUB", 21, S as u32, true)]);
    write_dir(&mut img, 21, 20, vec![dir_rec(b"INNER.TXT;1", 36, inner.len() as u32, false)]);
    // Joliet tree: real names.
    write_dir(&mut img, 22, 22, vec![dir_rec(&u16be("안녕하세요.txt;1"), 35, hello.len() as u32, false), dir_rec(&u16be("Long Sub Folder"), 23, S as u32, true)]);
    write_dir(&mut img, 23, 22, vec![dir_rec(&u16be("inner long name.txt;1"), 36, inner.len() as u32, false)]);

    let mut descriptor = |sector: usize, kind: u8, root: u32, jol: bool| {
        let d = &mut img[sector * S..(sector + 1) * S];
        d[0] = kind;
        d[1..6].copy_from_slice(b"CD001");
        d[6] = 1;
        if jol {
            d[88..91].copy_from_slice(b"%/E");
        }
        d[80..84].copy_from_slice(&40u32.to_le_bytes());
        d[84..88].copy_from_slice(&40u32.to_be_bytes());
        d[120] = 1;
        d[123] = 1;
        d[124] = 1;
        d[127] = 1;
        d[128..130].copy_from_slice(&(S as u16).to_le_bytes());
        d[130..132].copy_from_slice(&(S as u16).to_be_bytes());
        let mut rec = vec![0u8; 34];
        rec[0] = 34;
        rec[2..6].copy_from_slice(&root.to_le_bytes());
        rec[6..10].copy_from_slice(&root.to_be_bytes());
        rec[10..14].copy_from_slice(&(S as u32).to_le_bytes());
        rec[14..18].copy_from_slice(&(S as u32).to_be_bytes());
        rec[25] = 2;
        rec[28] = 1;
        rec[31] = 1;
        rec[32] = 1;
        d[156..190].copy_from_slice(&rec);
    };
    descriptor(16, 1, 20, false);
    if joliet {
        descriptor(17, 2, 22, true);
    }
    let term = if joliet { 18 } else { 17 };
    img[term * S] = 255;
    img[term * S + 1..term * S + 6].copy_from_slice(b"CD001");
    img[term * S + 6] = 1;
    std::fs::write(path, img).unwrap();
}

#[test]
fn iso_images_open_read_only() {
    let dir = scratch("o-iso");
    let plain = dir.join("plain.iso");
    build_iso(&plain, false);
    let info = listing(&plain, None);
    assert_eq!(info.format, "iso");
    assert!(info.read_only);
    let got = unpack(&plain, &dir.join("a"), None);
    assert_eq!(got["HELLO.TXT"], b"hello iso\n");
    assert_eq!(got["SUB/INNER.TXT"], b"inner file\n");
    assert_same(&got, &seven_zip_extracts(&plain, &dir.join("a7"), None), "iso by 7-Zip");

    let jol = dir.join("joliet.iso");
    build_iso(&jol, true);
    let got = unpack(&jol, &dir.join("b"), None);
    assert_eq!(got["안녕하세요.txt"], b"hello iso\n");
    assert_eq!(got["Long Sub Folder/inner long name.txt"], b"inner file\n");
    test_ok(&jol, None);
}

// ── Recognising things ────────────────────────────────────────────────────────────────────────

#[test]
fn contents_decide_the_format_not_the_name() {
    let dir = scratch("f-names");
    let f = dir.join("a.txt");
    std::fs::write(&f, text(2000)).unwrap();
    for (format, ext, disguise) in [("zip", "zip", "app.jar"), ("zip", "zip", "doc.docx"), ("7z", "7z", "noext"), ("rar", "rar", "data.bin"), ("tar.gz", "tar.gz", "pack.dat"), ("gz", "gz", "file.foo")] {
        let a = dir.join(format!("orig.{ext}"));
        pack(&a, format, &[&f], |o| o.overwrite = true);
        let other = dir.join(disguise);
        std::fs::copy(&a, &other).unwrap();
        assert_eq!(listing(&other, None).format, format, "{disguise}");
    }
    let t = dir.join("x.tgz");
    pack(&t, "tar.gz", &[&f], |_| {});
    assert_eq!(listing(&t, None).format, "tar.gz");
}

#[test]
fn not_an_archive_says_so() {
    let dir = scratch("f-not");
    let p = dir.join("note.txt");
    std::fs::write(&p, text(2000)).unwrap();
    let e = ops::list(&ctx(), &ListOptions { path: s(&p), password: None, encoding: None }).unwrap_err();
    assert_eq!(e.code(), "not_archive");
    let missing = ops::list(&ctx(), &ListOptions { path: s(&dir.join("gone.zip")), password: None, encoding: None }).unwrap_err();
    assert_eq!(missing.code(), "io");
}

// ── Self-extracting ───────────────────────────────────────────────────────────────────────────

#[test]
fn self_extracting_archive_unpacks_itself() {
    let dir = scratch("sfx");
    let src = dir.join("src");
    let want = sample_tree(&src);
    let exe = dir.join(if cfg!(windows) { "setup.exe" } else { "setup.bin" });
    pack(&exe, "zip", &[&src.join("data")], |o| o.sfx_stub = Some(env!("CARGO_BIN_EXE_zipmaster-sfx").to_string()));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    // It runs, and unpacks.
    let dest = dir.join("out");
    let out = std::process::Command::new(&exe).arg(&dest).arg("-y").output().expect("it runs");
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    assert_same(&read_tree(&dest), &want, "self-extraction");

    // It is also a normal archive, to us and to 7-Zip.
    assert_eq!(listing(&exe, None).format, "zip");
    assert!(listing(&exe, None).read_only, "editing would lose the program in front");
    test_ok(&exe, None);
    assert_same(&unpack(&exe, &dir.join("ours"), None), &want, "reading it as an archive");
    seven_zip_tests(&exe, None);
}

#[test]
fn self_extracting_archive_asks_for_its_password() {
    let dir = scratch("sfx-pw");
    let f = dir.join("a.txt");
    std::fs::write(&f, b"secret").unwrap();
    let exe = dir.join(if cfg!(windows) { "s.exe" } else { "s.bin" });
    pack(&exe, "zip", &[&f], |o| {
        o.sfx_stub = Some(env!("CARGO_BIN_EXE_zipmaster-sfx").to_string());
        o.password = Some("pw".into());
    });
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let dest = dir.join("o");
    let bad = std::process::Command::new(&exe).arg(&dest).arg("-y").output().unwrap();
    assert!(!bad.status.success());
    let good = std::process::Command::new(&exe).arg(&dest).arg("-ppw").arg("-y").output().unwrap();
    assert!(good.status.success());
    assert_eq!(std::fs::read(dest.join("a.txt")).unwrap(), b"secret");
}

#[test]
fn self_extracting_needs_zip_and_no_split() {
    let dir = scratch("sfx-no");
    let f = dir.join("a.txt");
    std::fs::write(&f, b"x").unwrap();
    let stub = env!("CARGO_BIN_EXE_zipmaster-sfx").to_string();
    let e = try_pack(&dir.join("a.exe"), "7z", &[&f], |o| o.sfx_stub = Some(stub.clone())).unwrap_err();
    assert_eq!(e.code(), "invalid");
    let e = try_pack(&dir.join("b.exe"), "zip", &[&f], |o| {
        o.sfx_stub = Some(stub.clone());
        o.volume_size = Some(1 << 20);
    })
    .unwrap_err();
    assert_eq!(e.code(), "invalid");
}

#[test]
fn seven_zip_sfx_opens() {
    // 7-Zip's own self-extractor puts a real 7z after a program.
    let dir = scratch("sfx-7z");
    let Some(module) = ["C:\\Program Files\\7-Zip\\7z.sfx"].iter().find(|p| Path::new(p).exists()).map(|p| p.to_string()) else { return };
    let f = dir.join("a.txt");
    std::fs::write(&f, text(1000)).unwrap();
    let out = dir.join("s.exe");
    let (ok, log) = run_7z(&["a", &format!("-sfx{module}"), &s(&out), &s(&f)]);
    assert!(ok, "{log}");
    let info = listing(&out, None);
    assert_eq!(info.format, "7z");
    assert_eq!(unpack(&out, &dir.join("o"), None)["a.txt"], text(1000));
}

// ── Zip64 ─────────────────────────────────────────────────────────────────────────────────────

#[test]
fn zip64_records_are_written_and_read() {
    let dir = scratch("z64");
    let src = dir.join("src");
    let want = sample_tree(&src);
    let a = dir.join("z.zip");
    pack(&a, "zip", &[&src.join("data")], |o| o.force_zip64 = true);
    let raw = std::fs::read(&a).unwrap();
    assert!(raw.windows(4).any(|w| w == b"PK\x06\x06"), "no Zip64 end record");
    assert!(raw.windows(4).any(|w| w == b"PK\x06\x07"), "no Zip64 locator");
    assert_same(&unpack(&a, &dir.join("o"), None), &want, "zip64 ours");
    assert_same(&seven_zip_extracts(&a, &dir.join("t"), None), &want, "zip64 by 7-Zip");

    // Split too.
    let b = dir.join("zs.zip");
    let r = pack(&b, "zip", &[&src.join("data")], |o| {
        o.force_zip64 = true;
        o.volume_size = Some(64 * 1024);
    });
    assert!(r.volumes.len() > 1);
    assert_same(&unpack(&b, &dir.join("o2"), None), &want, "split zip64 ours");
    assert_same(&seven_zip_extracts(&b, &dir.join("t2"), None), &want, "split zip64 by 7-Zip");
}

#[test]
fn zip64_many_entries() {
    // More than the 65,535 a classic ZIP can count.
    let dir = scratch("z64-many");
    use zipmaster_core::MemFs;
    let mem = MemFs::new();
    for i in 0..65_600u32 {
        mem.put(&format!("/s/f{i}.txt"), Vec::new(), None);
    }
    let c = Ctx::new(Arc::new(mem.clone()), Arc::new(zipmaster_core::NoProgress));
    ops::create(&c, &ops::CreateOptions { output: "/o.zip".into(), format: "zip".into(), sources: vec![SourceSpec { path: "/s".into(), name: None }], ..Default::default() }).unwrap();
    let info = ops::list(&c, &ListOptions { path: "/o.zip".into(), password: None, encoding: None }).unwrap();
    assert_eq!(info.entries.len(), 65_601);
    // Hand it to 7-Zip.
    let out = dir.join("o.zip");
    std::fs::write(&out, mem.read("/o.zip").unwrap()).unwrap();
    seven_zip_tests(&out, None);
}

/// Real data past 4 GB. Slow, so `npm run test:long` runs it, not every test run.
#[test]
#[ignore]
fn zip64_over_four_gigabytes() {
    let dir = scratch("z64-big");
    let f = dir.join("big.bin");
    {
        let file = std::fs::File::create(&f).unwrap();
        file.set_len(4_400_000_000).unwrap();
    }
    let a = dir.join("big.zip");
    pack(&a, "zip", &[&f], |o| {
        o.method = "store".into();
        o.level = Some(0);
    });
    let info = listing(&a, None);
    assert_eq!(info.entries[0].size, Some(4_400_000_000));
    test_ok(&a, None);
    seven_zip_tests(&a, None);

    let v = dir.join("bigv.zip");
    let r = pack(&v, "zip", &[&f], |o| {
        o.level = Some(1);
        o.volume_size = Some(1 << 20);
    });
    assert!(r.volumes.len() >= 2);
    seven_zip_tests(&v, None);
}

// ── Checksums ─────────────────────────────────────────────────────────────────────────────────

#[test]
fn checksums_match_published_vectors() {
    let dir = scratch("h-known");
    let f = dir.join("abc.txt");
    std::fs::write(&f, b"abc").unwrap();
    let r = tools::hash(&ctx(), &HashOptions { paths: vec![s(&f)], algorithms: tools::HASH_NAMES.iter().map(|x| x.to_string()).collect() }).unwrap();
    let h = &r[0].hashes;
    assert_eq!(h["crc32"], "352441c2");
    assert_eq!(h["crc64"], "2cd8094a1a277627");
    assert_eq!(h["md5"], "900150983cd24fb0d6963f7d28e17f72");
    assert_eq!(h["sha1"], "a9993e364706816aba3e25717850c26c9cd0d89d");
    assert_eq!(h["sha256"], "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert_eq!(h["sha512"], "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
    assert_eq!(h["blake3"], "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85");
}

#[test]
fn checksums_agree_with_seven_zip() {
    let dir = scratch("h-7z");
    let f = dir.join("n.bin");
    std::fs::write(&f, noise(3_000_000, 1)).unwrap();
    let r = tools::hash(&ctx(), &HashOptions { paths: vec![s(&f)], algorithms: vec!["crc32".into(), "crc64".into(), "sha1".into(), "sha256".into()] }).unwrap();
    for (name, flag) in [("crc32", "-scrcCRC32"), ("crc64", "-scrcCRC64"), ("sha1", "-scrcSHA1"), ("sha256", "-scrcSHA256")] {
        let (ok, log) = run_7z(&["h", flag, &s(&f)]);
        assert!(ok, "{log}");
        assert!(log.to_lowercase().contains(&r[0].hashes[name]), "{name} {} not in:\n{log}", r[0].hashes[name]);
    }
}

#[test]
fn checksums_walk_folders_and_report_sizes() {
    let dir = scratch("h-tree");
    let src = dir.join("src");
    let want = sample_tree(&src);
    let r = tools::hash(&ctx(), &HashOptions { paths: vec![s(&src)], algorithms: vec![] }).unwrap();
    assert_eq!(r.len(), want.len());
    for f in &r {
        assert!(f.hashes.contains_key("crc32") && f.hashes.contains_key("sha256"), "defaults");
        assert_eq!(f.size, std::fs::metadata(&f.path).unwrap().len());
    }
    let e = tools::hash(&ctx(), &HashOptions { paths: vec![s(&dir.join("gone"))], algorithms: vec![] }).unwrap_err();
    assert_eq!(e.code(), "io");
    let e = tools::hash(&ctx(), &HashOptions { paths: vec![s(&src)], algorithms: vec!["nope".into()] }).unwrap_err();
    assert_eq!(e.code(), "invalid");
}

// ── Benchmark ─────────────────────────────────────────────────────────────────────────────────

#[test]
fn benchmark_measures_each_method() {
    let r = tools::benchmark(&ctx(), &BenchmarkOptions { megabytes: 1, methods: vec![] }).unwrap();
    assert_eq!(r.iter().map(|x| x.method.as_str()).collect::<Vec<_>>(), vec!["deflate", "bzip2", "lzma2", "zstd"]);
    for x in &r {
        assert_eq!(x.size, 1 << 20);
        assert!(x.packed < x.size, "{} did not compress", x.method);
        assert!(x.compress_mb_s > 0.0 && x.decompress_mb_s > 0.0, "{}", x.method);
    }
    assert!(r[2].packed < r[0].packed, "LZMA2 should beat Deflate here");
    let e = tools::benchmark(&ctx(), &BenchmarkOptions { megabytes: 1, methods: vec!["nope".into()] }).unwrap_err();
    assert_eq!(e.code(), "invalid");
}

// ── The JSON door ─────────────────────────────────────────────────────────────────────────────

#[test]
fn dispatch_speaks_json() {
    let dir = scratch("j");
    let f = dir.join("a.txt");
    std::fs::write(&f, b"hello").unwrap();
    let a = dir.join("a.zip");
    let opts = serde_json::json!({ "output": s(&a), "format": "zip", "sources": [{ "path": s(&f) }], "volumeSize": null, "level": 6 });
    let out: serde_json::Value = serde_json::from_str(&zipmaster_core::dispatch_envelope(&ctx(), "create", &opts.to_string())).unwrap();
    assert_eq!(out["ok"], true, "{out}");
    assert_eq!(out["result"]["files"], 1);
    assert_eq!(out["result"]["volumes"][0]["path"], s(&a));

    let list: serde_json::Value = serde_json::from_str(&zipmaster_core::dispatch_envelope(&ctx(), "list", &serde_json::json!({ "path": s(&a) }).to_string())).unwrap();
    assert_eq!(list["result"]["format"], "zip");
    assert_eq!(list["result"]["entries"][0]["path"], "a.txt");
    assert_eq!(list["result"]["entries"][0]["isDir"], false);
    assert_eq!(list["result"]["packedSize"], std::fs::metadata(&a).unwrap().len());

    let bad: serde_json::Value = serde_json::from_str(&zipmaster_core::dispatch_envelope(&ctx(), "list", &serde_json::json!({ "path": s(&dir.join("nope.zip")) }).to_string())).unwrap();
    assert_eq!(bad["ok"], false);
    assert_eq!(bad["code"], "io");
    let unknown: serde_json::Value = serde_json::from_str(&zipmaster_core::dispatch_envelope(&ctx(), "nope", "{}")).unwrap();
    assert_eq!(unknown["code"], "invalid");
    let malformed: serde_json::Value = serde_json::from_str(&zipmaster_core::dispatch_envelope(&ctx(), "list", "not json")).unwrap();
    assert_eq!(malformed["code"], "invalid");
}

// ── Zstandard levels ───────────────────────────

#[test]
fn zstandard_levels_make_smaller_files_and_every_level_reads_back() {
    use zipmaster_core::codecs;
    use std::io::Read;
    // Words in random order: the kind of text where a stronger search finds more.
    let words: Vec<String> = (0..4000u32).map(|i| format!("w{:x}{:x} ", i.wrapping_mul(2654435761), i * 7)).collect();
    let mut data = Vec::new();
    let mut x = 12345u32;
    while data.len() < 3_000_000 {
        x = x.wrapping_mul(1664525).wrapping_add(1013904223);
        data.extend_from_slice(words[(x >> 16) as usize % words.len()].as_bytes());
    }
    let mut sizes = Vec::new();
    for level in [0u32, 1, 3, 5, 7, 9] {
        let mut packed = Vec::new();
        codecs::zstd_compress(&data[..], &mut packed, level).unwrap();
        let mut back = Vec::new();
        codecs::zstd_reader(&packed[..]).unwrap().read_to_end(&mut back).unwrap();
        assert!(back == data, "level {level} did not read back");
        sizes.push(packed.len());
    }
    assert!(sizes[0] > data.len() / 2, "level 0 stores: {sizes:?}");
    assert!(sizes[5] < sizes[1], "level 9 is smaller than level 1: {sizes:?}");
}

#[test]
fn a_zstandard_archive_made_at_the_top_level_is_a_normal_archive() {
    let dir = scratch("zstd-top");
    let src = dir.join("src");
    sample_tree(&src);
    let a = dir.join("a.tar.zst");
    pack(&a, "tar.zst", &[&src.join("data")], |o| o.level = Some(9));
    let report = ops::test(&ctx(), &TestOptions { path: s(&a), ..TestOptions::default() }).unwrap();
    assert!(report.ok);
    assert!(report.files > 0);
}
