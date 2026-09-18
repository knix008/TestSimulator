// Generates every platform icon from assets/icon.svg — the one icon used by
// the app, the installer, the uninstaller and the web favicon:
//
//   build/icons/icon.ico             (Windows app + NSIS installer/uninstaller)
//   build/icons/icon.icns            (macOS app bundle + DMG)
//   build/icons/icon.png             (512, generic / Linux resources)
//   build/icons/png/<size>x<size>.png (Linux icon set)
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
const outDir = path.join(root, 'build', 'icons');
const pngDir = path.join(outDir, 'png');

const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function main() {
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(pngDir, { recursive: true });

  const appSvg = path.join(root, 'assets', 'icon.svg');
  if (!fs.existsSync(appSvg)) {
    console.error(`[icons] Source not found: ${appSvg}`);
    process.exit(1);
  }

  // Rasterize the app icon at `size`, optionally compositing a badge SVG on top.
  const rasterize = (badgeSvg) => async (size) => {
    let img = sharp(appSvg, { density: 512 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    if (badgeSvg) {
      const badge = await sharp(badgeSvg, { density: 512 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
      img = sharp(await img.png().toBuffer()).composite([{ input: badge, top: 0, left: 0 }]);
    }
    return img.png().toBuffer();
  };

  async function writeSet(name, png, { icns = true, linuxSet = false } = {}) {
    if (linuxSet) {
      for (const size of LINUX_SIZES) {
        fs.writeFileSync(path.join(pngDir, `${size}x${size}.png`), await png(size));
      }
      fs.copyFileSync(path.join(pngDir, '512x512.png'), path.join(outDir, `${name}.png`));
      console.log(`[icons] Wrote ${LINUX_SIZES.length} PNG sizes + ${name}.png`);
    } else {
      fs.writeFileSync(path.join(outDir, `${name}.png`), await png(512));
    }

    const ico = [];
    for (const size of ICO_SIZES) {
      const pngBuf = await png(size);
      const { data } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      ico.push({ size, png: new Uint8Array(pngBuf), rgba: data });
    }
    fs.writeFileSync(path.join(outDir, `${name}.ico`), Buffer.from(encodeIco(ico)));
    console.log(`[icons] Wrote ${name}.ico (${ICO_SIZES.join(', ')} px BMP)`);

    if (icns) {
      const entries = [];
      for (const size of ICNS_SIZES) entries.push({ size, png: new Uint8Array(await png(size)) });
      fs.writeFileSync(path.join(outDir, `${name}.icns`), Buffer.from(encodeIcns(entries)));
      console.log(`[icons] Wrote ${name}.icns`);
    }
  }

  await writeSet('icon', rasterize(null), { linuxSet: true });

  console.log(`[icons] Synced public/${syncPublicSvgs().join(', public/')}`);
}

main().catch((err) => {
  console.error('[icons] Failed:', err);
  process.exit(1);
});
