//! The left panel's Explorer: the user's home and the usual places (Desktop, Documents, Downloads),
//! the drives (Windows) or `/` and the mounted volumes, and one folder's entries at a time (folders first).
//! Only names, kinds, sizes and times are read — never file contents.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct Place {
    pub id: String,
    pub path: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub dir: bool,
    pub size: u64,
    pub modified: f64,
    pub hidden: bool,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).filter(|p| p.is_dir())
}

fn text(path: &Path) -> String { path.to_string_lossy().into_owned() }

#[tauri::command]
pub fn explorer_places() -> Vec<Place> {
    let mut out = Vec::new();
    if let Some(home) = home_dir() {
        out.push(Place { id: "home".into(), name: home.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| text(&home)), path: text(&home) });
        for (id, sub) in [("desktop", "Desktop"), ("documents", "Documents"), ("downloads", "Downloads"), ("pictures", "Pictures")] {
            let p = home.join(sub);
            if p.is_dir() { out.push(Place { id: id.into(), name: sub.into(), path: text(&p) }); }
        }
    }
    #[cfg(windows)]
    for letter in b'A'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        if Path::new(&root).is_dir() { out.push(Place { id: "drive".into(), name: format!("{}:", letter as char), path: root }); }
    }
    #[cfg(not(windows))]
    {
        out.push(Place { id: "drive".into(), name: "/".into(), path: "/".into() });
        for base in ["/Volumes", "/media", "/mnt"] {
            if let Ok(read) = std::fs::read_dir(base) {
                for e in read.flatten() {
                    let p = e.path();
                    if p.is_dir() { out.push(Place { id: "drive".into(), name: e.file_name().to_string_lossy().into_owned(), path: text(&p) }); }
                }
            }
        }
    }
    out
}

fn is_hidden(name: &str, _meta: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const HIDDEN: u32 = 0x2;
        const SYSTEM: u32 = 0x4;
        if _meta.file_attributes() & (HIDDEN | SYSTEM) != 0 { return true; }
    }
    name.starts_with('.') || name.starts_with('$')
}

/// One folder's entries: folders first, then files, each sorted by name (case-insensitive).
pub fn list_dir(path: &Path, show_hidden: bool) -> Result<Vec<Entry>, String> {
    let read = std::fs::read_dir(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut out: Vec<Entry> = read.flatten().filter_map(|e| {
        let name = e.file_name().to_string_lossy().into_owned();
        let meta = e.metadata().ok()?;
        let hidden = is_hidden(&name, &meta);
        if hidden && !show_hidden { return None; }
        let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as f64).unwrap_or(0.0);
        Some(Entry { path: text(&e.path()), dir: meta.is_dir(), size: if meta.is_dir() { 0 } else { meta.len() }, modified, hidden, name })
    }).collect();
    out.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub fn explorer_list(path: String, show_hidden: Option<bool>) -> Result<Vec<Entry>, String> {
    list_dir(Path::new(&path), show_hidden.unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folders_first_then_names() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("b.md"), "x").unwrap();
        std::fs::write(dir.path().join("A.md"), "x").unwrap();
        std::fs::write(dir.path().join(".secret"), "x").unwrap();
        std::fs::create_dir(dir.path().join("zeta")).unwrap();
        let list = list_dir(dir.path(), false).unwrap();
        let names: Vec<_> = list.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["zeta", "A.md", "b.md"]);
        assert!(list[0].dir && !list[1].dir && list[1].size == 1);
        assert_eq!(list_dir(dir.path(), true).unwrap().len(), 4);
        assert!(list_dir(&dir.path().join("missing"), false).is_err());
    }

    #[test]
    fn places_include_home() {
        let places = explorer_places();
        assert!(places.iter().any(|p| p.id == "home") || home_dir().is_none());
        assert!(places.iter().any(|p| p.id == "drive"));
    }
}
