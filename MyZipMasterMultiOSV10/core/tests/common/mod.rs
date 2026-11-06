//! Shared by the engine tests. Everything happens under Cargo's scratch folder: no test touches a
//! real file of the user's.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;

use zipmaster_core::ops::{self, CreateOptions, CreateReport, ExtractOptions, ListOptions, SourceSpec};
use zipmaster_core::{ArchiveInfo, Ctx, Fs, NoProgress, OsFs, Progress};

static NEXT: AtomicU32 = AtomicU32::new(0);

/// A fresh, empty folder for one test.
pub fn scratch(name: &str) -> PathBuf {
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let dir = Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("{name}-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

pub fn ctx() -> Ctx {
    let fs: Fs = Arc::new(OsFs);
    Ctx::new(fs, Arc::new(NoProgress))
}

pub fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

/// Deterministic noise, which does not compress.
pub fn noise(len: usize, seed: u64) -> Vec<u8> {
    let mut state = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1;
    let mut out = Vec::with_capacity(len + 8);
    while out.len() < len {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        out.extend_from_slice(&state.to_le_bytes());
    }
    out.truncate(len);
    out
}

pub fn text(len: usize) -> Vec<u8> {
    let line = b"The quick brown fox jumps over the lazy dog. 0123456789\n";
    line.iter().cycle().take(len).copied().collect()
}

/// A tree with what tends to break archivers: Korean names, an empty file and folder, deep paths,
/// a long name and data that does not compress.
pub fn sample_tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let files: Vec<(&str, Vec<u8>)> = vec![
        ("data/readme.txt", text(20_000)),
        ("data/noise.bin", noise(70_000, 7)),
        ("data/empty.dat", Vec::new()),
        ("data/한글 폴더/보고서.txt", "안녕하세요, 압축 시험입니다.\n".repeat(200).into_bytes()),
        ("data/deep/a/b/c/d/nested.log", text(3_000)),
        (
            "data/long-name-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.txt",
            b"long".to_vec(),
        ),
    ];
    let mut map = BTreeMap::new();
    for (name, data) in files {
        let path = root.join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &data).unwrap();
        map.insert(name.to_string(), data);
    }
    std::fs::create_dir_all(root.join("data/empty-folder")).unwrap();
    map
}

