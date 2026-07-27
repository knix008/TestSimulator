/**
 * Generate clean black-on-white 2D floor-plan sample PNGs + matching detection JSON
 * so sample → 3D conversion is stable (no dimension ticks / hatch noise).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'samples');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function writePng(filePath, width, height, rgba) {
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(
    filePath,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function makeCanvas(w, h, fill = 255) {
  const rgba = Buffer.alloc(w * h * 4, fill);
  for (let i = 0; i < w * h; i += 1) rgba[i * 4 + 3] = 255;
  return { w, h, rgba };
}

function fillRect(c, x1, y1, x2, y2, rgb = [32, 32, 32]) {
  const xa = Math.max(0, Math.min(c.w, Math.floor(Math.min(x1, x2))));
  const xb = Math.max(0, Math.min(c.w, Math.ceil(Math.max(x1, x2))));
  const ya = Math.max(0, Math.min(c.h, Math.floor(Math.min(y1, y2))));
  const yb = Math.max(0, Math.min(c.h, Math.ceil(Math.max(y1, y2))));
  for (let y = ya; y < yb; y += 1) {
    for (let x = xa; x < xb; x += 1) {
      const i = (y * c.w + x) * 4;
      c.rgba[i] = rgb[0];
      c.rgba[i + 1] = rgb[1];
      c.rgba[i + 2] = rgb[2];
    }
  }
}

/** Draw wall as axis-aligned thick segment */
function wall(c, x1, y1, x2, y2, t = 10) {
  const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  if (horiz) {
    const y = (y1 + y2) / 2;
    fillRect(c, x1, y - t / 2, x2, y + t / 2);
    return { x1, y1: y - t / 2, x2, y2: y + t / 2, kind: 'wall' };
  }
  const x = (x1 + x2) / 2;
  fillRect(c, x - t / 2, y1, x + t / 2, y2);
  return { x1: x - t / 2, y1, x2: x + t / 2, y2, kind: 'wall' };
}

function opening(c, x1, y1, x2, y2, kind, rgb) {
  fillRect(c, x1, y1, x2, y2, rgb);
  return { x1, y1, x2, y2, kind };
}

/** Split walls so door/window spans are not solid wall in 3D. */
function cutWallsAroundOpenings(segs) {
  const openings = segs.filter((s) => s.kind === 'door' || s.kind === 'window');
  const walls = segs.filter((s) => s.kind === 'wall');
  const other = segs.filter((s) => s.kind !== 'wall');
  const out = [];

  for (const wall of walls) {
    const ww = wall.x2 - wall.x1;
    const wh = wall.y2 - wall.y1;
    const horiz = ww >= wh;
    let pieces = [wall];

    for (const op of openings) {
      const next = [];
      for (const p of pieces) {
        const overlapX = Math.min(p.x2, op.x2) - Math.max(p.x1, op.x1);
        const overlapY = Math.min(p.y2, op.y2) - Math.max(p.y1, op.y1);
        if (overlapX <= 1 || overlapY <= 1) {
          next.push(p);
          continue;
        }
        if (horiz) {
          const left = { ...p, x2: Math.max(p.x1, op.x1), kind: 'wall' };
          const right = { ...p, x1: Math.min(p.x2, op.x2), kind: 'wall' };
          if (left.x2 - left.x1 > 4) next.push(left);
          if (right.x2 - right.x1 > 4) next.push(right);
        } else {
          const top = { ...p, y2: Math.max(p.y1, op.y1), kind: 'wall' };
          const bot = { ...p, y1: Math.min(p.y2, op.y2), kind: 'wall' };
          if (top.y2 - top.y1 > 4) next.push(top);
          if (bot.y2 - bot.y1 > 4) next.push(bot);
        }
      }
      pieces = next;
    }
    out.push(...pieces);
  }
  return [...out, ...other];
}

