// File helpers for the commands in lib.rs: what the page hands over to be
// written, what it gets back when it reads, and the documents named on the
// command line.

use base64::Engine;
use std::path::{Path, PathBuf};

/// Every extension MyCircuit opens when the shell hands it a file; keep in
/// sync with "fileAssociations" in tauri.conf.json.
pub const SUPPORTED_EXTENSIONS: [&str; 1] = ["mycircuit"];

/// Text as the page expects it back: { content, encoding: "utf8" }. A file
/// that is not valid UTF-8 still opens (invalid bytes become U+FFFD), the way
/// Node's readFileSync(path, "utf8") behaved in the Electron build.
pub fn read_text(path: &Path) -> std::io::Result<String> {
  let bytes = std::fs::read(path)?;
  Ok(match String::from_utf8(bytes) {
    Ok(text) => text,
    Err(e) => String::from_utf8_lossy(e.as_bytes()).into_owned(),
  })
}

/// contentBase64 carries binary exports (zip, png, glb); content is text.
pub fn payload(content: Option<&str>, content_base64: Option<&str>) -> Result<Vec<u8>, String> {
  match content_base64 {
    Some(b64) => base64::engine::general_purpose::STANDARD.decode(b64.trim()).map_err(|e| format!("bad base64: {e}")),
    None => Ok(content.unwrap_or_default().as_bytes().to_vec()),
  }
}

/// Settings are replaced as a whole: write a sibling file and rename it over,
/// so a crash never leaves half a settings.json behind.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir)?;
  }
  let tmp = path.with_extension("tmp");
  std::fs::write(&tmp, bytes)?;
  std::fs::rename(&tmp, path)
}

/// <dir>/<name>, or <dir>/<stem> (2).<ext> … when that is taken.
pub fn free_name(dir: &Path, name: &str) -> PathBuf {
  let first = dir.join(name);
  if !first.exists() {
    return first;
  }
  let p = Path::new(name);
  let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| name.to_string());
  let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
  (2..10_000).map(|n| dir.join(format!("{stem} ({n}){ext}"))).find(|c| !c.exists()).unwrap_or(first)
}

pub fn is_supported(path: &Path) -> bool {
  path
    .extension()
    .map(|e| e.to_string_lossy().to_ascii_lowercase())
    .is_some_and(|e| SUPPORTED_EXTENSIONS.contains(&e.as_str()))
}

/// The documents among the program arguments (the first one is the program
/// itself; switches are skipped), made absolute against `cwd`.
pub fn openable_from_args<I: IntoIterator<Item = String>>(args: I, cwd: &Path) -> Vec<String> {
  args
    .into_iter()
    .skip(1)
    .filter(|a| !a.starts_with('-'))
    .map(|a| {
      let p = PathBuf::from(&a);
      if p.is_absolute() { p } else { cwd.join(p) }
    })
    .filter(|p| is_supported(p) && p.is_file())
    .map(|p| p.to_string_lossy().to_string())
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn payload_decodes_text_and_base64() {
    assert_eq!(payload(Some("héllo"), None).unwrap(), "héllo".as_bytes());
    assert_eq!(payload(None, Some("AAEC/w==")).unwrap(), vec![0, 1, 2, 255]);
    assert_eq!(payload(None, None).unwrap(), Vec::<u8>::new());
    assert!(payload(None, Some("not base64!")).is_err());
  }

  #[test]
  fn read_text_survives_invalid_utf8() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("a.mycircuit");
    std::fs::write(&f, [b'{', 0xff, b'}']).unwrap();
    assert_eq!(read_text(&f).unwrap(), "{\u{fffd}}");
  }

  #[test]
  fn free_name_never_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let first = free_name(dir.path(), "board.pdf");
    assert!(first.ends_with("board.pdf"));
    std::fs::write(&first, b"x").unwrap();
    assert!(free_name(dir.path(), "board.pdf").ends_with("board (2).pdf"));
  }

  #[test]
  fn only_existing_project_files_open_from_the_command_line() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.mycircuit"), "{}").unwrap();
    std::fs::write(dir.path().join("b.txt"), "x").unwrap();
    let args = ["MyCircuit.exe", "--flag", "a.mycircuit", "b.txt", "missing.mycircuit"].map(String::from);
    let got = openable_from_args(args, dir.path());
    assert_eq!(got.len(), 1);
    assert!(got[0].ends_with("a.mycircuit"));
  }

  #[test]
  fn atomic_write_replaces_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("sub").join("settings.json");
    write_atomic(&f, b"{\"a\":1}").unwrap();
    write_atomic(&f, b"{\"a\":2}").unwrap();
    assert_eq!(std::fs::read_to_string(&f).unwrap(), "{\"a\":2}");
    assert!(!f.with_extension("tmp").exists());
  }
}
