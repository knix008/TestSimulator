//! ZIP, written out by hand: no library does splitting (`.z01`), and all of them are unkind to
//! Korean names made by older Windows tools. Follows PKWARE APPNOTE 6.3 and WinZip's AE-2.

use std::io::{self, Read, Seek, SeekFrom, Write};
use std::sync::Arc;

use crate::codecs::{self, copy_all, read_fill, Compressor, CountWriter, CrcReader};
use crate::error::{Error, Result};
use crate::formats::zipcrypto::{AesReader, AesWriter, ZipCryptoReader, ZipCryptoWriter};
use crate::model::*;
use crate::vfs::{Fs, ReadSeek};
use crate::volumes::{ConcatReader, SplitWriter, VolumeSet};

const SIG_LOCAL: u32 = 0x0403_4b50;
const SIG_CENTRAL: u32 = 0x0201_4b50;
const SIG_EOCD: u32 = 0x0605_4b50;
const SIG_EOCD64: u32 = 0x0606_4b50;
const SIG_LOC64: u32 = 0x0706_4b50;
const SIG_DESCRIPTOR: u32 = 0x0807_4b50;

const M_STORE: u16 = 0;
const M_DEFLATE: u16 = 8;
const M_DEFLATE64: u16 = 9;
const M_BZIP2: u16 = 12;
const M_LZMA: u16 = 14;
const M_ZSTD: u16 = 93;
const M_XZ: u16 = 95;
const M_AES: u16 = 99;

const FLAG_ENCRYPTED: u16 = 1;
const FLAG_LZMA_EOS: u16 = 1 << 1;
const FLAG_DESCRIPTOR: u16 = 1 << 3;
const FLAG_STRONG: u16 = 1 << 6;
const FLAG_UTF8: u16 = 1 << 11;
const FLAG_CENTRAL_ENC: u16 = 1 << 13;

pub fn method_id(name: &str) -> Result<u16> {
    Ok(match name.to_lowercase().as_str() {
        "store" | "copy" => M_STORE,
        "deflate" | "" => M_DEFLATE,
        "bzip2" => M_BZIP2,
        "lzma" => M_LZMA,
        "zstd" => M_ZSTD,
        "xz" => M_XZ,
        other => return Err(Error::Invalid(format!("ZIP cannot use method {other}"))),
    })
}

fn method_name(id: u16) -> String {
    match id {
        M_STORE => "Store".into(),
        1 => "Shrink".into(),
        6 => "Implode".into(),
        M_DEFLATE => "Deflate".into(),
        M_DEFLATE64 => "Deflate64".into(),
        M_BZIP2 => "BZip2".into(),
        M_LZMA => "LZMA".into(),
        M_ZSTD => "Zstandard".into(),
        M_XZ => "XZ".into(),
        98 => "PPMd".into(),
        n => format!("Method {n}"),
    }
}

// ── Writing ───────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZipEncryption {
    None,
    ZipCrypto,
    Aes128,
    Aes256,
}

#[derive(Debug, Clone)]
pub struct ZipWriteOptions {
    pub method: u16,
    pub level: u32,
    pub password: Option<String>,
    pub encryption: ZipEncryption,
    pub comment: Option<String>,
    /// Files that will not shrink (photos, videos, other archives) are stored.
    pub smart_store: bool,
    /// Writes Zip64 records even when small enough not to need them. Lets the tests prove the
    /// records are read correctly without making 4 GB of data.
    pub force_zip64: bool,
    /// Spanned sets begin with a marker signature.
    pub spanned: bool,
}

struct Central {
    name: Vec<u8>,
    flags: u16,
    method: u16,
    dos_time: u16,
    dos_date: u16,
    crc: u32,
    csize: u64,
    usize_: u64,
    disk: u32,
    offset: u64,
    is_dir: bool,
    mode: Option<u32>,
    mtime: Option<i64>,
    /// (AES strength, inner method)
    aes: Option<(u8, u16)>,
}

const STORE_EXTS: &[&str] = &[
    "zip", "7z", "rar", "gz", "bz2", "xz", "zst", "tgz", "cab", "jpg", "jpeg", "png", "gif", "webp", "heic", "avif",
    "mp3", "aac", "ogg", "opus", "flac", "m4a", "mp4", "m4v", "mkv", "mov", "webm", "avi", "docx", "xlsx", "pptx",
    "jar", "apk",
];

pub fn is_already_compressed(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.rsplit_once('.').is_some_and(|(_, ext)| STORE_EXTS.contains(&ext))
}

pub struct ZipWriter {
    out: SplitWriter,
    opts: ZipWriteOptions,
    central: Vec<Central>,
}

fn dos_datetime(t: Option<i64>) -> (u16, u16) {
    let Some((y, mo, d, h, mi, s)) = t.and_then(unix_to_local) else {
        return (0, (1 << 5) | 1);
    };
    if y < 1980 {
        return (0, (1 << 5) | 1);
    }
    let year = (y - 1980).min(127) as u16;
    (
        ((h as u16) << 11) | ((mi as u16) << 5) | ((s as u16) / 2),
        (year << 9) | ((mo as u16) << 5) | d as u16,
    )
}

fn dos_to_unix(time: u16, date: u16) -> Option<i64> {
    let (y, mo, d) = (1980 + (date >> 9) as i32, ((date >> 5) & 15) as u32, (date & 31) as u32);
    let (h, mi, s) = ((time >> 11) as u32, ((time >> 5) & 63) as u32, ((time & 31) * 2) as u32);
    if mo == 0 || d == 0 {
        return None;
    }
    local_to_unix(y, mo, d, h.min(23), mi.min(59), s.min(59))
}

fn put16(v: &mut Vec<u8>, n: u16) {
    v.extend_from_slice(&n.to_le_bytes());
}
fn put32(v: &mut Vec<u8>, n: u32) {
    v.extend_from_slice(&n.to_le_bytes());
}
fn put64(v: &mut Vec<u8>, n: u64) {
    v.extend_from_slice(&n.to_le_bytes());
}

fn aes_extra(strength: u8, inner: u16) -> Vec<u8> {
    let mut e = Vec::with_capacity(11);
    put16(&mut e, 0x9901);
    put16(&mut e, 7);
    put16(&mut e, 2); // AE-2: the CRC field is left empty, authentication covers the data.
    e.extend_from_slice(b"AE");
    e.push(strength);
    put16(&mut e, inner);
    e
}

