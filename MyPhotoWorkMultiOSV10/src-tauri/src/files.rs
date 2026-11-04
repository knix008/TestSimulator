// Files: the open and save dialogs and reading and writing by path.
//
// The renderer gets what the file-handling code in App.tsx has always been given:
// a project as text, anything else as a data URL.
use std::path::Path;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// The extensions the open dialog offers, as (name, extensions).
const OPEN_FILTERS: &[(&str, &[&str])] = &[
    ("Photo Work and Images", &["mpw", "psd", "psb", "png", "jpg", "jpeg", "gif", "tif", "tiff", "webp", "avif", "bmp", "heic", "heif", "hif", "dcm", "dicom", "cube"]),
    ("Photoshop", &["psd", "psb"]),
    ("Photo Work Project", &["mpw"]),
    ("Images", &["png", "jpg", "jpeg", "gif", "tif", "tiff", "webp", "avif", "bmp", "heic", "heif", "hif"]),
    ("DICOM", &["dcm", "dicom"]),
    ("All Files", &["*"]),
];

pub fn mime_for(path: &Path) -> &'static str {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "mpw" => "application/json",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        "heic" => "image/heic",
        // Fujifilm cameras write HEIF stills as .hif.
        "heif" | "hif" => "image/heif",
        "dcm" | "dicom" => "application/dicom",
        "psd" | "psb" => "image/vnd.adobe.photoshop",
        "cube" => "text/plain",
        _ => "application/octet-stream",
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    path: String,
    name: String,
    mime: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data_url: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    directory: Option<String>,
    files: Vec<OpenedFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

fn read_item(path: &Path) -> Result<OpenedFile, String> {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let shown = path.to_string_lossy().into_owned();
    let mime = mime_for(path);
    if mime == "application/json" {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        return Ok(OpenedFile { path: shown, name, mime: mime.into(), size: None, text: Some(text), data_url: None });
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(OpenedFile {
        path: shown,
        name,
        mime: mime.into(),
        size: Some(bytes.len() as u64),
        text: None,
        data_url: Some(format!("data:{mime};base64,{encoded}")),
    })
}

#[tauri::command]
pub async fn files_open(app: AppHandle, default_path: Option<String>) -> Result<OpenResult, String> {
    let mut dialog = app.dialog().file();
    for (name, extensions) in OPEN_FILTERS {
        dialog = dialog.add_filter(*name, extensions);
    }
    if let Some(dir) = default_path.filter(|d| !d.is_empty()) {
        dialog = dialog.set_directory(dir);
    }
    let Some(chosen) = dialog.blocking_pick_files() else {
        return Ok(OpenResult { canceled: true, ..Default::default() });
    };
    let paths: Vec<_> = chosen.into_iter().filter_map(|p| p.into_path().ok()).collect();
    if paths.is_empty() {
        return Ok(OpenResult { canceled: true, ..Default::default() });
    }
    let directory = paths[0].parent().map(|d| d.to_string_lossy().into_owned());
    let files = paths.iter().map(|p| read_item(p)).collect::<Result<Vec<_>, _>>()?;
    Ok(OpenResult { canceled: false, directory, files, message: None })
}

/// One file by path, for Open Recent and Revert: the same shape the open dialog returns.
#[tauri::command]
pub async fn files_read(file_path: String) -> OpenResult {
    if file_path.is_empty() {
        return OpenResult { canceled: true, ..Default::default() };
    }
    match read_item(Path::new(&file_path)) {
        Ok(file) => OpenResult { files: vec![file], ..Default::default() },
        Err(message) => OpenResult { canceled: true, message: Some(message), ..Default::default() },
    }
}

/// `data:<mime>;base64,<payload>` to its bytes.
pub fn decode_data_url(url: &str) -> Result<Vec<u8>, String> {
    let payload = url.split_once(',').map(|(_, rest)| rest).unwrap_or("");
    base64::engine::general_purpose::STANDARD.decode(payload).map_err(|e| e.to_string())
}

fn write_payload(path: &Path, text: Option<&str>, data_url: Option<&str>) -> Result<(), String> {
    let bytes = match data_url {
        Some(url) => decode_data_url(url)?,
        None => text.unwrap_or("").as_bytes().to_vec(),
    };
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct SaveFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    directory: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOptions {
    default_directory: Option<String>,
    file_name: String,
    filters: Option<Vec<SaveFilter>>,
    text: Option<String>,
    data_url: Option<String>,
}

#[tauri::command]
pub async fn files_save(app: AppHandle, options: SaveOptions) -> Result<SaveResult, String> {
    let mut dialog = app.dialog().file().set_file_name(&options.file_name);
    if let Some(dir) = options.default_directory.as_deref().filter(|d| !d.is_empty()) {
        dialog = dialog.set_directory(dir);
    }
    for filter in options.filters.iter().flatten() {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }
    let Some(path) = dialog.blocking_save_file().and_then(|p| p.into_path().ok()) else {
        return Ok(SaveResult { canceled: true, ..Default::default() });
    };
    write_payload(&path, options.text.as_deref(), options.data_url.as_deref())?;
    Ok(SaveResult {
        canceled: false,
        directory: path.parent().map(|d| d.to_string_lossy().into_owned()),
        file_path: Some(path.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
pub async fn files_write(file_path: String, text: Option<String>, data_url: Option<String>) -> Result<SaveResult, String> {
    if file_path.is_empty() {
        return Ok(SaveResult { canceled: true, ..Default::default() });
    }
    write_payload(Path::new(&file_path), text.as_deref(), data_url.as_deref())?;
    Ok(SaveResult { canceled: false, file_path: Some(file_path), directory: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_extensions_map_to_their_mime_type() {
        assert_eq!(mime_for(Path::new("a.JPG")), "image/jpeg");
        assert_eq!(mime_for(Path::new("a.hif")), "image/heif");
        assert_eq!(mime_for(Path::new("a.mpw")), "application/json");
        assert_eq!(mime_for(Path::new("a.psb")), "image/vnd.adobe.photoshop");
        assert_eq!(mime_for(Path::new("a.dcm")), "application/dicom");
        assert_eq!(mime_for(Path::new("a.xyz")), "application/octet-stream");
    }

    #[test]
    fn a_data_url_decodes_to_its_bytes() {
        assert_eq!(decode_data_url("data:text/plain;base64,aGk=").unwrap(), b"hi");
        assert!(decode_data_url("data:text/plain;base64,###").is_err());
    }

    #[test]
    fn a_read_file_comes_back_in_the_shape_the_page_expects() {
        let dir = std::env::temp_dir().join(format!("mpw-files-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let project = dir.join("a.mpw");
        std::fs::write(&project, "{}").unwrap();
        let item = read_item(&project).unwrap();
        assert_eq!(item.text.as_deref(), Some("{}"));
        assert!(item.data_url.is_none());
        let image = dir.join("b.png");
        std::fs::write(&image, b"hi").unwrap();
        let item = read_item(&image).unwrap();
        assert_eq!(item.data_url.as_deref(), Some("data:image/png;base64,aGk="));
        assert_eq!(item.size, Some(2));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
