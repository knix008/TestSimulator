//! What MyPaint was asked to open: a file named on the command line (a double-click in the
//! file manager, "Open with", a second instance) becomes `{ mode, file }` for the page's
//! `desktop.onLaunch`. A drawing (`.mypaint`, and the older `.mpaint`) opens as a drawing;
//! every picture format the page reads opens as a picture.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Launch {
    pub mode: String,
    pub file: String,
}

/// Drawings: the current extension first, then the one MyPaint used before 10.0.
pub const DRAWING_EXTENSIONS: &[&str] = &["mypaint", "mpaint"];

/// Every picture the page can read (index.html #imageOpen and src/formats.js).
pub const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "jpe", "jfif", "gif", "webp", "bmp", "dib", "ico", "avif", "svg", "tif", "tiff", "heic",
    "heif", "hif", "jp2", "j2k", "jpf", "jpx", "dcm", "dicom",
    // camera RAW: the page opens the full-size JPEG the camera wrote into the file
    "cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2", "dng", "orf", "raf", "rw2", "pef", "srw", "3fr", "iiq", "x3f",
    "mrw", "kdc", "dcr", "erf", "mef", "mos", "rwl", "gpr",
];

fn extension(path: &str) -> String {
    Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

/// "drawing", "image" or "" for a file name.
pub fn mode_of(path: &str) -> &'static str {
    let ext = extension(path);
    if DRAWING_EXTENSIONS.contains(&ext.as_str()) {
        "drawing"
    } else if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        "image"
    } else {
        ""
    }
}

/// The first openable file among the arguments (the program itself and `--flags` are
/// skipped), made absolute against `cwd` — a second instance hands over its own folder.
pub fn from_args<I, S>(args: I, cwd: &Path) -> Option<Launch>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().skip(1).find_map(|arg| {
        let arg = arg.as_ref().trim().trim_matches('"');
        if arg.is_empty() || arg.starts_with("--") {
            return None;
        }
        let mode = mode_of(arg);
        if mode.is_empty() {
            return None;
        }
        let path = PathBuf::from(arg);
        let path = if path.is_absolute() { path } else { cwd.join(path) };
        Some(Launch { mode: mode.to_string(), file: path.to_string_lossy().to_string() })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cwd() -> PathBuf {
        if cfg!(windows) { PathBuf::from("C:\\work") } else { PathBuf::from("/work") }
    }

    #[test]
    fn drawings_and_pictures_are_told_apart() {
        assert_eq!(mode_of("a.mypaint"), "drawing");
        assert_eq!(mode_of("OLD.MPAINT"), "drawing");
        assert_eq!(mode_of("photo.JPG"), "image");
        assert_eq!(mode_of("scan.dcm"), "image");
        assert_eq!(mode_of("raw.CR3"), "image");
        assert_eq!(mode_of("notes.txt"), "");
        assert_eq!(mode_of("noext"), "");
    }

    #[test]
    fn the_first_openable_argument_wins() {
        let launch = from_args(["MyPaint.exe", "--flag", "readme.txt", "pic.png", "b.mypaint"], &cwd()).unwrap();
        assert_eq!(launch.mode, "image");
        assert!(launch.file.ends_with("pic.png"));
        assert!(Path::new(&launch.file).is_absolute());
        assert_eq!(from_args(["MyPaint.exe"], &cwd()), None);
        assert_eq!(from_args(["MyPaint.exe", "x.mypaint"], &cwd()).unwrap().mode, "drawing");
    }

    #[test]
    fn the_program_itself_is_never_opened() {
        assert_eq!(from_args(["C:\\pictures\\photo.png"], &cwd()), None);
    }
}
