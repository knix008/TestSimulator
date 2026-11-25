// Picture formats beyond what the page (WebView2) and the `image` crate read: JPEG XL,
// JPEG 2000, Photoshop, PCX, Apple icons, DirectDraw textures and camera RAW. All pure Rust, nothing to install.
//
// `decode(path)` answers None for a file it does not handle (the caller then uses the `image`
// crate, which also reads TGA, HDR, OpenEXR, PNM, QOI and Farbfeld here), else the picture.
// Camera RAW shows the full-size JPEG the camera stores inside the file (every current camera
// writes one); developing the sensor data itself is not attempted.

use image::{DynamicImage, GrayAlphaImage, GrayImage, RgbImage, RgbaImage};

/// Extensions this module decodes (lower case, no dot).
pub const JXL: &[&str] = &["jxl"];
pub const J2K: &[&str] = &["jp2", "j2k", "j2c", "jpf", "jpx", "jpc"];
pub const PSD: &[&str] = &["psd"];
pub const PCX: &[&str] = &["pcx"];
pub const ICNS: &[&str] = &["icns"];
pub const DDS: &[&str] = &["dds"];
pub const RAW: &[&str] = &[
    "dng", "cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2", "orf", "rw2", "raf", "pef", "srw", "x3f", "3fr", "iiq", "mos", "mrw", "erf", "kdc", "dcr",
    "rwl",
];

