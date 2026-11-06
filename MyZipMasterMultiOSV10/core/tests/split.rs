//! Splitting at an exact size: the feature this program exists for.

mod common;
use common::*;
use std::collections::BTreeMap;
use std::path::Path;
use zipmaster_core::ops::{self, CreateReport, ExtractOptions, ListOptions};

/// A tree that cannot compress away, so the parts are real.
fn big_tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut map = BTreeMap::new();
    for (name, data) in [
        ("set/one.bin", noise(700_000, 1)),
        ("set/two.bin", noise(450_000, 2)),
        ("set/한글/three.txt", text(300_000)),
        ("set/empty.txt", Vec::new()),
    ] {
        let p = root.join(name);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, &data).unwrap();
        map.insert(name.to_string(), data);
    }
    map
}

fn assert_parts(report: &CreateReport, size: u64, exact: bool, what: &str) {
    assert!(report.volumes.len() >= 2, "{what}: only {} part(s)", report.volumes.len());
    for (i, v) in report.volumes.iter().enumerate() {
        assert_eq!(std::fs::metadata(&v.path).unwrap().len(), v.size, "{what}: size reported for {}", v.path);
        assert!(v.size <= size, "{what}: {} is {} bytes, over {size}", v.path, v.size);
        if exact && i + 1 < report.volumes.len() {
            assert_eq!(v.size, size, "{what}: {} should be exactly {size}", v.path);
        }
    }
    assert_eq!(report.volumes.iter().map(|v| v.size).sum::<u64>(), report.packed_size, "{what}: total");
}

/// Readable from any one part: users pick whichever they see first.
fn readable_from_every_part(report: &CreateReport, want: &BTreeMap<String, Vec<u8>>, dir: &Path, password: Option<&str>, what: &str) {
    for (i, v) in report.volumes.iter().enumerate() {
        let info = listing(Path::new(&v.path), password);
        assert_eq!(info.volumes.len(), report.volumes.len(), "{what}: from part {i}");
        assert!(info.read_only, "{what}: a split set cannot be edited in place");
        assert!(info.entries.iter().any(|e| e.path == "set/one.bin"), "{what}: from part {i}");
    }
    let last = report.volumes.last().unwrap();
    let got = unpack(Path::new(&last.path), &dir.join(format!("from-last-{}", what.replace([' ', '.'], "-"))), password);
    assert_same(&got, want, what);
    test_ok(Path::new(&report.volumes[0].path), password);
}

#[test]
fn zip_split_is_winzip_style_and_exact_in_size() {
    let dir = scratch("split-zip");
    let want = big_tree(&dir.join("src"));
    let archive = dir.join("arc.zip");
    let size = 300 * 1024;
    let r = pack(&archive, "zip", &[&dir.join("src/set")], |o| {
        o.method = "store".into();
        o.level = Some(0);
        o.volume_size = Some(size);
    });
    // Parts may end early, because ZIP headers must not straddle two parts.
    assert_parts(&r, size, false, "zip span");
    let names: Vec<_> = r.volumes.iter().map(|v| Path::new(&v.path).file_name().unwrap().to_string_lossy().into_owned()).collect();
    assert_eq!(names[0], "arc.z01");
    assert_eq!(names[1], "arc.z02");
    assert_eq!(names.last().unwrap(), "arc.zip", "the last part carries the plain name");
    // WinZip's marker.
    assert_eq!(&std::fs::read(&r.volumes[0].path).unwrap()[..4], b"PK\x07\x08");
    readable_from_every_part(&r, &want, &dir, None, "zip span");
    // 7-Zip reads a split ZIP through its last part.
    assert_same(&seven_zip_extracts(&archive, &dir.join("7z"), None), &want, "zip span by 7-Zip");
}

