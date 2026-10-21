//! Window placement: the size and position the window had when it was last closed, checked
//! against the monitors present now. Physical pixels throughout.

use serde::{Deserialize, Serialize};

/// Default inner size (logical px): no scrolling for the starting content.
pub const DEFAULT_SIZE: (f64, f64) = (1320.0, 800.0);
/// Smallest size (logical px). Below the full-label width the toolbars drop labels and keep
/// icons; language, theme and the window buttons always stay visible (test/web.test.js).
pub const MIN_SIZE: (f64, f64) = (960.0, 640.0);
/// How much of the window must lie on a monitor for a saved position to be reused.
const MIN_VISIBLE: i32 = 120;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    fn overlap(&self, p: &Placement) -> (i32, i32) {
        let w = (self.x + self.width as i32).min(p.x + p.width as i32) - self.x.max(p.x);
        let h = (self.y + self.height as i32).min(p.y + p.height as i32) - self.y.max(p.y);
        (w.max(0), h.max(0))
    }
}

/// The saved placement if enough of it is still on some monitor's work area, with its size
/// kept within the minimum and that monitor.
pub fn restore(saved: Placement, work_areas: &[Rect], min: (u32, u32)) -> Option<Placement> {
    let area = work_areas.iter().max_by_key(|a| {
        let (w, h) = a.overlap(&saved);
        w as i64 * h as i64
    })?;
    let (w, h) = area.overlap(&saved);
    // The title area (top strip) must be reachable so the window can be dragged.
    let top_visible = saved.y >= area.y - 8 && saved.y < area.y + area.height as i32 - 40;
    if w < MIN_VISIBLE || h < MIN_VISIBLE.min(saved.height as i32) || !top_visible {
        return None;
    }
    Some(Placement {
        width: saved.width.max(min.0).min(area.width.max(min.0)),
        height: saved.height.max(min.1).min(area.height.max(min.1)),
        ..saved
    })
}

/// The default size fitted to the work area and centred on it.
pub fn centered(size: (u32, u32), area: Rect) -> Placement {
    let width = size.0.min(area.width);
    let height = size.1.min(area.height);
    Placement {
        x: area.x + (area.width - width) as i32 / 2,
        y: area.y + (area.height - height) as i32 / 2,
        width,
        height,
        maximized: false,
    }
}

pub fn load(path: &std::path::Path) -> Option<Placement> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

pub fn save(path: &std::path::Path, placement: &Placement) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(placement).unwrap_or_default())?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = Rect { x: 0, y: 0, width: 1920, height: 1040 };
    const SECOND: Rect = Rect { x: 1920, y: 0, width: 2560, height: 1400 };
    const MIN: (u32, u32) = (1300, 640);

    fn at(x: i32, y: i32, width: u32, height: u32) -> Placement {
        Placement { x, y, width, height, maximized: false }
    }

    #[test]
    fn a_placement_on_screen_comes_back_unchanged() {
        let p = Placement { maximized: true, ..at(100, 80, 1400, 900) };
        assert_eq!(restore(p, &[SCREEN], MIN), Some(p));
        let on_second = at(2100, 50, 1600, 1000);
        assert_eq!(restore(on_second, &[SCREEN, SECOND], MIN), Some(on_second));
    }

    #[test]
    fn a_placement_on_a_monitor_that_is_gone_is_dropped() {
        assert_eq!(restore(at(2100, 50, 1600, 1000), &[SCREEN], MIN), None);
        assert_eq!(restore(at(-3000, 0, 1400, 900), &[SCREEN], MIN), None);
        assert_eq!(restore(at(100, -500, 1400, 900), &[SCREEN], MIN), None, "title bar off the top");
        assert_eq!(restore(at(100, 1020, 1400, 900), &[SCREEN], MIN), None, "only a sliver at the bottom");
    }

    #[test]
    fn sizes_stay_between_the_minimum_and_the_monitor() {
        assert_eq!(restore(at(10, 10, 800, 300), &[SCREEN], MIN).map(|p| (p.width, p.height)), Some((1300, 640)));
        assert_eq!(restore(at(0, 0, 4000, 3000), &[SCREEN], MIN).map(|p| (p.width, p.height)), Some((1920, 1040)));
    }

    #[test]
    fn the_default_is_centred_and_fits_small_screens() {
        assert_eq!(centered((1320, 800), SCREEN), at(300, 120, 1320, 800));
        let small = Rect { x: 0, y: 0, width: 1280, height: 680 };
        assert_eq!(centered((1320, 800), small), at(0, 0, 1280, 680));
        assert_eq!(centered((1320, 800), SECOND).x, 1920 + 620);
    }

    #[test]
    fn files_round_trip() {
        let dir = std::env::temp_dir().join(format!("qrgen-placement-{}", std::process::id()));
        let file = dir.join("window.json");
        let p = Placement { maximized: true, ..at(-5, 7, 1400, 900) };
        save(&file, &p).unwrap();
        assert_eq!(load(&file), Some(p));
        std::fs::write(&file, "not json").unwrap();
        assert_eq!(load(&file), None);
        let _ = std::fs::remove_dir_all(dir);
    }
}
