// ZIP archives opened as books.
//
// A comic or a pile of scanned pages often comes as one .zip of pictures. The
// reader does not page through the archive in memory: it extracts it once into
// a cache folder under the system temp directory and opens that folder like
// any other folder of pictures. Opening the same archive again (same path,
// size and modification time) reuses what was extracted, and folders nobody
// has opened for a few days are removed when the app starts.
//
// Only what a picture archive needs is supported: "stored" and "deflate"
// entries, ZIP64, UTF-8 names and the legacy code-page names Windows' own
// "Compressed folder" writes (CP949 on Korean Windows). Encrypted entries and
// other compression methods are skipped. Entry names can never reach outside
// the extraction folder ("../", absolute paths and drive letters are refused).
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::{self, BufWriter, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// The cache folder's name under the system temp directory.
pub const CACHE_DIR: &str = "MyEBookReader-zip";
/// Written last, so a half-extracted folder (a crash, a full disk) is redone.
const DONE_MARK: &str = ".myebookreader-extracted";
/// Folders not opened for this long go when the app starts.
pub const KEEP_FOR: Duration = Duration::from_secs(3 * 24 * 60 * 60);
/// A guard against archives that expand without end ("zip bombs").
const MAX_TOTAL: u64 = 64 * 1024 * 1024 * 1024;
/// The error an extraction stopped by the reader ends with.
pub const CANCELLED: &str = "Cancelled";

/// How far an extraction has got, for a progress bar: bytes unpacked out of
/// the archive's total, and files written out of the files it holds.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Step {
  pub bytes: u64,
  pub total_bytes: u64,
  pub files: usize,
  pub total_files: usize,
}

/// Called as the extraction goes; returning false stops it (the reader
/// pressed Cancel), and the extraction ends with CANCELLED.
pub type OnStep<'a> = dyn FnMut(&Step) -> bool + 'a;

const SIG_LOCAL: u32 = 0x0403_4b50;
const SIG_CENTRAL: u32 = 0x0201_4b50;
const SIG_EOCD: u32 = 0x0605_4b50;
const SIG_EOCD64: u32 = 0x0606_4b50;
const SIG_EOCD64_LOCATOR: u32 = 0x0706_4b50;

#[derive(Debug, Clone)]
pub struct ZipEntry {
  pub name: String,
  method: u16,
  flags: u16,
  comp_size: u64,
  size: u64,
  crc: u32,
  local_offset: u64,
}

impl ZipEntry {
  fn is_dir(&self) -> bool {
    self.name.ends_with('/') || self.name.ends_with('\\')
  }
}

fn u16_at(b: &[u8], at: usize) -> u16 {
  u16::from_le_bytes([b[at], b[at + 1]])
}
fn u32_at(b: &[u8], at: usize) -> u32 {
  u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}
fn u64_at(b: &[u8], at: usize) -> u64 {
  let mut x = [0u8; 8];
  x.copy_from_slice(&b[at..at + 8]);
  u64::from_le_bytes(x)
}

fn bad(msg: &str) -> String {
  format!("This ZIP archive cannot be read: {msg}.")
}

/// Legacy (non-UTF-8) entry names: the OEM code page Windows wrote them in.
#[cfg(windows)]
fn decode_legacy(bytes: &[u8]) -> Option<String> {
  use windows::Win32::Globalization::{MultiByteToWideChar, CP_OEMCP, MULTI_BYTE_TO_WIDE_CHAR_FLAGS};
  if bytes.is_empty() {
    return Some(String::new());
  }
  unsafe {
    let n = MultiByteToWideChar(CP_OEMCP, MULTI_BYTE_TO_WIDE_CHAR_FLAGS(0), bytes, None);
    if n <= 0 {
      return None;
    }
    let mut wide = vec![0u16; n as usize];
    let m = MultiByteToWideChar(CP_OEMCP, MULTI_BYTE_TO_WIDE_CHAR_FLAGS(0), bytes, Some(&mut wide));
    if m <= 0 {
      return None;
    }
    wide.truncate(m as usize);
    String::from_utf16(&wide).ok()
  }
}

#[cfg(not(windows))]
fn decode_legacy(_bytes: &[u8]) -> Option<String> {
  None
}

