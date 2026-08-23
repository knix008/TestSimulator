'use strict';

/**
 * Copy final electron-builder installers from dist/ to the project root.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const pkg = require(path.join(root, 'package.json'));

const productName = (pkg.build && pkg.build.productName) || pkg.name;
const version = pkg.version;

const preferredNames = [
  `${productName}-Setup-${version}.exe`,
  `${productName}-${version}.dmg`,
  `${productName}-${version}.AppImage`,
  `${productName}_${version}_amd64.deb`,
  `${productName}-${version}.exe`
];

function isInstallerName(name) {
  const lower = name.toLowerCase();
  if (name.endsWith('.blockmap') || name.endsWith('.yml') || name.endsWith('.yaml')) {
    return false;
  }
  return (
    /-Setup-\d/.test(name) ||
    lower.endsWith('.dmg') ||
    lower.endsWith('.appimage') ||
    lower.endsWith('.deb') ||
    (lower.endsWith('.exe') && /setup/i.test(name))
  );
}

function main() {
  if (!fs.existsSync(distDir)) {
    console.error('[copy-installer] dist/ not found');
    process.exit(1);
  }

  const distFiles = fs.readdirSync(distDir);
  const selected = new Set();

  for (const name of preferredNames) {
    if (distFiles.includes(name)) {
      selected.add(name);
    }
  }

  if (selected.size === 0) {
    for (const name of distFiles) {
      if (isInstallerName(name)) {
        selected.add(name);
      }
    }
  }

  if (selected.size === 0) {
    console.error('[copy-installer] No installer artifact found in dist/');
    process.exit(1);
  }

  for (const name of selected) {
    const src = path.join(distDir, name);
    const dest = path.join(root, name);
    fs.copyFileSync(src, dest);
    const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
    console.log(`[copy-installer] ${name} → ./ (${sizeMb} MB)`);
  }
}

main();
