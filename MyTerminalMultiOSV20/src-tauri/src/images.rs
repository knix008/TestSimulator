// Wallpaper pictures for the Node host (src/host/backgrounds.js): what
// Electron's nativeImage did there.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use image::{imageops::FilterType, DynamicImage, ImageFormat, RgbaImage};
use std::io::Cursor;
use std::path::Path;

/// A CSS data URL for a wallpaper file. Pictures larger than `max` on either
/// side are scaled down (PNG stays PNG for its alpha, photos become JPEG 85);
/// anything else, or anything that cannot be decoded, goes as stored.
pub fn data_url(path: &Path, mime: &str, max: u32) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let raw = || format!("data:{mime};base64,{}", B64.encode(&bytes));
    // Animated GIFs, SVG, AVIF, ICO: the webview draws them itself.
    let format = match mime {
        "image/png" => ImageFormat::Png,
        "image/jpeg" => ImageFormat::Jpeg,
        "image/webp" => ImageFormat::WebP,
        "image/bmp" => ImageFormat::Bmp,
        _ => return Ok(raw()),
    };
    let Ok(img) = image::load_from_memory_with_format(&bytes, format) else {
        return Ok(raw());
    };
    let (w, h) = (img.width(), img.height());
    if max == 0 || (w <= max && h <= max) {
        return Ok(raw());
    }
    let scale = f64::from(max) / f64::from(w.max(h));
    let nw = ((f64::from(w) * scale).round() as u32).max(1);
    let nh = ((f64::from(h) * scale).round() as u32).max(1);
    let small = img.resize_exact(nw, nh, FilterType::Triangle);
    let mut out = Cursor::new(Vec::new());
    if mime == "image/png" {
        small.write_to(&mut out, ImageFormat::Png).map_err(|e| e.to_string())?;
        Ok(format!("data:image/png;base64,{}", B64.encode(out.into_inner())))
    } else {
        let rgb = DynamicImage::ImageRgb8(small.to_rgb8());
        let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85);
        enc.encode_image(&rgb).map_err(|e| e.to_string())?;
        Ok(format!("data:image/jpeg;base64,{}", B64.encode(out.into_inner())))
    }
}

/// RGBA pixels (base64) → PNG (base64): decoded TIFF wallpapers.
pub fn encode_png(width: u32, height: u32, rgba_b64: &str) -> Result<String, String> {
    let rgba = B64.decode(rgba_b64.as_bytes()).map_err(|e| e.to_string())?;
    let need = (width as usize) * (height as usize) * 4;
    if width == 0 || height == 0 || rgba.len() < need {
        return Err("invalid_tiff".into());
    }
    let img = RgbaImage::from_raw(width, height, rgba[..need].to_vec()).ok_or("invalid_tiff")?;
    let mut out = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(img).write_to(&mut out, ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(B64.encode(out.into_inner()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(w: u32, h: u32) -> Vec<u8> {
        let img = RgbaImage::from_pixel(w, h, image::Rgba([10, 20, 30, 255]));
        let mut out = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(img).write_to(&mut out, ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn small_pictures_go_as_stored_and_big_ones_shrink() {
        let dir = std::env::temp_dir().join(format!("mt-img-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let small = dir.join("s.png");
        std::fs::write(&small, png(40, 30)).unwrap();
        let url = data_url(&small, "image/png", 2560).unwrap();
        assert_eq!(url, format!("data:image/png;base64,{}", B64.encode(std::fs::read(&small).unwrap())));

        let big = dir.join("b.png");
        std::fs::write(&big, png(300, 100)).unwrap();
        let url = data_url(&big, "image/png", 120).unwrap();
        let bytes = B64.decode(url.trim_start_matches("data:image/png;base64,")).unwrap();
        let img = image::load_from_memory(&bytes).unwrap();
        assert_eq!((img.width(), img.height()), (120, 40));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rgba_becomes_png() {
        let px = B64.encode([255u8, 0, 0, 255, 0, 255, 0, 255]);
        let out = encode_png(2, 1, &px).unwrap();
        let img = image::load_from_memory(&B64.decode(out).unwrap()).unwrap().to_rgba8();
        assert_eq!(img.get_pixel(1, 0).0, [0, 255, 0, 255]);
        assert!(encode_png(3, 3, &px).is_err());
    }
}
