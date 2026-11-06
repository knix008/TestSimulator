//! Passwords, and archives that try to do harm.

mod common;
use common::*;
use std::io::Write;
use std::path::Path;
use zipmaster_core::ops::{self, ExtractOptions, ListOptions, TestOptions};

fn src(dir: &Path) -> std::path::PathBuf {
    let p = dir.join("secret");
    std::fs::create_dir_all(&p).unwrap();
    std::fs::write(p.join("plan.txt"), text(30_000)).unwrap();
    std::fs::write(p.join("data.bin"), noise(30_000, 5)).unwrap();
    std::fs::write(p.join("한글.txt"), "비밀 문서".repeat(100)).unwrap();
    p
}

fn check_password(format: &str, ext: &str, tweak: impl FnOnce(&mut ops::CreateOptions)) {
    check_password_with(format, ext, "correct horse 배터리 42!", tweak);
}

fn check_password_with(format: &str, ext: &str, password: &str, tweak: impl FnOnce(&mut ops::CreateOptions)) {
    let dir = scratch(&format!("pw-{ext}"));
    let source = src(&dir);
    let want = read_tree(&source);
    let a = dir.join(format!("a.{ext}"));
    pack(&a, format, &[&source], |o| {
        o.password = Some(password.into());
        tweak(o);
    });

    // Not without the password.
    let e = ops::extract(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dir.join("none")), ..ExtractOptions::default() }).unwrap_err();
    assert_eq!(e.code(), "password_required", "{format}");
    assert!(!dir.join("none/secret/plan.txt").exists());

    // Not with the wrong one, and nothing half-written stays.
    let e = ops::extract(
        &ctx(),
        &ExtractOptions { path: s(&a), dest: s(&dir.join("wrong")), password: Some("nope".into()), ..ExtractOptions::default() },
    )
    .unwrap_err();
    assert_eq!(e.code(), "wrong_password", "{format}: {e}");
    let leftovers = if dir.join("wrong").exists() { read_tree(&dir.join("wrong")) } else { Default::default() };
    assert!(leftovers.is_empty(), "{format}: wrong password left {:?}", leftovers.keys());

    let e = ops::test(&ctx(), &TestOptions { path: s(&a), password: Some("nope".into()), encoding: None }).unwrap_err();
    assert_eq!(e.code(), "wrong_password", "{format}");

    // With the right one.
    test_ok(&a, Some(password));
    let got = unpack(&a, &dir.join("ok").join("x"), Some(password));
    for (k, v) in &want {
        assert_eq!(&got[&format!("secret/{k}")], v, "{format}: {k}");
    }

    // The plaintext really is not in the file.
    let raw = std::fs::read(&a).unwrap();
    assert!(!raw.windows(30).any(|w| w == &text(30)[..]), "{format}: plaintext visible");

    // 7-Zip agrees. Its password handling is independent of ours.
    let theirs = seven_zip_extracts(&a, &dir.join("7z"), Some(password));
    for (k, v) in &want {
        assert_eq!(&theirs[&format!("secret/{k}")], v, "{format} by 7-Zip: {k}");
    }
    let (bad, _) = run_7z(&["t", "-pnope", &s(&a)]);
    assert!(!bad, "{format}: 7-Zip accepted a wrong password");
}

const ASCII_PW: &str = "correct horse battery 42!";
#[test] fn zip_aes256() { check_password_with("zip", "zip", ASCII_PW, |o| o.encryption = Some("aes256".into())); }
#[test] fn zip_aes128() { check_password_with("zip", "zip", ASCII_PW, |o| o.encryption = Some("aes128".into())); }
#[test] fn zip_zipcrypto() { check_password_with("zip", "zip", ASCII_PW, |o| o.encryption = Some("zipcrypto".into())); }
#[test] fn zip_aes_with_lzma() { check_password_with("zip", "zip", ASCII_PW, |o| o.method = "lzma".into()); }

