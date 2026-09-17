/**
 * Rasterize asset/icon.svg into the MyClock app / installer icon set.
 * Usage: node scripts/generate-icons.js
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

async function main() {
  if (!fs.existsSync(svgPath)) {
    throw new Error(`Missing ${svgPath}`);
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

  const buildDir = path.join(root, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.copyFileSync(icoPath, path.join(buildDir, 'icon.ico'));
  console.log('wrote build/icon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
