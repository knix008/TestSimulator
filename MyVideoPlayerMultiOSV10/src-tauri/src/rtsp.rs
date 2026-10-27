//! RTSP: live preview (ffmpeg → fragmented MP4 streamed over the local HTTP server) and
//! recording to a file. Port of electron/rtsp-stream.js.

use crate::download::Progress;
use crate::tools::{self, file_size};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub fn is_rtsp_url(input: &str) -> bool {
  let s = input.trim().to_ascii_lowercase();
  s.starts_with("rtsp://") || s.starts_with("rtsps://")
}

fn now_ms() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn format_elapsed(ms: u64) -> String {
  let total = ms / 1000;
  let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60);
  if h > 0 {
    format!("{h}:{m:02}:{s:02}")
  } else {
    format!("{m:02}:{s:02}")
  }
}

fn random_id() -> String {
  use std::hash::{BuildHasher, Hasher};
  let mut h = std::collections::hash_map::RandomState::new().build_hasher();
  h.write_u128(now_ms() as u128 ^ (std::process::id() as u128) << 64);
  format!("{:016x}", h.finish())
}

const FRAG: &str = "frag_keyframe+empty_moov+default_base_moof";

// ── Live preview ────────────────────────────────────────────────

struct Live {
  id: String,
  url: String,
  mode: Mutex<&'static str>,
  pid: Mutex<Option<u32>>,
  running: AtomicBool,
  clients: Mutex<Vec<TcpStream>>,
  started: Mutex<Instant>,
  bytes: AtomicU64,
}

static LIVE: Mutex<Option<Arc<Live>>> = Mutex::new(None);

fn live_args(url: &str, mode: &str) -> Vec<String> {
  let mut a: Vec<&str> = vec![
    "-hide_banner", "-loglevel", "warning", "-rtsp_transport", "tcp", "-fflags", "nobuffer", "-flags", "low_delay",
    "-i", url, "-map", "0:v:0", "-map", "0:a:0?",
  ];
  if mode == "transcode" {
    a.extend(["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-pix_fmt", "yuv420p"]);
  } else {
    a.extend(["-c:v", "copy"]);
  }
  a.extend(["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-f", "mp4", "-movflags", FRAG, "pipe:1"]);
  a.into_iter().map(String::from).collect()
}

fn close_clients(live: &Live) {
  for c in live.clients.lock().unwrap().drain(..) {
    let _ = c.shutdown(std::net::Shutdown::Both);
  }
}

fn is_current(live: &Arc<Live>) -> bool {
  LIVE.lock().unwrap().as_ref().is_some_and(|a| Arc::ptr_eq(a, live))
}

fn spawn_live(live: Arc<Live>) {
  if live.running.swap(true, Ordering::SeqCst) {
    return;
  }
  let mode = *live.mode.lock().unwrap();
  let child = tools::command(tools::ffmpeg_path())
    .args(live_args(&live.url, mode))
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn();
  let mut child = match child {
    Ok(c) => c,
    Err(_) => {
      live.running.store(false, Ordering::SeqCst);
      close_clients(&live);
      return;
    }
  };
  *live.pid.lock().unwrap() = Some(child.id());
  *live.started.lock().unwrap() = Instant::now();
  live.bytes.store(0, Ordering::SeqCst);
  let mut stdout = child.stdout.take().expect("stdout");
  std::thread::spawn(move || {
    let mut buf = vec![0u8; 64 * 1024];
    loop {
      let n = match stdout.read(&mut buf) {
        Ok(0) | Err(_) => break,
        Ok(n) => n,
      };
      if !is_current(&live) {
        break;
      }
      live.bytes.fetch_add(n as u64, Ordering::SeqCst);
      live.clients.lock().unwrap().retain_mut(|c| c.write_all(&buf[..n]).is_ok());
    }
    let _ = child.wait();
    *live.pid.lock().unwrap() = None;
    live.running.store(false, Ordering::SeqCst);
    if !is_current(&live) {
      return;
    }
    let early = live.bytes.load(Ordering::SeqCst) < 4096 && live.started.lock().unwrap().elapsed() < Duration::from_secs(8);
    let has_clients = !live.clients.lock().unwrap().is_empty();
    let mut mode = live.mode.lock().unwrap();
    if early && *mode == "copy" && has_clients {
      // The camera's codec can't be copied into MP4 — re-encode instead.
      *mode = "transcode";
      drop(mode);
      spawn_live(live);
      return;
    }
    drop(mode);
    close_clients(&live);
  });
}

