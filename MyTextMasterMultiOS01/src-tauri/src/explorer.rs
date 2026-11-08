//! The Explorer panel and Find in files: drives and well-known folders, folder listings,
//! a text search through a folder tree, and copying dropped / pasted pictures next to a document.
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub name: String,
    pub path: PathBuf,
    /// drive | home | desktop | documents | downloads | root
    pub kind: &'static str,
}

/// The drives (Windows: every existing letter; macOS: / and /Volumes/*; Linux: / and mounts under /media, /mnt)
/// and the user's home, Desktop, Documents and Downloads.
pub fn places() -> Vec<Place> {
    let mut out = Vec::new();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from) {
        for (name, kind) in [("Desktop", "desktop"), ("Documents", "documents"), ("Downloads", "downloads")] {
            let path = home.join(name);
            if path.is_dir() {
                out.push(Place { name: name.into(), path, kind });
            }
        }
        out.insert(0, Place { name: home.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Home".into()), path: home, kind: "home" });
    }
    #[cfg(windows)]
    for letter in b'A'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        if Path::new(&root).exists() {
            out.push(Place { name: format!("{}:", letter as char), path: PathBuf::from(root), kind: "drive" });
        }
    }
    #[cfg(not(windows))]
    {
        out.push(Place { name: "/".into(), path: PathBuf::from("/"), kind: "root" });
        for base in ["/Volumes", "/media", "/mnt", "/run/media"] {
            if let Ok(entries) = fs::read_dir(base) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        out.push(Place { name: entry.file_name().to_string_lossy().into_owned(), path, kind: "drive" });
                    }
                }
            }
        }
    }
    out
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: PathBuf,
    pub dir: bool,
    pub size: u64,
    pub mtime: u64,
}

fn hidden(name: &str, path: &Path) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(meta) = fs::metadata(path) {
            // FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM
            return meta.file_attributes() & 0x6 != 0;
        }
    }
    let _ = path;
    false
}

/// A folder's entries: folders first, then files, each by name (case-insensitive).
pub fn list_dir(dir: &Path, show_hidden: bool) -> Result<Vec<Entry>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        if !show_hidden && hidden(&name, &path) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
        out.push(Entry { name, path, dir: meta.is_dir(), size: if meta.is_dir() { 0 } else { meta.len() }, mtime });
    }
    out.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub path: PathBuf,
    pub line: usize,
    pub column: usize,
    pub text: String,
}

const SKIP_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", "build", ".svn", ".hg", "__pycache__", ".venv", ".idea", ".vs"];
pub const MAX_HITS: usize = 2000;
const MAX_FILE: u64 = 8 * 1024 * 1024;

/// Lines containing `query` in the text files under `dir` (by extension; empty = every text file).
/// `regex`: the query is a regular expression (a small subset: plain text if it does not compile).
pub fn search(dir: &Path, query: &str, case_sensitive: bool, whole_word: bool, extensions: &[String]) -> Result<(Vec<Hit>, usize), String> {
    if query.is_empty() {
        return Ok((Vec::new(), 0));
    }
    let needle = if case_sensitive { query.to_string() } else { query.to_lowercase() };
    let mut hits = Vec::new();
    let mut files = 0usize;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(folder) = stack.pop() {
        let Ok(entries) = fs::read_dir(&folder) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() {
                if !SKIP_DIRS.contains(&name.as_str()) && !name.starts_with('.') {
                    stack.push(path);
                }
                continue;
            }
            let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !extensions.is_empty() && !extensions.iter().any(|e| e.eq_ignore_ascii_case(&ext)) {
                continue;
            }
            if entry.metadata().map(|m| m.len() > MAX_FILE).unwrap_or(true) {
                continue;
            }
            let Ok(bytes) = fs::read(&path) else { continue };
            if bytes.iter().take(4096).any(|&b| b == 0) {
                continue; // binary
            }
            files += 1;
            let (text, _) = crate::files::decode(&bytes);
            for (index, line) in text.lines().enumerate() {
                let hay = if case_sensitive { line.to_string() } else { line.to_lowercase() };
                let mut from = 0;
                while let Some(found) = hay[from..].find(&needle) {
                    let start = from + found;
                    let end = start + needle.len();
                    let word_ok = !whole_word || {
                        let before = hay[..start].chars().next_back();
                        let after = hay[end..].chars().next();
                        !before.is_some_and(|c| c.is_alphanumeric() || c == '_') && !after.is_some_and(|c| c.is_alphanumeric() || c == '_')
                    };
                    if word_ok {
                        hits.push(Hit { path: path.clone(), line: index + 1, column: hay[..start].chars().count() + 1, text: line.chars().take(300).collect() });
                        if hits.len() >= MAX_HITS {
                            return Ok((hits, files));
                        }
                        break; // one hit per line
                    }
                    from = end;
                }
            }
        }
    }
    hits.sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)));
    Ok((hits, files))
}

/// A free file name in `dir` for `name` ("a.png", "a-2.png", …).
pub fn free_name(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(name);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "image".into());
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..).map(|n| dir.join(format!("{stem}-{n}{ext}"))).find(|p| !p.exists()).unwrap()
}