#[test]
fn zip_split_with_compression_and_many_parts() {
    let dir = scratch("split-zip-many");
    let want = big_tree(&dir.join("src"));
    let archive = dir.join("many.zip");
    let r = pack(&archive, "zip", &[&dir.join("src/set")], |o| o.volume_size = Some(65536));
    assert!(r.volumes.len() > 12, "{} parts", r.volumes.len());
    assert_parts(&r, 65536, false, "zip many");
    assert_same(&unpack(&archive, &dir.join("ours"), None), &want, "zip many");
    assert_same(&seven_zip_extracts(&archive, &dir.join("7z"), None), &want, "zip many by 7-Zip");
}

#[test]
fn zip_numbered_split() {
    let dir = scratch("split-zip-num");
    let want = big_tree(&dir.join("src"));
    let archive = dir.join("n.zip");
    let size = 256 * 1024;
    let r = pack(&archive, "zip", &[&dir.join("src/set")], |o| {
        o.zip_split_style = Some("numbered".into());
        o.volume_size = Some(size);
    });
    assert_parts(&r, size, true, "zip .001");
    assert!(r.volumes[0].path.ends_with("n.zip.001"));
    readable_from_every_part(&r, &want, &dir, None, "zip .001");
    assert_same(&seven_zip_extracts(Path::new(&r.volumes[0].path), &dir.join("7z"), None), &want, "zip .001 by 7-Zip");
}

#[test]
fn sevenz_split_is_exact() {
    let dir = scratch("split-7z");
    let want = big_tree(&dir.join("src"));
    let archive = dir.join("a.7z");
    let size = 200 * 1024;
    let r = pack(&archive, "7z", &[&dir.join("src/set")], |o| o.volume_size = Some(size));
    assert_parts(&r, size, true, "7z");
    assert!(r.volumes[0].path.ends_with("a.7z.001"));
    assert!(r.volumes[1].path.ends_with("a.7z.002"));
    readable_from_every_part(&r, &want, &dir, None, "7z");
    assert_same(&seven_zip_extracts(Path::new(&r.volumes[0].path), &dir.join("7z"), None), &want, "7z by 7-Zip");
}

#[test]
fn rar_split_uses_part_names() {
    let dir = scratch("split-rar");
    let want = big_tree(&dir.join("src"));
    let archive = dir.join("r.rar");
    let size = 256 * 1024;
    let r = pack(&archive, "rar", &[&dir.join("src/set")], |o| o.volume_size = Some(size));
    assert_parts(&r, size, false, "rar");
    assert!(r.volumes[0].path.contains("r.part"), "{}", r.volumes[0].path);
    assert!(r.volumes[0].path.ends_with(".rar"));
    readable_from_every_part(&r, &want, &dir, None, "rar");
    assert_same(&seven_zip_extracts(Path::new(&r.volumes[0].path), &dir.join("7z"), None), &want, "rar by 7-Zip");
}

#[test]
fn tar_family_splits_as_numbered_slices() {
    let dir = scratch("split-tar");
    let want = big_tree(&dir.join("src"));
    for format in ["tar", "tar.gz", "tar.bz2", "tar.xz", "tar.zst"] {
        let archive = dir.join(format!("t.{format}"));
        let size = 128 * 1024;
        let r = pack(&archive, format, &[&dir.join("src/set")], |o| o.volume_size = Some(size));
        assert_parts(&r, size, true, format);
        readable_from_every_part(&r, &want, &dir, None, format);
    }
}

#[test]
fn single_stream_formats_split_too() {
    let dir = scratch("split-gz");
    let file = dir.join("big.bin");
    let data = noise(500_000, 9);
    std::fs::write(&file, &data).unwrap();
    for format in ["gz", "bz2", "xz", "zst"] {
        let archive = dir.join(format!("big.bin.{format}"));
        let r = pack(&archive, format, &[&file], |o| o.volume_size = Some(100_000));
        assert_parts(&r, 100_000, true, format);
        let got = unpack(Path::new(&r.volumes[0].path), &dir.join(format!("out-{format}")), None);
        assert_eq!(got.values().next().unwrap(), &data, "{format}");
    }
}

