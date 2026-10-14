use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "jpe", "jfif", "gif", "bmp", "webp", "ico", "svg", "avif", "heic",
    "heif", "hif", "jxl", "tif", "tiff", "qoi", "tga", "hdr", "pic", "pbm", "pgm", "ppm", "pnm",
];
const MAX_IMAGE_BYTES: u64 = 80 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageFile {
    path: String,
    name: String,
    bytes_base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PickedImages {
    files: Vec<ImageFile>,
    failed: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveRequest {
    text: Option<String>,
    bytes_base64: Option<String>,
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
}

fn collect_fonts() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    let mut names = std::collections::BTreeMap::<String, String>::new();
    for face in database.faces() {
        for (name, _) in &face.families {
            let name = name.trim();
            if name.is_empty() || name.starts_with(['@', '.']) {
                continue;
            }
            names.entry(name.to_lowercase()).or_insert_with(|| name.to_string());
        }
    }
    names.into_values().collect()
}

#[tauri::command]
async fn list_fonts() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(collect_fonts)
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn save_file(app: tauri::AppHandle, req: SaveRequest) -> Result<bool, String> {
    if req.extensions.is_empty() {
        return Err("저장 형식이 없습니다.".into());
    }
    if req.text.is_none() && req.bytes_base64.is_none() {
        return Err("저장할 내용이 없습니다.".into());
    }

    let extensions = req.extensions.clone();
    let ext_refs: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let chosen = app
        .dialog()
        .file()
        .set_title("저장")
        .set_file_name(&req.default_name)
        .add_filter(&req.filter_name, &ext_refs)
        .blocking_save_file();

    let Some(file_path) = chosen else {
        return Ok(false);
    };

    let mut path = file_path
        .into_path()
        .map_err(|_| "저장 경로를 확인하지 못했습니다.".to_string())?;
    ensure_extension(&mut path, &req.extensions);

    if let Some(text) = req.text {
        std::fs::write(&path, text).map_err(|error| format!("저장하지 못했습니다. {error}"))?;
    } else if let Some(encoded) = req.bytes_base64 {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| "파일 내용이 올바르지 않습니다.".to_string())?;
        std::fs::write(&path, bytes).map_err(|error| format!("저장하지 못했습니다. {error}"))?;
    }

    Ok(true)
}

#[derive(Deserialize)]
struct TextFile {
    name: String,
    text: String,
}

#[tauri::command]
async fn save_texts(app: tauri::AppHandle, files: Vec<TextFile>) -> Result<bool, String> {
    if files.is_empty() {
        return Err("저장할 내용이 없습니다.".into());
    }

    let chosen = app.dialog().file().set_title("저장").blocking_pick_folder();
    let Some(folder) = chosen else {
        return Ok(false);
    };
    let folder = folder
        .into_path()
        .map_err(|_| "저장 경로를 확인하지 못했습니다.".to_string())?;

    for file in files {
        let path = unique_text_path(&folder, &safe_file_name(&file.name))?;
        std::fs::write(&path, file.text).map_err(|error| format!("저장하지 못했습니다. {error}"))?;
    }
    Ok(true)
}

fn safe_file_name(name: &str) -> String {
    let mut cleaned = String::new();
    for ch in name.chars() {
        if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || ch.is_control() {
            cleaned.push('_');
        } else {
            cleaned.push(ch);
        }
    }
    let trimmed = cleaned.trim().trim_matches('.').trim();
    let source = if trimmed.is_empty() { "result" } else { trimmed };
    let mut limited: String = source.chars().take(80).collect();
    while limited.ends_with('.') || limited.ends_with(' ') {
        limited.pop();
    }
    if limited.is_empty() { "result".into() } else { limited }
}

