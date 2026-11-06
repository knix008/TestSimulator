//! Every format and method goes in and comes back, and 7-Zip agrees with what we wrote.

mod common;
use common::*;

/// Our archive unpacks to the original by our reader, passes our test and is what 7-Zip reads too.
fn check(format: &str, ext: &str, method: &str, level: u32) {
    let dir = scratch(&format!("rt-{}-{method}-{level}", ext.replace('.', "_")));
    let src = dir.join("src");
    let want = {
        let tree = sample_tree(&src);
        tree.into_iter().map(|(k, v)| (k, v)).collect::<std::collections::BTreeMap<_, _>>()
    };
    let archive = dir.join(format!("out.{ext}"));
    let report = pack(&archive, format, &[&src.join("data")], |o| {
        o.method = method.to_string();
        o.level = Some(level);
    });
    assert_eq!(report.volumes.len(), 1);
    assert_eq!(report.files, want.len() as u64);
    assert!(report.folders >= 5, "folders: {}", report.folders);

    let info = listing(&archive, None);
    assert_eq!(info.format, format, "detected format");
    let names: Vec<_> = info.entries.iter().filter(|e| !e.is_dir).map(|e| e.path.clone()).collect();
    for k in want.keys() {
        assert!(names.contains(k), "{k} not listed; have {names:?}");
    }
    assert!(info.entries.iter().any(|e| e.is_dir && e.path == "data/empty-folder"), "empty folder kept");

    test_ok(&archive, None);
    let got = unpack(&archive, &dir.join("ours"), None);
    assert_same(&got, &want, "our extraction");
    assert!(dir.join("ours/data/empty-folder").is_dir(), "empty folder extracted");

    let mut theirs = seven_zip_extracts(&archive, &dir.join("theirs"), None);
    // 7-Zip takes off one layer at a time.
    if format.starts_with("tar.") {
        let inner = dir.join("theirs").join("out.tar");
        theirs = seven_zip_extracts(&inner, &dir.join("theirs2"), None);
    }
    assert_same(&theirs, &want, "7-Zip's extraction");
}

// ZIP
#[test] fn zip_store() { check("zip", "zip", "store", 0); }
#[test] fn zip_deflate_fast() { check("zip", "zip", "deflate", 1); }
#[test] fn zip_deflate_normal() { check("zip", "zip", "deflate", 6); }
#[test] fn zip_deflate_best() { check("zip", "zip", "deflate", 9); }
#[test] fn zip_bzip2() { check("zip", "zip", "bzip2", 6); }
#[test] fn zip_lzma() { check("zip", "zip", "lzma", 6); }
#[test] fn zip_xz() { check("zip", "zip", "xz", 6); }
#[test] fn zip_zstd() { check("zip", "zip", "zstd", 3); }

// 7z
#[test] fn sevenz_lzma2() { check("7z", "7z", "lzma2", 6); }
#[test] fn sevenz_lzma2_fast() { check("7z", "7z", "lzma2", 1); }
#[test] fn sevenz_lzma2_ultra() { check("7z", "7z", "lzma2", 9); }
#[test] fn sevenz_lzma() { check("7z", "7z", "lzma", 6); }
#[test] fn sevenz_bzip2() { check("7z", "7z", "bzip2", 6); }
#[test] fn sevenz_deflate() { check("7z", "7z", "deflate", 6); }
#[test] fn sevenz_ppmd() { check("7z", "7z", "ppmd", 6); }
#[test] fn sevenz_copy() { check("7z", "7z", "copy", 0); }

// RAR
#[test] fn rar5_store() { check("rar", "rar", "", 0); }
#[test] fn rar5_fast() { check("rar", "rar", "", 1); }
#[test] fn rar5_normal() { check("rar", "rar", "", 5); }
#[test] fn rar5_best() { check("rar", "rar", "", 9); }

// TAR family
#[test] fn tar_plain() { check("tar", "tar", "", 6); }
#[test] fn tar_gz() { check("tar.gz", "tar.gz", "", 6); }
#[test] fn tar_bz2() { check("tar.bz2", "tar.bz2", "", 6); }
#[test] fn tar_xz() { check("tar.xz", "tar.xz", "", 6); }

