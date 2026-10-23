/**
 * Rasterize asset/icon.svg into the app / installer icon set, and the colourful
 * src/icons/*.svg used by the tray menu into src-tauri/icons/menu/*.png.
 * Usage: node scripts/generate-icons.js [--if-missing]
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const toIco = require('to-ico');

const root = path.join(__dirname, '..');
const assetDir = path.join(root, 'asset');
const iconsDir = path.join(assetDir, 'icons');
const srcDir = path.join(root, 'src');
const svgPath = path.join(assetDir, 'icon.svg');
const menuSvgDir = path.join(srcDir, 'icons');
const menuPngDir = path.join(root, 'src-tauri', 'icons', 'menu');

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Tray menu icons (src-tauri/src/lib.rs include_bytes! these). */
const MENU_ICONS = ['list', 'new-memo', 'autostart-on', 'autostart-off', 'quit'];
/** Native menus draw item bitmaps at their own size; 16 px matches the small-icon metric at 100 %. */
const MENU_SIZE = 16;

/** Files Tauri reads — `--if-missing` regenerates when any is absent. */
const REQUIRED = [
  'asset/icon.ico',
  'asset/icon.icns',
  'asset/icons/32x32.png',
  'asset/icons/128x128.png',
  'asset/icons/256x256.png',
  'src/favicon.png',
  ...MENU_ICONS.map((name) => `src-tauri/icons/menu/${name}.png`)
];

function renderPng(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)'
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * macOS icon (.icns) — the ic07..ic10 entries hold plain PNG data, so no converter is needed.
 * Each entry is a 4-byte type + 4-byte big-endian length (header included) + PNG.
 */
function buildIcns(bySize) {
  const entries = [
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024]
  ].map(([type, size]) => {
    const png = bySize.get(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

async function main() {
  if (!fs.existsSync(svgPath)) {
    throw new Error(`Missing ${svgPath}`);
  }
  if (process.argv.includes('--if-missing') && REQUIRED.every((rel) => fs.existsSync(path.join(root, rel)))) {
    console.log('icons are up to date');
    return;
  }
  const svg = fs.readFileSync(svgPath);
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });

  const bySize = new Map();
  for (const size of PNG_SIZES) {
    const png = renderPng(svg, size);
    bySize.set(size, png);
    const linuxName = `${size}x${size}.png`;
    fs.writeFileSync(path.join(iconsDir, linuxName), png);
    console.log(`wrote asset/icons/${linuxName} (${png.length} bytes)`);
  }

  fs.writeFileSync(path.join(assetDir, 'icon-1024.png'), bySize.get(1024));
  fs.writeFileSync(path.join(assetDir, 'icon-master.png'), bySize.get(1024));
  fs.writeFileSync(path.join(assetDir, 'icon-256.png'), bySize.get(256));
  fs.writeFileSync(path.join(assetDir, 'icon.png'), bySize.get(512));
  fs.writeFileSync(path.join(srcDir, 'favicon.png'), bySize.get(256));
  console.log('wrote asset/icon-1024.png, icon-master.png, icon-256.png, icon.png');
  console.log('wrote src/favicon.png');

  const icoBuffers = ICO_SIZES.map((size) => bySize.get(size));
  const ico = await toIco(icoBuffers);
  fs.writeFileSync(path.join(assetDir, 'icon.ico'), ico);
  console.log(`wrote asset/icon.ico (${ico.length} bytes)`);

  const icns = buildIcns(bySize);
  fs.writeFileSync(path.join(assetDir, 'icon.icns'), icns);
  console.log(`wrote asset/icon.icns (${icns.length} bytes)`);

  fs.mkdirSync(menuPngDir, { recursive: true });
  for (const name of MENU_ICONS) {
    const png = renderPng(fs.readFileSync(path.join(menuSvgDir, `${name}.svg`)), MENU_SIZE);
    fs.writeFileSync(path.join(menuPngDir, `${name}.png`), png);
  }
  console.log(`wrote src-tauri/icons/menu/*.png (${MENU_ICONS.length} icons, ${MENU_SIZE}px)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
