//! File reading, writing and copying in chunks, reporting progress so the UI
//! can show a progress window for large files. Writes are atomic: the data goes
//! to a temporary file next to the target, which then replaces it.
use crate::tr;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const CHUNK: usize = 1 << 20;

/// Extensions the app opens: MyCAD drawings and DXF drawings.
pub const DOCUMENT_EXTENSIONS: [&str; 23] = ["mcad", "dxf", "fcstd", "ifc", "step", "stp", "stl", "obj", "ply", "off", "amf", "3mf", "wrl", "vrml", "dae", "brep", "brp", "scad", "csg", "xyz", "asc", "pts", "pcd"];

/// Test hook: `MYCAD_IO_DELAY_MS` slows every chunk so the progress window can be checked.
fn chunk_delay() -> Option<Duration> {
    std::env::var("MYCAD_IO_DELAY_MS").ok()?.parse().ok().filter(|ms| *ms > 0).map(Duration::from_millis)
}

fn pause() {
    if let Some(delay) = chunk_delay() {
        std::thread::sleep(delay);
    }
}

pub fn read_with_progress(path: &Path, mut progress: impl FnMut(u64, u64)) -> Result<Vec<u8>, String> {
    let mut file = File::open(path).map_err(|error| tr!("파일을 열 수 없습니다 ({}): {error}", "Could not open the file ({}): {error}", path.display()))?;
    let total = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    let mut data = Vec::with_capacity(total as usize);
    let mut buffer = vec![0u8; CHUNK];
    progress(0, total);
    loop {
        let read = file.read(&mut buffer).map_err(|error| tr!("파일 읽기 실패 ({}): {error}", "Reading the file failed ({}): {error}", path.display()))?;
        if read == 0 {
            break;
        }
        data.extend_from_slice(&buffer[..read]);
        progress(data.len() as u64, total.max(data.len() as u64));
        pause();
    }
    Ok(data)
}

pub fn read_text(path: &Path, progress: impl FnMut(u64, u64)) -> Result<String, String> {
    let bytes = read_with_progress(path, progress)?;
    // Accept a UTF-8 byte-order mark (files saved by some editors).
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).map(<[u8]>::to_vec).unwrap_or(bytes);
    String::from_utf8(bytes).map_err(|_| tr!("UTF-8 텍스트 파일이 아닙니다: {}", "The file is not UTF-8 text: {}", path.display()))
}

fn temporary_path(path: &Path) -> PathBuf {
    let name = path.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
    path.with_file_name(format!(".{name}.{}.tmp", std::process::id()))
}

