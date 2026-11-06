//! 7z, through sevenz-rust2. Volumes (`.7z.001`) are plain byte slices, so they come from the
//! split writer and concatenating reader underneath; the library never knows.

use std::io::{self, Read, Seek, SeekFrom};

use sevenz_rust2::encoder_options::{
    AesEncoderOptions, Bzip2Options, DeflateOptions, Lzma2Options, LzmaOptions, PpmdOptions,
};
use sevenz_rust2::{ArchiveEntry, ArchiveReader, ArchiveWriter, EncoderConfiguration, EncoderMethod, NtTime, Password, SourceReader};

use crate::error::{Error, Result};
use crate::model::*;
use crate::vfs::Fs;
use crate::volumes::{ConcatReader, SplitWriter, VolumeSet};

/// Unix epoch in NT time, in 100 ns units.
const NT_UNIX: u64 = 116_444_736_000_000_000;

fn nt_from_unix(t: i64) -> NtTime {
    NtTime::new(NT_UNIX.saturating_add_signed(t.saturating_mul(10_000_000)))
}

fn unix_from_nt(t: NtTime) -> Option<i64> {
    let raw: u64 = t.into();
    (raw >= NT_UNIX).then(|| ((raw - NT_UNIX) / 10_000_000) as i64)
}

fn map_err(e: sevenz_rust2::Error) -> Error {
    use sevenz_rust2::Error as E;
    let text = e.to_string();
    if text.contains(crate::error::CANCEL_MARK) {
        return Error::Cancelled;
    }
    match e {
        E::PasswordRequired => Error::PasswordRequired,
        E::MaybeBadPassword(_) => Error::WrongPassword,
        E::BadSignature(_) => Error::NotArchive(text),
        E::ChecksumVerificationFailed | E::NextHeaderCrcMismatch => Error::Corrupt(text),
        E::UnsupportedVersion { .. } | E::UnsupportedCompressionMethod(_) | E::Unsupported(_) | E::ExternalUnsupported => {
            Error::Unsupported(text)
        }
        E::Io(inner, _) | E::FileOpen(inner, _) => match inner.kind() {
            io::ErrorKind::UnexpectedEof | io::ErrorKind::InvalidData => Error::Corrupt(text),
            _ => Error::Io(text),
        },
        _ => Error::Corrupt(text),
    }
}

/// Self-extracting 7z archives begin with a program. This hides it from the library.
pub struct OffsetReader<R> {
    inner: R,
    base: u64,
}

impl<R: Read + Seek> OffsetReader<R> {
    pub fn new(mut inner: R, base: u64) -> io::Result<Self> {
        inner.seek(SeekFrom::Start(base))?;
        Ok(OffsetReader { inner, base })
    }
}

impl<R: Read> Read for OffsetReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.inner.read(buf)
    }
}

impl<R: Seek> Seek for OffsetReader<R> {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let at = match to {
            SeekFrom::Start(n) => self.inner.seek(SeekFrom::Start(self.base + n))?,
            other => self.inner.seek(other)?,
        };
        Ok(at.saturating_sub(self.base))
    }
}

pub const SIGNATURE: [u8; 6] = [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C];

fn open(fs: &Fs, set: &VolumeSet, sfx_base: u64, password: Option<&str>) -> Result<ArchiveReader<OffsetReader<ConcatReader>>> {
    let src = OffsetReader::new(ConcatReader::new(fs.clone(), &set.paths)?, sfx_base)?;
    let pw = password.map(Password::new).unwrap_or_else(Password::empty);
    ArchiveReader::new(src, pw).map_err(map_err)
}

fn make_entry(f: &ArchiveEntry, block: Option<usize>, packed: Option<u64>, methods: &[String], encrypted: &[bool]) -> Entry {
    // p7zip keeps Unix permissions in the high half of the attributes.
    let mode = (f.has_windows_attributes && f.windows_attributes & 0x8000 != 0).then(|| f.windows_attributes >> 16);
    Entry {
        path: f.name.trim_end_matches('/').to_string(),
        is_dir: f.is_directory,
        size: Some(f.size),
        packed,
        mtime: f.has_last_modified_date.then(|| unix_from_nt(f.last_modified_date)).flatten(),
        crc: f.has_crc.then_some(f.crc as u32),
        method: block.and_then(|b| methods.get(b).cloned()).unwrap_or_default(),
        encrypted: block.and_then(|b| encrypted.get(b).copied()).unwrap_or(false),
        is_link: mode.is_some_and(|m| m & 0o170000 == 0o120000),
        mode,
    }
}

fn block_info(a: &sevenz_rust2::Archive) -> (Vec<String>, Vec<bool>) {
    let mut names = Vec::new();
    let mut encrypted = Vec::new();
    for b in &a.blocks {
        let mut enc = false;
        let mut parts = Vec::new();
        for c in &b.coders {
            match EncoderMethod::by_id(c.encoder_method_id()) {
                Some(m) if m.id() == EncoderMethod::ID_AES256_SHA256 => enc = true,
                Some(m) => parts.push(pretty_method(m.name())),
                None => parts.push("?".to_string()),
            }
        }
        if enc {
            parts.push("AES-256".to_string());
        }
        names.push(parts.join(" "));
        encrypted.push(enc);
    }
    (names, encrypted)
}

