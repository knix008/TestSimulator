// Copies the generated app icon into the set Tauri's bundler expects.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'build', 'icons');
const outDir = path.join(root, 'src-tauri', 'icons');

const gen = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-icons.mjs'), '--if-needed'], { stdio: 'inherit' });
if (gen.status) process.exit(gen.status || 1);

const copies = [
  [path.join(srcDir, 'png', '32x32.png'), path.join(outDir, '32x32.png')],
  [path.join(srcDir, 'png', '128x128.png'), path.join(outDir, '128x128.png')],
  [path.join(srcDir, 'png', '256x256.png'), path.join(outDir, '128x128@2x.png')],
  [path.join(srcDir, 'icon.ico'), path.join(outDir, 'icon.ico')],
  [path.join(srcDir, 'icon.icns'), path.join(outDir, 'icon.icns')],
  [path.join(srcDir, 'icon.png'), path.join(outDir, 'icon.png')],
];
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(root, 'src-tauri', 'sidecar'), { recursive: true });
for (const [from, to] of copies) {
  if (!fs.existsSync(from)) {
    console.error(`[tauri-icons] Missing ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(from, to);
}
console.log('[tauri-icons] Synced src-tauri/icons');