fn time_extra(mtime: Option<i64>) -> Vec<u8> {
    let mut e = Vec::new();
    if let Some(t) = mtime {
        put16(&mut e, 0x5455);
        put16(&mut e, 5);
        e.push(1);
        put32(&mut e, t.clamp(0, u32::MAX as i64) as u32);
    }
    e
}

impl ZipWriter {
    pub fn new(mut out: SplitWriter, opts: ZipWriteOptions) -> Result<Self> {
        if opts.spanned {
            out.write_all(&SIG_DESCRIPTOR.to_le_bytes())?;
        }
        Ok(ZipWriter { out, opts, central: Vec::new() })
    }

    /// Adds one item. `open` hands out a fresh source (ZipCrypto reads it twice).
    pub fn add(
        &mut self,
        item: &InputItem,
        mut open: impl FnMut() -> Result<Box<dyn Read>>,
    ) -> Result<()> {
        let mut name = item.name.replace('\\', "/");
        if item.is_dir && !name.ends_with('/') {
            name.push('/');
        }
        let name_bytes = name.into_bytes();
        let ascii = name_bytes.is_ascii();

        let encrypted = !item.is_dir && self.opts.encryption != ZipEncryption::None && self.opts.password.is_some();
        let mut inner_method = if item.is_dir || item.size == 0 { M_STORE } else { self.opts.method };
        if self.opts.smart_store && inner_method != M_STORE && is_already_compressed(&item.name) {
            inner_method = M_STORE;
        }
        let aes_strength = match (encrypted, self.opts.encryption) {
            (true, ZipEncryption::Aes128) => Some(1u8),
            (true, ZipEncryption::Aes256) => Some(3u8),
            _ => None,
        };

        let mut flags = 0u16;
        if !ascii {
            flags |= FLAG_UTF8;
        }
        if encrypted {
            flags |= FLAG_ENCRYPTED;
        }
        if inner_method == M_LZMA {
            flags |= FLAG_LZMA_EOS;
        }
        let stored_method = if aes_strength.is_some() { M_AES } else { inner_method };

        // ZipCrypto's password check byte is the CRC's top byte, so the CRC must be known first.
        let crypto_crc = if encrypted && aes_strength.is_none() {
            let mut r = CrcReader::new(open()?);
            copy_all(&mut r, &mut io::sink())?;
            Some(r.hasher.finalize())
        } else {
            None
        };

        let (dos_time, dos_date) = dos_datetime(item.mtime);
        // A big file reserves its Zip64 sizes up front; the header must not grow afterwards.
        let need64 = self.opts.force_zip64 || item.size >= 0xFFFF_0000;
        let mut extra = time_extra(item.mtime);
        if let Some(s) = aes_strength {
            extra.extend_from_slice(&aes_extra(s, inner_method));
        }
        let zip64_at = extra.len();
        if need64 {
            put16(&mut extra, 1);
            put16(&mut extra, 16);
            put64(&mut extra, item.size);
            put64(&mut extra, 0);
        }

        let header_len = 30 + name_bytes.len() + extra.len();
        self.keep_together(header_len as u64)?;
        let (disk, offset) = self.place()?;
        let header_at = self.out.stream_position()?;

        let mut head = Vec::with_capacity(header_len);
        put32(&mut head, SIG_LOCAL);
        put16(&mut head, version_needed(inner_method, need64));
        put16(&mut head, flags);
        put16(&mut head, stored_method);
        put16(&mut head, dos_time);
        put16(&mut head, dos_date);
        put32(&mut head, 0);
        put32(&mut head, if need64 { u32::MAX } else { 0 });
        put32(&mut head, if need64 { u32::MAX } else { 0 });
        put16(&mut head, name_bytes.len() as u16);
        put16(&mut head, extra.len() as u16);
        head.extend_from_slice(&name_bytes);
        head.extend_from_slice(&extra);
        self.out.write_all(&head)?;

        // The data.
        let (crc, usize_, csize) = if item.is_dir {
            (0, 0, 0)
        } else {
            let mut source = CrcReader::new(open()?);
            let counted = CountWriter::new(&mut self.out);
            let password = self.opts.password.clone().unwrap_or_default();
            let csize = if let Some(strength) = aes_strength {
                let enc = AesWriter::new(counted, password.as_bytes(), strength)?;
                let enc = compress_into(enc, &mut source, inner_method, self.opts.level)?;
                enc.finish()?.count
            } else if let Some(c) = crypto_crc {
                let enc = ZipCryptoWriter::new(counted, password.as_bytes(), (c >> 24) as u8)?;
                compress_into(enc, &mut source, inner_method, self.opts.level)?.into_inner().count
            } else {
                compress_into(counted, &mut source, inner_method, self.opts.level)?.count
            };
            let usize_ = source.count;
            let crc = source.hasher.finalize();
            (crc, usize_, csize)
        };
        // AE-2 leaves the CRC blank, it would leak information about the plaintext.
        let stored_crc = if aes_strength.is_some() { 0 } else { crc };

        if !need64 && (usize_ >= 0xFFFF_FFFF || csize >= 0xFFFF_FFFF) {
            return Err(Error::Invalid(format!("{}: size changed while it was being read", item.name)));
        }

        // Back to fill in what is known now.
        let end = self.out.stream_position()?;
        self.out.seek(SeekFrom::Start(header_at + 14))?;
        let mut sizes = Vec::with_capacity(12);
        put32(&mut sizes, stored_crc);
        if need64 {
            put32(&mut sizes, u32::MAX);
            put32(&mut sizes, u32::MAX);
        } else {
            put32(&mut sizes, csize as u32);
            put32(&mut sizes, usize_ as u32);
        }
        self.out.write_all(&sizes)?;
        if need64 {
            let at = header_at + 30 + name_bytes.len() as u64 + zip64_at as u64 + 4;
            self.out.seek(SeekFrom::Start(at))?;
            let mut pair = Vec::with_capacity(16);
            put64(&mut pair, usize_);
            put64(&mut pair, csize);
            self.out.write_all(&pair)?;
        }
        self.out.seek(SeekFrom::Start(end))?;

        self.central.push(Central {
            name: name_bytes,
            flags,
            method: stored_method,
            dos_time,
            dos_date,
            crc: stored_crc,
            csize,
            usize_,
            disk: disk as u32,
            offset,
            is_dir: item.is_dir,
            mode: item.mode,
            mtime: item.mtime,
            aes: aes_strength.map(|s| (s, inner_method)),
        });
        Ok(())
    }

