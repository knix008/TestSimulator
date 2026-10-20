// `npm run icons`: draws the app icon with the app's own encoder (qrcore.wasm), writes
// assets/icon-source.png, then lets `tauri icon` make every platform size.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { loadWasmEncoder } from "../src/js/encoder.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 1024;
const SS = 4; // samples per axis per pixel

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** Signed distance to a rounded rectangle (negative inside). */
function sdRound(x, y, R) {
  const hw = R.w / 2;
  const hh = R.w / 2;
  const qx = Math.abs(x - (R.x + hw)) - (hw - R.r);
  const qy = Math.abs(y - (R.y + hh)) - (hh - R.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R.r;
}

const encode = await loadWasmEncoder(fs.readFileSync(path.join(root, "src", "wasm", "qrcore.wasm")));
const qr = encode("QR", { ecc: "H", version: 1, mask: 2 });
// The tile sits a little high so its drop shadow fits below it.
const tile = { x: 64, y: 44, w: SIZE - 128, r: 196 };
const card = { x: 196, y: 172, w: SIZE - 392, r: 64 };
const quiet = 1.2;
const unit = card.w / (qr.size + quiet * 2);
const SHADOW_DROP = 30;
const BEVEL = 54;
const LIGHT = [-0.55, -0.83]; // from the top left
const DARK = [17, 24, 39];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** The tile's colour at a point: lit gradient, bevelled rim, gloss, and the card's shadow. */
function tileColor(x, y) {
  const t = (x - tile.x + (y - tile.y)) / (2 * tile.w);
  let c = mix([45, 112, 245], [128, 58, 237], t); // blue → violet
  c = c.map((v) => v * (1.12 - 0.3 * ((y - tile.y) / tile.w))); // light from above
  const d = sdRound(x, y, tile);
  const depth = -d;
  if (depth < BEVEL) {
    // Outward normal from the distance field; the rim slopes, so it catches or loses light.
    const nx = sdRound(x + 1, y, tile) - sdRound(x - 1, y, tile);
    const ny = sdRound(x, y + 1, tile) - sdRound(x, y - 1, tile);
    const len = Math.hypot(nx, ny) || 1;
    const slope = Math.cos(((Math.max(depth, 0) / BEVEL) * Math.PI) / 2);
    const shade = -((nx / len) * LIGHT[0] + (ny / len) * LIGHT[1]) * slope;
    c = shade > 0 ? mix(c, [255, 255, 255], shade * 0.42) : mix(c, [10, 10, 40], -shade * 0.5);
  }
  // Glossy highlight across the upper half.
  const gx = (x - (tile.x + tile.w / 2)) / (tile.w * 0.46);
  const gy = (y - (tile.y + tile.w * 0.2)) / (tile.w * 0.3);
  const gloss = 1 - gx * gx - gy * gy;
  if (gloss > 0) c = mix(c, [255, 255, 255], Math.min(gloss, 1) * 0.2);
  // The white card casts a soft shadow onto the tile.
  const cd = sdRound(x, y - 14, card);
  if (cd > 0) c = mix(c, [8, 8, 30], 0.38 * Math.exp(-cd / 16));
  return c;
}

/** The card's colour: a faint top-to-bottom shade and an inner shadow under its top edge. */
function cardColor(x, y) {
  let c = mix([255, 255, 255], [228, 234, 244], (y - card.y) / card.w);
  const depth = -sdRound(x, y, card);
  const top = y - card.y;
  if (top < 18) c = mix(c, [150, 160, 185], 0.35 * (1 - top / 18) * Math.min(1, depth / 4));
  return c;
}

const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py += 1) {
  for (let px = 0; px < SIZE; px += 1) {
    // Colours are worked out once per pixel; the samples only decide coverage.
    const cx = px + 0.5;
    const cy = py + 0.5;
    let tileC = null;
    let cardC = null;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const x = px + (sx + 0.5) / SS;
        const y = py + (sy + 0.5) / SS;
        let color;
        let alpha = 1;
        if (sdRound(x, y, tile) <= 0) {
          if (sdRound(x, y, card) <= 0) {
            const mx = Math.floor((x - card.x) / unit - quiet);
            const my = Math.floor((y - card.y) / unit - quiet);
            if (mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx]) color = DARK;
            else color = cardC ??= cardColor(cx, cy);
          } else {
            color = tileC ??= tileColor(cx, cy);
          }
        } else {
          // Drop shadow below the tile.
          const sd = Math.max(0, sdRound(x, y - SHADOW_DROP, tile) + 10);
          alpha = 0.5 * Math.exp(-sd / 20);
          color = [10, 12, 40];
        }
        r += color[0] * alpha;
        g += color[1] * alpha;
        b += color[2] * alpha;
        a += alpha;
      }
    }
    const i = (py * SIZE + px) * 4;
    if (a > 0) {
      rgba[i] = clamp(r / a);
      rgba[i + 1] = clamp(g / a);
      rgba[i + 2] = clamp(b / a);
      rgba[i + 3] = clamp((255 * a) / (SS * SS));
    }
  }
}

fs.mkdirSync(path.join(root, "assets"), { recursive: true });
const source = path.join(root, "assets", "icon-source.png");
fs.writeFileSync(source, encodePng(rgba, SIZE, SIZE));
const cli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
execFileSync(process.execPath, [cli, "icon", source, "-o", path.join(root, "src-tauri", "icons")], { cwd: root, stdio: "inherit" });
fs.copyFileSync(path.join(root, "src-tauri", "icons", "128x128.png"), path.join(root, "src", "icon.png"));
console.log("icons written to src-tauri/icons and src/icon.png");
