//! Icon resolution and the on-disk cache.
//!
//! Resolution order for a dock entry: an explicit custom icon → extraction from
//! the target → nothing, in which case the renderer draws a built-in glyph.
//! Extracted icons are cached to disk and invalidated when the source binary is
//! newer.
//!
//! The webview cannot read the disk, so every file it is given goes through the
//! app's own `dock:` protocol (`protocol.rs`), as a URL made by `file_url()`.

use std::{
  fs,
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};

use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde_json::Value;

/// Formats the webview shows as they are.
pub const DIRECT: [&str; 7] = ["png", "svg", "jpg", "jpeg", "gif", "webp", "bmp"];

/// The size icons are extracted at. The dock draws them up to iconSize ×
/// maxZoom, which the settings allow to pass 128.
const EXTRACT_SIZE: i32 = 256;

const PATH_SET: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b'~');

/// The origin the `dock:` protocol is reached at from inside a page.
pub fn protocol_origin() -> &'static str {
  if cfg!(windows) {
    "http://dock.localhost"
  } else {
    "dock://localhost"
  }
}

pub fn file_url(path: &Path) -> String {
  format!("{}/file/{}", protocol_origin(), utf8_percent_encode(&path.to_string_lossy(), PATH_SET))
}

fn ext_of(path: &Path) -> String {
  path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

fn is_direct(path: &Path) -> bool {
  DIRECT.contains(&ext_of(path).as_str())
}

pub fn hash(s: &str) -> String {
  sha1_smol::Sha1::from(s.as_bytes()).digest().to_string().chars().take(20).collect()
}

pub struct Icons {
  pub data_dir: PathBuf,
}

impl Icons {
  fn cache_dir(&self) -> PathBuf {
    let dir = self.data_dir.join("icon-cache");
    let _ = fs::create_dir_all(&dir);
    dir
  }

  /// The cached bitmap for `target`. The size is part of the key: the Electron
  /// build cached 32px pictures in the same folder, and those must not be
  /// picked up in place of the larger ones extracted now.
  fn cache_file(&self, target: &str) -> PathBuf {
    self.cache_dir().join(format!("{}.png", hash(&format!("{target}@{EXTRACT_SIZE}"))))
  }

  /// Resolve an icon for a dock item to a URL the renderer can display, or
  /// None when nothing could be found.
  pub fn resolve(&self, item: &Value) -> Option<String> {
    let explicit = item["icon"].as_str().unwrap_or("");
    if !explicit.is_empty() {
      let p = Path::new(explicit);
      if is_direct(p) && p.exists() {
        return Some(file_url(p));
      }
      if explicit.starts_with("data:") {
        return Some(explicit.to_string());
      }
      #[cfg(target_os = "linux")]
      if !explicit.contains('/') {
        if let Some(found) = find_linux_theme_icon(explicit) {
          return Some(file_url(&found));
        }
      }
      if p.exists() {
        if let Some(url) = self.extract(explicit) {
          return Some(url);
        }
      }
    }

    let target = item["path"].as_str().unwrap_or("");
    if target.is_empty() || target.starts_with("dock:") || target.starts_with("system:") {
      return None;
    }
    let p = Path::new(target);
    if is_direct(p) && p.exists() {
      return Some(file_url(p));
    }
    self.extract(target)
  }

  /// The file a resolved icon came from, for drawing it in a native menu.
  pub fn resolve_file(&self, item: &Value) -> Option<PathBuf> {
    let url = self.resolve(item)?;
    let prefix = format!("{}/file/", protocol_origin());
    let encoded = url.strip_prefix(&prefix)?;
    Some(PathBuf::from(percent_encoding::percent_decode_str(encoded).decode_utf8_lossy().into_owned()))
  }

  /// Pull the icon out of an executable / .app / .lnk / folder, using the cache.
  fn extract_file(&self, target: &str) -> Option<PathBuf> {
    let source_time = fs::metadata(target).and_then(|m| m.modified()).ok()?;
    let cached = self.cache_file(target);
    if let Ok(meta) = fs::metadata(&cached) {
      // Invalidate when the source binary is newer than the cached bitmap.
      if meta.modified().map(|t| t >= source_time).unwrap_or(false) {
        return Some(cached);
      }
    }
    let png = platform_icon(target)?;
    match fs::write(&cached, &png) {
      Ok(()) => Some(cached),
      Err(err) => {
        eprintln!("[icons] cache write failed: {err}");
        None
      }
    }
  }

  fn extract(&self, target: &str) -> Option<String> {
    #[cfg(target_os = "linux")]
    if let Some(found) = linux_icon_for(target) {
      return Some(file_url(&found));
    }
    self.extract_file(target).map(|f| file_url(&f))
  }

  /// The icon a target carries by default, copied into the app's own storage
  /// and returned as a plain path - which is what a dock entry stores.
  ///
  /// The copy is deliberate: the extraction cache is disposable and can be
  /// cleared from the settings window, and an entry's icon should not go with it.
  pub fn adopt_default(&self, target: &str) -> String {
    if target.is_empty() {
      return String::new();
    }
    let p = Path::new(target);
    let source = if is_direct(p) && p.exists() {
      Some(p.to_path_buf())
    } else {
      #[cfg(target_os = "linux")]
      let theme = linux_icon_for(target);
      #[cfg(not(target_os = "linux"))]
      let theme: Option<PathBuf> = None;
      theme.or_else(|| self.extract_file(target))
    };
    match source {
      Some(source) => self.import_custom_icon(&source.to_string_lossy()),
      None => String::new(),
    }
  }

  /// Copy a user-picked image into the app's own storage so it survives moves.
  /// Anything the webview cannot show directly (.ico, .icns, …) is rasterised
  /// to PNG first; what cannot be decoded at all is returned as it was.
  pub fn import_custom_icon(&self, source: &str) -> String {
    let dir = self.data_dir.join("custom-icons");
    let _ = fs::create_dir_all(&dir);
    let src = Path::new(source);
    let ext = match ext_of(src) {
      e if e.is_empty() => "png".to_string(),
      e => e,
    };
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let stem = hash(&format!("{source}{ms}"));

    if DIRECT.contains(&ext.as_str()) {
      let target = dir.join(format!("{stem}.{ext}"));
      return match fs::copy(src, &target) {
        Ok(_) => target.to_string_lossy().into_owned(),
        Err(err) => {
          eprintln!("[icons] could not copy {source}: {err}");
          String::new()
        }
      };
    }
    let Some(img) = decode_largest(src) else { return source.to_string() };
    let target = dir.join(format!("{stem}.png"));
    match img.save_with_format(&target, image::ImageFormat::Png) {
      Ok(()) => target.to_string_lossy().into_owned(),
      Err(_) => source.to_string(),
    }
  }

  pub fn clear_cache(&self) {
    if let Ok(entries) = fs::read_dir(self.cache_dir()) {
      for e in entries.flatten() {
        let _ = fs::remove_file(e.path()); // leave locked files alone
      }
    }
  }
}

/// Decode an image file; for an .ico, the largest picture it holds.
pub fn decode_largest(path: &Path) -> Option<image::DynamicImage> {
  let bytes = fs::read(path).ok()?;
  if ext_of(path) == "ico" || bytes.starts_with(&[0, 0, 1, 0]) {
    if let Some(best) = largest_ico_entry(&bytes) {
      return Some(best);
    }
  }
  image::load_from_memory(&bytes).ok()
}

fn largest_ico_entry(bytes: &[u8]) -> Option<image::DynamicImage> {
  let count = u16::from_le_bytes([*bytes.get(4)?, *bytes.get(5)?]) as usize;
  let mut best: Option<(u32, usize, usize)> = None;
  for i in 0..count {
    let at = 6 + i * 16;
    let e = bytes.get(at..at + 16)?;
    let w = if e[0] == 0 { 256 } else { e[0] as u32 };
    let size = u32::from_le_bytes([e[8], e[9], e[10], e[11]]) as usize;
    let offset = u32::from_le_bytes([e[12], e[13], e[14], e[15]]) as usize;
    if best.map(|b| w > b.0).unwrap_or(true) {
      best = Some((w, offset, size));
    }
  }
  let (_, offset, size) = best?;
  let data = bytes.get(offset..offset + size)?;
  if data.starts_with(b"\x89PNG") {
    return image::load_from_memory_with_format(data, image::ImageFormat::Png).ok();
  }
  // A BMP-in-ICO entry: let the ICO decoder have the whole file, which picks
  // the best entry itself.
  image::load_from_memory_with_format(bytes, image::ImageFormat::Ico).ok()
}

/// A picture scaled to a menu row, as RGBA.
pub fn menu_bitmap(path: &Path, px: u32) -> Option<(Vec<u8>, u32, u32)> {
  let img = decode_largest(path)?;
  let scaled = img.resize_exact(px, px, image::imageops::FilterType::Lanczos3).to_rgba8();
  Some((scaled.into_raw(), px, px))
}

fn encode_png(width: u32, height: u32, rgba: Vec<u8>) -> Option<Vec<u8>> {
  let img = image::RgbaImage::from_raw(width, height, rgba)?;
  let mut out = std::io::Cursor::new(Vec::new());
  image::DynamicImage::ImageRgba8(img).write_to(&mut out, image::ImageFormat::Png).ok()?;
  Some(out.into_inner())
}

/* ------------------------------ platforms ------------------------------- */

#[cfg(windows)]
fn platform_icon(target: &str) -> Option<Vec<u8>> {
  let (w, h, rgba) = crate::win::shell_icon(target, EXTRACT_SIZE)?;
  encode_png(w, h, rgba)
}

#[cfg(target_os = "macos")]
fn platform_icon(target: &str) -> Option<Vec<u8>> {
  use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
  use objc2_foundation::{NSDictionary, NSSize, NSString};
  let _ = encode_png;
  unsafe {
    let workspace = NSWorkspace::sharedWorkspace();
    let image = workspace.iconForFile(&NSString::from_str(target));
    image.setSize(NSSize::new(EXTRACT_SIZE as f64, EXTRACT_SIZE as f64));
    let tiff = image.TIFFRepresentation()?;
    let rep = NSBitmapImageRep::imageRepWithData(&tiff)?;
    let png = rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())?;
    Some(png.to_vec())
  }
}