#[test]
fn zip_korean_password_is_utf8_as_winzip_specifies() {
    let dir = scratch("pw-kr");
    let source = src(&dir);
    let a = dir.join("k.zip");
    pack(&a, "zip", &[&source], |o| o.password = Some("비밀번호".into()));
    test_ok(&a, Some("비밀번호"));
    let e = ops::test(&ctx(), &TestOptions { path: s(&a), password: Some("비밀번호1".into()), encoding: None }).unwrap_err();
    assert_eq!(e.code(), "wrong_password");
}
#[test] fn sevenz_aes() { check_password("7z", "7z", |_| {}); }
#[test] fn rar5_aes() { check_password("rar", "rar", |_| {}); }

#[test]
fn zip_method_names_show_the_cipher() {
    let dir = scratch("pw-names");
    let f = dir.join("a.txt");
    std::fs::write(&f, text(1000)).unwrap();
    for (enc, label) in [("aes256", "AES-256"), ("aes128", "AES-128"), ("zipcrypto", "ZipCrypto")] {
        let a = dir.join(format!("{enc}.zip"));
        pack(&a, "zip", &[&f], |o| {
            o.password = Some("x".into());
            o.encryption = Some(enc.into());
        });
        let info = listing(&a, None);
        assert!(info.encrypted);
        assert!(info.entries[0].encrypted);
        assert!(info.entries[0].method.contains(label), "{}", info.entries[0].method);
    }
}

#[test]
fn encrypted_names_hide_the_listing() {
    let dir = scratch("pw-headers");
    let source = src(&dir);
    for (format, ext) in [("7z", "7z"), ("rar", "rar")] {
        let a = dir.join(format!("h.{ext}"));
        pack(&a, format, &[&source], |o| {
            o.password = Some("pw".into());
            o.encrypt_names = true;
        });
        let e = ops::list(&ctx(), &ListOptions { path: s(&a), password: None, encoding: None }).unwrap_err();
        assert_eq!(e.code(), "password_required", "{format}: {e}");
        let e = ops::list(&ctx(), &ListOptions { path: s(&a), password: Some("no".into()), encoding: None }).unwrap_err();
        assert_eq!(e.code(), "wrong_password", "{format}: {e}");
        let info = listing(&a, Some("pw"));
        assert!(info.header_encrypted, "{format}");
        assert!(info.entries.iter().any(|x| x.path == "secret/plan.txt"), "{format}");
        let raw = std::fs::read(&a).unwrap();
        assert!(!raw.windows(8).any(|w| w == b"plan.txt"), "{format}: names visible");
        seven_zip_tests(&a, Some("pw"));
    }
}

#[test]
fn seven_zip_made_encrypted_archives_open_here() {
    let dir = scratch("pw-theirs");
    let source = src(&dir);
    let want = read_tree(&source);
    let source = s(&source);
    for (file, args) in [
        ("zc.zip", vec!["a", "-tzip", "-mem=ZipCrypto", "-psecret"]),
        ("aes.zip", vec!["a", "-tzip", "-mem=AES256", "-psecret"]),
        ("aes128.zip", vec!["a", "-tzip", "-mem=AES128", "-psecret"]),
        ("plain.7z", vec!["a", "-t7z", "-psecret"]),
        ("headers.7z", vec!["a", "-t7z", "-mhe=on", "-psecret"]),
    ] {
        let out = s(&dir.join(file));
        let mut all = args.clone();
        all.push(&out);
        all.push(&source);
        let (ok, log) = run_7z(&all);
        assert!(ok, "{log}");
        let got = unpack(Path::new(&out), &dir.join(format!("x-{file}")), Some("secret"));
        for (k, v) in &want {
            assert_eq!(&got[&format!("secret/{k}")], v, "{file}: {k}");
        }
        let e = ops::test(&ctx(), &TestOptions { path: out.clone(), password: Some("bad".into()), encoding: None }).unwrap_err();
        assert_eq!(e.code(), "wrong_password", "{file}");
    }
}