fn unique_text_path(folder: &std::path::Path, name: &str) -> Result<PathBuf, String> {
    let first = folder.join(format!("{name}.txt"));
    if !first.exists() {
        return Ok(first);
    }
    for index in 2..=1000 {
        let candidate = folder.join(format!("{name}-{index}.txt"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("같은 이름의 파일이 너무 많습니다.".into())
}

#[tauri::command]
async fn pick_images(
    app: tauri::AppHandle,
    title: Option<String>,
    directory: Option<String>,
) -> Result<PickedImages, String> {
    let title = title.filter(|value| !value.trim().is_empty()).unwrap_or_else(|| "이미지 추가".into());
    let mut dialog = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter("이미지", IMAGE_EXTENSIONS);
    if let Some(folder) = directory.map(PathBuf::from).filter(|folder| folder.is_dir()) {
        dialog = dialog.set_directory(folder);
    }
    let chosen = dialog.blocking_pick_files();

    let Some(files) = chosen else {
        return Ok(PickedImages {
            files: Vec::new(),
            failed: Vec::new(),
        });
    };

    let mut opened = Vec::new();
    let mut failed = Vec::new();
    for file in files {
        let path = match file.into_path() {
            Ok(path) => path,
            Err(_) => {
                failed.push("경로를 확인하지 못했습니다.".into());
                continue;
            }
        };
        match read_image_at(&path) {
            Ok(image) => opened.push(image),
            Err(error) => failed.push(format!(
                "{}: {error}",
                path.file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| path.display().to_string())
            )),
        }
    }
    Ok(PickedImages {
        files: opened,
        failed,
    })
}

#[tauri::command]
fn read_image(path: String) -> Result<ImageFile, String> {
    read_image_at(std::path::Path::new(&path))
}

fn read_image_at(path: &std::path::Path) -> Result<ImageFile, String> {
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
    if !IMAGE_EXTENSIONS
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(extension))
    {
        return Err("이미지 파일이 아닙니다.".into());
    }

    let meta = std::fs::metadata(path).map_err(|_| "파일을 찾지 못했습니다.".to_string())?;
    if !meta.is_file() {
        return Err("파일을 찾지 못했습니다.".into());
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return Err("파일이 너무 큽니다.".into());
    }

    let bytes = std::fs::read(path).map_err(|error| format!("열지 못했습니다. {error}"))?;
    Ok(ImageFile {
        path: path.display().to_string(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "image".into()),
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

fn normalize_install_language(text: &str) -> Option<String> {
    let token = text.split_whitespace().next().unwrap_or("");
    if token.eq_ignore_ascii_case("ko") {
        Some("ko".into())
    } else if token.eq_ignore_ascii_case("en") {
        Some("en".into())
    } else {
        None
    }
}

fn install_language_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("install-language.txt"));
            paths.push(dir.join("../Resources/install-language.txt"));
        }
    }
    #[cfg(windows)]
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(&local).join("com.image2text.desktop").join("install-language.txt"));
        paths.push(PathBuf::from(local).join("com.image2text.app").join("install-language.txt"));
    }
    #[cfg(target_os = "macos")]
    if let Some(home) = std::env::var_os("HOME") {
        paths.push(PathBuf::from(&home).join("Library/Application Support/com.image2text.desktop/install-language.txt"));
        paths.push(PathBuf::from(&home).join("Library/Application Support/com.image2text.app/install-language.txt"));
        paths.push(PathBuf::from(home).join(".config/image2text/install-language"));
    }
    #[cfg(target_os = "linux")]
    {
        paths.push(PathBuf::from("/etc/image2text/install-language"));
        if let Some(home) = std::env::var_os("HOME") {
            let config = std::env::var_os("XDG_CONFIG_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(&home).join(".config"));
            paths.push(config.join("image2text/install-language"));
        }
    }
    paths
}

fn read_install_language() -> String {
    for path in install_language_candidates() {
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        if let Some(language) = normalize_install_language(&text) {
            return language;
        }
    }
    String::new()
}

#[tauri::command]
fn install_language() -> String {
    read_install_language()
}

#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}

fn ensure_extension(path: &mut PathBuf, extensions: &[String]) {
    let already = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| extensions.iter().any(|candidate| candidate.eq_ignore_ascii_case(ext)));
    if already {
        return;
    }
    let Some(ext) = extensions.first() else {
        return;
    };
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".");
    name.push(ext);
    path.set_file_name(name);
}

#[cfg(test)]
mod tests {
    use super::{collect_fonts, normalize_install_language, safe_file_name};

    #[test]
    fn installed_fonts_include_the_system_set() {
        let fonts = collect_fonts();
        assert!(fonts.len() > 6, "installed fonts: {}", fonts.len());
    }

    #[test]
    fn install_language_accepts_ko_and_en() {
        assert_eq!(normalize_install_language("ko\r\n"), Some("ko".into()));
        assert_eq!(normalize_install_language(" EN "), Some("en".into()));
        assert_eq!(normalize_install_language("fr"), None);
    }

    #[test]
    fn file_names_drop_path_characters() {
        assert_eq!(safe_file_name("a/b:c"), "a_b_c");
        assert_eq!(safe_file_name("  ...  "), "result");
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_file,
            save_texts,
            pick_images,
            read_image,
            list_fonts,
            install_language,
            print_page
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png"))?;
                window.set_icon(icon)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Image2Text를 실행하지 못했습니다.");
}
