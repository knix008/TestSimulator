// npm run build:icons — every picture the program and its installer need, from assets/icon.svg:
//   src-tauri/icons/  32x32.png, 128x128.png, 128x128@2x.png, icon.png (512), icon.ico, icon.icns
//   public/icon.png   the page's icon (256)
//   src-tauri/windows/installerHeader.bmp (150×57) and installerSidebar.bmp (164×314) for NSIS
// sharp draws the SVG; the app's own encoders (src/lib/ico.js) pack .ico and .icns; the BMPs are
// written here (24-bit, bottom-up) because sharp cannot write BMP.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encodeIco, encodeIcns } from '../src/lib/ico.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'));
const icons = path.join(root, 'src-tauri', 'icons');
fs.mkdirSync(icons, { recursive: true });

const png = (size) => sharp(svg, { density: Math.max(72, (72 * size) / 1024 * 4) }).resize(size, size).png().toBuffer();

async function iconFiles() {
  const out = {};
  for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024]) out[size] = await png(size);
  fs.writeFileSync(path.join(icons, '32x32.png'), out[32]);
  fs.writeFileSync(path.join(icons, '128x128.png'), out[128]);
  fs.writeFileSync(path.join(icons, '128x128@2x.png'), out[256]);
  fs.writeFileSync(path.join(icons, 'icon.png'), out[512]);
  fs.writeFileSync(path.join(icons, 'icon.ico'), encodeIco([16, 20, 24, 32, 40, 48, 64, 128, 256].map((size) => ({ size, png: new Uint8Array(out[size]) }))));
  fs.writeFileSync(path.join(icons, 'icon.icns'), encodeIcns([16, 32, 64, 128, 256, 512, 1024].map((size) => ({ size, png: new Uint8Array(out[size]) }))));
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'icon.png'), out[256]);
}

/** A 24-bit BMP from raw RGB(A) pixels. */
function bmp(width, height, rgba, channels) {
  const row = Math.ceil((width * 3) / 4) * 4;
  const size = 54 + row * height;
  const buf = Buffer.alloc(size);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(size, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * height, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y += 1) {
    const src = (height - 1 - y) * width * channels;
    const dst = 54 + y * row;
    for (let x = 0; x < width; x += 1) {
      buf[dst + x * 3] = rgba[src + x * channels + 2];
      buf[dst + x * 3 + 1] = rgba[src + x * channels + 1];
      buf[dst + x * 3 + 2] = rgba[src + x * channels];
    }
  }
  return buf;
}

async function installerPictures() {
  const dir = path.join(root, 'src-tauri', 'windows');
  fs.mkdirSync(dir, { recursive: true });
  const art = (w, h, iconSize, ix, iy, text) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    ${text ? `<text x="${w / 2}" y="${iy + iconSize + 34}" font-family="Segoe UI, Arial" font-size="19" font-weight="700" fill="#ffffff" text-anchor="middle">MyICOMaker</text>
    <text x="${w / 2}" y="${iy + iconSize + 56}" font-family="Segoe UI, Arial" font-size="11" fill="#bfdbfe" text-anchor="middle">Icon designer</text>` : ''}
  </svg>`);
  const make = async (w, h, iconSize, ix, iy, text, file) => {
    const icon = await png(iconSize);
    const { data, info } = await sharp(art(w, h, iconSize, ix, iy, text)).composite([{ input: icon, left: ix, top: iy }]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    fs.writeFileSync(path.join(dir, file), bmp(info.width, info.height, data, info.channels));
  };
  await make(164, 314, 112, 26, 70, true, 'installerSidebar.bmp');
  // The header: white, the icon at the right (NSIS draws its texts on the left).
  const icon = await png(48);
  const { data, info } = await sharp({ create: { width: 150, height: 57, channels: 3, background: '#ffffff' } }).composite([{ input: icon, left: 96, top: 4 }]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  fs.writeFileSync(path.join(dir, 'installerHeader.bmp'), bmp(info.width, info.height, data, info.channels));
}

await iconFiles();
await installerPictures();
console.log('[icons] src-tauri/icons, public/icon.png and the installer pictures are up to date.');
