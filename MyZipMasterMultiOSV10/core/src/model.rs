//! What crosses the JSON boundary, and the traits the formats plug into.

use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::{cancel_io, Error, Result};
use crate::vfs::Fs;

// ── Formats ───────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Zip,
    #[serde(rename = "7z")]
    SevenZ,
    Rar,
    Tar,
    #[serde(rename = "tar.gz")]
    TarGz,
    #[serde(rename = "tar.bz2")]
    TarBz2,
    #[serde(rename = "tar.xz")]
    TarXz,
    #[serde(rename = "tar.zst")]
    TarZst,
    Gz,
    Bz2,
    Xz,
    Zst,
    Cab,
    Iso,
}

impl Format {
    pub fn name(self) -> &'static str {
        match self {
            Format::Zip => "zip",
            Format::SevenZ => "7z",
            Format::Rar => "rar",
            Format::Tar => "tar",
            Format::TarGz => "tar.gz",
            Format::TarBz2 => "tar.bz2",
            Format::TarXz => "tar.xz",
            Format::TarZst => "tar.zst",
            Format::Gz => "gz",
            Format::Bz2 => "bz2",
            Format::Xz => "xz",
            Format::Zst => "zst",
            Format::Cab => "cab",
            Format::Iso => "iso",
        }
    }

    /// One compressed file and nothing else.
    pub fn is_single_stream(self) -> bool {
        matches!(self, Format::Gz | Format::Bz2 | Format::Xz | Format::Zst)
    }

    pub fn is_tar(self) -> bool {
        matches!(self, Format::Tar | Format::TarGz | Format::TarBz2 | Format::TarXz | Format::TarZst)
    }

    /// Formats this program can only read.
    pub fn read_only(self) -> bool {
        matches!(self, Format::Cab | Format::Iso)
    }
}

// ── Entries ───────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Entry {
    /// `/`-separated path as stored, decoded to text.
    pub path: String,
    pub is_dir: bool,
    /// Unknown for streams that do not record it (bz2, xz, zst).
    pub size: Option<u64>,
    pub packed: Option<u64>,
    /// Unix seconds.
    pub mtime: Option<i64>,
    pub crc: Option<u32>,
    pub method: String,
    pub encrypted: bool,
    pub is_link: bool,
    pub mode: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInfo {
    pub format: String,
    pub path: String,
    pub volumes: Vec<String>,
    pub packed_size: u64,
    pub entries: Vec<Entry>,
    pub comment: Option<String>,
    pub encrypted: bool,
    pub header_encrypted: bool,
    pub solid: bool,
    pub read_only: bool,
    pub has_recovery: bool,
}

// ── Running an operation ──────────────────────────────────────────────────────────────────────

pub trait Progress: Send + Sync {
    /// `done` of `total` bytes, working on `name`.
    fn update(&self, done: u64, total: u64, name: &str);
    fn cancelled(&self) -> bool {
        false
    }
}

pub struct NoProgress;

impl Progress for NoProgress {
    fn update(&self, _: u64, _: u64, _: &str) {}
}

#[derive(Clone)]
pub struct Ctx {
    pub fs: Fs,
    pub progress: Arc<dyn Progress>,
    /// Threads the compressors may use.
    pub threads: u32,
}

impl Ctx {
    pub fn new(fs: Fs, progress: Arc<dyn Progress>) -> Self {
        Ctx { fs, progress, threads: 1 }
    }

    pub fn check(&self) -> Result<()> {
        if self.progress.cancelled() {
            return Err(Error::Cancelled);
        }
        Ok(())
    }

    /// Replaces any error with `Cancelled` once the user has cancelled: the codecs report a
    /// cancelled source in their own words.
    pub fn after<T>(&self, r: Result<T>) -> Result<T> {
        if r.is_err() && self.progress.cancelled() {
            return Err(Error::Cancelled);
        }
        r
    }
}

/// Byte counter shared by the pieces of one operation.
#[derive(Clone)]
pub struct Tally {
    pub done: Arc<AtomicU64>,
    pub total: u64,
    pub progress: Arc<dyn Progress>,
}

