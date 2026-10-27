//! Finding the bundled helper programs (yt-dlp, ffmpeg, a Node runtime for yt-dlp's
//! signature solver) and running them without console windows.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::OnceLock;

/// Set once in setup: the bundle's resource folder (installed builds) or None (cargo runs).
static RESOURCE_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
static YT_DLP: OnceLock<Option<PathBuf>> = OnceLock::new();

pub fn init_resource_dir(dir: Option<PathBuf>) {
  let _ = RESOURCE_DIR.set(dir);
}

/// The project folder in cargo / `tauri dev` runs (vendor/ lives there).
fn project_dir() -> PathBuf {
  Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn exe_name(base: &str) -> String {
  if cfg!(windows) {
    format!("{base}.exe")
  } else {
    base.to_string()
  }
}

/// resources/<folder>/<name>, then vendor/<folder>/<name>, then the bare name (PATH).
fn bundled_candidates(folder: &str, name: &str) -> Vec<PathBuf> {
  let mut list = Vec::new();
  if let Some(Some(dir)) = RESOURCE_DIR.get() {
    list.push(dir.join(folder).join(name));
  }
  if cfg!(debug_assertions) {
    list.push(project_dir().join("vendor").join(folder).join(name));
  }
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      list.push(dir.join(folder).join(name));
    }
  }
  list
}

pub fn command(program: impl AsRef<std::ffi::OsStr>) -> Command {
  let mut cmd = Command::new(program);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }
  cmd
}

/// Ends a child and everything it started (yt-dlp runs ffmpeg).
pub fn kill_tree(pid: u32) {
  #[cfg(windows)]
  {
    let _ = command("taskkill")
      .args(["/pid", &pid.to_string(), "/f", "/t"])
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
  }
  #[cfg(not(windows))]
  {
    let _ = Command::new("kill")
      .args(["-TERM", &pid.to_string()])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
  }
}

pub fn ffmpeg_path() -> PathBuf {
  let name = exe_name("ffmpeg");
  bundled_candidates("ffmpeg", &name)
    .into_iter()
    .find(|p| p.is_file())
    .unwrap_or_else(|| PathBuf::from(name))
}

fn runs_ok(program: &Path) -> bool {
  command(program)
    .arg("--version")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .map(|s| s.success())
    .unwrap_or(false)
}

/// The first yt-dlp that answers `--version` (bundled copy first). Remembered once found.
pub fn find_yt_dlp() -> Option<PathBuf> {
  if let Some(found) = YT_DLP.get() {
    return found.clone();
  }
  let name = exe_name("yt-dlp");
  let mut list = bundled_candidates("yt-dlp", &name);
  list.push(PathBuf::from(&name));
  if cfg!(windows) {
    list.push(PathBuf::from("yt-dlp"));
  }
  let found = list
    .into_iter()
    .filter(|p| !p.is_absolute() || p.is_file())
    .find(|p| runs_ok(p));
  if found.is_some() {
    let _ = YT_DLP.set(found.clone());
  }
  found
}

/// A real Node install for yt-dlp's YouTube signature challenges.
pub fn node_runtime_path() -> Option<String> {
  let mut list: Vec<PathBuf> = Vec::new();
  if let Ok(v) = std::env::var("MYVIDEOPLAYER_NODE") {
    if !v.is_empty() {
      list.push(PathBuf::from(v));
    }
  }
  if cfg!(windows) {
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
    let pf86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".into());
    list.push(Path::new(&pf).join("nodejs").join("node.exe"));
    list.push(Path::new(&pf86).join("nodejs").join("node.exe"));
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
      list.push(Path::new(&local).join("Programs").join("nodejs").join("node.exe"));
    }
  } else {
    for p in ["/usr/local/bin/node", "/usr/bin/node", "/opt/homebrew/bin/node"] {
      list.push(PathBuf::from(p));
    }
  }
  if let Some(found) = list.into_iter().find(|p| p.is_file()) {
    return Some(found.to_string_lossy().into_owned());
  }
  // Bare `node` relies on PATH at spawn time.
  let on_path = command("node")
    .arg("--version")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .map(|s| s.success())
    .unwrap_or(false);
  on_path.then(|| "node".to_string())
}

/// Args yt-dlp needs for current YouTube nsig / signature challenges.
pub fn yt_dlp_js_runtime_args() -> Vec<String> {
  let Some(node) = node_runtime_path() else { return Vec::new() };
  let runtime = if node == "node" { node } else { format!("node:{node}") };
  vec!["--js-runtimes".into(), runtime, "--remote-components".into(), "ejs:github".into()]
}

