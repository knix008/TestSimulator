use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use std::io::Cursor;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperImage {
    pub mime: String,
    pub data_base64: String,
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn mime_for_extension(extension: &str) -> &'static str {
    match extension {
        "png" | "apng" => "image/png",
        "jpg" | "jpeg" | "jpe" | "jfif" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" | "dib" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        "svg" | "svgz" => "image/svg+xml",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

fn needs_png_conversion(extension: &str) -> bool {
    matches!(extension, "tif" | "tiff")
}

fn encode_as_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let image = image::load_from_memory(bytes).map_err(|error| error.to_string())?;
    let mut encoded = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut encoded), image::ImageFormat::Png)
        .map_err(|error| error.to_string())?;
    Ok(encoded)
}

#[tauri::command]
pub fn load_wallpaper_image(path: String) -> Result<WallpaperImage, String> {
    let path = Path::new(&path);
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let extension = extension_of(path);

    let (mime, data) = if needs_png_conversion(&extension) {
        ("image/png".to_string(), encode_as_png(&bytes)?)
    } else {
        (mime_for_extension(&extension).to_string(), bytes)
    };

    Ok(WallpaperImage {
        mime,
        data_base64: BASE64.encode(data),
    })
}
