//! qrimage — turns the rendered RGBA pixels into image files.
//!
//! The desktop app calls [`encode`] natively (Tauri command `export_image`); the browser
//! build loads the same crate as WebAssembly (`wasm.rs`) the first time something is exported.

use image::codecs::bmp::BmpEncoder;
use image::codecs::gif::GifEncoder;
use image::codecs::ico::{IcoEncoder, IcoFrame};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::codecs::tiff::TiffEncoder;
use image::codecs::webp::WebPEncoder;
use image::{imageops, ExtendedColorType, Frame, ImageEncoder, RgbaImage};
use std::io::Cursor;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Format {
    Png,
    Jpeg,
    Webp,
    Bmp,
    Gif,
    Tiff,
    Ico,
}

impl Format {
    pub const ALL: [Format; 7] = [Format::Png, Format::Jpeg, Format::Webp, Format::Bmp, Format::Gif, Format::Tiff, Format::Ico];

    pub fn from_name(name: &str) -> Option<Format> {
        Some(match name.to_ascii_lowercase().as_str() {
            "png" => Format::Png,
            "jpeg" | "jpg" => Format::Jpeg,
            "webp" => Format::Webp,
            "bmp" => Format::Bmp,
            "gif" => Format::Gif,
            "tiff" | "tif" => Format::Tiff,
            "ico" => Format::Ico,
            _ => return None,
        })
    }

    /// The number the WebAssembly ABI uses (index into [`Format::ALL`]).
    pub fn from_id(id: u32) -> Option<Format> {
        Format::ALL.get(id as usize).copied()
    }

    pub fn extension(self) -> &'static str {
        match self {
            Format::Png => "png",
            Format::Jpeg => "jpg",
            Format::Webp => "webp",
            Format::Bmp => "bmp",
            Format::Gif => "gif",
            Format::Tiff => "tif",
            Format::Ico => "ico",
        }
    }
}

/// Icon sizes written into .ico files (only those not larger than the source).
pub const ICO_SIZES: [u32; 7] = [16, 24, 32, 48, 64, 128, 256];

fn is_opaque(rgba: &[u8]) -> bool {
    rgba.chunks_exact(4).all(|p| p[3] == 255)
}

/// RGB with any transparency blended over `background`.
fn flatten(rgba: &[u8], background: [u8; 3]) -> Vec<u8> {
    let mut out = Vec::with_capacity(rgba.len() / 4 * 3);
    for p in rgba.chunks_exact(4) {
        let a = p[3] as u32;
        for c in 0..3 {
            out.push(((p[c] as u32 * a + background[c] as u32 * (255 - a) + 127) / 255) as u8);
        }
    }
    out
}

