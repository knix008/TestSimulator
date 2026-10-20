use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::color::{default_icon_color, sync_theme_text_colors};
use crate::inclusion::{normalize_directory_display, normalize_drive_root};
use crate::model::AppSettings;
use crate::sort::SearchResultSortOrder;

const RESYNC_CHOICES: &[u32] = &[0, 1, 4, 8, 12, 24, 168];

#[derive(Clone, Debug)]
pub struct LoadedSettings {
    pub settings: AppSettings,
    pub migrated: bool,
    pub used_defaults: bool,
}

pub fn load_settings_str(raw: &str, ready_volumes: &[String]) -> LoadedSettings {
    let parsed = serde_json::from_str::<Value>(raw);
    let Ok(value) = parsed else {
        return LoadedSettings {
            settings: default_with_scope(ready_volumes),
            migrated: false,
            used_defaults: true,
        };
    };
    let mut settings: AppSettings = serde_json::from_value(value.clone()).unwrap_or_default();
    let migrated = normalize_settings(&mut settings, Some(&value), ready_volumes);
    LoadedSettings {
        settings,
        migrated,
        used_defaults: false,
    }
}

pub fn load_settings_file(path: &Path, ready_volumes: &[String]) -> LoadedSettings {
    match fs::read_to_string(path) {
        Ok(raw) => {
            let loaded = load_settings_str(&raw, ready_volumes);
            if loaded.migrated {
                let _ = save_settings_file(path, &loaded.settings);
            }
            loaded
        }
        Err(_) => LoadedSettings {
            settings: default_with_scope(ready_volumes),
            migrated: false,
            used_defaults: true,
        },
    }
}

pub fn save_settings_file(path: &Path, settings: &AppSettings) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut normalized = settings.clone();
    normalize_settings(&mut normalized, None, &[]);
    let json = serde_json::to_string_pretty(&normalized).unwrap_or_else(|_| "{}".to_string());
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json)?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn normalize_settings(
    settings: &mut AppSettings,
    raw: Option<&Value>,
    ready_volumes: &[String],
) -> bool {
    let mut migrated = false;
    if settings.language.trim().is_empty()
        || (settings.language != "ko" && settings.language != "en")
    {
        settings.language = "ko".to_string();
    }
    settings.window_opacity = settings.window_opacity.clamp(50, 100);
    settings.background_opacity = settings.background_opacity.clamp(0, 100);
    settings.border_thickness = settings.border_thickness.clamp(0.0, 6.0);
    settings.search_result_sort = from_known(settings.search_result_sort);
    if !RESYNC_CHOICES.contains(&settings.resync_interval_hours) {
        settings.resync_interval_hours = 8;
    }

    let Some(root) = raw else {
        return false;
    };
    if root.get("RunAtStartup").is_none() {
        settings.run_at_startup = true;
        migrated = true;
    }
    if root.get("BorderThickness").is_none() {
        settings.border_thickness = 1.0;
        migrated = true;
    }
    if root.get("IconColor").is_none() {
        settings.icon_color = default_icon_color(&settings.background_color).to_string();
        migrated = true;
    }
    if root.get("ResyncIntervalHours").is_none() {
        settings.resync_interval_hours = 8;
        migrated = true;
    }
    migrated | migrate_index_scope(settings, root, ready_volumes)
}

fn from_known(sort: SearchResultSortOrder) -> SearchResultSortOrder {
    sort
}

fn migrate_index_scope(settings: &mut AppSettings, root: &Value, ready_volumes: &[String]) -> bool {
    if root.get("IncludedDrives").is_some() {
        return false;
    }
    let mut migrated = false;
    if let Some(excluded) = root.get("ExcludedDrives").and_then(Value::as_array) {
        let excluded: Vec<String> = excluded
            .iter()
            .filter_map(|item| item.as_str())
            .filter_map(normalize_drive_root)
            .collect();
        settings.included_drives = ready_volumes
            .iter()
            .filter_map(|drive| normalize_drive_root(drive))
            .filter(|drive| !excluded.iter().any(|item| item.eq_ignore_ascii_case(drive)))
            .collect();
        migrated = true;
    }
    if let Some(excluded) = root.get("ExcludedDirectories").and_then(Value::as_array) {
        settings.excluded_directories = excluded
            .iter()
            .filter_map(|item| item.as_str())
            .filter_map(normalize_directory_display)
            .collect();
        migrated = true;
    }
    if let Some(browse) = root
        .get("LastExcludedDirectoryBrowsePath")
        .and_then(Value::as_str)
    {
        settings.last_included_directory_browse_path = Some(browse.to_string());
        migrated = true;
    }
    if !migrated
        || (settings.included_drives.is_empty() && settings.included_directories.is_empty())
    {
        apply_default_scope_if_empty(settings, ready_volumes);
        migrated = true;
    }
    migrated
}

pub fn apply_default_scope_if_empty(settings: &mut AppSettings, ready_volumes: &[String]) {
    if settings.included_drives.is_empty() && settings.included_directories.is_empty() {
        settings.included_drives = ready_volumes
            .iter()
            .filter_map(|drive| normalize_drive_root(drive))
            .collect();
    }
}

