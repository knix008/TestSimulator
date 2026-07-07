import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');
const publicDir = path.join(__dirname, '..', 'renderer', 'public');

const ACCENT = '#2563eb';
const ACCENT_DARK = '#1d4ed8';
const DOC = '#f8fafc';
const DOC_BORDER = '#94a3b8';

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

function appIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="${ACCENT}"/>
  <rect x="7" y="6" width="18" height="20" rx="2" fill="#ffffff" opacity="0.95"/>
  <rect x="10" y="10" width="12" height="2.2" rx="1" fill="${ACCENT}"/>
  <rect x="10" y="14.5" width="9" height="2.2" rx="1" fill="${ACCENT_DARK}"/>
  <rect x="10" y="19" width="11" height="2.2" rx="1" fill="${ACCENT}"/>
  <path d="M21 21 L24 24 L21 24 Z" fill="${ACCENT_DARK}"/>
</svg>`;
}

function reqtprojIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="${DOC_BORDER}"/>
  <rect x="5" y="4" width="20" height="24" rx="2" fill="${DOC}" stroke="${DOC_BORDER}" stroke-width="1"/>
  <path d="M21 4 L25 8 L21 8 Z" fill="#e2e8f0" stroke="${DOC_BORDER}" stroke-width="0.8"/>
  <rect x="8" y="11" width="14" height="2.2" rx="0.8" fill="${ACCENT}"/>
  <rect x="8" y="15.5" width="10" height="2.2" rx="0.8" fill="${ACCENT_DARK}"/>
  <rect x="8" y="20" width="7" height="2.2" rx="0.8" fill="${ACCENT}"/>
  <text x="16" y="27.5" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="4.2" font-weight="700" fill="${ACCENT_DARK}">req</text>
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

async function writeSampleProject() {
  const sample = {
    projectName: 'Sample Project',
    schemaVersion: '1.0',
    createdUtc: new Date().toISOString(),
    lastModifiedUtc: new Date().toISOString(),
    requirements: [
      {
        id: 'sample-req-001',
        code: 'REQ-001',
        title: 'User login',
        description: 'The system shall allow registered users to sign in with username and password.',
        category: 'Authentication',
        priority: 'high',
        status: 'draft',
        source: 'Sample',
        parentId: null,
        createdUtc: new Date().toISOString(),
        modifiedUtc: new Date().toISOString(),
        testCases: [],
      },
    ],
  };
  await fs.writeFile(
    path.join(assetsDir, 'Sample.reqtproj'),
    `${JSON.stringify(sample, null, 2)}\n`,
    'utf8',
  );
}

async function main() {
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.mkdir(publicDir, { recursive: true });

  const appPngs = await Promise.all(ICON_SIZES.map((size) => renderPng(appIconSvg(size), size)));
  const projectPngs = await Promise.all(ICON_SIZES.map((size) => renderPng(reqtprojIconSvg(size), size)));

  await writeIco(path.join(assetsDir, 'icon.ico'), appPngs);
  await writeIco(path.join(assetsDir, 'reqtproj.ico'), projectPngs);
  await writePng(path.join(assetsDir, 'icon.png'), appPngs[appPngs.length - 1]);
  await writePng(path.join(assetsDir, 'reqtproj.png'), projectPngs[projectPngs.length - 1]);
  await writePng(path.join(publicDir, 'icon.png'), appPngs[appPngs.length - 1]);
  await writeSampleProject();

  console.log('Generated assets/icon.ico, assets/reqtproj.ico, assets/icon.png, assets/reqtproj.png, assets/Sample.reqtproj');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
