import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function blend(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const index = (y * size + x) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  pixels[index] = Math.round(color[0] * alpha + pixels[index] * inverse);
  pixels[index + 1] = Math.round(color[1] * alpha + pixels[index + 1] * inverse);
  pixels[index + 2] = Math.round(color[2] * alpha + pixels[index + 2] * inverse);
  pixels[index + 3] = Math.round(color[3] + pixels[index + 3] * inverse);
}

function fillRoundRect(pixels, size, x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const left = px < x + radius;
      const right = px >= x + width - radius;
      const top = py < y + radius;
      const bottom = py >= y + height - radius;
      if (left && top && (px - (x + radius)) ** 2 + (py - (y + radius)) ** 2 > radius ** 2) continue;
      if (right && top && (px - (x + width - radius - 1)) ** 2 + (py - (y + radius)) ** 2 > radius ** 2) continue;
      if (left && bottom && (px - (x + radius)) ** 2 + (py - (y + height - radius - 1)) ** 2 > radius ** 2) continue;
      if (right && bottom && (px - (x + width - radius - 1)) ** 2 + (py - (y + height - radius - 1)) ** 2 > radius ** 2) continue;
      blend(pixels, size, px, py, color);
    }
  }
}

function draw() {
  const size = 1024;
  const pixels = Buffer.alloc(size * size * 4);
  fillRoundRect(pixels, size, 96, 96, 832, 832, 176, [23, 33, 48, 255]);
  fillRoundRect(pixels, size, 176, 250, 672, 590, 56, [248, 250, 253, 235]);
  fillRoundRect(pixels, size, 176, 250, 672, 150, 56, [61, 125, 255, 255]);
  fillRoundRect(pixels, size, 176, 340, 672, 70, 0, [61, 125, 255, 255]);
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const holiday = row === 1 && column === 3;
      fillRoundRect(
        pixels,
        size,
        214 + column * 90,
        430 + row * 74,
        46,
        46,
        12,
        holiday ? [255, 107, 107, 255] : [214, 224, 236, 255],
      );
    }
  }
  return encodePng(size, pixels);
}

const png = draw();
fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.mkdirSync(path.join(root, "src-tauri", "icons"), { recursive: true });
fs.writeFileSync(path.join(root, "public", "favicon.png"), png);
fs.writeFileSync(path.join(root, "src-tauri", "icons", "source.png"), png);
console.log("wrote icon");
