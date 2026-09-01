// make-icons.mjs — regenerate installer icons from the REUSED original
// Intellivix logo (src/assets/logo-source.ico, taken from VixReaderTest03).
// We do not create a new icon; we only re-derive the sizes the installers need.
// Run: npm run icons
//   build/icon.png        (1024x1024) -> Linux + macOS (electron-builder -> .icns)
//   build/icon.ico                    -> Windows (kept as the original .ico)
//   src/assets/icon.png   (512x512)   -> Web favicon / in-app logo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcIco = path.join(root, 'src', 'assets', 'logo-source.ico');
const buildDir = path.join(root, 'build');
fs.mkdirSync(buildDir, { recursive: true });

// sharp cannot decode .ico, but the pre-decoded original is stored as
// src/assets/icon.png (produced by the reuse step). Derive everything from it.
const decoded = path.join(root, 'src', 'assets', 'icon.png');
if (!fs.existsSync(decoded) || !fs.existsSync(srcIco)) {
  console.error('Missing reused original assets (logo-source.ico / icon.png).');
  process.exit(1);
}

// Windows: reuse the original .ico verbatim.
fs.copyFileSync(srcIco, path.join(buildDir, 'icon.ico'));
console.log('reused original -> build/icon.ico');

// Linux/macOS: upscale the decoded original to 1024 with a high-quality kernel.
await sharp(decoded).resize(1024, 1024, { kernel: 'lanczos3' }).png()
  .toFile(path.join(buildDir, 'icon.png'));
console.log('wrote build/icon.png (1024x1024)');

console.log('icons done (reused original Intellivix logo).');
