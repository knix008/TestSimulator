// Electron 판 test/deskgrid.test.js 를 옮긴 것.

use super::*;

const AREA: Rect = Rect { x: 0.0, y: 0.0, width: 1920.0, height: 1000.0 };

fn column(count: i64, col: f64) -> Vec<Icon> {
    (0..count).map(|i| Icon { index: i, name: String::new(), x: col * 76.0, y: i as f64 * 98.0 }).collect()
}
fn pts(list: &[(f64, f64)]) -> Vec<Point> {
    list.iter().map(|(x, y)| Point::new(*x, *y)).collect()
}
fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect::new(x, y, w, h)
}
fn lat(x0: f64, y0: f64, dx: f64, dy: f64) -> Lattice {
    Lattice { x0, y0, dx, dy }
}
fn snap(rect: Rect, g: &Lattice) -> Rect {
    snap_rect(rect, g, 0.0, 0.0, None, BOTH)
}

#[test]
fn infers_the_cell_size_and_stays_put_when_icons_move() {
    let m = metrics(&pts(&[(20.0, 10.0), (20.0, 108.0), (96.0, 10.0), (96.0, 206.0)]));
    assert_eq!((m.x0, m.y0, m.dx, m.dy), (20.0, 10.0, 76.0, 98.0));
    let before = steady(&metrics(&pts(&[(20.0, 10.0), (96.0, 10.0), (20.0, 108.0)])));
    let after = steady(&metrics(&pts(&[(96.0, 108.0), (172.0, 108.0), (96.0, 206.0)])));
    assert_eq!(before, after, "the grid moved along with the icons");
    let bx = snap(r(300.0, 300.0, 320.0, 300.0), &before);
    let later = steady(&metrics(&pts(&[(96.0, 108.0), (172.0, 108.0)])));
    assert_eq!(snap(bx, &later), bx, "the box moved on its own");
    let one = metrics(&pts(&[(5.0, 7.0)]));
    assert_eq!((one.dx, one.dy), (FALLBACK_DX, FALLBACK_DY));
}

#[test]
fn a_box_snapped_once_stays_the_same() {
    let g = steady(&metrics(&pts(&[(20.0, 10.0), (96.0, 10.0), (20.0, 108.0)])));
    for drawn in [r(300.0, 300.0, 320.0, 300.0), r(317.0, 206.0, 231.0, 197.0), r(96.0, 108.0, 152.0, 196.0)] {
        let mut bx = snap(drawn, &g);
        for _ in 0..6 {
            bx = snap(bx, &g);
        }
        assert_eq!(bx, snap(drawn, &g));
    }
}

#[test]
fn push_out_moves_the_shortest_way_and_resolves_three() {
    let area = r(0.0, 0.0, 1920.0, 1200.0);
    let other = r(500.0, 300.0, 400.0, 400.0);
    let moved = push_out(r(860.0, 300.0, 300.0, 300.0), &[other], Some(area));
    assert_eq!((moved.x, moved.y), (900.0, 300.0));
    assert!(!overlaps(&moved, &other));
    let kept = r(100.0, 100.0, 200.0, 200.0);
    assert_eq!(push_out(kept, &[other], None), kept);
    assert_eq!(push_out(kept, &[], None), kept);
    let others = [r(400.0, 200.0, 300.0, 300.0), r(700.0, 200.0, 300.0, 300.0)];
    let moved = push_out(r(650.0, 250.0, 200.0, 200.0), &others, Some(area));
    for o in &others {
        assert!(!overlaps(&moved, o), "{moved:?}");
    }
}

fn leftovers(icons: &[Icon], blocks: &[Rect], moves: &[Move], g: &Lattice) -> usize {
    icons
        .iter()
        .map(|i| moves.iter().find(|m| m.index == i.index).map(|m| Point::new(m.x, m.y)).unwrap_or(Point::new(i.x, i.y)))
        .filter(|p| blocked(cell_of(*p, g), g, blocks))
        .count()
}

