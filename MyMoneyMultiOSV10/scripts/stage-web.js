// Copies the pages Tauri serves into web-dist/. The renderer has no bundler, so this is the
// whole build: src/ as it is, plus the one asset the pages load (assets/icon.png).
// Layout is kept (web-dist/src, web-dist/assets) so "../assets/icon.png" still resolves.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "web-dist");

export const STAGED = [
  ["src", "src"],
  ["assets/icon.png", "assets/icon.png"],
];

export function stage(target = out) {
  fs.rmSync(target, { recursive: true, force: true });
  for (const [from, to] of STAGED) {
    fs.cpSync(path.join(root, from), path.join(target, to), { recursive: true });
  }
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Staged ${path.relative(root, stage()) || "."}`);
}
