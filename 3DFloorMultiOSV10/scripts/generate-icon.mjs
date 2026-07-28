/**
 * Sync the master app icon into packaging / Electron / web locations.
 *
 * Preferred sources (first hit wins):
 *   assets/icon.png → assets/icon-bright.png → assets/icon-src.png
 *
 * Also writes a Windows .ico (PNG-compressed) for installers / exe branding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const masterPath = path.join(root, 'assets', 'icon.png');

const sourceCandidates = [
  masterPath,
  path.join(root, 'assets', 'icon-bright.png'),
  path.join(root, 'assets', 'icon-src.png'),
];

const icoTargets = [
  path.join(root, 'build', 'icon.ico'),
  path.join(root, 'electron', 'icon.ico'),
];

function isPng(buf) {
  return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

/** Build a single-image ICO that embeds the PNG (Vista+ / Windows installer friendly). */
function pngToIco(pngBuf) {
  if (pngBuf.length < 24) throw new Error('PNG too small');
  const width = pngBuf.readUInt32BE(16);
  const height = pngBuf.readUInt32BE(20);
  const dirW = width >= 256 ? 0 : width;
  const dirH = height >= 256 ? 0 : height;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = dirW;
  entry[1] = dirH;
  entry.writeUInt16LE(0, 2);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, pngBuf]);
}

const source = sourceCandidates.find((p) => fs.existsSync(p));
if (!source) {
  console.error(
    'Missing app icon. Place a PNG at assets/icon.png (or assets/icon-bright.png).',
  );
  process.exit(1);
}

const buf = fs.readFileSync(source);
if (!isPng(buf)) {
  console.error(`Invalid PNG: ${source}`);
  process.exit(1);
}

/** Prefer a 256px PNG for Windows window / installer icons when possible. */
function resizePngWin(srcPng, destPng, size = 256) {
  if (process.platform !== 'win32') return false;
  const ps = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('${srcPng.replace(/'/g, "''")}')
try {
  $bmp = New-Object System.Drawing.Bitmap ${size}, ${size}
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, ${size}, ${size})
  $g.Dispose()
  $bmp.Save('${destPng.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
} finally {
  $src.Dispose()
}
`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', ps],
    { encoding: 'utf8' },
  );
  return result.status === 0 && fs.existsSync(destPng);
}

// Write canonical / web copies at full resolution
for (const target of [masterPath, path.join(root, 'public', 'icon.png')]) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);
  console.log(`Wrote ${path.relative(root, target)}`);
}

// Packaging + Electron: use square 256px when resize works (better Windows icons)
const packPng = path.join(root, 'build', 'icon.png');
const electronPng = path.join(root, 'electron', 'icon.png');
fs.mkdirSync(path.dirname(packPng), { recursive: true });
let packBuf = buf;
if (resizePngWin(source, packPng, 256)) {
  packBuf = fs.readFileSync(packPng);
  console.log(`Wrote ${path.relative(root, packPng)} (256px)`);
} else {
  fs.writeFileSync(packPng, buf);
  console.log(`Wrote ${path.relative(root, packPng)}`);
}
fs.mkdirSync(path.dirname(electronPng), { recursive: true });
fs.writeFileSync(electronPng, packBuf);
console.log(`Wrote ${path.relative(root, electronPng)}`);

const ico = pngToIco(packBuf);
for (const target of icoTargets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, ico);
  console.log(`Wrote ${path.relative(root, target)}`);
}

console.log(`Icon source: ${path.relative(root, source)}`);
