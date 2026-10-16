//! Every icon stored in a Windows PE file (.exe, .dll, .ocx, .cpl).
//!
//! The shell only ever hands back the one icon it picks, but a program file
//! usually carries several. RocketDock lets you choose among them, so this
//! walks the PE resource tree itself - DOS header → PE header → section table →
//! resource directory → `RT_GROUP_ICON` - and rebuilds each group into a
//! standalone .ico by pairing it with its `RT_ICON` entries.
//!
//! Pure parsing, no native dependency. Returns nothing for anything that is not
//! a readable PE file rather than failing.

use serde::Serialize;
use std::{
  collections::BTreeMap,
  fs,
  path::{Path, PathBuf},
};

const RT_ICON: u32 = 3;
const RT_GROUP_ICON: u32 = 14;

fn u16_at(b: &[u8], at: usize) -> Option<u16> {
  b.get(at..at + 2).map(|s| u16::from_le_bytes([s[0], s[1]]))
}
fn u32_at(b: &[u8], at: usize) -> Option<u32> {
  b.get(at..at + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

#[derive(Debug)]
pub struct Section {
  virtual_address: u32,
  size_of_raw_data: u32,
  pointer_to_raw_data: u32,
}

#[derive(Debug)]
pub struct Headers {
  pub resource_rva: u32,
  pub sections: Vec<Section>,
}

pub fn read_headers(buf: &[u8]) -> Option<Headers> {
  if buf.len() < 0x40 || u16_at(buf, 0)? != 0x5a4d {
    return None; // 'MZ'
  }
  let pe = u32_at(buf, 0x3c)? as usize;
  if pe + 24 > buf.len() || u32_at(buf, pe)? != 0x0000_4550 {
    return None; // 'PE\0\0'
  }
  let coff = pe + 4;
  let section_count = u16_at(buf, coff + 2)? as usize;
  let optional_size = u16_at(buf, coff + 16)? as usize;
  let optional = coff + 20;
  if optional + optional_size > buf.len() {
    return None;
  }
  let magic = u16_at(buf, optional)?;
  // The data directory sits after the optional header's fixed part, which
  // differs between PE32 (0x10b) and PE32+ (0x20b).
  let data_dir = if magic == 0x20b { optional + 112 } else { optional + 96 };
  if data_dir + 8 * 3 > buf.len() {
    return None;
  }
  let resource_rva = u32_at(buf, data_dir + 8 * 2)?;
  if resource_rva == 0 {
    return None;
  }
  let mut sections = Vec::new();
  let mut cursor = optional + optional_size;
  for _ in 0..section_count {
    if cursor + 40 > buf.len() {
      break;
    }
    sections.push(Section {
      virtual_address: u32_at(buf, cursor + 12)?,
      size_of_raw_data: u32_at(buf, cursor + 16)?,
      pointer_to_raw_data: u32_at(buf, cursor + 20)?,
    });
    cursor += 40;
  }
  Some(Headers { resource_rva, sections })
}

fn rva_to_offset(rva: u32, sections: &[Section]) -> Option<usize> {
  sections.iter().find_map(|s| {
    let end = s.virtual_address as u64 + s.size_of_raw_data.max(1) as u64;
    (rva >= s.virtual_address && (rva as u64) < end).then(|| (s.pointer_to_raw_data + (rva - s.virtual_address)) as usize)
  })
}

struct Entry {
  id: Option<u32>,
  offset: usize,
  is_directory: bool,
}

/// One IMAGE_RESOURCE_DIRECTORY's entries.
fn read_directory(buf: &[u8], base: usize, offset: usize) -> Vec<Entry> {
  let at = base + offset;
  let (Some(named), Some(ids)) = (u16_at(buf, at + 12), u16_at(buf, at + 14)) else { return Vec::new() };
  if at + 16 > buf.len() {
    return Vec::new();
  }
  let mut entries = Vec::new();
  for i in 0..(named as usize + ids as usize) {
    let entry_at = at + 16 + i * 8;
    let (Some(name), Some(data)) = (u32_at(buf, entry_at), u32_at(buf, entry_at + 4)) else { break };
    entries.push(Entry {
      id: if name & 0x8000_0000 != 0 { None } else { Some(name) }, // named entries are not icons
      offset: (data & 0x7fff_ffff) as usize,
      is_directory: data & 0x8000_0000 != 0,
    });
  }
  entries
}

fn read_leaf<'a>(buf: &'a [u8], base: usize, offset: usize, sections: &[Section]) -> Option<&'a [u8]> {
  let at = base + offset;
  let rva = u32_at(buf, at)?;
  let size = u32_at(buf, at + 4)? as usize;
  let start = rva_to_offset(rva, sections)?;
  buf.get(start..start.checked_add(size)?)
}