fn decode_name(raw: &[u8], flags: u16, unicode_extra: Option<String>) -> String {
  if flags & 0x0800 != 0 {
    return String::from_utf8_lossy(raw).into_owned();
  }
  if let Some(name) = unicode_extra {
    return name;
  }
  if let Ok(s) = std::str::from_utf8(raw) {
    return s.to_string();
  }
  decode_legacy(raw).unwrap_or_else(|| String::from_utf8_lossy(raw).into_owned())
}

/// Every entry of the archive, from its central directory.
pub fn read_entries<R: Read + Seek>(r: &mut R) -> Result<Vec<ZipEntry>, String> {
  let len = r.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
  if len < 22 {
    return Err(bad("the file is too short to be a ZIP archive"));
  }
  let tail_len = len.min(22 + 65_535 + 20);
  let tail_start = len - tail_len;
  let mut tail = vec![0u8; tail_len as usize];
  r.seek(SeekFrom::Start(tail_start)).map_err(|e| e.to_string())?;
  r.read_exact(&mut tail).map_err(|e| e.to_string())?;
  let eocd = (0..=tail.len() - 22)
    .rev()
    .find(|&i| u32_at(&tail, i) == SIG_EOCD)
    .ok_or_else(|| bad("its end-of-archive record is missing"))?;

  let mut count = u16_at(&tail, eocd + 10) as u64;
  let mut cd_size = u32_at(&tail, eocd + 12) as u64;
  let mut cd_offset = u32_at(&tail, eocd + 16) as u64;

  // ZIP64: the real numbers are in a record the locator points at.
  if (count == 0xffff || cd_size == 0xffff_ffff || cd_offset == 0xffff_ffff) && eocd >= 20 {
    let loc = eocd - 20;
    if u32_at(&tail, loc) == SIG_EOCD64_LOCATOR {
      let at = u64_at(&tail, loc + 8);
      let mut rec = [0u8; 56];
      r.seek(SeekFrom::Start(at)).map_err(|e| e.to_string())?;
      r.read_exact(&mut rec).map_err(|e| e.to_string())?;
      if u32_at(&rec, 0) != SIG_EOCD64 {
        return Err(bad("its ZIP64 record is damaged"));
      }
      count = u64_at(&rec, 32);
      cd_size = u64_at(&rec, 40);
      cd_offset = u64_at(&rec, 48);
    }
  }
  if cd_offset.checked_add(cd_size).map_or(true, |end| end > len) {
    return Err(bad("its table of contents lies outside the file"));
  }

  let mut cd = vec![0u8; cd_size as usize];
  r.seek(SeekFrom::Start(cd_offset)).map_err(|e| e.to_string())?;
  r.read_exact(&mut cd).map_err(|e| e.to_string())?;

  let mut out = Vec::with_capacity(count.min(1 << 20) as usize);
  let mut p = 0usize;
  while p + 46 <= cd.len() && u32_at(&cd, p) == SIG_CENTRAL {
    let flags = u16_at(&cd, p + 8);
    let method = u16_at(&cd, p + 10);
    let crc = u32_at(&cd, p + 16);
    let mut comp_size = u32_at(&cd, p + 20) as u64;
    let mut size = u32_at(&cd, p + 24) as u64;
    let name_len = u16_at(&cd, p + 28) as usize;
    let extra_len = u16_at(&cd, p + 30) as usize;
    let comment_len = u16_at(&cd, p + 32) as usize;
    let mut local_offset = u32_at(&cd, p + 42) as u64;
    let name_at = p + 46;
    let extra_at = name_at + name_len;
    let next = extra_at + extra_len + comment_len;
    if next > cd.len() {
      return Err(bad("its table of contents is cut short"));
    }
    let raw_name = &cd[name_at..extra_at];

    let mut unicode_name = None;
    let extra = &cd[extra_at..extra_at + extra_len];
    let mut e = 0usize;
    while e + 4 <= extra.len() {
      let id = u16_at(extra, e);
      let n = u16_at(extra, e + 2) as usize;
      let body = &extra[(e + 4).min(extra.len())..(e + 4 + n).min(extra.len())];
      match id {
        0x0001 => {
          // ZIP64 sizes and offset, present only for the fields that overflowed.
          let mut q = 0usize;
          let mut take = |field: &mut u64| {
            if *field == 0xffff_ffff && q + 8 <= body.len() {
              *field = u64_at(body, q);
              q += 8;
            }
          };
          take(&mut size);
          take(&mut comp_size);
          take(&mut local_offset);
        }
        0x7075 if body.len() > 5 && body[0] == 1 => {
          // Info-ZIP Unicode Path: valid only while it matches the plain name.
          if u32_at(body, 1) == crc32fast::hash(raw_name) {
            unicode_name = std::str::from_utf8(&body[5..]).ok().map(str::to_string);
          }
        }
        _ => {}
      }
      e += 4 + n;
    }

    out.push(ZipEntry {
      name: decode_name(raw_name, flags, unicode_name),
      method,
      flags,
      comp_size,
      size,
      crc,
      local_offset,
    });
    p = next;
  }
  Ok(out)
}

