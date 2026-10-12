// Screen and window stills. xcap photographs the desktop, including this
// process, so the window picker can offer CaptureMaster itself.

use base64::Engine;
use image::ImageEncoder;
use serde_json::{json, Value};
use std::io::Cursor;

fn png_bytes(width: u32, height: u32, raw: &[u8]) -> Result<Vec<u8>, String> {
    let mut buf = Cursor::new(Vec::with_capacity(raw.len() / 4));
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        &mut buf,
        image::codecs::png::CompressionType::Fast,
        image::codecs::png::FilterType::Adaptive,
    );
    encoder
        .write_image(raw, width, height, image::ExtendedColorType::Rgba8)
        .map_err(|e| e.to_string())?;
    Ok(buf.into_inner())
}

fn data_url(width: u32, height: u32, raw: &[u8]) -> Result<String, String> {
    Ok(data_url_of(&png_bytes(width, height, raw)?))
}

fn data_url_of(png: &[u8]) -> String {
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    )
}

/// Writes the PNG next to the capture so the page does not have to send the
/// full-screen bytes back over IPC. A missing parent folder is created.
fn write_capture(path: Option<&str>, png: &[u8]) -> (Value, u64, Value) {
    let Some(path) = path.filter(|p| !p.is_empty()) else {
        return (Value::Null, 0, Value::Null);
    };
    let write = (|| -> Result<u64, String> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        std::fs::write(path, png).map_err(|e| e.to_string())?;
        Ok(png.len() as u64)
    })();
    match write {
        Ok(n) => (json!(path), n, Value::Null),
        Err(e) => (Value::Null, 0, json!(e)),
    }
}

fn thumb(img: image::RgbaImage, max_w: u32) -> Option<String> {
    let (width, height) = img.dimensions();
    if max_w == 0 || width == 0 || height == 0 {
        return None;
    }
    let tw = max_w.min(width).max(1);
    let th = ((height as f32) * (tw as f32) / (width as f32)).round().max(1.0) as u32;
    // Called through DynamicImage so the code instantiated inside `image` (optimized in dev) runs.
    let small = image::DynamicImage::ImageRgba8(img).thumbnail_exact(tw, th).into_rgba8();
    data_url(small.width(), small.height(), small.as_raw()).ok()
}

/// Scales and encodes the captured frames on all cores; xcap handles are not
/// `Send`, so only the grabbing itself stays on the calling thread.
fn thumbs_parallel(mut frames: Vec<Option<image::RgbaImage>>, max_w: u32) -> Vec<Option<String>> {
    let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 8);
    let chunk = frames.len().div_ceil(workers).max(1);
    let mut out: Vec<Option<String>> = vec![None; frames.len()];
    std::thread::scope(|scope| {
        for (frames, slots) in frames.chunks_mut(chunk).zip(out.chunks_mut(chunk)) {
            scope.spawn(move || {
                for (frame, slot) in frames.iter_mut().zip(slots.iter_mut()) {
                    *slot = frame.take().and_then(|img| thumb(img, max_w));
                }
            });
        }
    });
    out
}

fn text_result(value: Result<String, xcap::XCapError>) -> String {
    value.unwrap_or_default()
}

fn num_result<T: Default>(value: Result<T, xcap::XCapError>) -> T {
    value.unwrap_or_default()
}

struct Shot {
    data_url: String,
    png: Vec<u8>,
    width: u32,
    height: u32,
}

fn shot_of(img: image::RgbaImage) -> Result<Shot, String> {
    let width = img.width();
    let height = img.height();
    let png = png_bytes(width, height, img.as_raw())?;
    let data_url = data_url_of(&png);
    Ok(Shot { data_url, png, width, height })
}

