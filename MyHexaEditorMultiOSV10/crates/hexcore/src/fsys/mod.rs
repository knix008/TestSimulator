//! File systems inside disks, partitions and disk images (WinHex style): partition tables and the files of FAT, exFAT,
//! NTFS and ext2/3/4 volumes, including deleted ones.
//!
//! CONTRACT
//! `partitions(src, {})` → `{ scheme: "mbr"|"gpt"|"none", partitions: [{ index, offset, length, type, typeName, fs, label, bootable }] }`
//!   fs: "fat12"|"fat16"|"fat32"|"exfat"|"ntfs"|"ext2"|"ext3"|"ext4"|"unknown". A bare volume image (no table) is one partition at 0.
//!   MBR: primary entries and the logical partitions of an extended one (EBR chain); a protective 0xEE entry means GPT.
//!   GPT: 512- or 4096-byte sectors; `type` is the type GUID, `label` the partition name (else the volume label).
//! `info(src, {offset})` → `{ fs, label, serial, clusterSize, totalSize, sectorSize, details: [[key, value]] }`
//! `list(src, {offset, dir: <id of a directory, null = root>, deleted: true})` →
//!   `{ fs, dir, parent, path, entries: [{ name, id, dir, size, created, modified, deleted, resident, extents: [[offset, length]] }] }`
//!   ids are strings (cluster number, MFT record, inode); extents are absolute byte ranges in `src` in file order (a sparse run
//!   is `[-1, length]`); dates are "YYYY-MM-DD HH:MM:SS" (UTC) or "". `parent` is null at the root or when the file system
//!   does not record it (exFAT); `path` is "/" at the root, "" when unknown.
//!   ids by file system: FAT: directories "root" / "c:<cluster>", files "e:<dir cluster or r>:<slot>"; exFAT: directories
//!   "root" / "d:<cluster>:<nofatchain 0|1>:<length>", files "e:<dir id>:<slot>" (with `|` in place of `:` inside the dir id);
//!   NTFS: the MFT record number (root "5"); ext: the inode number (root "2").
//!   Deleted files: FAT 0xE5 entries (first letter "_" unless a long name survives; data taken as contiguous clusters),
//!   exFAT entry sets whose in-use bit is clear, NTFS records not in use, ext directory entries found in record slack.
//! `file(src, {offset, id})` → `{ name, size, extents, resident: base64|null }` (resident: NTFS / ext inline data held in the record).
//! `read(src, {offset, id, max: 512 MiB})` → `{ name, data: base64 }` — the file's bytes (sparse runs as zeros, cut at size).
//!
//! Not supported: NTFS attribute lists ($ATTRIBUTE_LIST), compressed and encrypted NTFS data (their raw clusters are listed),
//! ext4 inline directories, journals and snapshots.
mod ext;
mod exfat;
mod fat;
mod ntfs;
mod part;
#[cfg(test)]
mod tests;

use crate::doc::Bytes;
use crate::util::{b64, Args};
use serde_json::{json, Value};

/// A volume inside the source, starting at `base`.
pub(crate) struct Vol<'a> {
    pub src: &'a dyn Bytes,
    pub base: u64,
}

impl Vol<'_> {
    /// `len` bytes at `off` (relative to the volume); an error past the end of the source.
    pub fn read(&self, off: u64, len: usize) -> Result<Vec<u8>, String> {
        let abs = self.base.checked_add(off).ok_or("offset overflow")?;
        let end = abs.checked_add(len as u64).ok_or("offset overflow")?;
        if end > self.src.len() {
            return Err(format!("read past the end of the data (at {abs:#x})"));
        }
        if len > 64 << 20 {
            return Err("read too large".into());
        }
        let mut buf = vec![0u8; len];
        self.src.read(abs, &mut buf)?;
        Ok(buf)
    }
    pub fn abs(&self, off: u64) -> u64 {
        self.base.saturating_add(off)
    }
}

pub(crate) fn u16le(b: &[u8], o: usize) -> u16 {
    b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]])).unwrap_or(0)
}
pub(crate) fn u32le(b: &[u8], o: usize) -> u32 {
    b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]])).unwrap_or(0)
}
pub(crate) fn u64le(b: &[u8], o: usize) -> u64 {
    b.get(o..o + 8).map(|s| u64::from_le_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]])).unwrap_or(0)
}
pub(crate) fn utf16(b: &[u8]) -> String {
    let units: Vec<u16> = b.chunks_exact(2).map(|p| u16::from_le_bytes([p[0], p[1]])).take_while(|&u| u != 0).collect();
    String::from_utf16_lossy(&units)
}

// ───────── dates (UTC)

