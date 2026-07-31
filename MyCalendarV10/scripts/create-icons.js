/**
 * create-icons.js — assets/icon-source.svg 로부터 멀티플랫폼 아이콘 생성
 *
 *   assets/icon.ico          Windows (16..256)
 *   assets/icon.png          공용 512 PNG (창 아이콘 / 웹 파비콘)
 *   assets/icons/*.png       Linux (electron-builder 는 이 폴더를 사용)
 *   assets/icon.icns         macOS
 *   assets/installerIcon.ico, uninstallerIcon.ico  (NSIS)
 *
 * 사용법:
 *   node scripts/create-icons.js          # 없을 때만 생성
 *   node scripts/create-icons.js --force  # 강제 재생성
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const ASSETS = path.join(__dirname, '..', 'assets');
const ICONS_DIR = path.join(ASSETS, 'icons');
const SRC = path.join(ASSETS, 'icon-source.svg');
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512];
const force = process.argv.includes('--force');

function ready() {
  return ['icon.ico', 'icon.png', 'icon.icns'].every(f => fs.existsSync(path.join(ASSETS, f)));
}

async function png(size) {
  // Cap render density so large sizes (e.g. 1024) stay under sharp's pixel limit.
  const density = Math.min(1536, Math.max(256, size * 3));
  return sharp(fs.readFileSync(SRC), { density, limitInputPixels: false })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
}

// Minimal ICNS builder from PNG buffers.
async function buildIcns(target) {
  const TYPES = [
    { type: 'icp4', size: 16 }, { type: 'icp5', size: 32 },
    { type: 'ic07', size: 128 }, { type: 'ic08', size: 256 },
    { type: 'ic09', size: 512 }, { type: 'ic10', size: 1024 },
  ];
  const entries = [];
  for (const { type, size } of TYPES) {
    const data = await png(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 'ascii');
    header.writeUInt32BE(data.length + 8, 4);
    entries.push(Buffer.concat([header, data]));
  }
  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  fs.writeFileSync(target, Buffer.concat([head, body]));
}

async function main() {
  if (!fs.existsSync(SRC)) { console.error('SVG 원본이 없습니다:', SRC); process.exit(1); }
  if (!force && ready()) {
    syncInstallerIcons();
    console.log('기존 아이콘을 사용합니다. (재생성: npm run create-icons:force)');
    return;
  }
  if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });
  console.log(force ? '아이콘 재생성 중…' : '아이콘 생성 중…');

  // Windows ICO
  const icoPngs = await Promise.all(ICO_SIZES.map(png));
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), await pngToIco(icoPngs));
  console.log('  ✓ assets/icon.ico');

  // Shared 512 PNG
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), await png(512));
  console.log('  ✓ assets/icon.png');

  // Linux PNGs
  for (const s of LINUX_SIZES) {
    fs.writeFileSync(path.join(ICONS_DIR, `${s}x${s}.png`), await png(s));
  }
  console.log(`  ✓ assets/icons/*.png (${LINUX_SIZES.join(', ')})`);

  // macOS ICNS
  await buildIcns(path.join(ASSETS, 'icon.icns'));
  console.log('  ✓ assets/icon.icns');

  syncInstallerIcons();
  console.log('\n아이콘 생성 완료!');
}

function syncInstallerIcons() {
  const ico = path.join(ASSETS, 'icon.ico');
  if (!fs.existsSync(ico)) return;
  for (const name of ['installerIcon.ico', 'uninstallerIcon.ico']) {
    fs.copyFileSync(ico, path.join(ASSETS, name));
  }
}

main().catch(err => { console.error('아이콘 생성 실패:', err.message); process.exit(1); });
