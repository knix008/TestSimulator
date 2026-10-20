// Generates every platform icon from the two source SVGs, where Tauri looks
// for them:
//
//   assets/icon.svg       → the application icon
//     src-tauri/icons/icon.ico    (Windows exe + installer)
//     src-tauri/icons/icon.icns   (macOS app bundle)
//     src-tauri/icons/icon.png    (512, generic)
//     src-tauri/icons/32x32.png, 128x128.png, 128x128@2x.png  (bundle icon set)
//
//   assets/file-icon.svg  → the icon of the app's own document type (.pdfvw)
//     src-tauri/icons/file.ico    (Windows shell association, set by the installer)
//     src-tauri/icons/file.icns   (macOS document type)
//     src-tauri/icons/file.png    (512, Linux/web)
//
// sharp rasterizes each SVG at every size, then our own ICO/ICNS encoders
// (src/lib/ico.mjs) wrap the PNGs into the containers. tauri-build embeds
// icon.ico into the exe at compile time, so the outputs are committed: a fresh
// clone can run `cargo build` before any npm script.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { encodeIco, encodeIcns } from '../src/lib/ico.mjs';
import { syncPublicSvgs } from './sync-public-svgs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src-tauri', 'icons');

// name → pixel size of the PNGs Tauri bundles.
const BUNDLE_PNGS = { '32x32.png': 32, '128x128.png': 128, '128x128@2x.png': 256, 'icon.png': 512 };
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function main() {
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(outDir, { recursive: true });

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

  for (const [name, size] of Object.entries(BUNDLE_PNGS)) {
    fs.writeFileSync(path.join(outDir, name), await appPng(size));
  }
  console.log(`[icons] Wrote ${Object.keys(BUNDLE_PNGS).join(', ')}`);

  const icoEntries = [];
  for (const size of ICO_SIZES) icoEntries.push({ size, png: new Uint8Array(await appPng(size)) });
  fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.from(encodeIco(icoEntries)));
  console.log('[icons] Wrote icon.ico');

  const icnsEntries = [];
  for (const size of ICNS_SIZES) icnsEntries.push({ size, png: new Uint8Array(await appPng(size)) });
  fs.writeFileSync(path.join(outDir, 'icon.icns'), Buffer.from(encodeIcns(icnsEntries)));
  console.log('[icons] Wrote icon.icns');

  // ── Document (.pdfvw) icon ──────────────────────────────
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
    console.log('[icons] Wrote file.ico / file.icns / file.png (.pdfvw document type)');
  }

  // Keep the web/UI copies in sync with the sources. (Also done by
  // `npm run prepare:assets`, so a plain start/dev has them too.)
  console.log(`[icons] Synced public/${syncPublicSvgs().join(', public/')}`);
}

main().catch((err) => {
  console.error('[icons] Failed:', err);
  process.exit(1);
});
