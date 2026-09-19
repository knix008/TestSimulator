use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const SUPPORTED_FORMATS: &[&str] = &["mp3", "m4a", "opus", "flac", "wav", "ogg", "aac"];
const SUPPORTED_QUALITIES: &[&str] = &["high", "medium", "low"];
const PROGRESS_EVENT: &str = "url-download-progress";

fn configure_hidden(command: &mut Command) -> &mut Command {
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());

    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

fn ytdlp_file_name() -> &'static str {
    if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    }
}

fn ffmpeg_file_name() -> &'static str {
    if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

fn which_on_path(file_name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(file_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_tool(app: &AppHandle, file_name: &str, folder: &str) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(folder).join(file_name));
        candidates.push(resource_dir.join(file_name));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(file_name));
            candidates.push(dir.join(folder).join(file_name));
        }
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join(folder)
            .join(file_name),
    );

    for candidate in candidates {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    which_on_path(file_name)
}

fn resolve_ytdlp(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_tool(app, ytdlp_file_name(), "yt-dlp").ok_or_else(|| {
        "yt-dlp를 찾을 수 없습니다. PATH에 yt-dlp를 설치하거나 앱과 함께 번들된 yt-dlp가 필요합니다."
            .to_string()
    })
}

fn resolve_ffmpeg(app: &AppHandle) -> Option<PathBuf> {
    resolve_tool(app, ffmpeg_file_name(), "ffmpeg")
}

fn normalize_format(format: &str) -> Result<String, String> {
    let normalized = format.trim().trim_start_matches('.').to_ascii_lowercase();
    if SUPPORTED_FORMATS.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!("지원하지 않는 형식입니다: {format}"))
    }
}