/// Copies a picture into `<doc_dir>/images/` and returns its path relative to the document ("images/a.png").
pub fn copy_image(source: &Path, doc_dir: &Path) -> Result<String, String> {
    let images = doc_dir.join("images");
    // A picture already inside the document's folder is linked where it is.
    if let Ok(rest) = source.strip_prefix(doc_dir) {
        return Ok(rest.to_string_lossy().replace('\\', "/"));
    }
    fs::create_dir_all(&images).map_err(|e| e.to_string())?;
    let name = source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "image.png".into());
    let target = free_name(&images, &name);
    fs::copy(source, &target).map_err(|e| e.to_string())?;
    Ok(format!("images/{}", target.file_name().unwrap().to_string_lossy()))
}

/// Writes picture bytes (a pasted screenshot) into `<doc_dir>/images/` under a free name.
pub fn write_image(bytes: &[u8], name: &str, doc_dir: &Path) -> Result<String, String> {
    let images = doc_dir.join("images");
    fs::create_dir_all(&images).map_err(|e| e.to_string())?;
    let target = free_name(&images, name);
    fs::write(&target, bytes).map_err(|e| e.to_string())?;
    Ok(format!("images/{}", target.file_name().unwrap().to_string_lossy()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Details {
    pub size: u64,
    pub created: u64,
    pub modified: u64,
    pub accessed: u64,
    pub readonly: bool,
    pub hidden: bool,
    pub dir: bool,
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> u64 {
    time.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/** Size, times and attributes of a file (the information panel). */
pub fn details(path: &Path) -> Result<Details, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(Details {
        size: meta.len(),
        created: millis(meta.created()),
        modified: millis(meta.modified()),
        accessed: millis(meta.accessed()),
        readonly: meta.permissions().readonly(),
        hidden: hidden(&name, path),
        dir: meta.is_dir(),
    })
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Hashes {
    pub md5: String,
    pub sha1: String,
    pub sha256: String,
}

/// MD5, SHA-1 and SHA-256 of a file, read in pieces (large files do not fill the memory).
pub fn hashes(path: &Path) -> Result<Hashes, String> {
    use sha2::Digest;
    use std::io::Read;
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut md5 = md5::Md5::new();
    let mut sha1 = sha1::Sha1::new();
    let mut sha256 = sha2::Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        md5.update(&buffer[..n]);
        sha1.update(&buffer[..n]);
        sha256.update(&buffer[..n]);
    }
    let hex = |bytes: &[u8]| bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    Ok(Hashes { md5: hex(&md5.finalize()), sha1: hex(&sha1.finalize()), sha256: hex(&sha256.finalize()) })
}

#[cfg(test)]
mod tests {
    #[test]
    fn hashes_of_a_known_text() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("abc.txt");
        fs::write(&path, "abc").unwrap();
        let h = hashes(&path).unwrap();
        assert_eq!(h.md5, "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(h.sha1, "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(h.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(details(&path).unwrap().size, 3);
    }

    use super::*;

    #[test]
    fn lists_folders_first_and_skips_hidden() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.md"), "x").unwrap();
        fs::write(dir.path().join("A.txt"), "x").unwrap();
        fs::write(dir.path().join(".hidden"), "x").unwrap();
        fs::create_dir(dir.path().join("zdir")).unwrap();
        let names: Vec<_> = list_dir(dir.path(), false).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["zdir", "A.txt", "b.md"]);
        assert_eq!(list_dir(dir.path(), true).unwrap().len(), 4);
    }

    #[test]
    fn finds_text_in_files_case_and_word_options() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("sub")).unwrap();
        fs::create_dir_all(dir.path().join("node_modules")).unwrap();
        fs::write(dir.path().join("a.md"), "Hello world\nhello again\nsay helloing").unwrap();
        fs::write(dir.path().join("sub").join("b.txt"), "안녕 Hello").unwrap();
        fs::write(dir.path().join("node_modules").join("c.md"), "hello").unwrap();
        fs::write(dir.path().join("bin.dat"), [b'h', 0, 0, 0]).unwrap();
        let (hits, files) = search(dir.path(), "hello", false, false, &[]).unwrap();
        assert_eq!(hits.len(), 4);
        assert_eq!(files, 2);
        let (hits, _) = search(dir.path(), "Hello", true, false, &[]).unwrap();
        assert_eq!(hits.len(), 2);
        let (hits, _) = search(dir.path(), "hello", false, true, &["md".into()]).unwrap();
        assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(hits[0].column, 1);
    }

    #[test]
    fn copies_images_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let picture = outside.path().join("shot.png");
        fs::write(&picture, b"png").unwrap();
        assert_eq!(copy_image(&picture, dir.path()).unwrap(), "images/shot.png");
        assert_eq!(copy_image(&picture, dir.path()).unwrap(), "images/shot-2.png");
        let inside = dir.path().join("pics").join("in.png");
        fs::create_dir_all(inside.parent().unwrap()).unwrap();
        fs::write(&inside, b"x").unwrap();
        assert_eq!(copy_image(&inside, dir.path()).unwrap(), "pics/in.png");
        assert_eq!(write_image(b"x", "paste.png", dir.path()).unwrap(), "images/paste.png");
    }

    #[test]
    fn places_include_home() {
        assert!(places().iter().any(|p| p.kind == "home"));
    }
}
