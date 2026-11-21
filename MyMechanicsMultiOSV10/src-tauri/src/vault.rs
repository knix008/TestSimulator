//! The product data vault's file access (the rules — check-out, lifecycle, revisions, references — live in
//! the front end, src/cad/vault.js). A vault is a folder the user picks (on a shared drive several people
//! use the same one): `vault.json` (the index), `files/` (latest copies), `history/<id>/<version>.mymech`
//! and `.locks/` (one lock file per checked-out file and one for the index).
//!
//! Every path the front end hands in is relative to the vault folder and checked: no absolute paths, no
//! `..`, no drive letters or streams — nothing outside the vault can be read, written or renamed. A lock
//! is taken by creating its file exclusively (`create_new`), which is atomic on local and network drives,
//! so two people can never both hold it. Nothing is ever deleted except the vault's own lock files, and the
//! exports (Pack and Go to a folder or a ZIP) never overwrite an existing file.
use crate::tr;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};

/// One file of an export: a plain file name (no folders) and its text.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Entry {
    pub name: String,
    pub content: String,
}

/// The vault folder: must be an absolute path.
fn root_of(root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root);
    if root.trim().is_empty() || !path.is_absolute() {
        return Err(tr!("보관소 폴더가 올바르지 않습니다: {root}", "The vault folder is not valid: {root}"));
    }
    Ok(path)
}

/// `root` joined with a checked relative path (forward or back slashes).
pub fn resolve(root: &str, rel: &str) -> Result<PathBuf, String> {
    let base = root_of(root)?;
    let unsafe_path = || tr!("보관소 밖을 가리키는 경로입니다: {rel}", "The path points outside the vault: {rel}");
    let parts: Vec<&str> = rel.split(['/', '\\']).collect();
    if rel.is_empty() || parts.iter().any(|p| p.is_empty() || *p == "." || *p == ".." || p.contains(':')) {
        return Err(unsafe_path());
    }
    let joined = parts.iter().fold(PathBuf::new(), |acc, p| acc.join(p));
    if joined.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(unsafe_path());
    }
    Ok(base.join(joined))
}

/// A plain file name for an export (no folders, no reserved characters).
fn plain_name(name: &str) -> Result<&str, String> {
    let bad = name.is_empty() || name == "." || name == ".." || name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control());
    if bad {
        return Err(tr!("파일 이름이 올바르지 않습니다: {name}", "The file name is not valid: {name}"));
    }
    Ok(name)
}

pub fn read(root: &str, rel: &str) -> Result<Option<String>, String> {
    let path = resolve(root, rel)?;
    if !path.is_file() {
        return Ok(None);
    }
    crate::files::read_text(&path, |_, _| {}).map(Some)
}

pub fn write(root: &str, rel: &str, content: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    crate::files::write_with_progress(&path, content.as_bytes(), |_, _| {})
}

/// Creates the file only when it does not exist yet: true = created (the lock is ours), false = it was there.
pub fn create_exclusive(root: &str, rel: &str, content: &str) -> Result<bool, String> {
    let path = resolve(root, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| tr!("폴더를 만들 수 없습니다 ({}): {error}", "Could not create the folder ({}): {error}", parent.display()))?;
    }
    match OpenOptions::new().write(true).create_new(true).open(&path) {
        Ok(mut file) => {
            file.write_all(content.as_bytes()).map_err(|error| tr!("파일 쓰기 실패 ({}): {error}", "Writing the file failed ({}): {error}", path.display()))?;
            Ok(true)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(false),
        Err(error) => Err(tr!("파일을 만들 수 없습니다 ({}): {error}", "Could not create the file ({}): {error}", path.display())),
    }
}

/// Removes one of the vault's own lock files (`.locks/*.lock`) — nothing else can be removed.
pub fn remove_lock(root: &str, rel: &str) -> Result<bool, String> {
    let normal = rel.replace('\\', "/");
    if !normal.starts_with(".locks/") || !normal.ends_with(".lock") || normal[7..].contains('/') {
        return Err(tr!("잠금 파일만 지울 수 있습니다: {rel}", "Only lock files can be removed: {rel}"));
    }
    let path = resolve(root, rel)?;
    if !path.is_file() {
        return Ok(false);
    }
    fs::remove_file(&path).map_err(|error| tr!("잠금을 풀 수 없습니다 ({}): {error}", "Could not release the lock ({}): {error}", path.display()))?;
    Ok(true)
}