/// Descend through the language level to the first data leaf.
fn first_leaf<'a>(buf: &'a [u8], base: usize, entry: &Entry, sections: &[Section], depth: u32) -> Option<&'a [u8]> {
  if !entry.is_directory {
    return read_leaf(buf, base, entry.offset, sections);
  }
  if depth > 4 {
    return None;
  }
  let children = read_directory(buf, base, entry.offset);
  first_leaf(buf, base, children.first()?, sections, depth + 1)
}

/// Every resource of one type, keyed by resource id, in id order.
fn collect<'a>(buf: &'a [u8], base: usize, root: &[Entry], kind: u32, sections: &[Section]) -> BTreeMap<u32, &'a [u8]> {
  let mut out = BTreeMap::new();
  let Some(type_entry) = root.iter().find(|e| e.id == Some(kind) && e.is_directory) else { return out };
  for name in read_directory(buf, base, type_entry.offset) {
    let Some(id) = name.id else { continue };
    if let Some(data) = first_leaf(buf, base, &name, sections, 0) {
      out.insert(id, data);
    }
  }
  out
}

pub struct BuiltIco {
  pub buffer: Vec<u8>,
  /// The widths each image advertises (0 means 256).
  pub widths: Vec<u8>,
}

/// Rebuild a GRPICONDIR plus its RT_ICON images into the .ico layout a file on
/// disk uses. They differ only in the last field: the resource id becomes a
/// file offset.
pub fn build_ico(group: &[u8], icons: &BTreeMap<u32, &[u8]>) -> Option<BuiltIco> {
  let count = u16_at(group, 4)? as usize;
  if count == 0 || group.len() < 6 + count * 14 {
    return None;
  }
  let mut entries = Vec::new();
  for i in 0..count {
    let at = 6 + i * 14;
    let id = u16_at(group, at + 12)? as u32;
    let Some(image) = icons.get(&id) else { continue };
    entries.push((&group[at..at + 8], *image));
  }
  if entries.is_empty() {
    return None;
  }
  let header = 6 + entries.len() * 16;
  let mut out = Vec::with_capacity(header + entries.iter().map(|(_, i)| i.len()).sum::<usize>());
  out.extend_from_slice(&0u16.to_le_bytes()); // reserved
  out.extend_from_slice(&1u16.to_le_bytes()); // type: icon
  out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
  let mut data_at = header as u32;
  for (dir, image) in &entries {
    out.extend_from_slice(dir); // width, height, colours, reserved, planes, bit count
    out.extend_from_slice(&(image.len() as u32).to_le_bytes());
    out.extend_from_slice(&data_at.to_le_bytes());
    data_at += image.len() as u32;
  }
  for (_, image) in &entries {
    out.extend_from_slice(image);
  }
  Some(BuiltIco { buffer: out, widths: entries.iter().map(|(dir, _)| dir[0]).collect() })
}

#[derive(Clone, Debug, Serialize)]
pub struct Extracted {
  pub index: usize,
  pub file: String,
  pub size: u32,
  pub count: usize,
}

/// Windows 10+ moves the resources of many system binaries into a parallel
/// `.mun` file, leaving the DLL itself a stub.
pub fn mun_fallback(file: &Path) -> Option<PathBuf> {
  let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
  let name = file.file_name()?.to_string_lossy().into_owned();
  let candidate = Path::new(&root).join("SystemResources").join(format!("{name}.mun"));
  candidate.is_file().then_some(candidate)
}

pub fn extract_all(file: &Path, out_dir: &Path) -> Vec<Extracted> {
  extract(file, out_dir, false)
}

