// File-system helpers behind the folder panel, "Open with", batch conversion and
// the tree's copy / paste. Plain functions over std::fs so they can be unit-tested
// without a window.
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const DICOM_EXTS: [&str; 4] = ["dcm", "dicm", "dicom", "dic"];
pub const IMAGE_EXTS: [&str; 19] = [
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "ico", "svg", "avif", "heic", "heif", "hif", "jp2", "j2k", "jpc", "jpx",
  "j2c",
];

fn ext_of(p: &Path) -> String {
  p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

/// A file the viewer can show: DICOM / image by extension, or an extension-less
/// file (DICOM files often have none). Folders are fine too — they open in the tree.
pub fn is_openable(p: &Path) -> bool {
  let Ok(meta) = std::fs::metadata(p) else { return false };
  if meta.is_dir() {
    return true;
  }
  let ext = ext_of(p);
  DICOM_EXTS.contains(&ext.as_str()) || IMAGE_EXTS.contains(&ext.as_str()) || ext.is_empty() || meta.len() > 132
}

/// Every existing file or folder among command-line arguments (the program itself
/// and switches are skipped). `cwd` resolves relative paths the way the shell saw them.
pub fn openable_from_args<I, S>(args: I, cwd: &Path) -> Vec<String>
where
  I: IntoIterator<Item = S>,
  S: AsRef<str>,
{
  let exe = std::env::current_exe().ok();
  let mut out: Vec<String> = Vec::new();
  for raw in args.into_iter().skip(1) {
    let raw = raw.as_ref();
    if raw.is_empty() || raw.starts_with('-') || raw == "." {
      continue;
    }
    let p = Path::new(raw);
    let abs = if p.is_absolute() { p.to_path_buf() } else { cwd.join(p) };
    if exe.as_ref().is_some_and(|e| same_path(e, &abs)) || !is_openable(&abs) {
      continue;
    }
    let text = plain(&abs).to_string_lossy().to_string();
    if !out.contains(&text) {
      out.push(text);
    }
  }
  out
}

/// Windows verbatim paths (\\?\C:\…) become ordinary ones; `.` and `..` are folded.
pub fn plain(path: &Path) -> PathBuf {
  use std::path::Component;
  let mut out = PathBuf::new();
  for c in path.components() {
    match c {
      Component::CurDir => {}
      Component::ParentDir => {
        out.pop();
      }
      other => out.push(other.as_os_str()),
    }
  }
  let text = out.to_string_lossy().to_string();
  if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
    return PathBuf::from(format!(r"\\{rest}"));
  }
  PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
}

pub fn same_path(a: &Path, b: &Path) -> bool {
  let (l, r) = (plain(a), plain(b));
  if cfg!(windows) {
    l.to_string_lossy().eq_ignore_ascii_case(&r.to_string_lossy())
  } else {
    l == r
  }
}

fn mtime_ms(meta: &std::fs::Metadata) -> f64 {
  meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_secs_f64() * 1000.0)
    .unwrap_or(0.0)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
  pub name: String,
  pub path: String,
  pub is_dir: bool,
  pub size: u64,
  pub mtime: f64,
}

/// Names the folder panel never shows.
pub fn hidden_name(name: &str) -> bool {
  name.starts_with('.') || name == "System Volume Information" || name == "$RECYCLE.BIN" || name.eq_ignore_ascii_case("desktop.ini")
}

