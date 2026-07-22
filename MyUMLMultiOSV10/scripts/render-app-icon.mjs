/**
 * Renders app and project SVG icons into compact multi-size Windows .ico files.
 * Run: node scripts/render-app-icon.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

execSync('npm install --no-save --no-package-lock @resvg/resvg-js', {
  cwd: root,
  stdio: 'inherit'
});

const require = createRequire(import.meta.url);
const { Resvg } = require(join(root, 'node_modules', '@resvg/resvg-js'));

/** Windows shell uses 16/32/48; 256 covers jumbo / high-DPI views. */
const sizes = [16, 32, 48, 256];

function buildPngIco(pngs) {
  const count = pngs.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = dataOffset;
  for (let i = 0; i < count; i += 1) {
    const png = pngs[i];
    const size = sizes[i];
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...pngs]);
}

function renderIcon(svgName, icoName) {
  const svgPath = join(root, 'assets', svgName);
  const icoPath = join(root, 'assets', icoName);
  const svg = readFileSync(svgPath);

  const pngBuffers = sizes.map((size) => {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      background: 'rgba(0,0,0,0)'
    });
    return Buffer.from(resvg.render().asPng());
  });

  const ico = buildPngIco(pngBuffers);
  writeFileSync(icoPath, ico);
  console.log(`Wrote ${icoPath} (${ico.length} bytes; sizes ${sizes.join(',')})`);
}

renderIcon('app-icon.svg', 'app-icon.ico');
renderIcon('project-icon.svg', 'project-icon.ico');
