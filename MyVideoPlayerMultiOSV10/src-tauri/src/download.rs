//! YouTube and other-site (Instagram, TikTok, …) downloads through yt-dlp.
//! Port of the Electron build's electron/youtube.js and electron/remote-video.js.

use crate::tools::{self, file_size};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

pub type Progress = Arc<dyn Fn(Value) + Send + Sync>;

#[derive(Debug)]
pub enum DlError {
  Cancelled,
  Failed(String),
}

impl From<String> for DlError {
  fn from(s: String) -> Self {
    DlError::Failed(s)
  }
}

pub struct Active {
  cancelled: AtomicBool,
  keep_partial: AtomicBool,
  pid: Mutex<Option<u32>>,
  output: PathBuf,
}

impl Active {
  fn new(output: &Path) -> Arc<Self> {
    Arc::new(Self {
      cancelled: AtomicBool::new(false),
      keep_partial: AtomicBool::new(false),
      pid: Mutex::new(None),
      output: output.to_path_buf(),
    })
  }
  fn is_cancelled(&self) -> bool {
    self.cancelled.load(Ordering::SeqCst)
  }
  fn check(&self) -> Result<(), DlError> {
    if self.is_cancelled() {
      Err(DlError::Cancelled)
    } else {
      Ok(())
    }
  }
  fn kill(&self) {
    if let Some(pid) = *self.pid.lock().unwrap() {
      tools::kill_tree(pid);
    }
  }
}

static ACTIVE_YOUTUBE: Mutex<Option<Arc<Active>>> = Mutex::new(None);
static ACTIVE_REMOTE: Mutex<Option<Arc<Active>>> = Mutex::new(None);

// ── YouTube links ───────────────────────────────────────────────

fn is_id_char(c: char) -> bool {
  c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

fn take_id(rest: &str) -> Option<String> {
  let id: String = rest.chars().take_while(|c| is_id_char(*c)).collect();
  (id.len() >= 11).then(|| id[..11].to_string())
}

/// Same links the Electron build accepted: watch?v=, embed/, shorts/, live/, youtu.be/, or a bare id.
pub fn extract_video_id(input: &str) -> Option<String> {
  let s = input.trim();
  if s.len() == 11 && s.chars().all(is_id_char) {
    return Some(s.to_string());
  }
  let lower = s.to_ascii_lowercase();
  let mut body = lower.as_str();
  let mut orig = s;
  for scheme in ["https://", "http://"] {
    if body.starts_with(scheme) {
      body = &body[scheme.len()..];
      orig = &orig[scheme.len()..];
    }
  }
  if body.starts_with("www.") {
    body = &body[4..];
    orig = &orig[4..];
  }
  if body.starts_with("youtu.be/") {
    return take_id(&orig["youtu.be/".len()..]);
  }
  if !body.starts_with("youtube.com/") {
    return None;
  }
  let path = &orig["youtube.com/".len()..];
  for prefix in ["embed/", "shorts/", "live/"] {
    if path.starts_with(prefix) {
      return take_id(&path[prefix.len()..]);
    }
  }
  let query = path.strip_prefix("watch?")?;
  for part in query.split('&') {
    if let Some(v) = part.strip_prefix("v=") {
      return take_id(v);
    }
  }
  None
}

pub fn normalize_watch_url(input: &str) -> Option<String> {
  extract_video_id(input).map(|id| format!("https://www.youtube.com/watch?v={id}"))
}

fn dump_json(bin: &Path, url: &str, extra: &[String]) -> Result<Value, String> {
  let mut args = vec![
    url.to_string(),
    "--dump-single-json".into(),
    "--no-playlist".into(),
    "--no-warnings".into(),
    "--skip-download".into(),
  ];
  args.extend_from_slice(extra);
  let out = tools::run_capture(bin, &args)?;
  serde_json::from_str(&out).map_err(|e| format!("yt-dlp: {e}"))
}

fn text(v: &Value, keys: &[&str]) -> String {
  keys
    .iter()
    .find_map(|k| v.get(*k).and_then(|x| x.as_str()).filter(|s| !s.is_empty()))
    .unwrap_or("")
    .to_string()
}

pub fn youtube_info(input: &str) -> Result<Value, String> {
  let url = normalize_watch_url(input).ok_or("유효한 YouTube 링크가 아닙니다.")?;
  let bin = tools::find_yt_dlp().ok_or("yt-dlp is not available")?;
  let info = dump_json(&bin, &url, &tools::yt_dlp_js_runtime_args())?;
  let id = text(&info, &["id"]);
  let title = text(&info, &["title"]);
  Ok(json!({
    "id": id,
    "title": if title.is_empty() { id.clone() } else { title },
    "duration": info.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0),
    "uploader": text(&info, &["uploader", "channel"]),
    "thumbnail": text(&info, &["thumbnail"]),
    "ext": "mp4",
    "url": url,
    "engine": "yt-dlp",
  }))
}