/// One level of a folder (the page sorts it: folders first, then natural name order).
pub fn read_level(dir: &str) -> Result<Vec<Entry>, String> {
  let read = std::fs::read_dir(dir).map_err(|e| format!("{dir}: {e}"))?;
  let mut out = Vec::new();
  for item in read.flatten() {
    let name = item.file_name().to_string_lossy().to_string();
    if hidden_name(&name) {
      continue;
    }
    let full = item.path();
    // metadata() follows links, so a link to a folder lists as a folder.
    let Ok(meta) = std::fs::metadata(&full) else { continue };
    let is_dir = meta.is_dir();
    out.push(Entry { name, path: full.to_string_lossy().to_string(), is_dir, size: if is_dir { 0 } else { meta.len() }, mtime: mtime_ms(&meta) });
  }
  Ok(out)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stat {
  pub exists: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub is_dir: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub size: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mtime: Option<f64>,
}

pub fn stat(p: &str) -> Stat {
  match std::fs::metadata(p) {
    Ok(m) => Stat { exists: true, is_dir: Some(m.is_dir()), size: Some(m.len()), mtime: Some(mtime_ms(&m)) },
    Err(_) => Stat { exists: false, is_dir: None, size: None, mtime: None },
  }
}

/// Ready volumes for the folder panel's drive buttons. A: and B: are skipped because
/// an empty floppy or card reader stalls the check for seconds.
pub fn list_drives() -> Vec<String> {
  if cfg!(windows) {
    return (b'C'..=b'Z')
      .map(|c| format!("{}:\\", c as char))
      .filter(|root| std::fs::read_dir(root).is_ok())
      .collect();
  }
  let mut out = vec!["/".to_string()];
  if cfg!(target_os = "macos") {
    if let Ok(read) = std::fs::read_dir("/Volumes") {
      let mut vols: Vec<String> = read.flatten().map(|e| e.path().to_string_lossy().to_string()).collect();
      vols.sort();
      out.extend(vols);
    }
  }
  out
}

pub fn read_head(p: &str, n: usize) -> Result<Vec<u8>, String> {
  use std::io::Read;
  let f = std::fs::File::open(p).map_err(|e| format!("{p}: {e}"))?;
  let mut buf = Vec::with_capacity(n.min(1 << 20));
  f.take(n as u64).read_to_end(&mut buf).map_err(|e| e.to_string())?;
  Ok(buf)
}

/// Write through a temporary file next to the target, then rename, so a crash or a
/// full disk never leaves half a file behind under the real name.
pub fn write_atomic(p: &Path, data: &[u8]) -> Result<(), String> {
  if let Some(dir) = p.parent() {
    if !dir.as_os_str().is_empty() {
      std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
  }
  let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
  let tmp = p.with_file_name(format!(".{name}.{}.tmp", std::process::id()));
  std::fs::write(&tmp, data).map_err(|e| format!("{}: {e}", p.display()))?;
  if let Err(e) = std::fs::rename(&tmp, p) {
    // Some network shares refuse to rename over an existing file.
    let _ = std::fs::remove_file(p);
    std::fs::rename(&tmp, p).map_err(|_| {
      let _ = std::fs::remove_file(&tmp);
      format!("{}: {e}", p.display())
    })?;
  }
  Ok(())
}

/// `base`, or `base_2`, `base_3`… — the first that does not exist yet, created.
pub fn unique_dir(base: &str) -> Result<String, String> {
  let mut dir = PathBuf::from(base);
  let mut i = 2;
  while dir.exists() {
    dir = PathBuf::from(format!("{base}_{i}"));
    i += 1;
  }
  std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
  Ok(dir.to_string_lossy().to_string())
}

#[derive(Debug, Serialize)]
pub struct CopyResult {
  pub src: String,
  pub dest: String,
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

fn copy_tree(src: &Path, dest: &Path) -> std::io::Result<()> {
  if std::fs::metadata(src)?.is_dir() {
    std::fs::create_dir_all(dest)?;
    for item in std::fs::read_dir(src)? {
      let item = item?;
      copy_tree(&item.path(), &dest.join(item.file_name()))?;
    }
    Ok(())
  } else {
    std::fs::copy(src, dest).map(|_| ())
  }
}

/// A name in `dir` for `name` that is free: "x.dcm", then "x (2).dcm", "x (3).dcm"…
pub fn free_name(dir: &Path, name: &str) -> PathBuf {
  let first = dir.join(name);
  if !first.exists() {
    return first;
  }
  let (stem, ext) = match name.rfind('.') {
    Some(i) if i > 0 => (&name[..i], &name[i..]),
    _ => (name, ""),
  };
  (2..).map(|i| dir.join(format!("{stem} ({i}){ext}"))).find(|p| !p.exists()).unwrap()
}

/// Copy (or move) files and folders into `dest_dir`. Pasting into the same folder
/// makes "name (2)"; an existing file of the same name elsewhere is overwritten,
/// as in the Electron version.
pub fn copy_into(sources: &[String], dest_dir: &str, moving: bool) -> Vec<CopyResult> {
  let dest_root = Path::new(dest_dir);
  let mut out = Vec::new();
  for src in sources {
    let sp = Path::new(src);
    let name = sp.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut dest = dest_root.join(&name);
    if same_path(&dest, sp) {
      dest = free_name(dest_root, &name);
    }
    let r = if moving {
      std::fs::rename(sp, &dest).or_else(|_| copy_tree(sp, &dest).and_then(|_| {
        if sp.is_dir() {
          std::fs::remove_dir_all(sp)
        } else {
          std::fs::remove_file(sp)
        }
      }))
    } else {
      copy_tree(sp, &dest)
    };
    out.push(CopyResult {
      src: src.clone(),
      dest: dest.to_string_lossy().to_string(),
      ok: r.is_ok(),
      error: r.err().map(|e| e.to_string()),
    });
  }
  out
}

pub fn is_external_url(url: &str) -> bool {
  let u = url.trim().to_ascii_lowercase();
  u.starts_with("https://") || u.starts_with("http://") || u.starts_with("mailto:")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn lists_a_folder_without_hidden_entries() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.dcm"), b"x").unwrap();
    std::fs::write(dir.path().join(".hidden"), b"x").unwrap();
    std::fs::create_dir(dir.path().join("sub")).unwrap();
    let mut names: Vec<_> = read_level(&dir.path().to_string_lossy()).unwrap().into_iter().map(|e| (e.name, e.is_dir)).collect();
    names.sort();
    assert_eq!(names, vec![("a.dcm".to_string(), false), ("sub".to_string(), true)]);
    assert!(read_level(&dir.path().join("missing").to_string_lossy()).is_err());
  }

  #[test]
  fn stat_reports_files_and_missing_paths() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("x.dcm");
    std::fs::write(&f, b"12345").unwrap();
    let s = stat(&f.to_string_lossy());
    assert!(s.exists);
    assert_eq!(s.is_dir, Some(false));
    assert_eq!(s.size, Some(5));
    assert!(!stat(&dir.path().join("nope").to_string_lossy()).exists);
  }

  #[test]
  fn head_reads_at_most_n_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("x.bin");
    std::fs::write(&f, vec![7u8; 5000]).unwrap();
    assert_eq!(read_head(&f.to_string_lossy(), 132).unwrap().len(), 132);
    assert_eq!(read_head(&f.to_string_lossy(), 9000).unwrap().len(), 5000);
  }

  #[test]
  fn atomic_write_creates_folders_and_replaces() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("deep").join("out.png");
    write_atomic(&f, b"one").unwrap();
    write_atomic(&f, b"two").unwrap();
    assert_eq!(std::fs::read(&f).unwrap(), b"two");
    let leftovers: Vec<_> = std::fs::read_dir(f.parent().unwrap()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).collect();
    assert!(leftovers.is_empty());
  }

  #[test]
  fn unique_dir_counts_up() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join("converted_png").to_string_lossy().to_string();
    assert_eq!(unique_dir(&base).unwrap(), base);
    assert_eq!(unique_dir(&base).unwrap(), format!("{base}_2"));
    assert_eq!(unique_dir(&base).unwrap(), format!("{base}_3"));
  }

  #[test]
  fn paste_into_the_same_folder_makes_a_copy_name() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("CT.dcm");
    std::fs::write(&f, b"x").unwrap();
    let r = copy_into(&[f.to_string_lossy().to_string()], &dir.path().to_string_lossy(), false);
    assert!(r[0].ok, "{:?}", r[0].error);
    assert!(r[0].dest.ends_with("CT (2).dcm"));
    let sub = dir.path().join("sub");
    std::fs::create_dir(&sub).unwrap();
    let r = copy_into(&[f.to_string_lossy().to_string()], &sub.to_string_lossy(), true);
    assert!(r[0].ok);
    assert!(!f.exists() && sub.join("CT.dcm").exists());
  }

  #[test]
  fn arguments_pick_existing_files_and_folders() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("image.dcm");
    std::fs::write(&f, b"x").unwrap();
    let args = vec!["app.exe".to_string(), "--flag".into(), "image.dcm".into(), "missing.dcm".into(), dir.path().to_string_lossy().to_string()];
    let got = openable_from_args(args, dir.path());
    assert_eq!(got.len(), 2);
    assert!(got[0].ends_with("image.dcm"));
  }

  #[test]
  fn verbatim_paths_become_plain() {
    if cfg!(windows) {
      assert_eq!(plain(Path::new(r"\\?\C:\a\b\..\c")), PathBuf::from(r"C:\a\c"));
    }
    assert!(is_external_url("https://example.com"));
    assert!(!is_external_url("file:///c:/x"));
  }
}
