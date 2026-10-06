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
const INSTALLER = { win32: ".exe", darwin: ".dmg", linux: ".AppImage" };

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

  const arch = os.arch();
  const candidates = fs.readdirSync(releaseDir)
    .filter((name) => name.toLowerCase().endsWith(extension.toLowerCase()))
    // A portable build is not an installer, whatever its extension says.
    .filter((name) => !/portable/i.test(name))
    // Neither is the uninstaller electron-builder leaves in release/ beside them
    // (`…-win.__uninstaller.exe`). It names no architecture, so without this it
    // can win the ranking below on mtime alone whenever the build produced no
    // installer for this machine's architecture.
    .filter((name) => !/uninstall/i.test(name))
    .map((name) => ({ name, stat: fs.statSync(path.join(releaseDir, name)) }))
    .filter((item) => item.stat.isFile());

  if (candidates.length === 0) {
    console.log(`installer  no ${extension} in release/ — run a platform build first`);
    return;
  }

  // This machine's architecture first, then whatever is newest: a universal
  // installer names no architecture and is a perfectly good answer.
  const ranked = candidates.sort((a, b) => {
    const score = (name) => (name.includes(`-${arch}.`) ? 1 : 0);
    return score(b.name) - score(a.name) || b.stat.mtimeMs - a.stat.mtimeMs;
  });

  const chosen = ranked[0];
  const target = path.join(root, chosen.name);
  fs.copyFileSync(path.join(releaseDir, chosen.name), target);

  const megabytes = (chosen.stat.size / (1024 * 1024)).toFixed(1);
  console.log(`installer  ${chosen.name}  (${megabytes} MB, copied to the project root)`);
}

main();
