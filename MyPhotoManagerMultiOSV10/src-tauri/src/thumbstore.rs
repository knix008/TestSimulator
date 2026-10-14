//! Thumbnails stored per directory: `<data>/thumbnails/<hash of the folder>/`
//! holds `index.json` (one record per picture: name, size, time, pixel size,
//! metadata, image file) and the thumbnail images. Opening a folder reads one
//! index and shows its thumbnails at once; the page makes the missing ones in
//! the background and writes them here.

use std::fs;
use std::path::{Path, PathBuf};

/// Folder of one directory's thumbnails (same folder for the same directory,
/// whatever the case of the letters on Windows or a trailing separator).
pub fn store_for(root: &Path, dir: &str) -> PathBuf {
    root.join(format!("{:016x}", fnv1a(&normalize(dir))))
}

fn normalize(dir: &str) -> String {
    let trimmed = dir.trim_end_matches(['/', '\\']);
    let unified = if trimmed.is_empty() { dir } else { trimmed }.replace('\\', "/");
    if cfg!(windows) { unified.to_lowercase() } else { unified }
}

fn fnv1a(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash
}

/// A file name inside a store: 1–64 ASCII letters/digits, '-', '_', '.', not starting with '.'.
pub fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && !name.starts_with('.') && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

pub fn read_index(root: &Path, dir: &str) -> Option<String> {
    fs::read_to_string(store_for(root, dir).join("index.json")).ok()
}

pub fn write_index(root: &Path, dir: &str, json: &str) -> Result<(), String> {
    let store = store_for(root, dir);
    fs::create_dir_all(&store).map_err(|e| e.to_string())?;
    crate::files::write_atomic(&store.join("index.json"), json.as_bytes())
}

/// Writes one thumbnail image; returns its full path.
pub fn put(root: &Path, dir: &str, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    if !valid_name(name) {
        return Err(format!("bad thumbnail name: {name}"));
    }
    let store = store_for(root, dir);
    fs::create_dir_all(&store).map_err(|e| e.to_string())?;
    let path = store.join(name);
    crate::files::write_atomic(&path, bytes)?;
    Ok(path)
}

/// Number of thumbnail images in all stores.
pub fn count(root: &Path) -> usize {
    let Ok(stores) = fs::read_dir(root) else { return 0 };
    stores
        .flatten()
        .filter_map(|store| fs::read_dir(store.path()).ok())
        .map(|files| files.flatten().filter(|f| f.file_name().to_string_lossy() != "index.json").count())
        .sum()
}

pub fn clear(root: &Path) -> Result<(), String> {
    if root.exists() {
        fs::remove_dir_all(root).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_store_per_directory() {
        let root = Path::new("/data/thumbnails");
        assert_eq!(store_for(root, "C:\\Photos\\Trip"), store_for(root, "C:\\Photos\\Trip\\"));
        assert_ne!(store_for(root, "C:\\Photos\\Trip"), store_for(root, "C:\\Photos\\Other"));
        if cfg!(windows) {
            assert_eq!(store_for(root, "C:\\Photos\\Trip"), store_for(root, "c:/photos/trip"));
        }
    }

    #[test]
    fn index_and_images_round_trip() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("thumbnails");
        assert_eq!(read_index(&root, "/pictures"), None);
        let path = put(&root, "/pictures", "a1b2.webp", b"RIFF").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"RIFF");
        write_index(&root, "/pictures", "{\"v\":1}").unwrap();
        assert_eq!(read_index(&root, "/pictures").as_deref(), Some("{\"v\":1}"));
        put(&root, "/other", "c3.webp", b"x").unwrap();
        assert_eq!(count(&root), 2);
        assert!(put(&root, "/pictures", "../escape.webp", b"x").is_err());
        clear(&root).unwrap();
        assert_eq!(count(&root), 0);
    }
}