#[test]
fn encrypted_split_sets_work() {
    let dir = scratch("split-enc");
    let want = big_tree(&dir.join("src"));
    for (format, ext) in [("zip", "zip"), ("7z", "7z"), ("rar", "rar")] {
        let archive = dir.join(format!("s.{ext}"));
        let size = 256 * 1024;
        let r = pack(&archive, format, &[&dir.join("src/set")], |o| {
            o.volume_size = Some(size);
            o.password = Some("비밀번호1!".into());
        });
        assert_parts(&r, size, format == "7z", format);
        let got = unpack(Path::new(&r.volumes[0].path), &dir.join(format!("out-{ext}")), Some("비밀번호1!"));
        assert_same(&got, &want, format);
    }
}

#[test]
fn rar_split_with_recovery_record_stays_in_size() {
    let dir = scratch("split-rar-rr");
    let want = big_tree(&dir.join("src"));
    let archive = dir.join("rr.rar");
    for (percent, size) in [(3u64, 300 * 1024u64), (5, 256 * 1024), (20, 200 * 1024)] {
        let r = pack(&archive, "rar", &[&dir.join("src/set")], |o| {
            o.volume_size = Some(size);
            o.recovery_percent = Some(percent);
            o.overwrite = true;
        });
        assert_parts(&r, size, false, "rar with recovery");
        assert!(listing(Path::new(&r.volumes[0].path), None).has_recovery);
        assert_same(&unpack(Path::new(&r.volumes[0].path), &dir.join(format!("o{percent}")), None), &want, "rar with recovery");
        seven_zip_tests(Path::new(&r.volumes[0].path), None);
    }
}

#[test]
fn a_missing_part_is_reported_not_guessed() {
    let dir = scratch("split-missing");
    big_tree(&dir.join("src"));

    // ZIP: a hole in the numbering.
    let z = dir.join("z.zip");
    let r = pack(&z, "zip", &[&dir.join("src/set")], |o| o.volume_size = Some(128 * 1024));
    std::fs::remove_file(&r.volumes[1].path).unwrap();
    let e = ops::list(&ctx(), &ListOptions { path: s(&z), password: None, encoding: None }).unwrap_err();
    assert!(matches!(e.code(), "missing_volume" | "corrupt"), "{e}");

    // ZIP: the very first part gone, so the rest look like a lone .zip.
    let z1 = dir.join("x.zip");
    let r1 = pack(&z1, "zip", &[&dir.join("src/set")], |o| o.volume_size = Some(128 * 1024));
    std::fs::remove_file(&r1.volumes[0].path).unwrap();
    let e = ops::list(&ctx(), &ListOptions { path: s(&z1), password: None, encoding: None }).unwrap_err();
    assert_eq!(e.code(), "missing_volume", "{e}");

    // ZIP: the last part gone, starting from the first.
    let z2 = dir.join("y.zip");
    let r2 = pack(&z2, "zip", &[&dir.join("src/set")], |o| o.volume_size = Some(128 * 1024));
    std::fs::remove_file(&z2).unwrap();
    let e = ops::list(&ctx(), &ListOptions { path: r2.volumes[0].path.clone(), password: None, encoding: None }).unwrap_err();
    assert_eq!(e.code(), "missing_volume", "{e}");

    // 7z: the middle gone. The start survives, the data does not.
    let a = dir.join("a.7z");
    let r3 = pack(&a, "7z", &[&dir.join("src/set")], |o| o.volume_size = Some(128 * 1024));
    std::fs::remove_file(&r3.volumes[2].path).unwrap();
    let e = ops::list(&ctx(), &ListOptions { path: r3.volumes[0].path.clone(), password: None, encoding: None }).unwrap_err();
    assert!(matches!(e.code(), "corrupt" | "not_archive" | "io"), "{e}");

    // .002 picked when .001 is gone.
    let b = dir.join("b.7z");
    let r4 = pack(&b, "7z", &[&dir.join("src/set")], |o| o.volume_size = Some(128 * 1024));
    std::fs::remove_file(&r4.volumes[0].path).unwrap();
    let e = ops::list(&ctx(), &ListOptions { path: r4.volumes[1].path.clone(), password: None, encoding: None }).unwrap_err();
    assert_eq!(e.code(), "missing_volume", "{e}");

    // RAR: the last part gone.
    let c = dir.join("c.rar");
    let r5 = pack(&c, "rar", &[&dir.join("src/set")], |o| o.volume_size = Some(256 * 1024));
    std::fs::remove_file(&r5.volumes.last().unwrap().path).unwrap();
    let e = ops::list(&ctx(), &ListOptions { path: r5.volumes[0].path.clone(), password: None, encoding: None });
    assert!(e.is_err(), "a short RAR set must not open as if complete");
}