    /// Where the next byte goes, as ZIP records it. Only a spanned set numbers its disks: a set
    /// of `.001` slices is one long file to anything reading it.
    fn place(&mut self) -> Result<(usize, u64)> {
        if self.opts.spanned {
            Ok(self.out.location())
        } else {
            Ok((0, self.out.stream_position()?))
        }
    }

    fn keep_together(&mut self, need: u64) -> Result<()> {
        if self.opts.spanned {
            self.out.keep_together(need)?;
        }
        Ok(())
    }

    pub fn finish(mut self) -> Result<Vec<String>> {
        let force64 = self.opts.force_zip64;
        let mut cd_start: Option<(u32, u64)> = None;
        let mut cd_size = 0u64;
        let mut on_last_disk = 0u64;
        let mut last_disk = u32::MAX;

        let central = std::mem::take(&mut self.central);
        for c in &central {
            let mut extra = time_extra(c.mtime);
            if let Some((s, inner)) = c.aes {
                extra.extend_from_slice(&aes_extra(s, inner));
            }
            let big = force64
                || c.usize_ >= 0xFFFF_FFFF
                || c.csize >= 0xFFFF_FFFF
                || c.offset >= 0xFFFF_FFFF
                || c.disk >= 0xFFFF;
            if big {
                put16(&mut extra, 1);
                put16(&mut extra, 28);
                put64(&mut extra, c.usize_);
                put64(&mut extra, c.csize);
                put64(&mut extra, c.offset);
                put32(&mut extra, c.disk);
            }
            let mut r = Vec::with_capacity(46 + c.name.len() + extra.len());
            put32(&mut r, SIG_CENTRAL);
            // Made by: Unix when the mode is known, so it survives; otherwise FAT.
            put16(&mut r, if c.mode.is_some() { (3 << 8) | 63 } else { 63 });
            put16(&mut r, version_needed(c.aes.map(|a| a.1).unwrap_or(c.method), big));
            put16(&mut r, c.flags);
            put16(&mut r, c.method);
            put16(&mut r, c.dos_time);
            put16(&mut r, c.dos_date);
            put32(&mut r, c.crc);
            put32(&mut r, if big { u32::MAX } else { c.csize as u32 });
            put32(&mut r, if big { u32::MAX } else { c.usize_ as u32 });
            put16(&mut r, c.name.len() as u16);
            put16(&mut r, extra.len() as u16);
            put16(&mut r, 0);
            put16(&mut r, if big { 0xFFFF } else { c.disk as u16 });
            put16(&mut r, 0);
            let dos_attr: u32 = if c.is_dir { 0x10 } else { 0x20 };
            let attr = match c.mode {
                Some(mode) => (mode << 16) | dos_attr,
                None => dos_attr,
            };
            put32(&mut r, attr);
            put32(&mut r, if big { u32::MAX } else { c.offset as u32 });
            r.extend_from_slice(&c.name);
            r.extend_from_slice(&extra);

            self.keep_together(r.len() as u64)?;
            let (disk, offset) = self.place()?;
            if cd_start.is_none() {
                cd_start = Some((disk as u32, offset));
            }
            if disk as u32 != last_disk {
                last_disk = disk as u32;
                on_last_disk = 0;
            }
            on_last_disk += 1;
            self.out.write_all(&r)?;
            cd_size += r.len() as u64;
        }

        let total = central.len() as u64;
        let (start_disk, start_offset) = match cd_start {
            Some(s) => s,
            None => {
                let (d, o) = self.place()?;
                (d as u32, o)
            }
        };

        let comment = self.opts.comment.clone().unwrap_or_default();
        let mut comment = comment.into_bytes();
        comment.truncate(0xFFFF);

        let need64 = force64
            || total >= 0xFFFF
            || cd_size >= 0xFFFF_FFFF
            || start_offset >= 0xFFFF_FFFF
            || start_disk >= 0xFFFF
            || self.out.part_count() as u64 >= 0xFFFF;

        // The end records stay together, in the last part.
        let tail = if need64 { 56 + 20 } else { 0 } + 22 + comment.len();
        self.keep_together(tail as u64)?;
        let (disk, offset) = self.place()?;
        let disk = disk as u32;
        if disk != last_disk {
            on_last_disk = 0;
        }

        if need64 {
            let mut r = Vec::with_capacity(76);
            put32(&mut r, SIG_EOCD64);
            put64(&mut r, 44);
            put16(&mut r, 45);
            put16(&mut r, 45);
            put32(&mut r, disk);
            put32(&mut r, start_disk);
            put64(&mut r, on_last_disk);
            put64(&mut r, total);
            put64(&mut r, cd_size);
            put64(&mut r, start_offset);
            put32(&mut r, SIG_LOC64);
            put32(&mut r, disk);
            put64(&mut r, offset);
            put32(&mut r, disk + 1);
            self.out.write_all(&r)?;
        }
        let mut r = Vec::with_capacity(22 + comment.len());
        put32(&mut r, SIG_EOCD);
        put16(&mut r, disk.min(0xFFFF) as u16);
        put16(&mut r, start_disk.min(0xFFFF) as u16);
        put16(&mut r, on_last_disk.min(0xFFFF) as u16);
        put16(&mut r, total.min(0xFFFF) as u16);
        put32(&mut r, cd_size.min(0xFFFF_FFFF) as u32);
        put32(&mut r, start_offset.min(0xFFFF_FFFF) as u32);
        put16(&mut r, comment.len() as u16);
        r.extend_from_slice(&comment);
        self.out.write_all(&r)?;
        self.out.finish()
    }

    pub fn abort(self) {
        self.out.abort();
    }
}

fn version_needed(method: u16, zip64: bool) -> u16 {
    let by_method = match method {
        M_STORE => 10,
        M_DEFLATE => 20,
        M_BZIP2 => 46,
        M_LZMA => 63,
        _ => 63,
    };
    if zip64 {
        by_method.max(45)
    } else {
        by_method
    }
}

