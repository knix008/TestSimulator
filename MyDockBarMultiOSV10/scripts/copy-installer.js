'use strict';

/**
 * Copies the finished installer from `dist/` up to the project root.
 *
 * Wired to electron-builder's `afterAllArtifactBuild` hook, so it runs however
 * the build was started — `npm run build:win`, a bare `electron-builder`, or CI.
 *
 * A build for several architectures produces the same installer more than
 * once: `…-Setup.exe` alongside `…-Setup-x64.exe` and `…-Setup-arm64.exe`.
 * Only one of those is worth putting in the root, and it is the one without an
 * architecture in its name — electron-builder's combined installer, which runs
 * anywhere. Different *formats* are not duplicates of each other, so a Linux
 * build that produced an AppImage, a .deb and a .rpm keeps one of each.
 *
 * Update metadata, blockmaps and intermediate archives are never copied, and
 * neither is a draft build. `npm run build:fast` skips compression to turn a
 * two-minute build into a ten-second one, which is exactly what you want while
 * checking that the installer still works - and exactly what you do not want
 * sitting in the root as the copy you hand to someone.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Extensions that represent something installable. */
const INSTALLER_TYPES = new Set(['.exe', '.dmg', '.appimage', '.deb', '.rpm', '.pkg', '.snap']);

/** Never copy these, whatever their extension. */
const SKIP = /\.(blockmap|yml|yaml|json)$/i;

/** Architecture suffixes electron-builder appends before the extension. */
const ARCH_SUFFIX = /-(x64|ia32|arm64|armv7l|universal)(?=\.[^.]+$)/i;

function isInstaller(file) {
  if (SKIP.test(file)) return false;
  return INSTALLER_TYPES.has(path.extname(file).toLowerCase());
}

/**
 * Of several builds of the same installer, the one to keep: the combined build
 * if there is one, otherwise whichever matches the machine, otherwise the
 * first. Ties broken by name so the choice does not depend on build order.
 */
function pickBest(candidates) {
  const score = (file) => {
    const name = path.basename(file);
    if (!ARCH_SUFFIX.test(name)) return 0;                                  // combined
    if (name.toLowerCase().includes(`-${process.arch.toLowerCase()}.`)) return 1;  // this machine
    return 2;
  };

  return candidates.slice().sort((a, b) => {
    const gap = score(a) - score(b);
    return gap !== 0 ? gap : path.basename(a).localeCompare(path.basename(b));
  })[0];
}

/** Remove copies a previous build left behind, so only the current one remains. */
function clearStale(keep) {
  for (const name of fs.readdirSync(ROOT)) {
    if (name === keep || !isInstaller(name)) continue;
    // Only ever our own copies: same product name, sitting in the root.
    if (!name.startsWith('MyDockBar-')) continue;
    try {
      fs.unlinkSync(path.join(ROOT, name));
    } catch { /* leave a locked file alone */ }
  }
}

module.exports = async function copyInstaller(buildResult) {
  const configuration = buildResult.configuration || {};
  if (configuration.compression === 'store') {
    console.log('[copy-installer] draft build, leaving the root copy alone');
    return [];
  }

  const installers = (buildResult.artifactPaths || []).filter((file) => isInstaller(path.basename(file)));
  if (!installers.length) return [];

  // One per format: an AppImage and a .deb are not two copies of one thing.
  const byFormat = new Map();
  for (const file of installers) {
    const format = path.extname(file).toLowerCase();
    if (!byFormat.has(format)) byFormat.set(format, []);
    byFormat.get(format).push(file);
  }

  const chosen = [...byFormat.values()].map(pickBest);
  const names = chosen.map((file) => path.basename(file));

  for (const file of chosen) {
    const name = path.basename(file);
    const target = path.join(ROOT, name);

    // Copying a file onto itself would truncate it.
    if (path.resolve(file) === path.resolve(target)) continue;

    try {
      fs.copyFileSync(file, target);
    } catch (err) {
      // A failed copy must not fail a build that otherwise succeeded: the
      // artifact is still sitting in dist/.
      console.warn(`[copy-installer] could not copy ${name}: ${err.message}`);
    }
  }

  if (names.length === 1) clearStale(names[0]);
  console.log(`[copy-installer] copied to the project root: ${names.join(', ')}`);

  // Nothing extra to register with electron-builder.
  return [];
};