const RESERVED: [&str; 22] = [
  "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// The relative path an entry is written to, or None for entries that must
/// not be written: anything climbing out with "..", macOS resource forks.
pub fn safe_relative_path(name: &str) -> Option<PathBuf> {
  let mut out = PathBuf::new();
  for part in name.split(['/', '\\']) {
    let part = part.trim();
    if part.is_empty() || part == "." {
      continue;
    }
    if part == ".." {
      return None;
    }
    if part.eq_ignore_ascii_case("__MACOSX") || part.starts_with("._") {
      return None;
    }
    let mut clean: String = part
      .chars()
      .map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c })
      .collect();
    // Windows drops trailing dots and spaces, which would merge two names.
    while clean.ends_with('.') || clean.ends_with(' ') {
      clean.pop();
    }
    if clean.is_empty() {
      clean.push('_');
    }
    let stem = clean.split('.').next().unwrap_or("");
    if RESERVED.iter().any(|r| stem.eq_ignore_ascii_case(r)) {
      clean.insert(0, '_');
    }
    out.push(clean);
  }
  (!out.as_os_str().is_empty()).then_some(out)
}

/// Writes one entry's bytes to `to`, checking its size and CRC. `step` is
/// advanced as the bytes are written, so one huge entry still moves the bar.
fn extract_entry<R: Read + Seek>(
  r: &mut R,
  entry: &ZipEntry,
  to: &Path,
  step: &mut Step,
  on_step: &mut OnStep,
) -> Result<(), String> {
  let mut head = [0u8; 30];
  r.seek(SeekFrom::Start(entry.local_offset)).map_err(|e| e.to_string())?;
  r.read_exact(&mut head).map_err(|e| e.to_string())?;
  if u32_at(&head, 0) != SIG_LOCAL {
    return Err(bad(&format!("the entry \"{}\" is damaged", entry.name)));
  }
  let skip = u16_at(&head, 26) as i64 + u16_at(&head, 28) as i64;
  r.seek(SeekFrom::Current(skip)).map_err(|e| e.to_string())?;

  let file = File::create(to).map_err(|e| format!("{}: {e}", to.display()))?;
  let mut writer = CrcWriter { inner: BufWriter::new(file), crc: crc32fast::Hasher::new(), step, on_step };
  let limited = r.take(entry.comp_size);
  let copied = match entry.method {
    0 => io::copy(&mut limited.take(entry.size), &mut writer),
    8 => io::copy(&mut flate2::read::DeflateDecoder::new(limited).take(entry.size), &mut writer),
    m => return Err(bad(&format!("the entry \"{}\" uses compression method {m}", entry.name))),
  }
  .map_err(|e| {
    if e.kind() == io::ErrorKind::Other && e.to_string() == CANCELLED {
      CANCELLED.to_string()
    } else {
      bad(&format!("the entry \"{}\" could not be unpacked ({e})", entry.name))
    }
  })?;
  io::Write::flush(&mut writer).map_err(|e| e.to_string())?;
  if copied != entry.size || writer.crc.clone().finalize() != entry.crc {
    return Err(bad(&format!("the entry \"{}\" is damaged (checksum mismatch)", entry.name)));
  }
  Ok(())
}

struct CrcWriter<'s, 'f, W: io::Write> {
  inner: W,
  crc: crc32fast::Hasher,
  step: &'s mut Step,
  on_step: &'s mut OnStep<'f>,
}

impl<W: io::Write> io::Write for CrcWriter<'_, '_, W> {
  fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
    let n = self.inner.write(buf)?;
    self.crc.update(&buf[..n]);
    self.step.bytes += n as u64;
    if !(self.on_step)(self.step) {
      return Err(io::Error::new(io::ErrorKind::Other, CANCELLED));
    }
    Ok(n)
  }
  fn flush(&mut self) -> io::Result<()> {
    self.inner.flush()
  }
}

