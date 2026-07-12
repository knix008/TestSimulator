/**
 * Generates platform-specific icon files from icon.svg.
 * Run: node scripts/generate-icons.js
 * Requires: sharp (devDependency)
 */

'use strict';
const path = require('path');
const fs = require('fs');

const SVG_SRC = path.join(__dirname, '../assets/icons/icon.svg');
const ICONS_DIR = path.join(__dirname, '../assets/icons');

/** Pack one or more PNG buffers into a Windows .ico (PNG-compressed entries). */
function pngsToIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = [];

  for (const png of pngBuffers) {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    entries.push({
      width: width >= 256 ? 0 : width,
      height: height >= 256 ? 0 : height,
      size: png.length,
      offset,
      png,
    });
    offset += png.length;
  }

  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);      // reserved
  out.writeUInt16LE(1, 2);      // type = icon
  out.writeUInt16LE(count, 4);  // image count

  let pos = 6;
  for (const e of entries) {
    out.writeUInt8(e.width, pos); pos += 1;
    out.writeUInt8(e.height, pos); pos += 1;
    out.writeUInt8(0, pos); pos += 1; // palette
    out.writeUInt8(0, pos); pos += 1; // reserved
    out.writeUInt16LE(1, pos); pos += 2; // color planes
    out.writeUInt16LE(32, pos); pos += 2; // bits per pixel
    out.writeUInt32LE(e.size, pos); pos += 4;
    out.writeUInt32LE(e.offset, pos); pos += 4;
  }
  for (const e of entries) {
    e.png.copy(out, e.offset);
  }
  return out;
}

async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.warn('[icons] sharp not found — skipping icon generation.');
    console.warn('[icons] Run: npm install   then retry.');
    return false;
  }

  if (!fs.existsSync(SVG_SRC)) {
    console.error('[icons] icon.svg not found at', SVG_SRC);
    process.exit(1);
  }

  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const svgBuffer = fs.readFileSync(SVG_SRC);

  const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const pngBySize = new Map();

  console.log('[icons] Generating PNG sizes...');
  for (const size of pngSizes) {
    const buf = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    pngBySize.set(size, buf);
    fs.writeFileSync(path.join(ICONS_DIR, `icon-${size}.png`), buf);
    console.log(`  ✓ icon-${size}.png`);
  }

  // Generic fallback used by Linux / Electron BrowserWindow
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.png'), pngBySize.get(512));
  console.log('  ✓ icon.png (512x512)');

  // Windows multi-size ICO (no ImageMagick required)
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuf = pngsToIco(icoSizes.map((s) => pngBySize.get(s)));
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.ico'), icoBuf);
  console.log('  ✓ icon.ico');

  // macOS ICNS (only on darwin)
  if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process');
      const iconsetDir = path.join(ICONS_DIR, 'icon.iconset');
      fs.mkdirSync(iconsetDir, { recursive: true });

      const icnsSizes = [16, 32, 128, 256, 512];
      for (const s of icnsSizes) {
        fs.copyFileSync(
          path.join(ICONS_DIR, `icon-${s}.png`),
          path.join(iconsetDir, `icon_${s}x${s}.png`)
        );
        if (pngBySize.has(s * 2)) {
          fs.copyFileSync(
            path.join(ICONS_DIR, `icon-${s * 2}.png`),
            path.join(iconsetDir, `icon_${s}x${s}@2x.png`)
          );
        }
      }
      execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(ICONS_DIR, 'icon.icns')}"`, { stdio: 'ignore' });
      fs.rmSync(iconsetDir, { recursive: true, force: true });
      console.log('  ✓ icon.icns');
    } catch (e) {
      console.log('  ℹ icon.icns — skipped:', e.message);
    }
  } else {
    console.log('  ℹ icon.icns — skipped (run on macOS to generate)');
  }

  console.log('[icons] Done.');
  return true;
}

if (require.main === module) {
  generateIcons().catch((err) => {
    console.error('[icons] Error:', err);
    process.exit(1);
  });
}

module.exports = { generateIcons };
