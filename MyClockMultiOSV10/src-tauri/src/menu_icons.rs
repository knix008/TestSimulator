//! 트레이 메뉴 아이콘.
//! 글자 앞에 기호를 붙이는 대신, 항목 왼쪽 칸에 들어가는 그림으로 만든다.
//! (Electron 판 electron/menu-icons.js 의 이식 — 같은 16×16 그림)

use std::f64::consts::PI;

pub const SIZE: usize = 16;
const INK: [u8; 4] = [91, 140, 250, 255];

/// 그릴 수 있는 아이콘 이름 (검사가 모두 그려 본다).
#[cfg_attr(not(test), allow(dead_code))]
pub const ICON_NAMES: [&str; 17] = [
  "open", "settings", "add", "clock", "world", "close", "system", "pin", "startup", "reset", "alarm", "timer", "stopwatch", "calendar", "info",
  "quit", "restore",
];

/// JavaScript 의 Math.round — .5 는 언제나 위로.
fn js_round(v: f64) -> i32 {
  (v + 0.5).floor() as i32
}

struct Canvas(Vec<u8>);

impl Canvas {
  fn plot(&mut self, x: f64, y: f64) {
    let (x, y) = (js_round(x), js_round(y));
    if x < 0 || y < 0 || x >= SIZE as i32 || y >= SIZE as i32 {
      return;
    }
    let i = (y as usize * SIZE + x as usize) * 4;
    self.0[i..i + 4].copy_from_slice(&INK);
  }

  fn line(&mut self, x0: f64, y0: f64, x1: f64, y1: f64) {
    let (mut ix, mut iy) = (js_round(x0), js_round(y0));
    let (tx, ty) = (js_round(x1), js_round(y1));
    let dx = (tx - ix).abs();
    let dy = (ty - iy).abs();
    let sx = if ix < tx { 1 } else { -1 };
    let sy = if iy < ty { 1 } else { -1 };
    let mut err = dx - dy;
    loop {
      self.plot(ix as f64, iy as f64);
      if ix == tx && iy == ty {
        break;
      }
      let e2 = 2 * err;
      if e2 > -dy {
        err -= dy;
        ix += sx;
      }
      if e2 < dx {
        err += dx;
        iy += sy;
      }
    }
  }

  fn circle(&mut self, cx: f64, cy: f64, r: f64) {
    let mut x = js_round(r) as f64;
    let mut y = 0.0;
    let mut err = 1.0 - x;
    while x >= y {
      for (px, py) in [(x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)] {
        self.plot(cx + px, cy + py);
      }
      y += 1.0;
      if err < 0.0 {
        err += 2.0 * y + 1.0;
      } else {
        x -= 1.0;
        err += 2.0 * (y - x) + 1.0;
      }
    }
  }

  fn fill_circle(&mut self, cx: f64, cy: f64, r: f64) {
    let rad = js_round(r);
    for y in -rad..=rad {
      let span = js_round(((rad * rad - y * y) as f64).sqrt());
      for x in -span..=span {
        self.plot(cx + x as f64, cy + y as f64);
      }
    }
  }

  fn fill_rect(&mut self, x: f64, y: f64, w: f64, h: f64) {
    let mut yy = y;
    while yy < y + h {
      let mut xx = x;
      while xx < x + w {
        self.plot(xx, yy);
        xx += 1.0;
      }
      yy += 1.0;
    }
  }

  fn stroke_rect(&mut self, x: f64, y: f64, w: f64, h: f64) {
    self.line(x, y, x + w - 1.0, y);
    self.line(x, y + h - 1.0, x + w - 1.0, y + h - 1.0);
    self.line(x, y, x, y + h - 1.0);
    self.line(x + w - 1.0, y, x + w - 1.0, y + h - 1.0);
  }

  fn ellipse(&mut self, cx: f64, cy: f64, rx: f64, ry: f64) {
    let mut a = 0.0;
    while a < PI * 2.0 {
      self.plot(cx + a.cos() * rx, cy + a.sin() * ry);
      a += 0.18;
    }
  }
}

