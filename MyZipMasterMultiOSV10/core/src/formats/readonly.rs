//! Formats this program opens but does not make: CAB and ISO images.

use std::io::{self, Read, Seek, SeekFrom};

use crate::error::{Error, Result};
use crate::model::*;
use crate::vfs::Fs;
use crate::volumes::{ConcatReader, VolumeSet};

// ── CAB ───────────────────────────────────────────────────────────────────────────────────────

fn cab_err(e: io::Error) -> Error {
    let text = e.to_string();
    if text.contains(crate::error::CANCEL_MARK) {
        return Error::Cancelled;
    }
    Error::Corrupt(format!("cab: {text}"))
}

fn cab_entries(cab: &cab::Cabinet<ConcatReader>) -> Vec<Entry> {
    let mut out = Vec::new();
    for folder in cab.folder_entries() {
        let method = match folder.compression_type() {
            cab::CompressionType::None => "Store",
            cab::CompressionType::MsZip => "MSZIP",
            cab::CompressionType::Quantum(..) => "Quantum",
            cab::CompressionType::Lzx(_) => "LZX",
        };
        for file in folder.file_entries() {
            let mtime = file.datetime().and_then(|t| {
                let d = t.date();
                let c = t.time();
                local_to_unix(d.year(), d.month() as u32, d.day() as u32, c.hour() as u32, c.minute() as u32, c.second() as u32)
            });
            out.push(Entry {
                path: file.name().replace('\\', "/"),
                size: Some(file.uncompressed_size() as u64),
                mtime,
                method: method.to_string(),
                ..Entry::default()
            });
        }
    }
    out
}

pub fn list_cab(fs: &Fs, set: &VolumeSet) -> Result<ArchiveInfo> {
    let src = ConcatReader::new(fs.clone(), &set.paths)?;
    let cab = cab::Cabinet::new(src).map_err(cab_err)?;
    Ok(ArchiveInfo { format: "cab".into(), read_only: true, entries: cab_entries(&cab), ..ArchiveInfo::default() })
}

pub fn visit_cab(fs: &Fs, set: &VolumeSet, v: &mut dyn Visitor) -> Result<()> {
    let src = ConcatReader::new(fs.clone(), &set.paths)?;
    let mut cab = cab::Cabinet::new(src).map_err(cab_err)?;
    let entries = cab_entries(&cab);
    for entry in entries {
        let Some(mut out) = v.open(&entry)? else { continue };
        let stored = entry.path.replace('/', "\\");
        let mut reader = cab.read_file(&stored).map_err(cab_err)?;
        crate::codecs::copy_all(&mut reader, &mut out).map_err(cab_err)?;
        drop(out);
        v.done(&entry)?;
    }
    Ok(())
}

// ── ISO 9660, with Joliet long names when present ─────────────────────────────────────────────

const SECTOR: u64 = 2048;

#[derive(Clone)]
struct IsoFile {
    entry: Entry,
    extent: u64,
    size: u64,
}

fn iso_time(b: &[u8]) -> Option<i64> {
    // Seven bytes: years since 1900, month, day, hour, minute, second, offset in 15-minute units.
    let at = local_to_unix(1900 + b[0] as i32, b[1] as u32, b[2] as u32, b[3] as u32, b[4] as u32, b[5] as u32)?;
    Some(at)
}

