// Copies the newest installer from src-tauri/target/release/bundle to the project root,
// replacing any installer an earlier build left there, so the root holds exactly one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.env.CARGO_TARGET_DIR ? path.resolve(root, "src-tauri", process.env.CARGO_TARGET_DIR) : path.join(root, "src-tauri", "target");
const bundle = path.resolve(process.argv[2] || path.join(target, "release", "bundle"));
const EXTENSIONS = [".exe", ".msi", ".dmg", ".AppImage", ".deb"];
const extensionOf = (name) => EXTENSIONS.find((ext) => name.endsWith(ext));

const found = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.endsWith(".app")) walk(full);
    } else if (entry.name.startsWith("MyWeather") && extensionOf(entry.name)) {
      found.push({ full, time: fs.statSync(full).mtimeMs });
    }
  }
};
if (fs.existsSync(bundle)) walk(bundle);
if (!found.length) throw new Error(`No MyWeather installer under ${bundle}. Run a desktop build first.`);
const newest = found.sort((a, b) => b.time - a.time)[0];

for (const name of fs.readdirSync(root)) {
  if (name.startsWith("MyWeather") && extensionOf(name)) fs.rmSync(path.join(root, name));
}
const copy = path.join(root, path.basename(newest.full));
fs.copyFileSync(newest.full, copy);
console.log(copy);
