//! Rebuilds a file WebView2 can't play as a Chromium-friendly MP4 (port of electron/media-compat.js).

use crate::tools::{self, file_size};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;

fn cache_key(path: &Path) -> String {
  let meta = std::fs::metadata(path).ok();
  let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
  let mtime = meta
    .and_then(|m| m.modified().ok())
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_millis())
    .unwrap_or(0);
  sha1_smol::Sha1::from(format!("{}|{size}|{mtime}", path.display())).digest().to_string()
}

fn run_ffmpeg(args: &[&str], input: &Path, output: &Path) -> Result<(), String> {
  let out = tools::command(tools::ffmpeg_path())
    .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
    .arg(input)
    .args(args)
    .arg(output)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .output()
    .map_err(|e| format!("ffmpeg 실행 실패: {e}"))?;
  if out.status.success() {
    return Ok(());
  }
  let stderr = String::from_utf8_lossy(&out.stderr);
  let tail: String = stderr.chars().rev().take(8000).collect::<Vec<_>>().into_iter().rev().collect();
  Err(format!("ffmpeg exit {}\n{}", out.status.code().unwrap_or(-1), tail.trim()))
}

const AUDIO: [&str; 8] = ["-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "44100"];
const TAIL: [&str; 3] = ["-movflags", "+faststart", "-sn"];

fn args_for(video: &[&'static str]) -> Vec<&'static str> {
  let mut v = vec!["-map", "0:v:0?", "-map", "0:a:0?"];
  v.extend_from_slice(video);
  v.extend_from_slice(&AUDIO);
  v.extend_from_slice(&TAIL);
  v
}

const FULL_VIDEO: [&str; 8] = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p"];

/// mode "soft" keeps the video stream and re-encodes audio (falls back to full);
/// "full" (or force) re-encodes both. Results are cached under `cache_dir`.
pub fn make_compatible(source: &Path, cache_dir: &Path, mode: &str, force: bool, progress: impl Fn(Value)) -> Value {
  let source = std::path::absolute(source).unwrap_or(source.to_path_buf());
  if !source.is_file() {
    return json!({ "ok": false, "error": "원본 파일을 찾을 수 없습니다." });
  }
  let full = mode == "full" || force;
  let mode = if full { "full" } else { "soft" };
  let _ = std::fs::create_dir_all(cache_dir);
  let key = cache_key(&source);
  let out: PathBuf = cache_dir.join(if full { format!("{key}.h264.mp4") } else { format!("{key}.mp4") });

  if !force && file_size(&out) > 0 {
    progress(json!({ "phase": "cached", "message": "변환 캐시 사용" }));
    return json!({ "ok": true, "path": out, "cached": true, "mode": mode });
  }
  if force {
    let _ = std::fs::remove_file(&out);
  }
  let tmp = PathBuf::from(format!("{}.partial.mp4", out.display()));
  let _ = std::fs::remove_file(&tmp);

  let finish = |mode: &str| match std::fs::rename(&tmp, &out) {
    Ok(()) => json!({ "ok": true, "path": out, "cached": false, "mode": mode }),
    Err(e) => {
      let _ = std::fs::remove_file(&tmp);
      json!({ "ok": false, "error": format!("변환 결과 저장 실패: {e}") })
    }
  };
  let reencode = || {
    progress(json!({ "phase": "reencode", "message": "전체 재인코딩 중… (시간이 걸릴 수 있습니다)" }));
    run_ffmpeg(&args_for(&FULL_VIDEO), &source, &tmp)
  };

  if full {
    return match reencode() {
      Ok(()) => finish("full"),
      Err(e) => {
        let _ = std::fs::remove_file(&tmp);
        json!({ "ok": false, "error": format!("호환 변환 실패\n{e}") })
      }
    };
  }

  progress(json!({ "phase": "transcode", "message": "브라우저 호환 형식으로 변환 중…" }));
  if run_ffmpeg(&args_for(&["-c:v", "copy"]), &source, &tmp).is_ok() {
    return finish("soft");
  }
  match reencode() {
    Ok(()) => finish("full"),
    Err(e) => {
      let _ = std::fs::remove_file(&tmp);
      json!({ "ok": false, "error": format!("호환 변환 실패\n{e}") })
    }
  }
}
