//! RAR: every generation from 1.3 to 7 reads; RAR 4 and RAR 5 write, with volumes, recovery
//! records and encryption. All through the rars crate.

use std::io::{self, Read, Write};
use std::sync::Arc;

use rars::rar50::VolumeSink;
use rars::{ArchiveReadOptions, ArchiveVersion, Builder, EntrySource, ReadCancellation, WriteProgress, WriteProgressEvent, WriterResources};

use crate::error::{Error, Result};
use crate::model::*;
use crate::vfs::{Fs, ReadSeek};
use crate::volumes::{rar_part_name, ConcatReader, VolumeSet};

fn map_err(e: rars::Error) -> Error {
    use rars::ErrorKind as K;
    let text = e.to_string();
    if text.contains(crate::error::CANCEL_MARK) {
        return Error::Cancelled;
    }
    match e.kind() {
        K::PasswordRequired => Error::PasswordRequired,
        K::BadPassword => Error::WrongPassword,
        K::Cancelled => Error::Cancelled,
        K::UnsupportedFormat | K::UnsupportedFeature => Error::Unsupported(text),
        K::Io => Error::Io(text),
        K::InvalidArgument | K::ResourceLimit => Error::Invalid(text),
        _ => Error::Corrupt(text),
    }
}

fn decode(raw: &[u8], unicode: bool, encoding: Option<&str>) -> String {
    crate::formats::zip::decode_name(raw, unicode, encoding).replace('\\', "/")
}

fn method_label(stored: bool, encrypted: bool) -> String {
    let base = if stored { "Store" } else { "RAR" };
    if encrypted {
        format!("{base} AES")
    } else {
        base.to_string()
    }
}

fn read_all(fs: &Fs, set: &VolumeSet, opts: ArchiveReadOptions<'_>) -> Result<Vec<rars::Archive>> {
    let mut out = Vec::new();
    for path in &set.paths {
        let reader: Box<dyn ReadSeek> = fs.open(path)?;
        let archive = rars::ArchiveReader::read_reader_with_options(reader, opts.clone()).map_err(map_err)?;
        out.push(archive);
    }
    Ok(out)
}

fn read_options<'a>(password: Option<&'a str>, cancel: Option<&'a ReadCancellation>) -> ArchiveReadOptions<'a> {
    let mut opts = match password {
        Some(p) => ArchiveReadOptions::with_password(p.as_bytes()),
        None => ArchiveReadOptions::new(),
    };
    opts.cancellation = cancel;
    opts
}

fn entry_from_member(m: &rars::ArchiveMember, encoding: Option<&str>) -> Entry {
    let meta = &m.meta;
    let mtime = meta
        .modification_time()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64);
    let mode = match meta.attr_source() {
        rars::AttrSource::Unix => Some(meta.file_attr as u32),
        _ => None,
    };
    let crc = match &m.detail {
        rars::ArchiveMemberDetail::Rar50Plus { .. } => None,
        _ => None::<u32>,
    };
    Entry {
        path: decode(&meta.name, m.name_is_unicode(), encoding).trim_end_matches('/').to_string(),
        is_dir: meta.is_directory,
        size: Some(meta.unpacked_size),
        packed: Some(meta.packed_size),
        mtime,
        crc,
        method: method_label(meta.is_stored, meta.is_encrypted),
        encrypted: meta.is_encrypted,
        is_link: meta.is_redirection,
        mode,
    }
}

pub fn list(fs: &Fs, set: &VolumeSet, password: Option<&str>, encoding: Option<&str>) -> Result<ArchiveInfo> {
    let archives = read_all(fs, set, read_options(password, None))?;
    let members = rars::volume_members(&archives).map_err(map_err)?;
    let entries: Vec<Entry> = members.iter().map(|m| entry_from_member(m, encoding)).collect();

    // A last part still expecting a next one means the set is short.
    if let Some(m) = members.last() {
        if m.meta.is_split_after {
            return Err(Error::MissingVolume(format!("part {} is missing", set.paths.len() + 1)));
        }
    }

    let first = &archives[0];
    let comment = first
        .comment(password.map(str::as_bytes))
        .ok()
        .flatten()
        .map(|b| decode(&b, true, encoding));
    let (header_encrypted, has_recovery, solid) = match first.as_rar50() {
        Some(a) => (a.main.encrypted_headers, a.main.has_recovery_record(), a.main.is_solid()),
        None => (false, false, members.iter().any(|m| m.is_solid())),
    };
    Ok(ArchiveInfo {
        format: "rar".into(),
        encrypted: entries.iter().any(|e| e.encrypted) || header_encrypted,
        header_encrypted,
        has_recovery,
        solid,
        comment,
        entries,
        ..ArchiveInfo::default()
    })
}

