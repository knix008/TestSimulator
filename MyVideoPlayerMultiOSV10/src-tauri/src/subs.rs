//! Subtitle files next to a video, and fetching a YouTube video's subtitles.
//!
//! Layout written for a downloaded `clip.mp4`:
//!   clip.ko.srt, clip.en.srt, …  one file per language YouTube offers
//!   clip.srt                     copy of the default language, so any player auto-loads it

use crate::tools;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const EXTS: [&str; 3] = ["srt", "smi", "vtt"];

/// `ko`, `en-US`, `zh-Hans`, `en-orig` … — the language part of `clip.<lang>.srt`.
fn is_lang_tag(s: &str) -> bool {
  let mut parts = s.split('-');
  let first = parts.next().unwrap_or("");
  (2..=3).contains(&first.len())
    && first.chars().all(|c| c.is_ascii_alphabetic())
    && parts.all(|p| !p.is_empty() && p.len() <= 8 && p.chars().all(|c| c.is_ascii_alphanumeric()))
}

fn sub_ext(path: &Path) -> Option<String> {
  let e = path.extension()?.to_string_lossy().to_ascii_lowercase();
  EXTS.contains(&e.as_str()).then_some(e)
}

/// (lang, path) for every subtitle belonging to `media`; lang "" is the plain `clip.srt`.
fn scan(media: &Path) -> Vec<(String, PathBuf)> {
  let (Some(dir), Some(stem)) = (media.parent(), media.file_stem()) else { return Vec::new() };
  let stem = stem.to_string_lossy().to_string();
  let mut out = Vec::new();
  let Ok(entries) = std::fs::read_dir(dir) else { return out };
  for e in entries.flatten() {
    let path = e.path();
    if sub_ext(&path).is_none() || !path.is_file() {
      continue;
    }
    let Some(name_stem) = path.file_stem().map(|s| s.to_string_lossy().to_string()) else { continue };
    if name_stem.eq_ignore_ascii_case(&stem) {
      out.push((String::new(), path));
    } else if let Some(lang) = name_stem.strip_prefix(&format!("{stem}.")) {
      if is_lang_tag(lang) {
        out.push((lang.to_string(), path));
      }
    }
  }
  out.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
  out
}

fn read_text(path: &Path) -> String {
  std::fs::read(path).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
}

fn track(lang: &str, path: &Path) -> Value {
  json!({
    "lang": lang,
    "path": path,
    "name": path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
    "ext": format!(".{}", sub_ext(path).unwrap_or_default()),
    "content": read_text(path),
  })
}

/// Every subtitle track of `media`. The plain `clip.srt` is left out when it is just the
/// copy of one of the language files.
pub fn list(media: &Path) -> Vec<Value> {
  let found = scan(media);
  let lang_bytes: Vec<Vec<u8>> =
    found.iter().filter(|(l, _)| !l.is_empty()).map(|(_, p)| std::fs::read(p).unwrap_or_default()).collect();
  found
    .iter()
    .filter(|(lang, path)| {
      if !lang.is_empty() {
        return true;
      }
      let bytes = std::fs::read(path).unwrap_or_default();
      !lang_bytes.iter().any(|b| *b == bytes)
    })
    .map(|(lang, path)| track(lang, path))
    .collect()
}

/// Best language among `langs` for `preferred` ("ko", "en", …): exact, then same base
/// language (ko-KR, en-orig), then English, then the first.
pub fn pick<'a>(langs: &'a [String], preferred: &str) -> Option<&'a String> {
  let pref = preferred.to_ascii_lowercase();
  let base = |l: &str| l.split('-').next().unwrap_or("").to_ascii_lowercase();
  langs
    .iter()
    .find(|l| l.to_ascii_lowercase() == pref)
    .or_else(|| langs.iter().find(|l| !pref.is_empty() && base(l) == base(&pref)))
    .or_else(|| langs.iter().find(|l| l.eq_ignore_ascii_case("en")))
    .or_else(|| langs.iter().find(|l| base(l) == "en"))
    .or_else(|| langs.first())
}