fn ext_of(path: &str) -> String {
    std::path::Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

/// Whether this module decodes `path` (by its extension).
pub fn handles(path: &str) -> bool {
    let e = ext_of(path);
    [JXL, J2K, PSD, PCX, ICNS, DDS, RAW].iter().any(|list| list.contains(&e.as_str()))
}

/// The picture, or None when the file is not one of these formats.
pub fn decode(path: &str) -> Option<Result<DynamicImage, String>> {
    let e = ext_of(path);
    let e = e.as_str();
    let read = || std::fs::read(path).map_err(|err| err.to_string());
    let out = if JXL.contains(&e) {
        read().and_then(|b| jxl(&b))
    } else if J2K.contains(&e) {
        read().and_then(|b| jpeg2000(&b))
    } else if PSD.contains(&e) {
        read().and_then(|b| psd(&b))
    } else if PCX.contains(&e) {
        read().and_then(|b| pcx(&b))
    } else if ICNS.contains(&e) {
        read().and_then(|b| icns(&b))
    } else if DDS.contains(&e) {
        read().and_then(|b| dds(&b))
    } else if RAW.contains(&e) {
        read().and_then(|b| raw_preview(&b))
    } else {
        return None;
    };
    Some(out)
}

/// Interleaved 8-bit samples (1 gray, 2 gray+alpha, 3 RGB, 4 RGBA) as a picture.
fn from_samples(w: u32, h: u32, channels: usize, data: Vec<u8>) -> Result<DynamicImage, String> {
    let bad = || "bad pixel data".to_string();
    Ok(match channels {
        1 => DynamicImage::ImageLuma8(GrayImage::from_raw(w, h, data).ok_or_else(bad)?),
        2 => DynamicImage::ImageLumaA8(GrayAlphaImage::from_raw(w, h, data).ok_or_else(bad)?),
        3 => DynamicImage::ImageRgb8(RgbImage::from_raw(w, h, data).ok_or_else(bad)?),
        4 => DynamicImage::ImageRgba8(RgbaImage::from_raw(w, h, data).ok_or_else(bad)?),
        n => return Err(format!("{n} channels")),
    })
}

/// CMYK (+ alpha) 8-bit samples to RGB(A): the plain formula, enough for a screen.
fn cmyk_to_rgb(data: &[u8], alpha: bool) -> (Vec<u8>, usize) {
    let step = if alpha { 5 } else { 4 };
    let out_ch = if alpha { 4 } else { 3 };
    let mut out = Vec::with_capacity(data.len() / step * out_ch);
    for px in data.chunks_exact(step) {
        let k = 255 - u32::from(px[3]);
        for c in &px[..3] {
            out.push(((255 - u32::from(*c)) * k / 255) as u8);
        }
        if alpha {
            out.push(px[4]);
        }
    }
    (out, out_ch)
}

fn jxl(bytes: &[u8]) -> Result<DynamicImage, String> {
    let image = jxl_oxide::JxlImage::builder().read(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let render = image.render_frame(0).map_err(|e| e.to_string())?;
    let mut stream = render.stream();
    let (w, h, ch) = (stream.width(), stream.height(), stream.channels() as usize);
    let mut buf = vec![0u8; w as usize * h as usize * ch];
    stream.write_to_buffer::<u8>(&mut buf);
    match ch {
        1..=4 => from_samples(w, h, ch, buf),
        5 => {
            // CMYK + alpha
            let (rgb, n) = cmyk_to_rgb(&buf, true);
            from_samples(w, h, n, rgb)
        }
        n => Err(format!("JPEG XL with {n} channels")),
    }
}

fn jpeg2000(bytes: &[u8]) -> Result<DynamicImage, String> {
    use hayro_jpeg2000::{ColorSpace, DecodeSettings, DecoderContext, Image};
    let image = Image::new(bytes, &DecodeSettings::default()).map_err(|e| format!("{e:?}"))?;
    let (w, h, alpha) = (image.width(), image.height(), image.has_alpha());
    let space = image.color_space().clone();
    let mut ctx = DecoderContext::default();
    let decoded = image.decode(&mut ctx).map_err(|e| format!("{e:?}"))?;
    let data = decoded.data_u8();
    let color = match space {
        ColorSpace::Gray => 1,
        ColorSpace::RGB => 3,
        ColorSpace::CMYK => 4,
        ColorSpace::Unknown { num_channels } | ColorSpace::Icc { num_channels, .. } => usize::from(num_channels),
    };
    let ch = color + usize::from(alpha);
    if data.len() != w as usize * h as usize * ch {
        // Components the colour space does not describe: guess from the sample count
        let guess = data.len() / (w as usize * h as usize).max(1);
        return from_samples(w, h, guess.clamp(1, 4), data.into_iter().take(w as usize * h as usize * guess.clamp(1, 4)).collect());
    }
    if color == 4 {
        let (rgb, n) = cmyk_to_rgb(&data, alpha);
        return from_samples(w, h, n, rgb);
    }
    from_samples(w, h, ch, data)
}

fn psd(bytes: &[u8]) -> Result<DynamicImage, String> {
    let file = psd::Psd::from_bytes(bytes).map_err(|e| e.to_string())?;
    from_samples(file.width(), file.height(), 4, file.rgba())
}

fn pcx(bytes: &[u8]) -> Result<DynamicImage, String> {
    let mut reader = pcx::Reader::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let (w, h) = reader.dimensions();
    let (w, h) = (usize::from(w), usize::from(h));
    if reader.is_paletted() {
        let mut idx = vec![0u8; w * h];
        for row in idx.chunks_exact_mut(w) {
            reader.next_row_paletted(row).map_err(|e| e.to_string())?;
        }
        let mut palette = [0u8; 256 * 3];
        let n = reader.read_palette(&mut palette).map_err(|e| e.to_string())?;
        let mut rgb = Vec::with_capacity(w * h * 3);
        for &i in &idx {
            let i = usize::from(i).min(n.saturating_sub(1));
            rgb.extend_from_slice(&palette[i * 3..i * 3 + 3]);
        }
        from_samples(w as u32, h as u32, 3, rgb)
    } else {
        let mut rgb = vec![0u8; w * h * 3];
        for row in rgb.chunks_exact_mut(w * 3) {
            reader.next_row_rgb(row).map_err(|e| e.to_string())?;
        }
        from_samples(w as u32, h as u32, 3, rgb)
    }
}

fn icns(bytes: &[u8]) -> Result<DynamicImage, String> {
    let family = icns::IconFamily::read(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    // The largest icon the file holds
    let mut types = family.available_icons();
    types.sort_by_key(|t| t.pixel_width() * t.pixel_height());
    let mut last = String::from("no icon");
    for t in types.into_iter().rev() {
        match family.get_icon_with_type(t) {
            Ok(img) => {
                let rgba = img.convert_to(icns::PixelFormat::RGBA);
                return from_samples(rgba.width(), rgba.height(), 4, rgba.data().to_vec());
            }
            Err(e) => last = e.to_string(),
        }
    }
    Err(last)
}

/// DirectDraw texture (first mip level): uncompressed or block-compressed BC1–BC7.
fn dds(bytes: &[u8]) -> Result<DynamicImage, String> {
    let file = image_dds::ddsfile::Dds::read(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let rgba = image_dds::image_from_dds(&file, 0).map_err(|e| e.to_string())?;
    Ok(DynamicImage::ImageRgba8(rgba))
}

/// The largest complete JPEG inside a camera RAW file (its full-size preview).
pub fn embedded_jpeg(bytes: &[u8]) -> Option<&[u8]> {
    let mut best: Option<&[u8]> = None;
    let mut i = 0;
    while i + 4 < bytes.len() {
        // SOI followed by a marker (APPn / DQT / SOF …)
        if bytes[i] == 0xFF && bytes[i + 1] == 0xD8 && bytes[i + 2] == 0xFF {
            if let Some(end) = jpeg_end(bytes, i) {
                let part = &bytes[i..end];
                if best.is_none_or(|b| part.len() > b.len()) {
                    best = Some(part);
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }
    // Tiny thumbnails are not worth showing as the picture
    best.filter(|b| b.len() > 16 * 1024)
}

/// Where the JPEG that starts at `start` ends: walk its segments, then the entropy-coded data to EOI.
fn jpeg_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut i = start + 2;
    loop {
        while i < bytes.len() && bytes[i] == 0xFF && bytes.get(i + 1) == Some(&0xFF) {
            i += 1;
        }
        if i + 4 > bytes.len() || bytes[i] != 0xFF {
            return None;
        }
        let marker = bytes[i + 1];
        if marker == 0xD9 {
            return Some(i + 2);
        }
        let len = usize::from(u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]));
        if len < 2 {
            return None;
        }
        i += 2 + len;
        if marker == 0xDA {
            // Scan data: up to the next marker that is not a stuffed byte or a restart marker
            while i + 1 < bytes.len() {
                if bytes[i] == 0xFF && bytes[i + 1] != 0x00 && !(0xD0..=0xD7).contains(&bytes[i + 1]) {
                    break;
                }
                i += 1;
            }
            if i + 1 >= bytes.len() {
                return None;
            }
        }
    }
}

fn raw_preview(bytes: &[u8]) -> Result<DynamicImage, String> {
    let jpeg = embedded_jpeg(bytes).ok_or_else(|| "no preview picture in this RAW file".to_string())?;
    let mut decoder = image::codecs::jpeg::JpegDecoder::new(std::io::Cursor::new(jpeg)).map_err(|e| e.to_string())?;
    use image::ImageDecoder;
    let orientation = decoder.orientation().unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    img.apply_orientation(orientation);
    Ok(img)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_jpeg(w: u32, h: u32) -> Vec<u8> {
        let img = RgbImage::from_fn(w, h, |x, y| image::Rgb([(x * 7) as u8, (y * 5) as u8, 90]));
        let mut out = std::io::Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(img).write_to(&mut out, image::ImageFormat::Jpeg).unwrap();
        out.into_inner()
    }

    #[test]
    fn the_largest_embedded_jpeg_of_a_raw_file_is_found() {
        let small = tiny_jpeg(16, 16);
        let big = tiny_jpeg(400, 300);
        let mut raw = b"II*\0 fake raw header ".to_vec();
        raw.extend_from_slice(&small);
        raw.extend_from_slice(&[0x12, 0xFF, 0xD8, 0x00, 0x34]); // a stray SOI-like pair, not a JPEG
        raw.extend_from_slice(&big);
        raw.extend_from_slice(b" sensor data ...");
        let found = embedded_jpeg(&raw).expect("preview");
        assert_eq!(found, &big[..]);
        let img = raw_preview(&raw).unwrap();
        assert_eq!((img.width(), img.height()), (400, 300));
    }

    #[test]
    fn extensions_route_to_the_right_decoder() {
        for p in ["a.JXL", "b.jp2", "c.psd", "d.pcx", "e.icns", "f.CR3", "g.nef", "h.dng", "i.dds"] {
            assert!(handles(p), "{p}");
        }
        for p in ["a.jpg", "b.png", "c.tga", "d.exr", "e.txt"] {
            assert!(!handles(p), "{p}");
        }
        assert!(decode("x.png").is_none());
    }

    fn gradient(w: u32, h: u32) -> RgbImage {
        RgbImage::from_fn(w, h, |x, y| image::Rgb([(x * 255 / w) as u8, (y * 255 / h) as u8, 128]))
    }

    fn temp(name: &str) -> String {
        let dir = std::env::temp_dir().join(format!("miv-formats-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name).to_string_lossy().into_owned()
    }

    /// The viewer's own path: what the page gets for a file of this kind.
    fn open(path: &str) -> DynamicImage {
        crate::host::imaging::decode_upright(path).unwrap_or_else(|e| panic!("{path}: {e}"))
    }

    #[test]
    fn jpeg_xl_opens_pixel_exact() {
        use zune_core::{bit_depth::BitDepth, colorspace::ColorSpace, options::EncoderOptions};
        let src = gradient(40, 30);
        let mut bytes = Vec::new();
        zune_jpegxl::JxlSimpleEncoder::new(src.as_raw(), EncoderOptions::new(40, 30, ColorSpace::RGB, BitDepth::Eight))
            .encode(&mut bytes)
            .unwrap();
        let path = temp("pic.jxl");
        std::fs::write(&path, &bytes).unwrap();
        let img = open(&path).to_rgb8();
        assert_eq!(img.dimensions(), (40, 30));
        assert_eq!(img.as_raw(), src.as_raw(), "lossless JPEG XL comes back exactly");
    }

    #[test]
    fn image_crate_formats_open() {
        let src = DynamicImage::ImageRgb8(gradient(24, 16));
        for (name, format) in [
            ("p.tga", image::ImageFormat::Tga),
            ("p.ppm", image::ImageFormat::Pnm),
            ("p.qoi", image::ImageFormat::Qoi),
            ("p.ff", image::ImageFormat::Farbfeld),
            ("p.exr", image::ImageFormat::OpenExr),
            ("p.hdr", image::ImageFormat::Hdr),
        ] {
            let path = temp(name);
            let pic = match format {
                image::ImageFormat::OpenExr | image::ImageFormat::Hdr => DynamicImage::ImageRgb32F(src.to_rgb32f()),
                image::ImageFormat::Farbfeld => DynamicImage::ImageRgba16(src.to_rgba16()),
                _ => src.clone(),
            };
            pic.save_with_format(&path, format).unwrap_or_else(|e| panic!("write {name}: {e}"));
            let img = open(&path);
            assert_eq!((img.width(), img.height()), (24, 16), "{name}");
            let px = img.to_rgb8().get_pixel(12, 8).0;
            let want = src.to_rgb8().get_pixel(12, 8).0;
            assert!(px.iter().zip(want).all(|(a, b)| (i16::from(*a) - i16::from(b)).abs() <= 3), "{name}: {px:?} vs {want:?}");
        }
    }

    /// A Photoshop file with no layers: header, empty sections, raw planar RGB.
    fn tiny_psd(w: u32, h: u32, rgb: &RgbImage) -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(b"8BPS");
        b.extend_from_slice(&1u16.to_be_bytes());
        b.extend_from_slice(&[0; 6]);
        b.extend_from_slice(&3u16.to_be_bytes()); // channels
        b.extend_from_slice(&h.to_be_bytes());
        b.extend_from_slice(&w.to_be_bytes());
        b.extend_from_slice(&8u16.to_be_bytes()); // depth
        b.extend_from_slice(&3u16.to_be_bytes()); // RGB
        b.extend_from_slice(&0u32.to_be_bytes()); // colour mode data
        b.extend_from_slice(&0u32.to_be_bytes()); // image resources
        b.extend_from_slice(&0u32.to_be_bytes()); // layers and masks
        b.extend_from_slice(&0u16.to_be_bytes()); // raw image data
        for c in 0..3 {
            for p in rgb.pixels() {
                b.push(p.0[c]);
            }
        }
        b
    }

    #[test]
    fn photoshop_opens() {
        let src = gradient(20, 10);
        let path = temp("p.psd");
        std::fs::write(&path, tiny_psd(20, 10, &src)).unwrap();
        let img = open(&path).to_rgb8();
        assert_eq!(img.dimensions(), (20, 10));
        assert_eq!(img.get_pixel(15, 7), src.get_pixel(15, 7));
    }

    #[test]
    fn cmyk_becomes_rgb() {
        let (rgb, n) = cmyk_to_rgb(&[0, 0, 0, 0, 255, 255, 255, 255], false);
        assert_eq!(n, 3);
        assert_eq!(rgb, vec![255, 255, 255, 0, 0, 0]);
    }
}
