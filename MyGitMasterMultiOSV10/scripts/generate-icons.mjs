// Draws the application icon into assets/, the one folder that holds every icon the
// program uses:
//
//   assets/icon.png         the app icon (1024): window, menu bar, About, favicon
//   assets/icon.ico         Windows exe, taskbar, installer and uninstaller
//   assets/icon.icns        macOS bundle
//   assets/icons/*.png      the sizes the Tauri bundle and Linux want
//
// src-tauri/tauri.conf.json and the UI (src/appIcon.ts) read them from there. Run
// `npm run icons` after changing the drawing; the results are committed.
//
// Everything here is plain Node: a small signed-distance rasteriser, a PNG encoder and
// an ICO writer. No native image library, so the icons rebuild identically everywhere.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "assets");
const iconsDir = path.join(assetsDir, "icons");

/* ---------------- a tiny signed-distance rasteriser ---------------- */

/**
 * Straight-alpha RGBA canvas. Shapes are signed distance fields, so the antialiasing
 * falls out of the distance rather than out of supersampling, and the edge stays clean
 * at 16px where an icon usually falls apart.
 */
class Canvas {
  constructor(size) {
    this.size = size;
    this.data = new Float64Array(size * size * 4);
  }

  /** `shape(x, y)` returns the signed distance in pixels (negative = inside). */
  fill(shape, paint) {
    const { size, data } = this;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const coverage = clamp(0.5 - shape(px, py), 0, 1);
        if (coverage <= 0) continue;
        const [r, g, b, a] = paint(px, py);
        const alpha = a * coverage;
        if (alpha <= 0) continue;
        const i = (y * size + x) * 4;
        const inv = 1 - alpha;
        data[i] = r * alpha + data[i] * inv;
        data[i + 1] = g * alpha + data[i + 1] * inv;
        data[i + 2] = b * alpha + data[i + 2] * inv;
        data[i + 3] = alpha + data[i + 3] * inv;
      }
    }
  }

  /** Paints inside `shape` only — used for highlights that must not escape the body. */
  fillClipped(shape, clip, paint) {
    this.fill((x, y) => Math.max(shape(x, y), clip(x, y)), paint);
  }

  stroke(shape, width, paint) {
    this.fill((x, y) => Math.abs(shape(x, y)) - width / 2, paint);
  }

  bytes() {
    const { size, data } = this;
    const out = Buffer.alloc(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      // Un-premultiply: the canvas accumulates premultiplied colour.
      const scale = a > 0 ? 1 / a : 0;
      out[i] = round255(data[i] * scale);
      out[i + 1] = round255(data[i + 1] * scale);
      out[i + 2] = round255(data[i + 2] * scale);
      out[i + 3] = round255(a);
    }
    return out;
  }
}

function roundedRect(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const hx = w / 2 - r;
  const hy = h / 2 - r;
  return (px, py) => {
    const dx = Math.abs(px - cx) - hx;
    const dy = Math.abs(py - cy) - hy;
    const ox = Math.max(dx, 0);
    const oy = Math.max(dy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
  };
}

/** Round-capped line, as a capsule distance field. */
function capsule(x1, y1, x2, y2, width) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lengthSquared = vx * vx + vy * vy || 1;
  return (px, py) => {
    const t = clamp(((px - x1) * vx + (py - y1) * vy) / lengthSquared, 0, 1);
    return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t)) - width / 2;
  };
}

/**
 * A filled triangle, as the intersection of three half-planes.
 *
 * The vertices must wind clockwise on screen (y grows downwards); the other winding
 * produces an empty shape rather than an error, which is an easy way to draw nothing
 * by accident.
 */
function triangle(ax, ay, bx, by, cx, cy) {
  const edge = (x1, y1, x2, y2) => {
    const ex = x2 - x1;
    const ey = y2 - y1;
    const length = Math.hypot(ex, ey) || 1;
    return (px, py) => ((px - x1) * ey - (py - y1) * ex) / length;
  };
  const e1 = edge(ax, ay, bx, by);
  const e2 = edge(bx, by, cx, cy);
  const e3 = edge(cx, cy, ax, ay);
  return (px, py) => Math.max(e1(px, py), e2(px, py), e3(px, py));
}

const solid = (color) => () => color;