#[test]
fn volume_sizes_too_small_are_refused() {
    let dir = scratch("split-small");
    std::fs::write(dir.join("a.txt"), b"x").unwrap();
    let f = dir.join("a.txt");
    assert_eq!(try_pack(&dir.join("a.7z"), "7z", &[&f], |o| o.volume_size = Some(100)).unwrap_err().code(), "invalid");
    assert_eq!(try_pack(&dir.join("a.zip"), "zip", &[&f], |o| o.volume_size = Some(4096)).unwrap_err().code(), "invalid");
    // ... but as .001 slices ZIP can go smaller.
    let r = pack(&dir.join("n.zip"), "zip", &[&f], |o| {
        o.volume_size = Some(4096);
        o.zip_split_style = Some("numbered".into());
    });
    assert_eq!(r.volumes.len(), 1);
}

#[test]
fn a_set_that_fits_in_one_part_still_opens() {
    let dir = scratch("split-one");
    std::fs::write(dir.join("a.txt"), b"tiny").unwrap();
    let f = dir.join("a.txt");
    let z = pack(&dir.join("one.zip"), "zip", &[&f], |o| o.volume_size = Some(1 << 20));
    assert_eq!(z.volumes.len(), 1);
    assert!(z.volumes[0].path.ends_with("one.zip"), "{}", z.volumes[0].path);
    assert_eq!(unpack(Path::new(&z.volumes[0].path), &dir.join("oz"), None)["a.txt"], b"tiny");
    let a = pack(&dir.join("one.7z"), "7z", &[&f], |o| o.volume_size = Some(1 << 20));
    assert!(a.volumes[0].path.ends_with("one.7z.001"));
    assert_eq!(unpack(Path::new(&a.volumes[0].path), &dir.join("oa"), None)["a.txt"], b"tiny");
}

#[test]
fn old_parts_do_not_mix_with_new_ones() {
    let dir = scratch("split-stale");
    big_tree(&dir.join("src"));
    let a = dir.join("a.7z");
    let first = pack(&a, "7z", &[&dir.join("src/set")], |o| o.volume_size = Some(64 * 1024));
    let second = pack(&a, "7z", &[&dir.join("src/set/two.bin")], |o| {
        o.volume_size = Some(256 * 1024);
        o.overwrite = true;
    });
    assert!(second.volumes.len() < first.volumes.len());
    assert!(!Path::new(&first.volumes.last().unwrap().path).exists(), "stale last part left behind");
    let info = listing(Path::new(&second.volumes[0].path), None);
    assert_eq!(info.volumes.len(), second.volumes.len());
    test_ok(Path::new(&second.volumes[0].path), None);
}

