// Pictures the webview cannot show by itself (TIFF) → PNG, and the header facts the
// Info panel lists (size, colour, orientation …). HEIC / HEIF is decoded in the page
// (libheif, the same decoder the Node host used) and EXIF / XMP / IPTC are read there
// too (exifr), see tauriAPI.js.

use super::{error, progress};
use image::{DynamicImage, ImageDecoder, ImageReader, RgbImage};
use serde_json::{json, Map, Value};
use std::io::Read;

fn reader(path: &str) -> Result<ImageReader<std::io::BufReader<std::fs::File>>, String> {
    let mut r = ImageReader::open(path).map_err(|e| e.to_string())?.with_guessed_format().map_err(|e| e.to_string())?;
    // Big panoramas are exactly what needs a thumbnail most
    r.no_limits();
    Ok(r)
}

/// The picture the way it is meant to be seen (EXIF orientation applied).
pub(crate) fn decode_upright(path: &str) -> Result<DynamicImage, String> {
    let mut decoder = reader(path)?.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    img.apply_orientation(orientation);
    Ok(img)
}

/// RGB on a white background (transparent parts of PNG / WebP / GIF thumbnails).
pub(crate) fn flatten_on_white(img: &DynamicImage) -> RgbImage {
    if !img.color().has_alpha() {
        return img.to_rgb8();
    }
    let rgba = img.to_rgba8();
    RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let [r, g, b, a] = rgba.get_pixel(x, y).0;
        let a = u32::from(a);
        let over = |c: u8| ((u32::from(c) * a + 255 * (255 - a) + 127) / 255) as u8;
        image::Rgb([over(r), over(g), over(b)])
    })
}

pub fn convert_to_png(path: &str) -> Value {
    progress(12, "reading");
    let img = match decode_upright(path) {
        Ok(img) => img,
        Err(e) => return error(e),
    };
    progress(40, "converting");
    // 8 bits per channel, as the page draws it anyway
    let img = if img.color().has_alpha() { DynamicImage::ImageRgba8(img.to_rgba8()) } else { DynamicImage::ImageRgb8(img.to_rgb8()) };
    let mut png = std::io::Cursor::new(Vec::new());
    if let Err(e) = img.write_to(&mut png, image::ImageFormat::Png) {
        return error(e);
    }
    progress(92, "displaying");
    json!(format!("data:image/png;base64,{}", super::b64(png.get_ref())))
}

/// The "basic" part of read-image-meta (what sharp's metadata() gave the Node host);
/// the page adds the tags it reads with exifr. Fields it cannot tell are left out.
pub fn image_basic_meta(path: &str) -> Value {
    let mut basic = Map::new();
    let ext = super::node_extname(path).to_lowercase();
    if let Ok(r) = reader(path) {
        let format = r.format();
        if let Some(f) = format {
            let name = match f {
                image::ImageFormat::Jpeg => "jpeg",
                image::ImageFormat::Png => "png",
                image::ImageFormat::Gif => "gif",
                image::ImageFormat::WebP => "webp",
                image::ImageFormat::Tiff => "tiff",
                image::ImageFormat::Bmp => "bmp",
                image::ImageFormat::Ico => "ico",
                _ => "",
            };
            if !name.is_empty() {
                basic.insert("format".into(), json!(name));
            }
        }
        if let Ok(mut decoder) = r.into_decoder() {
            let (w, h) = decoder.dimensions();
            basic.insert("width".into(), json!(w));
            basic.insert("height".into(), json!(h));
            let color = decoder.color_type();
            let channels = color.channel_count();
            basic.insert("channels".into(), json!(channels));
            basic.insert("space".into(), json!(if channels <= 2 { "b-w" } else { "srgb" }));
            basic.insert("depth".into(), json!(if color.bytes_per_pixel() / channels >= 2 { "ushort" } else { "uchar" }));
            if color.has_alpha() {
                basic.insert("hasAlpha".into(), json!(true));
            }
            if decoder.icc_profile().ok().flatten().is_some() {
                basic.insert("hasProfile".into(), json!(true));
            }
            if let Some(o) = exif_orientation(&mut decoder) {
                basic.insert("orientation".into(), json!(o));
            }
        }
    }
    if ext == ".jpg" || ext == ".jpeg" || ext == ".jfif" {
        if let Some(progressive) = jpeg_is_progressive(path) {
            if progressive {
                basic.insert("isProgressive".into(), json!(true));
            }
        }
    }
    if matches!(ext.as_str(), ".svg") {
        basic.insert("format".into(), json!("svg"));
    } else if matches!(ext.as_str(), ".heic" | ".heif" | ".hif" | ".avif") && !basic.contains_key("format") {
        basic.insert("format".into(), json!("heif"));
    }
    json!({ "basic": basic, "tags": {}, "all": {} })
}

fn exif_orientation(decoder: &mut impl ImageDecoder) -> Option<u8> {
    use image::metadata::Orientation::*;
    let o = decoder.orientation().ok()?;
    Some(match o {
        NoTransforms => return None,
        FlipHorizontal => 2,
        Rotate180 => 3,
        FlipVertical => 4,
        Rotate90FlipH => 5,
        Rotate90 => 6,
        Rotate270FlipH => 7,
        Rotate270 => 8,
    })
}

/// SOF2 (progressive DCT) before the first scan.
fn jpeg_is_progressive(path: &str) -> Option<bool> {
    let mut f = std::io::BufReader::new(std::fs::File::open(path).ok()?);
    let mut two = [0u8; 2];
    f.read_exact(&mut two).ok()?;
    if two != [0xFF, 0xD8] {
        return None;
    }
    loop {
        // Markers may be padded with 0xFF bytes
        let mut b = [0u8; 1];
        f.read_exact(&mut b).ok()?;
        if b[0] != 0xFF {
            return None;
        }
        while b[0] == 0xFF {
            f.read_exact(&mut b).ok()?;
        }
        let marker = b[0];
        match marker {
            0xC2 | 0xC6 | 0xCA | 0xCE => return Some(true),
            0xC0 | 0xC1 | 0xC3 | 0xC5 | 0xC7 | 0xC9 | 0xCB | 0xCD | 0xDA => return Some(false),
            0xD0..=0xD9 | 0x01 => continue,
            _ => {
                let mut len = [0u8; 2];
                f.read_exact(&mut len).ok()?;
                let n = u16::from_be_bytes(len).saturating_sub(2);
                f.seek_relative(i64::from(n)).ok()?;
            }
        }
    }
}