/// Writes `data` to `path` atomically, in chunks.
pub fn write_with_progress(path: &Path, data: &[u8], mut progress: impl FnMut(u64, u64)) -> Result<(), String> {
    if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|error| tr!("폴더를 만들 수 없습니다 ({}): {error}", "Could not create the folder ({}): {error}", parent.display()))?;
    }
    let temporary = temporary_path(path);
    let result = (|| {
        let mut file = File::create(&temporary).map_err(|error| tr!("파일을 만들 수 없습니다 ({}): {error}", "Could not create the file ({}): {error}", path.display()))?;
        let total = data.len() as u64;
        progress(0, total);
        let mut written = 0u64;
        for chunk in data.chunks(CHUNK) {
            file.write_all(chunk).map_err(|error| tr!("파일 쓰기 실패 ({}): {error}", "Writing the file failed ({}): {error}", path.display()))?;
            written += chunk.len() as u64;
            progress(written, total);
            pause();
        }
        file.sync_all().map_err(|error| tr!("파일 쓰기 실패 ({}): {error}", "Writing the file failed ({}): {error}", path.display()))?;
        drop(file);
        fs::rename(&temporary, path).map_err(|error| tr!("파일을 바꿀 수 없습니다 ({}): {error}", "Could not replace the file ({}): {error}", path.display()))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// Copies `from` to `to` in chunks (background images, which may be very large).
pub fn copy_with_progress(from: &Path, to: &Path, mut progress: impl FnMut(u64, u64)) -> Result<u64, String> {
    let mut source = File::open(from).map_err(|error| tr!("파일을 열 수 없습니다 ({}): {error}", "Could not open the file ({}): {error}", from.display()))?;
    let total = source.metadata().map(|meta| meta.len()).unwrap_or(0);
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|error| tr!("폴더를 만들 수 없습니다 ({}): {error}", "Could not create the folder ({}): {error}", parent.display()))?;
    }
    let temporary = temporary_path(to);
    let result = (|| {
        let mut target = File::create(&temporary).map_err(|error| tr!("파일을 만들 수 없습니다 ({}): {error}", "Could not create the file ({}): {error}", to.display()))?;
        let mut buffer = vec![0u8; CHUNK];
        let mut copied = 0u64;
        progress(0, total);
        loop {
            let read = source.read(&mut buffer).map_err(|error| tr!("파일 읽기 실패 ({}): {error}", "Reading the file failed ({}): {error}", from.display()))?;
            if read == 0 {
                break;
            }
            target.write_all(&buffer[..read]).map_err(|error| tr!("파일 쓰기 실패 ({}): {error}", "Writing the file failed ({}): {error}", to.display()))?;
            copied += read as u64;
            progress(copied, total.max(copied));
            pause();
        }
        drop(target);
        fs::rename(&temporary, to).map_err(|error| tr!("파일을 바꿀 수 없습니다 ({}): {error}", "Could not replace the file ({}): {error}", to.display()))?;
        Ok(copied)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// Opens a file with the program the system associates with it.
/// `MYCAD_NO_OPEN` (tests) skips launching the program.
pub fn open_with_system(path: &Path) -> Result<(), String> {
    if std::env::var_os("MYCAD_NO_OPEN").is_some() {
        return Ok(());
    }
    #[cfg(windows)]
    let result = std::process::Command::new("explorer.exe").arg(path).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(path).spawn();
    result.map(|_| ()).map_err(|error| tr!("파일을 열 프로그램을 실행할 수 없습니다 ({}): {error}", "Could not start a program for the file ({}): {error}", path.display()))
}

/// Drawing files among command-line arguments (double-clicked files, "Open with").
pub fn document_files<I: IntoIterator<Item = String>>(args: I) -> Vec<PathBuf> {
    args.into_iter()
        .filter(|arg| !arg.starts_with('-'))
        .map(PathBuf::from)
        .filter(|path| is_document_file(path) && path.is_file())
        .collect()
}

pub fn is_document_file(path: &Path) -> bool {
    path.extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .is_some_and(|extension| DOCUMENT_EXTENSIONS.contains(&extension.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_round_trips_and_reports_progress() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("part.mcad");
        let data = "한글 drawing ".repeat(300_000);
        let mut steps = Vec::new();
        write_with_progress(&path, data.as_bytes(), |done, total| steps.push((done, total))).unwrap();
        assert_eq!(steps.first(), Some(&(0, data.len() as u64)));
        assert_eq!(steps.last(), Some(&(data.len() as u64, data.len() as u64)));
        assert!(steps.len() > 2, "large writes report several steps");
        let mut reads = 0;
        assert_eq!(read_text(&path, |_, _| reads += 1).unwrap(), data);
        assert!(reads > 2);
    }

    #[test]
    fn atomic_write_leaves_no_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.mcad");
        write_with_progress(&path, b"one", |_, _| {}).unwrap();
        write_with_progress(&path, b"two", |_, _| {}).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"two");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn read_strips_utf8_bom() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bom.json");
        fs::write(&path, [0xEF, 0xBB, 0xBF, b'{', b'}']).unwrap();
        assert_eq!(read_text(&path, |_, _| {}).unwrap(), "{}");
    }

    #[test]
    fn read_rejects_binary_and_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bin.mcad");
        fs::write(&path, [0xff, 0xfe, 0x00, 0xc3]).unwrap();
        assert!(read_text(&path, |_, _| {}).is_err());
        assert!(read_text(&dir.path().join("missing.mcad"), |_, _| {}).is_err());
    }

    #[test]
    fn copy_reports_total_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("big.png");
        fs::write(&from, vec![7u8; CHUNK * 3 + 5]).unwrap();
        let to = dir.path().join("copy").join("bg.png");
        let mut last = (0, 0);
        let copied = copy_with_progress(&from, &to, |done, total| last = (done, total)).unwrap();
        assert_eq!(copied, (CHUNK * 3 + 5) as u64);
        assert_eq!(last, (copied, copied));
        assert_eq!(fs::read(&to).unwrap().len(), CHUNK * 3 + 5);
    }

    #[test]
    fn document_files_keeps_existing_drawings_only() {
        let dir = tempfile::tempdir().unwrap();
        let drawing = dir.path().join("gear.MCAD");
        let dxf = dir.path().join("plate.dxf");
        let text = dir.path().join("notes.txt");
        let freecad = dir.path().join("bracket.FCStd");
        let step = dir.path().join("bracket.step");
        fs::write(&freecad, "PK").unwrap();
        fs::write(&step, "ISO-10303-21;").unwrap();
        fs::write(&drawing, "{}").unwrap();
        fs::write(&dxf, "0\nEOF\n").unwrap();
        fs::write(&text, "x").unwrap();
        let args = vec![
            "MyCAD.exe".to_string(),
            "--flag".to_string(),
            drawing.to_string_lossy().to_string(),
            text.to_string_lossy().to_string(),
            dxf.to_string_lossy().to_string(),
            dir.path().join("gone.mcad").to_string_lossy().to_string(),
            freecad.to_string_lossy().to_string(),
            step.to_string_lossy().to_string(),
        ];
        assert_eq!(document_files(args), vec![drawing, dxf, freecad, step]);
    }
}
