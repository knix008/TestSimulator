// Rasterises assets/icon.svg — the one icon of the app, the installer, the
// uninstaller, the tray and the web favicon — into what Tauri bundles:
//
//   src-tauri/icons/icon.ico        Windows program + NSIS installer / uninstaller
//   src-tauri/icons/icon.icns       macOS bundle + DMG
//   src-tauri/icons/32x32.png, 128x128.png, 128x128@2x.png, icon.png (512)
//                                   Linux, the window and the tray icon
//   public/icon.svg                 favicon, title bar, start page, About
//
// sharp draws the SVG at every size, scripts/icons.mjs wraps the frames.
//   node scripts/generate-icons.mjs [--if-needed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIco, encodeIcns } from './icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets', 'icon.svg');
const out = path.join(root, 'src-tauri', 'icons');
const publicSvg = path.join(root, 'public', 'icon.svg');
const OUTPUTS = ['icon.ico', 'icon.icns', 'icon.png', '32x32.png', '128x128.png', '128x128@2x.png'];

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

function fresh() {
  const files = [...OUTPUTS.map((f) => path.join(out, f)), publicSvg];
  if (!files.every((f) => fs.existsSync(f))) return false;
  const svgTime = fs.statSync(source).mtimeMs;
  return files.every((f) => fs.statSync(f).mtimeMs >= svgTime);
}

async function png(sharp, size) {
  const m = /width="(\d+)"/.exec(fs.readFileSync(source, 'utf8'));
  const base = m ? Number(m[1]) : 1024;
  return sharp(source, { density: Math.max(36, Math.min(2400, (72 * 2 * size) / base)) })
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
  fs.mkdirSync(out, { recursive: true });

  const ico = [];
  for (const size of ICO_SIZES) {
    const image = await png(sharp, size);
    const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    ico.push({ size, png: new Uint8Array(image), rgba: data });
  }
  fs.writeFileSync(path.join(out, 'icon.ico'), encodeIco(ico));
  const icns = [];
  for (const size of ICNS_SIZES) icns.push({ size, png: new Uint8Array(await png(sharp, size)) });
  fs.writeFileSync(path.join(out, 'icon.icns'), encodeIcns(icns));
  fs.writeFileSync(path.join(out, '32x32.png'), await png(sharp, 32));
  fs.writeFileSync(path.join(out, '128x128.png'), await png(sharp, 128));
  fs.writeFileSync(path.join(out, '128x128@2x.png'), await png(sharp, 256));
  fs.writeFileSync(path.join(out, 'icon.png'), await png(sharp, 512));

  fs.mkdirSync(path.dirname(publicSvg), { recursive: true });
  fs.copyFileSync(source, publicSvg);
  console.log('[icons] Wrote ICO, ICNS and PNG sizes to src-tauri/icons, and public/icon.svg');
}

main().catch((err) => {
  console.error('[icons] Failed:', err);
  process.exit(1);
});
