// Rasterize assets/icon.svg into the PNG, ICO and ICNS files Tauri bundles
// for Windows, Linux and macOS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIco, encodeIcns } from './icons.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'assets', 'icon.svg');
const tauriIcons = path.join(root, 'src-tauri', 'icons');
const buildIcons = path.join(root, 'build', 'icons');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

function fresh() {
  const ico = path.join(tauriIcons, 'icon.ico');
  const icns = path.join(tauriIcons, 'icon.icns');
  if (!fs.existsSync(ico) || !fs.existsSync(icns)) return false;
  const svgTime = fs.statSync(svgPath).mtimeMs;
  return fs.statSync(ico).mtimeMs >= svgTime && fs.statSync(icns).mtimeMs >= svgTime;
}

async function png(sharp, size) {
  return sharp(svgPath, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  if (process.argv.includes('--if-needed') && fresh()) {
    console.log('[icons] Up to date');
    return;
  }
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(tauriIcons, { recursive: true });
  fs.mkdirSync(buildIcons, { recursive: true });

  const icoEntries = [];
  for (const size of ICO_SIZES) {
    const image = await png(sharp, size);
    const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    icoEntries.push({ size, png: new Uint8Array(image), rgba: data });
    fs.writeFileSync(path.join(buildIcons, `${size}x${size}.png`), image);
  }
  const ico = encodeIco(icoEntries);
  fs.writeFileSync(path.join(tauriIcons, 'icon.ico'), ico);
  fs.writeFileSync(path.join(buildIcons, 'icon.ico'), ico);

  const icnsEntries = [];
  for (const size of ICNS_SIZES) {
    const image = await png(sharp, size);
    icnsEntries.push({ size, png: new Uint8Array(image) });
  }
  const icns = encodeIcns(icnsEntries);
  fs.writeFileSync(path.join(tauriIcons, 'icon.icns'), icns);
  fs.writeFileSync(path.join(buildIcons, 'icon.icns'), icns);

  fs.copyFileSync(path.join(buildIcons, '32x32.png'), path.join(tauriIcons, '32x32.png'));
  fs.copyFileSync(path.join(buildIcons, '128x128.png'), path.join(tauriIcons, '128x128.png'));
  fs.copyFileSync(path.join(buildIcons, '256x256.png'), path.join(tauriIcons, '128x128@2x.png'));
  fs.copyFileSync(svgPath, path.join(root, 'public', 'icon.svg'));
  console.log('[icons] Wrote ICO, ICNS and PNG sizes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
