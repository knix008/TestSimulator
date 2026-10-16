//! 창 위치 계산 — 화면에 닿지 않는 순수 함수만 둔다 (검사하기 쉽게).
//!
//! 좌표는 모두 논리 픽셀(DIP)이다. Electron 판의 screen/BrowserWindow 좌표와 같은 단위라
//! settings.json 에 적힌 위치를 그대로 이어 쓴다.

#[derive(Clone, Copy, Debug, PartialEq)]
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

  pub fn rounded(self) -> Self {
    Self::new(self.x.round(), self.y.round(), self.width.round(), self.height.round())
  }
}

/// 연결된 화면 하나. `id` 는 다시 실행해도 같은 화면이면 같은 값이다 (lib.rs 의 display_id).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Display {
  pub id: f64,
  pub bounds: Rect,
  pub work_area: Rect,
}

/// 창이 움직일 수 있는 여유 공간 대비 비율로 기억한 위치.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
  pub display_id: Option<f64>,
  pub rx: f64,
  pub ry: f64,
  pub width: f64,
  pub height: f64,
}

pub fn unit(n: f64) -> f64 {
  if !n.is_finite() {
    return 0.0;
  }
  n.clamp(0.0, 1.0)
}

fn overlap_size(a: &Rect, b: &Rect) -> (f64, f64) {
  let x = (a.x + a.width).min(b.x + b.width) - a.x.max(b.x);
  let y = (a.y + a.height).min(b.y + b.height) - a.y.max(b.y);
  (x, y)
}

pub fn bounds_overlap(a: &Rect, b: &Rect, min_px: f64) -> bool {
  let (x, y) = overlap_size(a, b);
  x >= min_px && y >= min_px
}

fn usable(area: &Rect) -> bool {
  area.width >= 80.0 && area.height >= 80.0
}

pub fn has_usable_displays(displays: &[Display]) -> bool {
  displays.iter().any(|d| usable(&d.work_area))
}

/// 첫 번째가 주 화면이다 (lib.rs 가 그렇게 모은다).
pub fn primary(displays: &[Display]) -> Option<&Display> {
  displays.first()
}

/// 가장 많이 겹치는 화면, 겹치는 화면이 없으면 가장 가까운 화면 (Electron getDisplayMatching).
pub fn display_matching<'a>(displays: &'a [Display], rect: &Rect) -> Option<&'a Display> {
  let area = |d: &Display| {
    let (x, y) = overlap_size(&d.bounds, rect);
    if x > 0.0 && y > 0.0 {
      x * y
    } else {
      0.0
    }
  };
  if let Some(best) = displays.iter().filter(|d| area(d) > 0.0).max_by(|a, b| area(a).total_cmp(&area(b))) {
    return Some(best);
  }
  display_nearest_point(displays, rect.x + rect.width / 2.0, rect.y + rect.height / 2.0)
}

pub fn display_nearest_point(displays: &[Display], x: f64, y: f64) -> Option<&Display> {
  let distance = |d: &Display| {
    let b = &d.bounds;
    let dx = (b.x - x).max(0.0).max(x - (b.x + b.width));
    let dy = (b.y - y).max(0.0).max(y - (b.y + b.height));
    dx * dx + dy * dy
  };
  displays.iter().min_by(|a, b| distance(a).total_cmp(&distance(b)))
}

/// 현재 연결된 화면에 겹치면 그 작업 영역, 아니면 주 화면.
/// 노트북 덮개를 닫았다 열면 옛 좌표가 사라진 모니터에 남을 수 있다.
pub fn work_area_for_bounds(displays: &[Display], bounds: &Rect) -> Option<Rect> {
  if let Some(visible) = displays.iter().find(|d| bounds_overlap(bounds, &d.work_area, 40.0)) {
    return Some(visible.work_area);
  }
  primary(displays).map(|d| d.work_area)
}

pub fn clamp_to_work_area(displays: &[Display], bounds: Rect) -> Rect {
  let Some(area) = work_area_for_bounds(displays, &bounds) else { return bounds };
  if !usable(&area) {
    return bounds;
  }
  let width = bounds.width.min(area.width);
  let height = bounds.height.min(area.height);
  Rect {
    width,
    height,
    x: bounds.x.max(area.x).min(area.x + area.width - width).round(),
    y: bounds.y.max(area.y).min(area.y + area.height - height).round(),
  }
}

