//! Recognises an archive by its contents. Extensions lie: `.jar` and `.docx` are ZIPs, and a split
//! set's `.001` says nothing at all.

use std::io::{Read, Seek, SeekFrom};

use crate::codecs::read_fill;
use crate::error::{Error, Result};
use crate::formats::{sevenz, tarfmt};
use crate::model::Format;
use crate::vfs::Fs;
use crate::volumes::{ConcatReader, VolumeSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Detected {
    pub format: Format,
    /// Bytes of program in front of a self-extracting 7z.
    pub sfx_base: u64,
}

const RAR4: &[u8] = b"Rar!\x1a\x07\x00";
const RAR5: &[u8] = b"Rar!\x1a\x07\x01\x00";

pub fn detect(fs: &Fs, set: &VolumeSet) -> Result<Detected> {
    let mut src = ConcatReader::new(fs.clone(), &set.paths)?;
    let total = src.len();
    if total == 0 {
        return Err(Error::NotArchive("the file is empty".into()));
    }
    let mut head = vec![0u8; 64 * 1024];
    let n = read_fill(&mut src, &mut head)?;
    head.truncate(n);
    let plain = |format| Ok(Detected { format, sfx_base: 0 });

    if head.starts_with(&sevenz::SIGNATURE) {
        return plain(Format::SevenZ);
    }
    if head.starts_with(RAR4) || head.starts_with(RAR5) || head.starts_with(b"RE~^") {
        return plain(Format::Rar);
    }
    if head.starts_with(b"PK\x03\x04") || head.starts_with(b"PK\x05\x06") || head.starts_with(b"PK\x07\x08") {
        return plain(Format::Zip);
    }
    if head.starts_with(b"MSCF") {
        return plain(Format::Cab);
    }
    if head.starts_with(&[0x1F, 0x8B]) {
        return plain(if tarfmt::wraps_tar(fs, set, Format::Gz) { Format::TarGz } else { Format::Gz });
    }
    if head.starts_with(b"BZh") {
        return plain(if tarfmt::wraps_tar(fs, set, Format::Bz2) { Format::TarBz2 } else { Format::Bz2 });
    }
    if head.starts_with(&[0xFD, b'7', b'z', b'X', b'Z', 0]) {
        return plain(if tarfmt::wraps_tar(fs, set, Format::Xz) { Format::TarXz } else { Format::Xz });
    }
    if head.starts_with(&[0x28, 0xB5, 0x2F, 0xFD]) {
        return plain(if tarfmt::wraps_tar(fs, set, Format::Zst) { Format::TarZst } else { Format::Zst });
    }
    if head.len() >= 512 && tarfmt::is_tar_block(&head) {
        return plain(Format::Tar);
    }
    // ISO's first descriptor is at sector 16.
    if total >= 0x8006 {
        let mut magic = [0u8; 5];
        src.seek(SeekFrom::Start(0x8001))?;
        src.read_exact(&mut magic)?;
        if &magic == b"CD001" {
            return plain(Format::Iso);
        }
    }
    // A program with an archive on its end: self-extractors.
    let is_program = head.starts_with(b"MZ") || head.starts_with(b"\x7fELF") || head.starts_with(&[0xCF, 0xFA, 0xED, 0xFE]);
    if is_program {
        if has_zip_end(&mut src, total)? {
            return plain(Format::Zip);
        }
        if let Some(base) = find_after_program(&mut src, total, &sevenz::SIGNATURE)? {
            return Ok(Detected { format: Format::SevenZ, sfx_base: base });
        }
        if find_after_program(&mut src, total, RAR5)?.is_some() || find_after_program(&mut src, total, RAR4)?.is_some() {
            return plain(Format::Rar);
        }
    }
    // A ZIP with junk in front, which many tools still open.
    if has_zip_end(&mut src, total)? {
        return plain(Format::Zip);
    }
    Err(Error::NotArchive(fs.file_name(&set.paths[0])))
}

fn has_zip_end(src: &mut ConcatReader, total: u64) -> Result<bool> {
    let tail_len = total.min(22 + 0xFFFF) as usize;
    if tail_len < 22 {
        return Ok(false);
    }
    let mut tail = vec![0u8; tail_len];
    src.seek(SeekFrom::Start(total - tail_len as u64))?;
    src.read_exact(&mut tail)?;
    Ok((0..=tail_len - 22).rev().any(|i| {
        tail[i..i + 4] == *b"PK\x05\x06" && i + 22 + u16::from_le_bytes([tail[i + 20], tail[i + 21]]) as usize == tail_len
    }))
}

/// Finds a signature past the first bytes of a program. The scan is capped: real stubs are small.
fn find_after_program(src: &mut ConcatReader, total: u64, sig: &[u8]) -> Result<Option<u64>> {
    let limit = total.min(32 << 20);
    let mut buf = vec![0u8; 1 << 20];
    let mut at = 512u64;
    while at < limit {
        src.seek(SeekFrom::Start(at))?;
        let n = read_fill(src, &mut buf)?;
        if n < sig.len() {
            break;
        }
        if let Some(i) = buf[..n].windows(sig.len()).position(|w| w == sig) {
            return Ok(Some(at + i as u64));
        }
        at += (n - sig.len() + 1) as u64;
    }
    Ok(None)
}
