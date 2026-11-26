//! Where things are: the program's settings folder, the folder for packages it installs,
//! and the folder the dialogs remember.

use crate::util::*;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

#[derive(Clone, Debug, Default)]
pub struct Config {
    /// The settings folder; None = %APPDATA%\MyISOMaker (… Application Support, ~/.config).
    pub user_data: Option<PathBuf>,
    /// Packages the program installs; None = %LOCALAPPDATA%\MyISOMaker\tools (~/.local/share/…).
    pub tools_dir: Option<PathBuf>,
}

impl Config {
    /// From the environment: ISOMAKER_USER_DATA, ISOMAKER_TOOLS_DIR.
    pub fn from_env() -> Config {
        let mut c = Config::default();
        c.user_data = std::env::var_os("ISOMAKER_USER_DATA").filter(|v| !v.is_empty()).map(PathBuf::from);
        c.tools_dir = std::env::var_os("ISOMAKER_TOOLS_DIR").filter(|v| !v.is_empty()).map(PathBuf::from);
        c
    }
}

static CONFIG: RwLock<Option<Config>> = RwLock::new(None);

pub fn set_config(c: Config) {
    *CONFIG.write().unwrap() = Some(c);
}

fn config() -> Config {
    CONFIG.read().unwrap().clone().unwrap_or_else(Config::from_env)
}

/// The program's own settings folder (same as the Electron build used).
pub fn user_data_dir() -> PathBuf {
    if let Some(d) = config().user_data {
        return d;
    }
    let home = home_dir();
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Roaming"))
    } else if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support")
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".config"))
    };
    base.join("MyISOMaker")
}

pub fn tools_dir() -> PathBuf {
    if let Some(d) = config().tools_dir {
        return d;
    }
    let home = home_dir();
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Local"))
    } else {
        home.join(".local").join("share")
    };
    base.join("MyISOMaker").join("tools")
}

// ── The folder the dialogs remember ─────────────────────────

fn store_path() -> PathBuf {
    user_data_dir().join("isomaker-paths.json")
}

pub fn last_directory() -> Option<PathBuf> {
    let text = std::fs::read_to_string(store_path()).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let dir = PathBuf::from(v.get("lastDirectory")?.as_str().filter(|s| !s.is_empty())?);
    dir.is_dir().then_some(dir)
}

/// Remembers the folder of a file or folder the user just chose.
pub fn remember_path(selected: &str) {
    let p = Path::new(selected);
    let Ok(meta) = std::fs::metadata(p) else { return };
    let dir = if meta.is_dir() { p.to_path_buf() } else { p.parent().map(Path::to_path_buf).unwrap_or_default() };
    if dir.as_os_str().is_empty() || !dir.exists() {
        return;
    }
    let file = store_path();
    let _ = std::fs::create_dir_all(file.parent().unwrap());
    let _ = std::fs::write(&file, serde_json::to_string_pretty(&json!({ "lastDirectory": dir.to_string_lossy() })).unwrap());
}

fn directory_from_hint(hint: Option<&str>) -> Option<PathBuf> {
    let hint = Path::new(hint.filter(|h| !h.is_empty())?);
    if hint.exists() {
        let dir = if hint.is_dir() { hint.to_path_buf() } else { hint.parent()?.to_path_buf() };
        return dir.exists().then_some(dir);
    }
    // Typed but not made yet: its parent
    let parent = hint.parent()?;
    (!parent.as_os_str().is_empty() && parent != hint && parent.exists()).then(|| parent.to_path_buf())
}

/// Where a dialog starts: the hint's folder, else the folder used last; with a file name for "save".
pub fn dialog_default_path(hint: Option<&str>, file_name: Option<&str>) -> Option<String> {
    let base = directory_from_hint(hint).or_else(last_directory);
    if let Some(name) = file_name.filter(|n| !n.is_empty()) {
        let bare = Path::new(name).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| name.to_string());
        return Some(match base {
            Some(b) => b.join(bare).to_string_lossy().to_string(),
            None => name.to_string(),
        });
    }
    base.map(|b| b.to_string_lossy().to_string())
}
