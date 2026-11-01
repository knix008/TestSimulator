// Copies the installers `tauri build` produced to the project root, so they
// sit next to README.md instead of deep inside src-tauri/target/.
//
// Usage: node scripts/copy-installer.mjs
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = join(rootDir, 'src-tauri', 'target', 'release', 'bundle');
const installerExt = /\.(exe|msi|dmg|AppImage|deb|rpm)$/i;

if (!existsSync(bundleDir)) {
  console.warn('[copy-installer] src-tauri/target/release/bundle/ not found — nothing to copy.');
  process.exit(0);
}

let copied = 0;
for (const kind of readdirSync(bundleDir)) {
  const dir = join(bundleDir, kind);
  if (!statSync(dir).isDirectory()) continue;
  for (const name of readdirSync(dir)) {
    const src = join(dir, name);
    if (!installerExt.test(name) || !statSync(src).isFile()) continue;
    copyFileSync(src, join(rootDir, name));
    console.log(`[copy-installer] Copied: ${name}`);
    copied++;
  }
}

console.log(copied
  ? `[copy-installer] Copied ${copied} installer file(s) to the project root.`
  : '[copy-installer] No installer files found to copy.');
