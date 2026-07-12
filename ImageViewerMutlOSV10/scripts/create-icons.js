/**
 * create-icons.js — rebuild PNG / ICO from src/assets/icon.svg
 *
 * Windows PE resources (rcedit → .exe) work most reliably with BMP/DIB
 * entries in the ICO (PNG-only ICOs often leave the stock Electron icon).
 *
 *   node scripts/create-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'src', 'assets');
const SVG = path.join(ASSETS, 'icon.svg');
/** Classic BMP sizes for Shell / PE; 256 uses PNG (Vista+). */
const BMP_SIZES = [16, 24, 32, 48, 64, 128];
const PNG_SIZES = [256];

/** Raw RGBA → Windows ICO BMP (BI_RGB) entry: BITMAPINFOHEADER + BGRA + AND mask */
function rgbaToIcoBmp(rgba, size) {
  const headerSize = 40;
  const xorSize = size * size * 4;
  const andRow = ((size + 31) >> 5) * 4; // 1-bit mask, DWORD-aligned
  const andSize = andRow * size;
  const buf = Buffer.alloc(headerSize + xorSize + andSize);

  buf.writeUInt32LE(headerSize, 0);
  buf.writeInt32LE(size, 4);
  buf.writeInt32LE(size * 2, 8); // height includes AND mask
  buf.writeUInt16LE(1, 12);      // planes
  buf.writeUInt16LE(32, 14);     // bit count
  buf.writeUInt32LE(0, 16);      // BI_RGB
  buf.writeUInt32LE(xorSize, 20);

  // XOR bitmap bottom-up BGRA
  for (let y = 0; y < size; y++) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const si = (srcY * size + x) * 4;
      const di = headerSize + (y * size + x) * 4;
      buf[di] = rgba[si + 2];
      buf[di + 1] = rgba[si + 1];
      buf[di + 2] = rgba[si];
      buf[di + 3] = rgba[si + 3];
    }
  }

  // AND mask: 0 = opaque (alpha used for transparency in 32bpp)
  // leave zeros

  return buf;
}

function buildIco(entries) {
  // entries: [{ width, height, data: Buffer }]
  const count = entries.length;
  const headerSize = 6;
  const dirSize = 16 * count;
  let offset = headerSize + dirSize;
  const offsets = entries.map((e) => {
    const o = offset;
    offset += e.data.length;
    return o;
  });

  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);

  for (let i = 0; i < count; i++) {
    const e = entries[i];
    const o = 6 + i * 16;
    out[o] = e.width >= 256 ? 0 : e.width;
    out[o + 1] = e.height >= 256 ? 0 : e.height;
    out[o + 2] = 0;
    out[o + 3] = 0;
    out.writeUInt16LE(1, o + 4);
    out.writeUInt16LE(32, o + 6);
    out.writeUInt32LE(e.data.length, o + 8);
    out.writeUInt32LE(offsets[i], o + 12);
  }

  for (let i = 0; i < count; i++) {
    entries[i].data.copy(out, offsets[i]);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(SVG)) throw new Error(`Missing ${SVG}`);

  const svg = fs.readFileSync(SVG);
  const density = 384;

  const png512 = await sharp(svg, { density })
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(ASSETS, 'icon_512.png'), png512);

  const png256 = await sharp(png512).resize(256, 256).png().toBuffer();
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), png256);

  const entries = [];

  for (const size of BMP_SIZES) {
    const { data } = await sharp(svg, { density: Math.max(192, size * 4) })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    entries.push({ width: size, height: size, data: rgbaToIcoBmp(data, size) });
  }

  for (const size of PNG_SIZES) {
    const png = await sharp(svg, { density: Math.max(192, size * 4) })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    entries.push({ width: size, height: size, data: png });
  }

  const ico = buildIco(entries);
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico);

  console.log('[create-icons] Wrote icon.svg → icon.png, icon_512.png, icon.ico');
  console.log(`  icon.ico ${ico.length} bytes (BMP ${BMP_SIZES.join('/')}, PNG ${PNG_SIZES.join('/')})`);
}

main().catch((err) => {
  console.error('[create-icons] Failed:', err.message);
  process.exit(1);
});