struct Attempt {
  label: &'static str,
  format: &'static str,
  extra: Vec<String>,
  fresh: bool,
  allow_format_18: bool,
  min_bytes: u64,
}

fn client_args(cookies: &[String], clients: &str) -> Vec<String> {
  let mut v = cookies.to_vec();
  v.push("--extractor-args".into());
  v.push(format!("youtube:player_client={clients}"));
  v
}

fn emit(progress: &Progress, percent: Option<f64>, message: &str) {
  progress(json!({ "percent": percent, "message": message }));
}

/// yt-dlp's "Downloading 1 format(s): 18" — the progressive itag it falls back to.
fn mentions_format_18(line: &str) -> bool {
  let lower = line.to_ascii_lowercase();
  let Some(at) = lower.find("format(s):") else { return false };
  let rest = lower[at + "format(s):".len()..].trim_start();
  rest.strip_prefix("18").is_some_and(|after| !after.starts_with(|c: char| c.is_ascii_alphanumeric()))
}

fn is_transient(msg: &str) -> bool {
  let m = msg.to_ascii_lowercase();
  ["403", "forbidden", "0 bytes read", "timed out", "temporary failure", "unable to download"]
    .iter()
    .any(|k| m.contains(k))
}

/// One yt-dlp run. Refuses a silent fall-back to progressive itag 18 unless allowed
/// (YouTube often truncates it).
fn run_yt_dlp(
  active: &Arc<Active>,
  bin: &Path,
  url: &str,
  output: &Path,
  progress: &Progress,
  attempt: &Attempt,
  allow_continue: bool,
) -> Result<PathBuf, DlError> {
  let ffmpeg = tools::ffmpeg_path();
  let mut args: Vec<String> = vec![url.into(), "--no-playlist".into(), "--no-warnings".into()];
  if allow_continue {
    args.push("--continue".into());
  } else {
    args.extend(["--no-continue".into(), "--no-part".into()]);
  }
  for a in [
    "--retries", "8", "--fragment-retries", "8", "--file-access-retries", "3", "--ffmpeg-location",
  ] {
    args.push(a.into());
  }
  args.push(ffmpeg.to_string_lossy().into_owned());
  args.extend(["-f".into(), attempt.format.into(), "--merge-output-format".into(), "mp4".into()]);
  args.extend([
    "--print".into(),
    "before_dl:Downloading format %(format_id)s (%(resolution)s)".into(),
    "-o".into(),
    tools::out_template(output),
    "--newline".into(),
    "--progress".into(),
  ]);
  args.extend(tools::yt_dlp_js_runtime_args());
  args.extend(attempt.extra.iter().cloned());

  let peak = Arc::new(Mutex::new(0f64));
  let refused18 = Arc::new(AtomicBool::new(false));
  let on_line = {
    let peak = peak.clone();
    let refused18 = refused18.clone();
    let progress = progress.clone();
    let active = active.clone();
    let allow18 = attempt.allow_format_18;
    move |line: &str| {
      if active.is_cancelled() {
        return;
      }
      let current = *peak.lock().unwrap();
      let shown = (current > 0.0).then_some(current);
      if line.contains("Downloading format ") {
        emit(&progress, shown, line);
        return;
      }
      if !allow18 && mentions_format_18(line) {
        refused18.store(true, Ordering::SeqCst);
        active.kill();
        return;
      }
      if let Some(pct) = tools::parse_percent(line) {
        let mut p = peak.lock().unwrap();
        *p = p.max(pct);
        emit(&progress, Some(*p), line);
        return;
      }
      emit(&progress, shown, line);
    }
  };

  let result = tools::run_streaming(bin, &args, |pid| *active.pid.lock().unwrap() = Some(pid), on_line);
  *active.pid.lock().unwrap() = None;
  active.check()?;
  let refuse = || {
    DlError::Failed("Refusing broken YouTube progressive format 18. Please retry (adaptive DASH is required).".into())
  };
  let (ok, tail) = result?;
  if refused18.load(Ordering::SeqCst) {
    return Err(refuse());
  }
  if !ok {
    let t = tail.trim();
    return Err(DlError::Failed(if t.is_empty() { "yt-dlp failed".into() } else { t.to_string() }));
  }
  let saved = tools::resolve_output(output);
  let size = file_size(&saved);
  if size < 1024 {
    return Err(DlError::Failed("yt-dlp finished without a usable file".into()));
  }
  if size < attempt.min_bytes {
    return Err(DlError::Failed(
      "Downloaded file is too small — YouTube stream was likely truncated. Please retry.".into(),
    ));
  }
  Ok(saved)
}