/** `direction` is "diagonal" (top-left → bottom-right) or "vertical". */
function gradient(x, y, w, h, from, to, direction) {
  return (px, py) => {
    const t = direction === "vertical"
      ? clamp((py - y) / h, 0, 1)
      : clamp(((px - x) + (py - y)) / (w + h), 0, 1);
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
      from[3] + (to[3] - from[3]) * t,
    ];
  };
}

/**
 * The slab's own edge, shaded by which way it faces: what turns a flat sticker into
 * something with a thickness to it.
 *
 * A distance field knows more than where its edge is — the direction the distance
 * grows in *is* the outward normal of that edge, and it can be read straight off the
 * field by sampling either side of the point. So the lighting here is real shading
 * rather than a painted-on outline: the part of the rim that faces the lamp catches
 * it, the part facing away falls into shade, and the two sides of the slab in between
 * pass through untouched.
 *
 * That last part is the whole difference between depth and a border. A bevel of even
 * strength all the way round reads as a drawn line, so this one is signed: it only
 * ever lightens the edges that face the light and darkens the ones that face away.
 *
 * `width` is how far in from the edge the bevel reaches, in pixels.
 */
function bevel(shape, width, { lit = 0.5, shade = 0.42, light = [-0.7071, -0.7071] } = {}) {
  return (px, py) => {
    const depth = -shape(px, py);
    if (depth < 0 || depth > width) return [0, 0, 0, 0];

    // The outward normal, from the field itself. A half-pixel step is small enough
    // to stay on one edge at the corners and large enough not to be lost in rounding.
    const nx = shape(px + 0.5, py) - shape(px - 0.5, py);
    const ny = shape(px, py + 0.5) - shape(px, py - 0.5);
    const length = Math.hypot(nx, ny);
    if (length === 0) return [0, 0, 0, 0];

    const facing = ((nx / length) * light[0] + (ny / length) * light[1]);
    // Brightest right at the edge and gone by `width` in, so the slab's middle keeps
    // whatever colour it was given.
    const falloff = (1 - depth / width) ** 2.2;
    const strength = facing > 0 ? lit : shade;
    const alpha = strength * falloff * Math.abs(facing) ** 1.1;
    return facing > 0 ? [1, 1, 1, alpha] : [0, 0, 0, alpha];
  };
}

/** The specular highlight: brightest at (cx, cy), fading to nothing by `radius`. */
function glow(cx, cy, radius, color, strength) {
  return (px, py) => {
    const distance = Math.hypot(px - cx, py - cy) / radius;
    const falloff = Math.max(0, 1 - distance) ** 2.2;
    return [color[0], color[1], color[2], strength * falloff];
  };
}

const rgb = (r, g, b, a = 1) => [r / 255, g / 255, b / 255, a];
const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
const round255 = (value) => Math.round(clamp(value, 0, 1) * 255);

/* ---------------- the application icon ---------------- */

const circle = (cx, cy, r) => (px, py) => Math.hypot(px - cx, py - cy) - r;

/** Points along a cubic Bézier, for drawing a smooth branch out of capsules. */
function bezier(p0, p1, p2, p3, steps) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return points;
}

/** One distance field for a whole polyline, so overlapping joints don't double-paint. */
function polyline(points, width) {
  const parts = [];
  for (let i = 1; i < points.length; i++) {
    parts.push(capsule(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], width));
  }
  return (px, py) => {
    let best = Infinity;
    for (const part of parts) best = Math.min(best, part(px, py));
    return best;
  };
}

/** Three-stop diagonal gradient: warm coral → magenta → deep violet. */
function vivid(x, y, w, h) {
  const stops = [rgb(255, 138, 76), rgb(236, 72, 153), rgb(99, 60, 230)];
  return (px, py) => {
    const t = clamp(((px - x) + (py - y)) / (w + h), 0, 1);
    const [a, b, u] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], (t - 0.5) * 2];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 1];
  };
}

/**
 * A git branch on a vivid rounded square: a trunk with two commits, a branch that
 * leaves it and comes back, drawn in white with soft depth — flat-modern rather than
 * skeuomorphic, with a glassy highlight across the top. Small sizes drop the
 * highlight and thicken the strokes so the mark survives at 16 px.
 */
