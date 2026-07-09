/**
 * create-icons.js — SVG 소스에서 멀티사이즈 ICO 생성
 *
 * • assets/icon-source.svg  → assets/icon.ico  (광택 K)
 * • assets/kprj-source.svg  → assets/kprj.ico  (문서)
 *
 * 사용법:
 *   node scripts/create-icons.js          # 아이콘이 없을 때만 생성
 *   node scripts/create-icons.js --force  # 기존 아이콘을 덮어써서 재생성
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SIZES = [16, 32, 48, 64, 128, 256];
const ICON_TARGETS = [
  { svg: 'icon-source.svg', ico: 'icon.ico', label: '광택 K' },
  { svg: 'kprj-source.svg', ico: 'kprj.ico', label: '문서' },
];
const force = process.argv.includes('--force');

function iconsReady() {
  return ICON_TARGETS.every(({ ico }) => fs.existsSync(path.join(ASSETS_DIR, ico)));
}

function needsRegenerate() {
  if (force) return true;
  for (const { svg, ico } of ICON_TARGETS) {
    const svgPath = path.join(ASSETS_DIR, svg);
    const icoPath = path.join(ASSETS_DIR, ico);
    if (!fs.existsSync(icoPath)) return true;
    if (fs.existsSync(svgPath) && fs.statSync(svgPath).mtimeMs > fs.statSync(icoPath).mtimeMs) return true;
  }
  return false;
}

function syncInstallerIcons() {
  const iconPath = path.join(ASSETS_DIR, 'icon.ico');
  if (!fs.existsSync(iconPath)) return;
  for (const name of ['installerIcon.ico', 'uninstallerIcon.ico']) {
    fs.copyFileSync(iconPath, path.join(ASSETS_DIR, name));
  }
}

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

  if (!needsRegenerate()) {
    syncInstallerIcons();
    console.log('기존 아이콘을 사용합니다. (재생성: npm run create-icons:force)');
    return;
  }

  console.log(force ? '아이콘 재생성 중...' : '아이콘 생성 중...');

  for (const { svg, ico, label } of ICON_TARGETS) {
    await svgToIco(
      path.join(ASSETS_DIR, svg),
      path.join(ASSETS_DIR, ico),
      label
    );
  }

  syncInstallerIcons();
  console.log('\n아이콘 생성 완료!');
}

main().catch(err => {
  console.error('아이콘 생성 실패:', err.message);
  process.exit(1);
});
