/**
 * Copy platform installer artifacts from release/ to project root.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');

const INSTALLER_EXTS = new Set([
  '.exe',
  '.dmg',
  '.pkg',
  '.zip',
  '.AppImage',
  '.deb',
  '.rpm',
  '.snap',
]);

function isInstaller(fileName) {
  const ext = path.extname(fileName);
  if (!INSTALLER_EXTS.has(ext)) return false;
  // Skip electron zip / builder internals if any
  if (fileName.includes('blockmap')) return false;
  return true;
}

if (!fs.existsSync(releaseDir)) {
  console.warn('[copy-installers] release/ not found — nothing to copy.');
  process.exit(0);
}

const files = fs.readdirSync(releaseDir).filter(isInstaller);
if (files.length === 0) {
  console.warn('[copy-installers] No installer files found in release/.');
  process.exit(0);
}

for (const name of files) {
  const src = path.join(releaseDir, name);
  const dest = path.join(root, name);
  fs.copyFileSync(src, dest);
  const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  console.log(`[copy-installers] ${name} → ./ (${sizeMb} MB)`);
}

console.log(`[copy-installers] Copied ${files.length} installer(s) to project root.`);
