//! Markdown sources on disk: finding the files of a folder, describing picked files, and reading the
//! local pictures a Markdown file links to as `data:` URIs (they are embedded at merge time, so the
//! merged document, the preview and every export carry them).
use crate::tr;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};

/// Extensions of Markdown files (lower case, without the dot).
pub const MARKDOWN_EXTENSIONS: [&str; 2] = ["md", "markdown"];

/// Pictures larger than this are left as links (a merged document must stay workable).
pub const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceFile {
    pub name: String,
    /// The path below the scanned folder, with `/` (the file name for picked files).
    pub rel_path: String,
    pub full_path: PathBuf,
    /// Last change, milliseconds since 1970.
    pub mtime: f64,
    pub size: u64,
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .is_some_and(|extension| MARKDOWN_EXTENSIONS.contains(&extension.as_str()))
}

fn modified_ms(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}

fn describe(path: &Path, rel_path: String) -> Option<SourceFile> {
    let meta = std::fs::metadata(path).ok()?;
    Some(SourceFile {
        name: path.file_name()?.to_string_lossy().into_owned(),
        rel_path,
        full_path: path.to_path_buf(),
        mtime: modified_ms(&meta),
        size: meta.len(),
    })
}

/// Every Markdown file in `dir` (and below it with `recursive`), in name order per folder. Names starting
/// with a dot (hidden files and folders, .git) are skipped; links to folders are followed once.
pub fn scan(dir: &Path, recursive: bool) -> Result<Vec<SourceFile>, String> {
    if !dir.is_dir() {
        return Err(tr!("폴더를 찾을 수 없습니다: {}", "The folder was not found: {}", dir.display()));
    }
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    walk(dir, dir, recursive, &mut out, &mut seen);
    Ok(out)
}

fn walk(root: &Path, current: &Path, recursive: bool, out: &mut Vec<SourceFile>, seen: &mut std::collections::HashSet<PathBuf>) {
    // A folder reached twice through links is read once (no endless loops).
    if let Ok(real) = current.canonicalize() {
        if !seen.insert(real) {
            return;
        }
    }
    let Ok(entries) = std::fs::read_dir(current) else { return };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            if recursive {
                walk(root, &path, recursive, out, seen);
            }
            continue;
        }
        if !is_markdown(&path) {
            continue;
        }
        let rel = path.strip_prefix(root).unwrap_or(&path).components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/");
        if let Some(file) = describe(&path, rel) {
            out.push(file);
        }
    }
}

/// Picked files (the open dialog): name, time and size; missing files are left out.
pub fn infos(paths: &[PathBuf]) -> Vec<SourceFile> {
    paths
        .iter()
        .filter_map(|path| describe(path, path.file_name()?.to_string_lossy().into_owned()))
        .collect()
}

fn image_mime(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_string_lossy().to_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "tif" | "tiff" => "image/tiff",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        _ => return None,
    })
}

/// `%20` and friends in a link (`my%20picture.png`): decoded when the result is valid UTF-8.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() && bytes[i + 1].is_ascii_hexdigit() && bytes[i + 2].is_ascii_hexdigit() {
            let hex = |b: u8| (b as char).to_digit(16).unwrap_or(0) as u8;
            out.push(hex(bytes[i + 1]) * 16 + hex(bytes[i + 2]));
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_string())
}

/// `a/./b/../c` → `a/c` (without touching the disk).
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// The picture a Markdown file at `md_path` links to with `src`, resolved against the file's folder.
/// None for web addresses, `data:` URIs, other kinds of files and files that are not there.
pub fn image_path(md_path: &Path, src: &str) -> Option<PathBuf> {
    let src = src.trim().trim_start_matches('<').trim_end_matches('>');
    let lower = src.to_lowercase();
    if src.is_empty() || lower.starts_with("http:") || lower.starts_with("https:") || lower.starts_with("data:") || lower.starts_with("//") {
        return None;
    }
    let decoded = percent_decode(src);
    let clean = decoded.split(['#', '?']).next().unwrap_or("");
    let clean = clean.strip_prefix("file:///").unwrap_or(clean);
    let given = Path::new(clean);
    let path = if given.is_absolute() { given.to_path_buf() } else { md_path.parent().unwrap_or(Path::new(".")).join(given) };
    let path = normalize(&path);
    image_mime(&path)?;
    path.is_file().then_some(path)
}