impl Tally {
    pub fn new(ctx: &Ctx, total: u64) -> Self {
        Tally { done: Arc::new(AtomicU64::new(0)), total, progress: ctx.progress.clone() }
    }

    pub fn add(&self, n: u64, name: &str) {
        let done = self.done.fetch_add(n, Ordering::Relaxed) + n;
        self.progress.update(done, self.total, name);
    }
}

/// Reports what passes through and stops on cancel.
pub struct TallyWriter<W> {
    pub inner: W,
    pub tally: Tally,
    pub name: String,
}

impl<W: Write> Write for TallyWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if self.tally.progress.cancelled() {
            return Err(cancel_io());
        }
        let n = self.inner.write(buf)?;
        self.tally.add(n as u64, &self.name);
        Ok(n)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

/// The same, for sources.
pub struct TallyReader<R> {
    pub inner: R,
    pub tally: Tally,
    pub name: String,
}

impl<R: std::io::Read> std::io::Read for TallyReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.tally.progress.cancelled() {
            return Err(cancel_io());
        }
        let n = self.inner.read(buf)?;
        self.tally.add(n as u64, &self.name);
        Ok(n)
    }
}

/// How a format hands out its contents. Decompression either pulls (ZIP) or pushes (RAR), so the
/// common shape is "give me somewhere to write this entry".
pub trait Visitor {
    /// `None` means skip. Directories get no writer either way.
    fn open(&mut self, entry: &Entry) -> Result<Option<Box<dyn Write>>>;
    /// The entry's data checked out.
    fn done(&mut self, entry: &Entry) -> Result<()>;
    /// The entry failed. Returning `Ok` moves on to the next entry where the format can.
    fn failed(&mut self, entry: &Entry, error: Error) -> Result<()> {
        let _ = entry;
        Err(error)
    }
}

/// A file going into a new archive.
#[derive(Debug, Clone)]
pub struct InputItem {
    /// Where to read it. Empty for a folder with no source (a folder made inside an archive).
    pub source: String,
    /// Its name inside the archive, `/`-separated.
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: Option<i64>,
    pub mode: Option<u32>,
}

/// The local time zone is only known outside the browser engine; there, DOS times read as UTC.
#[cfg(not(target_arch = "wasm32"))]
pub fn local_to_unix(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> Option<i64> {
    use chrono::{Local, NaiveDate, TimeZone};
    let naive = NaiveDate::from_ymd_opt(y, mo, d)?.and_hms_opt(h, mi, s)?;
    Local.from_local_datetime(&naive).earliest().map(|t| t.timestamp())
}

#[cfg(target_arch = "wasm32")]
pub fn local_to_unix(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> Option<i64> {
    let days = days_from_civil(y as i64, mo as i64, d as i64);
    Some(days * 86400 + h as i64 * 3600 + mi as i64 * 60 + s as i64)
}

/// Local calendar fields (year, month, day, hour, minute, second) of a Unix time.
#[cfg(not(target_arch = "wasm32"))]
pub fn unix_to_local(t: i64) -> Option<(i32, u32, u32, u32, u32, u32)> {
    use chrono::{Datelike, Local, TimeZone, Timelike};
    let at = Local.timestamp_opt(t, 0).earliest()?;
    Some((at.year(), at.month(), at.day(), at.hour(), at.minute(), at.second()))
}

#[cfg(target_arch = "wasm32")]
pub fn unix_to_local(t: i64) -> Option<(i32, u32, u32, u32, u32, u32)> {
    let days = t.div_euclid(86400);
    let secs = t.rem_euclid(86400);
    let (y, m, d) = civil_from_days(days);
    Some((y as i32, m as u32, d as u32, (secs / 3600) as u32, (secs % 3600 / 60) as u32, (secs % 60) as u32))
}

#[cfg(target_arch = "wasm32")]
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

#[cfg(target_arch = "wasm32")]
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + if m <= 2 { 1 } else { 0 }, m, d)
}
