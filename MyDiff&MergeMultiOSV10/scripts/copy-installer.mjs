/**
 * Puts one finished installer at the top of the project.
 *
 * `release/` holds everything a build produced — two architectures, a portable
 * build, the blockmaps electron-builder writes beside them — and picking the one
 * to hand somebody out of that is a small chore every single time. This copies the
 * installer for the machine the build ran on to the project root under a fixed
 * name, so "the installer" is always the same path.
 *
 * It is a copy and not a move: `release/` stays as electron-builder left it, and a
 * rebuild overwrites the copy rather than accumulating versions.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "release");

/** The installer extension for each platform — not the portable or archive forms. */
export const INSTALLER = { win32: ".exe", darwin: ".dmg", linux: ".AppImage" };

/**
 * Picks the installer to hand out of everything a build left in `release/`.
 *
 * Pure on purpose: the file system work stays in `main()` so the choice itself —
 * the part with the traps in it — can be tested against made-up directory
 * listings. `entries` are `{ name, mtimeMs }`, newest mtime last is not assumed.
 *
 * Returns the chosen name, or `null` when nothing in the list is an installer.
 */
export function chooseInstaller(entries, arch, extension) {
  const candidates = entries.filter(({ name }) => {
    if (!name.toLowerCase().endsWith(extension.toLowerCase())) return false;
    // A portable build is not an installer, whatever its extension says.
    if (/portable/i.test(name)) return false;
    // Neither is the uninstaller electron-builder writes beside the installer
    // (`MyDiffMerge-1.0.0-win-x64.__uninstaller.exe`). It carries the same
    // architecture in its name, so it scores as high as the real thing below and
    // the tie falls to whichever was written last — a coin flip we do not want to
    // hand somebody an uninstaller on.
    if (/uninstall/i.test(name)) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // This machine's architecture first, then whatever is newest: a universal
  // installer names no architecture and is a perfectly good answer.
  const score = (name) => (name.includes(`-${arch}.`) ? 1 : 0);
  const ranked = [...candidates].sort(
    (a, b) => score(b.name) - score(a.name) || b.mtimeMs - a.mtimeMs,
  );
  return ranked[0].name;
}

function main() {
  const extension = INSTALLER[process.platform];
  if (!extension) {
    console.log(`installer  nothing to copy on ${process.platform}`);
    return;
  }
  if (!fs.existsSync(releaseDir)) {
    console.log("installer  release/ does not exist — run a platform build first");
    return;
  }

  const entries = fs.readdirSync(releaseDir)
    .map((name) => ({ name, stat: fs.statSync(path.join(releaseDir, name)) }))
    .filter((item) => item.stat.isFile())
    .map((item) => ({ name: item.name, mtimeMs: item.stat.mtimeMs, size: item.stat.size }));

  const chosenName = chooseInstaller(entries, os.arch(), extension);
  if (!chosenName) {
    console.log(`installer  no ${extension} in release/ — run a platform build first`);
    return;
  }

  const chosen = entries.find((entry) => entry.name === chosenName);
  fs.copyFileSync(path.join(releaseDir, chosen.name), path.join(root, chosen.name));

  const megabytes = (chosen.size / (1024 * 1024)).toFixed(1);
  console.log(`installer  ${chosen.name}  (${megabytes} MB, copied to the project root)`);
}

// Importing this for its choice function must not copy anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