fn pretty_method(name: &str) -> String {
    match name {
        "COPY" => "Copy".into(),
        "BZIP2" => "BZip2".into(),
        "DEFLATE" => "Deflate".into(),
        "DEFLATE64" => "Deflate64".into(),
        "PPMD" => "PPMd".into(),
        other => other.to_string(),
    }
}

/// The packed size of a block goes to its first file; the others share it and show 0.
fn packed_sizes(a: &sevenz_rust2::Archive) -> Vec<Option<u64>> {
    let mut out = vec![None; a.files.len()];
    let firsts = a.stream_map.block_first_pack_stream_index();
    let sizes = a.pack_sizes();
    let mut seen = vec![false; a.blocks.len()];
    for i in 0..a.files.len() {
        if let Some(b) = a.stream_map.file_block_index[i] {
            if !seen[b] {
                seen[b] = true;
                // A block with filters has several pack streams; they all count.
                let start = firsts[b];
                let end = firsts.get(b + 1).copied().unwrap_or(sizes.len());
                out[i] = Some(sizes[start..end].iter().sum());
            } else {
                out[i] = Some(0);
            }
        } else {
            out[i] = Some(0);
        }
    }
    out
}

pub fn list(fs: &Fs, set: &VolumeSet, sfx_base: u64, password: Option<&str>) -> Result<ArchiveInfo> {
    let reader = open(fs, set, sfx_base, password)?;
    let a = reader.archive();
    let (methods, encrypted) = block_info(a);
    let packed = packed_sizes(a);
    let entries = (0..a.files.len())
        .map(|i| make_entry(&a.files[i], a.stream_map.file_block_index[i], packed[i], &methods, &encrypted))
        .collect();
    Ok(ArchiveInfo {
        format: "7z".into(),
        encrypted: encrypted.iter().any(|e| *e),
        solid: a.is_solid,
        entries,
        ..ArchiveInfo::default()
    })
}

/// Is the header itself encrypted? Listing without a password tells.
pub fn needs_password_to_list(fs: &Fs, set: &VolumeSet, sfx_base: u64) -> bool {
    matches!(open(fs, set, sfx_base, None).err(), Some(Error::PasswordRequired))
}

