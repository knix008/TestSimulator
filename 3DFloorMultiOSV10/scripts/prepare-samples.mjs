/**
 * Convert upstream comparison screenshots into 2D floor-plan-only samples.
 * - example1/2: keep left (2D plan), drop right (3D)
 * - handDrawn: keep top (2D plan), drop bottom (3D)
 * Removes pure 3D UI screenshots that are not usable as plan input.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const samplesDir = path.join(root, 'samples');
const sourceDir = path.join(samplesDir, '_source');

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
    throw new Error(`Not a PNG: ${filePath}`);
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
    throw new Error(`Unsupported PNG: ${filePath}`);
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

function crop(png, { x0, y0, x1, y1 }) {
  const w = x1 - x0;
  const h = y1 - y0;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const src = ((y0 + y) * png.width + x0) * 4;
    png.rgba.copy(rgba, y * w * 4, src, src + w * 4);
  }
  return { width: w, height: h, rgba };
}

fs.mkdirSync(sourceDir, { recursive: true });

const jobs = [
  {
    file: 'example1.png',
    // side-by-side: 2D left, 3D right
    region: (w, h) => ({ x0: 0, y0: 0, x1: Math.floor(w * 0.5), y1: h }),
  },
  {
    file: 'example2.png',
    region: (w, h) => ({ x0: 0, y0: 0, x1: Math.floor(w * 0.5), y1: h }),
  },
  {
    file: 'handDrawn.png',
    // stacked: 2D top (a), 3D bottom (b) — keep clear of the 3D wood strip
    region: (w, h) => ({ x0: 0, y0: 0, x1: w, y1: Math.floor(h * 0.48) }),
  },
];

for (const job of jobs) {
  const outPath = path.join(samplesDir, job.file);
  const backupPath = path.join(sourceDir, job.file);
  if (!fs.existsSync(outPath) && !fs.existsSync(backupPath)) {
    console.warn(`Skip missing: ${job.file}`);
    continue;
  }

  // Prefer already-backed-up comparison shot as source
  const srcPath = fs.existsSync(backupPath) ? backupPath : outPath;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(srcPath, backupPath);
    console.log(`Backed up ${job.file} -> samples/_source/`);
  }

  const png = readPngRgba(srcPath);
  // Skip if already looks like a plan-only crop (narrower / shorter than source backup)
  const backup = readPngRgba(backupPath);
  const region = job.region(backup.width, backup.height);
  const cropped = crop(backup, region);
  writePngRgba(outPath, cropped.width, cropped.height, cropped.rgba);
  console.log(
    `Plan-only ${job.file}: ${backup.width}x${backup.height} -> ${cropped.width}x${cropped.height}`,
  );
}

// Pure 3D UI screenshots — not usable as floor-plan input
const remove3dOnly = ['furniture.png', 'scale1.png', 'scale2.png', 'wall1.png', 'wall2.png'];
for (const name of remove3dOnly) {
  const p = path.join(samplesDir, name);
  if (!fs.existsSync(p)) continue;
  const dest = path.join(sourceDir, name);
  if (!fs.existsSync(dest)) fs.copyFileSync(p, dest);
  fs.unlinkSync(p);
  console.log(`Removed 3D-only sample: ${name} (kept in _source/)`);
}

console.log('Sample preparation done.');
