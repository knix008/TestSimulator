//! Split archives: a writer that spills into numbered files at an exact size, a reader that sees
//! a set of files as one stream, and the naming rules of every split format.

use std::io::{self, Read, Seek, SeekFrom, Write};

use crate::error::{Error, Result};
use crate::vfs::{Fs, ReadSeek, WriteSeek};

/// How the parts of a set are named.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Naming {
    /// One file, with no splitting.
    Single,
    /// `x.7z.001`, `x.7z.002`, ...: plain byte slices, as 7-Zip makes them.
    Numbered,
    /// `x.z01`, `x.z02`, ..., and the last is `x.zip`: WinZip's split ZIP.
    ZipSpan,
}

/// The file name of a part (0-based) of a set still being written.
pub fn part_name(output: &str, naming: &Naming, index: usize) -> String {
    match naming {
        Naming::Single => output.to_string(),
        Naming::Numbered => format!("{output}.{:03}", index + 1),
        Naming::ZipSpan => format!("{}.z{:02}", strip_ext(output), index + 1),
    }
}

fn strip_ext(path: &str) -> &str {
    match path.rfind('.') {
        Some(i) if !path[i..].contains(['/', '\\']) => &path[..i],
        _ => path,
    }
}

/// A `Write + Seek` over a set of files. Earlier parts stay patchable, because ZIP and 7z go back
/// to fill in sizes once they know them.
pub struct SplitWriter {
    fs: Fs,
    output: String,
    naming: Naming,
    limit: u64,
    /// (path, length) of each part so far.
    parts: Vec<(String, u64)>,
    /// The part the handle is on, and the handle.
    open_index: usize,
    open: Option<Box<dyn WriteSeek>>,
    /// Logical position across the set.
    pos: u64,
    /// Where the temporary single file ends up.
    single_target: Option<String>,
    /// Stops writing once the user has cancelled.
    progress: Option<std::sync::Arc<dyn crate::model::Progress>>,
}

impl SplitWriter {
    pub fn new(fs: Fs, output: &str, naming: Naming, limit: Option<u64>) -> Result<Self> {
        let limit = limit.unwrap_or(u64::MAX);
        if limit == 0 {
            return Err(Error::Invalid("volume size must be above zero".into()));
        }
        let mut writer = SplitWriter {
            fs,
            output: output.to_string(),
            naming,
            limit,
            parts: Vec::new(),
            open_index: 0,
            open: None,
            pos: 0,
            single_target: None,
            progress: None,
        };
        writer.start_part()?;
        Ok(writer)
    }

    /// A single output written beside its target and renamed on finish, so a failure or a cancel
    /// leaves whatever was there before untouched.
    pub fn new_single_atomic(fs: Fs, output: &str) -> Result<Self> {
        let temp = format!("{output}.zmtmp");
        let mut writer = Self::new(fs, &temp, Naming::Single, None)?;
        writer.single_target = Some(output.to_string());
        Ok(writer)
    }

    pub fn cancel_with(mut self, progress: std::sync::Arc<dyn crate::model::Progress>) -> Self {
        self.progress = Some(progress);
        self
    }

    fn start_part(&mut self) -> Result<()> {
        let path = part_name(&self.output, &self.naming, self.parts.len());
        let handle = self.fs.create(&path)?;
        self.parts.push((path, 0));
        self.open_index = self.parts.len() - 1;
        self.open = Some(handle);
        Ok(())
    }

    fn part_start(&self, index: usize) -> u64 {
        self.parts[..index].iter().map(|(_, len)| *len).sum()
    }

    /// The part the current position is in, and the offset inside it.
    pub fn location(&self) -> (usize, u64) {
        let mut start = 0;
        for (i, (_, len)) in self.parts.iter().enumerate() {
            if self.pos < start + len || i + 1 == self.parts.len() {
                return (i, self.pos - start);
            }
            start += len;
        }
        (0, self.pos)
    }

