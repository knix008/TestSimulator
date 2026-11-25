//! File helpers: whole-file reads, crash-safe writes, safe names and opening with the system.
use crate::tr;
use std::path::{Path, PathBuf};

/// The design file extension (a JSON document, see src/lib/project.js).
pub const DESIGN_EXTENSION: &str = "myico";

pub fn read(path: &Path) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|error| tr!("파일을 읽을 수 없습니다 ({}): {error}", "Could not read the file ({}): {error}", path.display()))
}

pub fn read_text(path: &Path) -> Result<String, String> {
    let bytes = read(path)?;
    let text = String::from_utf8(bytes).map_err(|_| tr!("UTF-8 텍스트 파일이 아닙니다: {}", "Not a UTF-8 text file: {}", path.display()))?;
    Ok(text.strip_prefix('\u{feff}').map(str::to_string).unwrap_or(text))
}

/// Writes to a temporary file next to the target, then renames it: a crash never leaves half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let fail = |error: std::io::Error| tr!("파일을 저장할 수 없습니다 ({}): {error}", "Could not save the file ({}): {error}", path.display());
    if let Some(dir) = path.parent().filter(|dir| !dir.as_os_str().is_empty()) {
        std::fs::create_dir_all(dir).map_err(fail)?;
    }
    let file_name = path.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
    let temporary = path.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));
    if let Err(error) = std::fs::write(&temporary, bytes).and_then(|()| std::fs::rename(&temporary, path)) {
        let _ = std::fs::remove_file(&temporary);
        return Err(fail(error));
    }
    Ok(())
}

pub fn decode_base64(data: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|error| tr!("데이터가 손상되었습니다: {error}", "The data is damaged: {error}"))
}

/// A plain file name (no folders, no reserved characters), or None.
pub fn safe_file_name(name: &str) -> Option<String> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.len() > 200 {
        return None;
    }
    if name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control()) {
        return None;
    }
    Some(name.to_string())
}

/// Design files among command-line arguments (double-clicked files, "Open with").
pub fn design_files<I: IntoIterator<Item = String>>(args: I) -> Vec<PathBuf> {
    args.into_iter()
        .filter(|arg| !arg.starts_with('-'))
        .map(PathBuf::from)
        .filter(|path| is_design_file(path) && path.is_file())
        .collect()
}

pub fn is_design_file(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case(DESIGN_EXTENSION))
}

pub fn open_with_system(target: &str) -> Result<(), String> {
    if std::env::var_os("MYICOMAKER_NO_OPEN").is_some() {
        return Ok(());
    }
    #[cfg(windows)]
    let result = {
        use std::os::windows::process::CommandExt;
        // rundll32 opens URLs and files with their default program without a console window.
        std::process::Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler", target]).creation_flags(0x0800_0000).spawn()
    };
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(target).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(target).spawn();
    result.map(|_| ()).map_err(|error| tr!("열 수 없습니다 ({target}): {error}", "Could not open ({target}): {error}"))
}

/// Opens the folder of a file with the file selected (Windows), or the folder (elsewhere).
pub fn reveal(path: &Path) -> Result<(), String> {
    if std::env::var_os("MYICOMAKER_NO_OPEN").is_some() {
        return Ok(());
    }
    #[cfg(windows)]
    let result = std::process::Command::new("explorer.exe").arg(format!("/select,{}", path.display())).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg("-R").arg(path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(path.parent().unwrap_or(Path::new("."))).spawn();
    result.map(|_| ()).map_err(|error| tr!("폴더를 열 수 없습니다: {error}", "Could not open the folder: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_whole_files_and_reads_them_back() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join("icon.ico");
        write_atomic(&path, b"\x00\x00\x01\x00").unwrap();
        assert_eq!(read(&path).unwrap(), b"\x00\x00\x01\x00");
        write_atomic(&path, b"second").unwrap();
        assert_eq!(read(&path).unwrap(), b"second");
        let leftovers = std::fs::read_dir(path.parent().unwrap()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn text_files_lose_their_byte_order_mark() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("design.myico");
        std::fs::write(&path, "\u{feff}{\"a\":1}").unwrap();
        assert_eq!(read_text(&path).unwrap(), "{\"a\":1}");
        std::fs::write(&path, [0xff, 0xfe, 0x00]).unwrap();
        assert!(read_text(&path).is_err());
    }

    #[test]
    fn base64_round_trip_and_damage() {
        assert_eq!(decode_base64("AAEC").unwrap(), vec![0, 1, 2]);
        assert!(decode_base64("**").is_err());
    }

    #[test]
    fn only_plain_file_names_are_accepted() {
        assert_eq!(safe_file_name("icon-16x16.ico").as_deref(), Some("icon-16x16.ico"));
        for bad in ["", "..", "a/b.png", "a\\b.png", "c:x", "x?.png", "a\u{7}"] {
            assert_eq!(safe_file_name(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn design_files_are_picked_from_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let design = dir.path().join("logo.MYICO");
        std::fs::write(&design, "{}").unwrap();
        let other = dir.path().join("notes.txt");
        std::fs::write(&other, "x").unwrap();
        let args = vec!["--flag".to_string(), design.display().to_string(), other.display().to_string(), dir.path().join("missing.myico").display().to_string()];
        assert_eq!(design_files(args), vec![design]);
    }
}