/// Runs the source through the codec into `out` and returns `out`.
fn compress_into<W: Write>(out: W, source: &mut dyn Read, method: u16, level: u32) -> Result<W> {
    match method {
        M_STORE => {
            let mut w = out;
            copy_all(source, &mut w)?;
            Ok(w)
        }
        M_DEFLATE => {
            let mut w = codecs::deflate_writer(out, level);
            copy_all(source, &mut w)?;
            w.finish()
        }
        M_BZIP2 => {
            let mut w = codecs::bzip2_writer(out, level);
            copy_all(source, &mut w)?;
            w.finish()
        }
        M_XZ => {
            let mut w = codecs::xz_writer(out, level)?;
            copy_all(source, &mut w)?;
            w.finish()
        }
        M_ZSTD => {
            let mut sink = out;
            codecs::zstd_compress(source, &mut sink, level)?;
            Ok(sink)
        }
        M_LZMA => {
            // ZIP's LZMA: version, length of properties, properties, then a raw stream ending
            // in the end marker.
            let mut out = out;
            let options = lzma_rust2::LzmaOptions::with_preset(level.min(9));
            out.write_all(&[0x10, 0x02, 5, 0])?;
            out.write_all(&[options.get_props()])?;
            out.write_all(&options.dict_size.to_le_bytes())?;
            let writer = lzma_rust2::LzmaWriter::new_no_header(out, &options, true).map_err(codecs::lzma_err)?;
            let mut w = Compressor::Lzma(writer);
            copy_all(source, &mut w)?;
            w.finish()
        }
        other => Err(Error::Invalid(format!("cannot compress with ZIP method {other}"))),
    }
}

// ── Reading ───────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct Record {
    entry: Entry,
    flags: u16,
    /// Real method, under AES.
    inner_method: u16,
    aes_strength: Option<u8>,
    dos_time: u16,
    crc: u32,
    csize: u64,
    usize_: u64,
    /// Position of the local header in the concatenated set.
    local_at: u64,
}

/// Which text encoding names without the UTF-8 flag are in.
pub fn decode_name(raw: &[u8], utf8_flag: bool, encoding: Option<&str>) -> String {
    if utf8_flag {
        return String::from_utf8_lossy(raw).into_owned();
    }
    let by_label = encoding.filter(|l| !l.is_empty() && *l != "auto").and_then(|l| encoding_rs::Encoding::for_label(l.as_bytes()));
    if let Some(enc) = by_label {
        return enc.decode(raw).0.into_owned();
    }
    if let Ok(text) = std::str::from_utf8(raw) {
        return text.to_string();
    }
    // Windows tools wrote the system code page. In practice here that means Korean.
    let (text, _, bad) = encoding_rs::EUC_KR.decode(raw);
    if !bad {
        return text.into_owned();
    }
    cp437(raw)
}

fn cp437(raw: &[u8]) -> String {
    const HIGH: &str = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u{a0}";
    let high: Vec<char> = HIGH.chars().collect();
    raw.iter().map(|&b| if b < 0x80 { b as char } else { high[(b - 0x80) as usize] }).collect()
}

pub struct ZipArchive {
    src: ConcatReader,
    records: Vec<Record>,
    comment: Option<String>,
}

fn le16(b: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([b[at], b[at + 1]])
}
fn le32(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}
fn le64(b: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(b[at..at + 8].try_into().unwrap())
}