/// Runs to completion, returning (stdout, stderr); Err carries stderr / stdout text.
pub fn run_capture(program: &Path, args: &[String]) -> Result<String, String> {
  let out = command(program)
    .args(args)
    .stdin(Stdio::null())
    .output()
    .map_err(|e| format!("{}: {e}", program.display()))?;
  let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
  if out.status.success() {
    return Ok(stdout);
  }
  let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
  Err(if !stderr.is_empty() {
    stderr
  } else if !stdout.trim().is_empty() {
    stdout.trim().to_string()
  } else {
    format!("{} exited with {}", program.display(), out.status)
  })
}

/// Spawns with piped stdout/stderr, feeding every output line (split on \r and \n) to
/// `on_line`, and waits. `on_spawn` receives the pid so the caller can cancel.
/// Returns (success, collected stderr+stdout tail).
pub fn run_streaming(
  program: &Path,
  args: &[String],
  on_spawn: impl FnOnce(u32),
  on_line: impl Fn(&str) + Send + Sync + 'static,
) -> Result<(bool, String), String> {
  let mut child: Child = command(program)
    .args(args)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| format!("{}: {e}", program.display()))?;
  on_spawn(child.id());
  let on_line = std::sync::Arc::new(on_line);
  let tail = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
  let mut readers = Vec::new();
  let streams: Vec<Box<dyn Read + Send>> = vec![
    Box::new(child.stdout.take().expect("stdout")),
    Box::new(child.stderr.take().expect("stderr")),
  ];
  for mut stream in streams {
    let on_line = on_line.clone();
    let tail = tail.clone();
    readers.push(std::thread::spawn(move || {
      let mut buf = [0u8; 8192];
      let mut pending: Vec<u8> = Vec::new();
      let flush = |line: &[u8]| {
        let text = String::from_utf8_lossy(line);
        let text = text.trim();
        if text.is_empty() {
          return;
        }
        on_line(text);
        let mut t = tail.lock().unwrap();
        t.push_str(text);
        t.push('\n');
        if t.len() > 16000 {
          let cut = t.len() - 12000;
          let cut = (cut..t.len()).find(|i| t.is_char_boundary(*i)).unwrap_or(0);
          t.drain(..cut);
        }
      };
      loop {
        let n = match stream.read(&mut buf) {
          Ok(0) | Err(_) => break,
          Ok(n) => n,
        };
        for &b in &buf[..n] {
          if b == b'\n' || b == b'\r' {
            flush(&pending);
            pending.clear();
          } else {
            pending.push(b);
          }
        }
      }
      flush(&pending);
    }));
  }
  let status = child.wait().map_err(|e| e.to_string())?;
  for r in readers {
    let _ = r.join();
  }
  let text = tail.lock().unwrap().clone();
  Ok((status.success(), text))
}

pub fn sanitize_filename(name: &str) -> String {
  let cleaned: String = name
    .chars()
    .map(|c| if "<>:\"/\\|?*".contains(c) || (c as u32) < 0x20 { '_' } else { c })
    .collect();
  let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
  let cut: String = collapsed.chars().take(180).collect();
  let cut = cut.trim().to_string();
  if cut.is_empty() {
    "youtube-video".into()
  } else {
    cut
  }
}

pub fn file_size(path: &Path) -> u64 {
  std::fs::metadata(path).map(|m| if m.is_file() { m.len() } else { 0 }).unwrap_or(0)
}

/// `out.mp4` plus yt-dlp's siblings (`out.f137.mp4`, `out.mp4.part`, `out.webm`, …), largest first.
pub fn related_files(output: &Path) -> Vec<(PathBuf, u64)> {
  let Some(dir) = output.parent() else { return Vec::new() };
  let file_name = output.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
  let stem = output.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
  let prefix = format!("{stem}.");
  let mut out = Vec::new();
  if let Ok(entries) = std::fs::read_dir(dir) {
    for e in entries.flatten() {
      let name = e.file_name().to_string_lossy().into_owned();
      if name == file_name || name.starts_with(&prefix) {
        let size = file_size(&e.path());
        if size > 0 {
          out.push((e.path(), size));
        }
      }
    }
  }
  out.sort_by(|a, b| b.1.cmp(&a.1));
  out
}