fn download_with_yt_dlp(
  active: &Arc<Active>,
  bin: &Path,
  url: &str,
  output: &Path,
  progress: &Progress,
  cookies: Option<&Path>,
) -> Result<PathBuf, DlError> {
  let cookie_args: Vec<String> = match cookies.filter(|p| p.is_file()) {
    Some(p) => vec!["--cookies".into(), p.to_string_lossy().into_owned()],
    None => Vec::new(),
  };
  let has_node = tools::node_runtime_path().is_some();
  if !has_node {
    emit(progress, None, "Node.js not found — YouTube downloads may fail. Install Node 22+ and retry.");
  }
  // android_vr often hands out CDN URLs that 403 without PO tokens: web_embedded first,
  // then other clients, then the progressive 360p fall-back.
  let attempts = [
    Attempt {
      label: "web_embedded",
      format: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best",
      extra: client_args(&cookie_args, "web_embedded"),
      fresh: false,
      allow_format_18: false,
      min_bytes: 512 * 1024,
    },
    Attempt {
      label: "720p-avc",
      format: "bestvideo[height<=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=720]+bestaudio/best",
      extra: client_args(&cookie_args, "web_embedded,web"),
      fresh: false,
      allow_format_18: false,
      min_bytes: 512 * 1024,
    },
    Attempt {
      label: "web_embedded-fresh",
      format: "bestvideo[height<=720]+bestaudio/best",
      extra: client_args(&[], "web_embedded"),
      fresh: true,
      allow_format_18: false,
      min_bytes: 512 * 1024,
    },
    Attempt {
      label: "android-360p",
      format: "18/best[height<=360]/best",
      extra: client_args(&cookie_args, "android"),
      fresh: false,
      allow_format_18: true,
      min_bytes: 64 * 1024,
    },
    Attempt {
      label: "tv_simply-360p",
      format: "18/best[height<=360]/best",
      extra: client_args(&cookie_args, "tv_simply"),
      fresh: true,
      allow_format_18: true,
      min_bytes: 64 * 1024,
    },
  ];

  let mut last_error = String::from("unknown error");
  for (i, attempt) in attempts.iter().enumerate() {
    active.check()?;
    if i > 0 || attempt.fresh {
      // Drop partials so yt-dlp asks for fresh CDN URLs after a 403 / truncation.
      tools::delete_related_files(output);
    }
    emit(progress, None, &format!("Downloading ({})…", attempt.label));
    match run_yt_dlp(active, bin, url, output, progress, attempt, i == 0 && !attempt.fresh) {
      Ok(p) => return Ok(p),
      Err(DlError::Cancelled) => return Err(DlError::Cancelled),
      Err(DlError::Failed(msg)) => {
        let note = if is_transient(&msg) {
          format!("CDN blocked ({}), trying next…", attempt.label)
        } else {
          format!("Download failed ({}), trying next…", attempt.label)
        };
        emit(progress, None, &note);
        last_error = msg;
      }
    }
  }
  let hint = if has_node { "" } else { "\nTip: install Node.js 22+ so yt-dlp can solve YouTube signature challenges." };
  Err(DlError::Failed(format!("YouTube download failed for this link.\n{last_error}{hint}")))
}