// ── Crafted archives ──────────────────────────────────────────────────────────────────────────

/// A stored ZIP with exactly the names given, however nasty.
fn craft_zip(path: &Path, entries: &[(&[u8], &[u8])], utf8: bool) {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, data) in entries {
        let at = out.len() as u32;
        let crc = crc32fast::hash(data);
        let flags: u16 = if utf8 { 1 << 11 } else { 0 };
        let mut head = Vec::new();
        head.extend_from_slice(b"PK\x03\x04");
        head.extend_from_slice(&20u16.to_le_bytes());
        head.extend_from_slice(&flags.to_le_bytes());
        head.extend_from_slice(&0u16.to_le_bytes());
        head.extend_from_slice(&0u16.to_le_bytes());
        head.extend_from_slice(&0x21u16.to_le_bytes());
        head.extend_from_slice(&crc.to_le_bytes());
        head.extend_from_slice(&(data.len() as u32).to_le_bytes());
        head.extend_from_slice(&(data.len() as u32).to_le_bytes());
        head.extend_from_slice(&(name.len() as u16).to_le_bytes());
        head.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&head);
        out.extend_from_slice(name);
        out.extend_from_slice(data);

        central.extend_from_slice(b"PK\x01\x02");
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&head[4..30]);
        central.extend_from_slice(&0u16.to_le_bytes()); // comment length
        central.extend_from_slice(&0u16.to_le_bytes()); // disk
        central.extend_from_slice(&0u16.to_le_bytes()); // internal attributes
        central.extend_from_slice(&0x20u32.to_le_bytes()); // external attributes
        central.extend_from_slice(&at.to_le_bytes());
        central.extend_from_slice(name);
    }
    let cd_at = out.len() as u32;
    out.extend_from_slice(&central);
    out.extend_from_slice(b"PK\x05\x06");
    out.extend_from_slice(&[0u8; 4]);
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    out.extend_from_slice(&(central.len() as u32).to_le_bytes());
    out.extend_from_slice(&cd_at.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    let mut f = std::fs::File::create(path).unwrap();
    f.write_all(&out).unwrap();
}

#[test]
fn zip_slip_cannot_escape_the_destination() {
    let dir = scratch("evil-slip");
    let a = dir.join("evil.zip");
    craft_zip(
        &a,
        &[
            (b"../../outside.txt", b"pwned"),
            (b"good/../../also-outside.txt", b"pwned"),
            (b"..\\..\\windows-style.txt", b"pwned"),
            (b"fine/ok.txt", b"ok"),
        ],
        false,
    );
    let dest = dir.join("sub/dest");
    let r = ops::extract(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dest), ..ExtractOptions::default() }).unwrap();
    assert_eq!(r.files, 1);
    assert_eq!(r.unsafe_paths.len(), 3, "{:?}", r.unsafe_paths);
    assert_eq!(std::fs::read(dest.join("fine/ok.txt")).unwrap(), b"ok");
    assert!(!dir.join("outside.txt").exists());
    assert!(!dir.join("sub/outside.txt").exists());
    assert!(!dir.join("sub/also-outside.txt").exists());
    assert!(!dir.join("windows-style.txt").exists());
    let files = read_tree(&dir);
    let pwned: Vec<_> = files.iter().filter(|(_, v)| v.as_slice() == b"pwned").map(|(k, _)| k.clone()).collect();
    assert!(pwned.is_empty(), "{pwned:?}");
}

#[test]
fn absolute_paths_land_inside_the_destination() {
    let dir = scratch("evil-abs");
    let a = dir.join("abs.zip");
    let target = format!("{}/escaped.txt", s(&dir).replace('\\', "/"));
    craft_zip(&a, &[(target.as_bytes(), b"x"), (b"/etc/passwd-like", b"y"), (b"C:\\evil\\file.txt", b"z")], false);
    let dest = dir.join("dest");
    let r = ops::extract(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dest), ..ExtractOptions::default() }).unwrap();
    assert_eq!(r.files, 3);
    assert!(!dir.join("escaped.txt").exists());
    assert!(dest.join("etc/passwd-like").exists());
    assert!(dest.join("evil/file.txt").exists());
    for w in &r.written {
        assert!(Path::new(w).starts_with(&dest), "{w} is outside");
    }
}