pub fn list_sources(types: &[String], thumb_width: u32, include_self: bool) -> Result<Vec<Value>, String> {
    let want_screen = types.iter().any(|t| t == "screen");
    let want_window = types.iter().any(|t| t == "window");
    let mut out = Vec::new();
    let mut frames = Vec::new();
    let our_pid = std::process::id();

    if want_screen || types.is_empty() {
        let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
        for (i, mon) in monitors.iter().enumerate() {
            let id = num_result(mon.id());
            let name = text_result(mon.name());
            let x = num_result(mon.x());
            let y = num_result(mon.y());
            let width = num_result(mon.width());
            let height = num_result(mon.height());
            let scale = mon.scale_factor().unwrap_or(1.0) as f64;
            let primary = num_result(mon.is_primary());
            frames.push(if thumb_width > 0 { mon.capture_image().ok() } else { None });
            let label = if monitors.len() > 1 {
                format!("{} {}", if name.is_empty() { "Screen".into() } else { name }, i + 1)
            } else if name.is_empty() {
                "Screen".into()
            } else {
                name
            };
            out.push(json!({
                "id": format!("screen:{id}"),
                "name": label,
                "kind": "screen",
                "displayId": id.to_string(),
                "isPrimary": primary,
                "self": false,
                "bounds": { "x": x, "y": y, "width": width, "height": height },
                "scaleFactor": scale,
                "thumbnail": Value::Null,
                "appIcon": Value::Null,
            }));
        }
    }

    if want_window || types.is_empty() {
        let windows = xcap::Window::all().map_err(|e| e.to_string())?;
        for win in windows {
            let title = text_result(win.title());
            let app = text_result(win.app_name());
            let width = num_result(win.width());
            let height = num_result(win.height());
            if title.trim().is_empty() || width < 80 || height < 60 {
                continue;
            }
            if num_result(win.is_minimized()) && width < 2 {
                continue;
            }
            let pid = num_result(win.pid());
            let is_self = pid == our_pid || title.contains("CaptureMaster") || app.contains("CaptureMaster");
            if is_self && !include_self {
                continue;
            }
            let id = num_result(win.id());
            frames.push(if thumb_width > 0 { win.capture_image().ok() } else { None });
            out.push(json!({
                "id": format!("window:{id}"),
                "name": if title.is_empty() { app.clone() } else { title },
                "kind": "window",
                "displayId": Value::Null,
                "isPrimary": false,
                "self": is_self,
                "appName": app,
                "bounds": Value::Null,
                "thumbnail": Value::Null,
                "appIcon": Value::Null,
            }));
        }
    }
    for (entry, thumbnail) in out.iter_mut().zip(thumbs_parallel(frames, thumb_width)) {
        if let Some(t) = thumbnail {
            entry["thumbnail"] = Value::String(t);
        }
    }
    Ok(out)
}

fn monitor_by_id(source_id: Option<&str>) -> Result<xcap::Monitor, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("No screen is available for capture.".into());
    }
    if let Some(source_id) = source_id.filter(|s| !s.is_empty()) {
        let want = source_id.trim_start_matches("screen:");
        if let Some(mon) = monitors.iter().find(|m| num_result(m.id()).to_string() == want) {
            return Ok(mon.clone());
        }
        return Err(format!("The selected screen no longer exists: {source_id}"));
    }
    Ok(monitors.into_iter().find(|m| num_result(m.is_primary())).unwrap_or_else(|| {
        xcap::Monitor::all().ok().and_then(|m| m.into_iter().next()).expect("monitor")
    }))
}

pub struct Grabbed {
    pub value: Value,
    pub png: Vec<u8>,
}

/// Writes `png`, or the rectangle `(x, y, w, h)` cropped out of it.
pub fn save_png(png: &[u8], path: &str, crop: Option<(u32, u32, u32, u32)>) -> Result<u64, String> {
    let bytes = if let Some((x, y, w, h)) = crop {
        let img = image::load_from_memory(png).map_err(|e| e.to_string())?;
        let (iw, ih) = (img.width(), img.height());
        if iw == 0 || ih == 0 {
            return Err("The capture came back empty.".into());
        }
        let x = x.min(iw - 1);
        let y = y.min(ih - 1);
        let w = w.max(1).min(iw - x);
        let h = h.max(1).min(ih - y);
        let cropped = img.crop_imm(x, y, w, h).to_rgba8();
        png_bytes(cropped.width(), cropped.height(), cropped.as_raw())?
    } else {
        png.to_vec()
    };
    let (_saved, n, err) = write_capture(Some(path), &bytes);
    match err.as_str() {
        None => Ok(n),
        Some(message) => Err(message.to_string()),
    }
}

pub fn grab_screen(source_id: Option<&str>, save_path: Option<&str>) -> Result<Grabbed, String> {
    let mon = monitor_by_id(source_id)?;
    let id = num_result(mon.id());
    let name = text_result(mon.name());
    let img = mon.capture_image().map_err(|e| e.to_string())?;
    let shot = shot_of(img)?;
    if shot.width == 0 || shot.height == 0 {
        return Err("The screen capture came back empty.".into());
    }
    let (saved_path, saved_bytes, save_error) = write_capture(save_path, &shot.png);
    let width = shot.width;
    let height = shot.height;
    let png = shot.png;
    Ok(Grabbed {
        png,
        value: json!({
            "dataUrl": shot.data_url,
            "width": width,
            "height": height,
            "name": name,
            "sourceId": format!("screen:{id}"),
            "displayId": id.to_string(),
            "scaleFactor": mon.scale_factor().unwrap_or(1.0) as f64,
            "bounds": { "x": num_result(mon.x()), "y": num_result(mon.y()), "width": num_result(mon.width()), "height": num_result(mon.height()) },
            "kind": "screen",
            "savedPath": saved_path,
            "savedBytes": saved_bytes,
            "saveError": save_error,
        }),
    })
}