/// Every file under a folder, by relative `/` path.
pub fn read_tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn go(dir: &Path, prefix: &str, out: &mut BTreeMap<String, Vec<u8>>) {
        for item in std::fs::read_dir(dir).unwrap() {
            let item = item.unwrap();
            let name = item.file_name().to_string_lossy().into_owned();
            let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            if item.path().is_dir() {
                go(&item.path(), &rel, out);
            } else {
                out.insert(rel, std::fs::read(item.path()).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    go(root, "", &mut out);
    out
}

pub fn assert_same(got: &BTreeMap<String, Vec<u8>>, want: &BTreeMap<String, Vec<u8>>, what: &str) {
    let g: Vec<_> = got.keys().collect();
    let w: Vec<_> = want.keys().collect();
    assert_eq!(g, w, "{what}: different files");
    for (k, v) in want {
        assert!(got[k] == *v, "{what}: {k} differs ({} vs {} bytes)", got[k].len(), v.len());
    }
}

pub fn pack(output: &Path, format: &str, sources: &[&Path], tweak: impl FnOnce(&mut CreateOptions)) -> CreateReport {
    try_pack(output, format, sources, tweak).unwrap_or_else(|e| panic!("create {format}: {e}"))
}

pub fn try_pack(
    output: &Path,
    format: &str,
    sources: &[&Path],
    tweak: impl FnOnce(&mut CreateOptions),
) -> zipmaster_core::Result<CreateReport> {
    let mut o = CreateOptions {
        output: s(output),
        format: format.to_string(),
        sources: sources.iter().map(|p| SourceSpec { path: s(p), name: None }).collect(),
        ..CreateOptions::default()
    };
    tweak(&mut o);
    ops::create(&ctx(), &o)
}

pub fn listing(path: &Path, password: Option<&str>) -> ArchiveInfo {
    ops::list(&ctx(), &ListOptions { path: s(path), password: password.map(String::from), encoding: None })
        .unwrap_or_else(|e| panic!("list {}: {e}", path.display()))
}

pub fn unpack(path: &Path, dest: &Path, password: Option<&str>) -> BTreeMap<String, Vec<u8>> {
    let report = ops::extract(
        &ctx(),
        &ExtractOptions { path: s(path), dest: s(dest), password: password.map(String::from), ..ExtractOptions::default() },
    )
    .unwrap_or_else(|e| panic!("extract {}: {e}", path.display()));
    assert!(report.failed.is_empty(), "failed entries: {:?}", report.failed);
    read_tree(dest)
}

pub fn test_ok(path: &Path, password: Option<&str>) {
    let r = ops::test(&ctx(), &ops::TestOptions { path: s(path), password: password.map(String::from), encoding: None }).unwrap();
    assert!(r.ok, "test failed: {:?}", r.failed);
}

// ── 7-Zip, the independent witness ────────────────────────────────────────────────────────────

pub fn seven_zip() -> Option<String> {
    for c in ["C:\\Program Files\\7-Zip\\7z.exe", "C:\\Program Files (x86)\\7-Zip\\7z.exe", "/usr/bin/7z", "/usr/bin/7zz", "/opt/homebrew/bin/7zz"] {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    None
}

/// The path to 7z. Interop is not optional: a machine without 7-Zip fails loudly, not silently.
pub fn sz() -> String {
    seven_zip().expect("7-Zip is required for the interoperability tests (install 7-Zip)")
}

pub fn run_7z(args: &[&str]) -> (bool, String) {
    let out = Command::new(sz()).args(args).output().expect("7z runs");
    let mut all = String::from_utf8_lossy(&out.stdout).into_owned();
    all.push_str(&String::from_utf8_lossy(&out.stderr));
    (out.status.success(), all)
}

/// 7-Zip extracts it, and its copy of the data must match.
pub fn seven_zip_extracts(archive: &Path, dest: &Path, password: Option<&str>) -> BTreeMap<String, Vec<u8>> {
    std::fs::create_dir_all(dest).unwrap();
    let mut args = vec!["x".to_string(), "-y".to_string(), format!("-o{}", s(dest))];
    if let Some(p) = password {
        args.push(format!("-p{p}"));
    }
    args.push(s(archive));
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let (ok, log) = run_7z(&refs);
    assert!(ok, "7z could not extract {}:\n{log}", archive.display());
    read_tree(dest)
}

pub fn seven_zip_tests(archive: &Path, password: Option<&str>) {
    let mut args = vec!["t".to_string()];
    if let Some(p) = password {
        args.push(format!("-p{p}"));
    }
    args.push(s(archive));
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let (ok, log) = run_7z(&refs);
    assert!(ok, "7z rejects {}:\n{log}", archive.display());
}

// ── Progress ──────────────────────────────────────────────────────────────────────────────────

/// Cancels after a set number of progress updates.
pub struct CancelAfter {
    pub left: AtomicU64,
    pub seen: AtomicU64,
}

impl CancelAfter {
    pub fn new(updates: u64) -> Arc<Self> {
        Arc::new(CancelAfter { left: AtomicU64::new(updates), seen: AtomicU64::new(0) })
    }
}

impl Progress for CancelAfter {
    fn update(&self, _: u64, _: u64, _: &str) {
        self.seen.fetch_add(1, Ordering::Relaxed);
        let _ = self.left.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_sub(1));
    }
    fn cancelled(&self) -> bool {
        self.left.load(Ordering::Relaxed) == 0
    }
}

/// Records the last progress seen.
#[derive(Default)]
pub struct Recorder {
    pub done: AtomicU64,
    pub total: AtomicU64,
    pub calls: AtomicU64,
}

impl Progress for Recorder {
    fn update(&self, done: u64, total: u64, _: &str) {
        self.done.store(done, Ordering::Relaxed);
        self.total.store(total, Ordering::Relaxed);
        self.calls.fetch_add(1, Ordering::Relaxed);
    }
}

pub fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("test").join("fixtures")
}