fn extract(file: &Path, out_dir: &Path, followed_mun: bool) -> Vec<Extracted> {
  let buf = match fs::read(file) {
    Ok(buf) => buf,
    Err(err) => {
      eprintln!("[pe-icons] cannot read {}: {err}", file.display());
      return Vec::new();
    }
  };
  let ext = file.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
  // An .ico file is already what we would produce.
  if ext == "ico" {
    return vec![Extracted { index: 0, file: file.to_string_lossy().into_owned(), size: 0, count: 1 }];
  }

  let retry_in_mun = || -> Vec<Extracted> {
    if followed_mun || !cfg!(windows) {
      return Vec::new();
    }
    mun_fallback(file).map(|mun| extract(&mun, out_dir, true)).unwrap_or_default()
  };

  let Some(headers) = read_headers(&buf) else { return retry_in_mun() };
  let Some(base) = rva_to_offset(headers.resource_rva, &headers.sections) else { return retry_in_mun() };
  let root = read_directory(&buf, base, 0);
  let groups = collect(&buf, base, &root, RT_GROUP_ICON, &headers.sections);
  let icons = collect(&buf, base, &root, RT_ICON, &headers.sections);
  if groups.is_empty() || icons.is_empty() {
    return retry_in_mun();
  }

  let _ = fs::create_dir_all(out_dir);
  let stem: String = sha1_smol::Sha1::from(file.to_string_lossy().as_bytes()).digest().to_string().chars().take(12).collect();
  let mut results = Vec::new();
  for (index, (group_id, group)) in groups.iter().enumerate() {
    let Some(built) = build_ico(group, &icons) else { continue };
    let target = out_dir.join(format!("{stem}-{group_id}.ico"));
    match fs::write(&target, &built.buffer) {
      Ok(()) => results.push(Extracted {
        index,
        file: target.to_string_lossy().into_owned(),
        size: built.widths.iter().map(|&w| if w == 0 { 256 } else { w as u32 }).max().unwrap_or(0),
        count: built.widths.len(),
      }),
      Err(err) => eprintln!("[pe-icons] cannot write {}: {err}", target.display()),
    }
  }
  // Show the most detailed icons first - those are the ones worth picking.
  results.sort_by(|a, b| b.size.cmp(&a.size).then(a.index.cmp(&b.index)));
  results
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_data_that_is_not_a_pe_file() {
    assert!(read_headers(&[0u8; 8]).is_none());
    assert!(read_headers(b"not an executable at all, really").is_none());
    let mut mz = vec![0u8; 512];
    mz[0] = b'M';
    mz[1] = b'Z';
    mz[0x3c] = 0x80;
    assert!(read_headers(&mz).is_none(), "an MZ header with no PE signature");
  }

  #[test]
  fn returns_nothing_rather_than_failing() {
    let tmp = tempfile::tempdir().unwrap();
    assert!(extract_all(&tmp.path().join("nope.exe"), tmp.path()).is_empty());
    let text = tmp.path().join("plain.txt");
    fs::write(&text, "hello").unwrap();
    assert!(extract_all(&text, tmp.path()).is_empty());
  }

  #[cfg(windows)]
  fn system(rel: &str) -> PathBuf {
    Path::new(&std::env::var("SystemRoot").unwrap()).join(rel)
  }

  #[cfg(windows)]
  #[test]
  fn reads_the_resource_directory_of_a_real_executable() {
    let headers = read_headers(&fs::read(system("explorer.exe")).unwrap()).expect("no headers");
    assert!(headers.resource_rva > 0 && !headers.sections.is_empty());
  }

  #[cfg(windows)]
  #[test]
  fn pulls_every_icon_group_out_of_a_system_executable() {
    let tmp = tempfile::tempdir().unwrap();
    let found = extract_all(&system("System32\\notepad.exe"), tmp.path());
    assert!(!found.is_empty());
    for entry in &found {
      let buf = fs::read(&entry.file).unwrap();
      assert_eq!(u16_at(&buf, 0), Some(0), "bad ICO reserved field");
      assert_eq!(u16_at(&buf, 2), Some(1), "bad ICO type");
      assert_eq!(u16_at(&buf, 4), Some(entry.count as u16));
      assert!(entry.size > 0);
      assert!(image::load_from_memory_with_format(&buf, image::ImageFormat::Ico).is_ok(), "the rebuilt .ico does not decode");
    }
  }

  #[cfg(windows)]
  #[test]
  fn follows_the_mun_redirect_and_sorts_largest_first() {
    let tmp = tempfile::tempdir().unwrap();
    let shell32 = extract_all(&system("System32\\shell32.dll"), tmp.path());
    assert!(shell32.len() > 50, "expected shell32 to yield many icons, got {}", shell32.len());
    let explorer = extract_all(&system("explorer.exe"), tmp.path());
    assert!(explorer.windows(2).all(|w| w[0].size >= w[1].size));
  }
}
