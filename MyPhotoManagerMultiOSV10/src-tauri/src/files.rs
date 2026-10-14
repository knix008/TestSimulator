//! File-system work for the browser: folder listings, the places shown at the
//! top of the folder tree, and the file operations (copy, move, rename, delete,
//! new folder, time stamps). Everything here is plain `std::fs` so it can be
//! tested without a window.
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::tr;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    /// Milliseconds since 1970 (0 when unknown).
    pub modified: f64,
    pub created: f64,
    pub hidden: bool,
    /// Folders only: whether the folder has sub-folders (for the tree's expand arrow).
    pub has_dirs: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub path: String,
    pub dirs: Vec<Entry>,
    pub files: Vec<Entry>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub name: String,
    pub path: String,
    /// drive | home | pictures | desktop | documents | downloads | volume | root
    pub kind: String,
    /// Drives and volumes: the volume label ("" when none).
    pub label: String,
    /// Drives: fixed | removable | network | cdrom | ram | "" (unknown).
    pub media: String,
    /// Bytes on the volume and free for the user (0 when unknown, e.g. no disc).
    pub total: u64,
    pub free: u64,
}

impl Place {
    fn at(name: impl Into<String>, path: impl Into<String>, kind: &str) -> Self {
        Place { name: name.into(), path: path.into(), kind: kind.into(), label: String::new(), media: String::new(), total: 0, free: 0 }
    }
}

/// Every drive letter Windows has, even without media (an empty card reader
/// or DVD drive), with its label, type and space.
#[cfg(windows)]
fn windows_drives() -> Vec<Place> {
    use windows_sys::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW};
    let wide = |text: &str| text.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let mask = unsafe { GetLogicalDrives() };
    let mut out = Vec::new();
    for index in 0..26u32 {
        if mask & (1 << index) == 0 {
            continue;
        }
        let letter = (b'A' + index as u8) as char;
        let root = format!("{letter}:\\");
        let root_w = wide(&root);
        let media = match unsafe { GetDriveTypeW(root_w.as_ptr()) } {
            2 => "removable",
            3 => "fixed",
            4 => "network",
            5 => "cdrom",
            6 => "ram",
            _ => "",
        };
        let mut place = Place::at(format!("{letter}:"), root.clone(), "drive");
        place.media = media.into();
        // Removable and optical drives without media: no label or size (and no slow wait).
        let mut label = [0u16; 261];
        let ok = unsafe { GetVolumeInformationW(root_w.as_ptr(), label.as_mut_ptr(), label.len() as u32, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), 0) };
        if ok != 0 {
            let end = label.iter().position(|&c| c == 0).unwrap_or(0);
            place.label = String::from_utf16_lossy(&label[..end]);
            let (mut free, mut total) = (0u64, 0u64);
            if unsafe { GetDiskFreeSpaceExW(root_w.as_ptr(), &mut free, &mut total, std::ptr::null_mut()) } != 0 {
                place.free = free;
                place.total = total;
            }
        }
        out.push(place);
    }
    out
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub source: String,
    /// Where the item ended up (None when it failed or was skipped).
    pub target: Option<String>,
    pub error: Option<String>,
    pub skipped: bool,
}

fn millis(time: std::io::Result<SystemTime>) -> f64 {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

pub fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(windows)]
fn is_hidden(name: &str, meta: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    name.starts_with('.') || meta.file_attributes() & (HIDDEN | SYSTEM) != 0
}

#[cfg(not(windows))]
fn is_hidden(name: &str, _meta: &fs::Metadata) -> bool {
    name.starts_with('.')
}

/// Does the folder have at least one sub-folder? Stops at the first one, and
/// gives up after a few thousand entries (huge flat folders stay cheap).
pub fn has_subdirs(path: &Path, show_hidden: bool) -> bool {
    let Ok(read) = fs::read_dir(path) else { return false };
    for entry in read.flatten().take(4000) {
        let Ok(kind) = entry.file_type() else { continue };
        let is_dir = kind.is_dir() || (kind.is_symlink() && entry.path().is_dir());
        if !is_dir {
            continue;
        }
        if show_hidden {
            return true;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.metadata().map(|meta| !is_hidden(&name, &meta)).unwrap_or(true) {
            return true;
        }
    }
    false
}

fn entry_of(path: &Path, meta: &fs::Metadata, show_hidden: bool, probe_dirs: bool) -> Entry {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path_text(path));
    let is_dir = meta.is_dir();
    Entry {
        hidden: is_hidden(&name, meta),
        name,
        path: path_text(path),
        is_dir,
        size: if is_dir { 0 } else { meta.len() },
        modified: millis(meta.modified()),
        created: millis(meta.created()),
        has_dirs: is_dir && probe_dirs && has_subdirs(path, show_hidden),
    }
}