/// 아이콘 이름 → 16×16 RGBA. 모르는 이름이면 None.
pub fn render_rgba(name: &str) -> Option<Vec<u8>> {
  let mut c = Canvas(vec![0; SIZE * SIZE * 4]);
  match name {
    "open" => {
      c.stroke_rect(2.0, 3.0, 12.0, 10.0);
      c.line(2.0, 6.0, 13.0, 6.0);
      c.line(8.0, 8.0, 8.0, 11.0);
      c.line(6.0, 9.0, 8.0, 11.0);
      c.line(10.0, 9.0, 8.0, 11.0);
    }
    "settings" => {
      c.circle(8.0, 8.0, 2.0);
      c.circle(8.0, 8.0, 4.0);
      for i in 0..8 {
        let a = PI * i as f64 / 4.0;
        c.line(8.0 + a.cos() * 4.0, 8.0 + a.sin() * 4.0, 8.0 + a.cos() * 7.0, 8.0 + a.sin() * 7.0);
      }
    }
    "add" => {
      c.line(8.0, 3.0, 8.0, 13.0);
      c.line(3.0, 8.0, 13.0, 8.0);
      c.line(7.0, 3.0, 7.0, 13.0);
      c.line(3.0, 7.0, 13.0, 7.0);
    }
    "clock" => {
      c.circle(8.0, 8.0, 6.0);
      c.line(8.0, 8.0, 8.0, 4.0);
      c.line(8.0, 8.0, 11.0, 10.0);
      c.plot(8.0, 8.0);
    }
    "world" => {
      c.circle(8.0, 8.0, 6.0);
      c.line(2.0, 8.0, 14.0, 8.0);
      c.ellipse(8.0, 8.0, 3.0, 6.0);
    }
    "close" => {
      c.line(4.0, 4.0, 12.0, 12.0);
      c.line(12.0, 4.0, 4.0, 12.0);
      c.line(4.0, 5.0, 11.0, 12.0);
      c.line(5.0, 4.0, 12.0, 11.0);
    }
    "system" => {
      c.line(3.0, 4.0, 13.0, 4.0);
      c.line(3.0, 8.0, 13.0, 8.0);
      c.line(3.0, 12.0, 13.0, 12.0);
      c.fill_rect(5.0, 3.0, 3.0, 3.0);
      c.fill_rect(9.0, 7.0, 3.0, 3.0);
      c.fill_rect(6.0, 11.0, 3.0, 3.0);
    }
    "pin" => {
      c.line(8.0, 7.0, 8.0, 14.0);
      c.fill_circle(8.0, 5.0, 3.0);
    }
    "startup" => {
      let mut a = 0.9;
      while a < PI * 2.0 - 0.2 {
        let t = a - PI / 2.0;
        c.plot(8.0 + t.cos() * 5.0, 8.0 + t.sin() * 5.0);
        c.plot(8.0 + t.cos() * 6.0, 8.0 + t.sin() * 6.0);
        a += 0.22;
      }
      c.line(8.0, 2.0, 8.0, 8.0);
      c.line(7.0, 2.0, 7.0, 8.0);
    }
    "reset" => {
      // 되돌리는 화살표
      let mut a = 0.4;
      while a < PI * 1.7 {
        c.plot(8.0 + a.cos() * 5.0, 8.0 + a.sin() * 5.0);
        a += 0.15;
      }
      c.line(3.0, 6.0, 3.0, 10.0);
      c.line(3.0, 10.0, 6.0, 10.0);
    }
    "alarm" => {
      c.circle(8.0, 9.0, 4.0);
      c.line(4.0, 13.0, 12.0, 13.0);
      c.line(8.0, 3.0, 8.0, 5.0);
      c.line(5.0, 4.0, 3.0, 2.0);
      c.line(11.0, 4.0, 13.0, 2.0);
    }
    "timer" => {
      c.circle(8.0, 9.0, 5.0);
      c.line(8.0, 9.0, 8.0, 6.0);
      c.line(8.0, 9.0, 11.0, 9.0);
      c.line(6.0, 2.0, 10.0, 2.0);
    }
    "stopwatch" => {
      c.fill_rect(7.0, 1.0, 2.0, 2.0);
      c.circle(8.0, 9.0, 5.0);
      c.line(8.0, 9.0, 8.0, 6.0);
      c.line(5.0, 1.0, 4.0, 3.0);
      c.line(11.0, 1.0, 12.0, 3.0);
    }
    "calendar" => {
      c.stroke_rect(2.0, 3.0, 12.0, 11.0);
      c.line(2.0, 6.0, 13.0, 6.0);
      c.line(5.0, 2.0, 5.0, 4.0);
      c.line(10.0, 2.0, 10.0, 4.0);
      for (x, y) in [(5.0, 9.0), (8.0, 9.0), (11.0, 9.0), (5.0, 11.0), (8.0, 11.0)] {
        c.plot(x, y);
      }
    }
    "info" => {
      c.circle(8.0, 8.0, 6.0);
      c.fill_rect(7.0, 4.0, 2.0, 2.0);
      c.fill_rect(7.0, 7.0, 2.0, 5.0);
    }
    "quit" => {
      c.circle(8.0, 8.0, 6.0);
      c.line(8.0, 3.0, 8.0, 8.0);
      c.line(7.0, 3.0, 7.0, 8.0);
    }
    "restore" => {
      c.stroke_rect(5.0, 5.0, 8.0, 8.0);
      c.line(3.0, 3.0, 10.0, 3.0);
      c.line(3.0, 3.0, 3.0, 10.0);
      c.line(3.0, 10.0, 5.0, 10.0);
      c.line(10.0, 3.0, 10.0, 5.0);
    }
    _ => return None,
  }
  Some(c.0)
}

/// 고해상도 화면용으로 픽셀을 그대로 키운다 (흐려지지 않게).
pub fn scale(rgba: &[u8], factor: usize) -> Vec<u8> {
  let next = SIZE * factor;
  let mut out = vec![0; next * next * 4];
  for y in 0..SIZE {
    for x in 0..SIZE {
      let src = (y * SIZE + x) * 4;
      for dy in 0..factor {
        for dx in 0..factor {
          let dst = ((y * factor + dy) * next + (x * factor + dx)) * 4;
          out[dst..dst + 4].copy_from_slice(&rgba[src..src + 4]);
        }
      }
    }
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn every_icon_draws_something_inside_16px() {
    for name in ICON_NAMES {
      let px = render_rgba(name).unwrap();
      assert_eq!(px.len(), SIZE * SIZE * 4);
      let inked = px.chunks(4).filter(|p| p[3] > 0).count();
      assert!(inked > 6, "{name}: 그린 점이 너무 적다 ({inked})");
    }
    assert!(render_rgba("없는 아이콘").is_none());
  }

  #[test]
  fn scaling_keeps_pixels_sharp() {
    let px = render_rgba("clock").unwrap();
    let big = scale(&px, 2);
    assert_eq!(big.len(), 32 * 32 * 4);
    assert_eq!(big.chunks(4).filter(|p| p[3] > 0).count(), px.chunks(4).filter(|p| p[3] > 0).count() * 4);
  }
}