/// The names of an archive's files (folders left out), for choosing a cover
/// without extracting anything.
pub fn file_names(archive: &Path) -> Result<Vec<String>, String> {
  let mut f = io::BufReader::new(File::open(archive).map_err(|e| format!("{}: {e}", archive.display()))?);
  Ok(read_entries(&mut f)?.into_iter().filter(|e| !e.is_dir()).map(|e| e.name).collect())
}

/// One file of an archive, unpacked in memory (a cover picture). Refuses
/// entries over `limit` bytes.
pub fn read_file(archive: &Path, name: &str, limit: u64) -> Result<Vec<u8>, String> {
  let mut f = io::BufReader::new(File::open(archive).map_err(|e| format!("{}: {e}", archive.display()))?);
  let entries = read_entries(&mut f)?;
  let entry = entries
    .iter()
    .find(|e| e.name == name && !e.is_dir())
    .ok_or_else(|| bad(&format!("it has no file \"{name}\"")))?;
  if entry.size > limit {
    return Err(bad(&format!("\"{name}\" is too large to read on its own")));
  }
  if entry.flags & 1 != 0 {
    return Err(bad(&format!("\"{name}\" is encrypted")));
  }
  let mut head = [0u8; 30];
  f.seek(SeekFrom::Start(entry.local_offset)).map_err(|e| e.to_string())?;
  f.read_exact(&mut head).map_err(|e| e.to_string())?;
  if u32_at(&head, 0) != SIG_LOCAL {
    return Err(bad(&format!("the entry \"{name}\" is damaged")));
  }
  let skip = u16_at(&head, 26) as i64 + u16_at(&head, 28) as i64;
  f.seek(SeekFrom::Current(skip)).map_err(|e| e.to_string())?;
  let mut out = Vec::with_capacity(entry.size as usize);
  let limited = (&mut f).take(entry.comp_size);
  match entry.method {
    0 => limited.take(entry.size).read_to_end(&mut out),
    8 => flate2::read::DeflateDecoder::new(limited).take(entry.size).read_to_end(&mut out),
    m => return Err(bad(&format!("the entry \"{name}\" uses compression method {m}"))),
  }
  .map_err(|e| bad(&format!("the entry \"{name}\" could not be unpacked ({e})")))?;
  if out.len() as u64 != entry.size || crc32fast::hash(&out) != entry.crc {
    return Err(bad(&format!("the entry \"{name}\" is damaged (checksum mismatch)")));
  }
  Ok(out)
}

/// Extracts every usable entry of `archive` into `dest` (which must exist).
/// Returns how many files were written.
pub fn extract_all(archive: &Path, dest: &Path) -> Result<usize, String> {
  extract_all_with(archive, dest, &mut |_| true)
}

