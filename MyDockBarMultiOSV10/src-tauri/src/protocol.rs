//! The `dock:` protocol: how the pages show pictures from the disk.
//!
//! The Electron pages loaded icons straight from `file://` URLs. A Tauri page
//! cannot, so icons, theme images and the menu glyphs are served from here:
//!
//!   /file/<percent-encoded absolute path>   an image file on disk
//!   /menu/<name>.png                         a menu glyph compiled into the app
//!
//! Only pictures are served - a page asking for anything else gets a 404 - so
//! the protocol cannot be used to read arbitrary files.

use std::{borrow::Cow, path::Path};
use tauri::http::{Response, StatusCode};

mod glyphs {
  include!(concat!(env!("OUT_DIR"), "/glyphs.rs"));
}

/// A menu glyph's PNG bytes, 16px or 32px.
pub fn glyph(name: &str, double: bool) -> Option<&'static [u8]> {
  glyphs::GLYPHS.iter().find(|(n, _, _)| *n == name).map(|(_, one, two)| if double { *two } else { *one })
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn glyph_names() -> Vec<&'static str> {
  glyphs::GLYPHS.iter().map(|(n, _, _)| *n).collect()
}

fn mime(path: &Path) -> Option<&'static str> {
  let ext = path.extension()?.to_string_lossy().to_lowercase();
  Some(match ext.as_str() {
    "png" => "image/png",
    "svg" => "image/svg+xml",
    "jpg" | "jpeg" => "image/jpeg",
    "gif" => "image/gif",
    "webp" => "image/webp",
    "bmp" => "image/bmp",
    "ico" => "image/x-icon",
    _ => return None,
  })
}

fn reply(status: StatusCode, kind: &str, body: Cow<'static, [u8]>) -> Response<Cow<'static, [u8]>> {
  Response::builder()
    .status(status)
    .header("Content-Type", kind)
    .header("Access-Control-Allow-Origin", "*")
    .header("Cache-Control", "no-cache")
    .body(body)
    .unwrap()
}

fn not_found() -> Response<Cow<'static, [u8]>> {
  reply(StatusCode::NOT_FOUND, "text/plain", Cow::Borrowed(b"not found"))
}

pub fn handle(path: &str) -> Response<Cow<'static, [u8]>> {
  if let Some(name) = path.strip_prefix("/menu/") {
    let (name, double) = match name.strip_suffix("@2x.png") {
      Some(base) => (base, true),
      None => (name.trim_end_matches(".png"), false),
    };
    return match glyph(name, double) {
      Some(bytes) => reply(StatusCode::OK, "image/png", Cow::Borrowed(bytes)),
      None => not_found(),
    };
  }
  if let Some(encoded) = path.strip_prefix("/file/") {
    let decoded = percent_encoding::percent_decode_str(encoded).decode_utf8_lossy().into_owned();
    let file = Path::new(&decoded);
    let Some(kind) = mime(file) else { return not_found() };
    return match std::fs::read(file) {
      Ok(bytes) => reply(StatusCode::OK, kind, Cow::Owned(bytes)),
      Err(_) => not_found(),
    };
  }
  not_found()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn serves_pictures_and_nothing_else() {
    let tmp = tempfile::tempdir().unwrap();
    let png = tmp.path().join("a b.png");
    std::fs::write(&png, b"\x89PNG....").unwrap();
    let secret = tmp.path().join("config.json");
    std::fs::write(&secret, b"{}").unwrap();

    let url = crate::icons::file_url(&png);
    let path = url.strip_prefix(crate::icons::protocol_origin()).unwrap();
    assert_eq!(handle(path).status(), StatusCode::OK);

    let url = crate::icons::file_url(&secret);
    let path = url.strip_prefix(crate::icons::protocol_origin()).unwrap();
    assert_eq!(handle(path).status(), StatusCode::NOT_FOUND, "the protocol must not hand out non-image files");
    assert_eq!(handle("/menu/settings.png").status(), StatusCode::OK);
    assert_eq!(handle("/menu/settings@2x.png").status(), StatusCode::OK);
    assert_eq!(handle("/menu/nope.png").status(), StatusCode::NOT_FOUND);
  }
}