pub fn open_stream(input: &str) -> Value {
  let url = input.trim().to_string();
  if !is_rtsp_url(&url) {
    return json!({ "ok": false, "error": "Invalid RTSP URL (expected rtsp:// or rtsps://)" });
  }
  stop_stream();
  let id = random_id();
  *LIVE.lock().unwrap() = Some(Arc::new(Live {
    id: id.clone(),
    url: url.clone(),
    mode: Mutex::new("copy"),
    pid: Mutex::new(None),
    running: AtomicBool::new(false),
    clients: Mutex::new(Vec::new()),
    started: Mutex::new(Instant::now()),
    bytes: AtomicU64::new(0),
  }));
  json!({ "ok": true, "id": id, "url": url, "name": url })
}

/// Stops the preview. A recording in progress keeps going.
pub fn stop_stream() -> Value {
  let Some(live) = LIVE.lock().unwrap().take() else { return json!({ "ok": true }) };
  if let Some(pid) = *live.pid.lock().unwrap() {
    tools::kill_tree(pid);
  }
  close_clients(&live);
  json!({ "ok": true })
}

pub fn active_stream() -> Value {
  match LIVE.lock().unwrap().as_ref() {
    Some(l) => json!({ "id": l.id, "url": l.url, "mode": *l.mode.lock().unwrap() }),
    None => Value::Null,
  }
}

/// Called by the HTTP server for GET /__rtsp/<id>: takes over the connection.
pub fn serve(mut stream: TcpStream, id: &str, head_only: bool) {
  let live = LIVE.lock().unwrap().clone().filter(|l| l.id == id);
  let Some(live) = live else {
    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 22\r\nConnection: close\r\n\r\nRTSP stream not found");
    return;
  };
  let head = "HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nCache-Control: no-store, no-cache, must-revalidate\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
  if stream.write_all(head.as_bytes()).is_err() || head_only {
    return;
  }
  let _ = stream.set_nodelay(true);
  live.clients.lock().unwrap().push(stream);
  spawn_live(live);
}

// ── Recording ───────────────────────────────────────────────────

struct Rec {
  url: String,
  output: PathBuf,
  mode: Mutex<&'static str>,
  started: Mutex<u64>,
  pid: Mutex<Option<u32>>,
  stdin: Mutex<Option<ChildStdin>>,
  exited: Mutex<Option<bool>>,
  exit_cv: Condvar,
  manual_stop: AtomicBool,
  stderr: Arc<Mutex<String>>,
  progress: Progress,
}

static REC: Mutex<Option<Arc<Rec>>> = Mutex::new(None);

fn rec_args(url: &str, output: &Path, mode: &str) -> Vec<String> {
  let mut a: Vec<String> = ["-y", "-hide_banner", "-loglevel", "warning", "-rtsp_transport", "tcp", "-i", url, "-map", "0:v:0", "-map", "0:a:0?"]
    .into_iter()
    .map(String::from)
    .collect();
  if mode == "transcode" {
    a.extend(["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"].map(String::from));
  } else {
    a.extend(["-c:v", "copy"].map(String::from));
  }
  // Fragmented MP4 stays playable after a clean stop ('q') and is safer for live capture.
  a.extend(["-c:a", "aac", "-b:a", "160k", "-ac", "2", "-f", "mp4", "-movflags", FRAG].map(String::from));
  a.push(output.to_string_lossy().into_owned());
  a
}

fn rec_is_current(rec: &Arc<Rec>) -> bool {
  REC.lock().unwrap().as_ref().is_some_and(|r| Arc::ptr_eq(r, rec))
}

fn elapsed_of(rec: &Rec) -> u64 {
  now_ms().saturating_sub(*rec.started.lock().unwrap())
}