    /// Starts a new part early when fewer than `need` bytes fit in this one. ZIP headers must not
    /// straddle two parts.
    pub fn keep_together(&mut self, need: u64) -> Result<()> {
        if self.limit == u64::MAX || need > self.limit {
            return Ok(());
        }
        let last = self.parts.len() - 1;
        let (index, offset) = self.location();
        if index == last && offset > 0 && offset + need > self.limit {
            self.start_part()?;
        }
        Ok(())
    }

    fn switch_to(&mut self, index: usize) -> io::Result<()> {
        if self.open_index != index || self.open.is_none() {
            self.open = None;
            let handle = self.fs.open_rw(&self.parts[index].0).map_err(io::Error::other)?;
            self.open = Some(handle);
            self.open_index = index;
        }
        Ok(())
    }

    /// Closes the set and returns its parts in order, under their final names.
    pub fn finish(mut self) -> Result<Vec<String>> {
        self.flush()?;
        self.open = None;
        let mut names: Vec<String> = self.parts.iter().map(|(p, _)| p.clone()).collect();
        if let Some(target) = &self.single_target {
            if self.fs.exists(target) {
                self.fs.remove_file(target)?;
            }
            self.fs.rename(&names[0], target)?;
            names[0] = target.clone();
        } else if self.naming == Naming::ZipSpan {
            let last = names.len() - 1;
            if self.fs.exists(&self.output) {
                self.fs.remove_file(&self.output)?;
            }
            self.fs.rename(&names[last], &self.output)?;
            names[last] = self.output.clone();
        }
        Ok(names)
    }

    /// Removes everything written so far, after a failure or a cancel.
    pub fn abort(mut self) {
        self.open = None;
        for (path, _) in &self.parts {
            let _ = self.fs.remove_file(path);
        }
    }

    pub fn part_count(&self) -> usize {
        self.parts.len()
    }

    /// The output name, for placing temporary files beside it.
    pub fn base_name(&self) -> String {
        self.output.clone()
    }
}

impl Write for SplitWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        if self.progress.as_ref().is_some_and(|p| p.cancelled()) {
            return Err(crate::error::cancel_io());
        }
        let (mut index, mut offset) = self.location();
        // Exactly at the end of a full part.
        if offset >= self.limit {
            if index + 1 == self.parts.len() {
                self.start_part().map_err(io::Error::other)?;
            }
            index += 1;
            offset = 0;
        }
        self.switch_to(index)?;
        // A part shortened by keep_together must not be run over when it is patched.
        let room = if index + 1 < self.parts.len() {
            self.parts[index].1 - offset
        } else {
            self.limit - offset
        };
        let n = buf.len().min(room.min(usize::MAX as u64) as usize);
        let handle = self.open.as_mut().unwrap();
        handle.seek(SeekFrom::Start(offset))?;
        let written = handle.write(&buf[..n])?;
        self.pos += written as u64;
        let end = offset + written as u64;
        if end > self.parts[index].1 {
            self.parts[index].1 = end;
        }
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        match self.open.as_mut() {
            Some(handle) => handle.flush(),
            None => Ok(()),
        }
    }
}

impl Seek for SplitWriter {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let total = self.part_start(self.parts.len());
        let next = match to {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::End(n) => total as i128 + n as i128,
            SeekFrom::Current(n) => self.pos as i128 + n as i128,
        };
        if next < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek before start"));
        }
        let next = next as u64;
        // 7z reserves its start header by seeking forward before writing anything. Past the end
        // of the last part: write zeros so the parts stay contiguous.
        if next > total {
            self.pos = total;
            let mut gap = next - total;
            let zeros = [0u8; 4096];
            while gap > 0 {
                let n = gap.min(4096) as usize;
                self.write_all(&zeros[..n])?;
                gap -= n as u64;
            }
        }
        self.pos = next;
        Ok(next)
    }
}

