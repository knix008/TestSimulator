use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const SUPPORTED_FORMATS: &[&str] = &["mp3", "m4a", "opus", "flac", "wav", "ogg", "aac"];
const SUPPORTED_QUALITIES: &[&str] = &["high", "medium", "low"];

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
    // yt-dlp --audio-quality: 0 = best, 10 = worst.
    // Lossless targets always use best; lossy maps high/medium/low to 0/5/8.
    match (format, quality) {
        ("flac" | "wav", _) | (_, "high") => vec!["--audio-quality", "0"],
        (_, "medium") => vec!["--audio-quality", "5"],
        _ => vec!["--audio-quality", "8"],
    }
}

fn run_command(command: &mut Command, tool_label: &str) -> Result<std::process::Output, String> {
    command
        .spawn()
        .and_then(|child| child.wait_with_output())
        .map_err(|error| format!("{tool_label} 실행 실패: {error}"))
}

fn command_error(output: &std::process::Output, fallback: &str) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        fallback.to_string()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedAudio {
    pub output_path: String,
    pub title: String,
}

#[tauri::command]
pub fn extract_audio_from_url(
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

    // yt-dlp writes with extension; force exact output path stem + format ext.
    let output_template = {
        let stem = output.with_extension("");
        format!("{}.%(ext)s", stem.display())
    };

    let mut command = Command::new(&ytdlp);
    configure_hidden(
        command
            .arg("--no-playlist")
            .arg("--no-warnings")
            .arg("-x")
            .arg("--audio-format")
            .arg(&format)
            .args(audio_quality_args(&format, &quality))
            .arg("-o")
            .arg(&output_template)
            .arg("--print")
            .arg("after_move:filepath")
            .arg("--print")
            .arg("title"),
    );

    if let Some(ffmpeg) = resolve_ffmpeg(&app) {
        if let Some(ffmpeg_dir) = ffmpeg.parent() {
            command.arg("--ffmpeg-location").arg(ffmpeg_dir);
        }
    }

    command.arg(&url);

    let result = run_command(&mut command, "yt-dlp")?;
    if !result.status.success() {
        return Err(format!(
            "오디오 추출 실패: {}",
            command_error(&result, &format!("exit {}", result.status))
        ));
    }

    let stdout = String::from_utf8_lossy(&result.stdout);
    let lines: Vec<&str> = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    let mut filepath = lines
        .iter()
        .find(|line| {
            let path = PathBuf::from(line);
            path.is_file() || line.contains('\\') || line.contains('/')
        })
        .map(|line| (*line).to_string());

    let title = lines
        .iter()
        .rev()
        .find(|line| filepath.as_deref() != Some(*line))
        .map(|line| (*line).to_string());

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

    // Normalize to the user-chosen output path when extensions match / differ only by rename.
    if produced != output {
        if output.exists() {
            let _ = fs::remove_file(&output);
        }
        fs::rename(&produced, &output).or_else(|_| {
            fs::copy(&produced, &output).map(|_| ()).and_then(|_| fs::remove_file(&produced))
        }).map_err(|error| format!("결과 파일 저장 실패: {error}"))?;
    }

    if !output.is_file() {
        return Err("추출 결과 파일이 생성되지 않았습니다.".to_string());
    }

    let title = title
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
    })
}
