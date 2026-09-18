/**
 * create-icons.js — rasterise src/assets/icon.svg (app) and src/assets/dcmfile.svg (document)
 * into the PNG / ICO files electron-builder and the window need:
 *
 *   src/assets/icon.png (512)   src/assets/icon.ico   build/icon.png   build/icon.ico   build/dcmfile.ico
 *
 * Needs the `sharp` devDependency (npm install).  node scripts/create-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'src', 'assets');
const BUILD = path.join(ROOT, 'build');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** RGBA → ICO BMP (BITMAPINFOHEADER, 32 bpp, bottom-up, empty AND mask). */
function rgbaToDib(rgba, size) {
  const andRow = ((size + 31) >> 5) * 4;
  const buf = Buffer.alloc(40 + size * size * 4 + andRow * size);
  buf.writeUInt32LE(40, 0); buf.writeInt32LE(size, 4); buf.writeInt32LE(size * 2, 8);
  buf.writeUInt16LE(1, 12); buf.writeUInt16LE(32, 14); buf.writeUInt32LE(0, 16); buf.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) {
    const sy = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const si = (sy * size + x) * 4, di = 40 + (y * size + x) * 4;
      buf[di] = rgba[si + 2]; buf[di + 1] = rgba[si + 1]; buf[di + 2] = rgba[si]; buf[di + 3] = rgba[si + 3];
    }
  }
  return buf;
}

function buildIco(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach((e, i) => {
    const o = 6 + i * 16;
    header[o] = e.size >= 256 ? 0 : e.size; header[o + 1] = e.size >= 256 ? 0 : e.size;
    header.writeUInt16LE(1, o + 4); header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(e.data.length, o + 8); header.writeUInt32LE(offset, o + 12);
    offset += e.data.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e.data)]);
}

async function icoFromSvg(svg) {
  const entries = [];
  for (const size of ICO_SIZES) {
    const img = sharp(svg).resize(size, size);
    if (size >= 256) entries.push({ size, data: await img.png().toBuffer() });
    else entries.push({ size, data: rgbaToDib(await img.ensureAlpha().raw().toBuffer(), size) });
  }
  return buildIco(entries);
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true });
  const appSvg = path.join(ASSETS, 'icon.svg');
  const docSvg = path.join(ASSETS, 'dcmfile.svg');
  const png512 = await sharp(appSvg).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), png512);
  fs.writeFileSync(path.join(BUILD, 'icon.png'), png512);
  const ico = await icoFromSvg(appSvg);
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico);
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico);
  fs.writeFileSync(path.join(BUILD, 'dcmfile.ico'), await icoFromSvg(docSvg));
  fs.writeFileSync(path.join(BUILD, 'dcmfile.png'), await sharp(docSvg).resize(256, 256).png().toBuffer());
  console.log('icons written to src/assets and build/');
}

main().catch((err) => { console.error(err); process.exit(1); });
