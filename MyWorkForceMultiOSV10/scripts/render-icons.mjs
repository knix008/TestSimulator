import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const blue = [0x24, 0x57, 0xd6];
  const white = [255, 255, 255];
  const board = size * 0.16;
  const radius = size * 0.22;
  const pad = size * 0.28;
  const gap = size * 0.045;
  const width = (size - pad * 2 - gap * 2) / 3;
  const top = size * 0.30;
  const heights = [0.46, 0.30, 0.38];
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const inside = inRound(px, py, board, board, size - board, size - board, radius);
      let color = blue;
      if (inside) {
        for (let i = 0; i < 3; i += 1) {
          const x0 = pad + i * (width + gap);
          if (inRound(px, py, x0, top, x0 + width, top + size * heights[i], width * 0.22)) color = white;
        }
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw[offset] = inside ? color[0] : 0;
      raw[offset + 1] = inside ? color[1] : 0;
      raw[offset + 2] = inside ? color[2] : 0;
      raw[offset + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

function icns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const images = Object.fromEntries(sizes.map((size) => [size, png(size)]));
const icons = path.join(root, 'src-tauri', 'icons');
mkdirSync(icons, { recursive: true });
mkdirSync(path.join(root, 'public'), { recursive: true });
mkdirSync(path.join(root, 'assets'), { recursive: true });
writeFileSync(path.join(icons, '32x32.png'), images[32]);
writeFileSync(path.join(icons, '128x128.png'), images[128]);
writeFileSync(path.join(icons, '128x128@2x.png'), images[256]);
writeFileSync(path.join(icons, 'icon.ico'), ico([16, 32, 48, 256].map((size) => ({ size, data: images[size] }))));
writeFileSync(path.join(icons, 'icon.icns'), icns([
  ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
].map(([type, size]) => ({ type, data: images[size] }))));
writeFileSync(path.join(root, 'public', 'icon.png'), images[32]);
writeFileSync(path.join(root, 'assets', 'icon-256.png'), images[256]);
console.log('icons written');
