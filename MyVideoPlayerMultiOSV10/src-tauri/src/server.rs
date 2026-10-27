//! The app's localhost HTTP server, as in the Electron build:
//!  • pages (src/, embedded in the binary) — over http://127.0.0.1 so the YouTube iframe API
//!    accepts the page origin, and so media stays same-origin for the spectrum analyser;
//!  • /__media/<key>/<token> — local files with Range (seek + decode);
//!  • /__rtsp/<key>/<id>     — the live RTSP → fMP4 bridge;
//!  • /__vp/<key>/persist    — the settings snapshot pages read synchronously at start.
//! <key> is a per-run secret so other local programs can't read files through the server.

use base64::Engine;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

pub type Assets = Arc<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync>;
pub type Snapshot = Arc<dyn Fn() -> String + Send + Sync>;

pub struct Server {
  pub port: u16,
  pub key: String,
}

static SERVER: OnceLock<Server> = OnceLock::new();

pub fn get() -> &'static Server {
  SERVER.get().expect("server started")
}

fn new_key() -> String {
  use std::hash::{BuildHasher, Hasher};
  let mut out = String::new();
  for i in 0..2u64 {
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u64(i);
    h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
    out.push_str(&format!("{:016x}", h.finish()));
  }
  out
}

pub fn start(assets: Assets, snapshot: Snapshot) -> std::io::Result<&'static Server> {
  let listener = TcpListener::bind(("127.0.0.1", 0))?;
  let port = listener.local_addr()?.port();
  let key = new_key();
  let _ = SERVER.set(Server { port, key: key.clone() });
  std::thread::spawn(move || {
    for stream in listener.incoming().flatten() {
      let assets = assets.clone();
      let snapshot = snapshot.clone();
      let key = key.clone();
      std::thread::spawn(move || handle(stream, &key, &assets, &snapshot));
    }
  });
  Ok(get())
}

pub fn origin() -> String {
  format!("http://127.0.0.1:{}", get().port)
}

pub fn page_url(page: &str) -> String {
  format!("{}/{page}", origin())
}

pub fn encode_token(path: &Path) -> String {
  base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(path.to_string_lossy().as_bytes())
}

pub fn decode_token(token: &str) -> Option<PathBuf> {
  let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(token.trim_end_matches('=')).ok()?;
  Some(PathBuf::from(String::from_utf8(bytes).ok()?))
}

pub fn media_url(path: &Path) -> String {
  let s = get();
  format!("http://127.0.0.1:{}/__media/{}/{}", s.port, s.key, encode_token(path))
}

pub fn rtsp_url(id: &str) -> String {
  let s = get();
  format!("http://127.0.0.1:{}/__rtsp/{}/{id}", s.port, s.key)
}

pub fn persist_path() -> String {
  format!("/__vp/{}/persist", get().key)
}

const MEDIA_MIME: [(&str, &str); 15] = [
  ("mp4", "video/mp4"),
  ("m4v", "video/mp4"),
  ("webm", "video/webm"),
  ("mkv", "video/x-matroska"),
  ("mov", "video/quicktime"),
  ("avi", "video/x-msvideo"),
  ("ogv", "video/ogg"),
  ("ogg", "audio/ogg"),
  ("mp3", "audio/mpeg"),
  ("aac", "audio/aac"),
  ("m4a", "audio/mp4"),
  ("wav", "audio/wav"),
  ("flac", "audio/flac"),
  ("opus", "audio/opus"),
  ("wma", "audio/x-ms-wma"),
];

fn media_mime(path: &Path) -> &'static str {
  let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
  MEDIA_MIME.iter().find(|(e, _)| *e == ext).map(|(_, m)| *m).unwrap_or("application/octet-stream")
}

pub enum Range {
  Whole,
  Part(u64, u64),
  Unsatisfiable,
}

pub fn parse_range(header: Option<&str>, size: u64) -> Range {
  let Some(spec) = header.and_then(|h| h.trim().strip_prefix("bytes=")) else { return Range::Whole };
  let spec = spec.split(',').next().unwrap_or("").trim();
  let Some((a, b)) = spec.split_once('-') else { return Range::Whole };
  if size == 0 {
    return Range::Unsatisfiable;
  }
  let (start, end) = if a.is_empty() {
    // bytes=-N: the last N bytes.
    let n: u64 = b.parse().unwrap_or(0);
    (size.saturating_sub(n), size - 1)
  } else {
    let start: u64 = a.parse().unwrap_or(0);
    let end: u64 = if b.is_empty() { size - 1 } else { b.parse().unwrap_or(size - 1).min(size - 1) };
    (start, end)
  };
  if start > end || start >= size {
    Range::Unsatisfiable
  } else {
    Range::Part(start, end)
  }
}

struct Request {
  method: String,
  path: String,
  range: Option<String>,
}

fn read_request(stream: &TcpStream) -> Option<Request> {
  let mut reader = BufReader::new(stream.try_clone().ok()?);
  let mut line = String::new();
  reader.read_line(&mut line).ok()?;
  let mut parts = line.split_whitespace();
  let method = parts.next()?.to_string();
  let target = parts.next()?.to_string();
  let mut range = None;
  loop {
    let mut h = String::new();
    if reader.read_line(&mut h).ok()? == 0 {
      break;
    }
    let h = h.trim_end();
    if h.is_empty() {
      break;
    }
    if let Some((name, value)) = h.split_once(':') {
      if name.trim().eq_ignore_ascii_case("range") {
        range = Some(value.trim().to_string());
      }
    }
  }
  let path = target.split(['?', '#']).next().unwrap_or("/").to_string();
  Some(Request { method, path, range })
}

