// Small file helpers: which files the shell may hand us, header decoding,
// and which URLs may leave the app.
use std::path::{Path, PathBuf};

/// What MyStableFast3D opens when the shell hands it a file (file
/// association, "Open with", a second launch): pictures to convert and the
/// 3D formats the viewer reads (src/lib/formats.js).
const OPENABLE: [&str; 33] = [
  "png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff",
  "glb", "gltf", "obj", "stl", "ply", "fbx", "dae", "3mf", "3ds", "usdz", "usda", "usdc", "usd",
  "wrl", "vrml", "vtk", "vtp", "amf", "pcd", "xyz", "kmz", "lwo", "off", "x3d", "mtl",
];

fn is_openable(path: &Path) -> bool {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| OPENABLE.iter().any(|o| e.eq_ignore_ascii_case(o)))
    .unwrap_or(false)
}

/// The first existing image or 3D file among command-line arguments. `cwd`
/// resolves relative paths the way the shell that launched us saw them.
pub fn openable_from_args<I, S>(args: I, cwd: &Path) -> Option<PathBuf>
where
  I: IntoIterator<Item = S>,
  S: AsRef<str>,
{
  for raw in args.into_iter().skip(1) {
    let raw = raw.as_ref();
    if raw.is_empty() || raw.starts_with('-') {
      continue;
    }
    let p = Path::new(raw);
    if !is_openable(p) {
      continue;
    }
    let abs = if p.is_absolute() { p.to_path_buf() } else { cwd.join(p) };
    if abs.is_file() {
      return Some(abs);
    }
  }
  None
}

pub fn percent_decode(s: &str) -> String {
  let bytes = s.as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut i = 0;
  while i < bytes.len() {
    if bytes[i] == b'%' && i + 2 < bytes.len() {
      if let Some(v) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
        out.push(v);
        i += 3;
        continue;
      }
    }
    out.push(bytes[i]);
    i += 1;
  }
  String::from_utf8_lossy(&out).to_string()
}

/// Only web pages and mail addresses leave the app; never file: or custom schemes.
pub fn is_external_url(url: &str) -> bool {
  let u = url.trim().to_ascii_lowercase();
  u.starts_with("http://") || u.starts_with("https://") || u.starts_with("mailto:")
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  #[test]
  fn only_existing_images_and_models_are_taken_from_args() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("chair.png"), b"x").unwrap();
    fs::write(dir.path().join("chair.glb"), b"x").unwrap();
    fs::write(dir.path().join("notes.txt"), b"x").unwrap();
    assert_eq!(openable_from_args(["app", "--flag", "missing.png", "chair.png"], dir.path()), Some(dir.path().join("chair.png")));
    assert_eq!(openable_from_args(["app", "chair.glb"], dir.path()), Some(dir.path().join("chair.glb")));
    assert!(is_openable(Path::new("MODEL.GLB")), "extensions match in any case");
    assert_eq!(openable_from_args(["app", "notes.txt"], dir.path()), None);
    assert_eq!(openable_from_args(["chair.png"], dir.path()), None, "argv[0] is the program");
  }

  #[test]
  fn external_urls_are_web_or_mail_only() {
    assert!(is_external_url("https://huggingface.co/stabilityai/stable-fast-3d"));
    assert!(is_external_url("mailto:someone@example.com"));
    assert!(!is_external_url("file:///C:/Windows"));
    assert!(!is_external_url("javascript:alert(1)"));
  }

  #[test]
  fn percent_decoding() {
    assert_eq!(percent_decode("C%3A%5C3D%5C%EC%9D%98%EC%9E%90.png"), "C:\\3D\\의자.png");
    assert_eq!(percent_decode("100%"), "100%");
  }
}