/// extract_all, reporting each step to `on_step` (which can stop it).
pub fn extract_all_with(archive: &Path, dest: &Path, on_step: &mut OnStep) -> Result<usize, String> {
  let mut f = io::BufReader::new(File::open(archive).map_err(|e| format!("{}: {e}", archive.display()))?);
  let entries = read_entries(&mut f)?;
  let total: u64 = entries.iter().map(|e| e.size).fold(0u64, u64::saturating_add);
  if total > MAX_TOTAL {
    return Err(bad("it would expand to more than 64 GB"));
  }
  let mut step = Step {
    bytes: 0,
    total_bytes: total,
    files: 0,
    total_files: entries.iter().filter(|e| !e.is_dir()).count(),
  };
  if !on_step(&step) {
    return Err(CANCELLED.into());
  }
  let mut written = 0usize;
  let mut skipped = 0usize;
  for entry in &entries {
    let Some(rel) = safe_relative_path(&entry.name) else { continue };
    let to = dest.join(&rel);
    if entry.is_dir() {
      fs::create_dir_all(&to).map_err(|e| format!("{}: {e}", to.display()))?;
      continue;
    }
    if entry.flags & 1 != 0 || !(entry.method == 0 || entry.method == 8) {
      skipped += 1;
      step.bytes += entry.size;
      step.files += 1;
      continue;
    }
    if let Some(parent) = to.parent() {
      fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    extract_entry(&mut f, entry, &to, &mut step, on_step)?;
    written += 1;
    step.files += 1;
    if !on_step(&step) {
      return Err(CANCELLED.into());
    }
  }
  if written == 0 && skipped > 0 {
    return Err(bad("its files are encrypted or use a compression method this reader does not support"));
  }
  Ok(written)
}

/// The cache folder for one archive: named after it, plus a hash of its path,
/// size and modification time — a changed archive gets a fresh folder.
pub fn cache_folder_for(root: &Path, archive: &Path) -> Result<PathBuf, String> {
  let meta = fs::metadata(archive).map_err(|e| format!("{}: {e}", archive.display()))?;
  let mtime = meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
    .map(|d| d.as_secs())
    .unwrap_or(0);
  let mut h = std::collections::hash_map::DefaultHasher::new();
  archive.to_string_lossy().to_lowercase().hash(&mut h);
  meta.len().hash(&mut h);
  mtime.hash(&mut h);
  let stem: String = archive
    .file_stem()
    .map(|s| s.to_string_lossy().to_string())
    .unwrap_or_default()
    .chars()
    .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' { c } else { '_' })
    .take(40)
    .collect();
  let stem = stem.trim();
  Ok(root.join(format!("{}-{:016x}", if stem.is_empty() { "archive" } else { stem }, h.finish())))
}

/// Extracts `archive` under `root` (once) and returns the folder it is in.
pub fn extract_cached(root: &Path, archive: &Path) -> Result<PathBuf, String> {
  extract_cached_with(root, archive, &mut |_| true)
}

/// extract_cached, reporting progress to `on_step`. A stopped (or failed)
/// extraction leaves nothing behind, so the next open starts afresh.
pub fn extract_cached_with(root: &Path, archive: &Path, on_step: &mut OnStep) -> Result<PathBuf, String> {
  let dest = cache_folder_for(root, archive)?;
  let mark = dest.join(DONE_MARK);
  if mark.is_file() {
    // Opened again: keep it from being pruned.
    if let Ok(f) = File::options().write(true).open(&mark) {
      let _ = f.set_modified(SystemTime::now());
    }
    return Ok(dest);
  }
  let partial = dest.with_extension("partial");
  let _ = fs::remove_dir_all(&partial);
  let _ = fs::remove_dir_all(&dest);
  fs::create_dir_all(&partial).map_err(|e| format!("{}: {e}", partial.display()))?;
  if let Err(err) = extract_all_with(archive, &partial, on_step) {
    let _ = fs::remove_dir_all(&partial);
    return Err(err);
  }
  fs::rename(&partial, &dest).map_err(|e| format!("{}: {e}", dest.display()))?;
  fs::write(&mark, archive.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
  Ok(dest)
}

/// Removes extraction folders last used longer than `keep` ago, and any left
/// half-done. Returns how many went.
pub fn prune(root: &Path, keep: Duration) -> usize {
  let Ok(read) = fs::read_dir(root) else { return 0 };
  let now = SystemTime::now();
  let mut removed = 0;
  for item in read.flatten() {
    let path = item.path();
    if !path.is_dir() {
      continue;
    }
    let used = fs::metadata(path.join(DONE_MARK)).and_then(|m| m.modified()).ok();
    let stale = match used {
      Some(t) => now.duration_since(t).map_or(false, |age| age >= keep),
      None => true,
    };
    if stale && fs::remove_dir_all(&path).is_ok() {
      removed += 1;
    }
  }
  removed
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;

  struct Item<'a> {
    name: &'a [u8],
    data: &'a [u8],
    deflate: bool,
    utf8_flag: bool,
  }

  /// A small archive written by hand, so every field is under the test's control.
  fn make_zip(items: &[Item]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for it in items {
      let body = if it.deflate {
        let mut enc = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(it.data).unwrap();
        enc.finish().unwrap()
      } else {
        it.data.to_vec()
      };
      let crc = crc32fast::hash(it.data);
      let method: u16 = if it.deflate { 8 } else { 0 };
      let flags: u16 = if it.utf8_flag { 0x0800 } else { 0 };
      let offset = out.len() as u32;
      out.extend_from_slice(&SIG_LOCAL.to_le_bytes());
      out.extend_from_slice(&20u16.to_le_bytes());
      out.extend_from_slice(&flags.to_le_bytes());
      out.extend_from_slice(&method.to_le_bytes());
      out.extend_from_slice(&[0, 0, 0, 0]);
      out.extend_from_slice(&crc.to_le_bytes());
      out.extend_from_slice(&(body.len() as u32).to_le_bytes());
      out.extend_from_slice(&(it.data.len() as u32).to_le_bytes());
      out.extend_from_slice(&(it.name.len() as u16).to_le_bytes());
      out.extend_from_slice(&0u16.to_le_bytes());
      out.extend_from_slice(it.name);
      out.extend_from_slice(&body);

      central.extend_from_slice(&SIG_CENTRAL.to_le_bytes());
      central.extend_from_slice(&20u16.to_le_bytes());
      central.extend_from_slice(&20u16.to_le_bytes());
      central.extend_from_slice(&flags.to_le_bytes());
      central.extend_from_slice(&method.to_le_bytes());
      central.extend_from_slice(&[0, 0, 0, 0]);
      central.extend_from_slice(&crc.to_le_bytes());
      central.extend_from_slice(&(body.len() as u32).to_le_bytes());
      central.extend_from_slice(&(it.data.len() as u32).to_le_bytes());
      central.extend_from_slice(&(it.name.len() as u16).to_le_bytes());
      central.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      central.extend_from_slice(&offset.to_le_bytes());
      central.extend_from_slice(it.name);
    }
    let cd_offset = out.len() as u32;
    out.extend_from_slice(&central);
    out.extend_from_slice(&SIG_EOCD.to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0]);
    out.extend_from_slice(&(items.len() as u16).to_le_bytes());
    out.extend_from_slice(&(items.len() as u16).to_le_bytes());
    out.extend_from_slice(&(central.len() as u32).to_le_bytes());
    out.extend_from_slice(&cd_offset.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out
  }

  fn item<'a>(name: &'a str, data: &'a [u8], deflate: bool) -> Item<'a> {
    Item { name: name.as_bytes(), data, deflate, utf8_flag: true }
  }

  #[test]
  fn extracts_stored_and_deflated_pictures_with_their_folders() {
    let dir = tempfile::tempdir().unwrap();
    let zip = dir.path().join("comic.zip");
    let big = vec![7u8; 10_000];
    fs::write(&zip, make_zip(&[
      item("ch1/", b"", false),
      item("ch1/001.jpg", b"first", false),
      item("ch1/002.jpg", &big, true),
      item("만화/표지.png", b"cover", true),
    ])).unwrap();
    let out = dir.path().join("out");
    fs::create_dir(&out).unwrap();
    assert_eq!(extract_all(&zip, &out).unwrap(), 3);
    assert_eq!(fs::read(out.join("ch1").join("001.jpg")).unwrap(), b"first");
    assert_eq!(fs::read(out.join("ch1").join("002.jpg")).unwrap(), big);
    assert_eq!(fs::read(out.join("만화").join("표지.png")).unwrap(), b"cover");
  }

  #[test]
  fn never_writes_outside_the_folder() {
    assert_eq!(safe_relative_path("../evil.jpg"), None);
    assert_eq!(safe_relative_path("a/../../evil.jpg"), None);
    assert_eq!(safe_relative_path("__MACOSX/a/._p.jpg"), None);
    assert_eq!(safe_relative_path("a/._p.jpg"), None);
    assert_eq!(safe_relative_path("/abs/p.jpg"), Some(PathBuf::from("abs").join("p.jpg")));
    assert_eq!(safe_relative_path("C:\\x\\p.jpg"), Some(PathBuf::from("C_").join("x").join("p.jpg")));
    assert_eq!(safe_relative_path("con.jpg"), Some(PathBuf::from("_con.jpg")));
    assert_eq!(safe_relative_path("name. "), Some(PathBuf::from("name")));

    let dir = tempfile::tempdir().unwrap();
    let zip = dir.path().join("bad.zip");
    fs::write(&zip, make_zip(&[item("../escape.jpg", b"x", false), item("ok.jpg", b"y", false)])).unwrap();
    let out = dir.path().join("out");
    fs::create_dir(&out).unwrap();
    assert_eq!(extract_all(&zip, &out).unwrap(), 1);
    assert!(!dir.path().join("escape.jpg").exists());
    assert!(out.join("ok.jpg").exists());
  }

  #[test]
  fn reads_names_without_the_utf8_flag() {
    let dir = tempfile::tempdir().unwrap();
    let zip = dir.path().join("plain.zip");
    fs::write(&zip, make_zip(&[Item { name: "p1.png".as_bytes(), data: b"z", deflate: false, utf8_flag: false }])).unwrap();
    let mut f = File::open(&zip).unwrap();
    let entries = read_entries(&mut f).unwrap();
    assert_eq!(entries[0].name, "p1.png");
  }

  #[test]
  fn refuses_a_damaged_entry() {
    let dir = tempfile::tempdir().unwrap();
    let zip = dir.path().join("broken.zip");
    let mut bytes = make_zip(&[item("a.jpg", b"hello", false)]);
    let at = bytes.windows(5).position(|w| w == b"hello").unwrap();
    bytes[at] = b'j';
    fs::write(&zip, bytes).unwrap();
    let out = dir.path().join("out");
    fs::create_dir(&out).unwrap();
    assert!(extract_all(&zip, &out).unwrap_err().contains("checksum"));
    assert!(read_entries(&mut io::Cursor::new(b"not a zip at all, clearly".to_vec())).is_err());
  }

  #[test]
  fn reads_one_file_without_extracting() {
    let dir = tempfile::tempdir().unwrap();
    let zip = dir.path().join("c.zip");
    let big = vec![5u8; 50_000];
    fs::write(&zip, make_zip(&[item("ch1/", b"", false), item("ch1/2.jpg", &big, true), item("1.jpg", b"one", false)])).unwrap();
    assert_eq!(file_names(&zip).unwrap(), vec!["ch1/2.jpg", "1.jpg"]);
    assert_eq!(read_file(&zip, "ch1/2.jpg", 1 << 20).unwrap(), big);
    assert_eq!(read_file(&zip, "1.jpg", 1 << 20).unwrap(), b"one");
    assert!(read_file(&zip, "ch1/2.jpg", 10).unwrap_err().contains("too large"));
    assert!(read_file(&zip, "nope.jpg", 10).is_err());
  }

  #[test]
  fn reports_progress_and_can_be_stopped() {
    let dir = tempfile::tempdir().unwrap();
    let zip = dir.path().join("big.zip");
    let big = vec![3u8; 300_000];
    fs::write(&zip, make_zip(&[item("a.jpg", &big, true), item("b.jpg", b"xyz", false)])).unwrap();

    let root = dir.path().join("cache");
    let mut seen: Vec<Step> = Vec::new();
    let out = extract_cached_with(&root, &zip, &mut |s| { seen.push(*s); true }).unwrap();
    assert!(out.join("b.jpg").is_file());
    let first = seen.first().unwrap();
    assert_eq!((first.bytes, first.total_bytes, first.files, first.total_files), (0, 300_003, 0, 2));
    // The big entry moves the bar while it is being written, not only after.
    assert!(seen.iter().any(|s| s.files == 0 && s.bytes > 0 && s.bytes < 300_000));
    assert!(seen.windows(2).all(|w| w[1].bytes >= w[0].bytes));
    let last = seen.last().unwrap();
    assert_eq!((last.bytes, last.files), (300_003, 2));

    // Stopped part-way: an error that says so, and nothing left behind.
    let zip2 = dir.path().join("big2.zip");
    fs::write(&zip2, make_zip(&[item("a.jpg", &big, true), item("b.jpg", b"xyz", false)])).unwrap();
    let err = extract_cached_with(&root, &zip2, &mut |s| s.bytes < 100_000).unwrap_err();
    assert_eq!(err, CANCELLED);
    let left: Vec<_> = fs::read_dir(&root).unwrap().flatten().map(|e| e.file_name()).collect();
    assert_eq!(left.len(), 1, "only the first archive's folder: {left:?}");
  }

  #[test]
  fn extracts_once_and_reuses_the_folder() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("cache");
    let zip = dir.path().join("book.zip");
    fs::write(&zip, make_zip(&[item("1.jpg", b"a", false)])).unwrap();
    let first = extract_cached(&root, &zip).unwrap();
    assert!(first.join("1.jpg").is_file());
    assert!(first.file_name().unwrap().to_string_lossy().starts_with("book-"));
    fs::write(first.join("1.jpg"), b"changed").unwrap();
    let again = extract_cached(&root, &zip).unwrap();
    assert_eq!(again, first);
    assert_eq!(fs::read(again.join("1.jpg")).unwrap(), b"changed", "not extracted twice");

    // A half-done folder (no mark) and a long-unused one are pruned; the fresh one stays.
    fs::create_dir_all(root.join("left-over")).unwrap();
    assert_eq!(prune(&root, KEEP_FOR), 1);
    assert!(first.is_dir());
    assert_eq!(prune(&root, Duration::from_secs(0)), 1);
    assert!(!first.exists());
  }
}
