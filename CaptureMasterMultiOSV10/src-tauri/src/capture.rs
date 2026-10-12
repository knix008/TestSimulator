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
    let bytes = png_bytes(width, height, raw)?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
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
    width: u32,
    height: u32,
}

fn shot_of(img: image::RgbaImage) -> Result<Shot, String> {
    let width = img.width();
    let height = img.height();
    let data_url = data_url(width, height, img.as_raw())?;
    Ok(Shot { data_url, width, height })
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

pub fn grab_screen(source_id: Option<&str>) -> Result<Value, String> {
    let mon = monitor_by_id(source_id)?;
    let id = num_result(mon.id());
    let name = text_result(mon.name());
    let img = mon.capture_image().map_err(|e| e.to_string())?;
    let shot = shot_of(img)?;
    if shot.width == 0 || shot.height == 0 {
        return Err("The screen capture came back empty.".into());
    }
    Ok(json!({
        "dataUrl": shot.data_url,
        "width": shot.width,
        "height": shot.height,
        "name": name,
        "sourceId": format!("screen:{id}"),
        "displayId": id.to_string(),
        "scaleFactor": mon.scale_factor().unwrap_or(1.0) as f64,
        "bounds": { "x": num_result(mon.x()), "y": num_result(mon.y()), "width": num_result(mon.width()), "height": num_result(mon.height()) },
        "kind": "screen",
    }))
}

pub fn grab_window(source_id: &str) -> Result<Value, String> {
    let want = source_id.trim_start_matches("window:");
    let windows = xcap::Window::all().map_err(|e| e.to_string())?;
    let win = windows
        .into_iter()
        .find(|w| num_result(w.id()).to_string() == want)
        .ok_or_else(|| format!("The selected window was not found: {source_id}"))?;
    let name = text_result(win.title());
    let img = win.capture_image().map_err(|e| e.to_string())?;
    let shot = shot_of(img)?;
    Ok(json!({
        "dataUrl": shot.data_url,
        "width": shot.width,
        "height": shot.height,
        "name": name,
        "sourceId": format!("window:{want}"),
        "kind": "window",
    }))
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
