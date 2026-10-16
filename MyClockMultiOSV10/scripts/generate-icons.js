/**
 * Rasterize asset/icon.svg into the MyClock app / installer icon set.
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

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function renderPng(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)'
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * macOS 아이콘(.icns) — PNG 를 그대로 담는 형식(ic07~ic10)이라 따로 변환기가 필요 없다.
 * 각 항목은 4바이트 종류 + 4바이트 길이(머리 포함, big-endian) + PNG.
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

/** Tauri 가 읽는 아이콘 — 하나라도 없으면 다시 만든다 (`--if-missing`). */
const REQUIRED = [
  'asset/icon.ico',
  'asset/icon.icns',
  'asset/icons/32x32.png',
  'asset/icons/128x128.png',
  'asset/icons/256x256.png',
  'src/favicon.png'
];

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
  const icoPath = path.join(assetDir, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log(`wrote asset/icon.ico (${ico.length} bytes)`);

  const icns = buildIcns(bySize);
  fs.writeFileSync(path.join(assetDir, 'icon.icns'), icns);
  console.log(`wrote asset/icon.icns (${icns.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