/// The picture as a `data:` URI, or None (see image_path; also None above MAX_IMAGE_BYTES).
pub fn image_data_url(md_path: &Path, src: &str) -> Option<String> {
    use base64::Engine;
    let path = image_path(md_path, src)?;
    let mime = image_mime(&path)?;
    if std::fs::metadata(&path).ok()?.len() > MAX_IMAGE_BYTES {
        return None;
    }
    let bytes = std::fs::read(&path).ok()?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn scan_finds_markdown_files_below_the_folder_in_name_order() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.md"), "# B").unwrap();
        fs::write(dir.path().join("A.markdown"), "# A").unwrap();
        fs::write(dir.path().join("notes.txt"), "x").unwrap();
        fs::create_dir_all(dir.path().join("sub").join("deep")).unwrap();
        fs::write(dir.path().join("sub").join("c.MD"), "# C").unwrap();
        fs::write(dir.path().join("sub").join("deep").join("d.md"), "# D").unwrap();
        fs::create_dir_all(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git").join("hidden.md"), "x").unwrap();
        fs::write(dir.path().join(".draft.md"), "x").unwrap();

        let all: Vec<String> = scan(dir.path(), true).unwrap().into_iter().map(|f| f.rel_path).collect();
        assert_eq!(all, vec!["A.markdown", "b.md", "sub/c.MD", "sub/deep/d.md"]);
        let top: Vec<String> = scan(dir.path(), false).unwrap().into_iter().map(|f| f.rel_path).collect();
        assert_eq!(top, vec!["A.markdown", "b.md"]);
    }

    #[test]
    fn scan_reports_size_time_and_full_path() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("x.md"), "12345").unwrap();
        let files = scan(dir.path(), true).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "x.md");
        assert_eq!(files[0].size, 5);
        assert!(files[0].mtime > 1.0e12, "milliseconds since 1970");
        assert_eq!(files[0].full_path, dir.path().join("x.md"));
    }

    #[test]
    fn scan_of_a_missing_folder_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(scan(&dir.path().join("gone"), true).is_err());
    }

    #[test]
    fn infos_skip_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "a").unwrap();
        let list = infos(&[dir.path().join("a.md"), dir.path().join("b.md")]);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].rel_path, "a.md");
    }

    #[test]
    fn local_pictures_become_data_urls() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("docs").join("img")).unwrap();
        fs::create_dir_all(dir.path().join("shared")).unwrap();
        let md = dir.path().join("docs").join("guide.md");
        fs::write(&md, "x").unwrap();
        fs::write(dir.path().join("docs").join("img").join("my picture.png"), [1u8, 2, 3]).unwrap();
        fs::write(dir.path().join("shared").join("logo.svg"), "<svg/>").unwrap();

        assert_eq!(image_data_url(&md, "img/my%20picture.png").as_deref(), Some("data:image/png;base64,AQID"));
        assert_eq!(image_data_url(&md, "<img/my picture.png>").as_deref(), Some("data:image/png;base64,AQID"));
        assert_eq!(image_data_url(&md, "./img/my picture.png?v=2#top").as_deref(), Some("data:image/png;base64,AQID"));
        assert!(image_data_url(&md, "../shared/logo.svg").unwrap().starts_with("data:image/svg+xml;base64,"));
        assert!(image_data_url(&md, "https://example.com/a.png").is_none());
        assert!(image_data_url(&md, "data:image/png;base64,AA").is_none());
        assert!(image_data_url(&md, "img/missing.png").is_none());
        assert!(image_data_url(&md, "guide.md").is_none(), "not a picture");
    }

    #[test]
    fn percent_decoding_keeps_invalid_sequences() {
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("%ED%95%9C"), "한");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }
}
