//! The operations the interface asks for, in terms of the formats.

use std::io::{self, Read, Write};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::detect::{detect, Detected};
use crate::error::{Error, Result};
use crate::formats::zip::{self, ZipEncryption, ZipWriteOptions, ZipWriter};
use crate::formats::{rar, readonly, sevenz, tarfmt};
use crate::model::*;
use crate::tools::{output_files, OutputFile};
use crate::vfs::Fs;
use crate::volumes::{discover, part_name, ConcatReader, Naming, SplitWriter, VolumeKind, VolumeSet};

// ── Listing ───────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListOptions {
    pub path: String,
    #[serde(default)]
    pub password: Option<String>,
    /// Text encoding of names in old archives ("auto", "euc-kr", "shift_jis", ...).
    #[serde(default)]
    pub encoding: Option<String>,
}

fn open_set(fs: &Fs, path: &str) -> Result<(VolumeSet, Detected)> {
    if !fs.exists(path) {
        return Err(Error::Io(format!("{path}: not found")));
    }
    let set = discover(fs, path)?;
    let detected = detect(fs, &set)?;
    Ok((set, detected))
}

pub fn list(ctx: &Ctx, opts: &ListOptions) -> Result<ArchiveInfo> {
    ctx.check()?;
    let fs = &ctx.fs;
    let (set, d) = open_set(fs, &opts.path)?;
    let pw = opts.password.as_deref();
    let enc = opts.encoding.as_deref();
    let mut info = match d.format {
        Format::Zip => zip::list(fs, &set, enc)?,
        Format::SevenZ => {
            let mut info = sevenz::list(fs, &set, d.sfx_base, pw)?;
            info.header_encrypted = sevenz::needs_password_to_list(fs, &set, d.sfx_base);
            info
        }
        Format::Rar => rar::list(fs, &set, pw, enc)?,
        Format::Cab => readonly::list_cab(fs, &set)?,
        Format::Iso => readonly::list_iso(fs, &set)?,
        f if f.is_tar() => tarfmt::list_tar(fs, &set, f)?,
        f => tarfmt::list_single(fs, &set, f)?,
    };
    info.path = opts.path.clone();
    info.packed_size = set.paths.iter().map(|p| fs.size(p)).sum::<Result<u64>>()?;
    info.read_only = info.read_only
        || set.naming.is_split()
        || d.format.is_single_stream()
        || d.format.read_only()
        || is_program(&opts.path);
    info.volumes = set.paths;
    Ok(info)
}

fn is_program(path: &str) -> bool {
    path.to_lowercase().ends_with(".exe")
}

fn visit(
    ctx: &Ctx,
    set: &VolumeSet,
    d: Detected,
    password: Option<&str>,
    encoding: Option<&str>,
    v: &mut dyn Visitor,
) -> Result<()> {
    let fs = &ctx.fs;
    let r = match d.format {
        Format::Zip => zip::visit(fs, set, password, encoding, v),
        Format::SevenZ => sevenz::visit(fs, set, d.sfx_base, password, ctx.threads, v),
        Format::Rar => rar::visit(ctx, set, password, encoding, v),
        Format::Cab => readonly::visit_cab(fs, set, v),
        Format::Iso => readonly::visit_iso(fs, set, v),
        f if f.is_tar() => tarfmt::visit_tar(fs, set, f, v),
        f => tarfmt::visit_single(fs, set, f, v),
    };
    ctx.after(r)
}

// ── Safe output paths ─────────────────────────────────────────────────────────────────────────

/// Turns a path from an archive into one that cannot leave the destination. Returns `None` for
/// paths that try to climb out. Windows reserved names and characters are made harmless.
pub fn safe_relative(path: &str) -> Option<String> {
    let mut parts = Vec::new();
    for raw in path.split(['/', '\\']) {
        if raw.is_empty() || raw == "." {
            continue;
        }
        if raw == ".." {
            return None;
        }
        // A drive letter at the front: C:\Windows comes in as Windows.
        if parts.is_empty() && raw.len() == 2 && raw.ends_with(':') && raw.as_bytes()[0].is_ascii_alphabetic() {
            continue;
        }
        let cleaned = clean_component(raw);
        if cleaned.is_empty() {
            continue;
        }
        parts.push(cleaned);
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn clean_component(raw: &str) -> String {
    let mut s: String = raw.chars().filter(|c| !c.is_control()).collect();
    if cfg!(any(windows, target_arch = "wasm32")) {
        s = s.chars().map(|c| if "<>:\"|?*".contains(c) { '_' } else { c }).collect();
        s = s.trim_end_matches(['.', ' ']).to_string();
        let stem = s.split('.').next().unwrap_or("").to_ascii_uppercase();
        let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit());
        if reserved {
            s.insert(0, '_');
        }
    }
    s
}

// ── Extracting ────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ExtractOptions {
    pub path: String,
    pub dest: String,
    pub password: Option<String>,
    pub encoding: Option<String>,
    /// Entry paths or folders. Empty means everything.
    pub selection: Vec<String>,
    /// Entry paths or folders to leave out.
    pub exclude: Vec<String>,
    /// Part of the path to leave out, when extracting from inside a folder.
    pub strip_prefix: Option<String>,
    /// "overwrite", "skip", "rename" or "update".
    pub overwrite: Option<String>,
    /// Everything straight into the destination, without folders.
    pub flatten: bool,
    /// Keep what came out of a damaged file instead of deleting it.
    pub keep_broken: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    pub path: String,
    pub code: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtractReport {
    pub dest: String,
    pub files: u64,
    pub folders: u64,
    pub bytes: u64,
    pub skipped: Vec<String>,
    pub renamed: Vec<String>,
    /// Paths that tried to escape the destination, and links, which are not created.
    pub unsafe_paths: Vec<String>,
    pub links: Vec<String>,
    pub failed: Vec<Failure>,
    pub written: Vec<String>,
}

fn wanted(selection: &[String], path: &str) -> bool {
    if selection.is_empty() {
        return true;
    }
    selection.iter().any(|s| {
        let s = s.trim_end_matches('/');
        path == s || (path.len() > s.len() && path.starts_with(s) && path.as_bytes()[s.len()] == b'/')
    })
}

/// A file being extracted. Closing it gives it its original time.
struct FileOut {
    fs: Fs,
    path: String,
    inner: Option<Box<dyn crate::vfs::WriteSeek>>,
    mtime: Option<i64>,
    mode: Option<u32>,
    tally: Tally,
    name: String,
}

impl Write for FileOut {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.tally.progress.cancelled() {
            return Err(crate::error::cancel_io());
        }
        let n = self.inner.as_mut().unwrap().write(buf)?;
        self.tally.add(n as u64, &self.name);
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.inner.as_mut().unwrap().flush()
    }
}