#[test]
fn relocate_moves_every_covered_icon_into_free_cells() {
    assert!(relocate(&column(5, 0.0), &[], &AREA, &lattice_for(&column(5, 0.0))).is_empty());
    let icons = column(5, 0.0);
    let blocks = [r(0.0, 90.0, 200.0, 200.0)];
    let g = lattice_for(&icons);
    let moves = relocate(&icons, &blocks, &AREA, &g);
    assert!(moves.len() >= 2);
    assert_eq!(leftovers(&icons, &blocks, &moves, &g), 0);
    // 모서리만 겹쳐도 비킨다.
    let icons = column(3, 0.0);
    let moves = relocate(&icons, &[r(0.0, 90.0, 200.0, 40.0)], &AREA, &lattice_for(&icons));
    assert!(moves.iter().any(|m| m.index == 0));
    // 이미 아이콘이 있는 칸으로는 옮기지 않는다.
    let icons = column(4, 0.0);
    let moves = relocate(&icons, &[r(0.0, 0.0, 100.0, 100.0)], &AREA, &lattice_for(&icons));
    let mut busy: std::collections::HashSet<(i64, i64)> =
        icons.iter().filter(|i| !moves.iter().any(|m| m.index == i.index)).map(|i| (i.x as i64, i.y as i64)).collect();
    for m in &moves {
        assert!(busy.insert((m.x as i64, m.y as i64)), "took a cell already in use");
    }
}

#[test]
fn pushed_icons_go_next_door_not_to_the_front() {
    let icons = column(3, 0.0);
    let moves = relocate(&icons, &[r(0.0, 0.0, 76.0, 1000.0)], &AREA, &lattice_for(&icons));
    assert_eq!(moves.iter().map(|m| m.x).collect::<Vec<_>>(), vec![76.0; 3]);
    assert_eq!(moves.iter().map(|m| m.y).collect::<Vec<_>>(), vec![0.0, 98.0, 196.0]);
    let far = vec![Icon { index: 0, name: String::new(), x: 760.0, y: 490.0 }];
    let moves = relocate(&far, &[r(750.0, 480.0, 96.0, 118.0)], &AREA, &lattice_for(&far));
    assert_eq!(moves.len(), 1);
    let cell = cell_of(Point::new(moves[0].x, moves[0].y), &lattice_for(&far));
    assert!((cell.col - 10).abs() <= 2 && (cell.row - 5).abs() <= 2);
    let tiny = r(0.0, 0.0, 76.0, 300.0);
    assert!(relocate(&column(3, 0.0), &[r(0.0, 0.0, 2000.0, 2000.0)], &tiny, &lattice_for(&column(3, 0.0))).is_empty());
}

#[test]
fn auto_arrange_skips_box_cells_and_is_stable() {
    let g = lat(0.0, 0.0, 76.0, 98.0);
    let area = r(0.0, 0.0, 76.0 * 3.0, 98.0 * 3.0);
    let icons = vec![
        Icon { index: 0, name: String::new(), x: 0.0, y: 0.0 },
        Icon { index: 1, name: String::new(), x: 0.0, y: 196.0 },
        Icon { index: 2, name: String::new(), x: 76.0, y: 196.0 },
        Icon { index: 3, name: String::new(), x: 152.0, y: 0.0 },
    ];
    let blocks = [r(0.0, 98.0, 76.0, 98.0)];
    let moves = pack(&icons, &blocks, &area, &g);
    let at: Vec<(f64, f64)> =
        icons.iter().map(|i| moves.iter().find(|m| m.index == i.index).map(|m| (m.x, m.y)).unwrap_or((i.x, i.y))).collect();
    assert_eq!(at, vec![(0.0, 0.0), (0.0, 196.0), (76.0, 0.0), (76.0, 98.0)]);
    let settled: Vec<Icon> = icons.iter().zip(at).map(|(i, (x, y))| Icon { x, y, ..i.clone() }).collect();
    assert!(pack(&settled, &blocks, &area, &g).is_empty());
}

#[test]
fn gaps_insets_and_overlaps() {
    assert_eq!(smallest_gap(&[0.0, 4.0, 80.0], 76.0), 76.0);
    assert_eq!(smallest_gap(&[10.0], 98.0), 98.0);
    assert_eq!(smallest_gap(&[], 98.0), 98.0);
    let rect = icon_rect(Cell { col: 1, row: 0 }, &lat(0.0, 0.0, 76.0, 98.0));
    assert_eq!((rect.x, rect.width, rect.height), (76.0 + INSET, 76.0 - INSET * 2.0, 98.0 - INSET * 2.0));
    let a = r(0.0, 0.0, 10.0, 10.0);
    assert!(overlaps(&a, &r(5.0, 5.0, 10.0, 10.0)));
    assert!(!overlaps(&a, &r(10.0, 0.0, 10.0, 10.0)), "merely touching is not overlapping");
}

