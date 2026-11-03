// Copies the installers `tauri build` made (src-tauri/target/release/bundle/) to the
// project root, so "the installer" is always the same place to look.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle");
const INSTALLER = /\.(exe|msi|dmg|AppImage|deb|rpm)$/i;

/** The installers among a bundle folder's files (never an uninstaller). */
export function installersIn(names) {
  return names.filter((name) => INSTALLER.test(name) && !/uninstall/i.test(name));
}

function main() {
  if (!fs.existsSync(bundleDir)) {
    console.warn("installer  src-tauri/target/release/bundle/ not found; nothing to copy.");
    return;
  }
  let copied = 0;
  for (const kind of fs.readdirSync(bundleDir)) {
    const dir = path.join(bundleDir, kind);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of installersIn(fs.readdirSync(dir))) {
      fs.copyFileSync(path.join(dir, name), path.join(root, name));
      console.log(`installer  ${name}`);
      copied += 1;
    }
  }
  if (!copied) console.warn("installer  no installer files found.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