impl Drop for FileOut {
    fn drop(&mut self) {
        if let Some(mut h) = self.inner.take() {
            let _ = h.flush();
        }
        if let Some(t) = self.mtime {
            let _ = self.fs.set_mtime(&self.path, t);
        }
        if let Some(m) = self.mode {
            if m & 0o777 != 0 {
                let _ = self.fs.set_mode(&self.path, m);
            }
        }
    }
}

struct Extractor<'a> {
    ctx: &'a Ctx,
    opts: &'a ExtractOptions,
    tally: Tally,
    report: ExtractReport,
    /// The file open now, deleted if its data fails.
    current: Option<String>,
    dirs: Vec<(String, i64)>,
}

impl Extractor<'_> {
    fn selected(&self, path: &str) -> bool {
        wanted(&self.opts.selection, path) && !(!self.opts.exclude.is_empty() && wanted(&self.opts.exclude, path))
    }

    fn target(&mut self, entry: &Entry) -> Option<String> {
        let mut path = entry.path.as_str();
        if let Some(prefix) = self.opts.strip_prefix.as_deref().filter(|p| !p.is_empty()) {
            let prefix = prefix.trim_end_matches('/');
            if let Some(rest) = path.strip_prefix(prefix) {
                path = rest.trim_start_matches('/');
            }
        }
        let Some(rel) = safe_relative(path) else {
            if !path.is_empty() {
                self.report.unsafe_paths.push(entry.path.clone());
            }
            return None;
        };
        if self.opts.flatten {
            return rel.rsplit('/').next().map(str::to_string);
        }
        Some(rel)
    }

    fn free_name(&self, full: &str) -> String {
        let fs = &self.ctx.fs;
        let (head, ext) = match full.rfind('.') {
            Some(i) if !full[i..].contains(['/', '\\']) => (&full[..i], &full[i..]),
            _ => (full, ""),
        };
        for n in 1.. {
            let candidate = format!("{head} ({n}){ext}");
            if !fs.exists(&candidate) {
                return candidate;
            }
        }
        unreachable!()
    }
}

impl Visitor for Extractor<'_> {
    fn open(&mut self, entry: &Entry) -> Result<Option<Box<dyn Write>>> {
        self.current = None;
        self.ctx.check()?;
        if !self.selected(&entry.path) {
            return Ok(None);
        }
        if entry.is_link {
            self.report.links.push(entry.path.clone());
            return Ok(None);
        }
        let Some(rel) = self.target(entry) else { return Ok(None) };
        let fs = self.ctx.fs.clone();
        let mut full = fs.join(&self.opts.dest, &rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        if entry.is_dir {
            if !self.opts.flatten {
                fs.mkdirs(&full)?;
                self.report.folders += 1;
                if let Some(t) = entry.mtime {
                    self.dirs.push((full, t));
                }
            }
            return Ok(None);
        }
        if let Some(meta) = fs.meta(&full)? {
            match self.opts.overwrite.as_deref().unwrap_or("overwrite") {
                "skip" => {
                    self.report.skipped.push(entry.path.clone());
                    return Ok(None);
                }
                "rename" => {
                    full = self.free_name(&full);
                    self.report.renamed.push(fs.file_name(&full));
                }
                "update" => {
                    if let (Some(have), Some(new)) = (meta.mtime, entry.mtime) {
                        if have >= new {
                            self.report.skipped.push(entry.path.clone());
                            return Ok(None);
                        }
                    }
                }
                _ => {}
            }
        }
        let handle = fs.create(&full)?;
        self.current = Some(full.clone());
        self.report.written.push(full.clone());
        self.report.files += 1;
        self.report.bytes += entry.size.unwrap_or(0);
        Ok(Some(Box::new(FileOut {
            fs,
            path: full,
            inner: Some(handle),
            mtime: entry.mtime,
            mode: entry.mode,
            tally: self.tally.clone(),
            name: entry.path.clone(),
        })))
    }

    fn done(&mut self, _entry: &Entry) -> Result<()> {
        self.current = None;
        Ok(())
    }

    fn failed(&mut self, entry: &Entry, error: Error) -> Result<()> {
        if !self.opts.keep_broken {
            if let Some(path) = self.current.take() {
                let _ = self.ctx.fs.remove_file(&path);
                self.report.written.retain(|p| p != &path);
                self.report.files = self.report.files.saturating_sub(1);
            }
        }
        self.report.failed.push(Failure { path: entry.path.clone(), code: error.code().into(), detail: error.detail() });
        Ok(())
    }
}