#[test]
fn magnet_snapping_rules() {
    let g = lat(20.0, 30.0, 80.0, 100.0);
    assert_eq!(snap(r(105.0, 135.0, 316.0, 292.0), &g), r(100.0, 130.0, 320.0, 300.0));
    let free = r(140.0, 180.0, 360.0, 340.0);
    assert_eq!(snap(free, &g), free);
    let h = lat(0.0, 0.0, 100.0, 100.0);
    assert_eq!(snap(r(215.0, 0.0, 100.0, 100.0), &h).x, 200.0);
    assert_eq!(snap(r(225.0, 0.0, 100.0, 100.0), &h).x, 225.0);
    let c = lat(0.0, 0.0, 80.0, 100.0);
    let s = snap_rect(r(0.0, 0.0, 4.0, 4.0), &c, 110.0, 132.0, None, BOTH);
    assert_eq!((s.width, s.height), (110.0, 132.0));
    let one = snap(r(0.0, 0.0, 80.0, 100.0), &c);
    assert_eq!((one.width, one.height), (80.0, 100.0));
    let drawn = r(11.0, 13.0, 17.0, 19.0);
    assert_eq!(snap(drawn, &lat(0.0, 0.0, 0.0, 0.0)), drawn);
}

#[test]
fn moving_a_box_many_times_does_not_grow_it() {
    let g = lat(20.0, 30.0, 80.0, 100.0);
    let mut rect = snap(r(105.0, 135.0, 300.0, 240.0), &g);
    let first = rect;
    for (dx, dy) in [(-9.0, -12.0), (7.0, 5.0), (-31.0, -44.0), (18.0, 26.0), (-3.0, -7.0)] {
        rect = snap(Rect { x: rect.x + dx, y: rect.y + dy, ..rect }, &g);
        assert_eq!((rect.width, rect.height), (first.width, first.height));
    }
}

#[test]
fn a_snapped_box_blocks_every_cell_it_covers() {
    let g = lat(0.0, 0.0, 80.0, 100.0);
    let block = snap(r(85.0, 105.0, 150.0, 150.0), &g);
    for (col, row) in [(1, 1), (2, 1), (1, 2), (2, 2)] {
        assert!(blocked(Cell { col, row }, &g, &[block]), "{col},{row}");
    }
    assert!(!blocked(Cell { col: 0, row: 0 }, &g, &[block]));
}

#[test]
fn screen_edges_attract_and_what_limits_the_change() {
    let g = lat(14.0, 2.0, 76.0, 98.0);
    let area = r(0.0, 0.0, 1920.0, 1160.0);
    let flush = snap_rect(r(0.0, 0.0, 380.0, 294.0), &g, 0.0, 0.0, Some(area), BOTH);
    assert_eq!((flush.x, flush.y), (0.0, 0.0));
    let flush = snap_rect(r(1920.0 - 385.0, 1160.0 - 299.0, 380.0, 294.0), &g, 0.0, 0.0, Some(area), BOTH);
    assert_eq!((flush.x + flush.width, flush.y + flush.height), (1920.0, 1160.0));
    let near = snap_rect(r(620.0, 300.0, 380.0, 294.0), &g, 0.0, 0.0, Some(area), BOTH);
    assert_eq!(wrap(near.x - g.x0, g.dx), 0.0);
    let resized = snap_rect(r(613.0, 297.0, 300.0, 240.0), &g, 0.0, 0.0, Some(area), What { place: false, size: true });
    assert_eq!((resized.x, resized.y), (613.0, 297.0));
    let moved = snap_rect(r(613.0, 297.0, 301.0, 241.0), &g, 0.0, 0.0, None, What { place: true, size: false });
    assert_eq!((moved.width, moved.height), (301.0, 241.0));
}

#[test]
fn sliding_stops_at_walls_but_not_beside_or_inside_them() {
    let wall = [r(500.0, 300.0, 300.0, 300.0)];
    let moved = slide_to(r(100.0, 350.0, 200.0, 200.0), r(600.0, 350.0, 200.0, 200.0), &wall);
    assert_eq!(moved.x, 300.0);
    assert!(!overlaps(&moved, &wall[0]));
    let to = r(900.0, 50.0, 200.0, 200.0);
    assert_eq!(slide_to(r(100.0, 50.0, 200.0, 200.0), to, &wall), to);
    let moved = slide_to(r(100.0, 350.0, 200.0, 200.0), r(600.0, 700.0, 200.0, 200.0), &wall);
    assert!(!overlaps(&moved, &wall[0]));
    assert_eq!(moved.y, 700.0);
    let to = r(560.0, 360.0, 200.0, 200.0);
    assert_eq!(slide_to(r(550.0, 350.0, 200.0, 200.0), to, &wall), to);
    let to = r(400.0, 400.0, 100.0, 100.0);
    assert_eq!(slide_to(r(0.0, 0.0, 100.0, 100.0), to, &[]), to);
}
