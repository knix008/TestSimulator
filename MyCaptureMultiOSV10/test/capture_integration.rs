//! Real captures from the host desktop. Needs an interactive session and, on
//! macOS / Wayland, screen-capture permission. Run with `npm run test:capture`.

use image::{ImageFormat, RgbaImage};
use mycapture_lib::capture::{self, ImageKind, MonitorInfo, Source};
use std::fs;
use tempfile::tempdir;

fn primary() -> MonitorInfo {
    capture::list_monitors()
        .expect("enumerate monitors")
        .into_iter()
        .next()
        .expect("at least one monitor")
}

fn assert_not_blank(image: &RgbaImage) {
    let first = image.get_pixel(0, 0);
    assert!(
        image.pixels().any(|pixel| pixel != first),
        "capture is uniformly blank; check screen-capture permission and desktop session"
    );
}

#[test]
fn lists_the_primary_monitor_first() {
    let monitors = capture::list_monitors().unwrap();
    assert!(!monitors.is_empty());
    assert!(monitors.iter().filter(|monitor| monitor.primary).count() <= 1);
    if monitors.iter().any(|monitor| monitor.primary) {
        assert!(monitors[0].primary);
    }
}

#[test]
fn captures_a_monitor_at_full_resolution() {
    let monitor = primary();
    let image = capture::grab(&Source::Monitor { id: monitor.id }).unwrap();
    assert_eq!(image.dimensions(), (monitor.width, monitor.height));
    assert_not_blank(&image);
}

#[test]
fn captures_all_monitors_as_one_image() {
    let monitors = capture::list_monitors().unwrap();
    let image = capture::grab(&Source::AllMonitors).unwrap();
    let left = monitors.iter().map(|m| m.x).min().unwrap();
    let right = monitors.iter().map(|m| m.x + m.width as i32).max().unwrap();
    let top = monitors.iter().map(|m| m.y).min().unwrap();
    let bottom = monitors.iter().map(|m| m.y + m.height as i32).max().unwrap();
    assert_eq!(image.dimensions(), ((right - left) as u32, (bottom - top) as u32));
}

#[test]
fn captures_a_region_with_exact_dimensions_and_rejects_bad_ones() {
    let monitor = primary();
    let width = monitor.width.min(301);
    let height = monitor.height.min(167);
    let image = capture::grab(&Source::Region { monitor_id: monitor.id, x: 10, y: 10, width, height }).unwrap();
    assert_eq!(image.dimensions(), (width, height));

    let outside = Source::Region { monitor_id: monitor.id, x: monitor.width, y: 0, width: 1, height: 1 };
    assert!(capture::grab(&outside).is_err());
    let empty = Source::Region { monitor_id: monitor.id, x: 0, y: 0, width: 0, height: 10 };
    assert!(capture::grab(&empty).is_err());
}

#[test]
fn captures_a_visible_window() {
    let windows = capture::list_windows(None).unwrap();
    let Some(window) = windows.iter().find(|window| window.width >= 64 && window.height >= 64) else {
        eprintln!("no visible window on this desktop; skipping");
        return;
    };
    let image = capture::grab(&Source::Window { id: window.id }).unwrap();
    assert!(image.width() > 0 && image.height() > 0);
}

#[test]
fn unknown_sources_fail_cleanly() {
    assert!(capture::grab(&Source::Monitor { id: u32::MAX }).is_err());
    assert!(capture::grab(&Source::Window { id: u32::MAX - 1 }).is_err());
}

#[test]
fn saves_real_captures_as_jpg_and_png() {
    let monitor = primary();
    let image = capture::grab(&Source::Monitor { id: monitor.id }).unwrap();
    let directory = tempdir().unwrap();
    for (kind, format) in [(ImageKind::Jpg, ImageFormat::Jpeg), (ImageKind::Png, ImageFormat::Png)] {
        let path = directory.path().join(format!("shot.{}", kind.extension()));
        let written = capture::save(&image, &path, kind, 90).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert_eq!(written, bytes.len() as u64);
        assert_eq!(image::guess_format(&bytes).unwrap(), format);
        let decoded = image::load_from_memory(&bytes).unwrap().to_rgba8();
        assert_eq!(decoded.dimensions(), image.dimensions());
        assert_not_blank(&decoded);
    }
    let png = image::open(directory.path().join("shot.png")).unwrap().to_rgba8();
    assert_eq!(png, image, "PNG is lossless");
}