#[test]
fn tar_zst() {
    // 7-Zip 26 opens .zst, but a tar inside takes a second step, so this one is checked by our
    // reader here and by 7-Zip's decoder in single_file_formats.
    let dir = scratch("rt-tar-zst");
    let src = dir.join("src");
    let want = sample_tree(&src);
    let archive = dir.join("out.tar.zst");
    pack(&archive, "tar.zst", &[&src.join("data")], |_| {});
    assert_eq!(listing(&archive, None).format, "tar.zst");
    test_ok(&archive, None);
    assert_same(&unpack(&archive, &dir.join("ours"), None), &want, "tar.zst");
}

#[test]
fn rar4_writes_and_reads() {
    let dir = scratch("rt-rar4");
    let src = dir.join("src");
    let want = sample_tree(&src);
    let archive = dir.join("out.rar");
    pack(&archive, "rar", &[&src.join("data")], |o| {
        o.rar_version = Some("rar4".into());
        o.level = Some(5);
    });
    assert_eq!(listing(&archive, None).format, "rar");
    test_ok(&archive, None);
    assert_same(&unpack(&archive, &dir.join("ours"), None), &want, "rar4 ours");
    assert_same(&seven_zip_extracts(&archive, &dir.join("theirs"), None), &want, "rar4 7-Zip");
}

#[test]
fn single_file_formats() {
    let dir = scratch("rt-single");
    let file = dir.join("문서.txt");
    let data = text(500_000);
    std::fs::write(&file, &data).unwrap();
    for ext in ["gz", "bz2", "xz", "zst"] {
        let archive = dir.join(format!("문서.txt.{ext}"));
        let report = pack(&archive, ext, &[&file], |_| {});
        assert!(report.packed_size < data.len() as u64 / 2, "{ext} did not compress");
        let info = listing(&archive, None);
        assert_eq!(info.format, ext);
        assert_eq!(info.entries.len(), 1);
        assert_eq!(info.entries[0].path, "문서.txt", "{ext} name");
        test_ok(&archive, None);
        let got = unpack(&archive, &dir.join(format!("ours-{ext}")), None);
        assert_eq!(got["문서.txt"], data, "{ext} ours");
        let theirs = seven_zip_extracts(&archive, &dir.join(format!("theirs-{ext}")), None);
        let (_, bytes) = theirs.iter().next().unwrap();
        assert_eq!(*bytes, data, "{ext} 7-Zip");
    }
}

#[test]
fn single_file_format_refuses_several_files() {
    let dir = scratch("rt-single-refuse");
    let src = dir.join("src");
    sample_tree(&src);
    let err = try_pack(&dir.join("x.gz"), "gz", &[&src.join("data")], |_| {}).unwrap_err();
    assert_eq!(err.to_string(), "invalid: single_file_only");
}

#[test]
fn levels_change_the_result() {
    let dir = scratch("rt-levels");
    let file = dir.join("big.txt");
    let mut data = Vec::new();
    for i in 0..60_000u32 {
        data.extend_from_slice(format!("record {} value {}\n", i, i.wrapping_mul(2654435761)).as_bytes());
    }
    std::fs::write(&file, &data).unwrap();
    for (format, ext, method) in [("zip", "zip", "deflate"), ("7z", "7z", "lzma2")] {
        let fast = pack(&dir.join(format!("fast.{ext}")), format, &[&file], |o| {
            o.method = method.into();
            o.level = Some(1);
        });
        let best = pack(&dir.join(format!("best.{ext}")), format, &[&file], |o| {
            o.method = method.into();
            o.level = Some(9);
        });
        assert!(best.packed_size < fast.packed_size, "{format}: level 9 {} vs level 1 {}", best.packed_size, fast.packed_size);
    }
}

#[test]
fn solid_7z_is_smaller_and_reads_back() {
    let dir = scratch("rt-solid");
    let src = dir.join("src");
    std::fs::create_dir_all(&src).unwrap();
    let shared = noise(50_000, 3);
    for i in 0..6 {
        let mut d = shared.clone();
        d.extend_from_slice(format!("file {i}").as_bytes());
        std::fs::write(src.join(format!("f{i}.bin")), d).unwrap();
    }
    let plain = pack(&dir.join("plain.7z"), "7z", &[&src], |_| {});
    let solid = pack(&dir.join("solid.7z"), "7z", &[&src], |o| o.solid = true);
    assert!(solid.packed_size * 2 < plain.packed_size, "solid {} vs {}", solid.packed_size, plain.packed_size);
    assert!(listing(&dir.join("solid.7z"), None).solid);
    let got = unpack(&dir.join("solid.7z"), &dir.join("out"), None);
    assert_eq!(got.len(), 6);
    seven_zip_tests(&dir.join("solid.7z"), None);

    let rar = pack(&dir.join("solid.rar"), "rar", &[&src], |o| o.solid = true);
    assert!(rar.packed_size < plain.packed_size, "solid RAR {}", rar.packed_size);
    seven_zip_tests(&dir.join("solid.rar"), None);
}