/// Renames a latest copy inside `files/` (a vault rename); never over another file.
pub fn rename(root: &str, from: &str, to: &str) -> Result<(), String> {
    let inside = |rel: &str| {
        let normal = rel.replace('\\', "/");
        normal.starts_with("files/") && !normal[6..].contains('/')
    };
    if !inside(from) || !inside(to) {
        return Err(tr!("보관소의 files 폴더 안에서만 이름을 바꿀 수 있습니다", "Only files in the vault's files folder can be renamed"));
    }
    let (a, b) = (resolve(root, from)?, resolve(root, to)?);
    let same = from.to_lowercase() == to.to_lowercase();
    if b.exists() && !same {
        return Err(tr!("같은 이름의 파일이 이미 있습니다: {to}", "A file of that name exists already: {to}"));
    }
    if !a.is_file() {
        return Err(tr!("파일이 없습니다: {from}", "The file does not exist: {from}"));
    }
    fs::rename(&a, &b).map_err(|error| tr!("이름을 바꿀 수 없습니다 ({}): {error}", "Could not rename ({}): {error}", a.display()))
}

/// File names in a folder of the vault (sorted; an absent folder lists nothing).
pub fn list(root: &str, rel: &str) -> Result<Vec<String>, String> {
    let dir = if rel.is_empty() { root_of(root)? } else { resolve(root, rel)? };
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(Vec::new()) };
    let mut names: Vec<String> = entries.flatten().filter(|e| e.path().is_file()).map(|e| e.file_name().to_string_lossy().to_string()).collect();
    names.sort();
    Ok(names)
}

/// Writes the files into a folder (created when missing). Refuses — before writing anything — when one of
/// the names exists there already. Returns the written paths.
pub fn export(dir: &str, entries: &[Entry]) -> Result<Vec<PathBuf>, String> {
    let base = root_of(dir)?;
    let mut targets = Vec::new();
    for e in entries {
        let path = base.join(plain_name(&e.name)?);
        if path.exists() {
            return Err(tr!("폴더에 같은 이름의 파일이 이미 있습니다: {}", "A file of that name is in the folder already: {}", path.display()));
        }
        targets.push(path);
    }
    fs::create_dir_all(&base).map_err(|error| tr!("폴더를 만들 수 없습니다 ({}): {error}", "Could not create the folder ({}): {error}", base.display()))?;
    for (e, path) in entries.iter().zip(&targets) {
        let mut file = OpenOptions::new().write(true).create_new(true).open(path).map_err(|error| tr!("파일을 만들 수 없습니다 ({}): {error}", "Could not create the file ({}): {error}", path.display()))?;
        file.write_all(e.content.as_bytes()).map_err(|error| tr!("파일 쓰기 실패 ({}): {error}", "Writing the file failed ({}): {error}", path.display()))?;
    }
    Ok(targets)
}

// ───────────────────────── ZIP (stored, no compression: the texts are small and stay readable)

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

/// The bytes of a stored ZIP of the entries (UTF-8 names).
pub fn zip_bytes(entries: &[Entry]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for e in entries {
        let name = e.name.replace('\\', "/");
        if name.is_empty() || name.split('/').any(|p| p.is_empty() || p == "..") {
            return Err(tr!("파일 이름이 올바르지 않습니다: {}", "The file name is not valid: {}", e.name));
        }
        let data = e.content.as_bytes();
        let crc = crc32(data);
        let offset = out.len() as u32;
        let size = data.len() as u32;
        let n = name.as_bytes();
        let header = |sig: u32, central_dir: bool| {
            let mut h = Vec::new();
            h.extend_from_slice(&sig.to_le_bytes());
            if central_dir {
                h.extend_from_slice(&20u16.to_le_bytes());
            }
            h.extend_from_slice(&20u16.to_le_bytes()); // version needed
            h.extend_from_slice(&0x0800u16.to_le_bytes()); // UTF-8 names
            h.extend_from_slice(&0u16.to_le_bytes()); // stored
            h.extend_from_slice(&0u16.to_le_bytes()); // time
            h.extend_from_slice(&0x21u16.to_le_bytes()); // date 1980-01-01
            h.extend_from_slice(&crc.to_le_bytes());
            h.extend_from_slice(&size.to_le_bytes());
            h.extend_from_slice(&size.to_le_bytes());
            h.extend_from_slice(&(n.len() as u16).to_le_bytes());
            h.extend_from_slice(&0u16.to_le_bytes()); // extra
            if central_dir {
                h.extend_from_slice(&0u16.to_le_bytes()); // comment
                h.extend_from_slice(&0u16.to_le_bytes()); // disk
                h.extend_from_slice(&0u16.to_le_bytes()); // internal attributes
                h.extend_from_slice(&0u32.to_le_bytes()); // external attributes
                h.extend_from_slice(&offset.to_le_bytes());
            }
            h.extend_from_slice(n);
            h
        };
        out.extend(header(0x0403_4b50, false));
        out.extend_from_slice(data);
        central.extend(header(0x0201_4b50, true));
    }
    let start = out.len() as u32;
    let count = entries.len() as u16;
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0]);
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&(central.len() as u32).to_le_bytes());
    out.extend_from_slice(&start.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    Ok(out)
}