fn normalize_quality(quality: &str) -> Result<String, String> {
    let normalized = quality.trim().to_ascii_lowercase();
    if SUPPORTED_QUALITIES.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!("지원하지 않는 음질 설정입니다: {quality}"))
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn audio_quality_args(format: &str, quality: &str) -> Vec<&'static str> {
    match (format, quality) {
        ("flac" | "wav", _) | (_, "high") => vec!["--audio-quality", "0"],
        (_, "medium") => vec!["--audio-quality", "5"],
        _ => vec!["--audio-quality", "8"],
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgressPayload {
    phase: String,
    percent: Option<f64>,
    speed: Option<String>,
    eta: Option<String>,
}

fn emit_progress(
    app: &AppHandle,
    phase: &str,
    percent: Option<f64>,
    speed: Option<String>,
    eta: Option<String>,
) {
    let _ = app.emit(
        PROGRESS_EVENT,
        DownloadProgressPayload {
            phase: phase.to_string(),
            percent,
            speed,
            eta,
        },
    );
}

fn parse_percent_token(token: &str) -> Option<f64> {
    let trimmed = token.trim().trim_end_matches('%');
    trimmed.parse::<f64>().ok().filter(|value| (0.0..=100.0).contains(value))
}

/// Parse yt-dlp progress lines such as:
/// `[download]  45.2% of 3.45MiB at 1.23MiB/s ETA 00:02`
fn parse_download_progress(line: &str) -> Option<(f64, Option<String>, Option<String>)> {
    let marker = "[download]";
    let idx = line.find(marker)?;
    let rest = line[idx + marker.len()..].trim_start();
    let percent_end = rest.find('%')?;
    let percent = parse_percent_token(&rest[..=percent_end])?;

    let mut speed = None;
    let mut eta = None;

    if let Some(at_idx) = rest.find(" at ") {
        let after_at = &rest[at_idx + 4..];
        if let Some(eta_idx) = after_at.find(" ETA ") {
            speed = Some(after_at[..eta_idx].trim().to_string());
            eta = Some(after_at[eta_idx + 5..].trim().to_string());
        } else {
            let end = after_at.find(' ').unwrap_or(after_at.len());
            speed = Some(after_at[..end].trim().to_string());
        }
    } else if let Some(eta_idx) = rest.find(" ETA ") {
        eta = Some(rest[eta_idx + 5..].trim().to_string());
    }

    Some((percent, speed, eta))
}

fn is_converting_line(line: &str) -> bool {
    line.contains("[ExtractAudio]")
        || line.contains("[ffmpeg]")
        || line.contains("Destination:")
        || line.contains("Deleting original file")
}

fn command_error_text(stderr: &str, stdout: &str, fallback: &str) -> String {
    let stderr = stderr.trim();
    let stdout = stdout.trim();
    if !stderr.is_empty() {
        stderr.to_string()
    } else if !stdout.is_empty() {
        stdout.to_string()
    } else {
        fallback.to_string()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedAudio {
    pub output_path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
}

/// Async wrapper so the webview can process `url-download-progress` events
/// while yt-dlp runs (a sync command would hold the invoke until the end and
/// React would batch-clear the popup before it ever painted).
#[tauri::command]
pub async fn extract_audio_from_url(
    app: AppHandle,
    url: String,
    output_path: String,
    format: String,
    quality: String,
) -> Result<ExtractedAudio, String> {
    tauri::async_runtime::spawn_blocking(move || {
        extract_audio_from_url_blocking(app, url, output_path, format, quality)
    })
    .await
    .map_err(|error| format!("오디오 추출 작업 실패: {error}"))?
}

fn extract_audio_from_url_blocking(
    app: AppHandle,
    url: String,
    output_path: String,
    format: String,
    quality: String,
) -> Result<ExtractedAudio, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("URL이 비어 있습니다.".to_string());
    }

    let format = normalize_format(&format)?;
    let quality = normalize_quality(&quality)?;
    let ytdlp = resolve_ytdlp(&app)?;
    let output = PathBuf::from(&output_path);
    ensure_parent_dir(&output)?;

    let output_template = {
        let stem = output.with_extension("");
        format!("{}.%(ext)s", stem.display())
    };

    emit_progress(&app, "preparing", Some(0.0), None, None);

    let mut command = Command::new(&ytdlp);
    configure_hidden(
        command
            .arg("--no-playlist")
            .arg("--no-warnings")
            .arg("--newline")
            .arg("--progress")
            .arg("-x")
            .arg("--audio-format")
            .arg(&format)
            .args(audio_quality_args(&format, &quality))
            .arg("-o")
            .arg(&output_template)
            .arg("--embed-metadata")
            .arg("--embed-thumbnail")
            .arg("--convert-thumbnails")
            .arg("jpg")
            // FILE: path after post-processing; META: JSON with display fields.
            .arg("--print")
            .arg("after_move:FILE:%(filepath)s")
            .arg("--print")
            .arg("META:%(.{title,artist,uploader,creator,album,duration})j"),
    );

    if let Some(ffmpeg) = resolve_ffmpeg(&app) {
        if let Some(ffmpeg_dir) = ffmpeg.parent() {
            command.arg("--ffmpeg-location").arg(ffmpeg_dir);
        }
    }

    command.arg(&url);

    let mut child = command
        .spawn()
        .map_err(|error| format!("yt-dlp 실행 실패: {error}"))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "yt-dlp stderr를 열 수 없습니다.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "yt-dlp stdout을 열 수 없습니다.".to_string())?;

    let progress_app = app.clone();
    let stderr_thread = thread::spawn(move || {
        let mut stderr_buf = String::new();
        let reader = BufReader::new(stderr);
        let mut last_percent = -1.0_f64;

        for line in reader.lines().flatten() {
            stderr_buf.push_str(&line);
            stderr_buf.push('\n');

            if let Some((percent, speed, eta)) = parse_download_progress(&line) {
                if (percent - last_percent).abs() >= 0.5 || percent >= 100.0 {
                    last_percent = percent;
                    emit_progress(&progress_app, "downloading", Some(percent), speed, eta);
                }
            } else if is_converting_line(&line) {
                emit_progress(&progress_app, "converting", None, None, None);
            }
        }

        stderr_buf
    });

    let stdout_thread = thread::spawn(move || {
        let mut stdout_buf = String::new();
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            stdout_buf.push_str(&line);
            stdout_buf.push('\n');
        }
        stdout_buf
    });

    let status = child
        .wait()
        .map_err(|error| format!("yt-dlp 대기 실패: {error}"))?;
    let stderr_text = stderr_thread
        .join()
        .unwrap_or_else(|_| String::new());
    let stdout_text = stdout_thread
        .join()
        .unwrap_or_else(|_| String::new());

    if !status.success() {
        emit_progress(&app, "error", None, None, None);
        return Err(format!(
            "오디오 추출 실패: {}",
            command_error_text(&stderr_text, &stdout_text, &format!("exit {status}"))
        ));
    }

    emit_progress(&app, "finishing", Some(100.0), None, None);

    let lines: Vec<&str> = stdout_text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    let mut filepath: Option<String> = None;
    let mut meta_title: Option<String> = None;
    let mut meta_artist: Option<String> = None;
    let mut meta_album: Option<String> = None;
    let mut meta_duration: Option<f64> = None;

    for line in &lines {
        if let Some(path) = line.strip_prefix("FILE:") {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                filepath = Some(trimmed.to_string());
            }
            continue;
        }

        if let Some(json) = line.strip_prefix("META:") {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(json) {
                meta_title = value
                    .get("title")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                    .map(str::to_string);
                meta_artist = ["artist", "uploader", "creator"]
                    .iter()
                    .find_map(|key| {
                        value
                            .get(*key)
                            .and_then(|v| v.as_str())
                            .map(str::trim)
                            .filter(|v| !v.is_empty())
                            .map(str::to_string)
                    });
                meta_album = value
                    .get("album")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                    .map(str::to_string);
                meta_duration = value.get("duration").and_then(|v| {
                    v.as_f64()
                        .or_else(|| v.as_i64().map(|n| n as f64))
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                })
                .filter(|seconds| *seconds > 0.0);
            }
            continue;
        }

        // Fallback for older yt-dlp print lines without prefixes.
        let path = PathBuf::from(line);
        if filepath.is_none() && (path.is_file() || line.contains('\\') || line.contains('/')) {
            filepath = Some((*line).to_string());
        } else if meta_title.is_none() {
            meta_title = Some((*line).to_string());
        }
    }

    if filepath.is_none() {
        for line in lines.iter().rev() {
            let path = PathBuf::from(line);
            if path.is_file() {
                filepath = Some((*line).to_string());
                break;
            }
        }
    }

    let produced = filepath
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| {
            let candidate = output.with_extension(&format);
            candidate.is_file().then_some(candidate)
        })
        .ok_or_else(|| "추출된 오디오 파일을 찾을 수 없습니다.".to_string())?;

    if produced != output {
        if output.exists() {
            let _ = fs::remove_file(&output);
        }
        fs::rename(&produced, &output)
            .or_else(|_| {
                fs::copy(&produced, &output)
                    .map(|_| ())
                    .and_then(|_| fs::remove_file(&produced))
            })
            .map_err(|error| format!("결과 파일 저장 실패: {error}"))?;
    }

    if !output.is_file() {
        return Err("추출 결과 파일이 생성되지 않았습니다.".to_string());
    }

    let title = meta_title
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            output
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("extracted-audio")
                .to_string()
        });

    Ok(ExtractedAudio {
        output_path: output.display().to_string(),
        title,
        artist: meta_artist,
        album: meta_album,
        duration: meta_duration,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlMediaInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<f64>,
}

fn parse_media_info_json(value: &serde_json::Value) -> UrlMediaInfo {
    let title = value
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let artist = ["artist", "uploader", "creator", "channel"]
        .iter()
        .find_map(|key| {
            value
                .get(*key)
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        });
    let album = value
        .get("album")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let duration = value
        .get("duration")
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_i64().map(|n| n as f64))
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
        .filter(|seconds| *seconds > 0.0);

    UrlMediaInfo {
        title,
        artist,
        album,
        duration,
    }
}

