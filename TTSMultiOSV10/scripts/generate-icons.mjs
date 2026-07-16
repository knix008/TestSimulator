/**
 * Render assets/icon.svg → transparent PNG + multi-size ICO for electron-builder.
 * Corners must stay alpha=0 (no black matte) or Windows shortcuts/installers show a black square.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const svgPath = path.join(assets, 'icon.svg');
const pngPath = path.join(assets, 'icon.png');
const icoPath = path.join(assets, 'icon.ico');

/** Build a Windows .ico that embeds PNG images (supports alpha). */
function pngBuffersToIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = [];

  for (const png of pngBuffers) {
    // IHDR width/height at bytes 16–23 (big-endian)
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
  out.writeUInt16LE(0, 0); // reserved
  out.writeUInt16LE(1, 2); // type = icon
  out.writeUInt16LE(count, 4);

  let entryAt = 6;
  for (const e of entries) {
    out.writeUInt8(e.width, entryAt);
    out.writeUInt8(e.height, entryAt + 1);
    out.writeUInt8(0, entryAt + 2); // color palette
    out.writeUInt8(0, entryAt + 3); // reserved
    out.writeUInt16LE(1, entryAt + 4); // color planes
    out.writeUInt16LE(32, entryAt + 6); // bits per pixel
    out.writeUInt32LE(e.size, entryAt + 8);
    out.writeUInt32LE(e.offset, entryAt + 12);
    e.png.copy(out, e.offset);
    entryAt += 16;
  }
  return out;
}

async function main() {
  const svg = fs.readFileSync(svgPath);
  const master = await sharp(svg, { density: 384 })
    .resize(1024, 1024)
    .ensureAlpha()
    .png()
    .toBuffer();

  await sharp(master).resize(256, 256).png().toFile(pngPath);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(
    sizes.map((s) => sharp(master).resize(s, s).png().toBuffer()),
  );
  fs.writeFileSync(icoPath, pngBuffersToIco(pngs));

  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  const a0 = data[3];
  if (info.channels < 4 || a0 !== 0) {
    throw new Error(`icon.png corner is not transparent (alpha=${a0}, channels=${info.channels})`);
  }

  console.log(`Wrote ${path.relative(root, pngPath)} (${fs.statSync(pngPath).size} bytes)`);
  console.log(`Wrote ${path.relative(root, icoPath)} (${fs.statSync(icoPath).size} bytes)`);
  console.log('Corner alpha OK (transparent).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