pub fn delete_related_files(output: &Path) {
  for (p, _) in related_files(output) {
    let _ = std::fs::remove_file(p);
  }
}

/// The finished file yt-dlp wrote for `out.mp4` (it may pick another extension).
pub fn resolve_output(output: &Path) -> PathBuf {
  if file_size(output) > 0 {
    return output.to_path_buf();
  }
  related_files(output)
    .into_iter()
    .find(|(p, _)| {
      let n = p.to_string_lossy();
      !n.ends_with(".part") && !n.ends_with(".ytdl")
    })
    .map(|(p, _)| p)
    .unwrap_or_else(|| output.to_path_buf())
}

/// yt-dlp's `-o` template for a wanted `x.mp4`: `x.%(ext)s`.
pub fn out_template(output: &Path) -> String {
  let s = output.to_string_lossy();
  let base = if s.to_lowercase().ends_with(".mp4") { &s[..s.len() - 4] } else { &s[..] };
  format!("{base}.%(ext)s")
}

/// Last `NN.N%` on a progress line.
pub fn parse_percent(line: &str) -> Option<f64> {
  let idx = line.find('%')?;
  let head = &line[..idx];
  let start = head
    .char_indices()
    .rev()
    .take_while(|(_, c)| c.is_ascii_digit() || *c == '.')
    .last()
    .map(|(i, _)| i)?;
  head[start..].parse::<f64>().ok().filter(|v| v.is_finite())
}

/// Remux into a progressive MP4 (moov first) with stream copy. `preferred` = wanted output.
pub fn remux_to_playable_mp4(input: &Path, preferred: Option<&Path>) -> (bool, PathBuf) {
  let output = preferred.unwrap_or(input).to_path_buf();
  if file_size(input) < 1024 {
    return (false, output);
  }
  let tmp = if output == input {
    PathBuf::from(format!("{}.playable.mp4", output.display()))
  } else {
    PathBuf::from(format!("{}.tmp.mp4", output.display()))
  };
  let ok = command(ffmpeg_path())
    .args(["-y", "-hide_banner", "-loglevel", "error", "-err_detect", "ignore_err", "-i"])
    .arg(input)
    .args(["-c", "copy", "-movflags", "+faststart"])
    .arg(&tmp)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .map(|s| s.success())
    .unwrap_or(false);
  if ok && file_size(&tmp) > 0 {
    if output.exists() && output != tmp {
      let _ = std::fs::remove_file(&output);
    }
    if std::fs::rename(&tmp, &output).is_ok() {
      if input != output {
        let _ = std::fs::remove_file(input);
      }
      return (true, output);
    }
  }
  let _ = std::fs::remove_file(&tmp);
  // Remux failed: keep the raw file under the wanted name.
  if input != output && std::fs::copy(input, &output).is_ok() {
    return (file_size(&output) > 0, output);
  }
  (file_size(input) > 0, input.to_path_buf())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitizes_like_the_electron_build() {
    assert_eq!(sanitize_filename("a/b:c?  d"), "a_b_c_ d");
    assert_eq!(sanitize_filename("   "), "youtube-video");
    assert_eq!(sanitize_filename(&"x".repeat(300)).len(), 180);
  }

  #[test]
  fn reads_progress_percent() {
    assert_eq!(parse_percent("[download]  42.0% of 302.04KiB"), Some(42.0));
    assert_eq!(parse_percent("[download] 100% of 1MiB"), Some(100.0));
    assert_eq!(parse_percent("no number"), None);
  }

  #[test]
  fn output_template_drops_mp4() {
    assert_eq!(out_template(Path::new("C:/v/clip.mp4")), "C:/v/clip.%(ext)s");
    assert_eq!(out_template(Path::new("C:/v/clip")), "C:/v/clip.%(ext)s");
  }

  #[test]
  fn finds_yt_dlp_siblings() {
    let dir = tempfile::tempdir().unwrap();
    let out = dir.path().join("clip.mp4");
    std::fs::write(dir.path().join("clip.f137.mp4"), vec![0u8; 50]).unwrap();
    std::fs::write(dir.path().join("clip.webm"), vec![0u8; 80]).unwrap();
    std::fs::write(dir.path().join("other.mp4"), vec![0u8; 90]).unwrap();
    let found = related_files(&out);
    assert_eq!(found.len(), 2);
    assert!(found[0].0.ends_with("clip.webm"));
    assert!(resolve_output(&out).ends_with("clip.webm"));
  }
}
