// Copies the installers `tauri build` produced to the project root, so they
// sit next to README.md instead of deep inside src-tauri/target/.
//
// Only this build's installers (productName_version_…) are copied. Installers
// left behind by older builds — another version, or the program's old name —
// are deleted from the bundle folder and from the project root, so exactly one
// installer per format remains.
//
// Usage: node scripts/copy-installer.mjs
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = join(rootDir, 'src-tauri', 'target', 'release', 'bundle');
const installerExt = /\.(exe|msi|dmg|AppImage|deb|rpm)$/i;
// What a Tauri bundle is called: Name_1.2.3_x64-setup.exe, Name_1.2.3_x64_en-US.msi,
// Name_1.2.3_aarch64.dmg, Name_1.2.3_amd64.AppImage, name_1.2.3_amd64.deb …
const tauriInstaller = /^[^_]+_\d+\.\d+\.\d+[^_]*_.+\.(exe|msi|dmg|AppImage|deb|rpm)$/i;

const conf = JSON.parse(readFileSync(join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const productName = conf.productName;
const version = /^\d/.test(String(conf.version || '')) ? conf.version : pkg.version;
// The .deb is named after the lowercase main binary; the rest after productName.
const current = (name) => name.toLowerCase().startsWith(`${productName}_${version}_`.toLowerCase());

if (!existsSync(bundleDir)) {
  console.warn('[copy-installer] src-tauri/target/release/bundle/ not found — nothing to copy.');
  process.exit(0);
}

let copied = 0;
const keep = new Set();
for (const kind of readdirSync(bundleDir)) {
  const dir = join(bundleDir, kind);
  if (!statSync(dir).isDirectory()) continue;
  for (const name of readdirSync(dir)) {
    const src = join(dir, name);
    if (!installerExt.test(name) || !statSync(src).isFile()) continue;
    if (!current(name)) {
      rmSync(src, { force: true });
      console.log(`[copy-installer] Removed stale build output: ${kind}/${name}`);
      continue;
    }
    copyFileSync(src, join(rootDir, name));
    keep.add(name);
    console.log(`[copy-installer] Copied: ${name}`);
    copied++;
  }
}

// Older installers copied to the root by earlier builds.
if (copied) {
  for (const name of readdirSync(rootDir)) {
    if (keep.has(name) || !tauriInstaller.test(name)) continue;
    if (!statSync(join(rootDir, name)).isFile()) continue;
    rmSync(join(rootDir, name), { force: true });
    console.log(`[copy-installer] Removed old installer: ${name}`);
  }
}

console.log(copied
  ? `[copy-installer] Copied ${copied} installer file(s) to the project root.`
  : '[copy-installer] No installer files found to copy.');
