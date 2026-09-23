'use strict';

/**
 * Regenerates the artwork if it is missing or out of date.
 *
 * The contents of `build/` are generated, not authored, so they are not in
 * version control. Without this, a fresh clone would start with no tray icon
 * and no menu glyphs, and the tests that check the glyph set would fail for a
 * reason that has nothing to do with the change being tested.
 *
 * Wired to `prestart`, `predev` and `pretest`. `npm run icons` regenerates
 * unconditionally.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');

/** If any of these is missing, the artwork has to be built. */
const SENTINELS = [
  'icon.png',
  'icon.ico',
  'tray.png',
  path.join('menu', 'settings.png'),
  path.join('menu', 'settings@2x.png'),
  path.join('icons', '256x256.png'),
  'installerHeader.bmp',
];

/** A change to any of these invalidates what was generated last time. */
const SOURCES = [
  path.join('scripts', 'make-icons.js'),
  path.join('scripts', 'menu-glyphs.js'),
];

function newestSource() {
  let newest = 0;
  for (const rel of SOURCES) {
    try {
      newest = Math.max(newest, fs.statSync(path.join(ROOT, rel)).mtimeMs);
    } catch { /* a missing source cannot invalidate anything */ }
  }
  return newest;
}

function reasonToBuild() {
  const missing = SENTINELS.filter((rel) => !fs.existsSync(path.join(BUILD, rel)));
  if (missing.length) return `missing ${missing[0]}`;

  const sourceTime = newestSource();
  for (const rel of SENTINELS) {
    if (fs.statSync(path.join(BUILD, rel)).mtimeMs < sourceTime) {
      return `${rel} is older than the scripts that generate it`;
    }
  }
  return null;
}

function main() {
  const reason = reasonToBuild();
  if (!reason) return;

  console.log(`[icons] rebuilding artwork: ${reason}`);
  execFileSync(process.execPath, [path.join(__dirname, 'make-icons.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

main();