fn emit_rec(rec: &Rec, phase: &str) {
  let ms = elapsed_of(rec);
  (rec.progress)(json!({
    "phase": phase,
    "url": rec.url,
    "path": rec.output,
    "elapsedMs": ms,
    "elapsed": format_elapsed(ms),
  }));
}

fn spawn_rec(rec: Arc<Rec>) -> bool {
  let mode = *rec.mode.lock().unwrap();
  let child = tools::command(tools::ffmpeg_path())
    .args(rec_args(&rec.url, &rec.output, mode))
    .stdin(Stdio::piped())
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .spawn();
  let mut child = match child {
    Ok(c) => c,
    Err(e) => {
      rec.stderr.lock().unwrap().push_str(&format!("\nffmpeg spawn error: {e}"));
      return false;
    }
  };
  *rec.exited.lock().unwrap() = None;
  *rec.pid.lock().unwrap() = Some(child.id());
  *rec.stdin.lock().unwrap() = child.stdin.take();
  let mut err = child.stderr.take().expect("stderr");
  let sink = rec.stderr.clone();
  std::thread::spawn(move || {
    let mut buf = [0u8; 4096];
    while let Ok(n) = err.read(&mut buf) {
      if n == 0 {
        break;
      }
      let mut s = sink.lock().unwrap();
      s.push_str(&String::from_utf8_lossy(&buf[..n]));
      if s.len() > 12000 {
        let cut = (s.len() - 12000..s.len()).find(|i| s.is_char_boundary(*i)).unwrap_or(0);
        s.drain(..cut);
      }
    }
  });
  std::thread::spawn(move || {
    let ok = child.wait().map(|s| s.success()).unwrap_or(false);
    *rec.pid.lock().unwrap() = None;
    *rec.exited.lock().unwrap() = Some(ok);
    rec.exit_cv.notify_all();
    // stop_record() owns completion when the user pressed Stop.
    if rec.manual_stop.load(Ordering::SeqCst) || !rec_is_current(&rec) {
      return;
    }
    let early = !ok && elapsed_of(&rec) < 8000 && file_size(&rec.output) < 4096;
    let mut mode = rec.mode.lock().unwrap();
    if early && *mode == "copy" {
      *mode = "transcode";
      drop(mode);
      let _ = std::fs::remove_file(&rec.output);
      *rec.started.lock().unwrap() = now_ms();
      if spawn_rec(rec.clone()) {
        return;
      }
    } else {
      drop(mode);
    }
    let ready = file_size(&rec.output) > 0;
    *REC.lock().unwrap() = None;
    let ms = elapsed_of(&rec);
    let stderr = rec.stderr.lock().unwrap().trim().to_string();
    (rec.progress)(json!({
      "phase": if ok || ready { "done" } else { "error" },
      "path": rec.output,
      "elapsedMs": ms,
      "elapsed": format_elapsed(ms),
      "error": if ok || ready { Value::Null } else { Value::String(if stderr.is_empty() { "ffmpeg failed".into() } else { stderr }) },
    }));
  });
  true
}

pub fn recording() -> Value {
  match REC.lock().unwrap().as_ref() {
    Some(r) => {
      let ms = elapsed_of(r);
      json!({
        "url": r.url,
        "outputPath": r.output,
        "startedAt": *r.started.lock().unwrap(),
        "elapsedMs": ms,
        "elapsed": format_elapsed(ms),
        "mode": *r.mode.lock().unwrap(),
      })
    }
    None => Value::Null,
  }
}