pub fn visit(
    ctx: &Ctx,
    set: &VolumeSet,
    password: Option<&str>,
    encoding: Option<&str>,
    v: &mut dyn Visitor,
) -> Result<()> {
    let cancel = ReadCancellation::new();
    let archives = read_all(&ctx.fs, set, read_options(password, None))?;

    // Metadata the extraction callback does not carry.
    let members = rars::volume_members(&archives).map_err(map_err)?;
    if let Some(m) = members.last() {
        if m.meta.is_split_after {
            return Err(Error::MissingVolume(format!("part {} is missing", set.paths.len() + 1)));
        }
    }
    let known: std::collections::HashMap<Vec<u8>, Entry> =
        members.iter().map(|m| (m.meta.name.clone(), entry_from_member(m, encoding))).collect();

    let mut pending: Option<Entry> = None;
    let mut failure: Option<Error> = None;
    let opts = read_options(password, Some(&cancel));
    let result = rars::extract_volumes_to_with_options(&archives, opts, |meta| -> rars::Result<Box<dyn Write>> {
        // The previous entry's data was verified before the library moved on.
        if let Some(previous) = pending.take() {
            if let Err(e) = v.done(&previous) {
                failure = Some(e);
                return Err(rars::Error::Cancelled);
            }
        }
        let entry = known.get(meta.name_bytes()).cloned().unwrap_or_else(|| Entry {
            path: decode(meta.name_bytes(), meta.name_is_unicode, encoding).trim_end_matches('/').to_string(),
            is_dir: meta.is_directory,
            ..Entry::default()
        });
        match v.open(&entry) {
            Ok(Some(out)) => {
                pending = Some(entry);
                Ok(out)
            }
            Ok(None) => {
                if entry.is_dir {
                    pending = Some(entry);
                }
                Ok(Box::new(io::sink()))
            }
            Err(e) => {
                failure = Some(e);
                Err(rars::Error::Cancelled)
            }
        }
    });
    if let Some(e) = failure {
        return Err(e);
    }
    match result {
        Ok(()) => {
            if let Some(last) = pending.take() {
                v.done(&last)?;
            }
            Ok(())
        }
        Err(e) => {
            let mapped = map_err(e);
            // RAR cannot always tell a wrong password from damage. With a password in play and
            // an encrypted entry failing its check, the password is the likely culprit.
            if let (Error::Corrupt(text), Some(entry), true) = (&mapped, pending.as_ref(), password.is_some()) {
                if entry.encrypted && (text.contains("password") || text.to_lowercase().contains("crc")) {
                    return Err(Error::WrongPassword);
                }
            }
            Err(ctx.after::<()>(Err(mapped)).unwrap_err())
        }
    }
}

#[derive(Debug, Clone)]
pub struct RarOptions {
    pub version: String,
    pub level: u32,
    pub password: Option<String>,
    pub encrypt_names: bool,
    pub solid: bool,
    pub comment: Option<String>,
    pub recovery_percent: Option<u64>,
    pub volume_size: Option<u64>,
}

struct Reporter {
    tally: Tally,
}

impl WriteProgress for Reporter {
    fn report(&self, event: WriteProgressEvent<'_>) {
        if let WriteProgressEvent::Advanced { operation: rars::WriteOperation::Compression, completed_bytes, .. } = event {
            let total = self.tally.total;
            self.tally.progress.update(completed_bytes.min(total), total, "");
        }
    }
    fn is_cancelled(&self) -> bool {
        self.tally.progress.cancelled()
    }
}

struct FsVolumes {
    fs: Fs,
    output: String,
    width: usize,
    names: Arc<std::sync::Mutex<Vec<String>>>,
}