fn civil(days: i64) -> (i64, i64, i64) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Seconds since 1970 → "YYYY-MM-DD HH:MM:SS" ("" for 0 or out of range).
pub(crate) fn unix_text(secs: i64) -> String {
    if secs <= 0 {
        return String::new();
    }
    let (y, m, d) = civil(secs.div_euclid(86400));
    let r = secs.rem_euclid(86400);
    if !(1601..=9999).contains(&y) {
        return String::new();
    }
    format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}", r / 3600, r / 60 % 60, r % 60)
}

pub(crate) fn filetime_text(ft: u64) -> String {
    if ft == 0 {
        return String::new();
    }
    unix_text((ft / 10_000_000) as i64 - 11_644_473_600)
}

/// FAT / exFAT date and time words.
pub(crate) fn dos_text(date: u16, time: u16) -> String {
    if date == 0 {
        return String::new();
    }
    let (y, m, d) = (1980 + (date >> 9) as u32, ((date >> 5) & 15) as u32, (date & 31) as u32);
    let (h, mi, s) = ((time >> 11) as u32, ((time >> 5) & 63) as u32, ((time & 31) * 2) as u32);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 59 {
        return String::new();
    }
    format!("{y:04}-{m:02}-{d:02} {h:02}:{mi:02}:{s:02}")
}

// ───────── entries

#[derive(Clone, Debug, Default)]
pub(crate) struct Entry {
    pub name: String,
    pub id: String,
    pub dir: bool,
    pub size: u64,
    pub created: String,
    pub modified: String,
    pub deleted: bool,
    /// Data held in the record itself (NTFS resident, ext inline).
    pub resident: Option<Vec<u8>>,
    /// Absolute ranges in the source; offset -1 = sparse.
    pub extents: Vec<(i64, u64)>,
}

impl Entry {
    fn json(&self) -> Value {
        json!({
            "name": self.name, "id": self.id, "dir": self.dir, "size": self.size, "created": self.created, "modified": self.modified,
            "deleted": self.deleted, "resident": self.resident.is_some(),
            "extents": self.extents.iter().map(|(o, l)| json!([o, l])).collect::<Vec<_>>(),
        })
    }
}

/// Adds a run to a list, joining it to the previous one when contiguous.
pub(crate) fn push_extent(list: &mut Vec<(i64, u64)>, off: i64, len: u64) {
    if len == 0 {
        return;
    }
    if let Some(last) = list.last_mut() {
        if (off < 0 && last.0 < 0) || (off >= 0 && last.0 >= 0 && last.0 as u64 + last.1 == off as u64) {
            last.1 += len;
            return;
        }
    }
    list.push((off, len));
}

pub(crate) struct Listing {
    pub dir: String,
    pub parent: Option<String>,
    pub path: String,
    pub entries: Vec<Entry>,
}

pub(crate) struct Info {
    pub label: String,
    pub serial: String,
    pub cluster: u64,
    pub total: u64,
    pub sector: u64,
    pub details: Vec<(String, String)>,
}

// ───────── detection

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Fs {
    Fat(u8),
    ExFat,
    Ntfs,
    Ext(u8),
    Unknown,
}

impl Fs {
    pub fn id(self) -> &'static str {
        match self {
            Fs::Fat(12) => "fat12",
            Fs::Fat(16) => "fat16",
            Fs::Fat(_) => "fat32",
            Fs::ExFat => "exfat",
            Fs::Ntfs => "ntfs",
            Fs::Ext(2) => "ext2",
            Fs::Ext(3) => "ext3",
            Fs::Ext(_) => "ext4",
            Fs::Unknown => "unknown",
        }
    }
}

/// What file system starts at `base` (by its boot sector or superblock).
pub(crate) fn detect(src: &dyn Bytes, base: u64) -> Fs {
    let vol = Vol { src, base };
    let Ok(boot) = vol.read(0, 512) else { return Fs::Unknown };
    if &boot[3..11] == b"NTFS    " {
        return Fs::Ntfs;
    }
    if &boot[3..11] == b"EXFAT   " {
        return Fs::ExFat;
    }
    if let Some(kind) = fat::kind(&boot) {
        return Fs::Fat(kind);
    }
    if let Ok(sb) = vol.read(1024, 1024) {
        if u16le(&sb, 56) == 0xEF53 {
            let (compat, incompat) = (u32le(&sb, 92), u32le(&sb, 96));
            return if incompat & (0x40 | 0x80 | 0x200) != 0 { Fs::Ext(4) } else if compat & 0x4 != 0 { Fs::Ext(3) } else { Fs::Ext(2) };
        }
    }
    Fs::Unknown
}

fn volume<'a>(src: &'a dyn Bytes, args: &Value) -> Result<(Vol<'a>, Fs), String> {
    let base = args.u64_or("offset", 0);
    if base >= src.len() {
        return Err("the offset is past the end of the data".into());
    }
    let fs = detect(src, base);
    if fs == Fs::Unknown {
        return Err(format!("no known file system at {base:#x} (FAT, exFAT, NTFS or ext2/3/4)"));
    }
    Ok((Vol { src, base }, fs))
}