/// Encodes `width`×`height` RGBA pixels. `quality` (1–100) is used by JPEG; `background`
/// fills transparency in formats without alpha (JPEG) and opaque copies elsewhere.
pub fn encode(rgba: &[u8], width: u32, height: u32, format: Format, quality: u8, background: [u8; 3]) -> Result<Vec<u8>, String> {
    if width == 0 || height == 0 || rgba.len() != width as usize * height as usize * 4 {
        return Err(format!("expected {width}×{height} RGBA pixels, got {} bytes", rgba.len()));
    }
    let opaque = is_opaque(rgba);
    let rgb = || flatten(rgba, background);
    let mut out = Vec::new();
    let err = |e: image::ImageError| e.to_string();

    match format {
        Format::Png => {
            let encoder = PngEncoder::new_with_quality(&mut out, CompressionType::Best, FilterType::Adaptive);
            if opaque {
                encoder.write_image(&rgb(), width, height, ExtendedColorType::Rgb8).map_err(err)?;
            } else {
                encoder.write_image(rgba, width, height, ExtendedColorType::Rgba8).map_err(err)?;
            }
        }
        Format::Jpeg => {
            JpegEncoder::new_with_quality(&mut out, quality.clamp(1, 100)).write_image(&rgb(), width, height, ExtendedColorType::Rgb8).map_err(err)?;
        }
        Format::Webp => {
            // Lossless: QR codes are flat colours, and lossy blur only hurts scanning.
            let encoder = WebPEncoder::new_lossless(&mut out);
            if opaque {
                encoder.write_image(&rgb(), width, height, ExtendedColorType::Rgb8).map_err(err)?;
            } else {
                encoder.write_image(rgba, width, height, ExtendedColorType::Rgba8).map_err(err)?;
            }
        }
        Format::Bmp => {
            let mut cursor = Cursor::new(&mut out);
            let mut encoder = BmpEncoder::new(&mut cursor);
            if opaque {
                encoder.encode(&rgb(), width, height, ExtendedColorType::Rgb8).map_err(err)?;
            } else {
                encoder.encode(rgba, width, height, ExtendedColorType::Rgba8).map_err(err)?;
            }
        }
        Format::Gif => {
            // GIF transparency is on/off: half-transparent edges become one or the other.
            let pixels: Vec<u8> = rgba
                .chunks_exact(4)
                .flat_map(|p| if p[3] < 128 { [0, 0, 0, 0] } else { [p[0], p[1], p[2], 255] })
                .collect();
            let image = RgbaImage::from_raw(width, height, pixels).ok_or("bad pixel buffer")?;
            let mut encoder = GifEncoder::new_with_speed(&mut out, 10);
            encoder.encode_frame(Frame::new(image)).map_err(err)?;
        }
        Format::Tiff => {
            let encoder = TiffEncoder::new(Cursor::new(&mut out));
            if opaque {
                encoder.write_image(&rgb(), width, height, ExtendedColorType::Rgb8).map_err(err)?;
            } else {
                encoder.write_image(rgba, width, height, ExtendedColorType::Rgba8).map_err(err)?;
            }
        }
        Format::Ico => {
            let source = RgbaImage::from_raw(width, height, rgba.to_vec()).ok_or("bad pixel buffer")?;
            let largest = width.min(height).min(256);
            let mut sizes: Vec<u32> = ICO_SIZES.iter().copied().filter(|&s| s <= largest).collect();
            if sizes.last() != Some(&largest) {
                sizes.push(largest);
            }
            let mut frames = Vec::new();
            for size in sizes {
                let scaled = if size == width && size == height { source.clone() } else { imageops::resize(&source, size, size, imageops::FilterType::Lanczos3) };
                frames.push(IcoFrame::as_png(scaled.as_raw(), size, size, ExtendedColorType::Rgba8).map_err(err)?);
            }
            IcoEncoder::new(&mut out).encode_images(&frames).map_err(err)?;
        }
    }
    Ok(out)
}

