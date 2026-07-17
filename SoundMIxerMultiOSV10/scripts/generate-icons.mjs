/**
 * Generates build icons (PNG sizes + ICO) from the master SVG/PNG.
 * Run: node scripts/generate-icons.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const iconsDir = path.join(buildDir, 'icons');
const srcPng = path.join(root, 'src', 'assets', 'icons', 'icon-1024.png');
const srcSvg = path.join(root, 'src', 'assets', 'icons', 'app-icon.svg');

fs.mkdirSync(iconsDir, { recursive: true });

const require = createRequire(import.meta.url);

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('Installing sharp temporarily...');
    const { execSync } = await import('child_process');
    execSync('npm install sharp png-to-ico --no-save', { cwd: root, stdio: 'inherit' });
    sharp = require('sharp');
  }

  // Prefer SVG master so design updates (light bg, shine) always win.
  let input = srcSvg;
  if (!fs.existsSync(srcSvg)) {
    if (!fs.existsSync(srcPng)) {
      throw new Error('No icon source found');
    }
    input = srcPng;
  }

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const pngBuffers = {};

  for (const size of sizes) {
    const buf = await sharp(input)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toBuffer();
    pngBuffers[size] = buf;
    if ([16, 32, 48, 64, 128, 256, 512].includes(size)) {
      fs.writeFileSync(path.join(iconsDir, `${size}x${size}.png`), buf);
    }
  }

  // Master icon.png for electron-builder
  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[1024] || pngBuffers[512]);

  // Copy into src assets
  fs.writeFileSync(path.join(root, 'src', 'assets', 'icons', 'icon-512.png'), pngBuffers[512]);

  let pngToIcoMod;
  try {
    pngToIcoMod = require('png-to-ico');
  } catch {
    const { execSync } = await import('child_process');
    execSync('npm install png-to-ico --no-save', { cwd: root, stdio: 'inherit' });
    pngToIcoMod = require('png-to-ico');
  }
  const pngToIco = pngToIcoMod.default || pngToIcoMod;

  const ico = await pngToIco([
    pngBuffers[16],
    pngBuffers[32],
    pngBuffers[48],
    pngBuffers[64],
    pngBuffers[128],
    pngBuffers[256]
  ]);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);

  // Placeholder icns note: electron-builder can generate from png on mac;
  // on Windows we copy png as fallback named icon.icns is skipped.
  // Provide icon.png which electron-builder uses when icns missing on non-mac.
  console.log('Icons generated in build/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