/// The volume label (for the partition list).
pub(crate) fn label_of(src: &dyn Bytes, base: u64) -> String {
    let vol = Vol { src, base };
    let fs = detect(src, base);
    let info = match fs {
        Fs::Fat(k) => fat::info(&vol, k),
        Fs::ExFat => exfat::info(&vol),
        Fs::Ntfs => ntfs::info(&vol),
        Fs::Ext(k) => ext::info(&vol, k),
        Fs::Unknown => return String::new(),
    };
    info.map(|i| i.label).unwrap_or_default()
}

// ───────── the API

pub fn partitions(src: &dyn Bytes, _args: &Value) -> Result<Value, String> {
    part::partitions(src)
}

pub fn info(src: &dyn Bytes, args: &Value) -> Result<Value, String> {
    let (vol, fs) = volume(src, args)?;
    let i = match fs {
        Fs::Fat(k) => fat::info(&vol, k)?,
        Fs::ExFat => exfat::info(&vol)?,
        Fs::Ntfs => ntfs::info(&vol)?,
        Fs::Ext(k) => ext::info(&vol, k)?,
        Fs::Unknown => unreachable!(),
    };
    Ok(json!({
        "fs": fs.id(), "label": i.label, "serial": i.serial, "clusterSize": i.cluster, "totalSize": i.total, "sectorSize": i.sector,
        "details": i.details.iter().map(|(k, v)| json!([k, v])).collect::<Vec<_>>(),
    }))
}

pub fn list(src: &dyn Bytes, args: &Value) -> Result<Value, String> {
    let (vol, fs) = volume(src, args)?;
    let dir = args.get("dir").and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_u64().map(|n| n.to_string())));
    let deleted = args.bool_or("deleted", true);
    let l = match fs {
        Fs::Fat(k) => fat::list(&vol, k, dir.as_deref(), deleted)?,
        Fs::ExFat => exfat::list(&vol, dir.as_deref(), deleted)?,
        Fs::Ntfs => ntfs::list(&vol, dir.as_deref(), deleted)?,
        Fs::Ext(k) => ext::list(&vol, k, dir.as_deref(), deleted)?,
        Fs::Unknown => unreachable!(),
    };
    Ok(json!({ "fs": fs.id(), "dir": l.dir, "parent": l.parent, "path": l.path, "entries": l.entries.iter().map(Entry::json).collect::<Vec<_>>() }))
}

fn entry_of(src: &dyn Bytes, args: &Value) -> Result<Entry, String> {
    let (vol, fs) = volume(src, args)?;
    let id = args.get("id").and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_u64().map(|n| n.to_string()))).ok_or("missing id")?;
    match fs {
        Fs::Fat(k) => fat::file(&vol, k, &id),
        Fs::ExFat => exfat::file(&vol, &id),
        Fs::Ntfs => ntfs::file(&vol, &id),
        Fs::Ext(k) => ext::file(&vol, k, &id),
        Fs::Unknown => unreachable!(),
    }
}

pub fn file(src: &dyn Bytes, args: &Value) -> Result<Value, String> {
    let e = entry_of(src, args)?;
    Ok(json!({
        "name": e.name, "size": e.size, "dir": e.dir, "deleted": e.deleted,
        "extents": e.extents.iter().map(|(o, l)| json!([o, l])).collect::<Vec<_>>(),
        "resident": e.resident.as_ref().map(|d| b64(d)),
    }))
}

pub fn read(src: &dyn Bytes, args: &Value) -> Result<Value, String> {
    let e = entry_of(src, args)?;
    let max = args.u64_or("max", 512 << 20);
    if e.size > max {
        return Err(format!("the file is {} bytes, more than {max}", e.size));
    }
    let data = assemble(src, &e)?;
    Ok(json!({ "name": e.name, "data": b64(&data) }))
}

/// The bytes of an entry: resident data, or its extents (sparse as zeros), cut at its size.
pub(crate) fn assemble(src: &dyn Bytes, e: &Entry) -> Result<Vec<u8>, String> {
    if let Some(r) = &e.resident {
        let mut d = r.clone();
        d.truncate(e.size as usize);
        return Ok(d);
    }
    let mut out = Vec::with_capacity(e.size.min(1 << 30) as usize);
    for &(off, len) in &e.extents {
        let want = (e.size - out.len() as u64).min(len);
        if want == 0 {
            break;
        }
        if off < 0 {
            out.resize(out.len() + want as usize, 0);
        } else {
            let start = off as u64;
            if start.saturating_add(want) > src.len() {
                return Err(format!("the file's data runs past the end of the source (at {start:#x})"));
            }
            let mut buf = vec![0u8; want as usize];
            src.read(start, &mut buf)?;
            out.extend_from_slice(&buf);
        }
    }
    out.resize(e.size as usize, 0);
    Ok(out)
}