fn default_with_scope(ready_volumes: &[String]) -> AppSettings {
    let mut settings = AppSettings::default();
    apply_default_scope_if_empty(&mut settings, ready_volumes);
    settings
}

pub fn preview_background(settings: &mut AppSettings, background: &str) {
    settings.background_color = background.to_string();
    sync_theme_text_colors(settings);
}

pub fn resync_due(last: Option<SystemTime>, now: SystemTime, hours: u32) -> bool {
    if hours == 0 {
        return false;
    }
    let Some(last) = last else {
        return false;
    };
    now.duration_since(last).unwrap_or(Duration::ZERO)
        >= Duration::from_secs(u64::from(hours) * 3600)
}

pub fn stamp_path(data_dir: &Path) -> PathBuf {
    data_dir.join("index.stamp")
}

pub fn write_index_stamp(data_dir: &Path, now: SystemTime) -> std::io::Result<()> {
    fs::create_dir_all(data_dir)?;
    let secs = now
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs();
    fs::write(stamp_path(data_dir), secs.to_string())
}

pub fn read_index_stamp(data_dir: &Path) -> Option<SystemTime> {
    let text = fs::read_to_string(stamp_path(data_dir)).ok()?;
    let secs = text.trim().parse::<u64>().ok()?;
    Some(UNIX_EPOCH + Duration::from_secs(secs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_legacy_exclusions_and_missing_fields() {
        let raw = r##"{
            "BackgroundColor": "#111111",
            "ExcludedDrives": ["D:\\"],
            "ExcludedDirectories": ["C:\\Secret"],
            "LastExcludedDirectoryBrowsePath": "C:\\Users"
        }"##;
        let ready = vec!["C:\\".to_string(), "D:\\".to_string(), "E:\\".to_string()];
        let loaded = load_settings_str(raw, &ready);
        assert!(loaded.migrated);
        assert!(loaded.settings.run_at_startup);
        assert_eq!(loaded.settings.border_thickness, 1.0);
        assert_eq!(loaded.settings.resync_interval_hours, 8);
        assert!(loaded.settings.included_drives.iter().any(|d| d == "C:\\"));
        assert!(loaded.settings.included_drives.iter().any(|d| d == "E:\\"));
        assert!(!loaded.settings.included_drives.iter().any(|d| d == "D:\\"));
        assert_eq!(
            loaded.settings.excluded_directories,
            vec!["C:\\Secret".to_string()]
        );
        assert_eq!(loaded.settings.icon_color.to_ascii_uppercase(), "#F5F5F5");
    }

    #[test]
    fn explicit_empty_drive_list_is_preserved() {
        let raw = r##"{"IncludedDrives": [], "RunAtStartup": false, "BorderThickness": 2, "IconColor": "#141414", "ResyncIntervalHours": 0}"##;
        let loaded = load_settings_str(raw, &["C:\\".to_string()]);
        assert!(loaded.settings.included_drives.is_empty());
        assert!(!loaded.settings.run_at_startup);
        assert!(loaded.settings.show_tray_icon);
        assert_eq!(loaded.settings.resync_interval_hours, 0);
        assert!(!loaded.migrated);
    }

    #[test]
    fn installer_language_seed_is_preserved() {
        let loaded = load_settings_str(r#"{"Language":"en"}"#, &["C:\\".to_string()]);
        assert_eq!(loaded.settings.language, "en");
        assert!(!loaded.used_defaults);
        assert!(loaded.migrated);
        assert_eq!(loaded.settings.included_drives, vec!["C:\\".to_string()]);

        let korean = load_settings_str(r#"{"Language":"ko"}"#, &[]);
        assert_eq!(korean.settings.language, "ko");
    }

    #[test]
    fn corrupt_json_falls_back_to_defaults() {
        let loaded = load_settings_str("{", &["C:\\".to_string()]);
        assert!(loaded.used_defaults);
        assert_eq!(loaded.settings.included_drives, vec!["C:\\".to_string()]);
        assert_eq!(loaded.settings.language, "ko");
    }

    #[test]
    fn clamps_opacity_and_persists_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut settings = AppSettings::default();
        settings.window_opacity = 10;
        settings.background_opacity = 140;
        settings.border_thickness = 9.0;
        settings.language = "fr".to_string();
        save_settings_file(&path, &settings).unwrap();
        let loaded = load_settings_file(&path, &[]);
        assert_eq!(loaded.settings.window_opacity, 50);
        assert_eq!(loaded.settings.background_opacity, 100);
        assert_eq!(loaded.settings.border_thickness, 6.0);
        assert_eq!(loaded.settings.language, "ko");
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn resync_interval() {
        let earlier = UNIX_EPOCH + Duration::from_secs(1_000);
        let now = earlier + Duration::from_secs(8 * 3600);
        assert!(resync_due(Some(earlier), now, 8));
        assert!(!resync_due(
            Some(earlier),
            earlier + Duration::from_secs(100),
            8
        ));
        assert!(!resync_due(Some(earlier), now, 0));
        assert!(!resync_due(None, now, 8));
    }
}
