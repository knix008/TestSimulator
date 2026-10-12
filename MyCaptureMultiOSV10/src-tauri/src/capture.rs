//! Screen, window and region grabbing plus image encoding.
//!
//! Every coordinate here is in physical pixels of the virtual desktop, which is
//! what xcap reports on all three platforms.

use crate::tr;
use base64::Engine;
use image::codecs::bmp::BmpEncoder;
use image::codecs::gif::GifEncoder;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::codecs::tiff::TiffEncoder;
use image::codecs::webp::WebPEncoder;
use image::{imageops, DynamicImage, ImageEncoder, RgbaImage};
use serde::{Deserialize, Serialize};
use std::path::Path;
use xcap::{Monitor, Window};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub id: u32,
    pub title: String,
    pub app_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub focused: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Source {
    Monitor { id: u32 },
    #[serde(rename = "allMonitors")]
    AllMonitors,
    Window { id: u32 },
    /// MyCapture's own main window, grabbed by lib.rs where the window is known.
    App,
    #[serde(rename_all = "camelCase")]
    Region {
        monitor_id: u32,
        x: u32,
        y: u32,
        width: u32,
        height: u32,
    },
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ImageKind {
    #[serde(alias = "jpeg")]
    Jpg,
    Png,
    Gif,
    #[serde(alias = "tif")]
    Tiff,
    Bmp,
    Webp,
}

impl ImageKind {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "jpg" | "jpeg" => Ok(Self::Jpg),
            "png" => Ok(Self::Png),
            "gif" => Ok(Self::Gif),
            "tif" | "tiff" => Ok(Self::Tiff),
            "bmp" => Ok(Self::Bmp),
            "webp" => Ok(Self::Webp),
            _ => Err(tr!("지원하지 않는 이미지 형식입니다. JPG 또는 PNG를 선택하세요.", "Unsupported image format. Choose JPG, PNG, GIF, TIFF, BMP or WEBP.")),
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Jpg => "jpg",
            Self::Png => "png",
            Self::Gif => "gif",
            Self::Tiff => "tiff",
            Self::Bmp => "bmp",
            Self::Webp => "webp",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

fn monitor_info(monitor: &Monitor) -> Result<MonitorInfo, String> {
    let fail = |error: xcap::XCapError| tr!("디스플레이 정보 조회 실패: {error}", "Could not read display information: {error}");
    Ok(MonitorInfo {
        id: monitor.id().map_err(fail)?,
        name: monitor.name().unwrap_or_default(),
        x: monitor.x().map_err(fail)?,
        y: monitor.y().map_err(fail)?,
        width: monitor.width().map_err(fail)?,
        height: monitor.height().map_err(fail)?,
        scale_factor: monitor.scale_factor().unwrap_or(1.0),
        primary: monitor.is_primary().unwrap_or(false),
    })
}

fn all_monitors() -> Result<Vec<Monitor>, String> {
    let monitors = Monitor::all().map_err(|error| tr!("디스플레이 목록 조회 실패: {error}", "Could not list displays: {error}"))?;
    if monitors.is_empty() {
        return Err(tr!("사용 가능한 디스플레이가 없습니다.", "No display is available."));
    }
    Ok(monitors)
}

/// Monitors sorted primary first, then left to right.
pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    let mut infos = all_monitors()?
        .iter()
        .map(monitor_info)
        .collect::<Result<Vec<_>, _>>()?;
    infos.sort_by_key(|info| (!info.primary, info.x, info.y));
    Ok(infos)
}

/// Capturable top-level windows in z-order, excluding windows owned by `exclude_pid`.
pub fn list_windows(exclude_pid: Option<u32>) -> Result<Vec<WindowInfo>, String> {
    let windows = Window::all().map_err(|error| tr!("창 목록 조회 실패: {error}", "Could not list windows: {error}"))?;
    let mut infos = Vec::new();
    for window in windows {
        if exclude_pid.is_some() && window.pid().ok() == exclude_pid {
            continue;
        }
        if window.is_minimized().unwrap_or(true) {
            continue;
        }
        let title = window.title().unwrap_or_default();
        let (Ok(width), Ok(height)) = (window.width(), window.height()) else {
            continue;
        };
        if title.trim().is_empty() || width < 16 || height < 16 {
            continue;
        }
        let Ok(id) = window.id() else { continue };
        infos.push(WindowInfo {
            id,
            title,
            app_name: window.app_name().unwrap_or_default(),
            x: window.x().unwrap_or(0),
            y: window.y().unwrap_or(0),
            width,
            height,
            focused: window.is_focused().unwrap_or(false),
        });
    }
    Ok(infos)
}

fn find_monitor(id: u32) -> Result<Monitor, String> {
    all_monitors()?
        .into_iter()
        .find(|monitor| monitor.id().ok() == Some(id))
        .ok_or_else(|| tr!("선택한 디스플레이를 찾을 수 없습니다. 목록을 새로 고치세요.", "The selected display was not found. Refresh the list."))
}

pub fn monitor_by_id(id: u32) -> Result<MonitorInfo, String> {
    monitor_info(&find_monitor(id)?)
}

fn find_window(id: u32) -> Result<Window, String> {
    Window::all()
        .map_err(|error| tr!("창 목록 조회 실패: {error}", "Could not list windows: {error}"))?
        .into_iter()
        .find(|window| window.id().ok() == Some(id))
        .ok_or_else(|| tr!("선택한 창이 닫혔습니다. 창 목록을 새로 고치세요.", "The selected window was closed. Refresh the window list."))
}

/// The part of the virtual-desktop rectangle `rect` (x, y, width, height) that
/// lies inside `bounds` (left, top, right, bottom), or None when nothing of it does.
pub fn clip_rect(rect: (i32, i32, u32, u32), bounds: (i32, i32, i32, i32)) -> Option<(i32, i32, u32, u32)> {
    let (x, y, width, height) = (i64::from(rect.0), i64::from(rect.1), i64::from(rect.2), i64::from(rect.3));
    let left = x.max(i64::from(bounds.0));
    let top = y.max(i64::from(bounds.1));
    let right = (x + width).min(i64::from(bounds.2));
    let bottom = (y + height).min(i64::from(bounds.3));
    (right > left && bottom > top).then(|| (left as i32, top as i32, (right - left) as u32, (bottom - top) as u32))
}

/// What the screen shows inside a virtual-desktop rectangle (physical pixels) —
/// used for MyCapture's own window. Parts outside every display are cut off.
pub fn grab_desktop_rect(x: i32, y: i32, width: u32, height: u32) -> Result<RgbaImage, String> {
    let offscreen = || tr!("MyCapture 창이 화면에 보이지 않습니다. 창을 화면 안으로 옮긴 뒤 다시 시도하세요.", "The MyCapture window is not on screen. Move it onto a display and try again.");
    let monitors = all_monitors()?;
    let infos = monitors.iter().map(monitor_info).collect::<Result<Vec<_>, _>>()?;
    // Usually the window sits on one display: read just that area of it.
    for (monitor, info) in monitors.iter().zip(&infos) {
        let bounds = (info.x, info.y, info.x + info.width as i32, info.y + info.height as i32);
        if clip_rect((x, y, width, height), bounds) == Some((x, y, width, height)) {
            return monitor
                .capture_region((x - info.x) as u32, (y - info.y) as u32, width, height)
                .map_err(|error| tr!("창 캡처 실패: {error}", "Window capture failed: {error}"));
        }
    }
    // Across displays (or partly off screen): the whole desktop, cropped.
    let parts = grab_each_monitor()?;
    let left = infos.iter().map(|info| info.x).min().unwrap_or(0);
    let top = infos.iter().map(|info| info.y).min().unwrap_or(0);
    let desktop = composite(&parts)?;
    let bounds = (left, top, left + desktop.width() as i32, top + desktop.height() as i32);
    let (cx, cy, cw, ch) = clip_rect((x, y, width, height), bounds).ok_or_else(offscreen)?;
    crop(&desktop, Rect { x: (cx - left) as u32, y: (cy - top) as u32, width: cw, height: ch })
}

/// Validates that `rect` lies inside a `width` × `height` image and is not empty.
pub fn validate_rect(rect: Rect, width: u32, height: u32) -> Result<(), String> {
    let fits_x = rect.x.checked_add(rect.width).is_some_and(|right| right <= width);
    let fits_y = rect.y.checked_add(rect.height).is_some_and(|bottom| bottom <= height);
    if rect.width == 0 || rect.height == 0 {
        return Err(tr!("캡처 영역의 너비와 높이는 0보다 커야 합니다.", "The capture region must be wider and taller than 0."));
    }
    if !fits_x || !fits_y {
        return Err(tr!(
            "캡처 영역({}, {}, {}×{})이 디스플레이 범위({width}×{height})를 벗어났습니다.",
            "The capture region ({}, {}, {}×{}) lies outside the display ({width}×{height}).",
            rect.x, rect.y, rect.width, rect.height
        ));
    }
    Ok(())
}

pub fn crop(image: &RgbaImage, rect: Rect) -> Result<RgbaImage, String> {
    validate_rect(rect, image.width(), image.height())?;
    Ok(imageops::crop_imm(image, rect.x, rect.y, rect.width, rect.height).to_image())
}

/// Places every monitor image at its desktop position on one canvas.
pub fn composite(parts: &[(MonitorInfo, RgbaImage)]) -> Result<RgbaImage, String> {
    let left = parts.iter().map(|(info, _)| info.x).min().ok_or_else(|| tr!("캡처할 디스플레이가 없습니다.", "There is no display to capture."))?;
    let top = parts.iter().map(|(info, _)| info.y).min().unwrap_or(0);
    let right = parts.iter().map(|(info, image)| info.x + image.width() as i32).max().unwrap_or(0);
    let bottom = parts.iter().map(|(info, image)| info.y + image.height() as i32).max().unwrap_or(0);
    let mut canvas = RgbaImage::from_pixel(
        (right - left) as u32,
        (bottom - top) as u32,
        image::Rgba([0, 0, 0, 255]),
    );
    for (info, image) in parts {
        imageops::replace(&mut canvas, image, i64::from(info.x - left), i64::from(info.y - top));
    }
    Ok(canvas)
}

fn capture_monitor(monitor: &Monitor) -> Result<RgbaImage, String> {
    monitor
        .capture_image()
        .map_err(|error| tr!("화면 캡처 실패: {error}", "Screen capture failed: {error}"))
}

/// Captures every monitor; used to freeze the desktop for region selection.
pub fn grab_each_monitor() -> Result<Vec<(MonitorInfo, RgbaImage)>, String> {
    all_monitors()?
        .iter()
        .map(|monitor| Ok((monitor_info(monitor)?, capture_monitor(monitor)?)))
        .collect()
}

pub fn grab(source: &Source) -> Result<RgbaImage, String> {
    match source {
        Source::Monitor { id } => capture_monitor(&find_monitor(*id)?),
        Source::AllMonitors => composite(&grab_each_monitor()?),
        Source::Window { id } => {
            let window = find_window(*id)?;
            if window.is_minimized().unwrap_or(false) {
                return Err(tr!("최소화된 창은 캡처할 수 없습니다. 창을 복원한 뒤 다시 시도하세요.", "A minimized window cannot be captured. Restore it and try again."));
            }
            let image = window
                .capture_image()
                .map_err(|error| tr!("창 캡처 실패: {error}", "Window capture failed: {error}"))?;
            if image.width() == 0 || image.height() == 0 {
                return Err(tr!("창 내용을 가져오지 못했습니다.", "Could not read the window contents."));
            }
            Ok(image)
        }
        Source::App => Err(tr!("MyCapture 창 캡처는 앱 안에서만 할 수 있습니다.", "The MyCapture window can only be captured from inside the app.")),
        Source::Region { monitor_id, x, y, width, height } => {
            let monitor = find_monitor(*monitor_id)?;
            let info = monitor_info(&monitor)?;
            let rect = Rect { x: *x, y: *y, width: *width, height: *height };
            validate_rect(rect, info.width, info.height)?;
            monitor
                .capture_region(rect.x, rect.y, rect.width, rect.height)
                .map_err(|error| tr!("영역 캡처 실패: {error}", "Region capture failed: {error}"))
        }
    }
}

pub fn encode(image: &RgbaImage, kind: ImageKind, jpeg_quality: u8) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    let fail = |error: image::ImageError| tr!("이미지 인코딩 실패: {error}", "Image encoding failed: {error}");
    match kind {
        ImageKind::Jpg => {
            let rgb = DynamicImage::ImageRgba8(image.clone()).into_rgb8();
            JpegEncoder::new_with_quality(&mut bytes, jpeg_quality.clamp(1, 100))
                .write_image(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(fail)?;
        }
        ImageKind::Png => {
            PngEncoder::new_with_quality(&mut bytes, CompressionType::Fast, FilterType::Adaptive)
                .write_image(image.as_raw(), image.width(), image.height(), image::ExtendedColorType::Rgba8)
                .map_err(fail)?;
        }
        ImageKind::Gif => {
            // 256-colour palette per image (NeuQuant); speed 10 keeps a 4K frame near a second.
            let mut encoder = GifEncoder::new_with_speed(&mut bytes, 10);
            encoder
                .encode_frame(image::Frame::new(image.clone()))
                .map_err(fail)?;
        }
        ImageKind::Tiff => {
            TiffEncoder::new(std::io::Cursor::new(&mut bytes))
                .write_image(image.as_raw(), image.width(), image.height(), image::ExtendedColorType::Rgba8)
                .map_err(fail)?;
        }
        ImageKind::Bmp => {
            let rgb = DynamicImage::ImageRgba8(image.clone()).into_rgb8();
            BmpEncoder::new(&mut bytes)
                .write_image(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(fail)?;
        }
        ImageKind::Webp => {
            // The pure-Rust encoder is lossless only.
            WebPEncoder::new_lossless(&mut bytes)
                .write_image(image.as_raw(), image.width(), image.height(), image::ExtendedColorType::Rgba8)
                .map_err(fail)?;
        }
    }
    Ok(bytes)
}

/// Encodes first, then writes, so a failed encode never leaves a partial file behind.
pub fn save(image: &RgbaImage, path: &Path, kind: ImageKind, jpeg_quality: u8) -> Result<u64, String> {
    let bytes = encode(image, kind, jpeg_quality)?;
    if let Err(error) = std::fs::write(path, &bytes) {
        let _ = std::fs::remove_file(path);
        return Err(tr!("이미지 저장 실패: {error}", "Saving the image failed: {error}"));
    }
    Ok(bytes.len() as u64)
}

/// A small JPEG data URL for previews in the UI.
pub fn thumbnail_data_url(image: &RgbaImage, max_edge: u32) -> Result<String, String> {
    let scale = (max_edge as f32 / image.width().max(image.height()) as f32).min(1.0);
    let width = ((image.width() as f32 * scale).round() as u32).max(1);
    let height = ((image.height() as f32 * scale).round() as u32).max(1);
    let small = if scale < 1.0 { imageops::thumbnail(image, width, height) } else { image.clone() };
    let bytes = encode(&small, ImageKind::Jpg, 82)?;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// Raw frame for the webview: 4-byte LE width, 4-byte LE height, then RGBA pixels.
pub fn raw_frame(image: &RgbaImage) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(8 + image.as_raw().len());
    bytes.extend_from_slice(&image.width().to_le_bytes());
    bytes.extend_from_slice(&image.height().to_le_bytes());
    bytes.extend_from_slice(image.as_raw());
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info(x: i32, y: i32, width: u32, height: u32) -> MonitorInfo {
        MonitorInfo { id: 0, name: String::new(), x, y, width, height, scale_factor: 1.0, primary: false }
    }

    #[test]
    fn rejects_empty_and_out_of_bounds_rects() {
        assert!(validate_rect(Rect { x: 0, y: 0, width: 0, height: 5 }, 10, 10).is_err());
        assert!(validate_rect(Rect { x: 5, y: 0, width: 6, height: 5 }, 10, 10).is_err());
        assert!(validate_rect(Rect { x: u32::MAX, y: 0, width: 2, height: 2 }, 10, 10).is_err());
        assert!(validate_rect(Rect { x: 5, y: 5, width: 5, height: 5 }, 10, 10).is_ok());
    }

    #[test]
    fn crop_keeps_the_requested_pixels() {
        let mut image = RgbaImage::new(4, 4);
        image.put_pixel(2, 1, image::Rgba([9, 8, 7, 255]));
        let part = crop(&image, Rect { x: 2, y: 1, width: 2, height: 3 }).unwrap();
        assert_eq!(part.dimensions(), (2, 3));
        assert_eq!(part.get_pixel(0, 0).0, [9, 8, 7, 255]);
    }

    #[test]
    fn composite_handles_monitors_left_of_and_above_the_primary() {
        let left = RgbaImage::from_pixel(2, 2, image::Rgba([1, 0, 0, 255]));
        let main = RgbaImage::from_pixel(3, 2, image::Rgba([2, 0, 0, 255]));
        let canvas = composite(&[(info(-2, -1, 2, 2), left), (info(0, 0, 3, 2), main)]).unwrap();
        assert_eq!(canvas.dimensions(), (5, 3));
        assert_eq!(canvas.get_pixel(0, 0).0[0], 1);
        assert_eq!(canvas.get_pixel(4, 2).0[0], 2);
        assert_eq!(canvas.get_pixel(4, 0).0, [0, 0, 0, 255], "gaps are filled black");
    }

    #[test]
    fn encodes_every_supported_format() {
        let image = RgbaImage::from_fn(8, 6, |x, y| image::Rgba([x as u8 * 30, y as u8 * 40, 90, 255]));
        let cases = [
            (ImageKind::Jpg, image::ImageFormat::Jpeg, false),
            (ImageKind::Png, image::ImageFormat::Png, true),
            (ImageKind::Gif, image::ImageFormat::Gif, false),
            (ImageKind::Tiff, image::ImageFormat::Tiff, true),
            (ImageKind::Bmp, image::ImageFormat::Bmp, true),
            (ImageKind::Webp, image::ImageFormat::WebP, true),
        ];
        for (kind, format, lossless) in cases {
            let bytes = encode(&image, kind, 90).unwrap();
            assert_eq!(image::guess_format(&bytes).unwrap(), format, "{kind:?}");
            let decoded = image::load_from_memory(&bytes).unwrap().to_rgba8();
            assert_eq!(decoded.dimensions(), image.dimensions(), "{kind:?}");
            if lossless {
                assert_eq!(decoded, image, "{kind:?} keeps every pixel");
            }
        }
    }

    #[test]
    fn clip_rect_keeps_the_part_on_screen() {
        let desktop = (-1920, 0, 1920, 1080);
        assert_eq!(clip_rect((100, 100, 800, 600), desktop), Some((100, 100, 800, 600)));
        assert_eq!(clip_rect((1800, -50, 400, 300), desktop), Some((1800, 0, 120, 250)));
        assert_eq!(clip_rect((-2000, 500, 200, 100), desktop), Some((-1920, 500, 120, 100)));
        assert_eq!(clip_rect((-32000, -32000, 160, 28), desktop), None);
    }

    #[test]
    fn source_json_matches_the_frontend_contract() {
        let region: Source = serde_json::from_str(
            r#"{"kind":"region","monitorId":7,"x":1,"y":2,"width":3,"height":4}"#,
        )
        .unwrap();
        assert_eq!(region, Source::Region { monitor_id: 7, x: 1, y: 2, width: 3, height: 4 });
        let all: Source = serde_json::from_str(r#"{"kind":"allMonitors"}"#).unwrap();
        assert_eq!(all, Source::AllMonitors);
        let own: Source = serde_json::from_str(r#"{"kind":"app"}"#).unwrap();
        assert_eq!(own, Source::App);
        assert_eq!(ImageKind::parse("JPEG").unwrap(), ImageKind::Jpg);
        assert_eq!(ImageKind::parse("tif").unwrap(), ImageKind::Tiff);
        assert_eq!(ImageKind::parse("WebP").unwrap().extension(), "webp");
        assert!(ImageKind::parse("heic").is_err());
    }

    #[test]
    fn raw_frame_header_carries_dimensions() {
        let frame = raw_frame(&RgbaImage::new(3, 2));
        assert_eq!(&frame[..8], &[3, 0, 0, 0, 2, 0, 0, 0]);
        assert_eq!(frame.len(), 8 + 3 * 2 * 4);
    }
}
