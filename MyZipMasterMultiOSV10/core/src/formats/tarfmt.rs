//! TAR with its usual compressors, and the one-file formats GZ, BZ2, XZ and ZST.

use std::io::{self, Read, Write};

use crate::codecs::{self, copy_all, Compressor};
use crate::error::{Error, Result};
use crate::model::*;
use crate::vfs::Fs;
use crate::volumes::{ConcatReader, SplitWriter, VolumeSet};

/// Undoes the outer compression.
fn decoder<'a>(format: Format, src: impl Read + 'a) -> Result<Box<dyn Read + 'a>> {
    Ok(match format {
        Format::Tar => Box::new(src),
        Format::TarGz | Format::Gz => Box::new(flate2::read::MultiGzDecoder::new(src)),
        Format::TarBz2 | Format::Bz2 => Box::new(bzip2::read::MultiBzDecoder::new(src)),
        Format::TarXz | Format::Xz => Box::new(lzma_rust2::XzReader::new(src, true)),
        Format::TarZst | Format::Zst => codecs::zstd_reader(src)?,
        other => return Err(Error::Invalid(format!("{} is not a stream format", other.name()))),
    })
}

/// Decoder errors on a damaged file come out as plain I/O errors; here they mean the archive.
fn stream_err(e: io::Error) -> Error {
    let text = e.to_string();
    if text.contains(crate::error::CANCEL_MARK) {
        return Error::Cancelled;
    }
    match e.kind() {
        io::ErrorKind::NotFound | io::ErrorKind::PermissionDenied | io::ErrorKind::WriteZero => Error::Io(text),
        _ => Error::Corrupt(text),
    }
}

fn tar_entry(entry: &tar::Entry<'_, impl Read>, method: &str) -> Result<Entry> {
    let head = entry.header();
    let kind = head.entry_type();
    let raw = entry.path_bytes();
    let path = String::from_utf8(raw.to_vec())
        .unwrap_or_else(|_| crate::formats::zip::decode_name(&raw, false, None))
        .replace('\\', "/");
    Ok(Entry {
        path: path.trim_end_matches('/').trim_start_matches("./").to_string(),
        is_dir: kind.is_dir(),
        size: Some(head.entry_size().map_err(stream_err)?),
        packed: None,
        mtime: head.mtime().ok().map(|t| t as i64),
        crc: None,
        method: method.to_string(),
        encrypted: false,
        is_link: kind.is_symlink() || kind.is_hard_link(),
        mode: head.mode().ok(),
    })
}

fn is_content(kind: tar::EntryType) -> bool {
    !(kind.is_pax_global_extensions() || kind.is_pax_local_extensions() || kind.is_gnu_longname() || kind.is_gnu_longlink())
}

fn outer_method(format: Format) -> &'static str {
    match format {
        Format::TarGz | Format::Gz => "Deflate",
        Format::TarBz2 | Format::Bz2 => "BZip2",
        Format::TarXz | Format::Xz => "LZMA2",
        Format::TarZst | Format::Zst => "Zstandard",
        _ => "Store",
    }
}

pub fn list_tar(fs: &Fs, set: &VolumeSet, format: Format) -> Result<ArchiveInfo> {
    let src = ConcatReader::new(fs.clone(), &set.paths)?;
    let mut archive = tar::Archive::new(decoder(format, src)?);
    let mut entries = Vec::new();
    for item in archive.entries().map_err(stream_err)? {
        let item = item.map_err(stream_err)?;
        if !is_content(item.header().entry_type()) {
            continue;
        }
        entries.push(tar_entry(&item, outer_method(format))?);
    }
    Ok(ArchiveInfo { format: format.name().into(), solid: format != Format::Tar, entries, ..ArchiveInfo::default() })
}

pub fn visit_tar(fs: &Fs, set: &VolumeSet, format: Format, v: &mut dyn Visitor) -> Result<()> {
    let src = ConcatReader::new(fs.clone(), &set.paths)?;
    let mut archive = tar::Archive::new(decoder(format, src)?);
    for item in archive.entries().map_err(stream_err)? {
        let mut item = item.map_err(stream_err)?;
        if !is_content(item.header().entry_type()) {
            continue;
        }
        let entry = tar_entry(&item, outer_method(format))?;
        match v.open(&entry)? {
            Some(mut out) => {
                copy_all(&mut item, &mut out).map_err(stream_err)?;
                drop(out);
                v.done(&entry)?;
            }
            None => {
                if entry.is_dir {
                    v.done(&entry)?;
                }
            }
        }
    }
    // The tar reader stops at its end marker, short of the compressor's checksum.
    let mut rest = archive.into_inner();
    std::io::copy(&mut rest, &mut std::io::sink()).map_err(stream_err)?;
    Ok(())
}

