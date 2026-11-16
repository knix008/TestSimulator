// The asset library (material textures and HDRIs) is not in the installer: the
// page downloads it from Poly Haven on first start (src/io/assetlib.js) and
// stores it here, in <settings folder>/library. The page reads the files back
// through the `mylib` protocol (http://mylib.localhost/<path> on Windows,
// mylib://localhost/<path> elsewhere), with CORS headers so WebGL may use them.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::http::{header, Request, Response, StatusCode};

/// The folder the library lives in.
pub fn dir(config_dir: &Path) -> PathBuf {
  config_dir.join("library")
}

/// A library path from the page: "textures/oak/diff.jpg" — letters, digits, _ - . and / only, no "..", no root.
pub fn safe_rel(rel: &str) -> Option<PathBuf> {
  let rel = rel.trim_start_matches('/');
  if rel.is_empty() || rel.len() > 300 || rel.contains("..") || rel.contains("//") || rel.contains('\\') {
    return None;
  }
  if !rel.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '/')) {
    return None;
  }
  Some(rel.split('/').collect::<PathBuf>())
}

fn mime_of(path: &Path) -> &'static str {
  match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
    Some("jpg") | Some("jpeg") => "image/jpeg",
    Some("png") => "image/png",
    Some("webp") => "image/webp",
    Some("json") => "application/json",
    _ => "application/octet-stream",
  }
}

/// Serves a request of the `mylib` protocol from the library folder.
pub fn serve(root: &Path, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
  let raw = request.uri().path();
  let decoded = raw.replace("%20", " ");
  let found = safe_rel(&decoded).map(|r| root.join(r)).filter(|p| p.is_file());
  let builder = Response::builder()
    .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
    .header(header::CACHE_CONTROL, "no-cache");
  match found.and_then(|p| std::fs::read(&p).ok().map(|b| (p, b))) {
    Some((p, bytes)) => builder.status(StatusCode::OK).header(header::CONTENT_TYPE, mime_of(&p)).body(bytes).unwrap(),
    None => builder.status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap(),
  }
}

/// Every file of the library (relative, with "/") and their total size.
pub fn info(root: &Path) -> Value {
  let mut files = Vec::new();
  let mut bytes: u64 = 0;
  fn walk(base: &Path, dir: &Path, files: &mut Vec<String>, bytes: &mut u64) {
    let Ok(list) = std::fs::read_dir(dir) else { return };
    for e in list.flatten() {
      let p = e.path();
      if p.is_dir() {
        walk(base, &p, files, bytes);
      } else if let Ok(rel) = p.strip_prefix(base) {
        *bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
        files.push(rel.to_string_lossy().replace('\\', "/"));
      }
    }
  }
  walk(root, root, &mut files, &mut bytes);
  files.sort();
  json!({ "dir": root.to_string_lossy(), "files": files, "bytes": bytes })
}

/// Writes one downloaded file (written to a temporary name first, so a broken download never looks complete).
pub fn write(root: &Path, rel: &str, bytes: &[u8]) -> Result<(), String> {
  let rel = safe_rel(rel).ok_or_else(|| format!("bad library path {rel}"))?;
  let path = root.join(rel);
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let tmp = path.with_extension("part");
  std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
  std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Removes the whole library (Settings → Reinstall).
pub fn clear(root: &Path) -> Result<(), String> {
  if root.exists() {
    std::fs::remove_dir_all(root).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn library_paths_stay_inside() {
    assert!(safe_rel("textures/oak_veneer_01/diff.jpg").is_some());
    assert!(safe_rel("/hdri/venice_sunset.hdr").is_some());
    for bad in ["", "../x", "a/../../b", "c:\\x", "a//b", "a b", "x?y"] {
      assert!(safe_rel(bad).is_none(), "{bad}");
    }
  }

  #[test]
  fn library_write_list_serve_clear() {
    let root = std::env::temp_dir().join(format!("myarch-lib-test-{}", std::process::id()));
    let _ = clear(&root);
    write(&root, "textures/a/diff.jpg", b"jpeg").unwrap();
    write(&root, "hdri/h.hdr", b"#?RADIANCE").unwrap();
    assert!(write(&root, "../escape.txt", b"x").is_err());
    let i = info(&root);
    assert_eq!(i["files"], json!(["hdri/h.hdr", "textures/a/diff.jpg"]));
    assert_eq!(i["bytes"], json!(14));
    let ok = serve(&root, &Request::builder().uri("http://mylib.localhost/textures/a/diff.jpg").body(Vec::new()).unwrap());
    assert_eq!(ok.status(), StatusCode::OK);
    assert_eq!(ok.headers()[header::CONTENT_TYPE], "image/jpeg");
    assert_eq!(ok.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], "*");
    assert_eq!(ok.body(), b"jpeg");
    let missing = serve(&root, &Request::builder().uri("http://mylib.localhost/../secret").body(Vec::new()).unwrap());
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    clear(&root).unwrap();
    assert!(!root.exists());
  }
}
