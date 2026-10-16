// 바탕화면 폴더와 그 안의 목록, 이름 비교 (Electron 판 src/main/desktop/files.js).

use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use super::{Entry, FileEntry};
use crate::pathx::{join, s};

fn expand_env(value: &str) -> String {
    let mut out = String::new();
    let mut rest = value;
    while let Some(open) = rest.find('%') {
        let after = &rest[open + 1..];
        match after.find('%') {
            Some(close) => {
                out.push_str(&rest[..open]);
                out.push_str(&std::env::var(&after[..close]).unwrap_or_default());
                rest = &after[close + 1..];
            }
            None => break,
        }
    }
    out.push_str(rest);
    out
}

#[cfg(windows)]
fn read_dirs() -> Vec<String> {
    let mut found = Vec::new();
    if let Some(value) = crate::reg::read_string(
        crate::reg::HKCU,
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
        "Desktop",
    ) {
        if !value.is_empty() {
            found.push(expand_env(&value));
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        found.push(join(&profile, "Desktop"));
    }
    if let Ok(public) = std::env::var("PUBLIC") {
        found.push(join(&public, "Desktop"));
    }
    found
}

#[cfg(target_os = "macos")]
fn read_dirs() -> Vec<String> {
    vec![join(&home(), "Desktop")]
}

#[cfg(all(not(windows), not(target_os = "macos")))]
fn read_dirs() -> Vec<String> {
    if let Ok(out) = std::process::Command::new("xdg-user-dir").arg("DESKTOP").output() {
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !text.is_empty() {
            return vec![text];
        }
    }
    vec![join(&home(), "Desktop")]
}

#[allow(dead_code)]
pub fn home() -> String {
    std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default()
}

// 바탕화면 폴더는 거의 바뀌지 않는다. 잠깐 기억해 두고 쓴다.
// 한 번 못 읽었을 때 담아 둔 아이콘을 바탕화면으로 되돌리는 일이 없게, 못 찾으면 앞의 것을 쓴다.
static CACHE: Mutex<Option<(Vec<String>, Instant)>> = Mutex::new(None);
const CACHE_FOR: Duration = Duration::from_secs(30);

pub fn desktop_directories() -> Vec<String> {
    if let Ok(dir) = std::env::var("MYDESKBOX_DESKTOP_DIR") {
        if !dir.is_empty() {
            return vec![dir];
        }
    }
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((dirs, at)) = cache.as_ref() {
        if at.elapsed() < CACHE_FOR {
            return dirs.clone();
        }
    }
    let mut seen = Vec::new();
    for dir in read_dirs() {
        if dir.is_empty() || seen.contains(&dir) {
            continue;
        }
        if Path::new(&dir).is_dir() {
            seen.push(dir);
        }
    }
    if !seen.is_empty() {
        *cache = Some((seen.clone(), Instant::now()));
        return seen;
    }
    cache.as_ref().map(|(d, _)| d.clone()).unwrap_or_default()
}

const SKIP: [&str; 3] = ["desktop.ini", ".localized", ".ds_store"];

// 바탕화면에 놓인 것의 이름과 자리. 파일인지 폴더인지는 보지 않는다.
pub fn desktop_entries(dirs: &[String]) -> Vec<Entry> {
    let mut found = Vec::new();
    for dir in dirs {
        let Ok(entries) = fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if SKIP.contains(&name.to_lowercase().as_str()) || name.starts_with('.') {
                continue;
            }
            found.push(Entry { path: join(dir, &name), name });
        }
    }
    found
}

pub fn list_desktop_files(entries: &[Entry]) -> Vec<FileEntry> {
    entries
        .iter()
        .filter_map(|e| {
            let meta = fs::metadata(&e.path).ok()?;
            Some(FileEntry { name: e.name.clone(), path: e.path.clone(), directory: meta.is_dir() })
        })
        .collect()
}

pub fn label_of(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".lnk") || lower.ends_with(".url") {
        name[..name.len() - 4].to_string()
    } else {
        name.to_string()
    }
}

pub fn same_name(icon_text: &str, file_name: &str) -> bool {
    let a = icon_text.trim().to_lowercase();
    let b = file_name.trim().to_lowercase();
    if a.is_empty() || b.is_empty() {
        return false;
    }
    a == b || a == label_of(&b).to_lowercase()
}

// 바탕화면 아이콘에 적힌 글과 같을 수 있는 파일 모두. 이름이 그대로 맞는 것이 있으면 그것 하나만.
pub fn match_desktop_entries<'a>(icon_text: &str, entries: &'a [super::FileEntry]) -> Vec<&'a super::FileEntry> {
    let text = icon_text.trim().to_lowercase();
    if text.is_empty() {
        return vec![];
    }
    if let Some(exact) = entries.iter().find(|e| e.name.to_lowercase() == text) {
        return vec![exact];
    }
    entries
        .iter()
        .filter(|e| {
            if e.name.is_empty() {
                return false;
            }
            let name = e.name.to_lowercase();
            if same_name(&text, &name) {
                return true;
            }
            matches!(name.rfind('.'), Some(dot) if dot > 0 && name[..dot] == text)
        })
        .collect()
}

#[allow(dead_code)]
pub fn path_string(p: &Path) -> String {
    s(p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_matching() {
        assert_eq!(label_of("앱.lnk"), "앱");
        assert_eq!(label_of("노트.txt"), "노트.txt");
        assert!(same_name("노트", "노트.lnk"));
        assert!(!same_name("", "a"));
        let entries = vec![
            FileEntry { name: "보고서.docx".into(), path: "d/보고서.docx".into(), directory: false },
            FileEntry { name: "보고서.pdf".into(), path: "d/보고서.pdf".into(), directory: false },
            FileEntry { name: "노트.txt".into(), path: "d/노트.txt".into(), directory: false },
        ];
        assert_eq!(match_desktop_entries("보고서", &entries).len(), 2);
        assert_eq!(match_desktop_entries("노트.txt", &entries).len(), 1);
        assert_eq!(match_desktop_entries("노트", &entries)[0].name, "노트.txt");
        assert!(match_desktop_entries(" ", &entries).is_empty());
        assert_eq!(expand_env("%NO_SUCH_VAR_X%\\Desk"), "\\Desk");
    }

    #[test]
    fn lists_desktop_entries_without_hidden_names() {
        let dir = tempfile::tempdir().unwrap();
        let d = s(dir.path());
        fs::write(join(&d, "a.txt"), "").unwrap();
        fs::write(join(&d, "desktop.ini"), "").unwrap();
        fs::write(join(&d, ".hidden"), "").unwrap();
        fs::create_dir(join(&d, "폴더")).unwrap();
        let entries = desktop_entries(&[d.clone()]);
        let mut names: Vec<_> = entries.iter().map(|e| e.name.clone()).collect();
        names.sort();
        assert_eq!(names, vec!["a.txt", "폴더"]);
        let files = list_desktop_files(&entries);
        assert!(files.iter().any(|f| f.name == "폴더" && f.directory));
    }
}