/// The one file's name: the gzip header's if it has one, or the file name minus the extension.
fn single_name(fs: &Fs, set: &VolumeSet, format: Format) -> String {
    if format == Format::Gz {
        if let Ok(src) = ConcatReader::new(fs.clone(), &set.paths) {
            let gz = flate2::read::GzDecoder::new(src);
            if let Some(name) = gz.header().and_then(|h| h.filename()) {
                let text = String::from_utf8_lossy(name).into_owned();
                // Only the last component: a crafted header must not choose a folder.
                let tail = text.rsplit(['/', '\\']).next().unwrap_or("").to_string();
                if !tail.is_empty() {
                    return tail;
                }
            }
        }
    }
    let file = fs.file_name(&set.paths[0]);
    // x.txt.gz.001 and x.txt.gz both come down to x.txt.
    let mut name = file.as_str();
    if let Some((head, tail)) = name.rsplit_once('.') {
        if tail.chars().all(|c| c.is_ascii_digit()) {
            name = head;
        }
    }
    match name.rsplit_once('.') {
        Some((head, _)) if !head.is_empty() => head.to_string(),
        _ => format!("{name}.out"),
    }
}

fn single_entry(fs: &Fs, set: &VolumeSet, format: Format) -> Result<Entry> {
    let mut size = None;
    let packed = set.paths.iter().map(|p| fs.size(p)).sum::<Result<u64>>()?;
    let mut mtime = None;
    if format == Format::Gz {
        // The trailer gives the size modulo 4 GB, which is right for all but huge files.
        let mut src = ConcatReader::new(fs.clone(), &set.paths)?;
        use std::io::{Seek, SeekFrom};
        if packed >= 18 {
            src.seek(SeekFrom::End(-4))?;
            let mut t = [0u8; 4];
            src.read_exact(&mut t)?;
            size = Some(u32::from_le_bytes(t) as u64);
            src.seek(SeekFrom::Start(0))?;
            let gz = flate2::read::GzDecoder::new(src);
            mtime = gz.header().map(|h| h.mtime() as i64).filter(|t| *t > 0);
        }
    }
    Ok(Entry {
        path: single_name(fs, set, format),
        size,
        packed: Some(packed),
        mtime,
        method: outer_method(format).to_string(),
        ..Entry::default()
    })
}

pub fn list_single(fs: &Fs, set: &VolumeSet, format: Format) -> Result<ArchiveInfo> {
    let entry = single_entry(fs, set, format)?;
    Ok(ArchiveInfo { format: format.name().into(), entries: vec![entry], ..ArchiveInfo::default() })
}

pub fn visit_single(fs: &Fs, set: &VolumeSet, format: Format, v: &mut dyn Visitor) -> Result<()> {
    let entry = single_entry(fs, set, format)?;
    let Some(mut out) = v.open(&entry)? else { return Ok(()) };
    let src = ConcatReader::new(fs.clone(), &set.paths)?;
    let mut d = decoder(format, src)?;
    copy_all(&mut d, &mut out).map_err(stream_err)?;
    drop(out);
    v.done(&entry)
}

/// Peeks inside a compressed stream: `.gz` holding a tar is really a `.tar.gz`.
pub fn wraps_tar(fs: &Fs, set: &VolumeSet, format: Format) -> bool {
    let Ok(src) = ConcatReader::new(fs.clone(), &set.paths) else { return false };
    let Ok(mut d) = decoder(format, src) else { return false };
    let mut head = [0u8; 512];
    match codecs::read_fill(&mut d, &mut head) {
        Ok(512) => is_tar_block(&head),
        _ => false,
    }
}

pub fn is_tar_block(head: &[u8]) -> bool {
    if head.len() < 512 {
        return false;
    }
    if &head[257..262] == b"ustar" {
        return true;
    }
    // Old tar: no magic, but the header checksum tells.
    let stored = std::str::from_utf8(&head[148..156]).ok().map(|s| s.trim_matches(|c: char| c == '\0' || c == ' '));
    let Some(Ok(stored)) = stored.map(|s| u32::from_str_radix(s, 8)) else { return false };
    let mut sum = 0u32;
    for (i, b) in head[..512].iter().enumerate() {
        sum += if (148..156).contains(&i) { 32 } else { *b as u32 };
    }
    sum == stored && head[0] != 0
}

// ── Writing ───────────────────────────────────────────────────────────────────────────────────

