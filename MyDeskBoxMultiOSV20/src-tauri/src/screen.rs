// 화면과 좌표 (Electron 의 screen 모듈 대신).
//
// 박스 자리는 DIP 로 적는다. Windows 바탕화면 아이콘과 창 자리는 물리 픽셀이다.
// 배율이 화면마다 다르면 Chromium 처럼 첫 화면에 맞붙여 DIP 자리를 정한다.

use crate::geom::{Display, Point, Rect};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Monitor {
    pub phys: Rect,
    pub phys_work: Rect,
    pub scale: f64,
    pub dip: Rect,
    pub dip_work: Rect,
    pub primary: bool,
}

impl Monitor {
    fn to_dip(&self, p: Point) -> Point {
        Point { x: self.dip.x + (p.x - self.phys.x) / self.scale, y: self.dip.y + (p.y - self.phys.y) / self.scale }
    }
    fn to_phys(&self, p: Point) -> Point {
        Point { x: self.phys.x + (p.x - self.dip.x) * self.scale, y: self.phys.y + (p.y - self.dip.y) * self.scale }
    }
    pub fn display(&self) -> Display {
        Display { bounds: self.dip, work_area: self.dip_work }
    }
}

// 물리 자리와 배율만 받아 DIP 자리를 정한다. 첫 화면은 원점에서 배율로 나눈 자리,
// 나머지는 첫 화면의 맞닿은 가장자리에 붙인다.
pub fn lay_out(raw: &[(Rect, Rect, f64, bool)]) -> Vec<Monitor> {
    let primary = raw.iter().find(|m| m.3).or(raw.first()).copied();
    let Some((pp, _, ps, _)) = primary else { return vec![] };
    let pdip = Rect { x: pp.x / ps, y: pp.y / ps, width: pp.width / ps, height: pp.height / ps };
    raw.iter()
        .map(|(phys, work, scale, is_primary)| {
            let w = phys.width / scale;
            let h = phys.height / scale;
            let x = if *is_primary {
                pdip.x
            } else if phys.x >= pp.right() {
                pdip.right() + (phys.x - pp.right()) / scale
            } else if phys.right() <= pp.x {
                pdip.x - (pp.x - phys.right()) / scale - w
            } else {
                pdip.x + (phys.x - pp.x) / ps
            };
            let y = if *is_primary {
                pdip.y
            } else if phys.y >= pp.bottom() {
                pdip.bottom() + (phys.y - pp.bottom()) / scale
            } else if phys.bottom() <= pp.y {
                pdip.y - (pp.y - phys.bottom()) / scale - h
            } else {
                pdip.y + (phys.y - pp.y) / ps
            };
            let dip = Rect { x, y, width: w, height: h };
            let dip_work = Rect {
                x: x + (work.x - phys.x) / scale,
                y: y + (work.y - phys.y) / scale,
                width: work.width / scale,
                height: work.height / scale,
            };
            Monitor { phys: *phys, phys_work: *work, scale: *scale, dip, dip_work, primary: *is_primary }
        })
        .collect()
}

fn contains(r: &Rect, p: Point) -> bool {
    p.x >= r.x && p.x < r.right() && p.y >= r.y && p.y < r.bottom()
}

fn distance(r: &Rect, p: Point) -> f64 {
    let dx = (r.x - p.x).max(0.0).max(p.x - r.right());
    let dy = (r.y - p.y).max(0.0).max(p.y - r.bottom());
    dx * dx + dy * dy
}

fn nearest_by(list: &[Monitor], p: Point, rect: impl Fn(&Monitor) -> Rect) -> Option<Monitor> {
    list.iter().find(|m| contains(&rect(m), p)).copied().or_else(|| {
        list.iter().copied().min_by(|a, b| distance(&rect(a), p).partial_cmp(&distance(&rect(b), p)).unwrap())
    })
}

pub fn dip_to_phys(p: Point) -> Point {
    let list = monitors();
    match nearest_by(&list, p, |m| m.dip) {
        Some(m) => m.to_phys(p),
        None => p,
    }
}

pub fn phys_to_dip(p: Point) -> Point {
    let list = monitors();
    match nearest_by(&list, p, |m| m.phys) {
        Some(m) => m.to_dip(p),
        None => p,
    }
}