/// A `Read + Seek` over a set of files, one handle open at a time.
pub struct ConcatReader {
    fs: Fs,
    parts: Vec<(String, u64)>,
    starts: Vec<u64>,
    total: u64,
    pos: u64,
    open_index: usize,
    open: Option<Box<dyn ReadSeek>>,
}

impl ConcatReader {
    pub fn new(fs: Fs, paths: &[String]) -> Result<Self> {
        let mut parts = Vec::with_capacity(paths.len());
        let mut starts = Vec::with_capacity(paths.len());
        let mut total = 0u64;
        for path in paths {
            let size = fs.size(path)?;
            parts.push((path.clone(), size));
            starts.push(total);
            total += size;
        }
        Ok(ConcatReader { fs, parts, starts, total, pos: 0, open_index: 0, open: None })
    }

    pub fn len(&self) -> u64 {
        self.total
    }

    pub fn is_empty(&self) -> bool {
        self.total == 0
    }

    pub fn starts(&self) -> &[u64] {
        &self.starts
    }
}

impl Read for ConcatReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.pos >= self.total || buf.is_empty() {
            return Ok(0);
        }
        let index = match self.starts.binary_search(&self.pos) {
            Ok(mut i) => {
                // Skip empty parts that start at the same offset.
                while i + 1 < self.parts.len() && self.parts[i].1 == 0 {
                    i += 1;
                }
                i
            }
            Err(i) => i - 1,
        };
        if self.open_index != index || self.open.is_none() {
            self.open = Some(self.fs.open(&self.parts[index].0).map_err(io::Error::other)?);
            self.open_index = index;
        }
        let offset = self.pos - self.starts[index];
        let room = self.parts[index].1 - offset;
        let n = buf.len().min(room.min(usize::MAX as u64) as usize);
        let handle = self.open.as_mut().unwrap();
        handle.seek(SeekFrom::Start(offset))?;
        let read = handle.read(&mut buf[..n])?;
        self.pos += read as u64;
        Ok(read)
    }
}

impl Seek for ConcatReader {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let next = match to {
            SeekFrom::Start(n) => n as i128,
            SeekFrom::End(n) => self.total as i128 + n as i128,
            SeekFrom::Current(n) => self.pos as i128 + n as i128,
        };
        if next < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek before start"));
        }
        self.pos = next as u64;
        Ok(self.pos)
    }
}

/// What kind of set a file belongs to, and every part in order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VolumeSet {
    pub naming: VolumeKind,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VolumeKind {
    Single,
    Numbered,
    ZipSpan,
    RarPart,
    RarOld,
}

impl VolumeKind {
    pub fn is_split(self) -> bool {
        !matches!(self, VolumeKind::Single)
    }
}

fn digits_at_end(s: &str) -> Option<(&str, &str)> {
    let cut = s.trim_end_matches(|c: char| c.is_ascii_digit());
    if cut.len() == s.len() {
        None
    } else {
        Some((cut, &s[cut.len()..]))
    }
}

