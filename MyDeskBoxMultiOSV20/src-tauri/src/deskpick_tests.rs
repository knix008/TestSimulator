// Electron 판 test/deskpick.test.js 를 옮긴 것.

use super::*;

fn flags(ours: bool, visible: bool, cloaked: bool, transparent: bool) -> SurfaceFlags {
    SurfaceFlags { ours, visible, cloaked, transparent }
}

#[test]
fn desktop_foreign_and_surface_windows() {
    assert!(is_desktop_target("SysListView32", "Chrome_WidgetWin_1"));
    assert!(is_desktop_target("Progman", "Progman"));
    assert!(!is_desktop_target("CabinetWClass", "Chrome_WidgetWin_1"));
    assert!(is_desktop_target("SHELLDLL_DefView", "Notepad"));
    assert!(is_desktop_target("WorkerW", ""));
    assert!(!is_desktop_target("", ""));
    assert!(!is_desktop_target("Button", "CabinetWClass"));
    assert!(!is_desktop_target("Chrome_WidgetWin_1", "Progman"), "a box under the cursor is not the desktop");
    assert!(!is_desktop_target("", "Chrome_WidgetWin_1"));
    for (class, ours, want) in [
        ("Notepad", false, true),
        ("Chrome_WidgetWin_1", false, true),
        ("CabinetWClass", false, true),
        ("Chrome_WidgetWin_1", true, false),
        ("Progman", false, false),
        ("SysListView32", false, false),
        ("WorkerW", false, false),
        ("SHELLDLL_DefView", false, false),
        ("Shell_TrayWnd", false, false),
        ("Shell_SecondaryTrayWnd", false, false),
        ("", false, false),
    ] {
        assert_eq!(is_foreign_target(class, ours), want, "{class} {ours}");
    }
    assert!(is_surface_window(&flags(false, true, false, false)));
    assert!(!is_surface_window(&flags(true, true, false, false)));
    assert!(!is_surface_window(&flags(false, false, false, false)));
    assert!(!is_surface_window(&flags(false, true, true, false)));
    assert!(!is_surface_window(&flags(false, true, false, true)));
}

fn icon(x: f64, y: f64) -> Icon {
    Icon { index: 1, name: "Projects".into(), x, y }
}

#[test]
fn new_boxes_only_from_empty_space() {
    let icons = vec![icon(14.0, 80.0), Icon { index: 0, name: "휴지통".into(), x: 14.0, y: 982.0 }];
    assert!(icon_at(&icons[..1], Point::new(14.0 + 24.0 + 80.0, 100.0)).is_none());
    assert_eq!(icon_at(&icons[..1], Point::new(38.0, 100.0)).unwrap().name, "Projects");
    let rect = |x, y, w, h| DragRect { x, y, width: w, height: h };
    assert!(should_offer_fence(&rect(400.0, 400.0, 200.0, 160.0), &icons));
    assert!(!should_offer_fence(&rect(0.0, 60.0, 200.0, 160.0), &icons));
    assert!(!should_offer_fence(&rect(400.0, 400.0, 40.0, 30.0), &icons));
    assert!(should_offer_fence(&rect(0.0, 60.0, 200.0, 160.0), &[icon(20000.0, 2000.0)]));
    assert!(rect_covers_icon(&rect(160.0, 170.0, 200.0, 120.0), &[icon(100.0, 100.0)]));
    assert!(!rect_covers_icon(&rect(172.0, 100.0, 200.0, 120.0), &[icon(100.0, 100.0)]));
    assert!(!rect_covers_icon(&rect(160.0, 170.0, 200.0, 120.0), &[icon(-2000.0, 100.0)]));
    assert!(moved_enough(Point::new(14.0, 982.0), Point::new(40.0, 982.0)));
    assert!(!moved_enough(Point::new(14.0, 982.0), Point::new(16.0, 984.0)));
}

#[test]
fn double_presses() {
    let s4 = Point::new(4.0, 4.0);
    let mut t = DeskTaps::new();
    assert!(!t.press(1000.0, Point::new(200.0, 300.0), 500.0, s4));
    assert!(t.press(1400.0, Point::new(201.0, 302.0), 500.0, s4));
    let mut t = DeskTaps::new();
    t.press(1000.0, Point::new(200.0, 300.0), 500.0, s4);
    assert!(!t.press(1600.0, Point::new(200.0, 300.0), 500.0, s4), "too slow");
    let mut t = DeskTaps::new();
    t.press(1000.0, Point::new(200.0, 300.0), 500.0, s4);
    assert!(!t.press(1200.0, Point::new(260.0, 300.0), 500.0, s4), "too far");
    let mut t = DeskTaps::new();
    t.press(1000.0, Point::new(10.0, 10.0), 500.0, s4);
    t.forget();
    assert!(!t.press(1150.0, Point::new(10.0, 10.0), 500.0, s4));
    assert_eq!(t.pending(), 1150.0);
    let mut t = DeskTaps::new();
    t.press(1000.0, Point::new(10.0, 10.0), 200.0, s4);
    assert!(!t.press(1400.0, Point::new(10.0, 10.0), 200.0, s4), "follows a short setting");
    t.forget();
    t.press(2000.0, Point::new(10.0, 10.0), 800.0, s4);
    assert!(t.press(2400.0, Point::new(10.0, 10.0), 800.0, s4), "follows a longer setting");
    let s28 = Point::new(28.0, 28.0);
    let mut t = DeskTaps::new();
    t.press(1000.0, Point::new(1258.0, 998.0), 500.0, s28);
    assert!(t.press(1185.0, Point::new(1252.0, 1021.0), 500.0, s28));
    let mut t = DeskTaps::new();
    t.press(1000.0, Point::new(200.0, 300.0), 500.0, s28);
    assert!(!t.press(1150.0, Point::new(200.0, 400.0), 500.0, s28));
    let mut t = DeskTaps::new();
    t.press(1000.0, Point::new(10.0, 10.0), f64::NAN, s4);
    assert!(t.press(1490.0, Point::new(12.0, 12.0), f64::NAN, s4), "defaults to 500 ms");
}
