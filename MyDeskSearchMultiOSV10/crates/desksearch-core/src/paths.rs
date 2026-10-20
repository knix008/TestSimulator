use std::path::{Path, PathBuf};

pub const APP_DIR_NAME: &str = "MyDeskSearch";
pub const LIVE_DB: &str = "index.db";
pub const BUILDING_DB: &str = "index.building.db";
pub const SETTINGS_FILE: &str = "settings.json";

pub fn config_dir() -> PathBuf {
    dirs_config().join(APP_DIR_NAME)
}

fn dirs_config() -> PathBuf {
    if let Ok(override_dir) = std::env::var("DESKSEARCH_CONFIG_DIR") {
        if !override_dir.trim().is_empty() {
            return PathBuf::from(override_dir);
        }
    }
    if cfg!(windows) {
        if let Ok(appdata) = std::env::var("APPDATA") {
            if !appdata.is_empty() {
                return PathBuf::from(appdata);
            }
        }
    }
    if cfg!(target_os = "macos") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support");
        }
    }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return PathBuf::from(xdg);
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        if cfg!(windows) {
            return PathBuf::from(home).join("AppData").join("Roaming");
        }
        return PathBuf::from(home).join(".config");
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn live_db(dir: &Path) -> PathBuf {
    dir.join(LIVE_DB)
}

pub fn building_db(dir: &Path) -> PathBuf {
    dir.join(BUILDING_DB)
}

pub fn settings_file(dir: &Path) -> PathBuf {
    dir.join(SETTINGS_FILE)
}

pub fn remove_sqlite_files(db_path: &Path) {
    let base = db_path.to_string_lossy().to_string();
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let path = if suffix.is_empty() {
            db_path.to_path_buf()
        } else {
            PathBuf::from(format!("{base}{suffix}"))
        };
        let _ = std::fs::remove_file(path);
    }
}

pub fn desktop_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let desktop = PathBuf::from(profile).join("Desktop");
            if desktop.is_dir() {
                return Some(desktop);
            }
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let desktop = PathBuf::from(&home).join("Desktop");
        if desktop.is_dir() {
            return Some(desktop);
        }
        let localized = PathBuf::from(home).join("바탕화면");
        if localized.is_dir() {
            return Some(localized);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_env_selects_the_data_directory() {
        let unique = std::env::temp_dir().join(format!("desksearch-path-{}", std::process::id()));
        std::env::set_var("DESKSEARCH_CONFIG_DIR", &unique);
        let dir = config_dir();
        std::env::remove_var("DESKSEARCH_CONFIG_DIR");
        assert_eq!(dir, unique.join(APP_DIR_NAME));
    }
}