#[cfg(target_os = "linux")]
fn platform_icon(_target: &str) -> Option<Vec<u8>> {
  let _ = encode_png;
  None
}

/// Linux has no "icon of this file" call outside a toolkit, so a program is
/// matched to the icon theme by its own name - `/usr/bin/firefox` → `firefox` -
/// and a folder to the theme's folder icon.
#[cfg(target_os = "linux")]
fn linux_icon_for(target: &str) -> Option<PathBuf> {
  let p = Path::new(target);
  if p.is_dir() {
    return find_linux_theme_icon("folder");
  }
  let name = p.file_stem()?.to_string_lossy().into_owned();
  find_linux_theme_icon(&name).or_else(|| find_linux_theme_icon(&name.to_lowercase()))
}

/// freedesktop icon-theme lookup for bare `Icon=firefox` names.
#[cfg(target_os = "linux")]
pub fn find_linux_theme_icon(name: &str) -> Option<PathBuf> {
  let home = crate::app_scanner::home();
  let roots = [
    home.join(".local/share/icons"),
    home.join(".icons"),
    PathBuf::from("/usr/share/icons"),
    PathBuf::from("/usr/local/share/icons"),
    PathBuf::from("/usr/share/pixmaps"),
    PathBuf::from("/var/lib/flatpak/exports/share/icons"),
    home.join(".local/share/flatpak/exports/share/icons"),
  ];
  let sizes = ["512x512", "256x256", "192x192", "128x128", "96x96", "64x64", "48x48", "scalable"];
  let exts = ["png", "svg", "xpm"];
  let rank = |n: &str| ["hicolor", "Adwaita", "breeze", "Papirus", "gnome"].iter().position(|x| *x == n).unwrap_or(5);
  for root in roots {
    for ext in exts {
      let flat = root.join(format!("{name}.{ext}"));
      if flat.exists() {
        return Some(flat);
      }
    }
    let Ok(entries) = fs::read_dir(&root) else { continue };
    let mut themes: Vec<String> = entries.flatten().filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    themes.sort_by_key(|t| rank(t));
    for theme in themes {
      for size in sizes {
        for category in ["apps", "devices", "mimetypes", "places"] {
          for ext in exts {
            let candidate = root.join(&theme).join(size).join(category).join(format!("{name}.{ext}"));
            if candidate.exists() {
              return Some(candidate);
            }
          }
        }
      }
    }
  }
  None
}

