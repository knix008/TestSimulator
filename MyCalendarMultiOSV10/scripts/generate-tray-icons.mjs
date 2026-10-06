import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src-tauri", "icons", "tray");

// Shapes are signed distance functions in a 24x24 design space (negative = inside).
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  const hx = (x1 - x0) / 2 - r;
  const hy = (y1 - y0) / 2 - r;
  const dx = Math.abs(x - (x0 + x1) / 2) - hx;
  const dy = Math.abs(y - (y0 + y1) / 2) - hy;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

const segment = (ax, ay, bx, by, width) => (x, y) => {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - ax - vx * t, y - ay - vy * t) - width / 2;
};

const ring = (shape, width) => (x, y) => Math.abs(shape(x, y)) - width / 2;
const union = (...shapes) => (x, y) => Math.min(...shapes.map((shape) => shape(x, y)));
const subtract = (shape, cut) => (x, y) => Math.max(shape(x, y), -cut(x, y));
const intersect = (a, b) => (x, y) => Math.max(a(x, y), b(x, y));

const BLUE = [61, 125, 255];
const SLATE = [112, 126, 148];
const RED = [229, 72, 77];
const GREEN = [32, 164, 110];
const WHITE = [255, 255, 255];
const UK_BLUE = [1, 33, 105];
const UK_RED = [200, 16, 46];
const KR_RED = [205, 46, 58];
const KR_BLUE = [0, 71, 160];
const BLACK = [20, 20, 20];
const EDGE = [150, 158, 170];

// Both flags share a 3:2 field so the menu column stays aligned.
const FLAG = roundRect(1.5, 5, 22.5, 19, 1.4);
const FLAG_INNER = roundRect(2.1, 5.6, 21.9, 18.4, 0.9);
const clip = (shape) => intersect(shape, FLAG);
const halfPlane = (nx, ny, cx, cy) => (x, y) => (x - cx) * nx + (y - cy) * ny;

const ukFlag = [
  [UK_BLUE, FLAG],
  [WHITE, clip(union(segment(1.5, 5, 22.5, 19, 3.6), segment(1.5, 19, 22.5, 5, 3.6)))],
  [UK_RED, clip(union(segment(1.5, 5, 22.5, 19, 1.3), segment(1.5, 19, 22.5, 5, 1.3)))],
  [WHITE, clip(union(segment(12, 0, 12, 24, 4.6), segment(0, 12, 24, 12, 4.6)))],
  [UK_RED, clip(union(segment(12, 0, 12, 24, 2.6), segment(0, 12, 24, 12, 2.6)))],
];

function koreanFlag() {
  const angle = Math.atan2(14, 21);
  const d = [Math.cos(angle), Math.sin(angle)];
  const up = [Math.sin(angle), -Math.cos(angle)];
  const radius = 3.6;
  const disk = circle(12, 12, radius);
  const red = intersect(
    disk,
    subtract(
      union(halfPlane(-up[0], -up[1], 12, 12), circle(12 - d[0] * radius / 2, 12 - d[1] * radius / 2, radius / 2)),
      circle(12 + d[0] * radius / 2, 12 + d[1] * radius / 2, radius / 2),
    ),
  );

  // Each trigram is three bars across its diagonal; a broken bar loses its middle.
  const trigram = (axis, distance, pattern) => {
    const across = [-axis[1], axis[0]];
    const bars = pattern.map((broken, index) => {
      const offset = distance + (index - 1) * 1.25;
      const cx = 12 + axis[0] * offset;
      const cy = 12 + axis[1] * offset;
      const half = 1.9;
      const bar = segment(cx - across[0] * half, cy - across[1] * half, cx + across[0] * half, cy + across[1] * half, 0.85);
      return broken ? subtract(bar, circle(cx, cy, 0.45)) : bar;
    });
    return union(...bars);
  };
  const other = [Math.cos(angle), -Math.sin(angle)];
  return [
    [EDGE, FLAG],
    [WHITE, FLAG_INNER],
    [KR_BLUE, disk],
    [KR_RED, red],
    [BLACK, union(
      trigram([-d[0], -d[1]], 6.4, [false, false, false]),
      trigram(d, 6.4, [true, true, true]),
      trigram(other, 6.4, [true, false, true]),
      trigram([-other[0], -other[1]], 6.4, [false, true, false]),
    )],
  ];
}