/// After "stop and keep": turn whatever was fetched into a playable MP4 under the wanted name.
fn finalize_stopped(output: &Path) -> Option<(PathBuf, u64)> {
  std::thread::sleep(std::time::Duration::from_millis(350));
  let candidates: Vec<_> = tools::related_files(output).into_iter().filter(|(_, s)| *s >= 1024).collect();
  let (best, _) = candidates.first()?.clone();
  let (ok, path) = tools::remux_to_playable_mp4(&best, Some(output));
  if !ok {
    return None;
  }
  for (p, _) in tools::related_files(output) {
    if p != path {
      let _ = std::fs::remove_file(p);
    }
  }
  let size = file_size(&path);
  (size > 0).then_some((path, size))
}

/// Downloads `input` to `output`. Ok carries {path, engine, stopped?, partial?, size?, name?}.
pub fn download_youtube(input: &str, output: &Path, progress: Progress, cookies: Option<&Path>) -> Result<Value, DlError> {
  let url = normalize_watch_url(input).ok_or_else(|| DlError::Failed("유효한 YouTube 링크가 아닙니다.".into()))?;
  let active = Active::new(output);
  *ACTIVE_YOUTUBE.lock().unwrap() = Some(active.clone());
  let result = (|| {
    let bin = tools::find_yt_dlp().ok_or_else(|| DlError::Failed("yt-dlp is not available".into()))?;
    active.check()?;
    download_with_yt_dlp(&active, &bin, &url, output, &progress, cookies)
  })();
  *ACTIVE_YOUTUBE.lock().unwrap() = None;
  match result {
    Ok(path) => Ok(json!({ "path": path, "engine": "yt-dlp" })),
    Err(DlError::Cancelled) if active.keep_partial.load(Ordering::SeqCst) => {
      emit(&progress, None, "Finalizing saved portion…");
      match finalize_stopped(output) {
        Some((path, size)) => Ok(json!({
          "path": path,
          "engine": "yt-dlp",
          "stopped": true,
          "partial": true,
          "size": size,
          "name": path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        })),
        None => Err(DlError::Cancelled),
      }
    }
    Err(e) => Err(e),
  }
}

/// discard:true cancels and deletes partials; discard:false keeps what was fetched ("멈춤").
pub fn stop_youtube(discard: bool) -> Value {
  let Some(active) = ACTIVE_YOUTUBE.lock().unwrap().clone() else { return json!({ "ok": false }) };
  active.keep_partial.store(!discard, Ordering::SeqCst);
  active.cancelled.store(true, Ordering::SeqCst);
  active.kill();
  if discard {
    let out = active.output.clone();
    std::thread::spawn(move || {
      // taskkill returns before Windows releases the files.
      std::thread::sleep(std::time::Duration::from_millis(400));
      tools::delete_related_files(&out);
    });
  }
  json!({ "ok": true, "keepPartial": !discard })
}

// ── Other sites (Instagram, TikTok, …) ──────────────────────────

pub fn is_http_url(input: &str) -> bool {
  let s = input.trim();
  let lower = s.to_ascii_lowercase();
  let rest = if let Some(r) = lower.strip_prefix("https://") {
    r
  } else if let Some(r) = lower.strip_prefix("http://") {
    r
  } else {
    return false;
  };
  let host = rest.split(['/', '?', '#']).next().unwrap_or("");
  !host.is_empty() && !host.contains(char::is_whitespace)
}

pub fn detect_service(input: &str) -> &'static str {
  let s = input.to_ascii_lowercase();
  if s.contains("instagram.com") {
    "instagram"
  } else if s.contains("tiktok.com") {
    "tiktok"
  } else {
    "remote"
  }
}

pub fn service_label(service: &str) -> &'static str {
  match service {
    "instagram" => "Instagram",
    "tiktok" => "TikTok",
    _ => "Remote",
  }
}

/// Drops #fragment and tracking parameters so one clip maps to one cache entry.
pub fn normalize_remote_url(input: &str) -> String {
  let s = input.trim();
  let s = s.split('#').next().unwrap_or("");
  let (base, query) = match s.split_once('?') {
    Some((b, q)) => (b, Some(q)),
    None => (s, None),
  };
  const NOISE: [&str; 10] =
    ["utm_", "fbclid", "igsh", "igshid", "tt_from", "is_from_webapp", "sender_device", "share", "_r", "_t"];
  let kept: Vec<&str> = query
    .map(|q| {
      q.split('&')
        .filter(|kv| !kv.is_empty())
        .filter(|kv| {
          let key = kv.split('=').next().unwrap_or("").to_ascii_lowercase();
          !NOISE.iter().any(|n| key.starts_with(n))
        })
        .collect()
    })
    .unwrap_or_default();
  let mut base = base.to_string();
  let path_start = base.find("://").map(|i| i + 3).and_then(|i| base[i..].find('/').map(|j| i + j));
  if kept.is_empty() && base.ends_with('/') && path_start.is_some_and(|p| p + 1 < base.len()) {
    base.pop();
  }
  if kept.is_empty() {
    base
  } else {
    format!("{base}?{}", kept.join("&"))
  }
}