/// Reads a PNG, JPEG, GIF, WebP, BMP, ICO or TIFF file into RGBA.
/// The long side is capped at 512 px, which is what a logo is stored as.
pub fn decode_rgba(bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), String> {
    let mut reader = image::ImageReader::new(Cursor::new(bytes)).with_guessed_format().map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|e| e.to_string())?.to_rgba8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Err("empty image".into());
    }
    let longest = width.max(height);
    if longest <= 512 {
        return Ok((width, height, image.into_raw()));
    }
    let scaled_w = ((width as u64 * 512) / longest as u64).max(1) as u32;
    let scaled_h = ((height as u64 * 512) / longest as u64).max(1) as u32;
    let scaled = imageops::resize(&image, scaled_w, scaled_h, imageops::FilterType::Lanczos3);
    Ok((scaled_w, scaled_h, scaled.into_raw()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A small QR-like test card: dark/light blocks with a transparent corner.
    fn sample(size: u32, transparent: bool) -> Vec<u8> {
        let mut px = Vec::new();
        for y in 0..size {
            for x in 0..size {
                let dark = ((x / 8) + (y / 8)) % 2 == 0;
                let alpha = if transparent && x < 8 && y < 8 { 0 } else { 255 };
                px.extend_from_slice(if dark { &[17, 24, 39] } else { &[255, 255, 255] });
                px.push(alpha);
            }
        }
        px
    }

    fn decode(bytes: &[u8]) -> image::DynamicImage {
        image::load_from_memory(bytes).expect("decodes")
    }

    #[test]
    fn lossless_formats_round_trip_exactly() {
        let px = sample(64, false);
        for format in [Format::Png, Format::Webp, Format::Bmp, Format::Tiff] {
            let bytes = encode(&px, 64, 64, format, 90, [255, 255, 255]).unwrap();
            let back = decode(&bytes).to_rgba8();
            assert_eq!(back.dimensions(), (64, 64), "{format:?}");
            assert_eq!(back.as_raw(), &px, "{format:?}");
        }
    }

    #[test]
    fn alpha_survives_where_the_format_has_it() {
        let px = sample(32, true);
        for format in [Format::Png, Format::Webp, Format::Bmp, Format::Tiff, Format::Gif] {
            let back = decode(&encode(&px, 32, 32, format, 90, [255, 255, 255]).unwrap()).to_rgba8();
            assert_eq!(back.get_pixel(0, 0)[3], 0, "{format:?} corner is transparent");
            assert_eq!(back.get_pixel(20, 20)[3], 255, "{format:?} body is opaque");
        }
    }

    #[test]
    fn jpeg_fills_transparency_with_the_background_and_stays_close() {
        let px = sample(64, true);
        let back = decode(&encode(&px, 64, 64, Format::Jpeg, 95, [255, 0, 0]).unwrap()).to_rgb8();
        let corner = back.get_pixel(3, 3);
        assert!(corner[0] > 200 && corner[1] < 60, "transparent corner became the red background: {corner:?}");
        let dark = back.get_pixel(12, 12);
        assert!(dark[0] < 60, "dark module stays dark: {dark:?}");
    }

    #[test]
    fn gif_keeps_the_two_colours() {
        let px = sample(48, false);
        let back = decode(&encode(&px, 48, 48, Format::Gif, 90, [255, 255, 255]).unwrap()).to_rgba8();
        for (a, b) in back.as_raw().chunks_exact(4).zip(px.chunks_exact(4)) {
            for c in 0..3 {
                assert!((a[c] as i32 - b[c] as i32).abs() <= 8, "{a:?} vs {b:?}");
            }
        }
    }

    #[test]
    fn ico_holds_every_size_up_to_256() {
        let px = sample(256, false);
        let bytes = encode(&px, 256, 256, Format::Ico, 90, [255, 255, 255]).unwrap();
        assert_eq!(&bytes[..4], &[0, 0, 1, 0]);
        assert_eq!(u16::from_le_bytes([bytes[4], bytes[5]]) as usize, ICO_SIZES.len());
        assert_eq!(decode(&bytes).width(), 256);
        let small = encode(&sample(40, false), 40, 40, Format::Ico, 90, [255, 255, 255]).unwrap();
        assert_eq!(u16::from_le_bytes([small[4], small[5]]), 4, "16, 24, 32 and the 40 px source");
    }

    #[test]
    fn names_and_ids_map_to_formats() {
        assert_eq!(Format::from_name("JPG"), Some(Format::Jpeg));
        assert_eq!(Format::from_name("svg"), None);
        for (i, f) in Format::ALL.iter().enumerate() {
            assert_eq!(Format::from_id(i as u32), Some(*f));
        }
    }

    #[test]
    fn wrong_buffer_sizes_are_rejected() {
        assert!(encode(&[0; 10], 2, 2, Format::Png, 90, [0; 3]).is_err());
    }

    #[test]
    fn decode_rgba_reads_tiff_and_caps_the_long_side() {
        let px = sample(64, true);
        let bytes = encode(&px, 64, 64, Format::Tiff, 90, [255, 255, 255]).unwrap();
        let (w, h, rgba) = decode_rgba(&bytes).unwrap();
        assert_eq!((w, h), (64, 64));
        assert_eq!(rgba, px);
        let big = encode(&sample(600, false), 600, 600, Format::Png, 90, [255, 255, 255]).unwrap();
        let (w, h, rgba) = decode_rgba(&big).unwrap();
        assert_eq!((w, h), (512, 512));
        assert_eq!(rgba.len(), 512 * 512 * 4);
        assert!(decode_rgba(b"not an image").is_err());
    }

    #[test]
    fn decode_rgba_round_trips_lossless_formats() {
        let px = sample(32, false);
        for format in [Format::Png, Format::Webp, Format::Bmp, Format::Tiff, Format::Ico] {
            let bytes = encode(&px, 32, 32, format, 90, [255, 255, 255]).unwrap();
            let (w, h, rgba) = decode_rgba(&bytes).unwrap();
            assert_eq!((w, h), (32, 32), "{format:?}");
            assert_eq!(rgba, px, "{format:?}");
        }
        let wide = vec![225, 29, 72, 255].repeat(520 * 8);
        let (w, h, rgba) = decode_rgba(&encode(&wide, 520, 8, Format::Tiff, 90, [255, 255, 255]).unwrap()).unwrap();
        assert_eq!(w, 512);
        assert!(h < 8 && h >= 1, "height scaled with the width, got {h}");
        let mid = ((h / 2) * w + w / 2) as usize * 4;
        assert_eq!(&rgba[mid..mid + 4], &[225, 29, 72, 255]);
    }
}