pub fn dip_rect_to_phys(r: Rect) -> Rect {
    use crate::js::round;
    let tl = dip_to_phys(Point::new(r.x, r.y));
    let br = dip_to_phys(Point::new(r.right(), r.bottom()));
    Rect { x: round(tl.x), y: round(tl.y), width: round(br.x - tl.x), height: round(br.y - tl.y) }
}

pub fn display_nearest(p: Point) -> Option<Display> {
    nearest_by(&monitors(), p, |m| m.dip).map(|m| m.display())
}

pub fn primary() -> Option<Monitor> {
    let list = monitors();
    list.iter().find(|m| m.primary).copied().or(list.first().copied())
}

#[cfg(windows)]
pub fn monitors() -> Vec<Monitor> {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

    unsafe extern "system" fn each(mon: HMONITOR, _dc: HDC, _rect: *mut RECT, data: LPARAM) -> BOOL {
        let list = &mut *(data.0 as *mut Vec<(Rect, Rect, f64, bool)>);
        let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if GetMonitorInfoW(mon, &mut info).as_bool() {
            let (mut dx, mut dy) = (96u32, 96u32);
            let _ = GetDpiForMonitor(mon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
            let r = |r: RECT| Rect::new(r.left as f64, r.top as f64, (r.right - r.left) as f64, (r.bottom - r.top) as f64);
            list.push((r(info.rcMonitor), r(info.rcWork), dx.max(1) as f64 / 96.0, info.dwFlags & 1 != 0));
        }
        BOOL(1)
    }

    let mut raw: Vec<(Rect, Rect, f64, bool)> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(each), LPARAM(&mut raw as *mut _ as isize));
    }
    lay_out(&raw)
}

#[cfg(windows)]
pub fn cursor_phys() -> Option<Point> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some(Point::new(p.x as f64, p.y as f64))
}

// 다른 운영체제는 Tauri 에게 화면과 커서를 묻는다. 좌표는 논리 픽셀이 곧 DIP 다.
#[cfg(not(windows))]
static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

#[cfg(not(windows))]
pub fn attach(app: tauri::AppHandle) {
    let _ = APP.set(app);
}

#[cfg(not(windows))]
pub fn monitors() -> Vec<Monitor> {
    let Some(app) = APP.get() else { return vec![] };
    let primary = app.primary_monitor().ok().flatten().map(|m| *m.position());
    let list = app.available_monitors().unwrap_or_default();
    let raw: Vec<(Rect, Rect, f64, bool)> = list
        .iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            let w = m.work_area();
            (
                Rect::new(p.x as f64, p.y as f64, s.width as f64, s.height as f64),
                Rect::new(w.position.x as f64, w.position.y as f64, w.size.width as f64, w.size.height as f64),
                m.scale_factor(),
                primary.map(|q| q == *p).unwrap_or(false),
            )
        })
        .collect();
    lay_out(&raw)
}

#[cfg(not(windows))]
pub fn cursor_phys() -> Option<Point> {
    let p = APP.get()?.cursor_position().ok()?;
    Some(Point::new(p.x, p.y))
}

pub fn cursor_dip() -> Option<Point> {
    cursor_phys().map(phys_to_dip)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lays_out_mixed_scales_side_by_side() {
        let list = lay_out(&[
            (Rect::new(0.0, 0.0, 1920.0, 1080.0), Rect::new(0.0, 0.0, 1920.0, 1040.0), 1.0, true),
            (Rect::new(1920.0, 0.0, 3840.0, 2160.0), Rect::new(1920.0, 0.0, 3840.0, 2100.0), 2.0, false),
        ]);
        assert_eq!(list[1].dip, Rect::new(1920.0, 0.0, 1920.0, 1080.0));
        assert_eq!(list[0].dip_work.height, 1040.0);
        let m = list[1];
        assert_eq!(m.to_dip(Point::new(2920.0, 200.0)), Point::new(2420.0, 100.0));
        assert_eq!(m.to_phys(Point::new(2420.0, 100.0)), Point::new(2920.0, 200.0));
        let left = lay_out(&[
            (Rect::new(0.0, 0.0, 2880.0, 1800.0), Rect::new(0.0, 0.0, 2880.0, 1752.0), 1.5, true),
            (Rect::new(-1920.0, 0.0, 1920.0, 1080.0), Rect::new(-1920.0, 0.0, 1920.0, 1080.0), 1.0, false),
        ]);
        assert_eq!(left[0].dip, Rect::new(0.0, 0.0, 1920.0, 1200.0));
        assert_eq!(left[1].dip.x, -1920.0);
    }
}