impl ZipArchive {
    pub fn open(fs: &Fs, set: &VolumeSet, encoding: Option<&str>) -> Result<Self> {
        let mut src = ConcatReader::new(fs.clone(), &set.paths)?;
        let total = src.len();
        if total < 22 {
            return Err(Error::Corrupt("too short to be a ZIP".into()));
        }
        // The end record is within the last 64 KB, behind a comment of up to that size.
        let tail_len = total.min(22 + 0xFFFF) as usize;
        let tail_at = total - tail_len as u64;
        let mut tail = vec![0u8; tail_len];
        src.seek(SeekFrom::Start(tail_at))?;
        src.read_exact(&mut tail)?;
        let eocd = (0..=tail_len - 22)
            .rev()
            .find(|&i| le32(&tail, i) == SIG_EOCD && i + 22 + le16(&tail, i + 20) as usize <= tail_len)
            .ok_or_else(|| Error::Corrupt("no ZIP end record; try Repair".into()))?;
        let eocd_at = tail_at + eocd as u64;
        let comment_len = le16(&tail, eocd + 20) as usize;
        let comment = (comment_len > 0).then(|| decode_name(&tail[eocd + 22..eocd + 22 + comment_len], false, encoding));

        let mut count = le16(&tail, eocd + 10) as u64;
        let mut cd_size = le32(&tail, eocd + 12) as u64;
        let mut cd_offset = le32(&tail, eocd + 16) as u64;
        let mut cd_disk = le16(&tail, eocd + 6) as u32;
        let mut disks = le16(&tail, eocd + 4) as u32 + 1;

        // Zip64 end record, found through its locator right before the classic one.
        let mut zip64 = false;
        if eocd_at >= 20 {
            let mut loc = [0u8; 20];
            src.seek(SeekFrom::Start(eocd_at - 20))?;
            src.read_exact(&mut loc)?;
            if le32(&loc, 0) == SIG_LOC64 {
                let disk = le32(&loc, 4) as usize;
                let rel = le64(&loc, 8);
                let at = disk_pos(&src, disk, rel)?;
                let mut rec = [0u8; 56];
                src.seek(SeekFrom::Start(at))?;
                src.read_exact(&mut rec)?;
                if le32(&rec, 0) != SIG_EOCD64 {
                    return Err(Error::Corrupt("Zip64 end record not found".into()));
                }
                zip64 = true;
                disks = le32(&loc, 16).max(1);
                cd_disk = le32(&rec, 20);
                count = le64(&rec, 32);
                cd_size = le64(&rec, 40);
                cd_offset = le64(&rec, 48);
            }
        }

        // A set must have all its parts. Only spanned sets count disks, and the end record says how
        // many there were, even when the file picked looks like a lone .zip because .z01 is gone.
        if (disks > 1 || set.naming == crate::volumes::VolumeKind::ZipSpan) && (disks as usize) != set.paths.len() {
            return Err(Error::MissingVolume(format!("{} of {} parts found", set.paths.len(), disks)));
        }

        // Where the central directory really is. Self-extracting archives and sloppy tools put
        // bytes in front, which show up as a difference from the recorded offset.
        let spanned = set.paths.len() > 1 && set.naming == crate::volumes::VolumeKind::ZipSpan;
        let (cd_at, delta) = if spanned {
            (disk_pos(&src, cd_disk as usize, cd_offset)?, 0i128)
        } else {
            let eocd64_len = if zip64 { 76 } else { 0 };
            let real = eocd_at
                .checked_sub(cd_size + eocd64_len)
                .ok_or_else(|| Error::Corrupt("central directory size is wrong".into()))?;
            (real, real as i128 - cd_offset as i128)
        };

        src.seek(SeekFrom::Start(cd_at))?;
        let mut cd = vec![0u8; cd_size.min(1 << 34) as usize];
        src.read_exact(&mut cd)?;

        let mut records = Vec::with_capacity(count.min(1 << 20) as usize);
        let mut at = 0usize;
        while at + 46 <= cd.len() {
            if le32(&cd, at) != SIG_CENTRAL {
                break;
            }
            let flags = le16(&cd, at + 8);
            let method = le16(&cd, at + 10);
            let dos_time = le16(&cd, at + 12);
            let dos_date = le16(&cd, at + 14);
            let crc = le32(&cd, at + 16);
            let mut csize = le32(&cd, at + 20) as u64;
            let mut usize_ = le32(&cd, at + 24) as u64;
            let name_len = le16(&cd, at + 28) as usize;
            let extra_len = le16(&cd, at + 30) as usize;
            let comment_len = le16(&cd, at + 32) as usize;
            let mut disk = le16(&cd, at + 34) as u32;
            let host = cd[at + 5];
            let attr = le32(&cd, at + 38);
            let mut local = le32(&cd, at + 42) as u64;
            let end = at + 46 + name_len + extra_len + comment_len;
            if end > cd.len() {
                return Err(Error::Corrupt("central directory record runs past its end".into()));
            }
            let raw_name = &cd[at + 46..at + 46 + name_len];
            let extra = &cd[at + 46 + name_len..at + 46 + name_len + extra_len];

            let mut path = decode_name(raw_name, flags & FLAG_UTF8 != 0, encoding);
            let mut mtime = None;
            let mut aes = None;
            let mut inner = method;
            let mut e = 0usize;
            while e + 4 <= extra.len() {
                let id = le16(extra, e);
                let len = le16(extra, e + 2) as usize;
                if e + 4 + len > extra.len() {
                    break;
                }
                let d = &extra[e + 4..e + 4 + len];
                match id {
                    0x0001 => {
                        // Only the fields that overflowed are present, in this order.
                        let mut p = 0;
                        let next = |p: &mut usize| -> Option<u64> {
                            let v = (*p + 8 <= d.len()).then(|| le64(d, *p));
                            *p += 8;
                            v
                        };
                        if usize_ == 0xFFFF_FFFF {
                            usize_ = next(&mut p).unwrap_or(usize_);
                        }
                        if csize == 0xFFFF_FFFF {
                            csize = next(&mut p).unwrap_or(csize);
                        }
                        if local == 0xFFFF_FFFF {
                            local = next(&mut p).unwrap_or(local);
                        }
                        if disk == 0xFFFF && p + 4 <= d.len() {
                            disk = le32(d, p);
                        }
                    }
                    0x5455 if len >= 5 && d[0] & 1 != 0 => {
                        mtime = Some(le32(d, 1) as i64);
                    }
                    // Info-ZIP's Unicode path: better than guessing the code page.
                    0x7075 if len > 5 => {
                        if let Ok(s) = std::str::from_utf8(&d[5..]) {
                            path = s.to_string();
                        }
                    }
                    0x000a if mtime.is_none() && len >= 32 && le16(d, 4) == 1 => {
                        let ft = le64(d, 8);
                        if ft > 116_444_736_000_000_000 {
                            mtime = Some(((ft - 116_444_736_000_000_000) / 10_000_000) as i64);
                        }
                    }
                    0x9901 if len >= 7 => {
                        aes = Some(d[4]);
                        inner = le16(d, 5);
                    }
                    _ => {}
                }
                e += 4 + len;
            }

            let local_at = if spanned {
                disk_pos(&src, disk as usize, local)?
            } else {
                u64::try_from(local as i128 + delta).map_err(|_| Error::Corrupt("bad entry offset".into()))?
            };
            let path = path.replace('\\', "/");
            let is_dir = path.ends_with('/') || (host == 0 && attr & 0x10 != 0);
            let mode = (host == 3).then_some(attr >> 16).filter(|m| *m != 0);
            let is_link = mode.is_some_and(|m| m & 0o170000 == 0o120000);
            let encrypted = flags & FLAG_ENCRYPTED != 0;
            let shown = if aes.is_some() { inner } else { method };
            let method_text = if encrypted {
                let cipher = match aes {
                    Some(1) => "AES-128",
                    Some(2) => "AES-192",
                    Some(_) => "AES-256",
                    None => "ZipCrypto",
                };
                format!("{} {cipher}", method_name(shown))
            } else {
                method_name(shown)
            };
            records.push(Record {
                entry: Entry {
                    path: path.trim_end_matches('/').to_string(),
                    is_dir,
                    size: Some(usize_),
                    packed: Some(csize),
                    mtime: mtime.or_else(|| dos_to_unix(dos_time, dos_date)),
                    // AE-2 stores no CRC.
                    crc: (aes.is_none() && !is_dir).then_some(crc),
                    method: method_text,
                    encrypted,
                    is_link,
                    mode,
                },
                flags,
                inner_method: inner,
                aes_strength: aes,
                dos_time,
                crc,
                csize,
                usize_,
                local_at,
            });
            at = end;
        }
        if (records.len() as u64) != count {
            return Err(Error::Corrupt(format!("{} entries listed, {} found; try Repair", count, records.len())));
        }
        Ok(ZipArchive { src, records, comment })
    }

    fn reader_for(&mut self, i: usize, password: Option<&str>) -> Result<Box<dyn Read + '_>> {
        let rec = self.records[i].clone();
        if rec.flags & (FLAG_STRONG | FLAG_CENTRAL_ENC) != 0 {
            return Err(Error::Unsupported("PKWARE strong encryption".into()));
        }
        // The local header's own lengths decide where the data starts.
        let mut head = [0u8; 30];
        self.src.seek(SeekFrom::Start(rec.local_at))?;
        self.src.read_exact(&mut head)?;
        if le32(&head, 0) != SIG_LOCAL {
            return Err(Error::Corrupt(format!("{}: local header not found", rec.entry.path)));
        }
        let data_at = rec.local_at + 30 + le16(&head, 26) as u64 + le16(&head, 28) as u64;
        self.src.seek(SeekFrom::Start(data_at))?;