#[test]
fn safe_relative_rules() {
    use ops::safe_relative as r;
    assert_eq!(r("a/b.txt").as_deref(), Some("a/b.txt"));
    assert_eq!(r("./a//b.txt").as_deref(), Some("a/b.txt"));
    assert_eq!(r("a\\b.txt").as_deref(), Some("a/b.txt"));
    assert_eq!(r("../x"), None);
    assert_eq!(r("a/../../x"), None);
    assert_eq!(r(""), None);
    assert_eq!(r("/"), None);
    assert_eq!(r("C:\\x").as_deref(), Some("x"));
    assert_eq!(r("a\u{0}b/c\u{7}d").as_deref(), Some("ab/cd"));
    if cfg!(windows) {
        assert_eq!(r("CON").as_deref(), Some("_CON"));
        assert_eq!(r("nul.txt").as_deref(), Some("_nul.txt"));
        assert_eq!(r("LPT1.log").as_deref(), Some("_LPT1.log"));
        assert_eq!(r("a:b?c*.txt").as_deref(), Some("a_b_c_.txt"));
        assert_eq!(r("dots...").as_deref(), Some("dots"));
        // An NTFS alternate stream must not be reachable.
        assert_eq!(r("file.txt:stream").as_deref(), Some("file.txt_stream"));
    }
}

#[test]
fn tar_symlinks_are_not_created() {
    let dir = scratch("evil-link");
    let a = dir.join("l.tar");
    {
        let f = std::fs::File::create(&a).unwrap();
        let mut b = tar::Builder::new(f);
        let mut h = tar::Header::new_gnu();
        h.set_entry_type(tar::EntryType::Symlink);
        h.set_size(0);
        h.set_mode(0o777);
        h.set_cksum();
        b.append_link(&mut h, "link-out", "../../../../secret").unwrap();
        let mut h2 = tar::Header::new_gnu();
        h2.set_size(5);
        h2.set_mode(0o644);
        h2.set_cksum();
        b.append_data(&mut h2, "link-out/payload.txt", &b"hello"[..]).unwrap();
        b.finish().unwrap();
    }
    let dest = dir.join("dest");
    let r = ops::extract(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dest), ..ExtractOptions::default() }).unwrap();
    assert_eq!(r.links, vec!["link-out".to_string()]);
    // The file behind it lands in a real folder of that name, inside the destination.
    assert_eq!(std::fs::read(dest.join("link-out/payload.txt")).unwrap(), b"hello");
    assert!(std::fs::symlink_metadata(dest.join("link-out")).unwrap().is_dir());
}

#[test]
fn gzip_header_name_cannot_choose_a_folder() {
    let dir = scratch("evil-gz");
    let a = dir.join("x.gz");
    let f = std::fs::File::create(&a).unwrap();
    let mut gz = flate2::GzBuilder::new().filename("../../evil.txt").write(f, flate2::Compression::default());
    gz.write_all(b"data").unwrap();
    gz.finish().unwrap();
    let dest = dir.join("sub/dest");
    let r = ops::extract(&ctx(), &ExtractOptions { path: s(&a), dest: s(&dest), ..ExtractOptions::default() }).unwrap();
    assert_eq!(r.files, 1);
    assert!(dest.join("evil.txt").exists());
    assert!(!dir.join("evil.txt").exists());
}