#[test]
fn seven_zip_made_volumes_open_here() {
    let dir = scratch("split-from-7z");
    let want = big_tree(&dir.join("src"));
    let src_glob = format!("{}", dir.join("src").join("set").display());
    for (name, sw) in [("theirs.7z", "-t7z"), ("theirs.zip", "-tzip"), ("theirs.tar", "-ttar")] {
        let out = dir.join(name);
        let (ok, log) = run_7z(&["a", sw, "-v128k", &s(&out), &src_glob]);
        assert!(ok, "{log}");
        let first = dir.join(format!("{name}.001"));
        assert!(first.exists(), "{log}");
        assert!(dir.join(format!("{name}.002")).exists(), "7-Zip made only one part");
        let got = unpack(&first, &dir.join(format!("out-{name}")), None);
        assert_same(&got, &want, name);
    }
}

#[test]
fn split_tool_slices_any_file_and_joins_it_back() {
    use zipmaster_core::tools::{self, JoinOptions, SplitOptions};
    let dir = scratch("split-tool");
    let f = dir.join("movie.mp4");
    let data = noise(1_000_001, 4);
    std::fs::write(&f, &data).unwrap();
    let parts = tools::split_file(&ctx(), &SplitOptions { path: s(&f), volume_size: 250_000, out_dir: None }).unwrap();
    assert_eq!(parts.len(), 5);
    for (i, p) in parts.iter().enumerate() {
        assert_eq!(p.size, if i < 4 { 250_000 } else { 1 });
        assert!(p.path.ends_with(&format!("movie.mp4.{:03}", i + 1)));
    }
    std::fs::rename(&f, dir.join("original.mp4")).unwrap();

    // From a middle part, to the default name.
    let joined = tools::join_files(&ctx(), &JoinOptions { path: parts[2].path.clone(), output: None, overwrite: false }).unwrap();
    assert!(joined.path.ends_with("movie.mp4"));
    assert_eq!(std::fs::read(&joined.path).unwrap(), data);

    // Will not overwrite unless told.
    let e = tools::join_files(&ctx(), &JoinOptions { path: parts[0].path.clone(), output: None, overwrite: false }).unwrap_err();
    assert_eq!(e.code(), "exists");
    tools::join_files(&ctx(), &JoinOptions { path: parts[0].path.clone(), output: None, overwrite: true }).unwrap();

    // To another folder.
    let elsewhere = dir.join("parts");
    std::fs::create_dir_all(&elsewhere).unwrap();
    let moved = tools::split_file(&ctx(), &SplitOptions { path: s(&dir.join("original.mp4")), volume_size: 400_000, out_dir: Some(s(&elsewhere)) }).unwrap();
    assert!(moved[0].path.starts_with(&s(&elsewhere)));
    assert_eq!(moved.len(), 3);

    // 7-Zip joins ours.
    let out = dir.join("7z-joined");
    let got = seven_zip_extracts(Path::new(&moved[0].path), &out, None);
    assert_eq!(got.values().next().unwrap(), &data);
}

#[test]
fn join_refuses_what_is_not_a_part() {
    use zipmaster_core::tools::{self, JoinOptions};
    let dir = scratch("split-join-no");
    std::fs::write(dir.join("a.txt"), b"x").unwrap();
    let e = tools::join_files(&ctx(), &JoinOptions { path: s(&dir.join("a.txt")), output: None, overwrite: false }).unwrap_err();
    assert_eq!(e.code(), "invalid");
}

#[test]
fn extract_selection_works_across_parts() {
    let dir = scratch("split-select");
    let want = big_tree(&dir.join("src"));
    let a = dir.join("a.zip");
    let r = pack(&a, "zip", &[&dir.join("src/set")], |o| o.volume_size = Some(128 * 1024));
    let report = ops::extract(
        &ctx(),
        &ExtractOptions { path: r.volumes[1].path.clone(), dest: s(&dir.join("out")), selection: vec!["set/two.bin".into()], ..ExtractOptions::default() },
    )
    .unwrap();
    assert_eq!(report.files, 1);
    assert_eq!(std::fs::read(dir.join("out/set/two.bin")).unwrap(), want["set/two.bin"]);
    assert!(!dir.join("out/set/one.bin").exists());
}
