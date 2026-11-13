/**
 * clean.js — remove generated files.
 *
 *   npm run clean          build intermediates. Installers at the project root stay.
 *   npm run clean:all      the same, plus every installer copied to the project root.
 *
 *   src-tauri/target/              Cargo / Tauri build
 *   src-tauri/gen/                 Tauri codegen
 *   src-tauri/runtime/*            staged ffmpeg (keeps .gitkeep)
 *   src/vendor/node_modules/       copies made by vendor.js
 *   dist/  out/                    leftover bundle folders
 *
 *   --all also removes installer files at the project root
 *   (*.exe *.msi *.dmg *.pkg *.AppImage *.deb *.rpm *.blockmap).
 *   Nothing under src/ is touched, and node_modules stays.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const DIRS = [
  'dist',
  'out',
  path.join('src-tauri', 'target'),
  path.join('src-tauri', 'gen'),
  path.join('src', 'vendor', 'node_modules'),
];

const INSTALLER_EXT = new Set(['.exe', '.msi', '.dmg', '.pkg', '.appimage', '.deb', '.rpm', '.blockmap']);

/**
 * Delete build products under `root`. With `all`, also delete installer files
 * that sit directly in `root`. Returns the labels removed and any failures.
 */
function cleanTree(root, { all = false } = {}) {
  const removed = [];
  const failed = [];

  function drop(abs, label) {
    if (!fs.existsSync(abs)) return;
    fs.rmSync(abs, { recursive: true, force: true });
    removed.push(label);
  }

  for (const rel of DIRS) {
    const label = rel.replace(/\\/g, '/');
    try {
      drop(path.join(root, rel), label);
    } catch (e) {
      failed.push(`${label}: ${e.message}`);
    }
  }

  const runtime = path.join(root, 'src-tauri', 'runtime');
  if (fs.existsSync(runtime)) {
    for (const name of fs.readdirSync(runtime)) {
      if (name === '.gitkeep') continue;
      const label = `src-tauri/runtime/${name}`;
      try {
        drop(path.join(runtime, name), label);
      } catch (e) {
        failed.push(`${label}: ${e.message}`);
      }
    }
  }

  if (all) {
    for (const name of fs.readdirSync(root)) {
      const ext = path.extname(name).toLowerCase();
      if (!INSTALLER_EXT.has(ext)) continue;
      const abs = path.join(root, name);
      try {
        if (!fs.statSync(abs).isFile()) continue;
        drop(abs, name);
      } catch (e) {
        failed.push(`${name}: ${e.message}`);
      }
    }
  }

  return { removed, failed };
}

function main() {
  const all = process.argv.includes('--all');
  const tag = all ? 'clean:all' : 'clean';
  const { removed, failed } = cleanTree(ROOT, { all });
  for (const label of removed) console.log(`[${tag}] removed ${label}`);
  if (failed.length) {
    for (const line of failed) console.error(`[${tag}] failed ${line}`);
    process.exit(1);
  }
  console.log(removed.length ? `[${tag}] ${removed.length} item(s) removed` : `[${tag}] already clean`);
}

if (require.main === module) main();

module.exports = { cleanTree, INSTALLER_EXT };
