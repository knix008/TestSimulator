/**
 * Renders assets/app-icon.svg into a compact multi-size Windows .ico (PNG-compressed).
 * Run: node scripts/render-app-icon.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'assets', 'app-icon.svg');
const icoPath = join(root, 'assets', 'app-icon.ico');

execSync('npm install --no-save --no-package-lock @resvg/resvg-js', {
  cwd: root,
  stdio: 'inherit'
});

const require = createRequire(import.meta.url);
const { Resvg } = require(join(root, 'node_modules', '@resvg/resvg-js'));

/** Windows shell uses 16/32/48; 256 covers jumbo / high-DPI views. */
const sizes = [16, 32, 48, 256];
const svg = readFileSync(svgPath);

const pngBuffers = sizes.map((size) => {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)'
  });
  return Buffer.from(resvg.render().asPng());
});

function buildPngIco(pngs) {
  const count = pngs.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = dataOffset;
  for (let i = 0; i < count; i += 1) {
    const png = pngs[i];
    const size = sizes[i];
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...pngs]);
}

const ico = buildPngIco(pngBuffers);
writeFileSync(icoPath, ico);

const totalPng = pngBuffers.reduce((sum, buf) => sum + buf.length, 0);
console.log(
  `Wrote ${icoPath} (${ico.length} bytes; PNG payloads ${totalPng} bytes; sizes ${sizes.join(',')})`
);