fn respond(stream: &mut TcpStream, status: &str, headers: &[(&str, String)], body: &[u8], head_only: bool) {
  let mut head = format!("HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: {}\r\n", body.len());
  for (k, v) in headers {
    head.push_str(&format!("{k}: {v}\r\n"));
  }
  head.push_str("\r\n");
  let _ = stream.write_all(head.as_bytes());
  if !head_only {
    let _ = stream.write_all(body);
  }
}

fn percent_decode(s: &str) -> String {
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
  String::from_utf8_lossy(&out).into_owned()
}

fn handle(mut stream: TcpStream, key: &str, assets: &Assets, snapshot: &Snapshot) {
  let Some(req) = read_request(&stream) else { return };
  let head_only = req.method.eq_ignore_ascii_case("HEAD");
  let path = percent_decode(&req.path);

  let private = |prefix: &str| -> Option<String> {
    let rest = path.strip_prefix(prefix)?;
    let (k, tail) = rest.split_once('/')?;
    (k == key).then(|| tail.to_string())
  };

  if let Some(token) = private("/__media/") {
    match decode_token(&token) {
      Some(file) => serve_file(&mut stream, &file, req.range.as_deref(), head_only),
      None => respond(&mut stream, "400 Bad Request", &[], b"Bad media token", head_only),
    }
    return;
  }
  if let Some(id) = private("/__rtsp/") {
    crate::rtsp::serve(stream, &id, head_only);
    return;
  }
  if private("/__vp/").as_deref() == Some("persist") {
    let body = snapshot();
    respond(
      &mut stream,
      "200 OK",
      &[("Content-Type", "application/json; charset=utf-8".into()), ("Cache-Control", "no-store".into())],
      body.as_bytes(),
      head_only,
    );
    return;
  }
  if path.starts_with("/__") {
    respond(&mut stream, "403 Forbidden", &[], b"Forbidden", head_only);
    return;
  }

  let rel = if path == "/" { "index.html".to_string() } else { path.trim_start_matches('/').to_string() };
  if rel.split('/').any(|seg| seg == "..") {
    respond(&mut stream, "403 Forbidden", &[], b"Forbidden", head_only);
    return;
  }
  match assets(&rel) {
    Some((bytes, mime)) => respond(
      &mut stream,
      "200 OK",
      &[("Content-Type", mime), ("Cache-Control", "no-cache".into())],
      &bytes,
      head_only,
    ),
    None => respond(&mut stream, "404 Not Found", &[], b"Not found", head_only),
  }
}

fn serve_file(stream: &mut TcpStream, file: &Path, range: Option<&str>, head_only: bool) {
  let Ok(mut f) = std::fs::File::open(file) else {
    respond(stream, "404 Not Found", &[], b"Not found", head_only);
    return;
  };
  let size = f.metadata().map(|m| m.len()).unwrap_or(0);
  let mime = media_mime(file);
  let (status, start, len, extra) = match parse_range(range, size) {
    Range::Unsatisfiable => {
      respond(
        stream,
        "416 Range Not Satisfiable",
        &[("Content-Range", format!("bytes */{size}")), ("Accept-Ranges", "bytes".into())],
        b"",
        head_only,
      );
      return;
    }
    Range::Part(a, b) => ("206 Partial Content", a, b - a + 1, Some(format!("bytes {a}-{b}/{size}"))),
    Range::Whole => ("200 OK", 0, size, None),
  };
  let mut head = format!(
    "HTTP/1.1 {status}\r\nConnection: close\r\nAccept-Ranges: bytes\r\nContent-Type: {mime}\r\nCache-Control: no-cache\r\nContent-Length: {len}\r\n"
  );
  if let Some(cr) = extra {
    head.push_str(&format!("Content-Range: {cr}\r\n"));
  }
  head.push_str("\r\n");
  if stream.write_all(head.as_bytes()).is_err() || head_only {
    return;
  }
  if f.seek(SeekFrom::Start(start)).is_err() {
    return;
  }
  let _ = std::io::copy(&mut f.take(len), stream);
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ranges() {
    assert!(matches!(parse_range(None, 100), Range::Whole));
    assert!(matches!(parse_range(Some("bytes=0-"), 100), Range::Part(0, 99)));
    assert!(matches!(parse_range(Some("bytes=10-19"), 100), Range::Part(10, 19)));
    assert!(matches!(parse_range(Some("bytes=90-500"), 100), Range::Part(90, 99)));
    assert!(matches!(parse_range(Some("bytes=-10"), 100), Range::Part(90, 99)));
    assert!(matches!(parse_range(Some("bytes=100-"), 100), Range::Unsatisfiable));
  }

  #[test]
  fn tokens_round_trip_unicode_paths() {
    let p = PathBuf::from(r"C:\영상\it's a clip.mp4");
    assert_eq!(decode_token(&encode_token(&p)).unwrap(), p);
  }

  #[test]
  fn percent_decoding() {
    assert_eq!(percent_decode("/a%20b/%ED%95%9C.html"), "/a b/한.html");
    assert_eq!(percent_decode("/100%"), "/100%");
  }
}
