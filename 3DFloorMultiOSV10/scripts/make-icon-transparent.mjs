/**
 * Remove solid light backdrop from assets/icon.png (flood-fill from edges).
 * Keeps the 3D icon artwork; writes RGBA PNG with transparent background.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const iconPath = path.join(root, 'assets', 'icon.png');
const brightPath = path.join(root, 'assets', 'icon-bright.png');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
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

function readPngRgba(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType})`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = 1 + width * bpp;
  const rgba = Buffer.alloc(width * height * 4);

  let prev = Buffer.alloc(width * bpp);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    const filter = raw[rowStart];
    const row = Buffer.from(raw.subarray(rowStart + 1, rowStart + stride));
    const recon = Buffer.alloc(width * bpp);

    for (let i = 0; i < row.length; i += 1) {
      const left = i >= bpp ? recon[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let val = row[i];
      if (filter === 1) val = (val + left) & 255;
      else if (filter === 2) val = (val + up) & 255;
      else if (filter === 3) val = (val + ((left + up) >> 1)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        val = (val + pr) & 255;
      }
      recon[i] = val;
    }

    for (let x = 0; x < width; x += 1) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      rgba[di] = recon[si];
      rgba[di + 1] = recon[si + 1];
      rgba[di + 2] = recon[si + 2];
      rgba[di + 3] = bpp === 4 ? recon[si + 3] : 255;
    }
    prev = recon;
  }

  return { width, height, rgba };
}

function writePngRgba(filePath, width, height, rgba) {
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const out = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, out);
}

function colorDist(r, g, b, br, bg, bb) {
  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Cool light-gray studio backdrop — not warm cream platform / white UI. */
function isBackdropPixel(r, g, b, br, bg, bb, maxDist) {
  const d = colorDist(r, g, b, br, bg, bb);
  if (d > maxDist) return false;
  const avg = (r + g + b) / 3;
  if (avg < 190) return false; // keep darker artwork / shadows on the model
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (sat > 28) return false;
  // Warm cream platform has R > B; backdrop is neutral/cool (B ≳ R)
  if (r - b > 8) return false;
  return true;
}

function makeTransparent({ width, height, rgba }) {
  // Sample corners for backdrop color
  const samples = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [0, Math.floor(height / 2)],
  ];
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const [x, y] of samples) {
    const i = (y * width + x) * 4;
    sr += rgba[i];
    sg += rgba[i + 1];
    sb += rgba[i + 2];
  }
  const br = sr / samples.length;
  const bg = sg / samples.length;
  const bb = sb / samples.length;

  // Hard cut only — no soft gray fringe (semi-transparent edges look dark on UI chrome)
  const maxDist = 32;

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qh = 0;
  let qt = 0;

  const pushIfBg = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (!isBackdropPixel(rgba[i], rgba[i + 1], rgba[i + 2], br, bg, bb, maxDist)) return;
    visited[idx] = 1;
    queue[qt++] = idx;
  };

  for (let x = 0; x < width; x += 1) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % width;
    const y = (idx / width) | 0;
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }

  let cleared = 0;
  for (let idx = 0; idx < width * height; idx += 1) {
    const i = idx * 4;
    if (visited[idx]) {
      rgba[i + 3] = 0;
      cleared += 1;
    } else {
      // Keep foreground fully opaque and in a bright range
      rgba[i + 3] = 255;
      // Mild lift so the artwork stays light (does not crush highlights)
      for (let c = 0; c < 3; c += 1) {
        const v = rgba[i + c];
        rgba[i + c] = Math.min(255, Math.round(v + (255 - v) * 0.06));
      }
    }
  }

  return { cleared, backdrop: { r: br, g: bg, b: bb } };
}

const srcPath = path.join(root, 'assets', 'icon-src.png');
const inputPath = [srcPath, brightPath, iconPath].find((p) => fs.existsSync(p));
if (!inputPath) {
  console.error('Missing icon source (assets/icon-src.png, icon-bright.png, or icon.png).');
  process.exit(1);
}
const png = readPngRgba(inputPath);

// If working from master that is already transparent and no src, skip
const cornerAlpha = [0, png.width - 1, (png.height - 1) * png.width, png.height * png.width - 1]
  .map((idx) => png.rgba[idx * 4 + 3]);
if (!fs.existsSync(srcPath) && cornerAlpha.every((a) => a < 16)) {
  console.log(`Already transparent: ${iconPath}`);
} else {
  // Keep an opaque master for reproducible re-processing
  if (!fs.existsSync(srcPath) && cornerAlpha.every((a) => a > 200)) {
    fs.copyFileSync(iconPath, srcPath);
    console.log(`Saved opaque master: ${srcPath}`);
  }
  const { cleared, backdrop } = makeTransparent(png);
  writePngRgba(iconPath, png.width, png.height, png.rgba);
  console.log(
    `Transparent icon written: ${iconPath} (from ${path.basename(inputPath)}, ${cleared} px cleared, backdrop ~rgb(${backdrop.r.toFixed(0)},${backdrop.g.toFixed(0)},${backdrop.b.toFixed(0)}))`,
  );
}
