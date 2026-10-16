// 자리와 크기. 좌표는 모두 DIP 이고, 자바스크립트 숫자처럼 f64 로 둔다.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self { x, y, width, height }
    }
    pub fn right(&self) -> f64 {
        self.x + self.width
    }
    pub fn bottom(&self) -> f64 {
        self.y + self.height
    }
}

// 화면 하나. 둘 다 DIP 다.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Display {
    pub bounds: Rect,
    pub work_area: Rect,
}

// ── 박스 안 아이콘의 자리 (src/shared/arrange.js) ───────────────────────────
//
// 창은 src/shared/arrange.js 를 그대로 읽는다. 메인이 같은 셈을 하려고 옮겨 둔 것이다.

pub const CELL_W: f64 = 86.0;
pub const CELL_H: f64 = 88.0;
pub const PAD: f64 = 12.0;
pub const TITLE_H: f64 = 36.0;
// 그림자를 켜면 창이 박스보다 사방으로 이만큼 크다.
pub const SHADOW: f64 = 18.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Grid {
    pub cols: i64,
    pub rows: i64,
    pub cell_w: f64,
    pub cell_h: f64,
    pub origin_x: f64,
    pub origin_y: f64,
}

pub fn grid_of(width: f64, height: f64, collapsed: bool) -> Grid {
    let inner_w = CELL_W.max(width - PAD * 2.0);
    let cols = ((inner_w / CELL_W).floor() as i64).max(1);
    let body_h = if collapsed { 0.0 } else { (height - TITLE_H - PAD).max(0.0) };
    let rows_raw = (body_h / CELL_H).floor() as i64;
    let rows = (if rows_raw == 0 { 1 } else { rows_raw }).max(1);
    Grid { cols, rows, cell_w: CELL_W, cell_h: CELL_H, origin_x: PAD, origin_y: TITLE_H }
}

// 접힌 박스는 제목 줄만 남는다.
pub fn panel_height(collapsed: bool, h: f64) -> f64 {
    if collapsed {
        TITLE_H + 4.0
    } else {
        h
    }
}

fn margin(shadow: bool) -> f64 {
    if shadow {
        SHADOW
    } else {
        0.0
    }
}

pub fn window_rect(x: f64, y: f64, w: f64, collapsed: bool, h: f64, shadow: bool) -> Rect {
    use crate::js::round;
    let pad = margin(shadow);
    Rect {
        x: round(x) - pad,
        y: round(y) - pad,
        width: round(w) + pad * 2.0,
        height: round(panel_height(collapsed, h)) + pad * 2.0,
    }
}

pub fn panel_rect(bounds: Rect, shadow: bool) -> Rect {
    let pad = margin(shadow);
    Rect {
        x: bounds.x + pad,
        y: bounds.y + pad,
        width: (bounds.width - pad * 2.0).max(0.0),
        height: (bounds.height - pad * 2.0).max(0.0),
    }
}

pub fn slot_point(slot: usize, grid: &Grid) -> Point {
    let c = grid.cols.max(1) as usize;
    let col = slot % c;
    let row = slot / c;
    Point { x: grid.origin_x + col as f64 * grid.cell_w, y: grid.origin_y + row as f64 * grid.cell_h }
}

// 끌어 온 아이콘이 들어갈 칸. count 는 그 아이콘을 뺀 개수라서 맨 뒤는 count 다.
pub fn insert_index(local_x: f64, local_y: f64, grid: &Grid, count: usize) -> usize {
    use crate::js::round;
    if count == 0 {
        return 0;
    }
    let col = round((local_x - grid.origin_x) / grid.cell_w).clamp(0.0, (grid.cols - 1) as f64);
    let row = round((local_y - grid.origin_y) / grid.cell_h).max(0.0);
    let at = row * grid.cols as f64 + col;
    (at as usize).min(count)
}

// ── 받는 자리 (src/shared/deliver.js) ──────────────────────────────────────

const SIDE_PAD: f64 = 4.0;
const TOP_PAD: f64 = 8.0;
const ART: f64 = 44.0;
const SLACK: f64 = 6.0;

fn art_x() -> f64 {
    SIDE_PAD + crate::js::round((CELL_W - SIDE_PAD * 2.0 - ART) / 2.0)
}

// 칸 안에서 그림 위인지. 글자와 옆 여백은 아이템 사이라서 밀어 배열한다.
pub fn on_picture(dx: f64, dy: f64) -> bool {
    let left = art_x() - SLACK;
    let right = art_x() + ART + SLACK;
    let top = TOP_PAD - SLACK;
    let bottom = TOP_PAD + ART + 2.0;
    dx >= left && dx <= right && dy >= top && dy <= bottom
}

pub fn is_shortcut(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".lnk") || lower.ends_with(".url") || lower.ends_with(".desktop")
}

pub fn is_recycle(path: &str) -> bool {
    path.to_lowercase() == "shell:recyclebinfolder"
}

pub fn is_shell_item(path: &str) -> bool {
    path.starts_with("shell:")
}

// 이 항목이 무엇을 받는가. 받지 않으면 빈 값이다.
pub fn receive_kind(path: &str, directory: bool, shortcut_dir: &str) -> &'static str {
    if path.is_empty() {
        return "";
    }
    if is_recycle(path) {
        return "trash";
    }
    if directory {
        return "folder";
    }
    if is_shortcut(path) && !shortcut_dir.is_empty() {
        return "folder";
    }
    ""
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grid_matches_the_window_script() {
        let grid = grid_of(400.0, 300.0, false);
        assert_eq!(grid.cols, 4);
        assert_eq!(grid.rows, 2);
        assert_eq!(grid_of(100.0, 50.0, true).rows, 1);
        assert_eq!(slot_point(5, &grid), Point::new(12.0 + 86.0, 36.0 + 88.0));
        assert_eq!(insert_index(500.0, 40.0, &grid, 2), 2);
        assert_eq!(insert_index(12.0, 36.0, &grid, 3), 0);
        assert_eq!(insert_index(0.0, 0.0, &grid, 0), 0);
    }

    #[test]
    fn window_and_panel_rects_round_trip() {
        let outer = window_rect(100.4, 99.6, 300.0, false, 200.0, true);
        assert_eq!(outer, Rect::new(82.0, 82.0, 336.0, 236.0));
        assert_eq!(panel_rect(outer, true), Rect::new(100.0, 100.0, 300.0, 200.0));
        assert_eq!(window_rect(0.0, 0.0, 300.0, true, 200.0, false).height, 40.0);
    }

    #[test]
    fn picture_area_matches_the_icon() {
        assert_eq!(art_x(), 21.0);
        assert!(on_picture(21.0, 8.0));
        assert!(on_picture(15.0, 2.0));
        assert!(!on_picture(14.0, 8.0));
        assert!(!on_picture(40.0, 55.0));
        // 박스 창의 src/shared/deliver.js PICTURE 와 같은 테두리여야 한다 (test/shared.test.js 도 본다).
        assert!(on_picture(71.0, 54.0));
        assert!(!on_picture(71.5, 30.0));
        assert!(!on_picture(30.0, 54.5));
        assert!(!on_picture(30.0, 1.5));
        assert_eq!(receive_kind("shell:RecycleBinFolder", false, ""), "trash");
        assert_eq!(receive_kind("C:/a", true, ""), "folder");
        assert_eq!(receive_kind("C:/a.lnk", false, "C:/d"), "folder");
        assert_eq!(receive_kind("C:/a.txt", false, ""), "");
    }
}