        let raw = (&mut self.src).take(rec.csize);
        let plain: Box<dyn Read + '_> = if rec.flags & FLAG_ENCRYPTED != 0 {
            let password = password.ok_or(Error::PasswordRequired)?;
            if let Some(strength) = rec.aes_strength {
                Box::new(AesReader::new(raw, password.as_bytes(), strength, rec.csize)?)
            } else {
                // With a data descriptor, the CRC was not known: the check byte is the time's.
                let check = if rec.flags & FLAG_DESCRIPTOR != 0 {
                    (rec.dos_time >> 8) as u8
                } else {
                    (rec.crc >> 24) as u8
                };
                Box::new(ZipCryptoReader::new(raw, password.as_bytes(), check)?)
            }
        } else {
            Box::new(raw)
        };

        let body: Box<dyn Read + '_> = match rec.inner_method {
            M_STORE => plain,
            M_DEFLATE => Box::new(flate2::read::DeflateDecoder::new(plain)),
            M_DEFLATE64 => Box::new(deflate64::Deflate64Decoder::new(io::BufReader::new(plain))),
            M_BZIP2 => Box::new(bzip2::read::BzDecoder::new(plain)),
            M_XZ => Box::new(lzma_rust2::XzReader::new(plain, true)),
            M_ZSTD => codecs::zstd_reader(plain)?,
            M_LZMA => {
                let mut plain = plain;
                let mut head = [0u8; 4];
                plain.read_exact(&mut head)?;
                let props_len = le16(&head, 2) as usize;
                if props_len < 5 {
                    return Err(Error::Corrupt(format!("{}: bad LZMA header", rec.entry.path)));
                }
                let mut props = vec![0u8; props_len];
                plain.read_exact(&mut props)?;
                let dict = le32(&props, 1);
                let size = if rec.flags & FLAG_LZMA_EOS != 0 { u64::MAX } else { rec.usize_ };
                Box::new(lzma_rust2::LzmaReader::new_with_props(plain, size, props[0], dict, None).map_err(codecs::lzma_err)?)
            }
            n => return Err(Error::Unsupported(format!("{}: {}", rec.entry.path, method_name(n)))),
        };
        Ok(body)
    }

    /// Reads one entry through to `out` and checks it.
    fn extract_one(&mut self, i: usize, password: Option<&str>, out: &mut dyn Write) -> Result<()> {
        let rec = self.records[i].clone();
        let mut r = CrcReader::new(self.reader_for(i, password)?);
        let copied = copy_all(&mut r, out);
        let (count, crc) = (r.count, r.hasher.finalize());
        match copied {
            Ok(_) => {}
            Err(e) => {
                let text = e.to_string();
                // A cancel or a full disk is not the archive's fault.
                if text.contains(crate::error::CANCEL_MARK) {
                    return Err(Error::Cancelled);
                }
                // A wrong ZipCrypto password passes its 1-byte check 1 time in 256; the bad
                // stream then fails in the codec.
                if rec.flags & FLAG_ENCRYPTED != 0 && rec.aes_strength.is_none() {
                    return Err(Error::WrongPassword);
                }
                return Err(Error::Corrupt(format!("{}: {text}", rec.entry.path)));
            }
        }
        if count != rec.usize_ {
            return Err(Error::Corrupt(format!(
                "{}: expected {} bytes, got {count}",
                rec.entry.path, rec.usize_
            )));
        }
        if rec.aes_strength.is_none() && crc != rec.crc {
            if rec.flags & FLAG_ENCRYPTED != 0 {
                return Err(Error::WrongPassword);
            }
            return Err(Error::Corrupt(format!("{}: CRC mismatch", rec.entry.path)));
        }
        Ok(())
    }
}

fn disk_pos(src: &ConcatReader, disk: usize, rel: u64) -> Result<u64> {
    let start = src
        .starts()
        .get(disk)
        .ok_or_else(|| Error::MissingVolume(format!("part {} is missing", disk + 1)))?;
    Ok(start + rel)
}

pub fn list(fs: &Fs, set: &VolumeSet, encoding: Option<&str>) -> Result<ArchiveInfo> {
    let a = ZipArchive::open(fs, set, encoding)?;
    Ok(ArchiveInfo {
        format: "zip".into(),
        encrypted: a.records.iter().any(|r| r.entry.encrypted),
        comment: a.comment.clone(),
        entries: a.records.iter().map(|r| r.entry.clone()).collect(),
        ..ArchiveInfo::default()
    })
}

pub fn visit(
    fs: &Fs,
    set: &VolumeSet,
    password: Option<&str>,
    encoding: Option<&str>,
    v: &mut dyn Visitor,
) -> Result<()> {
    let mut a = ZipArchive::open(fs, set, encoding)?;
    for i in 0..a.records.len() {
        let entry = a.records[i].entry.clone();
        let Some(mut out) = v.open(&entry)? else {
            if entry.is_dir {
                v.done(&entry)?;
            }
            continue;
        };
        match a.extract_one(i, password, &mut out) {
            Ok(()) => {
                drop(out);
                v.done(&entry)?;
            }
            // These stop everything: the same password fails again on the next entry.
            Err(e @ (Error::Cancelled | Error::PasswordRequired | Error::WrongPassword | Error::Io(_))) => {
                drop(out);
                return Err(e);
            }
            Err(e) => {
                drop(out);
                v.failed(&entry, e)?;
            }
        }
    }
    Ok(())
}

// ── Comment ───────────────────────────────────────────────────────────────────────────────────