/// Resolve display metadata for a URL without downloading the media body.
#[tauri::command]
pub async fn probe_url_media_info(app: AppHandle, url: String) -> Result<UrlMediaInfo, String> {
    tauri::async_runtime::spawn_blocking(move || probe_url_media_info_blocking(app, url))
        .await
        .map_err(|error| format!("미디어 정보 조회 실패: {error}"))?
}

fn probe_url_media_info_blocking(app: AppHandle, url: String) -> Result<UrlMediaInfo, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("URL이 비어 있습니다.".to_string());
    }

    let ytdlp = resolve_ytdlp(&app)?;
    let mut command = Command::new(&ytdlp);
    configure_hidden(
        command
            .arg("--skip-download")
            .arg("--no-playlist")
            .arg("--no-warnings")
            .arg("--print")
            .arg("%(.{title,artist,uploader,creator,channel,album,duration})j")
            .arg(&url),
    );

    let output = command
        .output()
        .map_err(|error| format!("yt-dlp 실행 실패: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(format!(
            "미디어 정보를 가져올 수 없습니다: {}",
            command_error_text(&stderr, &stdout, &format!("exit {}", output.status))
        ));
    }

    for line in stdout.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            let info = parse_media_info_json(&value);
            if info.title.is_some() || info.artist.is_some() || info.album.is_some() {
                return Ok(info);
            }
        }
    }

    Err("미디어 정보에서 제목·아티스트를 찾지 못했습니다.".to_string())
}