#[test]
fn garbage_is_reported_never_crashes() {
    let dir = scratch("evil-garbage");
    for (name, data) in [
        ("empty.zip", Vec::new()),
        ("noise.zip", noise(5000, 1)),
        ("noise.7z", noise(5000, 2)),
        ("noise.rar", noise(5000, 3)),
        ("sig-only.zip", b"PK\x03\x04".to_vec()),
        ("sig-only.7z", vec![0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]),
        ("sig-only.rar", b"Rar!\x1a\x07\x01\x00".to_vec()),
        ("sig-only.gz", vec![0x1F, 0x8B]),
        ("sig-only.xz", vec![0xFD, b'7', b'z', b'X', b'Z', 0]),
        ("sig-only.zst", vec![0x28, 0xB5, 0x2F, 0xFD]),
        ("sig-only.bz2", b"BZh".to_vec()),
        ("sig-only.cab", b"MSCF".to_vec()),
    ] {
        let p = dir.join(name);
        std::fs::write(&p, &data).unwrap();
        let listed = ops::list(&ctx(), &ListOptions { path: s(&p), password: None, encoding: None });
        let tested = ops::test(&ctx(), &TestOptions { path: s(&p), password: None, encoding: None });
        match (&listed, &tested) {
            (Ok(_), Ok(r)) => assert!(!r.ok, "{name} passed its test"),
            _ => {} // an error is the right answer, as long as it is an error
        }
        assert!(listed.is_err() || tested.is_err() || !tested.unwrap().ok, "{name}");
    }
}

#[test]
fn zip_header_lengths_cannot_overrun() {
    // A central record claiming a huge name; a directory claiming to be far bigger than the file.
    let dir = scratch("evil-lengths");
    let a = dir.join("ok.zip");
    craft_zip(&a, &[(b"a.txt", b"x")], false);
    let good = std::fs::read(&a).unwrap();
    let cd = good.windows(4).position(|w| w == b"PK\x01\x02").unwrap();

    let mut name_long = good.clone();
    name_long[cd + 28] = 0xFF;
    name_long[cd + 29] = 0xFF;
    let p = dir.join("long-name.zip");
    std::fs::write(&p, name_long).unwrap();
    assert!(ops::list(&ctx(), &ListOptions { path: s(&p), password: None, encoding: None }).is_err());

    let eocd = good.windows(4).rposition(|w| w == b"PK\x05\x06").unwrap();
    let mut size_big = good.clone();
    size_big[eocd + 12..eocd + 16].copy_from_slice(&0x7FFF_FFFFu32.to_le_bytes());
    let p = dir.join("big-cd.zip");
    std::fs::write(&p, size_big).unwrap();
    assert!(ops::list(&ctx(), &ListOptions { path: s(&p), password: None, encoding: None }).is_err());
}

#[test]
fn old_korean_zip_names_decode() {
    let dir = scratch("names-kr");
    let (euc, _, _) = encoding_rs::EUC_KR.encode("한글문서/보고서.txt");
    let a = dir.join("kr.zip");
    craft_zip(&a, &[(&euc, b"old windows")], false);
    let info = listing(&a, None);
    assert_eq!(info.entries[0].path, "한글문서/보고서.txt");
    let got = unpack(&a, &dir.join("o"), None);
    assert_eq!(got["한글문서/보고서.txt"], b"old windows");

    // UTF-8 without the flag, as some Unix tools write it.
    let u = dir.join("u.zip");
    craft_zip(&u, &[("한글.txt".as_bytes(), b"x")], false);
    assert_eq!(listing(&u, None).entries[0].path, "한글.txt");

    // The flag decides when it is set.
    let f = dir.join("f.zip");
    craft_zip(&f, &[("일본語.txt".as_bytes(), b"x")], true);
    assert_eq!(listing(&f, None).entries[0].path, "일본語.txt");

    // A chosen encoding overrides the guess.
    let (sjis, _, _) = encoding_rs::SHIFT_JIS.encode("日本語.txt");
    let j = dir.join("j.zip");
    craft_zip(&j, &[(&sjis, b"x")], false);
    let info = ops::list(&ctx(), &ListOptions { path: s(&j), password: None, encoding: Some("shift_jis".into()) }).unwrap();
    assert_eq!(info.entries[0].path, "日本語.txt");
}
