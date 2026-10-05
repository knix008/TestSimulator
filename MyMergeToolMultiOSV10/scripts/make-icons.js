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

function mergeMark(nx, ny) {
  const strokes = [
    [0.30, 0.34, 0.50, 0.50],
    [0.30, 0.66, 0.50, 0.50],
    [0.50, 0.50, 0.72, 0.50],
  ];
  let near = strokes.some((seg) => distSeg(nx, ny, seg[0], seg[1], seg[2], seg[3]) < 0.035);
  const head = distSeg(nx, ny, 0.64, 0.40, 0.76, 0.50) < 0.032 || distSeg(nx, ny, 0.64, 0.60, 0.76, 0.50) < 0.032;
  return near || head;
}

function shadePlate(nx, ny, left, top, width, height, radius, topColor, bottomColor) {
  let color = mix(topColor, bottomColor, ny * 0.75 + nx * 0.2);
  color = mix(color, [255, 255, 255, 255], gloss(nx, ny, left + width * 0.18, top + height * 0.12, width * 0.72) * 0.9);
  color = mix(color, [10, 24, 48, 255], Math.max(0, (nx - left) / width * 0.25 + (ny - top) / height * 0.55 - 0.35));
  const rim = edgeLight(nx, ny, left, top, width, height, radius, 0.05);
  if (rim > 0) color = mix(color, [255, 255, 255, 255], rim * 0.8);
  else color = mix(color, [4, 16, 36, 255], -rim * 0.55);
  return color;
}

function sampleApp(nx, ny) {
  if (nx < 0.06 || ny < 0.06 || nx > 0.94 || ny > 0.94) return [0, 0, 0, 0];
  const plate = { left: 0.1, top: 0.1, width: 0.8, height: 0.8, radius: 0.18 };
  if (!inRound(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius)) return [0, 0, 0, 0];
  let color = shadePlate(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius, [150, 220, 255, 255], [16, 78, 168, 255]);
  if (mergeMark(nx, ny)) color = mix(color, [255, 250, 236, 255], 0.96);
  return color;
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

function docArrow(nx, ny, box, thick) {
  const lx = (nx - box.left) / box.width;
  const ly = (ny - box.top) / box.height;
  const strokes = [
    [0.06, 0.18, 0.46, 0.50],
    [0.06, 0.82, 0.46, 0.50],
    [0.46, 0.50, 0.92, 0.50],
  ];
  if (strokes.some((seg) => distSeg(lx, ly, seg[0], seg[1], seg[2], seg[3]) < thick)) return true;
  return distSeg(lx, ly, 0.70, 0.26, 0.98, 0.50) < thick || distSeg(lx, ly, 0.70, 0.74, 0.98, 0.50) < thick;
}

function sampleDoc(nx, ny, size) {
  if (nx < 0.06 || ny < 0.06 || nx > 0.94 || ny > 0.94) return [0, 0, 0, 0];
  const page = { left: 0.14, top: 0.06, width: 0.72, height: 0.88, radius: 0.07 };
  if (!inRound(nx, ny, page.left, page.top, page.width, page.height, page.radius)) return [0, 0, 0, 0];
  let color = shadePlate(nx, ny, page.left, page.top, page.width, page.height, page.radius, [188, 226, 255, 255], [16, 84, 176, 255]);
  const fold = 0.18;
  const fx = page.left + page.width - fold;
  const u = (nx - fx) / fold;
  const v = (ny - page.top) / fold;
  if (u >= 0 && v >= 0 && u <= 1 && v <= 1 && u + v <= 1) {
    color = mix([244, 250, 255, 255], [126, 180, 224, 255], u + v);
  }
  const small = size && size < 64;
  const box = small
    ? { left: 0.22, top: 0.24, width: 0.56, height: 0.50 }
    : { left: 0.28, top: 0.20, width: 0.44, height: 0.34 };
  if (docArrow(nx, ny, box, small ? 0.15 : 0.085)) color = [255, 252, 244, 255];
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
fs.writeFileSync(path.join(outDir, "icon.ico"), ico(appImages.filter((image) => image.size <= 256 && image.size !== 24)));
fs.writeFileSync(path.join(outDir, "icon.icns"), icns(appImages.filter((image) => image.size !== 24 && image.size !== 48)));
fs.writeFileSync(path.join(outDir, "document.png"), docImages.find((image) => image.size === 256).png);
fs.writeFileSync(path.join(outDir, "document.ico"), ico(docImages.filter((image) => image.size <= 256 && image.size !== 24)));
fs.writeFileSync(path.join(outDir, "document.icns"), icns(docImages.filter((image) => image.size !== 24 && image.size !== 48)));
appImages.forEach((image) => {
  fs.writeFileSync(path.join(outDir, "icons", image.size + "x" + image.size + ".png"), image.png);
});
const buildDir = path.join(__dirname, "..", "build");
fs.mkdirSync(buildDir, { recursive: true });
fs.copyFileSync(path.join(outDir, "icon.ico"), path.join(buildDir, "icon.ico"));
console.log("icons ready");
