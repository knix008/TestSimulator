'use strict';
/**
 * Copy built installer/package artifacts from dist/ to the project root.
 * Usage: node scripts/copy-artifacts-to-root.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const ARTIFACT_EXTS = new Set([
  '.exe',   // Windows NSIS / portable
  '.dmg',   // macOS
  '.pkg',
  '.zip',
  '.AppImage',
  '.deb',
  '.rpm',
  '.snap',
  '.msi',
  '.7z',
]);

function isArtifact(name) {
  const lower = name.toLowerCase();
  // Skip blockmaps, yaml update metadata, unpacked dirs
  if (lower.endsWith('.blockmap')) return false;
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return false;
  if (lower === 'builder-debug.yml' || lower === 'builder-effective-config.yaml') return false;
  const ext = path.extname(name);
  return ARTIFACT_EXTS.has(ext) || ARTIFACT_EXTS.has(ext.toLowerCase());
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.warn('[copy-artifacts] dist/ not found — nothing to copy.');
    process.exit(0);
  }

  const entries = fs.readdirSync(DIST, { withFileTypes: true })
    .filter((d) => d.isFile() && isArtifact(d.name));

  if (!entries.length) {
    console.warn('[copy-artifacts] No installer artifacts found in dist/.');
    process.exit(0);
  }

  for (const entry of entries) {
    const src = path.join(DIST, entry.name);
    const dest = path.join(ROOT, entry.name);
    fs.copyFileSync(src, dest);
    const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
    console.log(`[copy-artifacts] → ${entry.name} (${sizeMb} MB)`);
  }

  console.log(`[copy-artifacts] Copied ${entries.length} file(s) to project root.`);
}

main();
