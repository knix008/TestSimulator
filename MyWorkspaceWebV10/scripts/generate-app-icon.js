const fs = require('fs');
const path = require('path');

const winRoot = path.resolve(__dirname, '..', '..', 'MyWorkspaceWinV10');
const winAssets = path.join(winRoot, 'src', 'MyWorkspace.Win', 'Assets');
const buildDir = path.join(__dirname, '..', 'build');
const rendererAssets = path.join(__dirname, '..', 'src', 'renderer', 'assets');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) {
    return false;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function appIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#bac6d6"/>
    </linearGradient>
    <linearGradient id="shadow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(148,163,184,0.55)"/>
    </linearGradient>
    <radialGradient id="gloss" cx="35%" cy="20%" r="55%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect x="18" y="22" width="216" height="216" rx="28" fill="rgba(100,116,139,0.28)"/>
  <rect x="12" y="12" width="216" height="216" rx="28" fill="url(#tile)" stroke="#cbd5e1" stroke-width="4"/>
  <ellipse cx="128" cy="196" rx="88" ry="28" fill="url(#shadow)"/>
  <rect x="12" y="12" width="216" height="216" rx="28" fill="url(#gloss)"/>
  <text x="128" y="168" text-anchor="middle" font-family="Times New Roman, Georgia, serif" font-size="132" font-weight="700" fill="rgba(148,163,184,0.45)" dx="3" dy="3">M</text>
  <text x="128" y="168" text-anchor="middle" font-family="Times New Roman, Georgia, serif" font-size="132" font-weight="700" fill="#2563eb">M</text>
</svg>`;
}

function wspIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect x="12" y="72" width="232" height="152" rx="8" fill="#ffc478"/>
  <rect x="12" y="48" width="116" height="48" rx="8" fill="#ffb45a"/>
  <rect x="48" y="96" width="176" height="112" rx="12" fill="#ffffff" stroke="#2563eb" stroke-width="6"/>
  <text x="136" y="168" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="700" fill="#2563eb">WSP</text>
</svg>`;
}

async function renderSvgPng(svg, size) {
  const sharp = require('sharp');
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

async function writeIcoFromSvg(svg, targetPath) {
  const pngToIco = require('png-to-ico');
  const pngBuffers = await Promise.all(ICO_SIZES.map((size) => renderSvgPng(svg, size)));
  const ico = await pngToIco(pngBuffers);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, ico);
}

async function writeIcnsFromPng(pngPath, targetPath) {
  const png2icons = require('png2icons');
  const input = fs.readFileSync(pngPath);
  const icns = png2icons.createICNS(input, png2icons.BILINEAR, 0, false);
  if (!icns) {
    throw new Error(`Failed to create ICNS: ${targetPath}`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, icns);
}

async function writePngFromSvg(svg, targetPath, size = 512) {
  const sharp = require('sharp');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(targetPath);
}

async function writePngFromSource(sourcePath, targetPath, size = 512) {
  const sharp = require('sharp');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await sharp(sourcePath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 246, g: 248, b: 250, alpha: 1 }
    })
    .png()
    .toFile(targetPath);
}

async function ensureGeneratedIcon({ svg, icoPath, pngPath, winSourceIco }) {
  if (copyIfExists(winSourceIco, icoPath)) {
    return 'copied';
  }

  if (!fs.existsSync(icoPath)) {
    await writeIcoFromSvg(svg, icoPath);
    return 'generated';
  }

  return 'existing';
}

async function generateAppIcons(options = {}) {
  const targetBuildDir = options.buildDir || buildDir;
  fs.mkdirSync(targetBuildDir, { recursive: true });

  const iconIco = path.join(targetBuildDir, 'icon.ico');
  const iconPng = path.join(targetBuildDir, 'icon.png');
  const iconIcns = path.join(targetBuildDir, 'icon.icns');
  const wspIco = path.join(targetBuildDir, 'wsp.ico');
  const wspPng = path.join(targetBuildDir, 'wsp.png');
  const wspIcns = path.join(targetBuildDir, 'wsp.icns');
  const faviconPng = path.join(rendererAssets, 'app-icon.png');

  const appResult = await ensureGeneratedIcon({
    svg: appIconSvg(),
    icoPath: iconIco,
    pngPath: iconPng,
    winSourceIco: path.join(winAssets, 'app.ico')
  });

  const wspResult = await ensureGeneratedIcon({
    svg: wspIconSvg(),
    icoPath: wspIco,
    pngPath: null,
    winSourceIco: path.join(winAssets, 'wsp.ico')
  });

  if (fs.existsSync(iconIco)) {
    try {
      await writePngFromSource(iconIco, iconPng, 512);
    } catch {
      await writePngFromSvg(appIconSvg(), iconPng, 512);
    }
  } else {
    await writePngFromSvg(appIconSvg(), iconPng, 512);
  }

  try {
    await writePngFromSource(iconPng, faviconPng, 64);
  } catch {
    await writePngFromSvg(appIconSvg(), faviconPng, 64);
  }

  await writePngFromSvg(wspIconSvg(), wspPng, 512);
  await writeIcnsFromPng(iconPng, iconIcns);
  await writeIcnsFromPng(wspPng, wspIcns);

  return { appResult, wspResult, iconIco, iconPng, iconIcns, wspIco, wspPng, wspIcns };
}

if (require.main === module) {
  generateAppIcons()
    .then((result) => {
      console.log('[generate-app-icon] App icon:', result.appResult, result.iconIco);
      console.log('[generate-app-icon] WSP icon:', result.wspResult, result.wspIco);
      console.log('[generate-app-icon] PNG icon:', result.iconPng);
    })
    .catch((error) => {
      console.error('[generate-app-icon]', error);
      process.exit(1);
    });
}

module.exports = { generateAppIcons, appIconSvg, wspIconSvg };