#[test]
fn smart_store_skips_compressed_files() {
    let dir = scratch("rt-smart");
    std::fs::write(dir.join("photo.jpg"), text(40_000)).unwrap();
    std::fs::write(dir.join("note.txt"), text(40_000)).unwrap();
    let a = dir.join("a.zip");
    pack(&a, "zip", &[&dir.join("photo.jpg"), &dir.join("note.txt")], |_| {});
    let info = listing(&a, None);
    let method = |n: &str| info.entries.iter().find(|e| e.path == n).unwrap().method.clone();
    assert_eq!(method("photo.jpg"), "Store");
    assert_eq!(method("note.txt"), "Deflate");
    let b = dir.join("b.zip");
    pack(&b, "zip", &[&dir.join("photo.jpg")], |o| o.smart_store = Some(false));
    assert_eq!(listing(&b, None).entries[0].method, "Deflate");
}

#[test]
fn file_times_survive() {
    let dir = scratch("rt-times");
    let file = dir.join("old.txt");
    std::fs::write(&file, b"old").unwrap();
    let when = 1_500_000_000;
    filetime::set_file_mtime(&file, filetime::FileTime::from_unix_time(when, 0)).unwrap();
    for (format, ext) in [("zip", "zip"), ("7z", "7z"), ("rar", "rar"), ("tar", "tar"), ("tar.gz", "tar.gz")] {
        let archive = dir.join(format!("t.{ext}"));
        pack(&archive, format, &[&file], |_| {});
        let info = listing(&archive, None);
        assert_eq!(info.entries[0].mtime, Some(when), "{format} listing");
        let out = dir.join(format!("out-{ext}"));
        unpack(&archive, &out, None);
        let m = std::fs::metadata(out.join("old.txt")).unwrap().modified().unwrap();
        let secs = m.duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
        assert_eq!(secs, when, "{format} extracted");
    }
}

#[test]
fn listing_reports_sizes_and_checksums() {
    let dir = scratch("rt-sizes");
    let file = dir.join("a.txt");
    let data = text(30_000);
    std::fs::write(&file, &data).unwrap();
    for (format, ext) in [("zip", "zip"), ("7z", "7z"), ("rar", "rar")] {
        let archive = dir.join(format!("a.{ext}"));
        pack(&archive, format, &[&file], |_| {});
        let info = listing(&archive, None);
        let e = &info.entries[0];
        assert_eq!(e.size, Some(30_000), "{format} size");
        assert!(e.packed.unwrap() < 30_000, "{format} packed");
        assert!(!e.method.is_empty(), "{format} method");
        assert_eq!(info.packed_size, std::fs::metadata(&archive).unwrap().len());
        if format != "rar" {
            assert_eq!(e.crc, Some(crc32fast::hash(&data)), "{format} crc");
        }
    }
}

#[test]
fn root_folder_and_excludes_shape_the_archive() {
    let dir = scratch("rt-shape");
    let src = dir.join("src");
    sample_tree(&src);
    std::fs::write(src.join("data/skip.tmp"), b"x").unwrap();
    std::fs::create_dir_all(src.join("data/node_modules/pkg")).unwrap();
    std::fs::write(src.join("data/node_modules/pkg/i.js"), b"x").unwrap();
    let a = dir.join("a.zip");
    pack(&a, "zip", &[&src.join("data")], |o| {
        o.root_folder = Some("backup/2026".into());
        o.exclude = vec!["*.tmp".into(), "node_modules".into(), "*/deep".into()];
    });
    let paths: Vec<_> = listing(&a, None).entries.into_iter().map(|e| e.path).collect();
    assert!(paths.iter().all(|p| p.starts_with("backup/2026")), "{paths:?}");
    assert!(paths.iter().any(|p| p == "backup/2026/data/readme.txt"));
    assert!(!paths.iter().any(|p| p.contains("skip.tmp")));
    assert!(!paths.iter().any(|p| p.contains("node_modules")));
    assert!(!paths.iter().any(|p| p.contains("/deep")));
}

