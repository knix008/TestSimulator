//! Output paths and handing files to the OS shell.

use crate::tr;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Characters no desktop file system accepts in a file name.
pub fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.');
    if trimmed.is_empty() { "Capture".into() } else { trimmed.into() }
}

/// `dir/stem.ext`, or `dir/stem (2).ext`… when the name is taken.
pub fn unique_path(directory: &Path, stem: &str, extension: &str) -> PathBuf {
    let stem = sanitize_file_name(stem);
    let candidate = directory.join(format!("{stem}.{extension}"));
    if !candidate.exists() {
        return candidate;
    }
    (2..)
        .map(|index| directory.join(format!("{stem} ({index}).{extension}")))
        .find(|path| !path.exists())
        .expect("an unused file name exists")
}

/// Forces `path` to end in `.extension` (save dialogs on Linux do not always add it).
pub fn with_extension(path: &Path, extension: &str) -> PathBuf {
    let matches = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(extension)
            || (extension == "jpg" && value.eq_ignore_ascii_case("jpeg")));
    if matches {
        path.to_path_buf()
    } else {
        let mut name = path.as_os_str().to_owned();
        name.push(format!(".{extension}"));
        PathBuf::from(name)
    }
}

fn spawn(command: &mut Command) -> Result<(), String> {
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| tr!("파일 탐색기를 실행하지 못했습니다: {error}", "Could not open the file manager: {error}"))
}

pub fn reveal(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(tr!("파일을 찾을 수 없습니다. 이동되었거나 삭제되었습니다.", "The file was not found. It was moved or deleted."));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut command = Command::new("explorer.exe");
        command.raw_arg(format!("/select,\"{}\"", path.display()));
        spawn(&mut command)
    }
    #[cfg(target_os = "macos")]
    {
        spawn(Command::new("open").arg("-R").arg(path))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        spawn(Command::new("xdg-open").arg(path.parent().unwrap_or(path)))
    }
}

pub fn open(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(tr!("파일을 찾을 수 없습니다. 이동되었거나 삭제되었습니다.", "The file was not found. It was moved or deleted."));
    }
    #[cfg(target_os = "windows")]
    {
        spawn(Command::new("explorer.exe").arg(path))
    }
    #[cfg(target_os = "macos")]
    {
        spawn(Command::new("open").arg(path))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        spawn(Command::new("xdg-open").arg(path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_reserved_characters() {
        assert_eq!(sanitize_file_name("a:b/c*?.."), "a_b_c__");
        assert_eq!(sanitize_file_name("   "), "Capture");
    }

    #[test]
    fn numbers_taken_names() {
        let directory = tempfile::tempdir().unwrap();
        let first = unique_path(directory.path(), "Shot", "png");
        assert_eq!(first.file_name().unwrap(), "Shot.png");
        std::fs::write(&first, b"x").unwrap();
        let second = unique_path(directory.path(), "Shot", "png");
        assert_eq!(second.file_name().unwrap(), "Shot (2).png");
    }

    #[test]
    fn appends_missing_extensions_only() {
        assert_eq!(with_extension(Path::new("a/b.PNG"), "png"), PathBuf::from("a/b.PNG"));
        assert_eq!(with_extension(Path::new("a/b.jpeg"), "jpg"), PathBuf::from("a/b.jpeg"));
        assert_eq!(with_extension(Path::new("a/b"), "webm"), PathBuf::from("a/b.webm"));
        assert_eq!(with_extension(Path::new("a/b.mp4"), "webm"), PathBuf::from("a/b.mp4.webm"));
    }
}
