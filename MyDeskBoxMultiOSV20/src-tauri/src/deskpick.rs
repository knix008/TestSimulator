// 바탕화면 아이콘을 집는 판단 (src/shared/deskpick.js 를 옮긴 것). 창과 운영체제 호출 없이 검사한다.

use crate::deskgrid::Icon;
use crate::geom::Point;

const DESKTOP_CLASS: [&str; 4] = ["SysListView32", "SHELLDLL_DefView", "Progman", "WorkerW"];
// 작업 표시줄 위에 놓으면 프로그램이 파일을 받지 않는다. 바탕화면으로 꺼내는 손짓으로 둔다.
const TASKBAR_CLASS: [&str; 2] = ["Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

// 커서 아래가 바탕화면 창일 때만 바탕화면으로 본다. 읽지 못했을 때만 앞 창을 본다.
pub fn is_desktop_target(under: &str, foreground: &str) -> bool {
    if !under.is_empty() {
        return DESKTOP_CLASS.contains(&under);
    }
    DESKTOP_CLASS.contains(&foreground)
}

pub struct SurfaceFlags {
    pub ours: bool,
    pub visible: bool,
    pub cloaked: bool,
    pub transparent: bool,
}

// 커서 아래의 맨 위 창으로 칠 수 있는가.
pub fn is_surface_window(flags: &SurfaceFlags) -> bool {
    !(flags.ours || !flags.visible || flags.cloaked || flags.transparent)
}

// 커서 아래가 다른 프로그램인가. 우리 창, 바탕화면, 작업 표시줄은 아니다.
pub fn is_foreign_target(under: &str, ours: bool) -> bool {
    if ours || under.is_empty() {
        return false;
    }
    !DESKTOP_CLASS.contains(&under) && !TASKBAR_CLASS.contains(&under)
}

// 바탕화면을 두 번 누른 것을 센다. 시간과 자리만 보는 순수한 셈이다.
pub struct DeskTaps {
    last: f64,
    where_: Option<Point>,
}

impl DeskTaps {
    pub fn new() -> Self {
        Self { last: 0.0, where_: None }
    }

    // 눌렀다. 두 번째 누름이면 true. limit 는 밀리초, slop 은 허용 범위.
    pub fn press(&mut self, now: f64, pos: Point, limit: f64, slop: Point) -> bool {
        let limit = if limit.is_finite() && limit > 0.0 { limit } else { 500.0 };
        let near = self
            .where_
            .map(|w| (pos.x - w.x).abs() <= slop.x && (pos.y - w.y).abs() <= slop.y)
            .unwrap_or(false);
        if self.last != 0.0 && now - self.last <= limit && near {
            self.last = 0.0;
            self.where_ = None;
            return true;
        }
        self.last = now;
        self.where_ = Some(pos);
        false
    }

    pub fn forget(&mut self) {
        self.last = 0.0;
        self.where_ = None;
    }

    pub fn pending(&self) -> f64 {
        self.last
    }
}

fn icon_hit(icon: &Icon, pos: Point) -> bool {
    let dx = (icon.x + 24.0 - pos.x).abs();
    let dy = pos.y - icon.y;
    dx <= 56.0 && (-12.0..=100.0).contains(&dy)
}

// 그림과 글자 위에 있을 때만 아이콘이다. 옆의 빈 곳은 빈 곳이다.
pub fn icon_at(icons: &[Icon], pos: Point) -> Option<&Icon> {
    icons.iter().find(|icon| icon_hit(icon, pos))
}

pub struct DragRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

// 끌어 고른 사각형 안에 바탕화면 아이콘이 있으면 여러 개를 고른 것이다.
pub fn rect_covers_icon(rect: &DragRect, icons: &[Icon]) -> bool {
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;
    icons.iter().any(|icon| {
        if icon.x >= 19000.0 || icon.x < -1000.0 || icon.y < -1000.0 {
            return false;
        }
        icon.x < right && rect.x < icon.x + 72.0 && icon.y < bottom && rect.y < icon.y + 84.0
    })
}

pub fn should_offer_fence(rect: &DragRect, icons: &[Icon]) -> bool {
    if rect.width < 120.0 || rect.height < 90.0 {
        return false;
    }
    !rect_covers_icon(rect, icons)
}

pub fn moved_enough(from: Point, to: Point) -> bool {
    (to.x - from.x).abs() + (to.y - from.y).abs() >= 8.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn icon(x: f64, y: f64) -> Icon {
        Icon { index: 0, name: "a".into(), x, y }
    }

    #[test]
    fn desktop_and_foreign_targets() {
        assert!(is_desktop_target("SysListView32", "Chrome_WidgetWin_1"));
        assert!(!is_desktop_target("Chrome_WidgetWin_1", "Progman"));
        assert!(is_desktop_target("", "WorkerW"));
        assert!(is_foreign_target("Notepad", false));
        assert!(!is_foreign_target("Notepad", true));
        assert!(!is_foreign_target("Shell_TrayWnd", false));
        assert!(!is_foreign_target("", false));
        assert!(is_surface_window(&SurfaceFlags { ours: false, visible: true, cloaked: false, transparent: false }));
        assert!(!is_surface_window(&SurfaceFlags { ours: false, visible: true, cloaked: true, transparent: false }));
    }

    #[test]
    fn counts_double_presses_within_time_and_room() {
        let mut taps = DeskTaps::new();
        let slop = Point::new(28.0, 28.0);
        assert!(!taps.press(1000.0, Point::new(10.0, 10.0), 500.0, slop));
        assert!(taps.press(1300.0, Point::new(30.0, 30.0), 500.0, slop));
        assert!(!taps.press(1400.0, Point::new(30.0, 30.0), 500.0, slop));
        assert!(!taps.press(2000.0, Point::new(30.0, 30.0), 500.0, slop));
        taps.forget();
        assert_eq!(taps.pending(), 0.0);
    }

    #[test]
    fn icon_hit_and_fence_offer() {
        let icons = vec![icon(100.0, 100.0)];
        assert!(icon_at(&icons, Point::new(124.0, 150.0)).is_some());
        assert!(icon_at(&icons, Point::new(300.0, 150.0)).is_none());
        let rect = DragRect { x: 400.0, y: 400.0, width: 200.0, height: 150.0 };
        assert!(should_offer_fence(&rect, &icons));
        let over = DragRect { x: 50.0, y: 50.0, width: 200.0, height: 150.0 };
        assert!(!should_offer_fence(&over, &icons));
        assert!(!should_offer_fence(&DragRect { x: 0.0, y: 0.0, width: 100.0, height: 150.0 }, &[]));
        assert!(moved_enough(Point::new(0.0, 0.0), Point::new(4.0, 4.0)));
        assert!(!moved_enough(Point::new(0.0, 0.0), Point::new(3.0, 4.0)));
    }
}

#[cfg(test)]
#[path = "deskpick_tests.rs"]
mod js_tests;
