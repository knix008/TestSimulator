// Rasterises assets/icon.svg into the PNG, ICO and ICNS files Tauri bundles
// for Windows, Linux and macOS, and the document icons of the file types
// (assets/m-file.svg → m.ico / m.icns, assets/model-file.svg → msim.ico /
// msim.icns). The SVGs are also copied to public/ for the page.
//   node scripts/generate-icons.mjs [--if-needed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIco, encodeIcns } from './icons.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const tauriIcons = path.join(root, 'src-tauri', 'icons');
const buildIcons = path.join(root, 'build', 'icons');
const SOURCES = { app: 'icon.svg', m: 'm-file.svg', msim: 'model-file.svg' };

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

function fresh() {
  const outs = ['icon.ico', 'icon.icns', 'm.ico', 'msim.ico'].map((f) => path.join(tauriIcons, f));
  if (!outs.every((f) => fs.existsSync(f))) return false;
  if (!Object.values(SOURCES).every((f) => fs.existsSync(path.join(root, 'public', f)))) return false;
  const svgTime = Math.max(...Object.values(SOURCES).map((f) => fs.statSync(path.join(assets, f)).mtimeMs));
  return outs.every((f) => fs.statSync(f).mtimeMs >= svgTime);
}

async function png(sharp, size, source) {
  const m = /width="(\d+)"/.exec(fs.readFileSync(source, 'utf8'));
  const base = m ? Number(m[1]) : 1024;
  return sharp(source, { density: Math.max(36, Math.min(2400, (72 * 2 * size) / base)) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function icoOf(sharp, source) {
  const entries = [];
  for (const size of ICO_SIZES) {
    const image = await png(sharp, size, source);
    const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    entries.push({ size, png: new Uint8Array(image), rgba: data });
  }
  return encodeIco(entries);
}

async function icnsOf(sharp, source) {
  const entries = [];
  for (const size of ICNS_SIZES) entries.push({ size, png: new Uint8Array(await png(sharp, size, source)) });
  return encodeIcns(entries);
}

async function main() {
  if (process.argv.includes('--if-needed') && fresh()) {
    console.log('[icons] Up to date');
    return;
  }
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(tauriIcons, { recursive: true });
  fs.mkdirSync(buildIcons, { recursive: true });
  const app = path.join(assets, SOURCES.app);

  for (const size of ICO_SIZES) fs.writeFileSync(path.join(buildIcons, `${size}x${size}.png`), await png(sharp, size, app));
  const ico = await icoOf(sharp, app);
  fs.writeFileSync(path.join(tauriIcons, 'icon.ico'), ico);
  fs.writeFileSync(path.join(buildIcons, 'icon.ico'), ico);
  const icns = await icnsOf(sharp, app);
  fs.writeFileSync(path.join(tauriIcons, 'icon.icns'), icns);
  fs.writeFileSync(path.join(buildIcons, 'icon.icns'), icns);
  fs.copyFileSync(path.join(buildIcons, '32x32.png'), path.join(tauriIcons, '32x32.png'));
  fs.copyFileSync(path.join(buildIcons, '128x128.png'), path.join(tauriIcons, '128x128.png'));
  fs.copyFileSync(path.join(buildIcons, '256x256.png'), path.join(tauriIcons, '128x128@2x.png'));
  fs.writeFileSync(path.join(tauriIcons, 'icon.png'), await png(sharp, 512, app));

  for (const kind of ['m', 'msim']) {
    const src = path.join(assets, SOURCES[kind]);
    fs.writeFileSync(path.join(tauriIcons, `${kind}.ico`), await icoOf(sharp, src));
    fs.writeFileSync(path.join(tauriIcons, `${kind}.icns`), await icnsOf(sharp, src));
    fs.writeFileSync(path.join(tauriIcons, `${kind}.png`), await png(sharp, 256, src));
  }
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  for (const f of Object.values(SOURCES)) fs.copyFileSync(path.join(assets, f), path.join(root, 'public', f));
  console.log('[icons] Wrote ICO, ICNS and PNG sizes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
