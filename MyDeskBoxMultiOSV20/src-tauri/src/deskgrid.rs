// 바탕화면 아이콘 자리 계산 (src/shared/deskgrid.js 를 옮긴 것). 운영체제를 부르지 않는다.
//
// 박스가 놓인 자리에는 바탕화면 아이콘이 있으면 안 된다.
// 겹친 아이콘을 박스 밖의 빈 칸으로 옮겨 주는 것이 여기서 하는 일이다.

use crate::geom::{Point, Rect};
use crate::js::round;
use std::collections::HashSet;

pub const FALLBACK_DX: f64 = 76.0;
pub const FALLBACK_DY: f64 = 98.0;
pub const INSET: f64 = 6.0;
pub const MAGNET: f64 = 0.2;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Lattice {
    pub x0: f64,
    pub y0: f64,
    pub dx: f64,
    pub dy: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Icon {
    pub index: i64,
    pub name: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Move {
    pub index: i64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Cell {
    pub col: i64,
    pub row: i64,
}

pub struct Metrics {
    pub x0: f64,
    pub y0: f64,
    pub dx: f64,
    pub dy: f64,
    pub phase_x: f64,
    pub phase_y: f64,
}

fn sorted_unique(values: impl Iterator<Item = f64>) -> Vec<f64> {
    let mut list: Vec<f64> = values.collect();
    list.sort_by(|a, b| a.partial_cmp(b).unwrap());
    list.dedup();
    list
}

// 지금 놓인 아이콘들을 보고 칸의 크기와 시작 자리를 알아낸다.
pub fn metrics(points: &[Point]) -> Metrics {
    let xs = sorted_unique(points.iter().map(|p| p.x));
    let ys = sorted_unique(points.iter().map(|p| p.y));
    let dx = smallest_gap(&xs, FALLBACK_DX);
    let dy = smallest_gap(&ys, FALLBACK_DY);
    Metrics {
        x0: xs.first().copied().unwrap_or(0.0),
        y0: ys.first().copied().unwrap_or(0.0),
        dx,
        dy,
        phase_x: xs.first().map(|x| wrap(*x, dx)).unwrap_or(0.0),
        phase_y: ys.first().map(|y| wrap(*y, dy)).unwrap_or(0.0),
    }
}

pub fn wrap(value: f64, span: f64) -> f64 {
    if span == 0.0 {
        return 0.0;
    }
    ((value % span) + span) % span
}

// 흔들리지 않는 격자. 맨 앞 자리 대신 위상을 원점으로 삼는다.
pub fn steady(m: &Metrics) -> Lattice {
    Lattice { x0: m.phase_x, y0: m.phase_y, dx: m.dx, dy: m.dy }
}

pub fn smallest_gap(values: &[f64], fallback: f64) -> f64 {
    let mut best = f64::INFINITY;
    for pair in values.windows(2) {
        let gap = pair[1] - pair[0];
        if gap > 8.0 && gap < best {
            best = gap;
        }
    }
    if best.is_finite() {
        best
    } else {
        fallback
    }
}

pub fn cell_of(point: Point, grid: &Lattice) -> Cell {
    Cell {
        col: round((point.x - grid.x0) / grid.dx).max(0.0) as i64,
        row: round((point.y - grid.y0) / grid.dy).max(0.0) as i64,
    }
}

pub fn point_of(cell: Cell, grid: &Lattice) -> Point {
    Point { x: grid.x0 + cell.col as f64 * grid.dx, y: grid.y0 + cell.row as f64 * grid.dy }
}

pub fn overlaps(a: &Rect, b: &Rect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

pub fn icon_rect(cell: Cell, grid: &Lattice) -> Rect {
    let at = point_of(cell, grid);
    Rect {
        x: at.x + INSET,
        y: at.y + INSET,
        width: (grid.dx - INSET * 2.0).max(1.0),
        height: (grid.dy - INSET * 2.0).max(1.0),
    }
}

// 그 칸이 박스에 가려지는가. 조금이라도 겹치면 가려진 것으로 본다.
pub fn blocked(cell: Cell, grid: &Lattice, blocks: &[Rect]) -> bool {
    let rect = icon_rect(cell, grid);
    blocks.iter().any(|b| overlaps(&rect, b))
}

fn pt(icon: &Icon) -> Point {
    Point { x: icon.x, y: icon.y }
}

pub fn lattice_for(icons: &[Icon]) -> Lattice {
    let points: Vec<Point> = icons.iter().map(pt).collect();
    steady(&metrics(&points))
}

fn span(area: &Rect, grid: &Lattice) -> (i64, i64, i64, i64) {
    let col_from = ((area.x - grid.x0) / grid.dx).ceil().max(0.0) as i64;
    let row_from = ((area.y - grid.y0) / grid.dy).ceil().max(0.0) as i64;
    let col_to = ((area.x + area.width - grid.x0) / grid.dx).floor() as i64 - 1;
    let row_to = ((area.y + area.height - grid.y0) / grid.dy).floor() as i64 - 1;
    (col_from, row_from, col_to, row_to)
}

// 박스에 가려진 아이콘을 밖의 빈 칸으로 옮긴다.
pub fn relocate(icons: &[Icon], blocks: &[Rect], area: &Rect, grid: &Lattice) -> Vec<Move> {
    if icons.is_empty() || blocks.is_empty() {
        return vec![];
    }
    let (col_from, row_from, col_to, row_to) = span(area, grid);
    let mut taken = HashSet::new();
    let mut moving = Vec::new();
    for icon in icons {
        let cell = cell_of(pt(icon), grid);
        if blocked(cell, grid, blocks) {
            moving.push(icon);
        } else {
            taken.insert(cell);
        }
    }
    if moving.is_empty() {
        return vec![];
    }
    let mut free = Vec::new();
    for col in col_from..=col_to {
        for row in row_from..=row_to {
            let cell = Cell { col, row };
            if taken.contains(&cell) || blocked(cell, grid, blocks) {
                continue;
            }
            free.push(cell);
        }
    }
    let mut moves = Vec::new();
    for icon in moving {
        // 밀려나는 아이콘은 제자리에서 가장 가까운 빈 칸으로 간다.
        let Some((at, cell)) = nearest_free(icon, &free, grid) else { break };
        free.remove(at);
        taken.insert(cell);
        let point = point_of(cell, grid);
        if point.x == icon.x && point.y == icon.y {
            continue;
        }
        moves.push(Move { index: icon.index, x: point.x, y: point.y });
    }
    moves
}

// 탐색기의 '아이콘 자동 정렬' 을 박스와 함께 쓴다. 왼쪽 위부터 위에서 아래로 채운다.
pub fn pack(icons: &[Icon], blocks: &[Rect], area: &Rect, grid: &Lattice) -> Vec<Move> {
    if icons.is_empty() {
        return vec![];
    }
    let (col_from, row_from, col_to, row_to) = span(area, grid);
    let mut free = Vec::new();
    for col in col_from..=col_to {
        for row in row_from..=row_to {
            let cell = Cell { col, row };
            if !blocked(cell, grid, blocks) {
                free.push(cell);
            }
        }
    }
    let mut order: Vec<(&Icon, Cell)> = icons.iter().map(|i| (i, cell_of(pt(i), grid))).collect();
    order.sort_by(|a, b| {
        a.1.col.cmp(&b.1.col).then(a.1.row.cmp(&b.1.row)).then(a.0.index.cmp(&b.0.index))
    });
    let mut moves = Vec::new();
    for (i, (icon, _)) in order.iter().enumerate() {
        if i >= free.len() {
            continue;
        }
        let point = point_of(free[i], grid);
        if point.x == icon.x && point.y == icon.y {
            continue;
        }
        moves.push(Move { index: icon.index, x: point.x, y: point.y });
    }
    moves
}

fn nearest_free(icon: &Icon, free: &[Cell], grid: &Lattice) -> Option<(usize, Cell)> {
    if free.is_empty() {
        return None;
    }
    let from = cell_of(pt(icon), grid);
    let mut best = 0;
    let mut best_cost = i64::MAX;
    for (i, cell) in free.iter().enumerate() {
        let dc = cell.col - from.col;
        let dr = cell.row - from.row;
        let cost = dc * dc + dr * dr;
        if cost < best_cost {
            best_cost = cost;
            best = i;
        }
    }
    Some((best, free[best]))
}

fn magnet(size: f64, span: f64, least: f64) -> f64 {
    let want = least.max(size);
    let steps = round(want / span).max(1.0);
    let snapped = steps * span;
    if (want - snapped).abs() <= span * MAGNET && snapped >= least {
        return snapped;
    }
    want
}

fn magnet_to(value: f64, origin: f64, span: f64) -> f64 {
    let steps = round((value - origin) / span);
    let snapped = origin + steps * span;
    if (value - snapped).abs() <= span * MAGNET {
        return snapped;
    }
    value
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct What {
    pub place: bool,
    pub size: bool,
}

pub const BOTH: What = What { place: true, size: true };

// 박스를 격자에 '붙여' 준다. 칸 경계 가까이에서만 자석처럼 붙인다.
pub fn snap_rect(rect: Rect, grid: &Lattice, cell_w: f64, cell_h: f64, area: Option<Rect>, what: What) -> Rect {
    if grid.dx == 0.0 || grid.dy == 0.0 {
        return rect;
    }
    let least_w = if cell_w != 0.0 { cell_w } else { 1.0 };
    let least_h = if cell_h != 0.0 { cell_h } else { 1.0 };
    let out = Rect {
        x: if !what.place { rect.x } else { magnet_to(rect.x, grid.x0, grid.dx) },
        y: if !what.place { rect.y } else { magnet_to(rect.y, grid.y0, grid.dy) },
        width: if !what.size { rect.width } else { magnet(rect.width, grid.dx, least_w) },
        height: if !what.size { rect.height } else { magnet(rect.height, grid.dy, least_h) },
    };
    if !what.place {
        out
    } else {
        edge_magnet(out, grid, area)
    }
}

// 화면 가장자리에도 붙인다.
fn edge_magnet(rect: Rect, grid: &Lattice, area: Option<Rect>) -> Rect {
    let Some(area) = area else { return rect };
    if area.width == 0.0 || area.height == 0.0 {
        return rect;
    }
    let near_x = grid.dx * MAGNET;
    let near_y = grid.dy * MAGNET;
    let mut out = rect;
    let right = area.x + area.width;
    let bottom = area.y + area.height;
    if (out.x - area.x).abs() <= near_x {
        out.x = area.x;
    } else if (out.x + out.width - right).abs() <= near_x {
        out.x = right - out.width;
    }
    if (out.y - area.y).abs() <= near_y {
        out.y = area.y;
    } else if (out.y + out.height - bottom).abs() <= near_y {
        out.y = bottom - out.height;
    }
    out
}

// 끌고 가다 다른 박스에 닿으면 거기서 멈춘다.
pub fn slide_to(from: Rect, to: Rect, blocks: &[Rect]) -> Rect {
    let walls: Vec<&Rect> = blocks.iter().filter(|b| !overlaps(&from, b)).collect();
    if walls.is_empty() {
        return to;
    }
    let mut cur = Rect { width: to.width, height: to.height, ..from };
    // x 축 다음 y 축
    for axis in 0..2 {
        let want = if axis == 0 { to.x } else { to.y };
        let now = if axis == 0 { cur.x } else { cur.y };
        if want == now {
            continue;
        }
        let mut moved = cur;
        if axis == 0 {
            moved.x = want;
        } else {
            moved.y = want;
        }
        let Some(hit) = walls.iter().find(|b| overlaps(&moved, b)) else {
            cur = moved;
            continue;
        };
        if axis == 0 {
            cur.x = if want > cur.x { hit.x - cur.width } else { hit.x + hit.width };
        } else {
            cur.y = if want > cur.y { hit.y - cur.height } else { hit.y + hit.height };
        }
    }
    cur
}

// 박스끼리는 겹치지 않는다. 가장 적게 움직이는 쪽으로 비킨다.
pub fn push_out(rect: Rect, blocks: &[Rect], area: Option<Rect>) -> Rect {
    if blocks.is_empty() {
        return rect;
    }
    let mut out = rect;
    for _ in 0..8 {
        let Some(hit) = blocks.iter().find(|b| overlaps(&out, b)) else { break };
        let mut ways = vec![
            (hit.x - out.width, out.y, (hit.x - out.width - out.x).abs()),
            (hit.x + hit.width, out.y, (hit.x + hit.width - out.x).abs()),
            (out.x, hit.y - out.height, (hit.y - out.height - out.y).abs()),
            (out.x, hit.y + hit.height, (hit.y + hit.height - out.y).abs()),
        ];
        if let Some(area) = area {
            ways.retain(|(x, y, _)| {
                *x >= area.x && *y >= area.y && x + out.width <= area.x + area.width && y + out.height <= area.y + area.height
            });
        }
        if ways.is_empty() {
            break;
        }
        // 자바스크립트의 sort 처럼 같은 값은 차례를 지킨다.
        ways.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap());
        let clear = ways.iter().find(|(x, y, _)| {
            !blocks.iter().any(|b| overlaps(&Rect { x: *x, y: *y, ..out }, b))
        });
        let best = clear.unwrap_or(&ways[0]);
        out.x = round(best.0);
        out.y = round(best.1);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn icon(index: i64, x: f64, y: f64) -> Icon {
        Icon { index, name: format!("i{index}"), x, y }
    }

    fn lattice() -> Lattice {
        Lattice { x0: 0.0, y0: 0.0, dx: 100.0, dy: 100.0 }
    }

    #[test]
    fn measures_the_grid_from_icon_positions() {
        let m = metrics(&[Point::new(20.0, 2.0), Point::new(96.0, 2.0), Point::new(20.0, 100.0)]);
        assert_eq!(m.dx, 76.0);
        assert_eq!(m.dy, 98.0);
        assert_eq!(m.phase_x, 20.0);
        let none = metrics(&[]);
        assert_eq!((none.dx, none.dy), (FALLBACK_DX, FALLBACK_DY));
        assert_eq!(wrap(-10.0, 76.0), 66.0);
    }

    #[test]
    fn moves_covered_icons_to_the_nearest_free_cell() {
        let icons = vec![icon(0, 0.0, 0.0), icon(1, 100.0, 0.0)];
        let blocks = vec![Rect::new(0.0, 0.0, 95.0, 95.0)];
        let area = Rect::new(0.0, 0.0, 400.0, 300.0);
        let moves = relocate(&icons, &blocks, &area, &lattice());
        assert_eq!(moves, vec![Move { index: 0, x: 0.0, y: 100.0 }]);
        assert!(relocate(&icons, &[], &area, &lattice()).is_empty());
    }

    #[test]
    fn packs_around_boxes() {
        let icons = vec![icon(0, 0.0, 0.0), icon(1, 0.0, 100.0)];
        let blocks = vec![Rect::new(0.0, 0.0, 95.0, 95.0)];
        let area = Rect::new(0.0, 0.0, 300.0, 300.0);
        let moves = pack(&icons, &blocks, &area, &lattice());
        assert_eq!(moves, vec![Move { index: 0, x: 0.0, y: 100.0 }, Move { index: 1, x: 0.0, y: 200.0 }]);
    }

    #[test]
    fn snaps_near_cell_edges_only() {
        let grid = lattice();
        let snapped = snap_rect(Rect::new(108.0, 95.0, 290.0, 210.0), &grid, 110.0, 124.0, None, BOTH);
        assert_eq!(snapped, Rect::new(100.0, 100.0, 300.0, 200.0));
        let loose = snap_rect(Rect::new(150.0, 150.0, 250.0, 250.0), &grid, 110.0, 124.0, None, BOTH);
        assert_eq!(loose, Rect::new(150.0, 150.0, 250.0, 250.0));
        let size_only = snap_rect(Rect::new(108.0, 95.0, 290.0, 210.0), &grid, 1.0, 1.0, None, What { place: false, size: true });
        assert_eq!((size_only.x, size_only.y), (108.0, 95.0));
    }

    #[test]
    fn slides_up_to_another_box_and_pushes_out() {
        let wall = Rect::new(300.0, 0.0, 100.0, 100.0);
        let moved = slide_to(Rect::new(0.0, 0.0, 100.0, 100.0), Rect::new(250.0, 0.0, 100.0, 100.0), &[wall]);
        assert_eq!(moved.x, 200.0);
        let out = push_out(Rect::new(280.0, 0.0, 100.0, 100.0), &[wall], None);
        assert_eq!(out.x, 200.0);
    }
}

#[cfg(test)]
#[path = "deskgrid_tests.rs"]
mod js_tests;