function saveSample(name, width, height, buildFn) {
  const c = makeCanvas(width, height, 250);
  const raw = buildFn(c);
  const segs = cutWallsAroundOpenings(raw);
  const pngPath = path.join(outDir, `${name}.png`);
  const jsonPath = path.join(outDir, `${name}.json`);
  writePng(pngPath, width, height, c.rgba);

  const points = segs.map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }));
  const classes = segs.map((s) => ({ name: s.kind }));
  const doors = segs.filter((s) => s.kind === 'door');
  const averageDoor = doors.length
    ? doors.reduce((a, d) => a + Math.max(d.x2 - d.x1, d.y2 - d.y1), 0) / doors.length
    : 36;

  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ Width: width, Height: height, averageDoor, points, classes }, null, 2)}\n`,
  );
  console.log(`Wrote ${name}.png + ${name}.json (${segs.length} segments)`);
}

fs.mkdirSync(outDir, { recursive: true });

// Compact apartment
saveSample('example1', 640, 480, (c) => {
  const t = 12;
  const s = [];
  s.push(wall(c, 40, 40, 600, 40, t));
  s.push(wall(c, 40, 440, 600, 440, t));
  s.push(wall(c, 40, 40, 40, 440, t));
  s.push(wall(c, 600, 40, 600, 440, t));
  s.push(wall(c, 280, 40, 280, 260, t));
  s.push(wall(c, 40, 260, 280, 260, t));
  s.push(wall(c, 280, 260, 600, 260, t));
  s.push(wall(c, 420, 260, 420, 440, t));
  s.push(opening(c, 120, 34, 200, 46, 'window', [100, 170, 210]));
  s.push(opening(c, 360, 34, 460, 46, 'window', [100, 170, 210]));
  s.push(opening(c, 594, 120, 606, 200, 'window', [100, 170, 210]));
  s.push(opening(c, 140, 254, 210, 266, 'door', [120, 70, 30]));
  s.push(opening(c, 330, 254, 390, 266, 'door', [120, 70, 30]));
  s.push(opening(c, 414, 320, 426, 380, 'door', [120, 70, 30]));
  return s;
});

// L-shaped plan
saveSample('example2', 640, 480, (c) => {
  const t = 12;
  const s = [];
  s.push(wall(c, 60, 60, 400, 60, t));
  s.push(wall(c, 400, 60, 400, 220, t));
  s.push(wall(c, 400, 220, 580, 220, t));
  s.push(wall(c, 580, 220, 580, 420, t));
  s.push(wall(c, 60, 420, 580, 420, t));
  s.push(wall(c, 60, 60, 60, 420, t));
  s.push(wall(c, 240, 60, 240, 280, t));
  s.push(wall(c, 60, 280, 400, 280, t));
  s.push(opening(c, 120, 54, 190, 66, 'window', [100, 170, 210]));
  s.push(opening(c, 300, 54, 360, 66, 'window', [100, 170, 210]));
  s.push(opening(c, 574, 280, 586, 350, 'window', [100, 170, 210]));
  s.push(opening(c, 130, 274, 200, 286, 'door', [120, 70, 30]));
  s.push(opening(c, 300, 274, 360, 286, 'door', [120, 70, 30]));
  s.push(opening(c, 460, 214, 530, 226, 'door', [120, 70, 30]));
  return s;
});

// Simple studio with one room split
saveSample('handDrawn', 560, 420, (c) => {
  const t = 14;
  const ink = [20, 110, 55];
  const s = [];
  const w = (x1, y1, x2, y2) => {
    const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
    if (horiz) {
      const y = (y1 + y2) / 2;
      fillRect(c, x1, y - t / 2, x2, y + t / 2, ink);
      s.push({ x1, y1: y - t / 2, x2, y2: y + t / 2, kind: 'wall' });
    } else {
      const x = (x1 + x2) / 2;
      fillRect(c, x - t / 2, y1, x + t / 2, y2, ink);
      s.push({ x1: x - t / 2, y1, x2: x + t / 2, y2, kind: 'wall' });
    }
  };
  w(36, 36, 524, 36);
  w(36, 384, 524, 384);
  w(36, 36, 36, 384);
  w(524, 36, 524, 384);
  w(280, 36, 280, 384);
  w(36, 210, 280, 210);
  s.push(opening(c, 100, 30, 170, 42, 'window', [80, 160, 200]));
  s.push(opening(c, 340, 30, 430, 42, 'window', [80, 160, 200]));
  s.push(opening(c, 110, 204, 180, 216, 'door', [130, 80, 40]));
  s.push(opening(c, 274, 260, 286, 330, 'door', [130, 80, 40]));
  return s;
});