/// Whether a newly created entry should be given its target's own icon.
///
/// An icon that is already set stays: either the user chose it, or the
/// shortcut named one. The dock's own entries draw themselves, and a web link
/// has no file to read an icon out of.
pub fn can_adopt_icon(item: &Value) -> bool {
  if !item.is_object() {
    return false;
  }
  let icon = item["icon"].as_str().unwrap_or("");
  let kind = item["type"].as_str().unwrap_or("");
  if !icon.is_empty() || kind == "separator" || kind == "url" {
    return false;
  }
  match item["path"].as_str() {
    Some(t) if !t.is_empty() => !t.starts_with("dock:") && !t.starts_with("system:"),
    _ => false,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn adopts_an_icon_only_where_one_belongs() {
    assert!(can_adopt_icon(&json!({"type": "app", "path": "C:/Windows/notepad.exe", "icon": ""})));
    assert!(can_adopt_icon(&json!({"type": "folder", "path": "C:/Users", "icon": ""})));
    assert!(!can_adopt_icon(&json!({"type": "app", "path": "C:/Windows/notepad.exe", "icon": "C:/mine.png"})), "a chosen icon stays");
    assert!(!can_adopt_icon(&json!({"type": "app", "path": "C:/a.exe", "icon": "C:/b.ico"})), "the shortcut's icon stays");
    for target in ["system:trash", "system:home", "system:show-desktop", "dock:settings"] {
      assert!(!can_adopt_icon(&json!({"type": "special", "path": target, "icon": ""})), "{target}");
    }
    assert!(!can_adopt_icon(&json!({"type": "url", "path": "https://example.com", "icon": ""})));
    assert!(!can_adopt_icon(&json!({"type": "separator", "path": "", "icon": ""})));
    assert!(!can_adopt_icon(&json!({"type": "app", "path": "", "icon": ""})));
    assert!(!can_adopt_icon(&json!({"type": "app", "icon": ""})));
    assert!(!can_adopt_icon(&Value::Null));
    assert!(!can_adopt_icon(&json!({})));
  }

  #[test]
  fn file_urls_round_trip_through_the_protocol() {
    let tmp = tempfile::tempdir().unwrap();
    let file = tmp.path().join("an icon #1 (한글).png");
    image::RgbaImage::from_pixel(4, 4, image::Rgba([255, 0, 0, 255])).save(&file).unwrap();
    let icons = Icons { data_dir: tmp.path().to_path_buf() };
    let item = json!({"type": "app", "path": "", "icon": file.to_string_lossy()});
    let url = icons.resolve(&item).unwrap();
    assert!(url.starts_with(protocol_origin()));
    assert!(!url.contains(' ') && !url.contains('#'));
    assert_eq!(icons.resolve_file(&item).unwrap(), file);
  }

  #[test]
  fn imports_a_custom_icon_into_its_own_storage() {
    let tmp = tempfile::tempdir().unwrap();
    let icons = Icons { data_dir: tmp.path().to_path_buf() };
    let png = tmp.path().join("pick.png");
    image::RgbaImage::from_pixel(8, 8, image::Rgba([0, 0, 255, 255])).save(&png).unwrap();
    let stored = icons.import_custom_icon(&png.to_string_lossy());
    assert!(stored.contains("custom-icons") && Path::new(&stored).exists());
  }

  #[cfg(windows)]
  #[test]
  fn extracts_caches_and_adopts_a_programs_icon() {
    let tmp = tempfile::tempdir().unwrap();
    let icons = Icons { data_dir: tmp.path().to_path_buf() };
    let notepad = format!("{}\\System32\\notepad.exe", std::env::var("SystemRoot").unwrap());
    let url = icons.resolve(&json!({"type": "app", "path": notepad, "icon": ""})).expect("no icon resolved");
    assert!(url.contains("icon-cache"));
    let adopted = icons.adopt_default(&notepad);
    assert!(adopted.contains("custom-icons"), "adopt_default hands back a cache path instead of a copy: {adopted}");
    icons.clear_cache();
    assert!(Path::new(&adopted).exists(), "clearing the cache took the entry's own icon with it");
  }
}