#[test]
fn archive_inside_its_own_source_does_not_swallow_itself() {
    let dir = scratch("rt-self");
    let src = dir.join("src");
    std::fs::create_dir_all(&src).unwrap();
    std::fs::write(src.join("a.txt"), b"a").unwrap();
    let a = src.join("self.zip");
    pack(&a, "zip", &[&src], |_| {});
    let names: Vec<_> = listing(&a, None).entries.into_iter().map(|e| e.path).collect();
    assert!(names.contains(&"src/a.txt".to_string()));
    assert!(!names.iter().any(|n| n.contains("self.zip")), "{names:?}");
}

#[test]
fn duplicate_names_are_refused() {
    let dir = scratch("rt-dup");
    std::fs::create_dir_all(dir.join("x")).unwrap();
    std::fs::create_dir_all(dir.join("y")).unwrap();
    std::fs::write(dir.join("x/a.txt"), b"1").unwrap();
    std::fs::write(dir.join("y/a.txt"), b"2").unwrap();
    let e = try_pack(&dir.join("a.zip"), "zip", &[&dir.join("x/a.txt"), &dir.join("y/a.txt")], |_| {}).unwrap_err();
    assert_eq!(e.code(), "invalid");
}

#[test]
fn memory_files_work_the_same_as_disk_files() {
    // The web build's storage: same engine, no disk.
    use std::sync::Arc;
    use zipmaster_core::ops::{self, CreateOptions, ExtractOptions, SourceSpec};
    use zipmaster_core::{Ctx, MemFs, NoProgress};

    for (format, ext) in [("zip", "zip"), ("7z", "7z"), ("rar", "rar"), ("tar.gz", "tar.gz"), ("tar.zst", "tar.zst")] {
        let mem = MemFs::new();
        mem.put("/in/folder/a.txt", text(100_000), Some(1_600_000_000));
        mem.put("/in/folder/한글.bin", noise(200_000, 1), None);
        let c = Ctx::new(Arc::new(mem.clone()), Arc::new(NoProgress));
        let output = format!("/out/x.{ext}");
        let report = ops::create(
            &c,
            &CreateOptions {
                output: output.clone(),
                format: format.into(),
                sources: vec![SourceSpec { path: "/in/folder".into(), name: None }],
                volume_size: Some(150_000),
                zip_split_style: None,
                ..CreateOptions::default()
            },
        )
        .unwrap();
        assert!(report.volumes.len() >= 2, "{format}: {:?}", report.volumes);
        for v in &report.volumes {
            assert!(v.size <= 150_000, "{format}: {} is {}", v.path, v.size);
        }
        let first = report.volumes[0].path.clone();
        ops::extract(&c, &ExtractOptions { path: first, dest: "/ex".into(), ..ExtractOptions::default() }).unwrap();
        assert_eq!(mem.read("/ex/folder/a.txt").unwrap(), text(100_000), "{format}");
        assert_eq!(mem.read("/ex/folder/한글.bin").unwrap(), noise(200_000, 1), "{format}");
    }
}

#[test]
fn empty_inputs() {
    let dir = scratch("rt-empty");
    let empty = dir.join("nothing");
    std::fs::create_dir_all(&empty).unwrap();
    let one = dir.join("zero.bin");
    std::fs::write(&one, b"").unwrap();
    for (format, ext) in [("zip", "zip"), ("7z", "7z"), ("rar", "rar"), ("tar", "tar"), ("tar.gz", "tar.gz")] {
        let a = dir.join(format!("folder.{ext}"));
        pack(&a, format, &[&empty], |_| {});
        let info = listing(&a, None);
        assert_eq!(info.entries.len(), 1, "{format}");
        assert!(info.entries[0].is_dir, "{format}");
        test_ok(&a, None);
        let b = dir.join(format!("file.{ext}"));
        pack(&b, format, &[&one], |_| {});
        let got = unpack(&b, &dir.join(format!("out-{ext}")), None);
        assert_eq!(got["zero.bin"].len(), 0, "{format}");
    }
    let nothing = try_pack(&dir.join("n.zip"), "zip", &[], |_| {}).unwrap_err();
    assert_eq!(nothing.code(), "invalid");
}