fn total_of(info: &ArchiveInfo, opts: &ExtractOptions) -> u64 {
    let leave_out = |path: &str| !opts.exclude.is_empty() && wanted(&opts.exclude, path);
    info.entries
        .iter()
        .filter(|e| wanted(&opts.selection, &e.path) && !leave_out(&e.path))
        .map(|e| e.size.unwrap_or(0))
        .sum()
}

pub fn extract(ctx: &Ctx, opts: &ExtractOptions) -> Result<ExtractReport> {
    let info = list(ctx, &ListOptions { path: opts.path.clone(), password: opts.password.clone(), encoding: opts.encoding.clone() })?;
    if info.encrypted && opts.password.is_none() {
        return Err(Error::PasswordRequired);
    }
    let (set, d) = open_set(&ctx.fs, &opts.path)?;
    ctx.fs.mkdirs(&opts.dest)?;
    let mut x = Extractor {
        ctx,
        opts,
        tally: Tally::new(ctx, total_of(&info, opts)),
        report: ExtractReport { dest: opts.dest.clone(), ..ExtractReport::default() },
        current: None,
        dirs: Vec::new(),
    };
    let result = visit(ctx, &set, d, opts.password.as_deref(), opts.encoding.as_deref(), &mut x);
    if let Err(e) = result {
        if !opts.keep_broken || matches!(e, Error::Cancelled) {
            if let Some(path) = x.current.take() {
                let _ = ctx.fs.remove_file(&path);
            }
        }
        return Err(e);
    }
    // Last, because writing a file into a folder changes the folder's time.
    for (path, t) in x.dirs.iter().rev() {
        let _ = ctx.fs.set_mtime(path, *t);
    }
    Ok(x.report)
}

/// Files an extraction would land on top of, so the interface can ask first.
pub fn conflicts(ctx: &Ctx, opts: &ExtractOptions) -> Result<Vec<String>> {
    let info = list(ctx, &ListOptions { path: opts.path.clone(), password: opts.password.clone(), encoding: opts.encoding.clone() })?;
    let mut out = Vec::new();
    let mut probe = Extractor {
        ctx,
        opts,
        tally: Tally::new(ctx, 0),
        report: ExtractReport::default(),
        current: None,
        dirs: Vec::new(),
    };
    for e in &info.entries {
        if e.is_dir || e.is_link || !probe.selected(&e.path) {
            continue;
        }
        if let Some(rel) = probe.target(e) {
            let full = ctx.fs.join(&opts.dest, &rel.replace('/', std::path::MAIN_SEPARATOR_STR));
            if ctx.fs.exists(&full) {
                out.push(e.path.clone());
            }
        }
    }
    Ok(out)
}

// ── Testing ───────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TestOptions {
    pub path: String,
    pub password: Option<String>,
    pub encoding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TestReport {
    pub ok: bool,
    pub files: u64,
    pub bytes: u64,
    pub failed: Vec<Failure>,
}

struct Tester {
    tally: Tally,
    report: TestReport,
}

impl Visitor for Tester {
    fn open(&mut self, entry: &Entry) -> Result<Option<Box<dyn Write>>> {
        if entry.is_dir || entry.is_link {
            return Ok(None);
        }
        self.report.files += 1;
        self.report.bytes += entry.size.unwrap_or(0);
        Ok(Some(Box::new(TallyWriter { inner: io::sink(), tally: self.tally.clone(), name: entry.path.clone() })))
    }
    fn done(&mut self, _: &Entry) -> Result<()> {
        Ok(())
    }
    fn failed(&mut self, entry: &Entry, error: Error) -> Result<()> {
        self.report.failed.push(Failure { path: entry.path.clone(), code: error.code().into(), detail: error.detail() });
        Ok(())
    }
}

pub fn test(ctx: &Ctx, opts: &TestOptions) -> Result<TestReport> {
    let info = list(ctx, &ListOptions { path: opts.path.clone(), password: opts.password.clone(), encoding: opts.encoding.clone() })?;
    if info.encrypted && opts.password.is_none() {
        return Err(Error::PasswordRequired);
    }
    let (set, d) = open_set(&ctx.fs, &opts.path)?;
    let everything = ExtractOptions::default();
    let mut t = Tester { tally: Tally::new(ctx, total_of(&info, &everything)), report: TestReport::default() };
    match visit(ctx, &set, d, opts.password.as_deref(), opts.encoding.as_deref(), &mut t) {
        Ok(()) => {}
        Err(e @ (Error::Cancelled | Error::WrongPassword | Error::PasswordRequired)) => return Err(e),
        // A format that stops at the first damage: report it as this archive's result.
        Err(e) => t.report.failed.push(Failure { path: String::new(), code: e.code().into(), detail: e.detail() }),
    }
    t.report.ok = t.report.failed.is_empty();
    Ok(t.report)
}

