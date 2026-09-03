// Generates application icons for all platforms from assets/icon.svg:
//   build/icons/icon.ico   (Windows)
//   build/icons/icon.icns  (macOS)
//   build/icons/icon.png   (512, generic)
//   build/icons/png/<size>x<size>.png  (Linux set)
//
// Uses sharp to rasterize the SVG at each size, then our own ICO/ICNS
// encoders (shared with the app) to wrap the PNGs into the containers.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { encodeIco, encodeIcns } from '../src/lib/ico.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svg = path.join(root, 'assets', 'icon.svg');
const outDir = path.join(root, 'build', 'icons');
const pngDir = path.join(outDir, 'png');

fs.mkdirSync(pngDir, { recursive: true });

const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function main() {
  if (!fs.existsSync(svg)) {
    console.error(`[icons] Source not found: ${svg}`);
    process.exit(1);
  }
  const sharp = (await import('sharp')).default;

  const png = (size) =>
    sharp(svg, { density: 512 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

  // Linux PNG set + generic 512 icon.
  for (const size of LINUX_SIZES) {
    fs.writeFileSync(path.join(pngDir, `${size}x${size}.png`), await png(size));
  }
  fs.copyFileSync(path.join(pngDir, '512x512.png'), path.join(outDir, 'icon.png'));
  console.log(`[icons] Wrote ${LINUX_SIZES.length} PNG sizes + icon.png`);

  // ICO (Windows)
  const icoEntries = [];
  for (const size of ICO_SIZES) icoEntries.push({ size, png: new Uint8Array(await png(size)) });
  fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.from(encodeIco(icoEntries)));
  console.log('[icons] Wrote icon.ico');

  // ICNS (macOS)
  const icnsEntries = [];
  for (const size of ICNS_SIZES) icnsEntries.push({ size, png: new Uint8Array(await png(size)) });
  fs.writeFileSync(path.join(outDir, 'icon.icns'), Buffer.from(encodeIcns(icnsEntries)));
  console.log('[icons] Wrote icon.icns');

  // Keep the committed web/UI copy in sync with the source SVG.
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.copyFileSync(svg, path.join(root, 'public', 'icon.svg'));
  console.log('[icons] Synced public/icon.svg');
}

main().catch((err) => {
  console.error('[icons] Failed:', err);
  process.exit(1);
});