/// Writes a ZIP of the entries; refuses an existing file.
pub fn zip(path: &str, entries: &[Entry]) -> Result<(), String> {
    let target = root_of(path)?;
    if target.exists() {
        return Err(tr!("같은 이름의 파일이 이미 있습니다: {path}", "A file of that name exists already: {path}"));
    }
    let bytes = zip_bytes(entries)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| tr!("폴더를 만들 수 없습니다 ({}): {error}", "Could not create the folder ({}): {error}", parent.display()))?;
    }
    let mut file = OpenOptions::new().write(true).create_new(true).open(&target).map_err(|error| tr!("파일을 만들 수 없습니다 ({}): {error}", "Could not create the file ({}): {error}", target.display()))?;
    file.write_all(&bytes).map_err(|error| tr!("파일 쓰기 실패 ({}): {error}", "Writing the file failed ({}): {error}", target.display()))
}

/// The computer's name (written into lock files so others see who holds a file where).
pub fn host() -> String {
    std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "localhost".into())
}

/// Whether the folder is a vault already (has an index).
pub fn is_vault(root: &str) -> bool {
    resolve(root, "vault.json").map(|p| p.is_file()).unwrap_or(false)
}

fn exists_dir(path: &Path) -> bool {
    path.is_dir()
}

// ───────────────────────── Tauri commands

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| tr!("작업 실행 실패: {error}", "The task failed: {error}"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub exists: bool,
    pub is_vault: bool,
    pub host: String,
}

#[tauri::command]
pub async fn vault_info(root: String) -> Result<VaultInfo, String> {
    blocking(move || Ok(VaultInfo { exists: root_of(&root).map(|p| exists_dir(&p)).unwrap_or(false), is_vault: is_vault(&root), host: host() })).await
}

#[tauri::command]
pub async fn vault_read(root: String, rel: String) -> Result<Option<String>, String> {
    blocking(move || read(&root, &rel)).await
}

#[tauri::command]
pub async fn vault_write(root: String, rel: String, content: String) -> Result<(), String> {
    blocking(move || write(&root, &rel, &content)).await
}

#[tauri::command]
pub async fn vault_create_exclusive(root: String, rel: String, content: String) -> Result<bool, String> {
    blocking(move || create_exclusive(&root, &rel, &content)).await
}

#[tauri::command]
pub async fn vault_remove_lock(root: String, rel: String) -> Result<bool, String> {
    blocking(move || remove_lock(&root, &rel)).await
}

#[tauri::command]
pub async fn vault_rename(root: String, from: String, to: String) -> Result<(), String> {
    blocking(move || rename(&root, &from, &to)).await
}

#[tauri::command]
pub async fn vault_list(root: String, rel: String) -> Result<Vec<String>, String> {
    blocking(move || list(&root, &rel)).await
}

#[tauri::command]
pub async fn vault_export(dir: String, entries: Vec<Entry>) -> Result<Vec<PathBuf>, String> {
    blocking(move || export(&dir, &entries)).await
}

