"use strict";

/**
 * Copy exactly one electron-builder installer to the project root.
 * Extra artifacts (.blockmap, latest.yml, unpacked dirs) stay in release/.
 */

const fs = require("fs");
const path = require("path");

const INSTALLER_EXT = new Set([".exe", ".dmg", ".appimage", ".deb", ".rpm"]);
const ROOT_INSTALLER = /^(MyMonitor)[-_].+\.(exe|dmg|AppImage|deb|rpm)$/i;

function defaultRoot() {
  return process.env.MMON_COPY_ROOT || path.join(__dirname, "..");
}

function defaultReleaseDir(root) {
  return process.env.MMON_RELEASE_DIR || path.join(root, "app", "release");
}

function isInstallerName(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".blockmap") || lower.endsWith(".yml") || lower.endsWith(".yaml")) {
    return false;
  }
  if (lower.includes("__uninstaller")) return false;
  return INSTALLER_EXT.has(path.extname(lower));
}

function rank(name) {
  const lower = name.toLowerCase();
  if (/-setup-\d/.test(lower) && lower.endsWith(".exe")) return 0;
  if (lower.endsWith(".exe")) return 1;
  if (lower.endsWith(".dmg")) return 2;
  if (lower.endsWith(".appimage")) return 3;
  if (lower.endsWith(".deb")) return 4;
  return 5;
}

function pickOne(names) {
  const candidates = names.filter(isInstallerName);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  return candidates[0];
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => {
    try {
      return fs.statSync(path.join(dir, name)).isFile();
    } catch {
      return false;
    }
  });
}

function removeOtherRootInstallers(root, keepName) {
  const removed = [];
  for (const name of listFiles(root)) {
    if (name === keepName) continue;
    if (!ROOT_INSTALLER.test(name) && !isInstallerName(name)) continue;
    if (!ROOT_INSTALLER.test(name)) continue;
    fs.unlinkSync(path.join(root, name));
    removed.push(name);
  }
  return removed;
}

function copyInstaller(options = {}) {
  const root = options.root || defaultRoot();
  const releaseDir = options.releaseDir || defaultReleaseDir(root);

  if (!fs.existsSync(releaseDir)) {
    throw new Error(`release directory not found: ${releaseDir}`);
  }

  const chosen = pickOne(listFiles(releaseDir));
  if (!chosen) {
    throw new Error(`no installer artifact found in ${releaseDir}`);
  }

  const dest = path.join(root, chosen);
  fs.copyFileSync(path.join(releaseDir, chosen), dest);
  const removed = removeOtherRootInstallers(root, chosen);
  const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  return { name: chosen, dest, sizeMb, removed };
}

if (require.main === module) {
  try {
    const result = copyInstaller();
    for (const name of result.removed) {
      console.log(`[copy-installer] removed previous ${name}`);
    }
    console.log(`[copy-installer] ${result.name} → ./ (${result.sizeMb} MB)`);
  } catch (err) {
    console.error(`[copy-installer] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { copyInstaller, pickOne, isInstallerName, ROOT_INSTALLER };
