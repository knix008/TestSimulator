use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Hide the console window that Windows creates for console-subsystem tools like ffmpeg.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const SUPPORTED_FORMATS: &[&str] = &["wav", "mp3", "flac", "ogg", "m4a", "aac"];

fn configure_hidden(command: &mut Command) -> &mut Command {
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());

    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

fn resolve_ffmpeg(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("ffmpeg").join(ffmpeg_file_name()));
        candidates.push(resource_dir.join(ffmpeg_file_name()));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(ffmpeg_file_name()));
            candidates.push(dir.join("ffmpeg").join(ffmpeg_file_name()));
        }
    }

    // Dev-time: repo copy next to the crate.
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("ffmpeg")
            .join(ffmpeg_file_name()),
    );

    for candidate in candidates {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    which_ffmpeg().ok_or_else(|| {
        "ffmpeg를 찾을 수 없습니다. PATH에 ffmpeg를 설치하거나 앱과 함께 번들된 ffmpeg가 필요합니다."
            .to_string()
    })
}

fn ffmpeg_file_name() -> &'static str {
    if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

/// Search PATH without spawning `where`/`which` (those can flash a console on Windows).
fn which_ffmpeg() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;

    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(ffmpeg_file_name());
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn codec_args(format: &str, quality: &str) -> Result<Vec<&'static str>, String> {
    let quality = match quality {
        "medium" | "low" | "high" => quality,
        _ => "high",
    };

    Ok(match (format, quality) {
        ("wav", _) => vec!["-c:a", "pcm_s24le"],
        ("flac", _) => vec!["-c:a", "flac", "-compression_level", "8"],
        ("mp3", "high") => vec!["-c:a", "libmp3lame", "-b:a", "320k"],
        ("mp3", "medium") => vec!["-c:a", "libmp3lame", "-b:a", "192k"],
        ("mp3", "low") => vec!["-c:a", "libmp3lame", "-b:a", "128k"],
        ("ogg", "high") => vec!["-c:a", "libvorbis", "-q:a", "8"],
        ("ogg", "medium") => vec!["-c:a", "libvorbis", "-q:a", "5"],
        ("ogg", "low") => vec!["-c:a", "libvorbis", "-q:a", "3"],
        ("m4a" | "aac", "high") => vec!["-c:a", "aac", "-b:a", "256k"],
        ("m4a" | "aac", "medium") => vec!["-c:a", "aac", "-b:a", "160k"],
        ("m4a" | "aac", "low") => vec!["-c:a", "aac", "-b:a", "96k"],
        _ => return Err(format!("지원하지 않는 형식입니다: {format}")),
    })
}

fn normalize_format(format: &str) -> Result<String, String> {
    let normalized = format.trim().trim_start_matches('.').to_ascii_lowercase();

    if SUPPORTED_FORMATS.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!("지원하지 않는 형식입니다: {format}"))
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn convert_audio(
    app: AppHandle,
    input_path: Option<String>,
    input_bytes: Option<Vec<u8>>,
    output_path: String,
    format: String,
    quality: Option<String>,
) -> Result<(), String> {
    let format = normalize_format(&format)?;
    let quality = quality
        .as_deref()
        .unwrap_or("high")
        .trim()
        .to_ascii_lowercase();
    let ffmpeg = resolve_ffmpeg(&app)?;
    let output = PathBuf::from(&output_path);
    ensure_parent_dir(&output)?;

    let (input, delete_input) = if let Some(path) = input_path.filter(|value| !value.trim().is_empty()) {
        let path = PathBuf::from(path);

        if !path.is_file() {
            return Err(format!("입력 파일을 찾을 수 없습니다: {}", path.display()));
        }

        (path, false)
    } else if let Some(bytes) = input_bytes.filter(|value| !value.is_empty()) {
        let temp_dir = app.path().temp_dir().map_err(|error| error.to_string())?;
        let temp_path = temp_dir.join(format!(
            "my-music-station-input-{}.bin",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or(0)
        ));
        fs::write(&temp_path, bytes).map_err(|error| error.to_string())?;
        (temp_path, true)
    } else {
        return Err("변환할 오디오 입력(경로 또는 데이터)이 없습니다.".to_string());
    };

    let codec = codec_args(&format, &quality)?;

    let mut command = Command::new(&ffmpeg);
    configure_hidden(
        command
            .arg("-hide_banner")
            .arg("-nostdin")
            .arg("-nostats")
            .arg("-loglevel")
            .arg("error")
            .arg("-y")
            .arg("-i")
            .arg(&input)
            .arg("-vn")
            .args(codec.iter().copied())
            .arg(&output),
    );

    // Prefer spawn/wait_with_output so CREATE_NO_WINDOW is not disturbed by
    // Command::output() reconfiguring stdio after creation flags are set.
    let result = command
        .spawn()
        .and_then(|child| child.wait_with_output())
        .map_err(|error| format!("ffmpeg 실행 실패 ({}): {error}", ffmpeg.display()));

    if delete_input {
        let _ = fs::remove_file(&input);
    }

    let result = result?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&result.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("exit {}", result.status)
        };

        return Err(format!("오디오 변환 실패: {detail}"));
    }

    if !output.is_file() {
        return Err("변환 결과 파일이 생성되지 않았습니다.".to_string());
    }

    Ok(())
}