#[derive(Clone)]
pub struct CachedRemote {
  pub path: PathBuf,
  pub title: String,
  pub service: String,
}

fn remote_cache() -> &'static Mutex<HashMap<String, CachedRemote>> {
  static CACHE: OnceLock<Mutex<HashMap<String, CachedRemote>>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn usable(path: &Path) -> bool {
  file_size(path) > 1024
}

pub fn set_cached_remote(input: &str, path: &Path, title: &str, service: &str) {
  let key = normalize_remote_url(input);
  if key.is_empty() || !usable(path) {
    return;
  }
  let service = if service.is_empty() { detect_service(&key) } else { service };
  remote_cache().lock().unwrap().insert(
    key,
    CachedRemote { path: std::path::absolute(path).unwrap_or(path.to_path_buf()), title: title.into(), service: service.into() },
  );
}

/// A file already downloaded for this link (the caller's own copy first).
pub fn find_local_remote(input: &str, preferred: &str) -> Option<CachedRemote> {
  if !preferred.is_empty() && usable(Path::new(preferred)) {
    return Some(CachedRemote { path: PathBuf::from(preferred), title: String::new(), service: detect_service(input).into() });
  }
  let key = normalize_remote_url(input);
  let mut cache = remote_cache().lock().unwrap();
  let entry = cache.get(&key)?.clone();
  if !usable(&entry.path) {
    cache.remove(&key);
    return None;
  }
  Some(entry)
}

pub fn remote_info(input: &str) -> Result<Value, String> {
  let url = input.trim();
  if !is_http_url(url) {
    return Err("유효한 HTTP(S) 링크가 아닙니다.".into());
  }
  let bin = tools::find_yt_dlp().ok_or("yt-dlp is not available")?;
  let info = dump_json(&bin, url, &[])?;
  let service = detect_service(url);
  let id = text(&info, &["id"]);
  let title = text(&info, &["title"]);
  let ext = text(&info, &["ext"]);
  Ok(json!({
    "id": id,
    "url": url,
    "title": if !title.is_empty() { title } else if !id.is_empty() { id } else { url.to_string() },
    "duration": info.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0),
    "uploader": text(&info, &["uploader", "channel"]),
    "thumbnail": text(&info, &["thumbnail"]),
    "ext": if ext.is_empty() { "mp4".to_string() } else { ext },
    "service": service,
    "serviceLabel": service_label(service),
  }))
}

pub fn temp_output_path(temp_dir: &Path, input: &str, title: &str) -> PathBuf {
  let service = detect_service(input);
  let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
  let base = if title.is_empty() {
    tools::sanitize_filename(&format!("{}-{}", service_label(service), now.as_secs()))
  } else {
    tools::sanitize_filename(title)
  };
  let _ = std::fs::create_dir_all(temp_dir);
  temp_dir.join(format!("{base}-{}.mp4", now.as_millis()))
}

