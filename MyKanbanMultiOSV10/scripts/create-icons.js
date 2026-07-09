/**
 * create-icons.js — SVG 소스에서 멀티사이즈 ICO 생성
 *
 * • assets/icon-source.svg  → assets/icon.ico  (광택 K)
 * • assets/kprj-source.svg  → assets/kprj.ico  (문서)
 *
 * 사용법: node scripts/create-icons.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SIZES = [16, 32, 48, 64, 128, 256];

async function svgToIco(svgPath, icoPath, label) {
  if (!fs.existsSync(svgPath)) {
    throw new Error(`SVG not found: ${svgPath}`);
  }

  const svg = fs.readFileSync(svgPath);
  const pngBuffers = await Promise.all(
    SIZES.map(size =>
      sharp(svg, { density: Math.max(192, size * 4) })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const ico = await toIco(pngBuffers);
  fs.writeFileSync(icoPath, ico);
  console.log(`  ✓ ${path.relative(path.join(__dirname, '..'), icoPath)} (${SIZES.join(', ')}px) — ${label}`);
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

  console.log('아이콘 생성 중...');

  await svgToIco(
    path.join(ASSETS_DIR, 'icon-source.svg'),
    path.join(ASSETS_DIR, 'icon.ico'),
    '광택 K'
  );

  await svgToIco(
    path.join(ASSETS_DIR, 'kprj-source.svg'),
    path.join(ASSETS_DIR, 'kprj.ico'),
    '문서'
  );

  console.log('\n아이콘 생성 완료!');
}

main().catch(err => {
  console.error('아이콘 생성 실패:', err.message);
  process.exit(1);
});
