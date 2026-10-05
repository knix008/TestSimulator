const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outDir = path.join(__dirname, "..", "assets");

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = paint(x, y, size);
      const at = row + 1 + x * 4;
      raw[at] = color[0];
      raw[at + 1] = color[1];
      raw[at + 2] = color[2];
      raw[at + 3] = color[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inRound(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  const cx = Math.min(Math.max(x, left + radius), left + width - radius);
  const cy = Math.min(Math.max(y, top + radius), top + height - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function roundSdf(nx, ny, left, top, width, height, radius) {
  const hx = width / 2 - radius;
  const hy = height / 2 - radius;
  const qx = Math.abs(nx - (left + width / 2)) - hx;
  const qy = Math.abs(ny - (top + height / 2)) - hy;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

function mix(from, to, t) {
  const amount = Math.min(1, Math.max(0, t));
  return from.map((value, index) => Math.round(value + (to[index] - value) * amount));
}

function gloss(nx, ny, originX, originY, reach) {
  const dist = Math.hypot((nx - originX) / reach, (ny - originY) / (reach * 1.15));
  return Math.max(0, 1 - dist) ** 2;
}

function edgeLight(nx, ny, left, top, width, height, radius, band) {
  const sdf = roundSdf(nx, ny, left, top, width, height, radius);
  if (sdf > 0 || sdf < -band) return 0;
  const cx = Math.min(Math.max(nx, left + radius), left + width - radius);
  const cy = Math.min(Math.max(ny, top + radius), top + height - radius);
  const len = Math.hypot(nx - cx, ny - cy) || 1;
  const ndotl = (-(nx - cx) - (ny - cy)) / (len * Math.SQRT2);
  return (1 + sdf / band) * ndotl;
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const PLATE_STOPS = [
  [0.00, [100, 104, 244, 255]],
  [0.35, [70, 122, 244, 255]],
  [0.60, [50, 112, 226, 255]],
  [1.00, [30, 68, 180, 255]],
];
const LINE_WHITE = [255, 255, 255, 255];
const NODE_FILL = [254, 243, 199, 255];
const NODE_RING = [251, 191, 36, 255];

const GLYPH_NODES = [
  { x: 0.29, y: 0.25, tone: "white" },
  { x: 0.71, y: 0.25, tone: "amber" },
  { x: 0.50, y: 0.77, tone: "amber" },
];

const GLYPH_EDGES = [
  { ax: 0.29, ay: 0.25, bx: 0.50, by: 0.55, tone: "white" },
  { ax: 0.71, ay: 0.25, bx: 0.50, by: 0.55, tone: "amber" },
  { ax: 0.50, ay: 0.55, bx: 0.50, by: 0.77, tone: "amber" },
];

function mergeGlyph(nx, ny, box) {
  const gx = (nx - box.left) / box.size;
  const gy = (ny - box.top) / box.size;
  if (gx < -0.1 || gy < -0.1 || gx > 1.1 || gy > 1.1) return null;
  for (let i = 0; i < GLYPH_NODES.length; i += 1) {
    const dot = GLYPH_NODES[i];
    const dist = Math.hypot(gx - dot.x, gy - dot.y);
    if (dist > box.node) continue;
    if (dot.tone === "white") return LINE_WHITE;
    return dist > box.node - box.ring ? NODE_RING : NODE_FILL;
  }
  for (let i = 0; i < GLYPH_EDGES.length; i += 1) {
    const line = GLYPH_EDGES[i];
    if (distSeg(gx, gy, line.ax, line.ay, line.bx, line.by) > box.edge) continue;
    return line.tone === "white" ? LINE_WHITE : NODE_RING;
  }
  return null;
}

function ramp(stops, t) {
  const amount = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i += 1) {
    if (amount > stops[i][0] && i < stops.length - 1) continue;
    const from = stops[i - 1];
    const to = stops[i];
    const span = to[0] - from[0] || 1;
    return mix(from[1], to[1], (amount - from[0]) / span);
  }
  return stops[stops.length - 1][1];
}

function shadePlate(nx, ny, left, top, width, height, radius, stops) {
  const u = (nx - left) / width;
  const v = (ny - top) / height;
  let color = ramp(stops, (u + v) / 2);
  const inset = Math.min(1, Math.max(0, -roundSdf(nx, ny, left, top, width, height, radius) / 0.05));
  const band = Math.min(1, Math.max(0, (0.38 - v) / 0.26));
  color = mix(color, [255, 255, 255, 255], band * inset * 0.40);
  const rim = edgeLight(nx, ny, left, top, width, height, radius, 0.015);
  if (rim > 0) color = mix(color, [255, 255, 255, 255], rim * 0.14);
  return color;
}

const APP_PLATE = { left: 0.055, top: 0.055, width: 0.89, height: 0.89, radius: 0.198 };
const APP_GLYPH = { left: 0, top: 0, size: 1, edge: 0.030, node: 0.066, ring: 0.013 };

function sampleApp(nx, ny) {
  if (nx < 0.05 || ny < 0.05 || nx > 0.95 || ny > 0.95) return [0, 0, 0, 0];
  const plate = APP_PLATE;
  if (!inRound(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius)) return [0, 0, 0, 0];
  const color = shadePlate(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius, PLATE_STOPS);
  return mergeGlyph(nx, ny, APP_GLYPH) || color;
}

const MERGE_GLYPHS = {
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  e: [0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
  r: [0b00000, 0b00000, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000],
  g: [0b00000, 0b00000, 0b01110, 0b10001, 0b01111, 0b00001, 0b01110],
};

function mergeWord(nx, ny) {
  const word = "Merge";
  const cols = 5;
  const rows = 7;
  const gap = 1;
  const units = word.length * cols + (word.length - 1) * gap;
  const scale = 0.50 / units;
  const width = units * scale;
  const height = rows * scale;
  const left = 0.5 - width / 2;
  const top = 0.62;
  if (nx < left || ny < top || nx >= left + width || ny >= top + height) return false;
  const ux = (nx - left) / scale;
  const uy = (ny - top) / scale;
  let cursor = 0;
  for (let i = 0; i < word.length; i += 1) {
    if (ux >= cursor && ux < cursor + cols) {
      const col = Math.floor(ux - cursor);
      const row = Math.floor(uy);
      const glyph = MERGE_GLYPHS[word[i]];
      if (!glyph || row < 0 || row >= rows || col < 0 || col >= cols) return false;
      return ((glyph[row] >> (cols - 1 - col)) & 1) === 1;
    }
    cursor += cols + gap;
  }
  return false;
}

function sampleDoc(nx, ny, size) {
  if (nx < 0.05 || ny < 0.05 || nx > 0.95 || ny > 0.95) return [0, 0, 0, 0];
  const page = { left: 0.14, top: 0.06, width: 0.72, height: 0.88, radius: 0.07 };
  if (!inRound(nx, ny, page.left, page.top, page.width, page.height, page.radius)) return [0, 0, 0, 0];
  let color = shadePlate(nx, ny, page.left, page.top, page.width, page.height, page.radius, PLATE_STOPS);
  const fold = 0.18;
  const fx = page.left + page.width - fold;
  const u = (nx - fx) / fold;
  const v = (ny - page.top) / fold;
  if (u >= 0 && v >= 0 && u <= 1 && v <= 1 && u + v <= 1) {
    color = mix([244, 247, 255, 255], [138, 158, 232, 255], u + v);
  }
  const small = size && size < 64;
  const box = small
    ? { left: 0.19, top: 0.19, size: 0.62, edge: 0.040, node: 0.088, ring: 0.020 }
    : { left: 0.24, top: 0.14, size: 0.52, edge: 0.034, node: 0.074, ring: 0.016 };
  const glyph = mergeGlyph(nx, ny, box);
  if (glyph) return glyph;
  if (!small && mergeWord(nx, ny)) color = [255, 252, 244, 255];
  return color;
}

function lum(color) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

function assertIcon(sample, label) {
  const corner = sample(0.01, 0.02);
  const edge = sample(0.02, 0.5);
  if (corner[3] !== 0 || edge[3] !== 0) throw new Error(label + " border is not transparent");
  const top = sample(0.28, 0.22);
  const bottom = sample(0.7, 0.78);
  if (top[3] === 0 || lum(top) <= lum(bottom) + 8) {
    throw new Error(label + " top-left is not brighter (" + lum(top).toFixed(1) + " vs " + lum(bottom).toFixed(1) + ")");
  }
}

function paint(sample) {
  return function paintPixel(x, y, size) {
    const cells = 2;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    const count = cells * cells;
    for (let oy = 0; oy < cells; oy += 1) {
      for (let ox = 0; ox < cells; ox += 1) {
        const color = sample((x + (ox + 0.5) / cells) / size, (y + (oy + 0.5) / cells) / size, size);
        const cover = color[3] / 255;
        red += color[0] * cover;
        green += color[1] * cover;
        blue += color[2] * cover;
        alpha += cover;
      }
    }
    if (alpha === 0) return [0, 0, 0, 0];
    return [Math.round(red / alpha), Math.round(green / alpha), Math.round(blue / alpha), Math.round((alpha / count) * 255)];
  };
}

function ico(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + count * 16;
  const blobs = [];
  images.forEach((image) => {
    const entry = Buffer.alloc(16);
    entry[0] = image.size >= 256 ? 0 : image.size;
    entry[1] = image.size >= 256 ? 0 : image.size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(image.png);
    offset += image.png.length;
  });
  return Buffer.concat([header].concat(entries).concat(blobs));
}

function icns(images) {
  const types = { 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };
  const chunks = images.map((image) => {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8 + image.png.length);
    return Buffer.concat([Buffer.from(types[image.size]), size, image.png]);
  });
  const body = Buffer.concat(chunks);
  const total = Buffer.alloc(4);
  total.writeUInt32BE(8 + body.length);
  return Buffer.concat([Buffer.from("icns"), total, body]);
}

assertIcon(sampleApp, "app");
assertIcon(sampleDoc, "document");
if (JSON.stringify(sampleApp(0.5, 0.5)) === JSON.stringify(sampleDoc(0.5, 0.5)) && JSON.stringify(sampleApp(0.16, 0.5)) === JSON.stringify(sampleDoc(0.16, 0.5))) {
  throw new Error("app and document icons look the same");
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
function build(sample) {
  return sizes.map((size) => ({ size: size, png: png(size, paint(sample)) }));
}

const appImages = build(sampleApp);
const docImages = build(sampleDoc);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, "icons"), { recursive: true });
fs.writeFileSync(path.join(outDir, "icon.png"), appImages.find((image) => image.size === 256).png);
fs.writeFileSync(path.join(outDir, "icon.ico"), ico(appImages.filter((image) => image.size <= 256)));
fs.writeFileSync(path.join(outDir, "icon.icns"), icns(appImages.filter((image) => image.size !== 24 && image.size !== 48)));
fs.writeFileSync(path.join(outDir, "document.png"), docImages.find((image) => image.size === 256).png);
fs.writeFileSync(path.join(outDir, "document.ico"), ico(docImages.filter((image) => image.size <= 256)));
fs.writeFileSync(path.join(outDir, "document.icns"), icns(docImages.filter((image) => image.size !== 24 && image.size !== 48)));
appImages.forEach((image) => {
  fs.writeFileSync(path.join(outDir, "icons", image.size + "x" + image.size + ".png"), image.png);
});
const buildDir = path.join(__dirname, "..", "build");
fs.mkdirSync(buildDir, { recursive: true });
fs.copyFileSync(path.join(outDir, "icon.ico"), path.join(buildDir, "icon.ico"));
console.log("icons ready");
