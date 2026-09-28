'use strict';

// 아주 작은 그리기 도구. 도형을 거리 함수로 적어 두고 가장자리를 부드럽게 채운다.
// 좌표는 0~1 로 적고 크기를 곱해 쓰므로 어떤 크기로도 같은 그림이 나온다.

function circle(cx, cy, r) {
  return (x, y) => Math.hypot(x - cx, y - cy) - r;
}

function roundRect(cx, cy, hw, hh, r) {
  return (x, y) => {
    const dx = Math.abs(x - cx) - (hw - r);
    const dy = Math.abs(y - cy) - (hh - r);
    const ox = Math.max(dx, 0);
    const oy = Math.max(dy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
  };
}

// 굵은 선. 끝은 둥글다.
function capsule(x1, y1, x2, y2, r) {
  return (x, y) => {
    const px = x - x1;
    const py = y - y1;
    const bx = x2 - x1;
    const by = y2 - y1;
    const len = bx * bx + by * by;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len));
    return Math.hypot(px - bx * t, py - by * t) - r;
  };
}

// 볼록 다각형. points 는 시계 방향. r 을 주면 모서리가 둥글어진다.
function convex(points, r = 0) {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const edges = [];
  for (let i = 0; i < points.length; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey) || 1;
    let nx = ey / len;
    let ny = -ex / len;
    // 꼭짓점 순서를 신경 쓰지 않도록 법선이 늘 바깥을 보게 맞춘다.
    if ((cx - ax) * nx + (cy - ay) * ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    edges.push({ ax, ay, nx, ny });
  }
  return (x, y) => {
    let d = -Infinity;
    for (const e of edges) d = Math.max(d, (x - e.ax) * e.nx + (y - e.ay) * e.ny);
    return d - r;
  };
}

// 도형을 한 점을 중심으로 돌린다. 묻는 점을 반대로 돌려서 본다.
function rotate(shape, cx, cy, degrees) {
  const a = (-degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return shape(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
  };
}

const union = (...shapes) => (x, y) => Math.min(...shapes.map((s) => s(x, y)));
const intersect = (...shapes) => (x, y) => Math.max(...shapes.map((s) => s(x, y)));
const subtract = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));
const outline = (shape, w) => (x, y) => Math.abs(shape(x, y)) - w;

// 색은 [r,g,b] 또는 [r,g,b,a] 이고, 자리마다 달라져야 하면 함수로 준다.
function toPaint(color) {
  if (typeof color === 'function') return color;
  return () => color;
}

function mix(from, to, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k,
    (from[3] === undefined ? 1 : from[3]) + ((to[3] === undefined ? 1 : to[3]) - (from[3] === undefined ? 1 : from[3])) * k,
  ];
}

// 한 방향으로 흐르는 색. (x1,y1) 에서 (x2,y2) 로 간다.
function linear(x1, y1, x2, y2, from, to) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy || 1;
  return (x, y) => mix(from, to, ((x - x1) * dx + (y - y1) * dy) / len);
}

// 한 점에서 퍼지는 색.
function radial(cx, cy, r, from, to) {
  return (x, y) => mix(from, to, Math.hypot(x - cx, y - cy) / (r || 1));
}

function canvas(size) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const px = 1 / size; // 0~1 좌표에서 픽셀 하나의 크기

  function fill(shape, color, alpha = 1) {
    const paint = toPaint(color);
    for (let iy = 0; iy < size; iy += 1) {
      for (let ix = 0; ix < size; ix += 1) {
        const x = (ix + 0.5) / size;
        const y = (iy + 0.5) / size;
        const d = shape(x, y);
        const tone = paint(x, y);
        const [r, g, b] = tone;
        const own = tone[3] === undefined ? 1 : tone[3];
        const cover = Math.max(0, Math.min(1, 0.5 - d / px)) * alpha * own;
        if (cover <= 0) continue;
        const o = (iy * size + ix) * 4;
        const dst = rgba[o + 3] / 255;
        const out = cover + dst * (1 - cover);
        if (out <= 0) continue;
        rgba[o] = (r * cover + rgba[o] * dst * (1 - cover)) / out;
        rgba[o + 1] = (g * cover + rgba[o + 1] * dst * (1 - cover)) / out;
        rgba[o + 2] = (b * cover + rgba[o + 2] * dst * (1 - cover)) / out;
        rgba[o + 3] = out * 255;
      }
    }
  }

  return { size, rgba, fill };
}

module.exports = { canvas, circle, roundRect, capsule, convex, rotate, union, intersect, subtract, outline, linear, radial, mix };