fn write_tar_items<W: Write>(sink: W, items: &[InputItem], open: &dyn Fn(&InputItem) -> Result<Box<dyn Read>>) -> Result<W> {
    let mut b = tar::Builder::new(sink);
    b.mode(tar::HeaderMode::Complete);
    for item in items {
        let mut head = tar::Header::new_gnu();
        head.set_mtime(item.mtime.unwrap_or(0).max(0) as u64);
        head.set_uid(0);
        head.set_gid(0);
        if item.is_dir {
            head.set_entry_type(tar::EntryType::Directory);
            head.set_mode(item.mode.map(|m| m & 0o7777).unwrap_or(0o755));
            head.set_size(0);
            b.append_data(&mut head, format!("{}/", item.name.trim_end_matches('/')), io::empty())?;
        } else {
            head.set_entry_type(tar::EntryType::Regular);
            head.set_mode(item.mode.map(|m| m & 0o7777).unwrap_or(0o644));
            head.set_size(item.size);
            // A file that changed size while packing would otherwise desynchronize the stream.
            let reader = open(item)?.take(item.size);
            let mut counted = Counted { inner: reader, count: 0 };
            b.append_data(&mut head, &item.name, &mut counted)?;
            if counted.count != item.size {
                return Err(Error::Io(format!("{}: file changed while it was being read", item.name)));
            }
        }
    }
    b.into_inner().map_err(Error::from)
}

struct Counted<R> {
    inner: R,
    count: u64,
}

impl<R: Read> Read for Counted<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.count += n as u64;
        Ok(n)
    }
}

pub fn create_tar(
    out: SplitWriter,
    fs: &Fs,
    format: Format,
    level: u32,
    items: &[InputItem],
    open: &dyn Fn(&InputItem) -> Result<Box<dyn Read>>,
) -> Result<Vec<String>> {
    let out = match format {
        Format::Tar => write_tar_items(out, items, open)?,
        Format::TarGz => {
            let c = codecs::gzip_writer(out, level, None, None)?;
            write_tar_items(c, items, open)?.finish()?
        }
        Format::TarBz2 => {
            let c = codecs::bzip2_writer(out, level);
            write_tar_items(c, items, open)?.finish()?
        }
        Format::TarXz => {
            let c = codecs::xz_writer(out, level)?;
            write_tar_items(c, items, open)?.finish()?
        }
        Format::TarZst => {
            // Zstandard here pulls from a reader, so the tar is built first.
            let mut temp_name = String::new();
            for i in 0.. {
                let candidate = format!("{}.zmtar{i}", fs_temp_base(&out));
                if !fs.exists(&candidate) {
                    temp_name = candidate;
                    break;
                }
            }
            let handle = fs.create(&temp_name)?;
            let built = write_tar_items(handle, items, open);
            let mut out = out;
            let done = built.and_then(|mut h| {
                h.flush()?;
                drop(h);
                let src = fs.open(&temp_name)?;
                codecs::zstd_compress(src, &mut out, level)
            });
            let _ = fs.remove_file(&temp_name);
            done?;
            out
        }
        other => return Err(Error::Invalid(format!("{} is not a tar format", other.name()))),
    };
    out.finish()
}

fn fs_temp_base(out: &SplitWriter) -> String {
    out.base_name()
}

pub fn create_single(
    mut out: SplitWriter,
    format: Format,
    level: u32,
    item: &InputItem,
    open: &dyn Fn(&InputItem) -> Result<Box<dyn Read>>,
) -> Result<Vec<String>> {
    let mut src = open(item)?;
    let file_name = item.name.rsplit('/').next().unwrap_or(&item.name).to_string();
    match format {
        Format::Gz => {
            let mut c = codecs::gzip_writer(&mut out, level, Some(&file_name), item.mtime)?;
            copy_all(&mut src, &mut c)?;
            finish_quiet(c)?;
        }
        Format::Bz2 => {
            let mut c = codecs::bzip2_writer(&mut out, level);
            copy_all(&mut src, &mut c)?;
            finish_quiet(c)?;
        }
        Format::Xz => {
            let mut c = codecs::xz_writer(&mut out, level)?;
            copy_all(&mut src, &mut c)?;
            finish_quiet(c)?;
        }
        Format::Zst => codecs::zstd_compress(&mut src, &mut out, level)?,
        other => return Err(Error::Invalid(format!("{} is not a single-file format", other.name()))),
    }
    out.finish()
}

fn finish_quiet<W: Write>(c: Compressor<W>) -> Result<()> {
    c.finish().map(|_| ())
}