/// Finds the whole set from any one of its parts: the user may well pick `.z03` or `.part2.rar`.
pub fn discover(fs: &Fs, path: &str) -> Result<VolumeSet> {
    let lower = path.to_lowercase();
    let dot = lower.rfind('.');
    let ext = dot.map(|i| &lower[i + 1..]).unwrap_or("");
    let stem = dot.map(|i| &path[..i]).unwrap_or(path);

    // x.001
    if ext.len() >= 3 && ext.chars().all(|c| c.is_ascii_digit()) {
        let width = ext.len();
        let mut paths = Vec::new();
        for n in 1.. {
            let candidate = format!("{stem}.{n:0width$}");
            if !fs.exists(&candidate) {
                break;
            }
            paths.push(candidate);
        }
        if paths.is_empty() {
            return Err(Error::MissingVolume(format!("{stem}.{:0width$}", 1)));
        }
        let own: u64 = ext.parse().unwrap_or(1);
        if own as usize > paths.len() {
            return Err(Error::MissingVolume(format!("{stem}.{:0width$}", paths.len() + 1)));
        }
        return Ok(VolumeSet { naming: VolumeKind::Numbered, paths });
    }

    // x.z01 ... x.zip
    let z_digits = ext.strip_prefix('z').filter(|d| d.len() >= 2 && d.chars().all(|c| c.is_ascii_digit()));
    if ext == "zip" || z_digits.is_some() {
        let zip = format!("{stem}.zip");
        let mut paths = Vec::new();
        for n in 1.. {
            let candidate = format!("{stem}.z{n:02}");
            if fs.exists(&candidate) {
                paths.push(candidate);
                continue;
            }
            let upper = format!("{stem}.Z{n:02}");
            if fs.exists(&upper) {
                paths.push(upper);
                continue;
            }
            break;
        }
        if paths.is_empty() && z_digits.is_none() {
            return Ok(VolumeSet { naming: VolumeKind::Single, paths: vec![path.to_string()] });
        }
        if !fs.exists(&zip) {
            let upper = format!("{stem}.ZIP");
            if fs.exists(&upper) {
                paths.push(upper);
                return Ok(VolumeSet { naming: VolumeKind::ZipSpan, paths });
            }
            return Err(Error::MissingVolume(zip));
        }
        paths.push(zip);
        return Ok(VolumeSet { naming: VolumeKind::ZipSpan, paths });
    }

    // x.part1.rar
    if ext == "rar" {
        let inner = stem.to_lowercase();
        if let Some((head, digits)) = digits_at_end(&inner) {
            if head.ends_with(".part") {
                let base = &stem[..head.len()];
                let width = digits.len();
                let mut paths = Vec::new();
                for n in 1.. {
                    let candidate = format!("{base}{n:0width$}.rar");
                    if !fs.exists(&candidate) {
                        break;
                    }
                    paths.push(candidate);
                }
                if paths.is_empty() {
                    return Err(Error::MissingVolume(format!("{base}{:0width$}.rar", 1)));
                }
                return Ok(VolumeSet { naming: VolumeKind::RarPart, paths });
            }
        }
    }

    // x.rar, x.r00, x.r01 ...
    let r_digits = ext.strip_prefix('r').filter(|d| d.len() >= 2 && d.chars().all(|c| c.is_ascii_digit()));
    if ext == "rar" || r_digits.is_some() {
        let first = if ext == "rar" { path.to_string() } else { format!("{stem}.rar") };
        let mut rest = Vec::new();
        for n in 0.. {
            let candidate = format!("{stem}.r{n:02}");
            if fs.exists(&candidate) {
                rest.push(candidate);
                continue;
            }
            let upper = format!("{stem}.R{n:02}");
            if fs.exists(&upper) {
                rest.push(upper);
                continue;
            }
            break;
        }
        if rest.is_empty() && r_digits.is_none() {
            return Ok(VolumeSet { naming: VolumeKind::Single, paths: vec![path.to_string()] });
        }
        let first = if fs.exists(&first) {
            first
        } else {
            let upper = format!("{stem}.RAR");
            if !fs.exists(&upper) {
                return Err(Error::MissingVolume(first));
            }
            upper
        };
        let mut paths = vec![first];
        paths.extend(rest);
        return Ok(VolumeSet { naming: VolumeKind::RarOld, paths });
    }

    Ok(VolumeSet { naming: VolumeKind::Single, paths: vec![path.to_string()] })
}

/// `x.part1.rar`, with enough digits for the set. We do not know the count in advance, so we use
/// the same width as WinRAR's minimum and rename nothing later.
pub fn rar_part_name(output: &str, index: usize, width: usize) -> String {
    let lower = output.to_lowercase();
    let base = if lower.ends_with(".rar") { &output[..output.len() - 4] } else { output };
    format!("{base}.part{:0width$}.rar", index + 1)
}