pub fn grab_window(source_id: &str, save_path: Option<&str>) -> Result<Grabbed, String> {
    let want = source_id.trim_start_matches("window:");
    let windows = xcap::Window::all().map_err(|e| e.to_string())?;
    let win = windows
        .into_iter()
        .find(|w| num_result(w.id()).to_string() == want)
        .ok_or_else(|| format!("The selected window was not found: {source_id}"))?;
    let name = text_result(win.title());
    let img = win.capture_image().map_err(|e| e.to_string())?;
    let shot = shot_of(img)?;
    let (saved_path, saved_bytes, save_error) = write_capture(save_path, &shot.png);
    let width = shot.width;
    let height = shot.height;
    let png = shot.png;
    Ok(Grabbed {
        png,
        value: json!({
            "dataUrl": shot.data_url,
            "width": width,
            "height": height,
            "name": name,
            "sourceId": format!("window:{want}"),
            "kind": "window",
            "savedPath": saved_path,
            "savedBytes": saved_bytes,
            "saveError": save_error,
        }),
    })
}

pub fn list_displays() -> Result<Vec<Value>, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    Ok(monitors.iter().map(|m| {
        let id = num_result(m.id());
        let bounds = json!({ "x": num_result(m.x()), "y": num_result(m.y()), "width": num_result(m.width()), "height": num_result(m.height()) });
        json!({
            "id": id.to_string(),
            "bounds": bounds,
            "workArea": bounds,
            "scaleFactor": m.scale_factor().unwrap_or(1.0) as f64,
            "isPrimary": num_result(m.is_primary()),
        })
    }).collect())
}

pub fn cursor_display() -> Result<String, String> {
    let (x, y) = cursor_point();
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    if let (Some(x), Some(y)) = (x, y) {
        for m in &monitors {
            let mx = num_result(m.x());
            let my = num_result(m.y());
            let mw = num_result(m.width()) as i32;
            let mh = num_result(m.height()) as i32;
            if x >= mx && y >= my && x < mx + mw && y < my + mh {
                return Ok(num_result(m.id()).to_string());
            }
        }
    }
    let primary = monitors.iter().find(|m| num_result(m.is_primary())).or(monitors.first());
    Ok(primary.map(|m| num_result(m.id()).to_string()).unwrap_or_default())
}

#[cfg(windows)]
fn cursor_point() -> (Option<i32>, Option<i32>) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut pt = POINT::default();
    if unsafe { GetCursorPos(&mut pt) }.is_ok() {
        (Some(pt.x), Some(pt.y))
    } else {
        (None, None)
    }
}

#[cfg(not(windows))]
fn cursor_point() -> (Option<i32>, Option<i32>) {
    (None, None)
}

pub fn monitor_bounds(display_id: Option<&str>) -> Option<(i32, i32, u32, u32)> {
    let monitors = xcap::Monitor::all().ok()?;
    let mon = if let Some(id) = display_id {
        monitors.iter().find(|m| num_result(m.id()).to_string() == id).cloned()
    } else {
        None
    };
    let mon = mon.or_else(|| monitors.iter().find(|m| num_result(m.is_primary())).cloned())?;
    Some((num_result(mon.x()), num_result(mon.y()), num_result(mon.width()), num_result(mon.height())))
}

#[cfg(test)]
mod tests {
    use super::write_capture;

    #[test]
    fn writes_capture_file_and_creates_the_folder() {
        let dir = std::env::temp_dir().join(format!("cm-cap-test-{}", std::process::id()));
        let path = dir.join("shot.png");
        let text = path.to_string_lossy().to_string();
        let (saved, n, err) = write_capture(Some(&text), b"\x89PNG");
        assert!(err.is_null());
        assert_eq!(n, 4);
        assert_eq!(saved.as_str(), Some(text.as_str()));
        assert_eq!(std::fs::read(&path).unwrap(), b"\x89PNG");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn crops_a_cached_capture_before_saving() {
        let raw = vec![
            255, 0, 0, 255, 0, 255, 0, 255,
            0, 0, 255, 255, 255, 255, 255, 255,
        ];
        let png = super::png_bytes(2, 2, &raw).unwrap();
        let dir = std::env::temp_dir().join(format!("cm-crop-{}", std::process::id()));
        let path = dir.join("crop.png");
        let n = super::save_png(&png, &path.to_string_lossy(), Some((1, 0, 1, 2))).unwrap();
        assert!(n > 8);
        let img = image::load_from_memory(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!((img.width(), img.height()), (1, 2));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
