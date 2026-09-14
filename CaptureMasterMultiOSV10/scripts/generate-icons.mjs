// Generates every platform icon from the two source SVGs:
//
//   assets/icon.svg       → the application icon
//     build/icons/icon.ico   (Windows app + installer + uninstaller)
//     build/icons/icon.icns  (macOS app bundle)
//     build/icons/icon.png   (512, generic)
//     build/icons/png/<size>x<size>.png  (Linux icon set)
//
//   assets/file-icon.svg  → the icon of the app's own document type (.cmcap)
//     build/icons/file.ico   (Windows shell association)
//     build/icons/file.icns  (macOS document type)
//     build/icons/file.png   (512, Linux/web)
//
// sharp rasterizes each SVG at every size, then our own ICO/ICNS encoders
// (src/lib/ico.mjs) wrap the PNGs into the containers. That file is .mjs rather
// than .js because Node runs it directly: the package has no "type": "module"
// (electron/main.js, electron/preload.js and scripts/copy-installer.js are all
// CommonJS), so a bare .js would be sniffed as CJS first and warn.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { encodeIco, encodeIcns } from '../src/lib/ico.mjs';
import { syncPublicSvgs } from './sync-public-svgs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'build', 'icons');
const pngDir = path.join(outDir, 'png');

const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function main() {
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(pngDir, { recursive: true });

  const rasterize = (svgPath) => (size) =>
    sharp(svgPath, { density: 512 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

  // ── Application icon ────────────────────────────────────
  const appSvg = path.join(root, 'assets', 'icon.svg');
  if (!fs.existsSync(appSvg)) {
    console.error(`[icons] Source not found: ${appSvg}`);
    process.exit(1);
  }
  const appPng = rasterize(appSvg);

  for (const size of LINUX_SIZES) {
    fs.writeFileSync(path.join(pngDir, `${size}x${size}.png`), await appPng(size));
  }
  fs.copyFileSync(path.join(pngDir, '512x512.png'), path.join(outDir, 'icon.png'));
  console.log(`[icons] Wrote ${LINUX_SIZES.length} PNG sizes + icon.png`);

  const icoEntries = [];
  for (const size of ICO_SIZES) icoEntries.push({ size, png: new Uint8Array(await appPng(size)) });
  fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.from(encodeIco(icoEntries)));
  console.log('[icons] Wrote icon.ico');

  const icnsEntries = [];
  for (const size of ICNS_SIZES) icnsEntries.push({ size, png: new Uint8Array(await appPng(size)) });
  fs.writeFileSync(path.join(outDir, 'icon.icns'), Buffer.from(encodeIcns(icnsEntries)));
  console.log('[icons] Wrote icon.icns');

  // ── Document (.cmcap) icon ──────────────────────────────
  const fileSvg = path.join(root, 'assets', 'file-icon.svg');
  if (fs.existsSync(fileSvg)) {
    const filePng = rasterize(fileSvg);

    fs.writeFileSync(path.join(outDir, 'file.png'), await filePng(512));

    const fIco = [];
    for (const size of ICO_SIZES) fIco.push({ size, png: new Uint8Array(await filePng(size)) });
    fs.writeFileSync(path.join(outDir, 'file.ico'), Buffer.from(encodeIco(fIco)));

    const fIcns = [];
    for (const size of ICNS_SIZES) fIcns.push({ size, png: new Uint8Array(await filePng(size)) });
    fs.writeFileSync(path.join(outDir, 'file.icns'), Buffer.from(encodeIcns(fIcns)));
    console.log('[icons] Wrote file.ico / file.icns / file.png (.cmcap document type)');
  }

  // Keep the web/UI copies in sync with the sources. (Also done by
  // `npm run prepare:assets`, so a plain start/dev has them too.)
  console.log(`[icons] Synced public/${syncPublicSvgs().join(', public/')}`);
}

main().catch((err) => {
  console.error('[icons] Failed:', err);
  process.exit(1);
});