/// Replaces the archive comment in place: it is the very last thing in the file.
pub fn set_comment(fs: &Fs, path: &str, comment: &str) -> Result<()> {
    let total = fs.size(path)?;
    let tail_len = total.min(22 + 0xFFFF) as usize;
    let tail_at = total - tail_len as u64;
    let mut tail = vec![0u8; tail_len];
    {
        let mut r = fs.open(path)?;
        r.seek(SeekFrom::Start(tail_at))?;
        r.read_exact(&mut tail)?;
    }
    let eocd = (0..=tail_len.saturating_sub(22))
        .rev()
        .find(|&i| le32(&tail, i) == SIG_EOCD && i + 22 + le16(&tail, i + 20) as usize <= tail_len)
        .ok_or_else(|| Error::Corrupt("no ZIP end record".into()))?;
    let mut text = comment.as_bytes().to_vec();
    text.truncate(0xFFFF);
    let keep = tail_at + eocd as u64 + 20;

    // Rewritten beside the original and swapped in, so a failure cannot damage it.
    let temp = format!("{path}.zmtmp");
    {
        let mut src = fs.open(path)?;
        let mut out = fs.create(&temp)?;
        let mut head = (&mut src).take(keep);
        copy_all(&mut head, &mut out)?;
        out.write_all(&(text.len() as u16).to_le_bytes())?;
        out.write_all(&text)?;
        out.flush()?;
    }
    fs.remove_file(path)?;
    fs.rename(&temp, path)
}

// ── Repair ────────────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairStats {
    pub recovered: u64,
    pub lost: u64,
    pub lost_names: Vec<String>,
}

struct Scanned {
    at: u64,
    data_at: u64,
    flags: u16,
    method: u16,
    dos_time: u16,
    dos_date: u16,
    crc: u32,
    csize: u64,
    usize_: u64,
    name: Vec<u8>,
    extra: Vec<u8>,
    /// Bytes of data descriptor following the data.
    descriptor: u64,
}

fn find_sig(src: &mut dyn ReadSeek, from: u64, total: u64, sig: &[u8]) -> Result<Option<u64>> {
    let mut at = from;
    let mut buf = vec![0u8; 1 << 20];
    while at < total {
        src.seek(SeekFrom::Start(at))?;
        let n = read_fill(src, &mut buf)?;
        if n < sig.len() {
            return Ok(None);
        }
        if let Some(i) = buf[..n].windows(sig.len()).position(|w| w == sig) {
            return Ok(Some(at + i as u64));
        }
        at += (n - sig.len() + 1) as u64;
    }
    Ok(None)
}

fn scan_entry(src: &mut dyn ReadSeek, at: u64, total: u64) -> Result<Option<Scanned>> {
    let mut head = [0u8; 30];
    src.seek(SeekFrom::Start(at))?;
    if read_fill(src, &mut head)? < 30 || le32(&head, 0) != SIG_LOCAL {
        return Ok(None);
    }
    let flags = le16(&head, 6);
    let name_len = le16(&head, 26) as usize;
    let extra_len = le16(&head, 28) as usize;
    let mut name = vec![0u8; name_len];
    let mut extra = vec![0u8; extra_len];
    if read_fill(src, &mut name)? < name_len || read_fill(src, &mut extra)? < extra_len {
        return Ok(None);
    }
    let data_at = at + 30 + name_len as u64 + extra_len as u64;
    let mut crc = le32(&head, 14);
    let mut csize = le32(&head, 18) as u64;
    let mut usize_ = le32(&head, 22) as u64;

    // Zip64 sizes.
    let mut wide = false;
    let mut e = 0;
    while e + 4 <= extra.len() {
        let id = le16(&extra, e);
        let len = le16(&extra, e + 2) as usize;
        if id == 1 && len >= 16 && e + 4 + len <= extra.len() {
            if usize_ == 0xFFFF_FFFF {
                usize_ = le64(&extra, e + 4);
            }
            if csize == 0xFFFF_FFFF {
                csize = le64(&extra, e + 12);
            }
            wide = true;
        }
        e += 4 + len;
    }

    let mut descriptor = 0;
    if flags & FLAG_DESCRIPTOR != 0 {
        // Sizes come after the data: look for a descriptor that agrees with where it was found.
        let mut from = data_at;
        loop {
            let Some(hit) = find_sig(src, from, total, &SIG_DESCRIPTOR.to_le_bytes())? else {
                return Ok(None);
            };
            let span = hit - data_at;
            let mut d = [0u8; 24];
            src.seek(SeekFrom::Start(hit))?;
            let n = read_fill(src, &mut d)?;
            if n >= 16 && le32(&d, 8) as u64 == span {
                crc = le32(&d, 4);
                csize = span;
                usize_ = le32(&d, 12) as u64;
                descriptor = 16;
                break;
            }
            if n >= 24 && le64(&d, 8) == span {
                crc = le32(&d, 4);
                csize = span;
                usize_ = le64(&d, 16);
                descriptor = 24;
                break;
            }
            from = hit + 4;
        }
    }
    let _ = wide;
    if data_at + csize + descriptor > total {
        return Ok(None);
    }
    Ok(Some(Scanned {
        at,
        data_at,
        flags,
        method: le16(&head, 8),
        dos_time: le16(&head, 10),
        dos_date: le16(&head, 12),
        crc,
        csize,
        usize_,
        name,
        extra,
        descriptor,
    }))
}

/// True when the entry's data decompresses and its checksum matches. Encrypted entries cannot be
/// checked without the password and are kept.
fn scan_ok(src: &mut dyn ReadSeek, s: &Scanned) -> Result<bool> {
    if s.flags & FLAG_ENCRYPTED != 0 {
        return Ok(true);
    }
    src.seek(SeekFrom::Start(s.data_at))?;
    let raw = (&mut *src).take(s.csize);
    let mut body: Box<dyn Read + '_> = match s.method {
        M_STORE => Box::new(raw),
        M_DEFLATE => Box::new(flate2::read::DeflateDecoder::new(raw)),
        M_DEFLATE64 => Box::new(deflate64::Deflate64Decoder::new(io::BufReader::new(raw))),
        M_BZIP2 => Box::new(bzip2::read::BzDecoder::new(raw)),
        M_XZ => Box::new(lzma_rust2::XzReader::new(raw, true)),
        M_ZSTD => match codecs::zstd_reader(raw) {
            Ok(r) => r,
            Err(_) => return Ok(false),
        },
        M_LZMA => {
            let mut raw = raw;
            let mut head = [0u8; 9];
            if raw.read_exact(&mut head).is_err() {
                return Ok(false);
            }
            let size = if s.flags & FLAG_LZMA_EOS != 0 { u64::MAX } else { s.usize_ };
            match lzma_rust2::LzmaReader::new_with_props(raw, size, head[4], le32(&head, 5), None) {
                Ok(r) => Box::new(r),
                Err(_) => return Ok(false),
            }
        }
        // A method we cannot verify: keep it rather than throw away data.
        _ => return Ok(true),
    };
    let mut r = CrcReader::new(&mut *body);
    if copy_all(&mut r, &mut io::sink()).is_err() {
        return Ok(false);
    }
    let (count, crc) = (r.count, r.hasher.finalize());
    Ok(count == s.usize_ && crc == s.crc)
}