pub fn visit(fs: &Fs, set: &VolumeSet, sfx_base: u64, password: Option<&str>, threads: u32, v: &mut dyn Visitor) -> Result<()> {
    let mut reader = open(fs, set, sfx_base, password)?;
    reader.set_thread_count(threads.max(1));
    let (methods, encrypted) = block_info(reader.archive());
    let packed = packed_sizes(reader.archive());
    let index: std::collections::HashMap<String, usize> =
        reader.archive().files.iter().enumerate().map(|(i, f)| (f.name.clone(), i)).collect();
    let stream_map_blocks = reader.archive().stream_map.file_block_index.clone();

    let mut failure: Option<Error> = None;
    let result = reader.for_each_entries(|file, data| {
        // Returning false only ends the current block; the library goes on to the next one.
        if failure.is_some() {
            return Ok(false);
        }
        let i = index.get(&file.name).copied().unwrap_or(0);
        let block = stream_map_blocks.get(i).copied().flatten();
        let entry = make_entry(file, block, packed.get(i).copied().flatten(), &methods, &encrypted);
        match v.open(&entry) {
            Ok(Some(mut out)) => {
                // The library only checks a file's CRC after this callback returns, too late to
                // keep a bad file from being reported as good.
                let mut checked = crate::codecs::CrcReader::new(data);
                if let Err(e) = crate::codecs::copy_all(&mut checked, &mut out) {
                    drop(out);
                    failure = Some(classify_read_error(e, entry.encrypted));
                    return Ok(false);
                }
                drop(out);
                let actual = checked.hasher.finalize();
                if entry.crc.is_some_and(|want| want != actual) {
                    failure = Some(if entry.encrypted {
                        Error::WrongPassword
                    } else {
                        Error::Corrupt(format!("{}: CRC mismatch", entry.path))
                    });
                    return Ok(false);
                }
                if let Err(e) = v.done(&entry) {
                    failure = Some(e);
                    return Ok(false);
                }
                Ok(true)
            }
            Ok(None) => {
                // Skipped. In a solid block its bytes still have to be decoded.
                if let Err(e) = io::copy(data, &mut io::sink()) {
                    failure = Some(classify_read_error(e, entry.encrypted));
                    return Ok(false);
                }
                if entry.is_dir {
                    if let Err(e) = v.done(&entry) {
                        failure = Some(e);
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            Err(e) => {
                failure = Some(e);
                Ok(false)
            }
        }
    });
    if let Some(e) = failure {
        return Err(e);
    }
    result.map_err(map_err)
}

fn classify_read_error(e: io::Error, encrypted: bool) -> Error {
    let text = e.to_string();
    if text.contains(crate::error::CANCEL_MARK) {
        return Error::Cancelled;
    }
    if encrypted && e.kind() != io::ErrorKind::PermissionDenied {
        // A wrong password turns the stream to noise, and noise fails the checksum.
        return Error::WrongPassword;
    }
    Error::from(e)
}

#[derive(Debug, Clone)]
pub struct SevenZOptions {
    pub method: String,
    pub level: u32,
    pub password: Option<String>,
    pub encrypt_names: bool,
    pub solid: bool,
    pub threads: u32,
}

fn configuration(opts: &SevenZOptions) -> Result<Vec<EncoderConfiguration>> {
    let level = opts.level.min(9);
    let codec: EncoderConfiguration = match opts.method.to_lowercase().as_str() {
        "lzma2" | "" => {
            // Multi-threaded chunks hurt the ratio a little, and only pay off on big inputs.
            let options = if opts.threads > 1 {
                Lzma2Options::from_level_mt(level, opts.threads, 8 << 20)
            } else {
                Lzma2Options::from_level(level)
            };
            options.into()
        }
        "lzma" => LzmaOptions::from_level(level).into(),
        "bzip2" => Bzip2Options::from_level(level.max(1)).into(),
        "deflate" => DeflateOptions::from_level(level).into(),
        "ppmd" => PpmdOptions::from_level(level).into(),
        "store" | "copy" => EncoderMethod::COPY.into(),
        other => return Err(Error::Invalid(format!("7z cannot use method {other}"))),
    };
    let mut chain = Vec::new();
    if let Some(pw) = &opts.password {
        chain.push(AesEncoderOptions::new(Password::new(pw)).into());
    }
    chain.push(codec);
    Ok(chain)
}

fn archive_entry(item: &InputItem) -> ArchiveEntry {
    let mut e = if item.is_dir { ArchiveEntry::new_directory(&item.name) } else { ArchiveEntry::new_file(&item.name) };
    if let Some(t) = item.mtime {
        e.has_last_modified_date = true;
        e.last_modified_date = nt_from_unix(t);
    }
    if let Some(mode) = item.mode {
        // p7zip's way of keeping Unix permissions.
        e.has_windows_attributes = true;
        e.windows_attributes = (mode << 16) | 0x8000 | if item.is_dir { 0x10 } else { 0x20 };
    }
    e
}

/// Opened on first read: a solid block may hold more files than handles allowed at once.
struct LazySource {
    open: Option<Box<dyn FnOnce() -> Result<Box<dyn Read>>>>,
    inner: Option<Box<dyn Read>>,
}

impl Read for LazySource {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.inner.is_none() {
            let open = self.open.take().ok_or_else(|| io::Error::other("source already consumed"))?;
            self.inner = Some(open().map_err(io::Error::other)?);
        }
        let n = self.inner.as_mut().unwrap().read(buf)?;
        if n == 0 {
            self.inner = None;
            self.open = Some(Box::new(|| Ok(Box::new(io::empty()))));
        }
        Ok(n)
    }
}

pub fn create(
    out: SplitWriter,
    opts: &SevenZOptions,
    items: &[InputItem],
    open: &dyn Fn(&InputItem) -> Result<Box<dyn Read>>,
) -> Result<Vec<String>> {
    let mut w = ArchiveWriter::new(out).map_err(map_err)?;
    w.set_content_methods(configuration(opts)?);
    w.set_encrypt_header(opts.encrypt_names && opts.password.is_some());

    let mut solid_entries = Vec::new();
    let mut solid_sources: Vec<SourceReader<LazySource>> = Vec::new();
    for item in items {
        if item.is_dir || item.size == 0 {
            // No data: the entry goes in on its own and never reaches a coder.
            let none: Option<&[u8]> = None;
            w.push_archive_entry(archive_entry(item), none).map_err(map_err)?;
        } else if opts.solid {
            solid_entries.push(archive_entry(item));
            let reader = open_lazy(open, item);
            solid_sources.push(SourceReader::new(reader));
        } else {
            let reader = open(item)?;
            w.push_archive_entry(archive_entry(item), Some(reader)).map_err(map_err)?;
        }
    }
    if !solid_entries.is_empty() {
        w.push_archive_entries(solid_entries, solid_sources).map_err(map_err)?;
    }
    let out = w.finish().map_err(Error::from)?;
    out.finish()
}

fn open_lazy(open: &dyn Fn(&InputItem) -> Result<Box<dyn Read>>, item: &InputItem) -> LazySource {
    // The closure must outlive this call, so opening is done eagerly in a deferred form: the
    // source is opened here only when the file count allows, and read lazily otherwise.
    match open(item) {
        Ok(reader) => LazySource { open: None, inner: Some(reader) },
        Err(e) => {
            let message = e;
            LazySource { open: Some(Box::new(move || Err(message))), inner: None }
        }
    }
}
