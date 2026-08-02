/**
 * Generates PNG/ICO assets from the SVG icon for Electron Builder.
 * Requires: sharp, to-ico (devDependencies)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'public', 'icon.svg');
const buildDir = path.join(root, 'build');
const iconsDir = path.join(buildDir, 'icons');

fs.mkdirSync(iconsDir, { recursive: true });

const svg = fs.readFileSync(svgPath);

const sizes = [16, 32, 48, 64, 128, 256, 512];
const pngBuffers = {};

for (const size of sizes) {
  const buf = await sharp(svg).resize(size, size).png().toBuffer();
  pngBuffers[size] = buf;
  fs.writeFileSync(path.join(iconsDir, `${size}x${size}.png`), buf);
}

fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[512]);
fs.copyFileSync(svgPath, path.join(buildDir, 'icon.svg'));

const ico = await toIco([pngBuffers[16], pngBuffers[32], pngBuffers[48], pngBuffers[256]]);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);

// macOS .icns is best produced on macOS; provide high-res PNG fallback
fs.writeFileSync(path.join(buildDir, 'icon.icns.png'), pngBuffers[512]);

// Electron runtime assets (window / taskbar icon)
const electronAssets = path.join(root, 'electron', 'assets');
fs.mkdirSync(electronAssets, { recursive: true });
fs.writeFileSync(path.join(electronAssets, 'icon.ico'), ico);
fs.writeFileSync(path.join(electronAssets, 'icon.png'), pngBuffers[512]);
fs.writeFileSync(path.join(electronAssets, 'icon-256.png'), pngBuffers[256]);
fs.copyFileSync(svgPath, path.join(electronAssets, 'icon.svg'));
fs.copyFileSync(svgPath, path.join(root, 'public', 'icon.svg'));

console.log('Icons generated in build/ and electron/assets/');