/// 절대 픽셀이 아니라, 그 화면에서 창이 움직일 수 있는 여유 공간의 비율로 위치를 기억한다.
/// 오른쪽 끝에 둔 시계는 해상도가 바뀌어도 오른쪽 끝에 남는다.
pub fn capture_placement(displays: &[Display], bounds: &Rect) -> Option<Placement> {
  if !has_usable_displays(displays) {
    return None;
  }
  let display = displays
    .iter()
    .find(|d| bounds_overlap(bounds, &d.work_area, 1.0))
    .or_else(|| display_matching(displays, bounds))
    .or_else(|| primary(displays))?;
  let area = display.work_area;
  if !usable(&area) {
    return None;
  }
  let move_x = area.width - bounds.width;
  let move_y = area.height - bounds.height;
  Some(Placement {
    display_id: Some(display.id),
    rx: if move_x <= 0.0 { 0.0 } else { unit((bounds.x - area.x) / move_x) },
    ry: if move_y <= 0.0 { 0.0 } else { unit((bounds.y - area.y) / move_y) },
    width: bounds.width,
    height: bounds.height,
  })
}

/// 기억한 비율을 지금 화면의 좌표로 되돌린다. 그 화면이 없으면 주 화면에 둔다.
pub fn apply_placement(displays: &[Display], placement: &Placement, min_w: f64, min_h: f64) -> Option<Rect> {
  if !has_usable_displays(displays) {
    return None;
  }
  let display = placement
    .display_id
    .and_then(|id| displays.iter().find(|d| d.id == id))
    .or_else(|| primary(displays))?;
  let area = display.work_area;
  if !usable(&area) {
    return None;
  }
  let width = placement.width.round().max(min_w).min(area.width);
  let height = placement.height.round().max(min_h).min(area.height);
  let move_x = (area.width - width).max(0.0);
  let move_y = (area.height - height).max(0.0);
  Some(Rect {
    x: (area.x + unit(placement.rx) * move_x).round(),
    y: (area.y + unit(placement.ry) * move_y).round(),
    width,
    height,
  })
}

/// 설정 패널 — 시계 좌/우에 붙는다. `fit` 은 패널이 재서 알려 준 "다 보이는" 크기.
pub fn panel_bounds_for(displays: &[Display], clock: &Rect, open_right: bool, base: (f64, f64), fit: Option<(f64, f64)>) -> Rect {
  let area = display_matching(displays, clock).map(|d| d.work_area).unwrap_or(Rect::new(0.0, 0.0, 1920.0, 1080.0));
  let (fit_w, fit_h) = fit.unwrap_or((0.0, 0.0));
  let width = base.0.max(fit_w).min(area.width);
  let height = base.1.max(fit_h).min(area.height);
  let mut y = clock.y;
  if y + height > area.y + area.height {
    y = area.y.max(area.y + area.height - height);
  }
  let x = if open_right { clock.x + clock.width } else { clock.x - width };
  // 화면 밖으로 나가면 내용이 잘린다 — 작업 영역 안으로 당겨 둔다.
  clamp_to_work_area(displays, Rect::new(x, y, width, height).rounded())
}

/// 오른쪽 여백이 없으면 왼쪽으로 — WPF DetermineOpenRightAt 과 같은 규칙.
pub fn determine_open_right(displays: &[Display], clock: &Rect, prefer_right: bool, base_width: f64, fit_width: Option<f64>) -> bool {
  let area = display_matching(displays, clock).map(|d| d.work_area).unwrap_or(Rect::new(0.0, 0.0, 1920.0, 1080.0));
  let width = base_width.max(fit_width.unwrap_or(0.0));
  let can_right = clock.x + clock.width + width <= area.x + area.width;
  let can_left = clock.x - width >= area.x;
  if prefer_right {
    can_right || !can_left
  } else {
    !can_left
  }
}

/// 메뉴가 잰 크기에 맞춰 커서 옆에 놓는다 — 화면 밖으로 나가면 반대쪽으로 뒤집는다.
pub fn place_menu(area: &Rect, anchor: (f64, f64), size: (f64, f64)) -> Rect {
  let width = size.0.round().max(80.0);
  let height = size.1.round().max(40.0);
  let (ax, ay) = anchor;
  let mut x = ax;
  let mut y = ay;
  if x + width > area.x + area.width {
    x = ax - width;
  }
  if y + height > area.y + area.height {
    y = ay - height;
  }
  x = x.max(area.x).min(area.x + area.width - width);
  y = y.max(area.y).min(area.y + area.height - height);
  Rect::new(x.round(), y.round(), width, height)
}

