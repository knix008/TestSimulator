//! Atomic text reads and writes for workspace files.
use crate::tr;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub fn read_text(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| tr!("파일을 열 수 없습니다 ({}): {error}", "Could not open the file ({}): {error}", path.display()))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(|error| tr!("파일 읽기 실패 ({}): {error}", "Reading the file failed ({}): {error}", path.display()))?;
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).map(<[u8]>::to_vec).unwrap_or(bytes);
    String::from_utf8(bytes).map_err(|_| tr!("UTF-8 텍스트 파일이 아닙니다: {}", "The file is not UTF-8 text: {}", path.display()))
}

fn temporary_path(path: &Path) -> PathBuf {
    let name = path.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
    path.with_file_name(format!(".{name}.{}.tmp", std::process::id()))
}

pub fn write_text(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|error| tr!("폴더를 만들 수 없습니다 ({}): {error}", "Could not create the folder ({}): {error}", parent.display()))?;
    }
    let temporary = temporary_path(path);
    let result = (|| {
        let mut file = File::create(&temporary).map_err(|error| tr!("파일을 만들 수 없습니다 ({}): {error}", "Could not create the file ({}): {error}", path.display()))?;
        file.write_all(data).map_err(|error| tr!("파일 쓰기 실패 ({}): {error}", "Writing the file failed ({}): {error}", path.display()))?;
        file.sync_all().map_err(|error| tr!("파일 쓰기 실패 ({}): {error}", "Writing the file failed ({}): {error}", path.display()))?;
        drop(file);
        fs::rename(&temporary, path).map_err(|error| tr!("파일을 바꿀 수 없습니다 ({}): {error}", "Could not replace the file ({}): {error}", path.display()))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn startup_paths<I: IntoIterator<Item = String>>(args: I) -> Vec<PathBuf> {
    args.into_iter()
        .filter(|arg| !arg.starts_with('-'))
        .map(PathBuf::from)
        .filter(|path| {
            let ext = path.extension().map(|item| item.to_string_lossy().to_lowercase());
            matches!(ext.as_deref(), Some("mwf") | Some("json")) && path.is_file()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_startup_filter() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("space.mwf");
        write_text(&path, b"{\"ok\":1}").unwrap();
        assert_eq!(read_text(&path).unwrap(), "{\"ok\":1}");
        let note = dir.path().join("note.txt");
        fs::write(&note, "x").unwrap();
        let found = startup_paths([
            "--flag".into(),
            path.to_string_lossy().to_string(),
            note.to_string_lossy().to_string(),
        ]);
        assert_eq!(found, vec![path]);
    }
}
