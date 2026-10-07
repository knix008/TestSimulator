// Copies the installer from the latest `tauri build` into the project root, replacing
// any installer an earlier build left there, so the root always holds exactly one.
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "src-tauri", "target", "release", "bundle");
const { productName } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));

// Preferred installer per OS when one build produces several (Linux makes deb, rpm and AppImage).
const preference = {
  win32: [".exe", ".msi"],
  darwin: [".dmg"],
  linux: [".AppImage", ".deb", ".rpm"],
}[process.platform] ?? [".exe", ".msi", ".dmg", ".AppImage", ".deb", ".rpm"];
const installerExtensions = [".exe", ".msi", ".dmg", ".AppImage", ".deb", ".rpm"];
const extensionOf = (name) => installerExtensions.find((ext) => name.endsWith(ext));

const found = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // A macOS .app bundle is a folder; only the .dmg is an installer.
      if (!entry.name.endsWith(".app")) walk(path);
    } else if (entry.name.startsWith(productName) && preference.includes(extensionOf(entry.name))) {
      found.push({ path, rank: preference.indexOf(extensionOf(entry.name)), time: statSync(path).mtimeMs });
    }
  }
};
if (existsSync(bundle)) walk(bundle);
if (found.length === 0) {
  console.error(`No ${productName} installer found under ${bundle}. Run a desktop build first.`);
  process.exit(1);
}

// Newest build first, then the preferred format among files from that build.
const newest = Math.max(...found.map((file) => file.time));
const installer = found
  .filter((file) => newest - file.time < 10 * 60 * 1000)
  .sort((a, b) => a.rank - b.rank || b.time - a.time)[0];

for (const name of readdirSync(root)) {
  if (name.startsWith(productName) && extensionOf(name)) rmSync(join(root, name));
}
const target = join(root, basename(installer.path));
copyFileSync(installer.path, target);
console.log(`Copied installer to ${target}`);
