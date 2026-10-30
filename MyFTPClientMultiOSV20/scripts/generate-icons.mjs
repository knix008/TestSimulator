// Generates every platform icon from assets/icon.svg — the one icon used by
// the app window, the installer, the uninstaller and the web favicon — into
// src-tauri/icons/, where tauri.conf.json (bundle.icon) picks them up:
//
//   32x32.png  128x128.png  128x128@2x.png  icon.png (512)
//   icon.ico   (Windows exe + NSIS installer)
//   icon.icns  (macOS bundle + DMG)
//
// sharp rasterizes the SVG at every size, then our own ICO/ICNS encoders
// (scripts/ico.mjs) wrap the PNGs into the containers.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { encodeIco, encodeIcns } from './ico.mjs';
import { syncPublicSvgs } from './sync-public-svgs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src-tauri', 'icons');

const PNGS = { '32x32.png': 32, '128x128.png': 128, '128x128@2x.png': 256, 'icon.png': 512 };
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function main() {
  const sharp = (await import('sharp')).default;
  const appSvg = path.join(root, 'assets', 'icon.svg');
  if (!fs.existsSync(appSvg)) {
    console.error(`[icons] Source not found: ${appSvg}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const png = (size) => sharp(appSvg, { density: 512 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();

  for (const [name, size] of Object.entries(PNGS)) fs.writeFileSync(path.join(outDir, name), await png(size));
  console.log(`[icons] Wrote ${Object.keys(PNGS).join(', ')}`);

  const ico = [];
  for (const size of ICO_SIZES) ico.push({ size, png: new Uint8Array(await png(size)) });
  fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.from(encodeIco(ico)));
  const icns = [];
  for (const size of ICNS_SIZES) icns.push({ size, png: new Uint8Array(await png(size)) });
  fs.writeFileSync(path.join(outDir, 'icon.icns'), Buffer.from(encodeIcns(icns)));
  console.log('[icons] Wrote icon.ico, icon.icns');

  console.log(`[icons] Synced public/${syncPublicSvgs().join(', public/')}`);
}

main().catch((err) => {
  console.error('[icons] Failed:', err);
  process.exit(1);
});
