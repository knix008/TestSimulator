// Files: the open / save / folder dialogs, reading and writing by path, and the
// settings and recent-file lists kept in the data folder.
//
// Bytes travel as base64 strings both ways: a Vec<u8> would become a JSON array
// of numbers, which is several times larger and slow to parse for a database file.
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

#[derive(Deserialize, Clone)]
pub struct Filter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Serialize)]
pub struct Opened {
    path: String,
    name: String,
    /// base64 of the file's bytes.
    data: String,
}

fn read_opened(path: &Path) -> Result<Opened, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(Opened {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        data: B64.encode(bytes),
    })
}

fn decode(data: &str) -> Result<Vec<u8>, String> {
    B64.decode(data.as_bytes()).map_err(|e| e.to_string())
}

fn add_filters(
    mut dialog: tauri_plugin_dialog::FileDialogBuilder<tauri::Wry>,
    filters: &[Filter],
) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    for filter in filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }
    dialog
}

fn owner(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    use tauri::Manager;
    app.get_webview_window(crate::MAIN)
}

#[tauri::command]
pub async fn files_open(app: AppHandle, filters: Vec<Filter>) -> Result<Option<Opened>, String> {
    let mut dialog = add_filters(app.dialog().file(), &filters);
    if let Some(main) = owner(&app) {
        dialog = dialog.set_parent(&main);
    }
    let Some(path) = dialog.blocking_pick_file().and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    read_opened(&path).map(Some)
}

/// A file by path (recent files, file association, templates): None when it is gone.
#[tauri::command]
pub async fn files_read(path: String) -> Option<Opened> {
    if path.is_empty() {
        return None;
    }
    read_opened(Path::new(&path)).ok()
}

#[tauri::command]
pub async fn files_save(app: AppHandle, name: String, filters: Vec<Filter>, data: String) -> Result<Option<String>, String> {
    let mut dialog = add_filters(app.dialog().file().set_file_name(&name), &filters);
    if let Some(main) = owner(&app) {
        dialog = dialog.set_parent(&main);
    }
    let Some(path) = dialog.blocking_save_file().and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    std::fs::write(&path, decode(&data)?).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// A save dialog only: the page writes the file itself afterwards (the PDF export).
#[tauri::command]
pub async fn files_pick_save(app: AppHandle, name: String, filters: Vec<Filter>) -> Option<String> {
    let mut dialog = add_filters(app.dialog().file().set_file_name(&name), &filters);
    if let Some(main) = owner(&app) {
        dialog = dialog.set_parent(&main);
    }
    dialog.blocking_save_file().and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn files_write(path: String, data: String) -> Result<String, String> {
    if path.is_empty() {
        return Err("no path".into());
    }
    std::fs::write(&path, decode(&data)?).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
pub async fn dir_choose(app: AppHandle, default_path: Option<String>) -> Option<String> {
    let mut dialog = app.dialog().file();
    if let Some(dir) = default_path.filter(|d| !d.is_empty() && Path::new(d).is_dir()) {
        dialog = dialog.set_directory(dir);
    }
    if let Some(main) = owner(&app) {
        dialog = dialog.set_parent(&main);
    }
    dialog.blocking_pick_folder().and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().into_owned())
}

#[derive(Deserialize)]
pub struct NamedData {
    name: String,
    data: String,
}

/// A plain file name only: a name with a separator could write outside `directory`.
pub fn safe_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', ':'])
}

#[tauri::command]
pub async fn dir_write_files(directory: String, files: Vec<NamedData>) -> Result<usize, String> {
    let dir = PathBuf::from(&directory);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for file in &files {
        if !safe_name(&file.name) {
            return Err(format!("bad file name: {}", file.name));
        }
        std::fs::write(dir.join(&file.name), decode(&file.data)?).map_err(|e| e.to_string())?;
    }
    Ok(files.len())
}

/* ------------------------------------------------- settings and recent files */

fn json_file(name: &str) -> PathBuf {
    crate::data_dir().join(name)
}

fn read_json(name: &str) -> Option<serde_json::Value> {
    std::fs::read_to_string(json_file(name)).ok().and_then(|text| serde_json::from_str(&text).ok())
}

fn write_json(name: &str, value: &serde_json::Value) -> Result<(), String> {
    std::fs::create_dir_all(crate::data_dir()).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(json_file(name), text).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn settings_read() -> Option<serde_json::Value> {
    read_json("settings.json")
}

#[tauri::command]
pub async fn settings_write(settings: serde_json::Value) -> Result<(), String> {
    write_json("settings.json", &settings)
}

#[tauri::command]
pub async fn recent_read() -> Vec<String> {
    read_json("recent.json")
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn recent_write(files: Vec<String>) -> Result<(), String> {
    write_json("recent.json", &serde_json::json!(files))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_plain_file_names_are_written() {
        assert!(safe_name("Shop.sql"));
        assert!(!safe_name("../evil.sql"));
        assert!(!safe_name("a\\b.sql"));
        assert!(!safe_name("C:x"));
        assert!(!safe_name(""));
        assert!(!safe_name(".."));
    }

    #[test]
    fn a_file_reads_back_as_base64() {
        let dir = std::env::temp_dir().join(format!("dbtools-files-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.mdprj");
        std::fs::write(&file, b"hi").unwrap();
        let opened = read_opened(&file).unwrap();
        assert_eq!(opened.name, "a.mdprj");
        assert_eq!(opened.data, "aGk=");
        assert_eq!(decode(&opened.data).unwrap(), b"hi");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
