import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');
const winIcon = path.join(__dirname, '..', '..', 'MyProjectWinV10', 'Assets', 'MyProject.ico');

const ACCENT = '#1a73e8';
const ACCENT_DARK = '#1050b4';
const DOC = '#f8fafc';
const DOC_BORDER = '#94a3b8';

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

function appIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="${ACCENT}"/>
  <rect x="6" y="8" width="20" height="4" rx="1" fill="#ffffff"/>
  <rect x="6" y="16" width="14" height="4" rx="1" fill="#ffffff"/>
  <rect x="6" y="24" width="8" height="4" rx="1" fill="#ffffff"/>
</svg>`;
}

function myprjIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="${DOC_BORDER}"/>
  <rect x="4" y="3" width="22" height="26" rx="2" fill="${DOC}" stroke="${DOC_BORDER}" stroke-width="1"/>
  <path d="M22 3 L26 7 L22 7 Z" fill="#e2e8f0" stroke="${DOC_BORDER}" stroke-width="0.8"/>
  <rect x="7" y="10" width="14" height="2.5" rx="0.8" fill="${ACCENT}"/>
  <rect x="7" y="15" width="10" height="2.5" rx="0.8" fill="${ACCENT_DARK}"/>
  <rect x="7" y="20" width="7" height="2.5" rx="0.8" fill="${ACCENT}"/>
  <text x="16" y="27" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="4.5" font-weight="700" fill="${ACCENT_DARK}">myprj</text>
</svg>`;
}

async function renderPng(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

async function writeIco(outputPath, pngBuffers) {
  const ico = await toIco(pngBuffers);
  await fs.writeFile(outputPath, ico);
}

async function writePng(outputPath, pngBuffer) {
  await fs.writeFile(outputPath, pngBuffer);
}

async function main() {
  await fs.mkdir(assetsDir, { recursive: true });

  const appPngs = await Promise.all(ICON_SIZES.map((size) => renderPng(appIconSvg(size), size)));
  const myprjPngs = await Promise.all(ICON_SIZES.map((size) => renderPng(myprjIconSvg(size), size)));

  await writeIco(path.join(assetsDir, 'icon.ico'), appPngs);
  await writeIco(path.join(assetsDir, 'myprj.ico'), myprjPngs);
  await writePng(path.join(assetsDir, 'icon.png'), appPngs[appPngs.length - 1]);
  await writePng(path.join(assetsDir, 'myprj.png'), myprjPngs[myprjPngs.length - 1]);

  try {
    await fs.copyFile(winIcon, path.join(assetsDir, 'icon-win-legacy.ico'));
  } catch {
    // Win icon is optional reference.
  }

  console.log('Generated assets/icon.ico, assets/myprj.ico, assets/icon.png, assets/myprj.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
