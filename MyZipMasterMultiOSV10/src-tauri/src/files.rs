//! The file manager side: looking at folders. Nothing here changes or removes the user's files
//! except creating a new folder when asked.

use serde::Serialize;
use zipmaster_core::{OsFs, Vfs};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    name: String,
    path: String,
    is_dir: bool,
    is_link: bool,
    size: u64,
    mtime: Option<i64>,
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<Item>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let fs = OsFs;
        let mut items: Vec<Item> = fs
            .read_dir(&path)
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|d| Item {
                path: fs.join(&path, &d.name),
                name: d.name,
                is_dir: d.meta.is_dir,
                is_link: d.meta.is_symlink,
                size: d.meta.size,
                mtime: d.meta.mtime,
            })
            .collect();
        if let Ok(home) = std::env::var("MYZIPMASTER_SAMPLE_HOME") {
            let inside_home = std::path::Path::new(&path).starts_with(&home);
            if !inside_home {
                items.retain(|item| std::path::Path::new(&home).starts_with(&item.path));
            }
        }
        items.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        Ok(items)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct Root {
    name: String,
    path: String,
    kind: &'static str,
}

/// Where the tree starts: the usual folders, then the drives.
#[tauri::command]
pub async fn fs_roots() -> Vec<Root> {
    tauri::async_runtime::spawn_blocking(roots).await.unwrap_or_default()
}

/// The letters in use, from the system's table: asking a disconnected network drive whether it
/// exists can take many seconds.
#[cfg(windows)]
fn drive_letters() -> Vec<char> {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetLogicalDrives() -> u32;
    }
    let mask = unsafe { GetLogicalDrives() };
    // A and B are floppy-style: slow to answer and rarely there.
    (2..26u32).filter(|bit| mask & (1 << bit) != 0).map(|bit| (b'A' + bit as u8) as char).collect()
}

fn roots() -> Vec<Root> {
    let mut out = Vec::new();
    // Only the guide's pictures use this: they must not show this machine's own folders.
    let home = std::env::var("MYZIPMASTER_SAMPLE_HOME").or_else(|_| std::env::var("USERPROFILE")).or_else(|_| std::env::var("HOME")).ok();
    if let Some(home) = &home {
        out.push(Root { name: "home".into(), path: home.clone(), kind: "home" });
        for (name, folder) in [("desktop", "Desktop"), ("documents", "Documents"), ("downloads", "Downloads")] {
            let p = std::path::Path::new(home).join(folder);
            if p.is_dir() {
                out.push(Root { name: name.into(), path: p.to_string_lossy().into_owned(), kind: "folder" });
            }
        }
    }
    if cfg!(windows) {
        #[cfg(windows)]
        for letter in drive_letters() {
            let drive = format!("{letter}:\\");
            out.push(Root { name: drive.clone(), path: drive, kind: "drive" });
        }
    } else {
        out.push(Root { name: "/".into(), path: "/".into(), kind: "drive" });
        if cfg!(target_os = "macos") {
            out.push(Root { name: "Volumes".into(), path: "/Volumes".into(), kind: "drive" });
        }
    }
    out
}

/// What each path is, for files dropped on the window: null for one that is gone.
#[tauri::command]
pub async fn path_info(paths: Vec<String>) -> Vec<Option<Item>> {
    tauri::async_runtime::spawn_blocking(move || path_info_now(paths)).await.unwrap_or_default()
}

fn path_info_now(paths: Vec<String>) -> Vec<Option<Item>> {
    let fs = OsFs;
    paths
        .into_iter()
        .map(|p| {
            fs.meta(&p).ok().flatten().map(|m| Item {
                name: fs.file_name(&p),
                path: p,
                is_dir: m.is_dir,
                is_link: m.is_symlink,
                size: m.size,
                mtime: m.mtime,
            })
        })
        .collect()
}

/// Moves files to the recycle bin, where they can be got back from. A test run has its own bin,
/// so it never leaves anything in the user's.
#[tauri::command]
pub async fn trash_paths(paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if std::env::var("MYZIPMASTER_TEST").is_ok() {
            let bin = crate::data_dir().join("test-trash");
            std::fs::create_dir_all(&bin).map_err(|e| e.to_string())?;
            for p in &paths {
                let name = std::path::Path::new(p).file_name().ok_or("no file name")?;
                std::fs::rename(p, bin.join(name)).map_err(|e| e.to_string())?;
            }
            return Ok(());
        }
        trash::delete_all(&paths).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn make_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// Shows a file or folder in the system's file manager.
#[tauri::command]
pub fn reveal_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    if std::env::var("MYZIPMASTER_TEST").is_ok() {
        return Ok(());
    }
    use tauri_plugin_opener::OpenerExt;
    if std::path::Path::new(&path).is_dir() {
        app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
    } else {
        app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
    }
}