// ── Reading one entry ─────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ReadEntryOptions {
    pub path: String,
    pub entry: String,
    pub password: Option<String>,
    pub encoding: Option<String>,
    /// Stop keeping bytes after this many.
    pub limit: Option<u64>,
}

struct Collector {
    want: String,
    buf: Arc<Mutex<Vec<u8>>>,
    limit: u64,
    found: bool,
}

struct LimitedVec {
    buf: Arc<Mutex<Vec<u8>>>,
    limit: u64,
}

impl Write for LimitedVec {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        let mut b = self.buf.lock().unwrap();
        let room = self.limit.saturating_sub(b.len() as u64) as usize;
        b.extend_from_slice(&data[..data.len().min(room)]);
        Ok(data.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Visitor for Collector {
    fn open(&mut self, entry: &Entry) -> Result<Option<Box<dyn Write>>> {
        if entry.path == self.want && !entry.is_dir {
            self.found = true;
            return Ok(Some(Box::new(LimitedVec { buf: self.buf.clone(), limit: self.limit })));
        }
        Ok(None)
    }
    fn done(&mut self, _: &Entry) -> Result<()> {
        Ok(())
    }
}

pub fn read_entry(ctx: &Ctx, opts: &ReadEntryOptions) -> Result<Vec<u8>> {
    let (set, d) = open_set(&ctx.fs, &opts.path)?;
    let buf = Arc::new(Mutex::new(Vec::new()));
    let mut c = Collector { want: opts.entry.clone(), buf: buf.clone(), limit: opts.limit.unwrap_or(u64::MAX), found: false };
    visit(ctx, &set, d, opts.password.as_deref(), opts.encoding.as_deref(), &mut c)?;
    if !c.found {
        return Err(Error::Invalid(format!("{}: not in the archive", opts.entry)));
    }
    drop(c);
    let out = std::mem::take(&mut *buf.lock().unwrap());
    Ok(out)
}

// ── Creating ──────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SourceSpec {
    pub path: String,
    /// Its name in the archive; defaults to its own file name.
    pub name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CreateOptions {
    pub output: String,
    pub format: String,
    /// Compression method; empty picks the format's default.
    pub method: String,
    pub level: Option<u32>,
    pub password: Option<String>,
    /// ZIP only: "aes256" (default), "aes128" or "zipcrypto".
    pub encryption: Option<String>,
    pub encrypt_names: bool,
    /// Bytes per volume; nothing means no splitting.
    pub volume_size: Option<u64>,
    /// ZIP only: "span" for x.z01...x.zip (default), "numbered" for x.zip.001.
    pub zip_split_style: Option<String>,
    pub solid: bool,
    pub comment: Option<String>,
    pub recovery_percent: Option<u64>,
    pub rar_version: Option<String>,
    pub sources: Vec<SourceSpec>,
    /// Patterns to leave out: `*.tmp`, `node_modules`.
    pub exclude: Vec<String>,
    /// All files go under this folder in the archive.
    pub root_folder: Option<String>,
    pub smart_store: Option<bool>,
    pub overwrite: bool,
    /// ZIP only: a program to put in front, making it self-extracting.
    pub sfx_stub: Option<String>,
    /// Internal: write Zip64 records regardless of size.
    pub force_zip64: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateReport {
    pub volumes: Vec<OutputFile>,
    pub files: u64,
    pub folders: u64,
    pub total_size: u64,
    pub packed_size: u64,
}

pub fn parse_format(name: &str) -> Result<Format> {
    Ok(match name.to_lowercase().trim_start_matches('.') {
        "zip" => Format::Zip,
        "7z" => Format::SevenZ,
        "rar" => Format::Rar,
        "tar" => Format::Tar,
        "tar.gz" | "tgz" => Format::TarGz,
        "tar.bz2" | "tbz2" | "tbz" => Format::TarBz2,
        "tar.xz" | "txz" => Format::TarXz,
        "tar.zst" | "tzst" => Format::TarZst,
        "gz" | "gzip" => Format::Gz,
        "bz2" | "bzip2" => Format::Bz2,
        "xz" => Format::Xz,
        "zst" | "zstd" => Format::Zst,
        other => return Err(Error::Invalid(format!("cannot create format {other}"))),
    })
}

/// `*` and `?`, case-insensitively, against a whole name or path.
pub fn glob_match(pattern: &str, text: &str) -> bool {
    fn go(p: &[char], t: &[char]) -> bool {
        match (p.first(), t.first()) {
            (None, None) => true,
            (Some('*'), _) => go(&p[1..], t) || (!t.is_empty() && go(p, &t[1..])),
            (Some('?'), Some(_)) => go(&p[1..], &t[1..]),
            (Some(a), Some(b)) if a.to_lowercase().eq(b.to_lowercase()) => go(&p[1..], &t[1..]),
            _ => false,
        }
    }
    let p: Vec<char> = pattern.chars().collect();
    let t: Vec<char> = text.chars().collect();
    go(&p, &t)
}

fn excluded(patterns: &[String], name: &str, rel: &str) -> bool {
    patterns.iter().filter(|p| !p.trim().is_empty()).any(|p| {
        let p = p.trim();
        glob_match(p, name) || glob_match(p, rel)
    })
}

fn collect(fs: &Fs, path: &str, name: &str, exclude: &[String], skip: &[String], out: &mut Vec<InputItem>) -> Result<()> {
    let meta = fs.meta(path)?.ok_or_else(|| Error::Io(format!("{path}: not found")))?;
    let base = name.rsplit('/').next().unwrap_or(name);
    if excluded(exclude, base, name) || skip.iter().any(|s| s == path) {
        return Ok(());
    }
    // Links are not followed: they can loop, and the target may be anywhere.
    if meta.is_symlink {
        return Ok(());
    }
    if meta.is_dir {
        out.push(InputItem { source: path.to_string(), name: name.to_string(), is_dir: true, size: 0, mtime: meta.mtime, mode: meta.mode });
        let mut children = fs.read_dir(path)?;
        children.sort_by(|a, b| a.name.cmp(&b.name));
        for child in children {
            collect(fs, &fs.join(path, &child.name), &format!("{name}/{}", child.name), exclude, skip, out)?;
        }
    } else {
        out.push(InputItem { source: path.to_string(), name: name.to_string(), is_dir: false, size: meta.size, mtime: meta.mtime, mode: meta.mode });
    }
    Ok(())
}

fn gather_items(ctx: &Ctx, opts: &CreateOptions) -> Result<Vec<InputItem>> {
    if opts.sources.is_empty() {
        return Err(Error::Invalid("nothing to archive".into()));
    }
    // The archive must not swallow itself when the output sits inside a source folder.
    let skip = vec![opts.output.clone(), format!("{}.zmtmp", opts.output)];
    let mut items = Vec::new();
    for s in &opts.sources {
        let own = ctx.fs.file_name(&s.path);
        let name = s.name.as_deref().filter(|n| !n.is_empty()).unwrap_or(&own).replace('\\', "/");
        let name = name.trim_matches('/').to_string();
        collect(&ctx.fs, &s.path, &name, &opts.exclude, &skip, &mut items)?;
    }
    if let Some(root) = opts.root_folder.as_deref().map(|r| r.trim_matches('/')).filter(|r| !r.is_empty()) {
        for i in &mut items {
            i.name = format!("{root}/{}", i.name);
        }
        items.insert(0, InputItem { source: String::new(), name: root.to_string(), is_dir: true, size: 0, mtime: None, mode: None });
    }
    let mut seen = std::collections::HashSet::new();
    for i in &items {
        if !seen.insert(i.name.clone()) {
            return Err(Error::Invalid(format!("two items are both named {}", i.name)));
        }
    }
    Ok(items)
}

const MIN_VOLUME: u64 = 1024;
const MIN_ZIP_VOLUME: u64 = 64 * 1024;

pub fn create(ctx: &Ctx, opts: &CreateOptions) -> Result<CreateReport> {
    ctx.check()?;
    let items = gather_items(ctx, opts)?;
    create_from_items(ctx, opts, items)
}

fn stale_parts(fs: &Fs, output: &str, naming: &Naming) -> Vec<String> {
    let mut out = Vec::new();
    for i in 0.. {
        let p = part_name(output, naming, i);
        if !fs.exists(&p) {
            break;
        }
        out.push(p);
    }
    out
}

/// Removes what a failed or cancelled run left behind.
fn clean_after_failure(fs: &Fs, output: &str, naming: &Naming, before: &[String]) {
    let _ = fs.remove_file(&format!("{output}.zmtmp"));
    if *naming != Naming::Single {
        for p in stale_parts(fs, output, naming) {
            if !before.contains(&p) {
                let _ = fs.remove_file(&p);
            }
        }
    }
}

fn rar_parts_on_disk(fs: &Fs, output: &str) -> Vec<String> {
    let mut out = Vec::new();
    let Some(dir) = fs.parent(output) else { return out };
    let file = fs.file_name(output);
    let stem = file.strip_suffix(".rar").unwrap_or(&file).to_string();
    let Ok(items) = fs.read_dir(&dir) else { return out };
    for item in items {
        let lower = item.name.to_lowercase();
        if lower.starts_with(&format!("{}.part", stem.to_lowercase())) && lower.ends_with(".rar") {
            out.push(fs.join(&dir, &item.name));
        }
    }
    out
}

fn create_from_items(ctx: &Ctx, opts: &CreateOptions, items: Vec<InputItem>) -> Result<CreateReport> {
    let format = parse_format(&opts.format)?;
    let fs = ctx.fs.clone();
    let output = opts.output.clone();
    if output.is_empty() {
        return Err(Error::Invalid("no output file".into()));
    }
    if format.is_single_stream() {
        let files: Vec<_> = items.iter().filter(|i| !i.is_dir).collect();
        if files.len() != 1 || items.len() != 1 {
            return Err(Error::Invalid("single_file_only".into()));
        }
    }
    let files = items.iter().filter(|i| !i.is_dir).count() as u64;
    let folders = items.len() as u64 - files;
    let total: u64 = items.iter().map(|i| i.size).sum();
    let tally = Tally::new(ctx, total);
    let level = opts.level.unwrap_or(6).min(9);
    let volume = opts.volume_size.filter(|v| *v > 0);
    if let Some(v) = volume {
        if v < MIN_VOLUME {
            return Err(Error::Invalid(format!("volume size must be at least {MIN_VOLUME} bytes")));
        }
        if opts.sfx_stub.is_some() {
            return Err(Error::Invalid("a self-extracting archive cannot be split".into()));
        }
    }
    if opts.sfx_stub.is_some() && format != Format::Zip {
        return Err(Error::Invalid("self-extracting archives are made from ZIP".into()));
    }

    let span = format == Format::Zip && volume.is_some() && opts.zip_split_style.as_deref() != Some("numbered");
    if span && volume.unwrap() < MIN_ZIP_VOLUME {
        return Err(Error::Invalid(format!("split ZIP parts must be at least {MIN_ZIP_VOLUME} bytes")));
    }
    let naming = if volume.is_none() {
        Naming::Single
    } else if span {
        Naming::ZipSpan
    } else {
        Naming::Numbered
    };

    // Overwriting. A set must also take the old parts with it, or stale ones get mixed in.
    let mut existing: Vec<String> = Vec::new();
    match (&naming, format) {
        (Naming::Single, Format::Rar) if volume.is_some() => existing.extend(rar_parts_on_disk(&fs, &output)),
        (Naming::Single, _) => {
            if fs.exists(&output) {
                existing.push(output.clone());
            }
        }
        (Naming::ZipSpan, _) => {
            existing.extend(stale_parts(&fs, &output, &naming));
            if fs.exists(&output) {
                existing.push(output.clone());
            }
        }
        (Naming::Numbered, Format::Rar) => existing.extend(rar_parts_on_disk(&fs, &output)),
        (Naming::Numbered, _) => existing.extend(stale_parts(&fs, &output, &naming)),
    }
    if !existing.is_empty() {
        if !opts.overwrite {
            return Err(Error::Exists(existing[0].clone()));
        }
        if format != Format::Rar && naming != Naming::Single {
            for p in &existing {
                fs.remove_file(p)?;
            }
        }
        if format == Format::Rar && volume.is_some() {
            for p in &existing {
                fs.remove_file(p)?;
            }
        }
    }

    let opener_tally = tally.clone();
    let opener_fs = fs.clone();
    let open = move |item: &InputItem| -> Result<Box<dyn Read>> {
        let r = opener_fs.open(&item.source)?;
        Ok(Box::new(TallyReader { inner: r, tally: opener_tally.clone(), name: item.name.clone() }))
    };

    let result = (|| -> Result<Vec<String>> {
        let sink = || -> Result<SplitWriter> {
            let out = if naming == Naming::Single {
                SplitWriter::new_single_atomic(fs.clone(), &output)?
            } else {
                SplitWriter::new(fs.clone(), &output, naming.clone(), volume)?
            };
            Ok(out.cancel_with(ctx.progress.clone()))
        };
        match format {
            Format::Zip => {
                let encryption = match (opts.password.is_some(), opts.encryption.as_deref()) {
                    (false, _) => ZipEncryption::None,
                    (true, Some("zipcrypto")) => ZipEncryption::ZipCrypto,
                    (true, Some("aes128")) => ZipEncryption::Aes128,
                    (true, _) => ZipEncryption::Aes256,
                };
                let method = if level == 0 { zip::method_id("store")? } else { zip::method_id(&opts.method)? };
                let mut out = sink()?;
                if let Some(stub) = &opts.sfx_stub {
                    let mut s = fs.open(stub)?;
                    crate::codecs::copy_all(&mut s, &mut out)?;
                }
                let mut w = ZipWriter::new(
                    out,
                    ZipWriteOptions {
                        method,
                        level,
                        password: opts.password.clone(),
                        encryption,
                        comment: opts.comment.clone(),
                        smart_store: opts.smart_store.unwrap_or(true),
                        force_zip64: opts.force_zip64,
                        spanned: naming == Naming::ZipSpan,
                    },
                )?;
                for item in &items {
                    ctx.check()?;
                    let add = w.add(item, || open(item));
                    if let Err(e) = add {
                        w.abort();
                        return Err(e);
                    }
                }
                w.finish()
            }
            Format::SevenZ => {
                let o = sevenz::SevenZOptions {
                    method: opts.method.clone(),
                    level,
                    password: opts.password.clone(),
                    encrypt_names: opts.encrypt_names,
                    solid: opts.solid,
                    threads: ctx.threads,
                };
                let chosen = if level == 0 { sevenz::SevenZOptions { method: "copy".into(), ..o } } else { o };
                sevenz::create(sink()?, &chosen, &items, &open)
            }
            Format::Rar => rar::create(
                ctx,
                &output,
                &rar::RarOptions {
                    version: opts.rar_version.clone().unwrap_or_else(|| "rar5".into()),
                    level,
                    password: opts.password.clone(),
                    encrypt_names: opts.encrypt_names,
                    solid: opts.solid,
                    comment: opts.comment.clone(),
                    recovery_percent: opts.recovery_percent,
                    volume_size: volume,
                },
                &items,
                &tally,
            ),
            f if f.is_tar() => tarfmt::create_tar(sink()?, &fs, f, level, &items, &open),
            f => tarfmt::create_single(sink()?, f, level, &items[0], &open),
        }
    })();

    let names = match ctx.after(result) {
        Ok(names) => names,
        Err(e) => {
            clean_after_failure(&fs, &output, &naming, &[]);
            if format == Format::Rar && volume.is_some() {
                for p in rar_parts_on_disk(&fs, &output) {
                    let _ = fs.remove_file(&p);
                }
            }
            return Err(e);
        }
    };
    let volumes = output_files(&fs, &names)?;
    Ok(CreateReport { files, folders, total_size: total, packed_size: volumes.iter().map(|v| v.size).sum(), volumes })
}

// ── Changing an archive ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Rename {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ModifyOptions {
    pub path: String,
    pub password: Option<String>,
    pub encoding: Option<String>,
    /// Files and folders to add, with their names in the archive.
    pub add: Vec<SourceSpec>,
    /// Entries or folders to remove.
    pub delete: Vec<String>,
    pub rename: Vec<Rename>,
    /// New empty folders.
    pub mkdir: Vec<String>,
    /// Replaces the archive comment (empty clears it).
    pub comment: Option<String>,
    pub level: Option<u32>,
}

/// The method an archive mostly uses, to rewrite it the same way.
fn prevailing_method(info: &ArchiveInfo) -> String {
    let mut counts: std::collections::HashMap<String, usize> = Default::default();
    for e in &info.entries {
        if !e.is_dir && e.size.unwrap_or(0) > 0 {
            let first = e.method.split(' ').next().unwrap_or("").to_lowercase();
            *counts.entry(first).or_default() += 1;
        }
    }
    let top = counts.into_iter().max_by_key(|(_, n)| *n).map(|(m, _)| m).unwrap_or_default();
    match top.as_str() {
        "zstandard" => "zstd".into(),
        "lzma2" if info.format == "zip" => "xz".into(),
        other => other.to_string(),
    }
}

struct WorkDir {
    fs: Fs,
    path: String,
}

impl WorkDir {
    fn new(ctx: &Ctx, beside: &str) -> Result<Self> {
        let mut path = format!("{beside}.zmwork");
        let mut n = 1;
        while ctx.fs.exists(&path) {
            path = format!("{beside}.zmwork{n}");
            n += 1;
        }
        ctx.fs.mkdirs(&path)?;
        Ok(WorkDir { fs: ctx.fs.clone(), path })
    }
}

impl Drop for WorkDir {
    fn drop(&mut self) {
        let _ = self.fs.remove_dir_all(&self.path);
    }
}

/// Lists everything under a work folder as archive items, recording names relative to it.
fn work_items(fs: &Fs, dir: &str, prefix: &str, out: &mut Vec<InputItem>) -> Result<()> {
    let mut children = fs.read_dir(dir)?;
    children.sort_by(|a, b| a.name.cmp(&b.name));
    for c in children {
        let full = fs.join(dir, &c.name);
        let name = if prefix.is_empty() { c.name.clone() } else { format!("{prefix}/{}", c.name) };
        out.push(InputItem {
            source: full.clone(),
            name: name.clone(),
            is_dir: c.meta.is_dir,
            size: c.meta.size,
            mtime: c.meta.mtime,
            mode: c.meta.mode,
        });
        if c.meta.is_dir {
            work_items(fs, &full, &name, out)?;
        }
    }
    Ok(())
}

pub fn modify(ctx: &Ctx, opts: &ModifyOptions) -> Result<ArchiveInfo> {
    let list_opts = ListOptions { path: opts.path.clone(), password: opts.password.clone(), encoding: opts.encoding.clone() };
    let info = list(ctx, &list_opts)?;
    if info.read_only {
        let why = if info.volumes.len() > 1 { "volumes_read_only" } else { "format_read_only" };
        return Err(Error::Unsupported(why.into()));
    }
    if info.encrypted && opts.password.is_none() {
        return Err(Error::PasswordRequired);
    }
    let format = parse_format(&info.format)?;

    let only_comment = opts.add.is_empty() && opts.delete.is_empty() && opts.rename.is_empty() && opts.mkdir.is_empty();
    if only_comment && format == Format::Zip {
        if let Some(c) = &opts.comment {
            zip::set_comment(&ctx.fs, &opts.path, c)?;
        }
        return list(ctx, &list_opts);
    }

    // Everything is decoded and written again. Only the entries being kept are decoded.
    let work = WorkDir::new(ctx, &opts.path)?;
    let data = ctx.fs.join(&work.path, "d");
    ctx.fs.mkdirs(&data)?;
    let keeps_something = opts.delete.is_empty() || info.entries.iter().any(|e| !wanted(&opts.delete, &e.path));
    if keeps_something {
        let report = extract(
            ctx,
            &ExtractOptions {
                path: opts.path.clone(),
                dest: data.clone(),
                password: opts.password.clone(),
                encoding: opts.encoding.clone(),
                exclude: opts.delete.clone(),
                ..ExtractOptions::default()
            },
        )?;
        // A damaged entry must not vanish quietly just because something else was edited.
        if let Some(bad) = report.failed.first() {
            return Err(Error::Corrupt(format!("{}: {}", bad.path, bad.detail)));
        }
    }
    for name in &opts.mkdir {
        let rel = safe_relative(name).ok_or_else(|| Error::Invalid(format!("{name}: not a valid folder name")))?;
        ctx.fs.mkdirs(&ctx.fs.join(&data, &rel))?;
    }

    let mut items = Vec::new();
    work_items(&ctx.fs, &data, "", &mut items)?;

    // Renames apply to the entry and everything under it.
    for r in &opts.rename {
        let from = r.from.trim_end_matches('/');
        let to = safe_relative(&r.to).ok_or_else(|| Error::Invalid(format!("{}: not a valid name", r.to)))?;
        let mut hit = false;
        for i in &mut items {
            if i.name == from {
                i.name = to.clone();
                hit = true;
            } else if let Some(rest) = i.name.strip_prefix(&format!("{from}/")) {
                i.name = format!("{to}/{rest}");
                hit = true;
            }
        }
        if !hit {
            return Err(Error::Invalid(format!("{from}: not in the archive")));
        }
    }

    // New files replace old ones of the same name.
    let added = {
        let create = CreateOptions { sources: opts.add.clone(), output: opts.path.clone(), ..CreateOptions::default() };
        if opts.add.is_empty() {
            Vec::new()
        } else {
            gather_items(ctx, &create)?
        }
    };
    for a in &added {
        items.retain(|i| i.name != a.name);
    }
    items.extend(added);
    // Parent folders first keeps the archive tidy.
    items.sort_by(|a, b| a.name.cmp(&b.name));

    let method = prevailing_method(&info);
    let encryption = info.entries.iter().find(|e| e.encrypted).and_then(|e| {
        if e.method.contains("ZipCrypto") {
            Some("zipcrypto".to_string())
        } else if e.method.contains("AES-128") {
            Some("aes128".to_string())
        } else {
            None
        }
    });
    let create = CreateOptions {
        output: opts.path.clone(),
        format: info.format.clone(),
        method: if info.format == "rar" || format.is_tar() { String::new() } else { method },
        level: opts.level.or(Some(6)),
        password: if info.encrypted { opts.password.clone() } else { None },
        encryption,
        encrypt_names: info.header_encrypted,
        solid: info.solid,
        comment: opts.comment.clone().or_else(|| info.comment.clone()).filter(|c| !c.is_empty()),
        recovery_percent: info.has_recovery.then_some(3),
        // An untouched archive stores what it stored.
        smart_store: Some(false),
        overwrite: true,
        ..CreateOptions::default()
    };
    create_from_items(ctx, &create, items)?;
    drop(work);
    list(ctx, &list_opts)
}

// ── Converting ────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ConvertOptions {
    pub path: String,
    pub password: Option<String>,
    pub encoding: Option<String>,
    /// The new archive's settings. `sources` is ignored.
    pub create: CreateOptions,
}

pub fn convert(ctx: &Ctx, opts: &ConvertOptions) -> Result<CreateReport> {
    let work = WorkDir::new(ctx, &opts.create.output)?;
    let data = ctx.fs.join(&work.path, "d");
    ctx.fs.mkdirs(&data)?;
    extract(
        ctx,
        &ExtractOptions {
            path: opts.path.clone(),
            dest: data.clone(),
            password: opts.password.clone(),
            encoding: opts.encoding.clone(),
            ..ExtractOptions::default()
        },
    )?;
    let mut items = Vec::new();
    work_items(&ctx.fs, &data, "", &mut items)?;
    let report = create_from_items(ctx, &opts.create, items)?;
    drop(work);
    Ok(report)
}

// ── Repair ────────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RepairOptions {
    pub path: String,
    /// Defaults to `name.repaired.ext` beside the original.
    pub output: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepairReport {
    pub output: String,
    pub format: String,
    pub recovered: u64,
    pub lost: u64,
    pub lost_names: Vec<String>,
    pub changed: bool,
}

fn repaired_name(path: &str, ext: &str) -> String {
    let stem = match path.rfind('.') {
        Some(i) if !path[i..].contains(['/', '\\']) => &path[..i],
        _ => path,
    };
    format!("{stem}.repaired.{ext}")
}

/// By extension as well as contents: the damage may have reached the signature or the end record.
pub fn repair(ctx: &Ctx, opts: &RepairOptions) -> Result<RepairReport> {
    let fs = &ctx.fs;
    let set = discover(fs, &opts.path)?;
    let lower = opts.path.to_lowercase();
    let format = match detect(fs, &set) {
        Ok(d) => d.format,
        Err(_) if lower.ends_with(".rar") => Format::Rar,
        Err(_) => Format::Zip,
    };
    match format {
        Format::Zip => {
            let output = opts.output.clone().filter(|o| !o.is_empty()).unwrap_or_else(|| repaired_name(&first_named(&set, &opts.path), "zip"));
            let s = zip::repair(fs.clone(), &set.paths, &output, ctx)?;
            Ok(RepairReport { output, format: "zip".into(), recovered: s.recovered, lost: s.lost, lost_names: s.lost_names, changed: true })
        }
        Format::Rar => {
            let output = opts.output.clone().filter(|o| !o.is_empty()).unwrap_or_else(|| repaired_name(&opts.path, "rar"));
            let (changed, _) = rar::repair(fs, &set.paths, &output)?;
            Ok(RepairReport { output, format: "rar".into(), changed, ..RepairReport::default() })
        }
        other => Err(Error::Unsupported(format!("{} has no repair", other.name()))),
    }
}

fn first_named(set: &VolumeSet, path: &str) -> String {
    match set.naming {
        VolumeKind::ZipSpan => set.paths.last().cloned().unwrap_or_else(|| path.to_string()),
        _ => path.to_string(),
    }
}

/// Keeps the concatenating reader's type name in use where a format needs it.
pub fn concat(fs: &Fs, paths: &[String]) -> Result<ConcatReader> {
    ConcatReader::new(fs.clone(), paths)
}
