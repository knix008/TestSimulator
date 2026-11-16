// File helpers for the commands in lib.rs: what the page hands over to be
// written, what it gets back when it reads, and the documents named on the
// command line.

use base64::Engine;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// Every extension MyArchitecture opens when the shell hands it a file (a
/// project, a drawing or a 3D model to import); `.myarch` is the one the
/// installer associates ("fileAssociations" in tauri.conf.json).
pub const SUPPORTED_EXTENSIONS: [&str; 17] = ["myarch", "dxf", "dwg", "ifc", "svg", "obj", "stl", "ply", "glb", "gltf", "fbx", "dae", "3mf", "3ds", "wrl", "amf", "3dm"];

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

/// { filePath, content, encoding }: binary reads (3D models, images, DXF in
/// any code page) travel as base64, the page decodes the text itself.
pub fn read_payload(path: &Path, binary: bool) -> Result<Value, String> {
  let shown = path.to_string_lossy();
  if binary {
    let bytes = std::fs::read(path).map_err(|e| format!("{shown}: {e}"))?;
    let content = base64::engine::general_purpose::STANDARD.encode(bytes);
    return Ok(json!({ "filePath": shown, "content": content, "encoding": "base64" }));
  }
  let content = read_text(path).map_err(|e| format!("{shown}: {e}"))?;
  Ok(json!({ "filePath": shown, "content": content, "encoding": "utf8" }))
}

/// contentBase64 carries binary exports (zip, png, glb, pdf); content is text.
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

/// A sample's file name: no folders, only a .myarch file.
pub fn is_sample_name(name: &str) -> bool {
  let Some(stem) = name.strip_suffix(".myarch") else {
    return false;
  };
  !stem.is_empty() && !name.contains("..") && stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
}

/// sample/index.json is either a list or { samples: [...] }.
pub fn sample_list(index: &str) -> Value {
  match serde_json::from_str::<Value>(index) {
    Ok(Value::Array(list)) => Value::Array(list),
    Ok(Value::Object(mut o)) => match o.remove("samples") {
      Some(Value::Array(list)) => Value::Array(list),
      _ => json!([]),
    },
    _ => json!([]),
  }
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
    let f = dir.path().join("a.myarch");
    std::fs::write(&f, [b'{', 0xff, b'}']).unwrap();
    assert_eq!(read_text(&f).unwrap(), "{\u{fffd}}");
  }

  #[test]
  fn binary_reads_come_back_as_base64() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("m.stl");
    std::fs::write(&f, [0u8, 1, 2, 255]).unwrap();
    let v = read_payload(&f, true).unwrap();
    assert_eq!(v["encoding"], "base64");
    assert_eq!(v["content"], "AAEC/w==");
    assert_eq!(read_payload(&f, false).unwrap()["encoding"], "utf8");
    assert!(read_payload(&dir.path().join("missing.stl"), true).is_err());
  }

  #[test]
  fn only_existing_supported_files_open_from_the_command_line() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.myarch"), "{}").unwrap();
    std::fs::write(dir.path().join("b.DXF"), "0").unwrap();
    std::fs::write(dir.path().join("c.txt"), "x").unwrap();
    let args = ["MyArchitecture.exe", "--flag", "a.myarch", "b.DXF", "c.txt", "missing.myarch"].map(String::from);
    let got = openable_from_args(args, dir.path());
    assert_eq!(got.len(), 2);
    assert!(got[0].ends_with("a.myarch"));
    assert!(got[1].ends_with("b.DXF"));
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

  #[test]
  fn sample_names_stay_in_the_sample_folder() {
    assert!(is_sample_name("01-small-house.myarch"));
    assert!(!is_sample_name("../settings.myarch"));
    assert!(!is_sample_name("a/b.myarch"));
    assert!(!is_sample_name("x.json"));
    assert!(!is_sample_name(".myarch"));
  }

  #[test]
  fn sample_index_takes_both_shapes() {
    assert_eq!(sample_list(r#"[{"file":"a.myarch"}]"#).as_array().unwrap().len(), 1);
    assert_eq!(sample_list(r#"{"samples":[{"file":"a.myarch"},{"file":"b.myarch"}]}"#).as_array().unwrap().len(), 2);
    assert_eq!(sample_list("nope"), json!([]));
  }
}
