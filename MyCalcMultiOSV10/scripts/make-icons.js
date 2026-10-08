const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outDir = path.join(__dirname, "..", "assets");

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
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
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
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

function mix(from, to, t) {
  const amount = Math.min(1, Math.max(0, t));
  return from.map((value, index) => Math.round(value + (to[index] - value) * amount));
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

function gloss(nx, ny, originX, originY, reach) {
  const dist = Math.hypot((nx - originX) / reach, (ny - originY) / (reach * 1.15));
  const spot = Math.max(0, 1 - dist);
  return spot * spot;
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

function lit(color, nx, ny, amount) {
  const bright = gloss(nx, ny, 0.2, 0.14, 0.72);
  const falloff = Math.min(1, nx * 0.42 + ny * 0.72);
  let next = mix(color, [255, 248, 236, color[3]], bright * amount);
  next = mix(next, [58, 22, 8, next[3]], falloff * amount * 0.5);
  return next;
}

function over(base, color, alpha) {
  const outA = alpha + (base[3] / 255) * (1 - alpha);
  if (outA <= 0) return [0, 0, 0, 0];
  return [0, 1, 2].map((index) => Math.round((color[index] * alpha + base[index] * (base[3] / 255) * (1 - alpha)) / outA))
    .concat([Math.round(outA * 255)]);
}

function raised(nx, ny, left, top, width, height, radius, face, highlight) {
  if (!inRound(nx, ny, left, top, width, height, radius)) return null;
  const u = (nx - left) / width;
  const v = (ny - top) / height;
  let color = mix(face, highlight, gloss(u, v, 0.22, 0.16, 0.9) * 0.7);
  color = mix(color, [70, 48, 36, 255], Math.min(1, u * 0.18 + v * 0.42) * 0.28);
  const rim = edgeLight(nx, ny, left, top, width, height, radius, 0.035);
  if (rim > 0) color = mix(color, [255, 252, 246, 255], rim * 0.8);
  else color = mix(color, [48, 28, 16, 255], -rim * 0.65);
  return color;
}

function sample(nx, ny) {
  let pixel = [0, 0, 0, 0];
  const plate = { left: 0.04, top: 0.04, width: 0.92, height: 0.92, radius: 0.22 };
  if (inRound(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius)) {
    pixel = lit(mix([255, 156, 64, 255], [156, 42, 8, 255], ny * 0.82 + nx * 0.22), nx, ny, 0.78);
    const rim = edgeLight(nx, ny, plate.left, plate.top, plate.width, plate.height, plate.radius, 0.055);
    if (rim > 0) pixel = mix(pixel, [255, 236, 210, 255], rim * 0.9);
    else pixel = mix(pixel, [64, 18, 4, 255], -rim * 0.75);
  }
  // The orange plate behind it keeps its full 0.92, but the calculator itself
  // is a portrait device, so its image is narrower than it is tall.
  const body = { left: 0.22, top: 0.16, width: 0.56, height: 0.68, radius: 0.08 };
  const scale = 0.9;
  const ix = (nx - 0.5) / scale + 0.5;
  const iy = (ny - 0.5) / scale + 0.5;
  const shadow = roundSdf(ix - 0.012, iy - 0.018, body.left, body.top, body.width, body.height, body.radius);
  if (shadow > 0 && shadow < 0.035 && pixel[3] > 0) pixel = mix(pixel, [72, 24, 6, 255], (1 - shadow / 0.035) * 0.45);
  const face = raised(ix, iy, body.left, body.top, body.width, body.height, body.radius, [255, 250, 244, 255], [255, 255, 255, 255]);
  if (face) pixel = face;
  const screen = raised(ix, iy, 0.28, 0.24, 0.44, 0.14, 0.03, [22, 18, 16, 255], [58, 52, 48, 255]);
  if (screen) {
    const rim = edgeLight(ix, iy, 0.28, 0.24, 0.44, 0.14, 0.03, 0.03);
    pixel = rim > 0 ? mix(screen, [8, 6, 5, 255], rim * 0.7) : mix(screen, [96, 88, 80, 255], -rim * 0.45);
  }
  const keys = [
    [0.28, 0.46], [0.415, 0.46], [0.55, 0.46],
    [0.28, 0.58], [0.415, 0.58], [0.55, 0.58],
    [0.28, 0.70], [0.415, 0.70],
  ];
  for (const [left, top] of keys) {
    const key = raised(ix, iy, left, top, 0.1, 0.09, 0.02, [228, 224, 218, 255], [255, 255, 255, 255]);
    if (key) pixel = key;
  }
  const equals = raised(ix, iy, 0.55, 0.70, 0.17, 0.09, 0.02, [234, 88, 12, 255], [255, 176, 96, 255]);
  if (equals) pixel = equals;
  return pixel;
}

function paint(x, y, size) {
  const cells = 3;
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  const count = cells * cells;
  for (let oy = 0; oy < cells; oy++) {
    for (let ox = 0; ox < cells; ox++) {
      const color = sample((x + (ox + 0.5) / cells) / size, (y + (oy + 0.5) / cells) / size);
      const cover = color[3] / 255;
      red += color[0] * cover;
      green += color[1] * cover;
      blue += color[2] * cover;
      alpha += cover;
    }
  }
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    Math.round(red / alpha),
    Math.round(green / alpha),
    Math.round(blue / alpha),
    Math.round((alpha / count) * 255),
  ];
}

function ico(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + count * 16;
  const blobs = [];
  for (const image of images) {
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
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

function icns(images) {
  const types = {
    16: "icp4",
    32: "icp5",
    64: "icp6",
    128: "ic07",
    256: "ic08",
    512: "ic09",
    1024: "ic10",
  };
  const chunks = images.map((image) => {
    const type = types[image.size];
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8 + image.png.length);
    return Buffer.concat([Buffer.from(type), size, image.png]);
  });
  const body = Buffer.concat(chunks);
  const total = Buffer.alloc(4);
  total.writeUInt32BE(8 + body.length);
  return Buffer.concat([Buffer.from("icns"), total, body]);
}

const sizes = [16, 32, 48, 64, 128, 256, 512];
const images = sizes.map((size) => ({ size, png: png(size, paint) }));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon.png"), images.find((image) => image.size === 512).png);
fs.writeFileSync(path.join(outDir, "icon.ico"), ico(images.filter((image) => image.size <= 256)));
fs.writeFileSync(path.join(outDir, "icon.icns"), icns(images.filter((image) => image.size !== 48)));
for (const image of images) {
  console.log(`${image.size}  ${image.png.length} bytes`);
}
