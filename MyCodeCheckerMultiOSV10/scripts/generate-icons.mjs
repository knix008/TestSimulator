// Rasterize assets/icon.svg into the PNG, ICO and ICNS files Tauri bundles
// for Windows, Linux and macOS, and assets/project-file.svg into the icon of
// project files (*.mccp: mccp.ico / mccp.icns / mccp.png).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIco, encodeIcns } from './icons.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'assets', 'icon.svg');
const fileSvgPath = path.join(root, 'assets', 'project-file.svg');
const tauriIcons = path.join(root, 'src-tauri', 'icons');
const buildIcons = path.join(root, 'build', 'icons');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

function fresh() {
  const ico = path.join(tauriIcons, 'icon.ico');
  const icns = path.join(tauriIcons, 'icon.icns');
  if (!fs.existsSync(ico) || !fs.existsSync(icns)) return false;
  const fileIco = path.join(tauriIcons, 'mccp.ico');
  if (!fs.existsSync(fileIco)) return false;
  const svgTime = Math.max(fs.statSync(svgPath).mtimeMs, fs.statSync(fileSvgPath).mtimeMs);
  return fs.statSync(ico).mtimeMs >= svgTime && fs.statSync(icns).mtimeMs >= svgTime && fs.statSync(fileIco).mtimeMs >= svgTime;
}

async function png(sharp, size, source = svgPath) {
  return sharp(source, { density: 384 })
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

  // Project file icon (*.mccp)
  const fileIcoEntries = [];
  for (const size of ICO_SIZES) {
    const image = await png(sharp, size, fileSvgPath);
    const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    fileIcoEntries.push({ size, png: new Uint8Array(image), rgba: data });
  }
  fs.writeFileSync(path.join(tauriIcons, 'mccp.ico'), encodeIco(fileIcoEntries));
  const fileIcnsEntries = [];
  for (const size of ICNS_SIZES) fileIcnsEntries.push({ size, png: new Uint8Array(await png(sharp, size, fileSvgPath)) });
  fs.writeFileSync(path.join(tauriIcons, 'mccp.icns'), encodeIcns(fileIcnsEntries));
  fs.writeFileSync(path.join(tauriIcons, 'mccp.png'), await png(sharp, 256, fileSvgPath));
  fs.copyFileSync(fileSvgPath, path.join(root, 'public', 'project-file.svg'));
  console.log('[icons] Wrote ICO, ICNS and PNG sizes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