fn run_subs(bin: &Path, url: &str, template: &str, extra: &[&str], cookies: Option<&Path>) {
  let mut args: Vec<String> = vec![
    url.into(),
    "--skip-download".into(),
    "--no-playlist".into(),
    "--no-warnings".into(),
    "--convert-subs".into(),
    "srt".into(),
    "--ffmpeg-location".into(),
    tools::ffmpeg_path().to_string_lossy().into_owned(),
    "-o".into(),
    template.into(),
  ];
  args.extend(extra.iter().map(|s| s.to_string()));
  if let Some(c) = cookies.filter(|c| c.is_file()) {
    args.push("--cookies".into());
    args.push(c.to_string_lossy().into_owned());
  }
  args.extend(tools::yt_dlp_js_runtime_args());
  let _ = tools::run_capture(bin, &args);
}

/// Downloads the subtitles YouTube has for `url` next to `video` (SRT) and makes
/// `clip.srt` the `preferred` language. Uploaded subtitles first; when there are none,
/// YouTube's automatic captions in the preferred language / English / the original.
/// Returns the tracks now next to the video (empty when the video has none).
pub fn fetch_youtube(url: &str, video: &Path, preferred: &str, cookies: Option<&Path>) -> Vec<Value> {
  let Some(bin) = tools::find_yt_dlp() else { return Vec::new() };
  let template = tools::out_template(video);
  let langs_now = |v: &Path| scan(v).into_iter().filter(|(l, _)| !l.is_empty()).map(|(l, _)| l).collect::<Vec<_>>();

  run_subs(&bin, url, &template, &["--write-subs", "--sub-langs", "all,-live_chat"], cookies);
  if langs_now(video).is_empty() {
    let pref = if preferred.is_empty() { "en".to_string() } else { preferred.to_string() };
    let wanted = format!("{pref},{pref}-.*,en,.*-orig");
    run_subs(&bin, url, &template, &["--write-auto-subs", "--sub-langs", &wanted], cookies);
  }
  let langs = langs_now(video);
  if let Some(lang) = pick(&langs, preferred) {
    if let Some((_, path)) = scan(video).into_iter().find(|(l, _)| l == lang) {
      let plain = video.with_extension("srt");
      let _ = std::fs::copy(path, plain);
    }
  }
  list(video)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn language_tags() {
    for ok in ["ko", "en", "en-US", "zh-Hans", "en-orig", "fil"] {
      assert!(is_lang_tag(ok), "{ok}");
    }
    for bad in ["f137", "", "korean", "en-", "1080p"] {
      assert!(!is_lang_tag(bad), "{bad}");
    }
  }

  #[test]
  fn picks_the_preferred_language() {
    let langs: Vec<String> = ["de", "en", "ko-KR"].iter().map(|s| s.to_string()).collect();
    assert_eq!(pick(&langs, "ko").unwrap(), "ko-KR");
    assert_eq!(pick(&langs, "ja").unwrap(), "en");
    assert_eq!(pick(&langs, "de").unwrap(), "de");
    let only: Vec<String> = vec!["fr".into()];
    assert_eq!(pick(&only, "ko").unwrap(), "fr");
  }

  #[test]
  fn lists_tracks_and_hides_the_default_copy() {
    let dir = tempfile::tempdir().unwrap();
    let video = dir.path().join("Me at the zoo.mp4");
    std::fs::write(&video, b"v").unwrap();
    std::fs::write(dir.path().join("Me at the zoo.en.srt"), b"1\n00:00:01,000 --> 00:00:02,000\nhi\n").unwrap();
    std::fs::write(dir.path().join("Me at the zoo.ko.srt"), b"ko").unwrap();
    std::fs::write(dir.path().join("Me at the zoo.srt"), b"ko").unwrap();
    std::fs::write(dir.path().join("Me at the zoo.f137.srt"), b"x").unwrap();
    std::fs::write(dir.path().join("Other.en.srt"), b"x").unwrap();
    let langs: Vec<String> = list(&video).iter().map(|t| t["lang"].as_str().unwrap().to_string()).collect();
    assert_eq!(langs, ["en", "ko"]);

    // A hand-made clip.smi with no language twin stays in the list.
    std::fs::write(dir.path().join("Me at the zoo.smi"), b"<SAMI></SAMI>").unwrap();
    let langs: Vec<String> = list(&video).iter().map(|t| t["lang"].as_str().unwrap().to_string()).collect();
    assert_eq!(langs, ["", "en", "ko"]);
  }
}