/// `Write` needs `Send` here, which a boxed handle has.
struct Handle(Box<dyn crate::vfs::WriteSeek>);

impl Write for Handle {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

impl VolumeSink for FsVolumes {
    fn start_volume(&mut self, index: u64) -> rars::Result<Box<dyn Write + Send>> {
        let path = rar_part_name(&self.output, index as usize, self.width);
        let handle = self.fs.create(&path).map_err(|e| rars::Error::from(io::Error::other(e)))?;
        self.names.lock().unwrap().push(path);
        Ok(Box::new(Handle(handle)))
    }
}

/// The compressor reads each source twice in some modes, so sources are reopened on demand.
struct SourceOpen {
    fs: Fs,
    path: String,
    tally: Tally,
}

fn rar_level(level: u32) -> u8 {
    match level {
        0 | 1 => 1,
        2 | 3 => 2,
        4 | 5 => 3,
        6 | 7 => 4,
        _ => 5,
    }
}

fn to_u32_time(t: Option<i64>) -> Option<u32> {
    t.map(|v| v.clamp(0, u32::MAX as i64) as u32)
}

pub fn create(ctx: &Ctx, output: &str, opts: &RarOptions, items: &[InputItem], tally: &Tally) -> Result<Vec<String>> {
    let version = match opts.version.as_str() {
        "rar4" | "rar29" => ArchiveVersion::Rar29,
        "rar7" => ArchiveVersion::Rar70,
        _ => ArchiveVersion::Rar50,
    };
    let legacy = version == ArchiveVersion::Rar29;
    if legacy && opts.volume_size.is_some() && items.iter().any(|i| i.is_dir && !has_children(items, i)) {
        return Err(Error::Invalid("RAR 4 volumes cannot hold empty folders".into()));
    }

    if legacy && opts.volume_size.is_some() && items.iter().any(|i| !i.name.is_ascii()) {
        return Err(Error::Invalid("rar4_volume_names".into()));
    }

    let mut b = Builder::new(version)
        .store(opts.level == 0)
        .compression_level(if opts.level == 0 { None } else { Some(rar_level(opts.level)) })
        .solid(opts.solid)
        .password(opts.password.as_ref().map(|p| p.clone().into_bytes()))
        .header_encryption(opts.encrypt_names && opts.password.is_some())
        .allow_duplicate_names(false);
    if let Some(c) = opts.comment.as_ref().filter(|c| !c.is_empty()) {
        if opts.volume_size.is_some() {
            return Err(Error::Invalid("RAR volumes cannot carry an archive comment".into()));
        }
        b = b.comment(Some(c.clone().into_bytes()));
    }
    if let Some(p) = opts.recovery_percent.filter(|p| *p > 0) {
        if legacy {
            return Err(Error::Invalid("recovery records need RAR 5".into()));
        }
        b = b.recovery_percent(Some(p));
    }

    for item in items {
        let name = item.name.clone().into_bytes();
        if item.is_dir {
            if legacy && opts.volume_size.is_some() {
                continue;
            }
            let wide = legacy && !name.is_ascii();
            b.add_directory(name.clone(), to_u32_time(item.mtime), item.mode).map_err(map_err)?;
            if wide {
                b.set_legacy_unicode_name(&name, name.clone()).map_err(map_err)?;
            }
        } else {
            let src = Arc::new(SourceOpen { fs: ctx.fs.clone(), path: item.source.clone(), tally: tally.clone() });
            let source = EntrySource::from_opener(item.size, move || {
                let _ = &src.tally;
                let reader = src.fs.open(&src.path).map_err(|e| rars::Error::from(io::Error::other(e)))?;
                Ok(Box::new(reader) as Box<dyn rars::EntryReader>)
            });
            let wide = legacy && !name.is_ascii();
            b.add_source(name.clone(), source, to_u32_time(item.mtime), item.mode).map_err(map_err)?;
            if wide {
                // RAR 4 keeps names in a code page unless told they are Unicode.
                b.set_legacy_unicode_name(&name, name.clone()).map_err(map_err)?;
            }
        }
    }

    let reporter = Reporter { tally: tally.clone() };
    let resources = WriterResources::default();
    if let Some(size) = opts.volume_size {
        let total: u64 = items.iter().map(|i| i.size).sum();
        // Enough digits for the worst case, so the names sort properly.
        let width = ((total / size.max(1)) + 2).to_string().len();

        // The library's limit counts file data only. The user's limit is the size of the file on
        // disk, so room is left for headers; if a part still comes out too big, try with less data.
        let room = header_room(items, size);
        if room >= size {
            return Err(Error::Invalid("volume size is too small for this many files".into()));
        }
        let percent = opts.recovery_percent.unwrap_or(0);
        let mut payload = (size - room) * 100 / (100 + percent);
        let mut b = b;
        for _ in 0..8 {
            if payload == 0 {
                break;
            }
            b = b.volume_size(Some(payload as usize));
            let names = write_volume_set(ctx, &b, output, width, legacy, &resources, &reporter)?;
            let mut biggest = 0;
            for n in &names {
                biggest = biggest.max(ctx.fs.size(n)?);
            }
            if biggest <= size {
                return Ok(names);
            }
            for n in &names {
                let _ = ctx.fs.remove_file(n);
            }
            // Overhead grows with the data (recovery shards), so scale by what was measured.
            let scaled = (payload as f64 * (size as f64 / biggest as f64)) as u64;
            payload = scaled.saturating_sub(64);
        }
        return Err(Error::Invalid("volume size is too small for this many files".into()));
    }

    let temp = format!("{output}.zmtmp");
    {
        let mut f = Handle(ctx.fs.create(&temp)?);
        b.write_to(&mut f, &resources, Some(&reporter)).map_err(map_err)?;
        f.flush()?;
    }
    if ctx.fs.exists(output) {
        ctx.fs.remove_file(output)?;
    }
    ctx.fs.rename(&temp, output)?;
    Ok(vec![output.to_string()])
}

/// Headers one part may have to carry: the fixed ones, plus those of as many entries as fit.
fn header_room(items: &[InputItem], size: u64) -> u64 {
    const FIXED: u64 = 256;
    const PER_ENTRY: u64 = 96;
    let mut worst = 0u64;
    let mut used = 0u64;
    let mut headers = 0u64;
    let mut start = 0;
    for (i, item) in items.iter().enumerate() {
        used += item.size;
        headers += PER_ENTRY + item.name.len() as u64;
        while used > size && start < i {
            used -= items[start].size;
            headers -= PER_ENTRY + items[start].name.len() as u64;
            start += 1;
        }
        worst = worst.max(headers);
    }
    FIXED + worst
}

fn write_volume_set(
    ctx: &Ctx,
    b: &Builder,
    output: &str,
    width: usize,
    legacy: bool,
    resources: &WriterResources,
    reporter: &Reporter,
) -> Result<Vec<String>> {
    if legacy {
        let volumes = b.build_volumes(Some(reporter)).map_err(map_err)?;
        let mut names = Vec::with_capacity(volumes.len());
        for (i, data) in volumes.iter().enumerate() {
            let path = rar_part_name(output, i, width);
            let mut f = ctx.fs.create(&path)?;
            f.write_all(data)?;
            f.flush()?;
            names.push(path);
        }
        return Ok(names);
    }
    let names = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut sink = FsVolumes { fs: ctx.fs.clone(), output: output.to_string(), width, names: names.clone() };
    b.write_volumes_to(&mut sink, resources, Some(reporter)).map_err(map_err)?;
    let out = names.lock().unwrap().clone();
    Ok(out)
}

fn has_children(items: &[InputItem], dir: &InputItem) -> bool {
    let prefix = format!("{}/", dir.name.trim_end_matches('/'));
    items.iter().any(|i| i.name.starts_with(&prefix))
}

/// Repairs with the recovery record the archive carries, if it has one.
pub fn repair(fs: &Fs, parts: &[String], output: &str) -> Result<(bool, bool)> {
    let mut data = Vec::new();
    ConcatReader::new(fs.clone(), parts)?.read_to_end(&mut data)?;
    let archive = rars::ArchiveReader::read_owned(data).map_err(map_err)?;
    let result = archive.repair_recovery_with_report(None).map_err(map_err)?;
    let mut f = fs.create(output)?;
    f.write_all(&result.data)?;
    f.flush()?;
    Ok((result.report.changed, result.report.data_repaired))
}
