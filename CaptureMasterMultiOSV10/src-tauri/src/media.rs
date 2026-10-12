// Image formats the webview cannot encode or decode itself. The page renders
// the picture to PNG (or to the final bytes for PNG/JPEG/WebP) and this side
// writes the file; formats like TIFF/TGA/QOI are turned into PNG for opening.

use image::codecs::{avif, bmp, gif, ico, png, qoi, tga, tiff};
use image::{DynamicImage, ImageEncoder};
use std::fs::File;
use std::io::{BufWriter, Write};

/// Icons cannot be larger than this on either side.
const ICO_MAX: u32 = 256;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Writes `src` to `path` as `format`. `raw` means the bytes are already in
/// their final format. Returns the number of bytes written.
pub fn export_image(src: &[u8], path: &str, format: &str, quality: u8) -> Result<u64, String> {
    if path.is_empty() {
        return Err("No file name was given.".into());
    }
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    let mut out = BufWriter::new(File::create(path).map_err(err)?);
    if format == "raw" {
        out.write_all(src).map_err(err)?;
    } else {
        let img = image::load_from_memory(src).map_err(err)?;
        encode(&img, format, quality.clamp(1, 100), &mut out)?;
    }
    out.flush().map_err(err)?;
    drop(out);
    Ok(std::fs::metadata(path).map(|m| m.len()).unwrap_or(0))
}

fn encode(img: &DynamicImage, format: &str, quality: u8, out: &mut BufWriter<File>) -> Result<(), String> {
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let color = image::ExtendedColorType::Rgba8;
    match format {
        "png" => png::PngEncoder::new_with_quality(out, png::CompressionType::Best, png::FilterType::Adaptive)
            .write_image(&rgba, w, h, color),
        "bmp" => bmp::BmpEncoder::new(out).write_image(&rgba, w, h, color),
        "gif" => gif::GifEncoder::new_with_speed(out, 10).encode(&rgba, w, h, color),
        "tiff" => tiff::TiffEncoder::new(out).write_image(&rgba, w, h, color),
        "tga" => tga::TgaEncoder::new(out).write_image(&rgba, w, h, color),
        "qoi" => qoi::QoiEncoder::new(out).write_image(&rgba, w, h, color),
        "avif" => avif::AvifEncoder::new_with_speed_quality(out, 8, quality).write_image(&rgba, w, h, color),
        "ico" => {
            let icon = if w > ICO_MAX || h > ICO_MAX {
                img.resize(ICO_MAX, ICO_MAX, image::imageops::FilterType::Lanczos3).to_rgba8()
            } else {
                rgba
            };
            let (iw, ih) = icon.dimensions();
            ico::IcoEncoder::new(out).write_image(&icon, iw, ih, color)
        }
        other => return Err(format!("Unsupported image format: {other}")),
    }
    .map_err(err)
}

/// Reads any image the `image` crate understands and returns it as PNG bytes.
pub fn read_as_png(path: &str) -> Result<Vec<u8>, String> {
    let img = image::ImageReader::open(path).map_err(err)?.with_guessed_format().map_err(err)?.decode().map_err(err)?;
    let rgba = img.to_rgba8();
    let mut buf = Vec::new();
    png::PngEncoder::new_with_quality(&mut buf, png::CompressionType::Fast, png::FilterType::Adaptive)
        .write_image(&rgba, rgba.width(), rgba.height(), image::ExtendedColorType::Rgba8)
        .map_err(err)?;
    Ok(buf)
}