/// Folders and files of `dir`, each sorted by name (case-insensitive). Hidden
/// entries are left out unless `show_hidden`. `probe_dirs` fills `has_dirs`.
pub fn list_dir(dir: &Path, show_hidden: bool, probe_dirs: bool) -> Result<Listing, String> {
    let read = fs::read_dir(dir).map_err(|error| tr!("폴더를 열 수 없습니다: {} ({error})", "Cannot open the folder: {} ({error})", dir.display()))?;
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for item in read.flatten() {
        let path = item.path();
        // Follow links so a linked folder browses like a folder.
        let Ok(meta) = fs::metadata(&path).or_else(|_| item.metadata()) else { continue };
        let entry = entry_of(&path, &meta, show_hidden, probe_dirs);
        if entry.hidden && !show_hidden {
            continue;
        }
        if entry.is_dir {
            dirs.push(entry);
        } else {
            files.push(entry);
        }
    }
    let key = |entry: &Entry| entry.name.to_lowercase();
    dirs.sort_by_key(key);
    files.sort_by_key(key);
    Ok(Listing { path: path_text(dir), dirs, files })
}

/// Size, times and kind of each path (None for paths that no longer exist).
pub fn stat_paths(paths: &[PathBuf]) -> Vec<Option<Entry>> {
    paths.iter().map(|path| fs::metadata(path).ok().map(|meta| entry_of(path, &meta, true, false))).collect()
}

/// Every image-like file under `dir` (recursively), for cataloguing a folder tree.
pub fn walk_files(dir: &Path, show_hidden: bool, extensions: &[String], limit: usize) -> Vec<Entry> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(next) = stack.pop() {
        let Ok(listing) = list_dir(&next, show_hidden, false) else { continue };
        for file in listing.files {
            let ext = Path::new(&file.name).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if extensions.is_empty() || extensions.iter().any(|wanted| wanted == &ext) {
                out.push(file);
                if out.len() >= limit {
                    return out;
                }
            }
        }
        for sub in listing.dirs.into_iter().rev() {
            stack.push(PathBuf::from(sub.path));
        }
    }
    out
}

/// Places at the top of the folder tree: home folders, then drives / volumes.
pub fn places() -> Vec<Place> {
    let mut out = Vec::new();
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    if let Some(home) = &home {
        out.push(Place::at(home.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(), path_text(home), "home"));
        for (sub, kind) in [("Pictures", "pictures"), ("Desktop", "desktop"), ("Documents", "documents"), ("Downloads", "downloads")] {
            let path = home.join(sub);
            if path.is_dir() {
                out.push(Place::at(sub, path_text(&path), kind));
            }
        }
    }
    #[cfg(windows)]
    out.extend(windows_drives());
    #[cfg(target_os = "macos")]
    {
        out.push(Place::at("/", "/", "root"));
        if let Ok(read) = fs::read_dir("/Volumes") {
            for item in read.flatten() {
                out.push(Place::at(item.file_name().to_string_lossy().into_owned(), path_text(&item.path()), "volume"));
            }
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        out.push(Place::at("/", "/", "root"));
        let user = std::env::var("USER").unwrap_or_default();
        for base in [format!("/media/{user}"), format!("/run/media/{user}"), "/mnt".into()] {
            if let Ok(read) = fs::read_dir(&base) {
                for item in read.flatten() {
                    if item.path().is_dir() {
                        out.push(Place::at(item.file_name().to_string_lossy().into_owned(), path_text(&item.path()), "volume"));
                    }
                }
            }
        }
    }
    out
}

/// A file name the user typed: not empty, no path separators, no characters
/// Windows refuses, not "." / "..".
pub fn check_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err(tr!("이름이 비어 있거나 올바르지 않습니다.", "The name is empty or not valid."));
    }
    if trimmed.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control()) {
        return Err(tr!("이름에 쓸 수 없는 문자가 있습니다: \\ / : * ? \" < > |", "The name contains a character that is not allowed: \\ / : * ? \" < > |"));
    }
    Ok(())
}

