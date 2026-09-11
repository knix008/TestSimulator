// Generate build/icon.ico, build/icon.png, build/file-icon.ico and the Linux
// icon set from a drawn-in-code source, so the repo needs no binary assets.
// Run with: npm run make:icons
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(here, '../build');
const iconsDir = path.join(buildDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

// ── Tiny PNG writer (RGBA, no dependencies) ────────────────────────────────

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── The artwork: a database cylinder on a rounded square ───────────────────

function drawIcon(size, variant) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = (v) => (v * size) / 256;

  const put = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
    const i = (y * size + x) * 4;
    const src = a / 255;
    const dst = rgba[i + 3] / 255;
    const out = src + dst * (1 - src);
    if (out <= 0) return;
    rgba[i] = Math.round((r * src + rgba[i] * dst * (1 - src)) / out);
    rgba[i + 1] = Math.round((g * src + rgba[i + 1] * dst * (1 - src)) / out);
    rgba[i + 2] = Math.round((b * src + rgba[i + 2] * dst * (1 - src)) / out);
    rgba[i + 3] = Math.round(out * 255);
  };

  // Background: rounded square with a vertical gradient.
  const radius = s(52);
  const top = variant === 'file' ? [96, 116, 148] : [37, 99, 235];
  const bottom = variant === 'file' ? [58, 72, 100] : [29, 60, 160];
  for (let y = 0; y < size; y++) {
    const k = y / (size - 1);
    const colour = [
      Math.round(top[0] + (bottom[0] - top[0]) * k),
      Math.round(top[1] + (bottom[1] - top[1]) * k),
      Math.round(top[2] + (bottom[2] - top[2]) * k),
      255,
    ];
    for (let x = 0; x < size; x++) {
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      if (cx < radius && cy < radius) {
        const dx = radius - cx;
        const dy = radius - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        const edge = Math.min(1, radius - d);
        put(x, y, [colour[0], colour[1], colour[2], Math.round(255 * edge)]);
        continue;
      }
      put(x, y, colour);
    }
  }

  // Database cylinder.
  const cxCenter = size / 2;
  const rx = s(74);
  const ry = s(26);
  const bandTop = s(86);
  const bandBottom = s(178);
  const white = [255, 255, 255, 245];
  const shade = [206, 222, 250, 235];

  const inEllipse = (x, y, cy2) => {
    const dx = (x - cxCenter) / rx;
    const dy = (y - cy2) / ry;
    return dx * dx + dy * dy <= 1;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inBody = Math.abs(x - cxCenter) <= rx && y >= bandTop && y <= bandBottom;
      if (inBody || inEllipse(x, y, bandTop) || inEllipse(x, y, bandBottom)) {
        put(x, y, y > bandTop + ry ? shade : white);
      }
    }
  }

  // Two separator bands across the cylinder.
  for (const cy2 of [bandTop + s(46), bandTop + s(92)]) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!inEllipse(x, y, cy2)) continue;
        if (inEllipse(x, y - s(5), cy2)) continue;
        put(x, y, [37, 99, 235, 210]);
      }
    }
  }

  // Top face highlight, drawn last so it stays crisp.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inEllipse(x, y, bandTop)) put(x, y, [255, 255, 255, 255]);
    }
  }

  return rgba;
}

function png(size, variant) {
  return encodePng(size, size, drawIcon(size, variant));
}

// ── ICO container ──────────────────────────────────────────────────────────

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const bodies = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // palette
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32BE(0, 8);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    bodies.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...bodies]);
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

writeFileSync(
  path.join(buildDir, 'icon.ico'),
  encodeIco(ICO_SIZES.map((size) => ({ size, data: png(size, 'app') }))),
);
writeFileSync(
  path.join(buildDir, 'file-icon.ico'),
  encodeIco(ICO_SIZES.map((size) => ({ size, data: png(size, 'file') }))),
);
writeFileSync(path.join(buildDir, 'icon.png'), png(512, 'app'));
writeFileSync(path.join(buildDir, 'file-icon.png'), png(512, 'file'));

for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  writeFileSync(path.join(iconsDir, `${size}x${size}.png`), png(size, 'app'));
}

console.log('icons written to build/ and build/icons/');