pub fn download_remote(input: &str, output: &Path, progress: Progress) -> Result<Value, DlError> {
  let url = input.trim().to_string();
  if !is_http_url(&url) {
    return Err(DlError::Failed("유효한 HTTP(S) 링크가 아닙니다.".into()));
  }
  let bin = tools::find_yt_dlp().ok_or_else(|| DlError::Failed("yt-dlp is not available".into()))?;
  let active = Active::new(output);
  *ACTIVE_REMOTE.lock().unwrap() = Some(active.clone());
  let result = (|| {
    let ffmpeg = tools::ffmpeg_path();
    let mut args: Vec<String> = vec![url.clone(), "--no-playlist".into(), "--no-warnings".into(), "--continue".into()];
    for a in ["--retries", "8", "--fragment-retries", "8", "--file-access-retries", "3", "--ffmpeg-location"] {
      args.push(a.into());
    }
    args.push(ffmpeg.to_string_lossy().into_owned());
    args.extend([
      "-o".into(),
      tools::out_template(output),
      "-f".into(),
      "bestvideo+bestaudio/best".into(),
      "--merge-output-format".into(),
      "mp4".into(),
      "--newline".into(),
      "--progress".into(),
    ]);
    let peak = Arc::new(Mutex::new(0f64));
    let on_line = {
      let progress = progress.clone();
      let peak = peak.clone();
      move |line: &str| {
        if let Some(pct) = tools::parse_percent(line) {
          let mut p = peak.lock().unwrap();
          *p = p.max(pct);
          emit(&progress, Some(*p), line);
        } else {
          let p = *peak.lock().unwrap();
          emit(&progress, (p > 0.0).then_some(p), line);
        }
      }
    };
    let run = tools::run_streaming(&bin, &args, |pid| *active.pid.lock().unwrap() = Some(pid), on_line);
    *active.pid.lock().unwrap() = None;
    active.check()?;
    let (ok, tail) = run?;
    if !ok {
      let t = tail.trim();
      return Err(DlError::Failed(if t.is_empty() { "yt-dlp failed".into() } else { t.to_string() }));
    }
    let saved = tools::resolve_output(output);
    if file_size(&saved) < 1024 {
      return Err(DlError::Failed("Download finished without a usable file".into()));
    }
    let service = detect_service(&url);
    set_cached_remote(&url, &saved, "", service);
    Ok(json!({
      "ok": true,
      "path": saved,
      "name": saved.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
      "size": file_size(&saved),
      "service": service,
    }))
  })();
  *ACTIVE_REMOTE.lock().unwrap() = None;
  result
}

pub fn stop_remote(discard: bool) -> Value {
  let Some(active) = ACTIVE_REMOTE.lock().unwrap().clone() else { return json!({ "ok": false }) };
  active.cancelled.store(true, Ordering::SeqCst);
  active.kill();
  if discard {
    let out = active.output.clone();
    std::thread::spawn(move || {
      std::thread::sleep(std::time::Duration::from_millis(400));
      tools::delete_related_files(&out);
    });
  }
  json!({ "ok": true })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn youtube_links() {
    let id = Some("jNQXAC9IVRw".to_string());
    assert_eq!(extract_video_id("https://www.youtube.com/watch?v=jNQXAC9IVRw"), id);
    assert_eq!(extract_video_id("youtube.com/watch?feature=x&v=jNQXAC9IVRw&t=3"), id);
    assert_eq!(extract_video_id("https://youtu.be/jNQXAC9IVRw?si=abc"), id);
    assert_eq!(extract_video_id("https://www.youtube.com/shorts/jNQXAC9IVRw"), id);
    assert_eq!(extract_video_id("https://www.youtube.com/embed/jNQXAC9IVRw"), id);
    assert_eq!(extract_video_id("https://www.youtube.com/live/jNQXAC9IVRw"), id);
    assert_eq!(extract_video_id("jNQXAC9IVRw"), id);
    assert_eq!(extract_video_id("https://www.instagram.com/reel/abc"), None);
    assert_eq!(extract_video_id("https://youtu.be/short"), None);
  }

  #[test]
  fn remote_links() {
    assert!(is_http_url("https://www.tiktok.com/@a/video/1"));
    assert!(!is_http_url("rtsp://cam/1"));
    assert!(!is_http_url("https://"));
    assert_eq!(detect_service("https://www.instagram.com/reel/x"), "instagram");
    assert_eq!(detect_service("https://vt.tiktok.com/x"), "tiktok");
    assert_eq!(
      normalize_remote_url("https://www.instagram.com/reel/abc/?igsh=zz&utm_source=x#top"),
      "https://www.instagram.com/reel/abc"
    );
    assert_eq!(normalize_remote_url("https://a.com/v?id=3&fbclid=9"), "https://a.com/v?id=3");
  }

  #[test]
  fn format_18_detection_line() {
    // The line yt-dlp prints when it settles on itag 18.
    assert!(mentions_format_18("[info] jNQXAC9IVRw: Downloading 1 format(s): 18"));
    assert!(!mentions_format_18("[info] jNQXAC9IVRw: Downloading 1 format(s): 395+140"));
    assert!(!mentions_format_18("[info] x: Downloading 1 format(s): 180"));
  }
}