const icons = {
  show: [
    [BLUE, union(
      ring(roundRect(3.5, 5, 20.5, 20.5, 3), 1.9),
      intersect(roundRect(3.5, 5, 20.5, 20.5, 3), (x, y) => y - 9.5),
      segment(8, 2.8, 8, 6.5, 2),
      segment(16, 2.8, 16, 6.5, 2),
      circle(8.5, 13.2, 1.3),
      circle(12, 13.2, 1.3),
      circle(15.5, 13.2, 1.3),
      circle(8.5, 16.8, 1.3),
      circle(12, 16.8, 1.3),
    )],
  ],
  settings: [
    [SLATE, subtract(
      union(
        circle(12, 12, 6.6),
        ...Array.from({ length: 8 }, (_, index) => {
          const angle = (index * Math.PI) / 4;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return segment(12 + cos * 6, 12 + sin * 6, 12 + cos * 8.6, 12 + sin * 8.6, 3.4);
        }),
      ),
      circle(12, 12, 2.9),
    )],
  ],
  events: [
    [GREEN, roundRect(3.5, 3.5, 20.5, 20.5, 3.2)],
    [WHITE, union(
      circle(7.8, 8.6, 1.25),
      circle(7.8, 12, 1.25),
      circle(7.8, 15.4, 1.25),
      segment(10.8, 8.6, 17, 8.6, 1.9),
      segment(10.8, 12, 17, 12, 1.9),
      segment(10.8, 15.4, 15, 15.4, 1.9),
    )],
  ],
  print: [
    [SLATE, union(
      roundRect(2.5, 8, 21.5, 17.5, 2.2),
      ring(roundRect(6.5, 3, 17.5, 9, 1), 1.8),
    )],
    [WHITE, roundRect(6.5, 13.5, 17.5, 21.5, 1)],
    [SLATE, union(
      ring(roundRect(6.5, 13.5, 17.5, 21.5, 1), 1.6),
      segment(9, 16.5, 15, 16.5, 1.3),
      segment(9, 19, 13.5, 19, 1.3),
    )],
    [GREEN, circle(18, 11, 1.1)],
  ],
  about: [
    [BLUE, circle(12, 12, 9.6)],
    [WHITE, union(circle(12, 7.4, 1.5), segment(12, 11, 12, 16.8, 2.6))],
  ],
  quit: [
    [RED, union(
      intersect(
        ring(circle(12, 13, 7.4), 2.4),
        (x, y) => {
          const angle = Math.atan2(x - 12, -(y - 13));
          return 0.75 - Math.abs(angle);
        },
      ),
      segment(12, 3.2, 12, 11.4, 2.4),
    )],
  ],
  "flag-uk": ukFlag,
  "flag-kr": koreanFlag(),
};

function render(layers, size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 6;
  const scale = 24 / size;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = (px + (sx + 0.5) / samples) * scale;
          const y = (py + (sy + 0.5) / samples) * scale;
          let color = null;
          for (const [fill, shape] of layers) {
            if (shape(x, y) <= 0) color = fill;
          }
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          a += 1;
        }
      }
      const index = (py * size + px) * 4;
      if (a === 0) continue;
      pixels[index] = Math.round(r / a);
      pixels[index + 1] = Math.round(g / a);
      pixels[index + 2] = Math.round(b / a);
      pixels[index + 3] = Math.round((a / (samples * samples)) * 255);
    }
  }
  return encodePng(size, pixels);
}

fs.mkdirSync(outDir, { recursive: true });
for (const [name, layers] of Object.entries(icons)) {
  for (const size of [16, 32, 64]) {
    fs.writeFileSync(path.join(outDir, `${name}-${size}.png`), render(layers, size));
  }
}
console.log(`wrote tray menu and window icons to ${path.relative(root, outDir)}`);
