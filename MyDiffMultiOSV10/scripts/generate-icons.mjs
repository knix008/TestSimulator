// Draws the MyDiff app icon and writes the per-platform files electron-builder expects:
// build/icon.ico (Windows), build/icon.png (macOS/Linux, 1024px) and build/icons/*.png
// (Linux icon set). Ported from the retired Assets/GenerateIcon.cs so the icon stays
// reproducible without .NET or a native image library — everything here is plain Node.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const iconsDir = path.join(buildDir, "icons");

/* ---------------- a tiny signed-distance rasterizer ---------------- */

/** Straight-alpha RGBA canvas. Shapes are drawn as signed distance fields, so the
 *  antialiasing comes from the distance itself rather than from supersampling. */
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

  /** Outlines a shape by keeping the band |distance| < width / 2. */
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

const rgb = (r, g, b, a = 1) => [r / 255, g / 255, b / 255, a];
const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
const round255 = (value) => Math.round(clamp(value, 0, 1) * 255);

/* ---------------- the icon itself ---------------- */

// Two columns (left/right file) joined by coloured diff ticks — the app's 2-way
// line diff, drawn in a 256-unit space and scaled to whatever size is requested.
function drawIcon(size) {
  const canvas = new Canvas(size);
  const k = size / 256;
  const s = (value) => value * k;

  const box = { x: s(14), y: s(14), w: s(228), h: s(228), r: s(52) };
  const background = roundedRect(box.x, box.y, box.w, box.h, box.r);
  canvas.fill(background, gradient(box.x, box.y, box.w, box.h, rgb(45, 55, 72), rgb(17, 24, 39), "diagonal"));
  canvas.stroke(background, Math.max(s(2), 1), solid(rgb(255, 255, 255, 70 / 255)));

  const gloss = { x: box.x + s(8), y: box.y + s(8), w: box.w - s(16), h: box.h * 0.38 };
  canvas.fill(
    roundedRect(gloss.x, gloss.y, gloss.w, gloss.h, s(36)),
    gradient(gloss.x, gloss.y, gloss.w, gloss.h, rgb(255, 255, 255, 60 / 255), rgb(255, 255, 255, 0), "vertical"),
  );

  const barWidth = s(34);
  const top = s(50);
  const bottom = s(206);
  const leftX = s(78);
  const rightX = s(178);

  canvas.fill(roundedRect(leftX - barWidth / 2, top, barWidth, bottom - top, s(14)), solid(rgb(148, 163, 184)));
  canvas.fill(roundedRect(rightX - barWidth / 2, top, barWidth, bottom - top, s(14)), solid(rgb(96, 165, 250)));

  const tickLeft = leftX + barWidth / 2 - s(2);
  const tickRight = rightX - barWidth / 2 + s(2);
  const ticks = [
    [s(84), rgb(248, 113, 113)],  // removed
    [s(128), rgb(251, 191, 36)],  // modified
    [s(172), rgb(74, 222, 128)],  // added
  ];
  for (const [y, color] of ticks) {
    canvas.fill(roundedRect(tickLeft, y - s(8), tickRight - tickLeft, s(16), s(8)), solid(color));
  }

  // Faint "line" marks on both columns, skipped at small sizes where they only smear.
  if (size >= 48) {
    const divider = solid(rgb(255, 255, 255, 90 / 255));
    const width = Math.max(s(3), 1);
    for (let y = top + s(14); y < bottom - s(10); y += s(22)) {
      canvas.fill(capsule(leftX - s(8), y, leftX + s(8), y, width), divider);
      canvas.fill(capsule(rightX - s(8), y, rightX + s(8), y, width), divider);
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
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
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

/** PNG-compressed ICO, the same layout the old C# generator produced. */
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
    directory.writeUInt16LE(1, at + 4);   // colour planes
    directory.writeUInt16LE(32, at + 6);  // bits per pixel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

/* ---------------- output ---------------- */

const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512];

fs.mkdirSync(iconsDir, { recursive: true });
const rendered = new Map();
const render = (size) => {
  if (!rendered.has(size)) rendered.set(size, png(drawIcon(size)));
  return rendered.get(size);
};

fs.writeFileSync(path.join(buildDir, "icon.ico"), ico(ICO_SIZES.map((size) => ({ size, data: render(size) }))));
fs.writeFileSync(path.join(buildDir, "icon.png"), render(1024));
for (const size of LINUX_SIZES) {
  fs.writeFileSync(path.join(iconsDir, `${size}x${size}.png`), render(size));
}
// The renderer serves the web/dev build too, so both copies stay in step.
fs.writeFileSync(path.join(root, "public", "icon.png"), render(256));

console.log(`icons  build/icon.ico (${ICO_SIZES.join(", ")})  build/icon.png (1024)  build/icons/ (${LINUX_SIZES.join(", ")})  public/icon.png (256)`);