pub fn start_record(input: &str, output: &Path, progress: Progress) -> Value {
  let url = input.trim().to_string();
  if !is_rtsp_url(&url) {
    return json!({ "ok": false, "error": "Invalid RTSP URL (expected rtsp:// or rtsps://)" });
  }
  if REC.lock().unwrap().is_some() {
    return json!({ "ok": false, "error": "RTSP recording is already in progress", "recording": recording() });
  }
  if let Some(dir) = output.parent() {
    let _ = std::fs::create_dir_all(dir);
  }
  let rec = Arc::new(Rec {
    url: url.clone(),
    output: output.to_path_buf(),
    mode: Mutex::new("copy"),
    started: Mutex::new(now_ms()),
    pid: Mutex::new(None),
    stdin: Mutex::new(None),
    exited: Mutex::new(None),
    exit_cv: Condvar::new(),
    manual_stop: AtomicBool::new(false),
    stderr: Arc::new(Mutex::new(String::new())),
    progress,
  });
  *REC.lock().unwrap() = Some(rec.clone());
  if !spawn_rec(rec.clone()) {
    *REC.lock().unwrap() = None;
    return json!({ "ok": false, "error": rec.stderr.lock().unwrap().trim().to_string() });
  }
  emit_rec(&rec, "started");
  let ticker = rec.clone();
  std::thread::spawn(move || loop {
    std::thread::sleep(Duration::from_secs(1));
    if !rec_is_current(&ticker) || ticker.manual_stop.load(Ordering::SeqCst) {
      break;
    }
    emit_rec(&ticker, "recording");
  });
  json!({ "ok": true, "url": url, "path": output, "startedAt": *rec.started.lock().unwrap() })
}

/// Stops recording: 'q' lets ffmpeg finish the MP4, then it is remuxed to a progressive
/// file. discard:true kills ffmpeg and deletes the file instead. Blocks until done.
pub fn stop_record(discard: bool) -> Value {
  let Some(rec) = REC.lock().unwrap().clone() else {
    return json!({ "ok": false, "error": "No RTSP recording in progress" });
  };
  rec.manual_stop.store(true, Ordering::SeqCst);
  let pid = *rec.pid.lock().unwrap();
  emit_rec(&rec, if discard { "cancelled" } else { "stopping" });
  if discard {
    if let Some(pid) = pid {
      tools::kill_tree(pid);
    }
  } else {
    let wrote = rec.stdin.lock().unwrap().take().map(|mut s| s.write_all(b"q").is_ok()).unwrap_or(false);
    if !wrote {
      if let Some(pid) = pid {
        tools::kill_tree(pid);
      }
    }
  }
  let mut exited = rec.exited.lock().unwrap();
  let deadline = Instant::now() + Duration::from_secs(12);
  while exited.is_none() && pid.is_some() {
    let left = deadline.saturating_duration_since(Instant::now());
    if left.is_zero() {
      if let Some(pid) = pid {
        tools::kill_tree(pid);
      }
      break;
    }
    exited = rec.exit_cv.wait_timeout(exited, left).unwrap().0;
  }
  let code_ok = exited.unwrap_or(false);
  drop(exited);
  *REC.lock().unwrap() = None;
  let ms = elapsed_of(&rec);
  if discard {
    std::thread::sleep(Duration::from_millis(300));
    let _ = std::fs::remove_file(&rec.output);
    return json!({ "ok": true, "cancelled": true, "elapsedMs": ms, "elapsed": format_elapsed(ms) });
  }
  let ready = file_size(&rec.output) > 0;
  if !(ready || code_ok) {
    let stderr = rec.stderr.lock().unwrap().trim().to_string();
    return json!({
      "ok": false,
      "path": rec.output,
      "elapsedMs": ms,
      "elapsed": format_elapsed(ms),
      "error": if stderr.is_empty() { "Recording stop timed out".to_string() } else { stderr },
    });
  }
  // Finalize into a progressive MP4 so the player can open it straight away.
  let (_, path) = tools::remux_to_playable_mp4(&rec.output, None);
  json!({
    "ok": true,
    "path": path,
    "elapsedMs": ms,
    "elapsed": format_elapsed(ms),
    "size": file_size(&path),
    "name": path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
  })
}

/// App exit: end the preview and finish a recording cleanly.
pub fn shutdown() {
  if REC.lock().unwrap().is_some() {
    let _ = stop_record(false);
  }
  stop_stream();
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn elapsed_text() {
    assert_eq!(format_elapsed(0), "00:00");
    assert_eq!(format_elapsed(65_000), "01:05");
    assert_eq!(format_elapsed(3_725_000), "1:02:05");
  }

  #[test]
  fn rtsp_links() {
    assert!(is_rtsp_url(" rtsp://cam/1"));
    assert!(is_rtsp_url("RTSPS://cam"));
    assert!(!is_rtsp_url("https://cam"));
  }
}