/// 전체 화면 시계가 실제로 그려진 상자를 작업 영역 가운데에 둔다.
pub fn center_in(area: &Rect, size: (f64, f64)) -> Rect {
  let width = size.0.min(area.width);
  let height = size.1.min(area.height);
  Rect::new((area.x + (area.width - width) / 2.0).round(), (area.y + (area.height - height) / 2.0).round(), width, height)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn screen(id: f64, x: f64, y: f64, w: f64, h: f64) -> Display {
    Display { id, bounds: Rect::new(x, y, w, h), work_area: Rect::new(x, y, w, h - 40.0) }
  }

  #[test]
  fn placement_keeps_relative_position_when_resolution_changes() {
    let before = [screen(1.0, 0.0, 0.0, 1920.0, 1080.0)];
    // 오른쪽 끝, 위쪽에 둔 시계
    let clock = Rect::new(1920.0 - 300.0, 0.0, 300.0, 300.0);
    let p = capture_placement(&before, &clock).unwrap();
    assert_eq!(p.rx, 1.0);
    assert_eq!(p.ry, 0.0);

    let after = [screen(1.0, 0.0, 0.0, 1280.0, 720.0)];
    let next = apply_placement(&after, &p, 140.0, 50.0).unwrap();
    assert_eq!(next, Rect::new(980.0, 0.0, 300.0, 300.0), "해상도가 바뀌어도 오른쪽 끝에 남는다");
  }

  #[test]
  fn placement_falls_back_to_primary_when_its_display_is_gone() {
    let two = [screen(1.0, 0.0, 0.0, 1920.0, 1080.0), screen(2.0, 1920.0, 0.0, 1920.0, 1080.0)];
    let p = capture_placement(&two, &Rect::new(2000.0, 100.0, 300.0, 200.0)).unwrap();
    assert_eq!(p.display_id, Some(2.0));
    let one = [screen(1.0, 0.0, 0.0, 1920.0, 1080.0)];
    let next = apply_placement(&one, &p, 140.0, 50.0).unwrap();
    assert!(next.x >= 0.0 && next.x + next.width <= 1920.0, "사라진 화면이 아니라 주 화면에 둔다");
  }

  #[test]
  fn clamp_pulls_lost_window_back_on_screen() {
    let displays = [screen(1.0, 0.0, 0.0, 1920.0, 1080.0)];
    let next = clamp_to_work_area(&displays, Rect::new(5000.0, -300.0, 300.0, 300.0));
    assert_eq!(next, Rect::new(1620.0, 0.0, 300.0, 300.0));
  }

  #[test]
  fn panel_opens_left_when_no_room_on_the_right() {
    let displays = [screen(1.0, 0.0, 0.0, 1920.0, 1080.0)];
    let clock = Rect::new(1700.0, 100.0, 200.0, 150.0);
    assert!(!determine_open_right(&displays, &clock, true, 400.0, None));
    let panel = panel_bounds_for(&displays, &clock, false, (400.0, 600.0), None);
    assert_eq!(panel, Rect::new(1300.0, 100.0, 400.0, 600.0));
    // 패널이 더 넓게 재서 알려 주면 그만큼 넓힌다.
    let wide = panel_bounds_for(&displays, &Rect::new(100.0, 100.0, 200.0, 150.0), true, (400.0, 600.0), Some((460.0, 700.0)));
    assert_eq!((wide.width, wide.height), (460.0, 700.0));
  }

  #[test]
  fn menu_flips_at_screen_edges() {
    let area = Rect::new(0.0, 0.0, 1920.0, 1040.0);
    assert_eq!(place_menu(&area, (100.0, 100.0), (240.0, 200.0)), Rect::new(100.0, 100.0, 240.0, 200.0));
    assert_eq!(place_menu(&area, (1900.0, 1000.0), (240.0, 200.0)), Rect::new(1660.0, 800.0, 240.0, 200.0));
  }

  #[test]
  fn no_usable_display_means_no_placement() {
    assert!(capture_placement(&[], &Rect::new(0.0, 0.0, 10.0, 10.0)).is_none());
    let tiny = [Display { id: 1.0, bounds: Rect::new(0.0, 0.0, 50.0, 50.0), work_area: Rect::new(0.0, 0.0, 50.0, 50.0) }];
    assert!(apply_placement(&tiny, &Placement { display_id: None, rx: 0.5, ry: 0.5, width: 300.0, height: 300.0 }, 140.0, 50.0).is_none());
  }
}