fn walk(
    src: &mut ConcatReader,
    extent: u64,
    size: u64,
    joliet: bool,
    prefix: &str,
    depth: u32,
    out: &mut Vec<IsoFile>,
) -> Result<()> {
    if depth > 64 {
        return Err(Error::Corrupt("ISO folders nested too deep".into()));
    }
    let total = src.len();
    if extent * SECTOR + size > total {
        return Err(Error::Corrupt("ISO directory lies outside the image".into()));
    }
    let mut dir = vec![0u8; size as usize];
    src.seek(SeekFrom::Start(extent * SECTOR))?;
    src.read_exact(&mut dir)?;

    let mut at = 0usize;
    while at < dir.len() {
        let len = dir[at] as usize;
        if len == 0 {
            // Records do not cross sectors: padding runs to the next one.
            at = (at / SECTOR as usize + 1) * SECTOR as usize;
            continue;
        }
        if at + len > dir.len() || len < 34 {
            return Err(Error::Corrupt("bad ISO directory record".into()));
        }
        let rec = &dir[at..at + len];
        let name_len = rec[32] as usize;
        if 33 + name_len > rec.len() {
            return Err(Error::Corrupt("bad ISO file name".into()));
        }
        let raw = &rec[33..33 + name_len];
        at += len;
        // "." and "..".
        if name_len == 1 && raw[0] <= 1 {
            continue;
        }
        let name = if joliet {
            let units: Vec<u16> = raw.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
            String::from_utf16_lossy(&units)
        } else {
            String::from_utf8_lossy(raw).into_owned()
        };
        // Version suffix, and the trailing dot of names with no extension.
        let name = name.split(';').next().unwrap_or("").trim_end_matches('.').to_string();
        if name.is_empty() || name == ".." || name.contains('/') {
            continue;
        }
        let child_extent = u32::from_le_bytes(rec[2..6].try_into().unwrap()) as u64;
        let child_size = u32::from_le_bytes(rec[10..14].try_into().unwrap()) as u64;
        let is_dir = rec[25] & 2 != 0;
        let path = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        out.push(IsoFile {
            entry: Entry {
                path: path.clone(),
                is_dir,
                size: Some(if is_dir { 0 } else { child_size }),
                packed: Some(if is_dir { 0 } else { child_size }),
                mtime: iso_time(&rec[18..25]),
                method: "Store".into(),
                ..Entry::default()
            },
            extent: child_extent,
            size: child_size,
        });
        if is_dir {
            walk(src, child_extent, child_size, joliet, &path, depth + 1, out)?;
        }
    }
    Ok(())
}

fn iso_files(src: &mut ConcatReader) -> Result<Vec<IsoFile>> {
    // Volume descriptors from sector 16. Joliet, when it is there, has the real names.
    let mut primary: Option<[u8; 34]> = None;
    let mut joliet: Option<[u8; 34]> = None;
    for sector in 16..64u64 {
        let mut d = vec![0u8; SECTOR as usize];
        src.seek(SeekFrom::Start(sector * SECTOR))?;
        if crate::codecs::read_fill(src, &mut d)? < SECTOR as usize || &d[1..6] != b"CD001" {
            break;
        }
        let kind = d[0];
        if kind == 255 {
            break;
        }
        let mut root = [0u8; 34];
        root.copy_from_slice(&d[156..190]);
        if kind == 1 {
            primary = Some(root);
        } else if kind == 2 && d[88] == b'%' && d[89] == b'/' && matches!(d[90], b'@' | b'C' | b'E') {
            joliet = Some(root);
        }
    }
    let (root, is_joliet) = match (joliet, primary) {
        (Some(r), _) => (r, true),
        (None, Some(r)) => (r, false),
        _ => return Err(Error::Corrupt("no ISO volume descriptor".into())),
    };
    let extent = u32::from_le_bytes(root[2..6].try_into().unwrap()) as u64;
    let size = u32::from_le_bytes(root[10..14].try_into().unwrap()) as u64;
    let mut out = Vec::new();
    walk(src, extent, size, is_joliet, "", 0, &mut out)?;
    Ok(out)
}

pub fn list_iso(fs: &Fs, set: &VolumeSet) -> Result<ArchiveInfo> {
    let mut src = ConcatReader::new(fs.clone(), &set.paths)?;
    let files = iso_files(&mut src)?;
    Ok(ArchiveInfo {
        format: "iso".into(),
        read_only: true,
        entries: files.into_iter().map(|f| f.entry).collect(),
        ..ArchiveInfo::default()
    })
}

pub fn visit_iso(fs: &Fs, set: &VolumeSet, v: &mut dyn Visitor) -> Result<()> {
    let mut src = ConcatReader::new(fs.clone(), &set.paths)?;
    let files = iso_files(&mut src)?;
    for f in files {
        let Some(mut out) = v.open(&f.entry)? else {
            if f.entry.is_dir {
                v.done(&f.entry)?;
            }
            continue;
        };
        src.seek(SeekFrom::Start(f.extent * SECTOR))?;
        let mut body = (&mut src).take(f.size);
        let copied = crate::codecs::copy_all(&mut body, &mut out)?;
        if copied != f.size {
            return Err(Error::Corrupt(format!("{}: image ends early", f.entry.path)));
        }
        drop(out);
        v.done(&f.entry)?;
    }
    Ok(())
}
