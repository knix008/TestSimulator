// Copies the installers `tauri build` made (src-tauri/target/release/bundle/)
// to the project root.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const installer = /\.(exe|msi|dmg|AppImage|deb|rpm)$/i;

if (!fs.existsSync(bundleDir)) {
  console.warn('[copy-installer] src-tauri/target/release/bundle/ not found — nothing to copy.');
  process.exit(0);
}
let copied = 0;
for (const kind of fs.readdirSync(bundleDir)) {
  const dir = path.join(bundleDir, kind);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const name of fs.readdirSync(dir)) {
    const src = path.join(dir, name);
    if (!installer.test(name) || !fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(root, name));
    console.log(`[copy-installer] Copied: ${name}`);
    copied++;
  }
}
console.log(copied ? `[copy-installer] Copied ${copied} installer file(s) to the project root.` : '[copy-installer] No installer files found.');