#[tauri::command]
pub async fn vault_zip(path: String, entries: Vec<Entry>) -> Result<(), String> {
    blocking(move || zip(&path, &entries)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let s = dir.path().to_string_lossy().to_string();
        (dir, s)
    }

    #[test]
    fn paths_outside_the_vault_are_refused() {
        let (_d, r) = root();
        for bad in ["", "../x", "a/../../x", "/etc/passwd", "C:\\x", "a//b", "./a", "a:stream", "files\\..\\..\\x"] {
            assert!(resolve(&r, bad).is_err(), "{bad} should be refused");
        }
        assert!(resolve(&r, "files/a.mymech").unwrap().starts_with(&r));
        assert!(resolve("relative/root", "a").is_err());
    }

    #[test]
    fn write_read_and_list_round_trip() {
        let (_d, r) = root();
        assert_eq!(read(&r, "vault.json").unwrap(), None);
        write(&r, "history/f1/1.mymech", "{\"a\":1}").unwrap();
        write(&r, "history/f1/2.mymech", "two").unwrap();
        assert_eq!(read(&r, "history/f1/1.mymech").unwrap().as_deref(), Some("{\"a\":1}"));
        assert_eq!(list(&r, "history/f1").unwrap(), vec!["1.mymech", "2.mymech"]);
        assert!(list(&r, "nothing").unwrap().is_empty());
        assert!(!is_vault(&r));
        write(&r, "vault.json", "{}").unwrap();
        assert!(is_vault(&r));
    }

    #[test]
    fn exclusive_create_is_a_lock_only_one_can_take() {
        let (_d, r) = root();
        assert!(create_exclusive(&r, ".locks/f1.lock", "alice").unwrap());
        assert!(!create_exclusive(&r, ".locks/f1.lock", "bob").unwrap());
        assert_eq!(read(&r, ".locks/f1.lock").unwrap().as_deref(), Some("alice"));
        assert!(remove_lock(&r, ".locks/f1.lock").unwrap());
        assert!(!remove_lock(&r, ".locks/f1.lock").unwrap());
        assert!(create_exclusive(&r, ".locks/f1.lock", "bob").unwrap());
    }

    #[test]
    fn exclusive_create_from_many_threads_has_one_winner() {
        let (_d, r) = root();
        let handles: Vec<_> = (0..16).map(|i| { let r = r.clone(); std::thread::spawn(move || create_exclusive(&r, ".locks/index.lock", &format!("t{i}")).unwrap()) }).collect();
        let winners = handles.into_iter().map(|h| h.join().unwrap()).filter(|w| *w).count();
        assert_eq!(winners, 1);
    }

    #[test]
    fn only_lock_files_can_be_removed() {
        let (_d, r) = root();
        write(&r, "files/a.mymech", "x").unwrap();
        write(&r, "vault.json", "{}").unwrap();
        assert!(remove_lock(&r, "files/a.mymech").is_err());
        assert!(remove_lock(&r, "vault.json").is_err());
        assert!(remove_lock(&r, ".locks/../vault.json").is_err());
        assert!(remove_lock(&r, ".locks/sub/x.lock").is_err());
        assert!(read(&r, "files/a.mymech").unwrap().is_some());
    }

    #[test]
    fn rename_stays_in_files_and_never_overwrites() {
        let (_d, r) = root();
        write(&r, "files/a.mymech", "A").unwrap();
        write(&r, "files/b.mymech", "B").unwrap();
        assert!(rename(&r, "files/a.mymech", "files/b.mymech").is_err());
        assert!(rename(&r, "files/a.mymech", "history/a.mymech").is_err());
        assert!(rename(&r, "vault.json", "files/v.json").is_err());
        rename(&r, "files/a.mymech", "files/c.mymech").unwrap();
        assert_eq!(read(&r, "files/c.mymech").unwrap().as_deref(), Some("A"));
        assert_eq!(read(&r, "files/a.mymech").unwrap(), None);
        assert_eq!(read(&r, "files/b.mymech").unwrap().as_deref(), Some("B"));
    }

    #[test]
    fn export_refuses_existing_files_before_writing_any() {
        let (d, _r) = root();
        let out = d.path().join("pack");
        let out_s = out.to_string_lossy().to_string();
        let entries = vec![Entry { name: "a.mymech".into(), content: "A".into() }, Entry { name: "b.mymech".into(), content: "B".into() }];
        let written = export(&out_s, &entries).unwrap();
        assert_eq!(written.len(), 2);
        assert_eq!(fs::read_to_string(out.join("b.mymech")).unwrap(), "B");
        let again = vec![Entry { name: "c.mymech".into(), content: "C".into() }, Entry { name: "a.mymech".into(), content: "new".into() }];
        assert!(export(&out_s, &again).is_err());
        assert!(!out.join("c.mymech").exists());
        assert_eq!(fs::read_to_string(out.join("a.mymech")).unwrap(), "A");
        assert!(export(&out_s, &[Entry { name: "../x".into(), content: String::new() }]).is_err());
    }

    #[test]
    fn zip_has_every_entry_with_its_crc_and_is_never_overwritten() {
        let (d, _r) = root();
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        let entries = vec![Entry { name: "a.mymech".into(), content: "hello".into() }, Entry { name: "sub/b.json".into(), content: "{}".into() }];
        let bytes = zip_bytes(&entries).unwrap();
        assert_eq!(&bytes[0..4], &[0x50, 0x4b, 0x03, 0x04]);
        let eocd = bytes.len() - 22;
        assert_eq!(&bytes[eocd..eocd + 4], &[0x50, 0x4b, 0x05, 0x06]);
        assert_eq!(u16::from_le_bytes([bytes[eocd + 10], bytes[eocd + 11]]), 2);
        assert_eq!(u32::from_le_bytes(bytes[14..18].try_into().unwrap()), crc32(b"hello"));
        assert!(bytes.windows(5).any(|w| w == b"hello"));
        let path = d.path().join("pack.zip").to_string_lossy().to_string();
        zip(&path, &entries).unwrap();
        assert!(zip(&path, &entries).is_err());
        assert!(zip_bytes(&[Entry { name: "../evil".into(), content: String::new() }]).is_err());
    }
}