function drawAppIcon(size) {
  const canvas = new Canvas(size);
  const k = size / 256;
  const s = (value) => value * k;
  const small = size <= 32;

  const inset = small ? 6 : 14;
  const box = { x: s(inset), y: s(inset), w: s(256 - inset * 2), h: s(256 - inset * 2), r: s(small ? 56 : 58) };
  const body = roundedRect(box.x, box.y, box.w, box.h, box.r);

  // 1. the tile: a soft shadow under it, then the gradient body
  if (!small) canvas.fill(roundedRect(box.x, box.y + s(6), box.w, box.h, box.r), solid(rgb(40, 10, 60, 0.18)));
  canvas.fill(body, vivid(box.x, box.y, box.w, box.h));

  // 2. light: a glow at the top-left and a glassy band across the upper half
  canvas.fillClipped(body, body, glow(box.x + s(40), box.y + s(30), s(170), rgb(255, 255, 255), 0.32));
  if (!small) {
    const glass = (px, py) => Math.max(body(px, py), py - (box.y + box.h * 0.46 + (px - box.x) * -0.18));
    canvas.fill(glass, solid(rgb(255, 255, 255, 0.10)));
    canvas.fill(body, bevel(body, Math.max(s(10), 1.5), { lit: 0.35, shade: 0.3 }));
  }

  // 3. the mark
  const stroke = s(small ? 26 : 19);
  const node = s(small ? 26 : 22);
  const trunkX = s(92);
  const top = [trunkX, s(68)];
  const bottom = [trunkX, s(188)];
  const tip = [s(170), s(98)];
  const branch = bezier([trunkX, s(170)], [trunkX, s(128)], [tip[0], s(150)], tip, 24);
  const trunk = polyline([top, bottom], stroke);
  const arm = polyline(branch, stroke);

  const drawMark = (dx, dy, paint) => {
    const shift = (shape) => (px, py) => shape(px - dx, py - dy);
    canvas.fill(shift(trunk), paint);
    canvas.fill(shift(arm), paint);
    for (const [cx, cy] of [top, bottom, tip]) canvas.fill(shift(circle(cx, cy, node)), paint);
  };
  if (!small) drawMark(s(4), s(6), solid(rgb(50, 0, 80, 0.28)));
  drawMark(0, 0, solid(rgb(255, 255, 255, 1)));

  // 4. coloured commit dots inside the white nodes
  if (!small) {
    const dots = [
      [top, rgb(255, 138, 76)],
      [bottom, rgb(99, 60, 230)],
      [tip, rgb(16, 185, 129)],
    ];
    for (const [[cx, cy], colour] of dots) {
      canvas.fill(circle(cx, cy, node * 0.52), solid(colour));
      canvas.fillClipped(circle(cx, cy, node * 0.52), circle(cx, cy, node * 0.52), glow(cx - node * 0.2, cy - node * 0.25, node * 0.6, rgb(255, 255, 255), 0.5));
    }
  }

  return canvas;
}

/* ---------------- PNG / ICO encoding ---------------- */

function png(canvas) {
  const { size } = canvas;
  const pixels = canvas.bytes();
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const tagged = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tagged), 0);
  return Buffer.concat([head, tagged, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG-compressed ICO: every size in one file, which is what Windows wants. */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach(({ size, data }, index) => {
    const at = index * 16;
    directory[at] = size >= 256 ? 0 : size;
    directory[at + 1] = size >= 256 ? 0 : size;
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

/* ---------------- output ---------------- */

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

const appCache = new Map();
const renderApp = (size) => {
  if (!appCache.has(size)) appCache.set(size, png(drawAppIcon(size)));
  return appCache.get(size);
};

/** An .icns of PNG entries, which every macOS since 10.7 reads. */
function icns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

const write = (name, data) => fs.writeFileSync(path.join(assetsDir, name), data);

fs.mkdirSync(iconsDir, { recursive: true });
for (const name of fs.readdirSync(iconsDir)) fs.rmSync(path.join(iconsDir, name));
write("icon.png", renderApp(1024));
write("icon.ico", ico(ICO_SIZES.map((size) => ({ size, data: renderApp(size) }))));
write("icon.icns", icns([
  { type: "ic07", size: 128 },
  { type: "ic08", size: 256 },
  { type: "ic09", size: 512 },
  { type: "ic10", size: 1024 },
].map(({ type, size }) => ({ type, data: renderApp(size) }))));
for (const size of LINUX_SIZES) write(path.join("icons", `${size}x${size}.png`), renderApp(size));
write(path.join("icons", "128x128@2x.png"), renderApp(256));

console.log(`icons  assets/icon.png (1024)  assets/icon.ico (${ICO_SIZES.join(", ")})  assets/icon.icns  assets/icons/ (${LINUX_SIZES.join(", ")})`);
