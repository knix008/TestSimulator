'use strict';

/**
 * Copies the installers Tauri built into the project root, so the file you
 * hand to someone is next to the README rather than buried in target/.
 *
 *   src-tauri/target/release/bundle/nsis/MyDockBar_1.0.0_x64-setup.exe → MyDockBar-1.0.0-Setup-x64.exe
 *   src-tauri/target/release/bundle/dmg/MyDockBar_1.0.0_aarch64.dmg   → MyDockBar-1.0.0-aarch64.dmg
 *   src-tauri/target/release/bundle/appimage/MyDockBar_1.0.0_amd64.AppImage → MyDockBar-1.0.0-amd64.AppImage
 *   src-tauri/target/release/bundle/deb/MyDockBar_1.0.0_amd64.deb      → MyDockBar-1.0.0-amd64.deb
 *
 * The names in the root are the ones the Electron build used, so .gitignore
 * and the documents still match. An older installer of the same kind is
 * removed, leaving only the new one.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const target = process.env.CARGO_TARGET_DIR
  ? path.resolve(ROOT, 'src-tauri', process.env.CARGO_TARGET_DIR)
  : path.join(ROOT, 'src-tauri', 'target');
const BUNDLE = path.resolve(process.argv[2] || path.join(target, 'release', 'bundle'));
const { version } = require(path.join(ROOT, 'package.json'));

/** For each kind: how Tauri names it, what it is called in the root, and the old ones to remove. */
const KINDS = [
  { match: /^MyDockBar_.*_(\w+)-setup\.exe$/i, name: (arch) => `MyDockBar-${version}-Setup-${arch}.exe`, old: /^MyDockBar-.*-Setup-.*\.exe$/i },
  { match: /^MyDockBar_.*_(\w+)\.dmg$/i, name: (arch) => `MyDockBar-${version}-${arch}.dmg`, old: /^MyDockBar-.*\.dmg$/i },
  { match: /^MyDockBar_.*_(\w+)\.AppImage$/i, name: (arch) => `MyDockBar-${version}-${arch}.AppImage`, old: /^MyDockBar-.*\.AppImage$/i },
  { match: /^MyDockBar_.*_(\w+)\.deb$/i, name: (arch) => `MyDockBar-${version}-${arch}.deb`, old: /^MyDockBar-.*\.deb$/i },
];

function walk(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // A macOS .app is a folder; nothing inside it is an installer.
    if (entry.isDirectory()) {
      if (!entry.name.endsWith('.app')) walk(full, found);
    } else {
      found.push({ full, name: entry.name, time: fs.statSync(full).mtimeMs });
    }
  }
  return found;
}

function main() {
  const files = walk(BUNDLE);
  let copied = 0;
  for (const kind of KINDS) {
    const newest = files.filter((f) => kind.match.test(f.name)).sort((a, b) => b.time - a.time)[0];
    if (!newest) continue;
    for (const name of fs.readdirSync(ROOT)) {
      if (kind.old.test(name)) fs.rmSync(path.join(ROOT, name), { force: true });
    }
    const arch = kind.match.exec(newest.name)[1];
    const dest = path.join(ROOT, kind.name(arch));
    fs.copyFileSync(newest.full, dest);
    const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
    console.log(`[copy-installer] ${path.basename(dest)} → ./ (${mb} MB)`);
    copied += 1;
  }
  if (!copied) {
    console.error(`[copy-installer] no installer in ${path.relative(ROOT, BUNDLE)}; run npm run build:win (or :mac, :linux) first.`);
    process.exit(1);
  }
}

main();