/// Rebuilds a damaged ZIP from what can still be read: walks the local headers, keeps entries
/// whose data checks out and writes a new central directory.
pub fn repair(fs: Arc<dyn crate::vfs::Vfs>, parts: &[String], output: &str, ctx: &Ctx) -> Result<RepairStats> {
    let mut src: Box<dyn ReadSeek> = Box::new(ConcatReader::new(fs.clone(), parts)?);
    let total = src.seek(SeekFrom::End(0))?;
    let mut stats = RepairStats::default();
    let mut kept: Vec<Scanned> = Vec::new();
    let sig = SIG_LOCAL.to_le_bytes();
    let mut at = 0u64;
    while let Some(hit) = find_sig(&mut *src, at, total, &sig)? {
        ctx.check()?;
        ctx.progress.update(hit, total, output);
        match scan_entry(&mut *src, hit, total)? {
            Some(s) if scan_ok(&mut *src, &s)? => {
                at = s.data_at + s.csize + s.descriptor;
                stats.recovered += 1;
                kept.push(s);
            }
            Some(s) => {
                // The header is fine but the data is not, so the next header is still reachable.
                at = s.data_at + s.csize + s.descriptor;
                stats.lost += 1;
                stats.lost_names.push(String::from_utf8_lossy(&s.name).into_owned());
            }
            None => {
                // Cut off or overwritten: a name may still be readable.
                let mut head = [0u8; 30];
                src.seek(SeekFrom::Start(hit))?;
                if read_fill(&mut *src, &mut head)? == 30 {
                    let mut name = vec![0u8; (le16(&head, 26) as usize).min(4096)];
                    if read_fill(&mut *src, &mut name)? == name.len() && !name.is_empty() {
                        stats.lost_names.push(String::from_utf8_lossy(&name).into_owned());
                    }
                }
                stats.lost += 1;
                at = hit + 4;
            }
        }
    }
    if kept.is_empty() {
        return Err(Error::Corrupt("nothing recoverable".into()));
    }

    // Copied raw: nothing is recompressed, and encrypted entries stay encrypted.
    let mut out = SplitWriter::new_single_atomic(fs.clone(), output)?;
    let mut central = Vec::new();
    let mut count = 0u64;
    let body = (|| -> Result<(u64, u64)> {
        for s in &kept {
            let new_at = out.stream_position()?;
            src.seek(SeekFrom::Start(s.at))?;
            let mut piece = (&mut *src).take(s.data_at + s.csize + s.descriptor - s.at);
            copy_all(&mut piece, &mut out)?;
            let big = s.usize_ >= 0xFFFF_FFFF || s.csize >= 0xFFFF_FFFF || new_at >= 0xFFFF_FFFF;
            // Keep the AES and time extras; rebuild Zip64.
            let mut extra = strip_zip64(&s.extra);
            if big {
                put16(&mut extra, 1);
                put16(&mut extra, 24);
                put64(&mut extra, s.usize_);
                put64(&mut extra, s.csize);
                put64(&mut extra, new_at);
            }
            put32(&mut central, SIG_CENTRAL);
            put16(&mut central, 63);
            put16(&mut central, if big { 45 } else { 20 });
            put16(&mut central, s.flags);
            put16(&mut central, s.method);
            put16(&mut central, s.dos_time);
            put16(&mut central, s.dos_date);
            put32(&mut central, s.crc);
            put32(&mut central, if big { u32::MAX } else { s.csize as u32 });
            put32(&mut central, if big { u32::MAX } else { s.usize_ as u32 });
            put16(&mut central, s.name.len() as u16);
            put16(&mut central, extra.len() as u16);
            put16(&mut central, 0);
            put16(&mut central, 0);
            put16(&mut central, 0);
            put32(&mut central, if s.name.ends_with(b"/") { 0x10 } else { 0x20 });
            put32(&mut central, if big { u32::MAX } else { new_at as u32 });
            central.extend_from_slice(&s.name);
            central.extend_from_slice(&extra);
            count += 1;
        }
        let cd_at = out.stream_position()?;
        out.write_all(&central)?;
        Ok((cd_at, central.len() as u64))
    })();
    let (cd_at, cd_size) = match body {
        Ok(v) => v,
        Err(e) => {
            out.abort();
            return Err(e);
        }
    };
    let mut end = Vec::new();
    if count >= 0xFFFF || cd_at >= 0xFFFF_FFFF || cd_size >= 0xFFFF_FFFF {
        let at64 = cd_at + cd_size;
        put32(&mut end, SIG_EOCD64);
        put64(&mut end, 44);
        put16(&mut end, 45);
        put16(&mut end, 45);
        put32(&mut end, 0);
        put32(&mut end, 0);
        put64(&mut end, count);
        put64(&mut end, count);
        put64(&mut end, cd_size);
        put64(&mut end, cd_at);
        put32(&mut end, SIG_LOC64);
        put32(&mut end, 0);
        put64(&mut end, at64);
        put32(&mut end, 1);
    }
    put32(&mut end, SIG_EOCD);
    put16(&mut end, 0);
    put16(&mut end, 0);
    put16(&mut end, count.min(0xFFFF) as u16);
    put16(&mut end, count.min(0xFFFF) as u16);
    put32(&mut end, cd_size.min(0xFFFF_FFFF) as u32);
    put32(&mut end, cd_at.min(0xFFFF_FFFF) as u32);
    put16(&mut end, 0);
    out.write_all(&end)?;
    out.finish()?;
    Ok(stats)
}

fn strip_zip64(extra: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(extra.len());
    let mut e = 0;
    while e + 4 <= extra.len() {
        let len = le16(extra, e + 2) as usize;
        if e + 4 + len > extra.len() {
            break;
        }
        if le16(extra, e) != 1 {
            out.extend_from_slice(&extra[e..e + 4 + len]);
        }
        e += 4 + len;
    }
    out
}