/// `dir/name`, or `dir/name (2).ext`, `(3)`, … when that is taken.
pub fn unique_target(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let path = Path::new(name);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| name.to_string());
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..).map(|n| dir.join(format!("{stem} ({n}){ext}"))).find(|candidate| !candidate.exists()).expect("unbounded")
}

fn copy_recursive(source: &Path, target: &Path) -> std::io::Result<()> {
    if source.is_dir() {
        fs::create_dir_all(target)?;
        for item in fs::read_dir(source)? {
            let item = item?;
            copy_recursive(&item.path(), &target.join(item.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(source, target).map(|_| ())
    }
}

/// What to do when the destination already has an item of that name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Conflict {
    /// Keep both: the new one gets " (2)" etc.
    Rename,
    Overwrite,
    Skip,
}

fn destination(source: &Path, dir: &Path, conflict: Conflict) -> Result<Option<PathBuf>, String> {
    let name = source.file_name().ok_or_else(|| tr!("이름 없는 경로입니다.", "The path has no name."))?;
    let plain = dir.join(name);
    if same_path(source, &plain) {
        // Copying into its own folder always makes a copy next to it.
        return Ok(Some(unique_target(dir, &name.to_string_lossy())));
    }
    if !plain.exists() {
        return Ok(Some(plain));
    }
    Ok(match conflict {
        Conflict::Rename => Some(unique_target(dir, &name.to_string_lossy())),
        Conflict::Overwrite => Some(plain),
        Conflict::Skip => None,
    })
}

fn same_path(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

fn inside(child: &Path, parent: &Path) -> bool {
    match (fs::canonicalize(child), fs::canonicalize(parent)) {
        (Ok(child), Ok(parent)) => child.starts_with(parent),
        _ => false,
    }
}

pub fn copy_into(sources: &[PathBuf], dir: &Path, conflict: Conflict) -> Vec<OpResult> {
    sources.iter().map(|source| transfer(source, dir, conflict, false)).collect()
}

pub fn move_into(sources: &[PathBuf], dir: &Path, conflict: Conflict) -> Vec<OpResult> {
    sources.iter().map(|source| transfer(source, dir, conflict, true)).collect()
}

fn transfer(source: &Path, dir: &Path, conflict: Conflict, moving: bool) -> OpResult {
    let mut result = OpResult { source: path_text(source), target: None, error: None, skipped: false };
    if !source.exists() {
        result.error = Some(tr!("원본이 없습니다.", "The source no longer exists."));
        return result;
    }
    if source.is_dir() && inside(dir, source) {
        result.error = Some(tr!("폴더를 자기 안으로 옮기거나 복사할 수 없습니다.", "A folder cannot be copied or moved into itself."));
        return result;
    }
    if moving && source.parent().map(|parent| same_path(parent, dir)).unwrap_or(false) {
        result.skipped = true;
        result.target = Some(path_text(source));
        return result;
    }
    let target = match destination(source, dir, conflict) {
        Ok(Some(target)) => target,
        Ok(None) => {
            result.skipped = true;
            return result;
        }
        Err(error) => {
            result.error = Some(error);
            return result;
        }
    };
    let outcome = (|| -> std::io::Result<()> {
        if target.exists() && conflict == Conflict::Overwrite {
            if target.is_dir() { fs::remove_dir_all(&target)?; } else { fs::remove_file(&target)?; }
        }
        if moving {
            // A rename fails across drives: copy, then delete the source.
            if fs::rename(source, &target).is_err() {
                copy_recursive(source, &target)?;
                if source.is_dir() { fs::remove_dir_all(source)?; } else { fs::remove_file(source)?; }
            }
            Ok(())
        } else {
            copy_recursive(source, &target)
        }
    })();
    match outcome {
        Ok(()) => result.target = Some(path_text(&target)),
        Err(error) => result.error = Some(error.to_string()),
    }
    result
}

/// Renames `path` within its folder. Fails if the new name is taken (other
/// than by the same file with different letter case).
pub fn rename_entry(path: &Path, new_name: &str) -> Result<PathBuf, String> {
    check_name(new_name)?;
    let parent = path.parent().ok_or_else(|| tr!("이름을 바꿀 수 없는 경로입니다.", "This path cannot be renamed."))?;
    let target = parent.join(new_name.trim());
    if target.exists() && !same_path(path, &target) {
        return Err(tr!("같은 이름이 이미 있습니다: {}", "An item with that name already exists: {}", new_name.trim()));
    }
    fs::rename(path, &target).map_err(|error| tr!("이름을 바꾸지 못했습니다: {error}", "Could not rename: {error}"))?;
    Ok(target)
}

pub fn create_dir(parent: &Path, name: &str) -> Result<PathBuf, String> {
    check_name(name)?;
    let target = parent.join(name.trim());
    if target.exists() {
        return Err(tr!("같은 이름이 이미 있습니다: {}", "An item with that name already exists: {}", name.trim()));
    }
    fs::create_dir(&target).map_err(|error| tr!("폴더를 만들지 못했습니다: {error}", "Could not create the folder: {error}"))?;
    Ok(target)
}

/// Deletes for good (`to_trash == false`) or moves to the recycle bin / trash.
pub fn delete_entries(paths: &[PathBuf], to_trash: bool) -> Vec<OpResult> {
    paths
        .iter()
        .map(|path| {
            let mut result = OpResult { source: path_text(path), target: None, error: None, skipped: false };
            let outcome = if to_trash {
                trash::delete(path).map_err(|error| error.to_string())
            } else if path.is_dir() {
                fs::remove_dir_all(path).map_err(|error| error.to_string())
            } else {
                fs::remove_file(path).map_err(|error| error.to_string())
            };
            if let Err(error) = outcome {
                result.error = Some(error);
            }
            result
        })
        .collect()
}

/// Sets the modified time (milliseconds since 1970).
pub fn set_modified(path: &Path, millis: f64) -> Result<(), String> {
    let seconds = (millis / 1000.0).floor() as i64;
    let nanos = ((millis - seconds as f64 * 1000.0) * 1_000_000.0).max(0.0) as u32;
    filetime::set_file_mtime(path, filetime::FileTime::from_unix_time(seconds, nanos)).map_err(|error| error.to_string())
}

/// Writes through a temporary file next to the target, then renames, so a crash
/// never leaves half an image.
pub fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or_else(|| tr!("저장할 폴더가 없습니다.", "There is no folder to save into."))?;
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let temporary = dir.join(format!(".{name}.myphoto-tmp"));
    fs::write(&temporary, data).map_err(|error| tr!("저장하지 못했습니다: {error}", "Could not save: {error}"))?;
    if let Err(error) = fs::rename(&temporary, path) {
        // Windows refuses to rename over a file that another program holds open.
        let fallback = fs::write(path, data);
        let _ = fs::remove_file(&temporary);
        fallback.map_err(|_| tr!("저장하지 못했습니다: {error}", "Could not save: {error}"))?;
    }
    Ok(())
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub copied: usize,
    pub updated: usize,
    pub deleted: usize,
    pub unchanged: usize,
    pub errors: Vec<String>,
}

/// One-way folder synchronisation: files that are new or newer (by modified
/// time, or a different size) in `source` are copied to `target`; with
/// `mirror`, files in `target` that are not in `source` are deleted.
/// `extensions` (lower case, empty = all) limits which files take part.
pub fn sync_dirs(source: &Path, target: &Path, mirror: bool, extensions: &[String]) -> Result<SyncReport, String> {
    if !source.is_dir() {
        return Err(tr!("원본 폴더가 없습니다.", "The source folder does not exist."));
    }
    if same_path(source, target) || inside(target, source) {
        return Err(tr!("같은 폴더나 원본 안의 폴더로는 동기화할 수 없습니다.", "A folder cannot be synchronised with itself or a folder inside it."));
    }
    let mut report = SyncReport::default();
    sync_recursive(source, target, mirror, extensions, &mut report);
    Ok(report)
}

fn wanted(path: &Path, extensions: &[String]) -> bool {
    extensions.is_empty() || path.extension().map(|e| extensions.contains(&e.to_string_lossy().to_lowercase())).unwrap_or(false)
}

fn sync_recursive(source: &Path, target: &Path, mirror: bool, extensions: &[String], report: &mut SyncReport) {
    if let Err(error) = fs::create_dir_all(target) {
        report.errors.push(format!("{}: {error}", target.display()));
        return;
    }
    let Ok(read) = fs::read_dir(source) else { return };
    let mut seen = std::collections::HashSet::new();
    for item in read.flatten() {
        let from = item.path();
        let name = item.file_name();
        seen.insert(name.to_string_lossy().to_lowercase());
        let to = target.join(&name);
        if from.is_dir() {
            sync_recursive(&from, &to, mirror, extensions, report);
            continue;
        }
        if !wanted(&from, extensions) {
            continue;
        }
        let (Ok(a), b) = (fs::metadata(&from), fs::metadata(&to).ok()) else { continue };
        let newer = match &b {
            None => true,
            Some(b) => a.len() != b.len() || millis(a.modified()) > millis(b.modified()) + 2000.0,
        };
        if !newer {
            report.unchanged += 1;
            continue;
        }
        match fs::copy(&from, &to) {
            Ok(_) => {
                // Keep the source's time stamp so the next run sees the files as equal.
                if let Ok(time) = a.modified() {
                    let _ = filetime::set_file_mtime(&to, filetime::FileTime::from_system_time(time));
                }
                if b.is_some() { report.updated += 1 } else { report.copied += 1 }
            }
            Err(error) => report.errors.push(format!("{}: {error}", from.display())),
        }
    }
    if mirror {
        let Ok(read) = fs::read_dir(target) else { return };
        for item in read.flatten() {
            let path = item.path();
            if seen.contains(&item.file_name().to_string_lossy().to_lowercase()) {
                continue;
            }
            if path.is_file() && !wanted(&path, extensions) {
                continue;
            }
            let outcome = if path.is_dir() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
            match outcome {
                Ok(()) => report.deleted += 1,
                Err(error) => report.errors.push(format!("{}: {error}", path.display())),
            }
        }
    }
}

/// Stable short name for a path (FNV-1a), used for the backups of originals.
pub fn path_key(path: &Path) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in path_text(path).to_lowercase().bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn lists_folders_and_files_sorted_without_hidden() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("b.jpg"), "b");
        touch(&dir.path().join("A.png"), "aa");
        touch(&dir.path().join(".hidden.jpg"), "h");
        touch(&dir.path().join("Zeta/inner/x.jpg"), "x");
        fs::create_dir(dir.path().join("alpha")).unwrap();
        let listing = list_dir(dir.path(), false, true).unwrap();
        let names: Vec<_> = listing.files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["A.png", "b.jpg"]);
        assert_eq!(listing.files[0].size, 2);
        assert!(listing.files[0].modified > 0.0);
        let dirs: Vec<_> = listing.dirs.iter().map(|d| (d.name.as_str(), d.has_dirs)).collect();
        assert_eq!(dirs, [("alpha", false), ("Zeta", true)]);
        assert_eq!(list_dir(dir.path(), true, false).unwrap().files.len(), 3, "hidden files when asked");
        assert!(list_dir(&dir.path().join("missing"), false, false).is_err());
    }

    #[test]
    fn walks_a_tree_for_wanted_extensions() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("a.jpg"), "");
        touch(&dir.path().join("notes.txt"), "");
        touch(&dir.path().join("2024/b.JPG"), "");
        touch(&dir.path().join("2024/deep/c.png"), "");
        let found = walk_files(dir.path(), false, &["jpg".into(), "png".into()], 100);
        let mut names: Vec<_> = found.iter().map(|f| f.name.clone()).collect();
        names.sort();
        assert_eq!(names, ["a.jpg", "b.JPG", "c.png"]);
        assert_eq!(walk_files(dir.path(), false, &[], 2).len(), 2, "limit");
    }

    #[test]
    fn unique_names_keep_both() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("p.jpg"), "");
        touch(&dir.path().join("p (2).jpg"), "");
        assert_eq!(unique_target(dir.path(), "q.jpg"), dir.path().join("q.jpg"));
        assert_eq!(unique_target(dir.path(), "p.jpg"), dir.path().join("p (3).jpg"));
    }

    #[test]
    fn copies_and_moves_with_conflict_rules() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        let dst = dir.path().join("dst");
        touch(&src.join("one.jpg"), "new");
        touch(&src.join("album/two.jpg"), "2");
        touch(&dst.join("one.jpg"), "old");

        let skipped = copy_into(&[src.join("one.jpg")], &dst, Conflict::Skip);
        assert!(skipped[0].skipped);
        assert_eq!(fs::read_to_string(dst.join("one.jpg")).unwrap(), "old");

        let renamed = copy_into(&[src.join("one.jpg")], &dst, Conflict::Rename);
        assert_eq!(renamed[0].target.as_deref(), Some(path_text(&dst.join("one (2).jpg")).as_str()));

        let over = copy_into(&[src.join("one.jpg")], &dst, Conflict::Overwrite);
        assert!(over[0].error.is_none());
        assert_eq!(fs::read_to_string(dst.join("one.jpg")).unwrap(), "new");

        let moved = move_into(&[src.join("album")], &dst, Conflict::Rename);
        assert!(moved[0].error.is_none(), "{:?}", moved[0].error);
        assert!(dst.join("album/two.jpg").exists());
        assert!(!src.join("album").exists());

        let into_itself = copy_into(&[dst.clone()], &dst.join("album"), Conflict::Rename);
        assert!(into_itself[0].error.is_some());

        let same_folder = copy_into(&[dst.join("one.jpg")], &dst, Conflict::Skip);
        assert_eq!(same_folder[0].target.as_deref(), Some(path_text(&dst.join("one (3).jpg")).as_str()), "copy into own folder makes a copy");
    }

    #[test]
    fn renames_and_checks_names() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("a.jpg"), "a");
        touch(&dir.path().join("b.jpg"), "b");
        assert!(rename_entry(&dir.path().join("a.jpg"), "b.jpg").is_err(), "taken");
        assert!(rename_entry(&dir.path().join("a.jpg"), "x/y.jpg").is_err(), "separator");
        assert!(rename_entry(&dir.path().join("a.jpg"), "  ").is_err(), "empty");
        let renamed = rename_entry(&dir.path().join("a.jpg"), "c.jpg").unwrap();
        assert_eq!(fs::read_to_string(renamed).unwrap(), "a");
        let case_only = rename_entry(&dir.path().join("c.jpg"), "C.jpg").unwrap();
        assert!(case_only.exists());
        assert!(create_dir(dir.path(), "new").unwrap().is_dir());
        assert!(create_dir(dir.path(), "new").is_err());
    }

    #[test]
    fn deletes_permanently_and_sets_times() {
        let dir = tempfile::tempdir().unwrap();
        touch(&dir.path().join("a.jpg"), "a");
        touch(&dir.path().join("f/b.jpg"), "b");
        set_modified(&dir.path().join("a.jpg"), 1_600_000_000_000.0).unwrap();
        let entry = stat_paths(&[dir.path().join("a.jpg"), dir.path().join("nope")]);
        assert_eq!(entry[0].as_ref().unwrap().modified, 1_600_000_000_000.0);
        assert!(entry[1].is_none());
        let results = delete_entries(&[dir.path().join("a.jpg"), dir.path().join("f")], false);
        assert!(results.iter().all(|r| r.error.is_none()));
        assert!(!dir.path().join("a.jpg").exists() && !dir.path().join("f").exists());
    }

    #[test]
    fn atomic_writes_replace_contents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub/x.jpg");
        write_atomic(&path, b"one").unwrap();
        write_atomic(&path, b"two").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"two");
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1, "no temporary file left");
        assert_eq!(path_key(&path), path_key(Path::new(&path_text(&path).to_uppercase())));
    }

    #[test]
    fn synchronises_new_changed_and_extra_files() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        let dst = dir.path().join("dst");
        touch(&src.join("a.jpg"), "a");
        touch(&src.join("sub/b.jpg"), "b");
        touch(&src.join("notes.txt"), "t");
        let only_jpg = vec!["jpg".to_string()];
        let first = sync_dirs(&src, &dst, false, &only_jpg).unwrap();
        assert_eq!((first.copied, first.updated, first.unchanged), (2, 0, 0));
        assert!(dst.join("sub/b.jpg").exists() && !dst.join("notes.txt").exists());
        let second = sync_dirs(&src, &dst, false, &only_jpg).unwrap();
        assert_eq!((second.copied, second.updated, second.unchanged), (0, 0, 2), "time stamps kept → unchanged");
        touch(&src.join("a.jpg"), "changed!");
        touch(&dst.join("extra.jpg"), "x");
        touch(&dst.join("keep.txt"), "x");
        let third = sync_dirs(&src, &dst, true, &only_jpg).unwrap();
        assert_eq!((third.updated, third.deleted), (1, 1));
        assert_eq!(fs::read_to_string(dst.join("a.jpg")).unwrap(), "changed!");
        assert!(!dst.join("extra.jpg").exists() && dst.join("keep.txt").exists(), "mirror only removes wanted files");
        assert!(sync_dirs(&dir.path().join("none"), &dst, false, &[]).is_err());
    }

    #[test]
    fn places_include_home() {
        let list = places();
        assert!(list.iter().any(|p| p.kind == "home"));
        assert!(list.iter().any(|p| p.kind == "drive" || p.kind == "root"));
    }
}
